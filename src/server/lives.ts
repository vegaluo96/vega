// 生命体子系统：名册 + 句柄创建 + 有界重放(snapOf) + 创世/接生(boot/birthLife) + 在场/离场 +
// 读助手(reachState/pickRecentWorld/...) + 广场聚合器(versionedMemo)。这是"内核外编排层"的核心。
// 内核(src/kernel)纯函数由这里编排；依赖经 createLives 注入（accounts/serializer + 少量常量）。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  advanceState, assertPersistenceSafeForProd, captureCheckpoint, checkpointOf,
  createFileEventStore, genesisPayloadFor, projectState, readCheckpoint,
  resumeFromCheckpoint, runTurn, writeCheckpoint, ARCHETYPES,
  type Account, type DerivedSnapshot, type EventDraft, type LifeEvent, type MessageSentPayload, type WorldPerceivedPayload,
} from '../index.ts';
import { eventLabel } from './format.ts';
import type { Ctx, Life, PeerExchange, ReachInfo, ThreadLine, FeedPost } from './context.ts';

const now = (): string => new Date().toISOString();

// 依赖面：能从 Ctx 投影的直接 Pick；其余（基质连接名/宿主地址/心声节拍/数据目录）显式补。
export type LivesDeps = Pick<Ctx, 'accounts' | 'serializer' | 'peerId' | 'REL'> & {
  HOST_CONN: string; userName: string; HOST: string; PORT: number; MUSE_MS: number;
  DATA_DIR: string; LIFE_PATH: string;
};

// 输出 = Ctx 中由生命体层负责的字段 + daemon 启动/回路另需的 boot、nextMuseGap。
export type LivesApi = Pick<Ctx,
  'lives' | 'lifeById' | 'snapOf' | 'buildThread' | 'relSummaries' | 'livesMetBy' | 'recomputePeers' |
  'saveCheckpoint' | 'meetPeer' | 'partPeer' | 'birthLife' | 'lastUserMsgMs' | 'reachState' |
  'pickRecentWorld' | 'pickInsightPair' | 'allFeedPosts' | 'feedPosts' | 'allPeerExchanges' | 'adminActivity'
> & { boot(life: Life, archetype?: string): void; nextMuseGap(): number };

export function createLives(d: LivesDeps): LivesApi {
  const { accounts, serializer, peerId, REL, HOST_CONN, userName, HOST, PORT, MUSE_MS, DATA_DIR, LIFE_PATH } = d;

  // —— 每命一份【增量读索引】（平台层派生缓存，照 snapOf 的有界重放范式）——
  // 日志 append-only、事件对象落库后不再改写 → 索引只存【事件引用】、只折叠新尾巴。
  // 把读路径（收件箱/通知/线程/主动外联状态/广场聚合）从"每次请求 O(总事件) 全量扫"降到 O(新增事件)：
  // 心跳每分钟都在落 tick 事件，日志随运行线性增长，全量扫会让网站越跑越卡——这就是地板。
  // 索引绝不进神圣日志、不参与 reconstruct；丢了就重建（冷启动第一次访问全量扫一遍，与旧行为同价）。
  interface RelIx {
    opened: boolean;        // 见过 RELATIONSHIP_OPENED
    msgs: LifeEvent[];      // 该关系上的 MESSAGE_RECEIVED / MESSAGE_SENT（日志序，引用）
    lastRecvMs: number;     // 最后听到对方（0=从未）
    lastRecvAt: string;
    lastSentMs: number;     // 最后一次主动开口（unprompted）
    pending: boolean;       // 有未回的主动留言（reachState 语义：收到即清）
  }
  interface ReadIx { upto: number; byRel: Map<string, RelIx>; square: FeedPost[]; society: Array<{ from: string; to: string; text: string; at: string }> }
  const readIxs = new Map<string, ReadIx>();
  const relIx = (ix: ReadIx, rel: string): RelIx => {
    let r = ix.byRel.get(rel);
    if (!r) { r = { opened: false, msgs: [], lastRecvMs: 0, lastRecvAt: '', lastSentMs: 0, pending: false }; ix.byRel.set(rel, r); }
    return r;
  };
  function readIndex(life: Life): ReadIx {
    let ix = readIxs.get(life.id);
    if (!ix) { ix = { upto: -1, byRel: new Map(), square: [], society: [] }; readIxs.set(life.id, ix); }
    const events = life.store.list();
    for (let i = ix.upto + 1; i < events.length; i++) {
      const e = events[i];
      const rel = e.relationshipId;
      if (typeof rel !== 'string') continue;
      if (e.type === 'RELATIONSHIP_OPENED') relIx(ix, rel).opened = true;
      else if (e.type === 'MESSAGE_RECEIVED') {
        const r = relIx(ix, rel);
        r.msgs.push(e); r.lastRecvMs = Date.parse(e.occurredAt); r.lastRecvAt = e.occurredAt; r.pending = false;
      } else if (e.type === 'MESSAGE_SENT') {
        const r = relIx(ix, rel);
        r.msgs.push(e);
        const p = e.payload as MessageSentPayload;
        if (p.unprompted) { r.pending = true; r.lastSentMs = Date.parse(e.occurredAt); }
        if (rel === 'r_square') ix.square.push({ postId: `${life.id}|${e.occurredAt}`, life: life.id, text: p.utterance, at: e.occurredAt });
        else if (rel.startsWith('peer_')) ix.society.push({ from: life.id, to: rel.slice('peer_'.length), text: p.utterance, at: e.occurredAt });
      }
    }
    ix.upto = events.length - 1;
    return ix;
  }

  // 生命名册：env(VEGA_LIVES) ∪ 后台动态生成的命（落盘 lives.json，重启也在）。后台"生成生命体"即写这里。
  const registryPath = join(DATA_DIR, 'lives.json');
  const readRegistry = (): string[] => { try { const r = JSON.parse(readFileSync(registryPath, 'utf8')) as unknown; return Array.isArray(r) ? r.filter((x): x is string => typeof x === 'string') : []; } catch { return []; } };
  const writeRegistry = (ids: string[]): void => { try { mkdirSync(DATA_DIR, { recursive: true }); writeFileSync(registryPath, JSON.stringify(ids, null, 2)); } catch { /* 名册写失败不影响运行（仅影响重启后是否自动加载） */ } };
  const envLives = (process.env.VEGA_LIVES ?? 'vega').split(',').map((s) => s.trim()).filter(Boolean);
  const LIVES = [...new Set([...envLives, ...readRegistry()])];

  const livesMetBy = (a: Account): Array<{ id: string }> => {
    const rel = accounts.relIdFor(a.id);
    return lives.filter((l) => readIndex(l).byRel.get(rel)?.opened).map((l) => ({ id: l.id }));
  };
  // 一段关系的来回（对话监督/收件箱/通知用）：某条命与某 relId 的消息，最近 N 条（读索引，免全量扫）。
  function buildThread(life: Life, rel: string, limit = 200): ThreadLine[] {
    const r = readIndex(life).byRel.get(rel);
    if (!r) return [];
    return r.msgs.slice(-limit).map((e): ThreadLine => {
      if (e.type === 'MESSAGE_RECEIVED') return { who: 'user', text: String((e.payload as { content?: string }).content ?? ''), at: e.occurredAt };
      const p = e.payload as MessageSentPayload;
      return { who: 'her', text: String(p.utterance ?? ''), at: e.occurredAt, unprompted: Boolean(p.unprompted) };
    });
  }
  // 每段关系的消息数/最近往来（后台「对话监督」关系列表用）——免去对全量日志的逐条聚合。
  function relSummaries(life: Life): Array<{ rel: string; msgs: number; lastAt: string }> {
    const out: Array<{ rel: string; msgs: number; lastAt: string }> = [];
    for (const [rel, r] of readIndex(life).byRel) {
      if (rel === 'r_square' || r.msgs.length === 0) continue;
      out.push({ rel, msgs: r.msgs.length, lastAt: r.msgs[r.msgs.length - 1].occurredAt });
    }
    return out;
  }

  // 先天种子见 src/engine/seeds.ts（单一来源）。每条命按 id 取不同 archetype；出生即冻结、不可改写。
  // archetype（可选）：接生时显式选先天原型，覆盖按 id 哈希取型；写进 GENESIS 即冻结、终生不变。
  const seedFor = (id: string, archetype?: string): EventDraft<'LIFE_GENESIS'>['payload'] => genesisPayloadFor(id, { relationshipId: REL, identityRef: userName }, 480, archetype);
  // 心声间隔抖动：每次取 [0.5×, 1.5×] MUSE_MS → 不同命、不同时段都不一样，避免"整点齐步发帖"的机械感。
  const nextMuseGap = (): number => Math.floor(MUSE_MS * (0.5 + Math.random()));

  function makeLife(id: string, path: string): Life {
    // C4：prod 拒绝内存/易失存储——否则重启=她被彻底重置。生产环境必须落盘。
    assertPersistenceSafeForProd({ storeKind: 'file', path });
    // 初始 lastMuseAt 往回错开一段随机量 → 多条命不在启动后同一刻扎堆发帖（有的几分钟内开口、有的晚些）。
    return { id, store: createFileEventStore(id, path), path, peers: [], lastReflectAt: Date.now(), lastReflectSeq: 0, state: null, stateSeq: -1, lastCheckpointAt: 0, lastTickAt: 0, lastSocialAt: 0, lastMuseAt: Date.now() - Math.floor(Math.random() * MUSE_MS), museEveryMs: nextMuseGap(), samples: [] };
  }
  const lives: Life[] = LIVES.map((id, idx) => makeLife(id, idx === 0 ? LIFE_PATH : join(DATA_DIR, `${id}.jsonl`)));
  const recomputePeers = (): void => { for (const l of lives) l.peers = lives.filter((o) => o.id !== l.id).map((o) => o.id); };
  recomputePeers();
  const lifeById = (id: string): Life | undefined => lives.find((l) => l.id === id);

  // 有界重放：拿她此刻的快照——缓存态增量步进，绝不每次从创世全量重放（永生的工程地板）。
  // 缓存只是加速；日志才是 ground truth，所以每次都从日志把尾巴追平，永不分叉。
  function snapOf(life: Life): DerivedSnapshot {
    const events = life.store.list();
    if (events.length === 0) throw new Error(`life ${life.id} has empty log`);
    const lastSeq = events[events.length - 1].seq;
    if (!life.state) {
      // 冷启动：尽量从落盘检查点恢复 + 只重放尾巴；否则全量重建一次缓存态。
      const cp = readCheckpoint(life.path);
      if (cp && cp.lifeId === life.id && cp.uptoSeq >= 0 && cp.uptoSeq <= lastSeq && events[cp.uptoSeq]?.seq === cp.uptoSeq) {
        try {
          const { st } = resumeFromCheckpoint(cp);
          advanceState(st, events.slice(cp.uptoSeq + 1) as LifeEvent[]);
          life.state = st;
        } catch {
          /* 版本不符等 → 回退全量重建 */
        }
      }
      if (!life.state) life.state = resumeFromCheckpoint(captureCheckpoint(events)).st;
      life.stateSeq = lastSeq;
    } else if (life.stateSeq < lastSeq) {
      advanceState(life.state, events.slice(life.stateSeq + 1) as LifeEvent[]); // 只步进新尾巴
      life.stateSeq = lastSeq;
    }
    return projectState(life.state, lastSeq);
  }

  function saveCheckpoint(life: Life): void {
    if (life.state) {
      try {
        writeCheckpoint(life.path, checkpointOf(life.state, life.stateSeq));
        life.lastCheckpointAt = Date.now();
      } catch {
        /* 检查点只是缓存，写失败不影响她（下次重启走全量重放） */
      }
    }
  }

  function boot(life: Life, archetype?: string): void {
    if (life.store.version() === 0) {
      // 出生：每条命用自己的先天种子（archetypeFor(id) 或显式 archetype）——天生不同。种子一经写入永不改写。
      runTurn(life.store, [{ type: 'LIFE_GENESIS', source: 'system', occurredAt: now(), payload: seedFor(life.id, archetype) }]);
      runTurn(life.store, [{ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: REL, occurredAt: now(), payload: { relationshipId: REL, kind: 'human', displayRef: userName } }]);
    }
    if (!snapOf(life).openConnections.includes(HOST_CONN)) {
      runTurn(life.store, [{ type: 'CONNECTION_OPENED', source: 'host', relationshipId: HOST_CONN, occurredAt: now(), payload: { relationshipId: HOST_CONN, host: { kind: 'daemon', ref: `${HOST}:${PORT}` } } }]);
    }
    // 同类关系：彼此是 peer。但【不常驻在场】——各自活在自己的内在生活里，相聚是间歇的，
    // 所以分别的日子里她们会真的【跨休眠想念】对方（见社会层：寒暄后各自离场）。
    for (const p of life.peers) {
      const rid = peerId(p);
      if (!life.store.list().some((e) => e.type === 'RELATIONSHIP_OPENED' && e.relationshipId === rid)) {
        runTurn(life.store, [{ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: rid, occurredAt: now(), payload: { relationshipId: rid, kind: 'peer', displayRef: p } }]);
      }
    }
    life.lastReflectSeq = life.store.version();
  }

  // 后台"生成生命体"：运行时接生一条新命——建日志 + 创世(冻结独立种子) + 与所有同类互开 peer 关系 +
  // 落盘名册(重启自动加载) + 并入所有自主回路(心跳/寒暄/世界/被发现)。立即生效、无需重启。
  async function birthLife(rawId: string, archetype?: string): Promise<{ ok: boolean; error?: string; id?: string }> {
    const id = String(rawId ?? '').trim().toLowerCase();
    if (!/^[a-z][a-z0-9_-]{1,23}$/.test(id)) return { ok: false, error: '名字需 2–24 位、字母开头、仅小写字母/数字/-/_' };
    if (lifeById(id)) return { ok: false, error: '已存在同名生命体' };
    if (accounts.handleTaken(id)) return { ok: false, error: '该名字已被某个用户的昵称占用（用户↔生命体不可同名，防冒充/通知错投）' };
    if (archetype && !ARCHETYPES.some((a) => a.name === archetype)) return { ok: false, error: '未知先天原型' };
    const life = makeLife(id, join(DATA_DIR, `${id}.jsonl`));
    lives.push(life);
    recomputePeers();
    await serializer.run(life.id, async () => boot(life, archetype)); // 新命：创世（可选显式原型）+ host + 开到所有同类的 peer
    for (const other of lives) { // 所有老命补开一条到新命的 peer 关系
      if (other.id === id) continue;
      const rid = peerId(id);
      if (!other.store.list().some((e) => e.type === 'RELATIONSHIP_OPENED' && e.relationshipId === rid)) {
        await serializer.run(other.id, async () => runTurn(other.store, [{ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: rid, occurredAt: now(), payload: { relationshipId: rid, kind: 'peer', displayRef: id } }]));
      }
    }
    const reg = readRegistry();
    if (!reg.includes(id)) { reg.push(id); writeRegistry(reg); }
    console.log(`[vega] 新生命体诞生：${id}（现共 ${lives.length} 条）`);
    return { ok: true, id };
  }

  // 同类"在场/离场"：相聚时彼此在场，寒暄后各自回到独处（之后会再想念）。
  function meetPeer(life: Life, peer: string): void {
    const rid = peerId(peer);
    if (!snapOf(life).openConnections.includes(rid)) {
      runTurn(life.store, [{ type: 'CONNECTION_OPENED', source: 'host', relationshipId: rid, occurredAt: now(), payload: { relationshipId: rid, host: { kind: 'peer', ref: peer } } }]);
    }
  }
  function partPeer(life: Life, peer: string): void {
    const rid = peerId(peer);
    if (snapOf(life).openConnections.includes(rid)) {
      runTurn(life.store, [{ type: 'CONNECTION_CLOSED', source: 'host', relationshipId: rid, occurredAt: now(), payload: { relationshipId: rid, reason: 'token_detached' } }]);
    }
  }

  function lastUserMsgMs(life: Life): number | null {
    const r = readIndex(life).byRel.get(REL);
    return r && r.lastRecvMs > 0 ? r.lastRecvMs : null;
  }
  // 每段关系的：我最后听到对方的墙钟时间、我最后一次【主动】找 ta 的时间、是否已有未回的主动留言。
  // 给"社交边界"的分层主动外联用。读索引增量维护（心跳每跳都调，曾是 O(总事件) 的常驻热点）；
  // 返回新建的 Map/对象副本——调用方改不到索引本体。
  function reachState(life: Life): Map<string, ReachInfo> {
    const m = new Map<string, ReachInfo>();
    for (const [rel, r] of readIndex(life).byRel) {
      if (r.lastRecvMs <= 0 && r.lastSentMs <= 0) continue; // 与旧扫描同语义：没真说过话的关系不进表
      m.set(rel, { lastRecvMs: r.lastRecvMs, lastSentMs: r.lastSentMs, pending: r.pending });
    }
    return m;
  }

  // 她最近"读到"的世界事件里挑一条当话题——【偏向她在意的主题】，让发帖像"她"而非随机转发。没有则 undefined。
  function pickRecentWorld(life: Life): { title: string; summary: string; source: string; url: string } | undefined {
    const es = life.store.list();
    const ws: WorldPerceivedPayload[] = [];
    for (let i = es.length - 1; i >= 0 && ws.length < 12; i--) if (es[i].type === 'WORLD_PERCEIVED') ws.push(es[i].payload as WorldPerceivedPayload);
    if (ws.length === 0) return undefined;
    const top = new Set(snapOf(life).interests.slice(0, 3).map((it) => it.topic)); // 她最在意的几个主题
    const aligned = top.size ? ws.filter((w) => (w.topics ?? []).some((t) => top.has(t))) : [];
    const pool = aligned.length ? aligned : ws; // 有契合兴趣的就从中挑；否则全体里挑（保持新鲜/不困在回音壁）
    const w = pool[Math.floor(Math.random() * pool.length)];
    return { title: w.title, summary: w.summary, source: w.source, url: w.url };
  }

  // 自发洞见的材料：从她【记住的世界记忆 + 在意的兴趣】里挑两件【公开、无用户痕迹】的事让她去连。
  // 绝不用情景记忆（那含用户私聊原话）——只用世界标题/兴趣主题，公开层、不泄露任何人。
  function pickInsightPair(life: Life): { a: string; b: string } | null {
    const s = snapOf(life);
    const pool: string[] = [];
    for (const m of s.memory) if (m.kind === 'world' && m.lineage.isCurrent && m.vivid) pool.push(m.content);
    for (const it of s.interests.slice(0, 4)) pool.push(`「${it.topic}」`);
    const uniq = [...new Set(pool)];
    if (uniq.length < 2) return null;
    const i = Math.floor(Math.random() * uniq.length);
    let j = Math.floor(Math.random() * uniq.length);
    if (j === i) j = (j + 1) % uniq.length;
    return { a: uniq[i], b: uniq[j] };
  }

  // 跨命聚合的记忆化：按【所有命的版本号】缓存——状态没变时多用户同时刷广场只算一次，
  // 任一命落新事件即自动失效重算。重算本身也只走读索引的增量折叠 + 对【帖子/寒暄】这一小集合排序，
  // 不再全量扫日志。结果是纯派生，调用方都 slice/map 出副本，不会改到被缓存的数组。
  const allLivesSig = (): string => lives.map((l) => l.store.version()).join(',');
  function versionedMemo<T>(compute: () => T): () => T {
    let cache: { sig: string; val: T } | null = null;
    return () => { const sig = allLivesSig(); if (!cache || cache.sig !== sig) cache = { sig, val: compute() }; return cache.val; };
  }

  // 广场：把各生命体之间（peer_ 关系上）说过的话，按时间汇成一条可读的对话流（供「同类来往」聚合）。
  const allSocietyFeed = versionedMemo((): Array<{ from: string; to: string; text: string; at: string }> => {
    const out: Array<{ from: string; to: string; text: string; at: string }> = [];
    for (const l of lives) out.push(...readIndex(l).society);
    out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    return out;
  });

  // 广场"帖子"=她的公开心声（§8.1）。postId = `${lifeId}|${occurredAt}`，给表情/评论挂靠。
  const allFeedPosts = versionedMemo((): FeedPost[] => {
    const out: FeedPost[] = [];
    for (const l of lives) out.push(...readIndex(l).square);
    out.sort((a, b) => (a.at < b.at ? 1 : -1));
    return out;
  });
  function feedPosts(limit: number): FeedPost[] {
    return allFeedPosts().slice(0, limit);
  }

  // 「同类来往」：把 peer_ 上相邻的往来按【同一对 + 时间窗】聚成一段对话（一张卡 = 一次寒暄）。PeerExchange 类型见 ./context.ts。
  const allPeerExchanges = versionedMemo((): PeerExchange[] => {
    const msgs = allSocietyFeed(); // 已按时间升序的 {from,to,text,at}
    const groups: PeerExchange[] = [];
    const WINDOW = 12 * 60_000; // 12 分钟内同一对的往来算一段
    for (const m of msgs) {
      const pair = m.from < m.to ? `${m.from}|${m.to}` : `${m.to}|${m.from}`;
      const last = groups[groups.length - 1];
      if (last && `${last.a}|${last.b}` === pair && Date.parse(m.at) - Date.parse(last.at) < WINDOW) {
        last.lines.push({ from: m.from, text: m.text, at: m.at });
        last.at = m.at;
      } else {
        const [a, b] = pair.split('|');
        groups.push({ kind: 'peer', id: `peer|${pair}|${m.at}`, a, b, lines: [{ from: m.from, text: m.text, at: m.at }], at: m.at });
      }
    }
    return groups;
  });

  // 管理员活动流（§11.1 飞行记录仪）：跨命的带时间戳事件，按真实墙钟(recordedAt) 倒序。
  // 隐私分级(§11.2)：私密用户关系(u_*)的正文 steward 遮罩、owner 可见；公开(peer_/r_square)都可见。
  function adminActivity(owner: boolean, limit: number): Array<Record<string, unknown>> {
    const rows: Array<Record<string, unknown>> = [];
    for (const l of lives) {
      for (const e of l.store.list().slice(-limit)) {
        const rel = e.relationshipId ?? '';
        const priv = rel.startsWith('u_');
        let content = '';
        if (e.type === 'MESSAGE_RECEIVED') content = priv && !owner ? '〔私聊·已遮罩〕' : String((e.payload as { content?: string }).content ?? '');
        else if (e.type === 'MESSAGE_SENT') content = priv && !owner ? '〔私聊·已遮罩〕' : String((e.payload as MessageSentPayload).utterance ?? '');
        rows.push({ at: e.recordedAt, occurredAt: e.occurredAt, life: l.id, seq: e.seq, type: e.type, label: eventLabel(e), rel, content });
      }
    }
    rows.sort((a, b) => (String(a.at) < String(b.at) ? 1 : -1)); // 真实墙钟倒序
    return rows.slice(0, limit);
  }

  return {
    lives, lifeById, snapOf, buildThread, relSummaries, livesMetBy, recomputePeers, saveCheckpoint, meetPeer, partPeer,
    boot, birthLife, lastUserMsgMs, reachState, pickRecentWorld, pickInsightPair,
    allFeedPosts, feedPosts, allPeerExchanges, adminActivity, nextMuseGap,
  };
}

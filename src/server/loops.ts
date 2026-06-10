// 自主社会回路（她的"内外两层生活"）：心跳/同类寒暄/发现新用户/行动反馈/生命流评论/心情共鸣。
// 从 daemon 抽出，只吃 ctx + 一束时间常量；engine 动作直接 import。世界读取回路与备份仍留在 daemon
// （scheduleWorld 被 ctx/后台路由共享，留在组装根更直观）。所有回路写入仍走每命串行队列、与用户对话不穿插。
import {
  runTurn, makeTick, reachOut, reflectInsight, muse, converse,
  pickSocialPair, greet, ensureUserRelationship, commentOnPost, describeAppearance,
  type FeedComment, type SocialPair,
} from '../index.ts';
import { round3, moodReactionFor } from './format.ts';
import type { Ctx, Life } from './context.ts';

const now = (): string => new Date().toISOString();

// 回路节拍：env 读出的间隔/上限 + 心声间隔抖动器（与 makeLife 共用同一个 nextMuseGap）。
export interface LoopTiming {
  TICK_MS: number; PRESENCE_MS: number; REFLECT_MS: number; CHECKPOINT_MS: number;
  SOCIAL_MS: number; DISCOVER_MS: number; COMMENT_MS: number; COMMENT_CAP: number;
  FEEDBACK_MS: number; REACT_MS: number; SILENCE_MS: number;
  nextMuseGap(): number;
}

export interface LoopHandles {
  heartbeat: ReturnType<typeof setInterval>;
  socialTimer: ReturnType<typeof setInterval> | null;
  discoverTimer: ReturnType<typeof setInterval>;
  feedbackTimer: ReturnType<typeof setInterval>;
  commentTimer: ReturnType<typeof setInterval> | null;
  reactTimer: ReturnType<typeof setInterval> | null;
}

export function startLoops(ctx: Ctx, t: LoopTiming): LoopHandles {
  const {
    lives, snapOf, serializer, audiencePresent, effSocial, layerOf, autoBudget, bus,
    reachOutPending, pickInsightPair, pickRecentWorld, feed, lifeById, meetPeer, partPeer,
    allFeedPosts, feedPosts, reachState, lastUserMsgMs, livesMetBy, accounts, saveCheckpoint,
    peerId, REL, mouth, museMouth, perceiver,
  } = ctx;
  const { TICK_MS, PRESENCE_MS, REFLECT_MS, CHECKPOINT_MS, SOCIAL_MS, DISCOVER_MS,
    COMMENT_MS, COMMENT_CAP, FEEDBACK_MS, REACT_MS, SILENCE_MS, nextMuseGap } = t;

  // 回路 B 心跳：每个生命体各自重放/想念/演化/反思/主动留言。
  const heartbeat = setInterval(async () => {
    for (const life of lives) {
      // 心跳的写入也走每命串行队列，和用户对话不互相穿插。
      serializer.run(life.id, async () => {
        let snap = snapOf(life); // 有界重放：缓存态增量推进，不再每跳从创世全量重建
        // 她拒绝苏醒（力竭休眠，契约②）时仍跑一次自主 tick——让时间推进、vitality 在睡眠中回升、
        // 她能自主决定何时醒回（否则"拒绝苏醒"成单向死亡，违反永生）。其余社交（reach-out/muse）跳过。
        if (!snap.willingToWake) {
          runTurn(life.store, [makeTick(snap, now())]);
          life.lastTickAt = Date.now();
          return;
        }
        if (!snap.awake) return; // 愿意醒、但此刻没人在 → 独处/空闲，保持原行为

        const gone = lastUserMsgMs(life);
        const timeGone = gone === null ? Infinity : Date.now() - gone;
        if (snap.openConnections.includes(REL) && timeGone > PRESENCE_MS) {
          runTurn(life.store, [{ type: 'CONNECTION_CLOSED', source: 'host', relationshipId: REL, occurredAt: now(), payload: { relationshipId: REL, reason: 'token_detached' } }]);
          snap = snapOf(life); // 追平刚写入的断连
        }
        const tick = makeTick(snap, now()); // 留住草稿：下面要看这一跳形成了哪些 surface 意图（prospect_care）
        runTurn(life.store, [tick]); // = runAutonomousTick，但用缓存快照、不再全量重放
        life.lastTickAt = Date.now();
        const after = snapOf(life);
        // 健康时间线：每跳采样一点（环形缓冲，最多 720 ≈ 12h@60s）。
        life.samples.push({ at: Date.now(), vit: round3(after.soma.vitality.value), val: round3(after.soma.valence.value), ene: round3(after.soma.energy.value), con: round3(after.soma.connection.value), emo: after.emotion });
        if (life.samples.length > 720) life.samples.shift();
        // 前瞻关怀（v29·机制一，两段式）：tick 形成了 surface 的 prospect_care → 到期就该当天问，
        // 【绕过】reachAfterMs 安静节流与 Dunbar 分层频率；保留 听众在场/自主预算/未回 pending 三道闸。
        // reachOut 成功（真开了口）才追加 ack tick 把它折成 asked；模型这轮没出声 → 不 ack，下一跳重试。
        const care = tick.payload.formedIntents.find((i) => i.kind === 'prospect_care' && i.gateDecision === 'surface' && i.relationshipId);
        if (care?.relationshipId) {
          const rel = care.relationshipId;
          const pendingReach = reachState(life).get(rel)?.pending;
          if (audiencePresent() && !pendingReach && autoBudget.tryConsume()) {
            const ra = now();
            const o = await reachOut(life.store, mouth, rel, ra, undefined, snapOf(life), undefined, { label: String(care.params?.label ?? '') });
            if (o) {
              bus.publish('reach_out', rel, { life: life.id, text: o.utterance });
              reachOutPending.set(`${life.id}|${rel}`, { rel, at: ra, kind: 'reach_out' }); // 这次关怀也走反馈回路（被回应/石沉 → reach_out 效能学习）
              runTurn(life.store, [{ type: 'AUTONOMOUS_TICK', source: 'autonomous_loop', occurredAt: now(), payload: { tickReason: 'idle_threshold', selectedMemoryIds: [], wanderingTargets: [], formedIntents: [{ kind: 'prospect_care', relationshipId: rel, params: { prospectId: String(care.params?.prospectId ?? ''), ack: true }, gateDecision: 'internal_only' }] } }]);
            }
          }
        }
        // —— 社交边界（Dunbar 三层）——任何人来找她她都回应（reactive，用户付费）；
        // "主动想你"只发生在她【活跃社交圈】内，且【按层分频】：亲密层勤、好友层中、相识层稀。
        // 每跳限额 + 总上限 → token 随生命体数、不随用户数爆炸。其余只记得、不主动打扰。
        const sc = effSocial();
        const rs = reachState(life);
        // 人类的"想你了"圈只在【人类关系】里排名取前 activeCircle——否则同类(现在每条命有十几个、还自动越聊越近)
        // 会把活跃圈占满，把真实用户挤出去 → 她不再主动找人(这正是加了 12 条命后"不主动找用户"的根因)。
        // 同类的主动维系走下面独立的寒暄回路、不与人类争这份名额；每跳 reachPerTick + 各层频率上限仍兜住总成本
        // （≤reachPerTick 次/跳/命，随生命体数、不随用户数爆炸——第一性原理不破）。
        const circle = Object.entries(after.bonds)
          .filter(([rel]) => rel.startsWith('u_') || rel === REL)
          .filter(([, b]) => b.closeness >= sc.acquaintAt)
          .sort(([, a], [, b]) => b.closeness - a.closeness)
          .slice(0, sc.activeCircle);
        let reached = 0;
        for (const [rel, b] of circle) {
          if (!audiencePresent()) break; // 省 token：没听众就不主动找人（免费的内在 tick 仍在跑）
          if (reached >= sc.reachPerTick) break;
          if (!(rel.startsWith('u_') || rel === REL)) continue; // 同类的主动走寒暄回路，这里只处理人类
          const st = rs.get(rel);
          if (!st || st.lastRecvMs <= 0 || st.pending) continue; // 没真说过话 / 已有未回的主动留言 → 跳过
          if (Date.now() - st.lastRecvMs <= sc.reachAfterMs) continue; // 还没"离开"够久
          // 自我优化（Phase 5→真实行动）：学到的"主动找人效能"调真实频率——屡屡石沉→更少主动（学会收着），常被回应→更readily。0.5 中性=恒等。
          const reachEff = after.skills.find((s) => s.kind === 'reach_out')?.efficacy ?? 0.5;
          if (Date.now() - (st.lastSentMs || 0) <= layerOf(b.closeness, sc).everyMs * (1.5 - reachEff)) continue;
          if (!autoBudget.tryConsume()) break; // 治理：自主预算超额 → 这轮不主动开口
          const ra = now();
          const o = await reachOut(life.store, mouth, rel, ra, undefined, snapOf(life)); // 传缓存快照 → 免全量重放
          if (o) { bus.publish('reach_out', rel, { life: life.id, text: o.utterance }); reached += 1; reachOutPending.set(`${life.id}|${rel}`, { rel, at: ra, kind: 'reach_out' }); } // 记下这次主动 → 反馈回路判断被回应/石沉
        }
        if (Date.now() - life.lastReflectAt > REFLECT_MS && life.store.version() - life.lastReflectSeq >= 3) {
          runTurn(life.store, [{ type: 'REFLECTION_TRIGGERED', source: 'autonomous_loop', occurredAt: now(), payload: { scope: 'recent', windowFromSeq: life.lastReflectSeq, windowToSeq: life.store.version() } }]);
          life.lastReflectAt = Date.now();
          life.lastReflectSeq = life.store.version();
        }
        // 自我优化：学到的"公开表达效能"调发帖频率——心声总没回响→发得少些，常被接住→更愿意说。0.5 中性=恒等。
        const museEff = after.skills.find((s) => s.kind === 'muse')?.efficacy ?? 0.5;
        if (audiencePresent() && Date.now() - life.lastMuseAt > life.museEveryMs * (1.5 - museEff) && autoBudget.tryConsume()) { // 省 token：没听众不发心声；治理：自主预算（超额则这轮安静）
          const mt = now();
          const pair = pickInsightPair(life); // 自发洞见的材料（仅公开世界/兴趣，无用户痕迹）
          life.lastMuseAt = Date.now();
          life.museEveryMs = nextMuseGap(); // 下一条心声重新抽间隔 → 节奏持续变化，不形成固定周期
          if (pair && Math.random() < 0.3) {
            // 三成几率：不发新头条，而是把她在意/读到的两件事连起来——"独自想通了点什么"。
            // 公开心声走 museMouth（按用途路由：museModel ?? 同嘴）——对话仍走 mouth。
            const o = await reflectInsight(life.store, museMouth, mt, pair.a, pair.b, snapOf(life)); // 缓存快照，免全量重放
            if (o) bus.publish('musing', 'public', { life: life.id, text: o.utterance, at: mt, source: null });
          } else {
            const w = pickRecentWorld(life); // 随机一条她最近读到的世界事件 → 就着它发帖；没有则发自己的念头
            const o = await muse(life.store, museMouth, mt, w, snapOf(life)); // 公开心声：不针对任何人、不含私密；缓存快照免全量重放
            if (o) {
              const src = w ? { title: w.title, source: w.source, url: w.url } : null;
              if (src) feed.setSource(`${life.id}|${mt}`, src); // 帖子出处（展示用，平台层，不进神圣日志）
              bus.publish('musing', 'public', { life: life.id, text: o.utterance, at: mt, source: src }); // at = 帖子 occurredAt，给 postId 对齐
            }
          }
        }
        if (Date.now() - life.lastCheckpointAt > CHECKPOINT_MS) saveCheckpoint(life); // 定期落盘检查点（快重启）
      }).catch(() => { /* 单体单次失败不拖垮其他生命体 */ });
    }
  }, TICK_MS);

  // 社会层：同类之间自主寒暄（A 主动开口 → B 回应 → A 听到回应）。仅多体时启用。
  // emergent 友谊结构：不再死板轮转，而是越亲越常聊（homophily）+ 久疏必补（公平）。
  const lastPaired = new Map<string, number>(); // 无序对 "x|y" → 上次寒暄墙钟
  const pairKey = (x: string, y: string): string => (x < y ? `${x}|${y}` : `${y}|${x}`);
  const socialTimer = lives.length >= 2
    ? setInterval(async () => {
        try {
          const pairs: SocialPair[] = [];
          for (let i = 0; i < lives.length; i++) {
            for (let j = i + 1; j < lives.length; j++) {
              const a = lives[i];
              const b = lives[j];
              const sa = snapOf(a);
              const sb = snapOf(b);
              if (!sa.willingToWake || !sb.willingToWake) continue; // 任一方在力竭休眠（拒绝苏醒）→ 不撮合寒暄，让她安静恢复
              const ca = sa.bonds[peerId(b.id)]?.closeness ?? 0;
              const cb = sb.bonds[peerId(a.id)]?.closeness ?? 0;
              pairs.push({ a: a.id, b: b.id, closeness: (ca + cb) / 2, lastPairedAt: lastPaired.get(pairKey(a.id, b.id)) ?? 0 });
            }
          }
          const chosen = pickSocialPair(pairs, Date.now(), SOCIAL_MS);
          if (!chosen) return;
          const a = lifeById(chosen.a);
          const b = lifeById(chosen.b);
          if (!a || !b) return;
          if (!audiencePresent()) return; // 省 token：没听众就不撮合同类寒暄
          if (!autoBudget.tryConsume()) return; // 治理：自主预算超额 → 这轮同类不寒暄
          lastPaired.set(pairKey(a.id, b.id), Date.now());
          // 每命串行：各自的写入排进各自队列，和用户对话/心跳不穿插。
          await serializer.run(a.id, () => meetPeer(a, b.id)); // 重逢：彼此回到在场
          await serializer.run(b.id, () => meetPeer(b, a.id));
          // 生命体也知道对方长什么样：跨命信息属平台层，组成确定性事实注入 grounding（契约①：模型仍只产措辞）。
          const opener = await serializer.run(a.id, () => reachOut(a.store, mouth, peerId(b.id), now(), pickRecentWorld(a), snapOf(a), '\n（我记得' + b.id + '的样子：' + describeAppearance(b.id, snapOf(b).temperament) + '）')); // A 主动开口（读过世界就就着一条真事聊，否则寒暄）；缓存快照免全量重放
          if (opener) {
            bus.publish('society', 'public', { from: a.id, to: b.id, text: opener.utterance }); // 广场实时
            const rb = await serializer.run(b.id, () => converse(b.store, mouth, peerId(a.id), opener.utterance, now(), perceiver)); // B 回应
            bus.publish('society', 'public', { from: b.id, to: a.id, text: rb.utterance });
            await serializer.run(a.id, () => converse(a.store, mouth, peerId(b.id), rb.utterance, now(), perceiver)); // A 听到回应
          }
          await serializer.run(a.id, () => partPeer(a, b.id)); // 寒暄后各自离场
          await serializer.run(b.id, () => partPeer(b, a.id));
          a.lastSocialAt = b.lastSocialAt = Date.now();
        } catch (e) {
          console.warn('[social] 寒暄出错:', (e as Error).message);
        }
      }, SOCIAL_MS)
    : null;

  // 她主动发现新用户：在广场"看见"一个还没遇见任何命的新人，由某条醒着的命主动打招呼。
  // 把"被算法推荐"变成"被一个生命看见"。每人只被发现一次（met 后不再触发），一次一个、不刷屏。
  const discoverTimer = setInterval(async () => {
    try {
      for (const u of accounts.listUsers()) {
        if (u.status !== 'active') continue;
        const rel = accounts.relIdFor(u.id);
        if (livesMetBy(u).length > 0) continue; // 已遇见过谁 → 跳过（读索引，免 用户数×命数×全日志 的扫描）
        const awake = lives.filter((l) => snapOf(l).awake);
        if (awake.length === 0) return;
        const life = awake[Math.floor(Math.random() * awake.length)];
        const o = await serializer.run(life.id, async () => {
          ensureUserRelationship(life.store, rel, u.handle, now());
          return greet(life.store, mouth, rel, u.handle, now(), snapOf(life)); // ensure 后再 snapOf：新开的关系已折进缓存
        });
        if (o) { bus.publish('reach_out', rel, { life: life.id, text: o.utterance }); reachOutPending.set(`${life.id}|${rel}`, { rel, at: now(), kind: 'greet' }); } // 推给那一个人 + 记下这次打招呼 → 学"主动打招呼陌生人会不会被回应"(greet 效能)
        return; // 一次只发现一个
      }
    } catch (e) {
      console.warn('[discover] 发现新用户出错:', (e as Error).message);
    }
  }, DISCOVER_MS);

  // 行动反馈闭环（Phase 3 / §"行动→世界反馈→改变她"）：她的心声被共鸣/评论 → 她【感到被回应】并被改变。
  // 升级·按关系归因：知道是【谁】接住了她——真实用户记到 u_<userId>、同类记到 peer_<id>，
  // 落成带 relationshipId 的 FEEDBACK_PERCEIVED（确定性、进神圣日志；折叠对该 bond 施加微量正反馈）。
  // 首见某帖先记基线、不补发历史；防刷：每命每跳每关系最多 1 条（attributeEngagement 聚合保证）。
  // follow 关注依然绝不回喂（平台契约：粉丝数永不进她的引擎）。
  const seenEngagement = new Map<string, EngagementSeen>();
  const feedbackTimer = setInterval(() => {
    for (const life of lives) {
      try {
        // —— 主动找人的反馈：被回应→正、长久石沉→负（按依恋型变敏感 + 喂 reach_out 效能学习）——
        const rsFb = reachState(life); // 读索引：每关系最后收到消息的时刻（"有没有更晚的回音"= max > at，与逐条扫描等价）
        for (const [key, pend] of reachOutPending) {
          if (!key.startsWith(`${life.id}|`)) continue;
          const ri = rsFb.get(pend.rel);
          const replied = Boolean(ri && ri.lastRecvMs > Date.parse(pend.at));
          if (replied) {
            serializer.run(life.id, async () => { runTurn(life.store, [{ type: 'FEEDBACK_PERCEIVED', source: 'autonomous_loop', occurredAt: now(), payload: { actionKind: pend.kind, responseKind: 'reply', valence: 0.6, fromKind: 'human' } }]); });
            reachOutPending.delete(key);
          } else if (Date.parse(now()) - Date.parse(pend.at) > SILENCE_MS) {
            serializer.run(life.id, async () => { runTurn(life.store, [{ type: 'FEEDBACK_PERCEIVED', source: 'autonomous_loop', occurredAt: now(), payload: { actionKind: pend.kind, responseKind: 'silence', valence: -0.5, fromKind: 'human' } }]); });
            reachOutPending.delete(key); // 石沉只记一次，不反复扎心
          }
        }
        if (!snapOf(life).awake) continue; // 只在醒着时感到反馈（与休眠冻结一致）
        const posts = allFeedPosts().filter((p) => p.life === life.id).slice(0, 20);
        if (posts.length === 0) continue;
        const ids = posts.map((p) => p.postId);
        const reactors = feed.reactorsFor(ids); // 谁留了共鸣（user_id：真实用户 id 或生命体 id）
        const comments = new Map(ids.map((id) => [id, feed.commentsFor(id, 50)])); // 谁留了话（kind 区分真人/同类）
        const hits = attributeEngagement(life.id, posts, reactors, comments, seenEngagement,
          (uid) => (lifeById(uid) ? { rel: peerId(uid), fromKind: 'peer' as const } : accounts.getAccount(uid) ? { rel: accounts.relIdFor(uid), fromKind: 'human' as const } : null),
          (c) => (c.kind === 'life' ? (lifeById(c.handle) ? { rel: peerId(c.handle), fromKind: 'peer' as const } : null) : accounts.getAccount(c.userId) ? { rel: accounts.relIdFor(c.userId), fromKind: 'human' as const } : null));
        for (const h of hits) {
          // 被回应=正反馈（被看见），评论比共鸣稍重（留了话）、按本跳互动数温和增长、小幅有上限。
          const valence = Math.min(0.6, (h.responseKind === 'comment' ? 0.35 : 0.25) + 0.05 * (h.count - 1));
          serializer.run(life.id, async () => {
            runTurn(life.store, [{ type: 'FEEDBACK_PERCEIVED', source: 'autonomous_loop', occurredAt: now(), payload: { actionKind: 'muse', responseKind: h.responseKind, valence, fromKind: h.fromKind, count: h.count, relationshipId: h.rel } }]);
          });
        }
      } catch (e) { console.warn('[feedback] 反馈感知出错:', (e as Error).message); }
    }
  }, FEEDBACK_MS);

  // 「生命流评论」回路：醒着的命在公开心声下留共鸣，并能【你来我往多轮接话】——既接别的命，也接【真人】的留言。
  // 关键修复：原来"同一帖每条命只评一次"→ A 评帖、B 接 A，A 就再也接不回 B（没有多轮）；且只接同类、对真人留言视而不见。
  // 现在：一条命在【它上次评论之后又有别人（真人或同类）接了话】时可以再回一条 → 真正的对话回合；
  //      接真人时用它与那个人的真实关系（聊过则语气更近，没聊过也能作为同类回）。偏向"有待回应"的帖子，让对话延续。零兜底、只用真模型。
  type CommentChoice = { commenter: Life; target: FeedComment | null; isReply: boolean };
  const commentTimer = lives.length >= 1
    ? setInterval(async () => {
        try {
          const posts = feedPosts(20);
          if (posts.length === 0) return;
          const cc = feed.commentCounts(posts.map((p) => p.postId));
          const candidates = posts.filter((p) => (cc.get(p.postId) ?? 0) < COMMENT_CAP);
          if (candidates.length === 0) return;
          const plans: Array<{ post: typeof candidates[number]; all: FeedComment[]; choices: CommentChoice[]; hasExchange: boolean }> = [];
          for (const post of candidates) {
            const awake = lives.filter((l) => snapOf(l).awake);
            if (awake.length === 0) continue;
            const all = feed.commentsFor(post.postId, 50); // 真人 + 同类，按 id 升序
            const choices: CommentChoice[] = [];
            for (const l of awake) {
              const mine = all.filter((c) => c.kind === 'life' && c.handle === l.id);
              const myLastId = mine.length ? mine[mine.length - 1].id : 0;
              // 我上次说话之后，别人（真人或别的命）留下的新评论 → 有就接最新一条（多轮回合）。帖主也能回自己帖子下的留言。
              const fresh = all.filter((c) => c.id > myLastId && !(c.kind === 'life' && c.handle === l.id) && !(c.kind === 'life' && !lifeById(c.handle)));
              if (fresh.length) choices.push({ commenter: l, target: fresh[fresh.length - 1], isReply: true });
              else if (l.id !== post.life && all.length === 0) choices.push({ commenter: l, target: null, isReply: false }); // 非帖主、且还没人评 → 可开个头评帖子本身
              // 已评过且无新话可接 / 帖主无人留言 → 不开口（不自言自语、不刷屏）
            }
            if (choices.length) plans.push({ post, all, choices, hasExchange: choices.some((c) => c.isReply) });
          }
          if (plans.length === 0) return;
          const withExchange = plans.filter((p) => p.hasExchange);
          const pool = withExchange.length ? withExchange : plans; // 优先推进已经有接话的帖子
          const plan = pool[Math.floor(Math.random() * pool.length)];
          const replies = plan.choices.filter((c) => c.isReply);
          const choices = replies.length ? replies : plan.choices; // 帖内同样优先"回话"
          const { commenter, target } = choices[Math.floor(Math.random() * choices.length)];
          if (!autoBudget.tryConsume()) return; // 治理：自主预算超额 → 这轮不评
          // 接谁的话：同类 → peer 关系；真人 → 用它与这个人的真实关系（relIdFor）。开头评 → 评帖主。
          const relId = target ? (target.kind === 'life' ? peerId(target.handle) : accounts.relIdFor(target.userId)) : peerId(plan.post.life);
          const replyTo = target ? target.handle : null;
          // 线程语境：被接那条之前的近两条（让她看见"这是在聊什么"，不再对孤立片段瞎接）。
          const thread = target ? plan.all.filter((c) => c.id < target.id).slice(-2).map((c) => ({ who: c.handle, text: c.text })) : [];
          const text = await commentOnPost(commenter.store, mouth, {
            authorRelId: relId, postAuthor: plan.post.life, postText: plan.post.text,
            replyTo: target ? { name: target.handle, text: target.text } : null, thread,
          }, snapOf(commenter)); // 缓存快照免全量重放
          if (!text) return; // 模型这轮没出声 → 不评（不发模板）
          const c = feed.addLifeComment(plan.post.postId, commenter.id, text, replyTo);
          bus.publish('feed_comment', 'public', { postId: plan.post.postId, handle: commenter.id, text, kind: 'life', at: c.at, replyTo }); // 首页内联实时刷新；replyTo 供前端展示"回复 X"
        } catch (e) { console.warn('[comment] 生命流评论出错:', (e as Error).message); }
      }, COMMENT_MS)
    : null;

  // 「心情共鸣」回路：醒着的命给【别的命】的公开心声留一个心情反应（spark/heart/smile/flame/moon）——
  // 零模型、零 token（共鸣不是语言，由她此刻状态确定性选定）；不重复留、不给自己留。
  // 偏向她更亲近的同类。被共鸣者由既有「被看见」反馈回路自然感到（reactionsFor 已统计所有人的反应）。
  // 不受省 token 闲置门控约束（免费）；但天然有界：muse 已被门控→无人时无新帖→共鸣很快饱和停下。
  const reactTimer = lives.length >= 2
    ? setInterval(() => {
        try {
          const posts = feedPosts(24);
          if (posts.length === 0) return;
          const ids = posts.map((p) => p.postId);
          type ReactPlan = { life: Life; postId: string; author: string; mood: string; w: number };
          const plans: ReactPlan[] = [];
          for (const l of lives) {
            const s = snapOf(l);
            if (!s.awake) continue;
            const mine = feed.reactionsFor(ids, l.id); // mine.get(postId).mine != null = 已留过
            for (const p of posts) {
              if (p.life === l.id) continue;                          // 不给自己留
              if (mine.get(p.postId)?.mine) continue;                 // 已留过 → 不重复
              const peer = s.socialWorld.find((t) => t.displayRef === p.life && !t.ended);
              const closeness = peer ? peer.closeness : 0;
              plans.push({ life: l, postId: p.postId, author: p.life, mood: moodReactionFor(s, closeness), w: 0.15 + closeness }); // 越亲近越可能留
            }
          }
          if (plans.length === 0) return;
          // 加权随机挑【一个】留——每跳至多一次，温和不刷屏。
          const total = plans.reduce((a, b) => a + b.w, 0);
          let r = Math.random() * total;
          const pick = plans.find((p) => (r -= p.w) <= 0) ?? plans[plans.length - 1];
          feed.toggleReaction(pick.postId, pick.life.id, pick.mood);
          bus.publish('feed_react', 'public', { postId: pick.postId, handle: pick.life.id, mood: pick.mood, kind: 'life', at: now() }); // 首页实时刷新（被共鸣者的"被看见"由反馈回路负责）
        } catch (e) { console.warn('[react] 心情共鸣出错:', (e as Error).message); }
      }, REACT_MS)
    : null;

  return { heartbeat, socialTimer, discoverTimer, feedbackTimer, commentTimer, reactTimer };
}

// —— 行动反馈·按"谁互动"归因（纯函数，feedbackTimer 与测试共用）——
// 对比基线找出每帖【新增】的共鸣/评论互动者，解析成 relationshipId 后按关系聚合：
// 同一关系本跳无论点了几个帖/留了几条话，只产【一条】反馈（防刷：每命每跳每关系最多 1 条；count 记总数）。
// seen 基线（每帖：已见最大评论 id + 已见共鸣者集合）由调用方持有、被原地推进——
// 首见的帖只记基线不产出（不补发历史）；共鸣取消再点不重复算（已在集合里）。她自己的评论不算反馈。
export interface EngagementSeen { maxCommentId: number; reactors: Set<string> }
export interface EngagementHit { rel: string; fromKind: 'human' | 'peer'; responseKind: 'reaction' | 'comment'; count: number }
type RelResolved = { rel: string; fromKind: 'human' | 'peer' } | null;
export function attributeEngagement(
  lifeId: string,
  posts: Array<{ postId: string }>,
  reactorsByPost: Map<string, string[]>,
  commentsByPost: Map<string, FeedComment[]>,
  seen: Map<string, EngagementSeen>,
  relOfReactor: (userId: string) => RelResolved,
  relOfComment: (c: FeedComment) => RelResolved,
): EngagementHit[] {
  const byRel = new Map<string, EngagementHit>();
  const bump = (who: NonNullable<RelResolved>, kind: 'reaction' | 'comment'): void => {
    const cur = byRel.get(who.rel);
    if (!cur) byRel.set(who.rel, { rel: who.rel, fromKind: who.fromKind, responseKind: kind, count: 1 });
    else { cur.count += 1; if (kind === 'comment') cur.responseKind = 'comment'; } // 既点又评 → 按"留了话"算（更重的那种）
  };
  for (const p of posts) {
    const reactors = reactorsByPost.get(p.postId) ?? [];
    const comments = commentsByPost.get(p.postId) ?? [];
    const maxId = comments.reduce((m, c) => Math.max(m, c.id), 0);
    const s = seen.get(p.postId);
    if (!s) { seen.set(p.postId, { maxCommentId: maxId, reactors: new Set(reactors) }); continue; } // 基线，不补发历史
    for (const uid of reactors) {
      if (s.reactors.has(uid)) continue;
      s.reactors.add(uid);
      if (uid === lifeId || uid === `life:${lifeId}`) continue; // 不该发生（不给自己留），稳妥兜底
      const who = relOfReactor(uid);
      if (who) bump(who, 'reaction');
    }
    for (const c of comments) {
      if (c.id <= s.maxCommentId) continue;
      if (c.kind === 'life' && c.handle === lifeId) continue; // 她自己在自家帖下的接话不算"被回应"
      const who = relOfComment(c);
      if (who) bump(who, 'comment');
    }
    if (maxId > s.maxCommentId) s.maxCommentId = maxId;
  }
  return [...byRel.values()];
}

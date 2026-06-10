// 读路径加速回归：每命一份【增量读索引】（lives.ts readIndex）必须与全量扫日志逐位等价——
// 它服务 buildThread/relSummaries/livesMetBy/reachState/lastUserMsgMs/广场聚合，是"网站越跑越卡"的解法，
// 但绝不允许为快丢语义（索引只是缓存，日志才是 ground truth）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAccountStore, createSerializer, createTemplateMouth, runTurn, userSay } from '../src/index.ts';
import { createLives } from '../src/server/lives.ts';

const REL = 'r_creator';

test('读索引：线程/关系摘要/遇见/外联状态/广场帖 与日志全量扫描等价，且增量追加后仍一致', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vega-readix-'));
  const prevLives = process.env.VEGA_LIVES;
  process.env.VEGA_LIVES = 'vega';
  const acc = createAccountStore(':memory:', { starterCredits: 0 });
  try {
    const api = createLives({
      accounts: acc, serializer: createSerializer(), peerId: (id: string) => `peer_${id}`, REL,
      HOST_CONN: 'r_host', userName: '你', HOST: '127.0.0.1', PORT: 8787, MUSE_MS: 1_800_000,
      DATA_DIR: dir, LIFE_PATH: join(dir, 'life.jsonl'),
    });
    const life = api.lives[0];
    api.boot(life);

    const reg = acc.register('tam@x.com', 'password1', 'Tam');
    assert.ok(reg.ok);
    const me = reg.ok ? reg.account : (() => { throw new Error('register failed'); })();
    const rel = acc.relIdFor(me.id);
    const mouth = createTemplateMouth();

    // 还没遇见 → 不在收件箱；索引建立后再聊也必须能看见（增量追加）。
    assert.equal(api.livesMetBy(me).length, 0);
    assert.equal(api.buildThread(life, rel).length, 0);

    // 注意：buildEvent 将 occurredAt 钳制为单调不减，而 boot() 用真实时钟落事件——
    // 合成时钟必须从 now 之后起步，否则全部被钳到同一时刻、先后关系无从断言。
    let t = Date.now();
    const at = (): string => new Date((t += 60_000)).toISOString();
    await userSay(life.store, mouth, rel, me.handle, '你好呀', at());
    await userSay(life.store, mouth, rel, me.handle, '今天有点累', at());

    // 与全量扫描等价（who/text/at 序列一致）
    const brute = life.store.list().flatMap((e) => {
      if (e.type === 'MESSAGE_RECEIVED' && (e.payload as { relationshipId?: string }).relationshipId === rel) return [{ who: 'user', text: (e.payload as { content?: string }).content ?? '' }];
      if (e.type === 'MESSAGE_SENT' && (e.payload as { relationshipId?: string }).relationshipId === rel) return [{ who: 'her', text: (e.payload as { utterance?: string }).utterance ?? '' }];
      return [];
    });
    const th = api.buildThread(life, rel);
    assert.deepEqual(th.map((m) => ({ who: m.who, text: m.text })), brute, '线程与日志全量扫描等价');
    assert.equal(th.length, 4, '两轮对话 = 4 条消息');
    assert.equal(api.livesMetBy(me).length, 1, '聊过 → 进收件箱（索引增量追加生效）');

    // 关系摘要：消息数 + 最近往来 = 该关系最后一条消息的 occurredAt
    const sum = api.relSummaries(life).find((r) => r.rel === rel);
    assert.ok(sum && sum.msgs === 4 && sum.lastAt === th[th.length - 1].at);

    // 外联状态：收到过 → lastRecvMs>0 且 pending=false；她主动留言（unprompted）→ pending=true；再收到 → 清掉。
    const rs1 = api.reachState(life).get(rel);
    assert.ok(rs1 && rs1.lastRecvMs > 0 && rs1.pending === false);
    runTurn(life.store, [{ type: 'MESSAGE_SENT', source: 'autonomous_loop', relationshipId: rel, occurredAt: at(), payload: { relationshipId: rel, utterance: '在想你', modelId: 'template', criticVerdict: 'accepted', affectsDerivedState: false, unprompted: true } }]);
    const rs2 = api.reachState(life).get(rel);
    assert.ok(rs2 && rs2.pending === true && rs2.lastSentMs > rs1.lastRecvMs, '主动留言后 pending');
    await userSay(life.store, mouth, rel, me.handle, '我回来了', at());
    assert.equal(api.reachState(life).get(rel)?.pending, false, '收到回音即清 pending');
    assert.equal(api.buildThread(life, rel).filter((m) => m.who === 'her' && m.unprompted).length, 1, '线程标出主动留言');

    // 创造者最后来信：boot 后无 → null；REL 上来一条 → 时间戳就位。
    assert.equal(api.lastUserMsgMs(life), null);
    await userSay(life.store, mouth, REL, '你', '在吗', at());
    assert.ok((api.lastUserMsgMs(life) ?? 0) > 0);

    // 广场聚合：r_square 心声进 allFeedPosts（最新在前），不混入私聊。
    runTurn(life.store, [{ type: 'MESSAGE_SENT', source: 'autonomous_loop', relationshipId: 'r_square', occurredAt: at(), payload: { relationshipId: 'r_square', utterance: '今晚的云像海。', modelId: 'template', criticVerdict: 'accepted', affectsDerivedState: false, unprompted: true } }]);
    const posts = api.allFeedPosts();
    assert.equal(posts.length, 1);
    assert.equal(posts[0].life, 'vega');
    assert.ok(posts[0].postId.startsWith('vega|'));
    assert.equal(api.buildThread(life, rel).some((m) => m.text === '今晚的云像海。'), false, '心声不串进私聊线程');
  } finally {
    acc.close();
    if (prevLives === undefined) delete process.env.VEGA_LIVES; else process.env.VEGA_LIVES = prevLives;
    rmSync(dir, { recursive: true, force: true });
  }
});

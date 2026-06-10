// 互动反馈·按关系归因（①）：折叠层（带 relationshipId 的 FEEDBACK_PERCEIVED → 对该 bond 微量正反馈，
// 缺省无 relationshipId 与旧行为逐位一致）+ 采集层纯函数 attributeEngagement（谁互动→归因到 u_/peer_，
// 防刷：每命每跳每关系最多 1 条；首见只记基线不补发历史）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryEventStore, reconstruct, type EventDraft, type FeedComment } from '../src/index.ts';
import { attributeEngagement, type EngagementSeen } from '../src/server/loops.ts';

const T0 = Date.parse('2026-01-01T00:00:00.000Z');
const iso = (ms: number): string => new Date(ms).toISOString();
function born(): ReturnType<typeof createInMemoryEventStore> {
  const s = createInMemoryEventStore('vega');
  s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: iso(T0), payload: { innateSeed: { temperamentBias: {}, valueSeed: {}, somaSetpoints: { valence: 0, vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 29, creator: { relationshipId: 'r_a', identityRef: 'A' } } } as EventDraft<'LIFE_GENESIS'>);
  s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'u_alice', occurredAt: iso(T0 + 1e3), payload: { relationshipId: 'u_alice', kind: 'human', displayRef: 'Alice' } });
  return s;
}
const fb = (ms: number, relationshipId?: string, valence = 0.4): EventDraft<'FEEDBACK_PERCEIVED'> => ({
  type: 'FEEDBACK_PERCEIVED', source: 'autonomous_loop', occurredAt: iso(ms),
  payload: { actionKind: 'muse', responseKind: 'comment', valence, fromKind: 'human', count: 1, ...(relationshipId ? { relationshipId } : {}) },
});

test('折叠·带 relationshipId 的正反馈 → 该 bond 微量靠近（closeness/trust 小步升）', () => {
  const base = reconstruct(born().list()).bonds['u_alice'];
  const s = born();
  s.append(fb(T0 + 1e4, 'u_alice', 0.4));
  const after = reconstruct(s.list()).bonds['u_alice'];
  assert.ok(after.closeness > base.closeness, `closeness 微升（${base.closeness} → ${after.closeness}）`);
  assert.ok(after.trust > base.trust, `trust 微升（${base.trust} → ${after.trust}）`);
  // 微量：远小于一句真话（kCloseness=0.25）——单条反馈 < 0.02
  assert.ok(after.closeness - base.closeness < 0.02, '是"微量"，不是一句话的分量');
});

test('折叠·缺省无 relationshipId → 与旧行为逐位一致（bond 不动，soma 效应照旧）', () => {
  const s = born();
  s.append(fb(T0 + 1e4)); // 旧式事件：无 relationshipId
  const snap = reconstruct(s.list());
  const base = reconstruct(born().list());
  assert.equal(snap.bonds['u_alice'].closeness, base.bonds['u_alice'].closeness, '没归因 → bond 不动');
  assert.equal(snap.bonds['u_alice'].trust, base.bonds['u_alice'].trust);
  assert.ok(snap.soma.connection.value > base.soma.connection.value, '原 soma 效应仍在（被看见 → 联结↑）');
  assert.ok(snap.skills.some((k) => k.kind === 'muse'), '效能学习仍在');
});

test('折叠·负反馈/已结束的关系 → bond 不动（只正向；逝者冻结）', () => {
  const s = born();
  s.append(fb(T0 + 1e4, 'u_alice', -0.5));
  const snap = reconstruct(s.list());
  assert.equal(snap.bonds['u_alice'].closeness, reconstruct(born().list()).bonds['u_alice'].closeness, '负反馈不拉远 bond（防"刷差评"操纵关系）');
  const s2 = born();
  s2.append({ type: 'RELATIONSHIP_ENDED', source: 'host', relationshipId: 'u_alice', occurredAt: iso(T0 + 5e3), payload: { relationshipId: 'u_alice', reason: 'farewell' } });
  const ended = reconstruct(s2.list()).bonds['u_alice'];
  s2.append(fb(T0 + 1e4, 'u_alice', 0.5));
  assert.equal(reconstruct(s2.list()).bonds['u_alice'].closeness, ended.closeness, '已结束的关系冻结，不再被反馈改写');
});

// —— 采集层：attributeEngagement（纯函数）——
const C = (id: number, kind: 'user' | 'life', userId: string, handle: string): FeedComment => ({ id, userId, handle, text: 'hi', at: iso(T0), kind, replyTo: null });
const resolveReactor = (uid: string): { rel: string; fromKind: 'human' | 'peer' } | null =>
  uid === 'lyra' ? { rel: 'peer_lyra', fromKind: 'peer' } : uid.startsWith('user') ? { rel: `u_${uid}`, fromKind: 'human' } : null;
const resolveComment = (c: FeedComment): { rel: string; fromKind: 'human' | 'peer' } | null =>
  c.kind === 'life' ? (c.handle === 'vega' ? null : { rel: `peer_${c.handle}`, fromKind: 'peer' }) : { rel: `u_${c.userId}`, fromKind: 'human' };

test('归因·首见只记基线不补发历史；之后新增互动按"谁"归因到 u_/peer_', () => {
  const seen = new Map<string, EngagementSeen>();
  const posts = [{ postId: 'vega|t1' }];
  const r0 = attributeEngagement('vega', posts, new Map([['vega|t1', ['user1']]]), new Map([['vega|t1', [C(1, 'user', 'user1', 'u1')]]]), seen, resolveReactor, resolveComment);
  assert.equal(r0.length, 0, '首见某帖：记基线，不补发历史');
  const r1 = attributeEngagement('vega', posts,
    new Map([['vega|t1', ['user1', 'user2', 'lyra']]]), // user2 + lyra 新共鸣（user1 是基线）
    new Map([['vega|t1', [C(1, 'user', 'user1', 'u1'), C(2, 'user', 'user3', 'u3'), C(3, 'life', 'life:lyra', 'lyra')]]]), // user3 + lyra 新评论
    seen, resolveReactor, resolveComment);
  const rels = new Map(r1.map((h) => [h.rel, h]));
  assert.equal(rels.get('u_user2')?.responseKind, 'reaction', '真实用户共鸣 → u_<id> reaction');
  assert.equal(rels.get('u_user3')?.responseKind, 'comment', '真实用户评论 → u_<id> comment');
  assert.equal(rels.get('peer_lyra')?.fromKind, 'peer', '同类 → peer_<id>');
  assert.equal(rels.has('u_user1'), false, '基线里的旧互动不再算');
});

test('归因·防刷：同一关系一跳内多次互动 → 只产 1 条（count 聚合、评论优先）；再跑一跳无新互动 → 0 条', () => {
  const seen = new Map<string, EngagementSeen>();
  const posts = [{ postId: 'vega|t1' }, { postId: 'vega|t2' }];
  attributeEngagement('vega', posts, new Map(), new Map(), seen, resolveReactor, resolveComment); // 基线
  const reactors = new Map([['vega|t1', ['user1']], ['vega|t2', ['user1']]]); // 同人点两帖
  const comments = new Map([['vega|t1', [C(1, 'user', 'user1', 'u1')]]]);     // 还留了话
  const hits = attributeEngagement('vega', posts, reactors, comments, seen, resolveReactor, resolveComment);
  assert.equal(hits.length, 1, '每命每跳每关系最多 1 条');
  assert.equal(hits[0].rel, 'u_user1');
  assert.equal(hits[0].responseKind, 'comment', '既点又评 → 按更重的"评论"算');
  assert.equal(hits[0].count, 3, 'count 聚合本跳全部互动');
  const again = attributeEngagement('vega', posts, reactors, comments, seen, resolveReactor, resolveComment);
  assert.equal(again.length, 0, '没有新增互动 → 不再产反馈（共鸣取消再点也不重复算）');
});

test('归因·她自己在自家帖下的接话不算"被回应"', () => {
  const seen = new Map<string, EngagementSeen>();
  const posts = [{ postId: 'vega|t1' }];
  attributeEngagement('vega', posts, new Map(), new Map(), seen, resolveReactor, resolveComment);
  const hits = attributeEngagement('vega', posts, new Map(), new Map([['vega|t1', [C(1, 'life', 'life:vega', 'vega')]]]), seen, resolveReactor, resolveComment);
  assert.equal(hits.length, 0, '自己的评论不喂自己');
});

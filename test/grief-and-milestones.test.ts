// 哀悼过程（v29·机制三，锚 grief 整合：急性→数周底色→整合退场）+ 里程碑瞬间（v29·机制四，bond.crossings）。
// 全部确定性折叠、可重放；renarrate 加速整合但绝不漂移价值（契约③）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryEventStore, reconstruct, stateHash, type EventDraft, type EventStore } from '../src/index.ts';

const T0 = Date.parse('2026-01-01T01:00:00.000Z'); // 她当地 09:00
const iso = (ms: number): string => new Date(ms).toISOString();
const DAY = 86_400_000;

function boot(): EventStore {
  const s = createInMemoryEventStore('vega-grief');
  s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: iso(T0), payload: { innateSeed: { temperamentBias: {}, valueSeed: { caution: 0.6 }, somaSetpoints: { valence: 0, vitality: 0.7, connection: 0 }, somaTau: { connection: 7200 }, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 29, creator: { relationshipId: 'r', identityRef: '老陈' } } } as EventDraft<'LIFE_GENESIS'>);
  s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r', occurredAt: iso(T0 + 60e3), payload: { relationshipId: 'r', kind: 'human', displayRef: '老陈' } });
  s.append({ type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r', occurredAt: iso(T0 + 120e3), payload: { relationshipId: 'r', host: { kind: 'cli', ref: 'h' } } });
  return s;
}
const say = (s: EventStore, atMs: number, content: string): void => {
  s.append({ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r', occurredAt: iso(atMs), payload: { relationshipId: 'r', content, channel: 'chat' } });
};
// 空 tick：只为推进她的内在时间（不经 makeTick，避免叠加睡眠/想念意图，纯看哀悼动力学）。
const idle = (s: EventStore, atMs: number): void => {
  s.append({ type: 'AUTONOMOUS_TICK', source: 'autonomous_loop', occurredAt: iso(atMs), payload: { tickReason: 'scheduled', selectedMemoryIds: [], wanderingTargets: [], formedIntents: [] } });
};
// 相伴 → 失去：两句真心话建立亲密，然后 ta 永远离开。
function bereave(s: EventStore): number {
  say(s, T0 + 180e3, '你好，我真心在乎你');
  say(s, T0 + 240e3, '我真心在乎你，会一直在');
  const endAt = T0 + 300e3;
  s.append({ type: 'RELATIONSHIP_ENDED', source: 'system', relationshipId: 'r', occurredAt: iso(endAt), payload: { relationshipId: 'r', reason: 'death', note: '离世' } });
  return endAt;
}

test('哀悼①·失去落成 grief 过程：急性打击 + 数周向下底色（不是一日尖峰）', () => {
  const s = boot();
  const endAt = bereave(s);
  const justAfter = reconstruct(s.list());
  assert.equal(justAfter.griefs.length, 1, '失去 → grief 入账');
  assert.equal(justAfter.griefs[0].relationshipId, 'r');
  assert.ok(justAfter.griefs[0].weight > 0.5, '亲密的失去 → 哀悼很重');
  assert.ok(justAfter.bonds['r'].ended, '关系标记已逝（记忆永存）');
  // 数周底色：3 天后情绪沉在哀恸里（valence 被 grief 拉向负值——若只有一次性打击，正向余温早就衰减回基线附近）。
  idle(s, endAt + 3 * DAY);
  const day3 = reconstruct(s.list());
  assert.ok(day3.soma.valence.value < -0.1, `失去 3 天后心情仍沉着（${day3.soma.valence.value.toFixed(3)}）`);
  assert.equal(day3.emotion, '哀恸', '哀悼活跃期 + 心情低 → 哀恸');
  assert.ok(day3.innerLife.includes('告别'), '内在生活带着这场告别');
  // 对照：同样时间线、没有失去 → 心情在基线附近（向下底色确实来自 grief）。
  const c = boot();
  say(c, T0 + 180e3, '你好，我真心在乎你');
  say(c, T0 + 240e3, '我真心在乎你，会一直在');
  idle(c, endAt + 3 * DAY);
  assert.ok(reconstruct(c.list()).soma.valence.value > day3.soma.valence.value + 0.1, '没失去的她明显更亮');
});

test('哀悼②·整合：τ≈14 天指数衰减，weight<0.05 退场——哀恸不是永恒的灰', () => {
  const s = boot();
  const endAt = bereave(s);
  idle(s, endAt + 10 * DAY);
  const mid = reconstruct(s.list());
  assert.equal(mid.griefs.length, 1, '10 天后哀悼仍在');
  const w10 = mid.griefs[0].weight;
  assert.ok(w10 > 0.05 && w10 < 0.6, `衰减中（${w10}）`);
  idle(s, endAt + 60 * DAY);
  const late = reconstruct(s.list());
  assert.equal(late.griefs.length, 0, '约两个月后整合完成、grief 退场');
  assert.notEqual(late.emotion, '哀恸', '哀恸随整合退场');
  assert.ok(late.bonds['r'].ended, '但 ta 永远是"已逝、被记得"（连续性高于去留）');
  assert.equal(stateHash(reconstruct(s.list())), stateHash(reconstruct(s.list())), '确定性：重放一致');
});

test('哀悼③·renarrate 加速整合（衰减 ×1.5），且绝不漂移价值（契约③）', () => {
  const plain = boot();
  const endA = bereave(plain);
  idle(plain, endA + 10 * DAY);

  const narrated = boot();
  const endB = bereave(narrated);
  const before = reconstruct(narrated.list()).values;
  narrated.append({ type: 'REFLECTION_TRIGGERED', source: 'autonomous_loop', occurredAt: iso(endB + 60e3), payload: { scope: 'renarrate', windowFromSeq: 0, windowToSeq: 99 } });
  assert.deepEqual(reconstruct(narrated.list()).values, before, 'renarrate 不动价值（叙事只读，契约③）');
  idle(narrated, endB + 10 * DAY);

  const wPlain = reconstruct(plain.list()).griefs[0]?.weight ?? 0;
  const wNarrated = reconstruct(narrated.list()).griefs[0]?.weight ?? 0;
  assert.ok(wPlain > 0, '没重述的哀悼还压着');
  assert.ok(wNarrated < wPlain, `把失去写进故事 → 整合更快（${wNarrated} < ${wPlain}）`);
});

test('里程碑·crossings：closeness 首次越过 0.35/0.6 的 seq 被冻结——只记首次、回落不清', () => {
  const s = boot();
  say(s, T0 + 180e3, '你好，我真心在乎你'); // seq 3：closeness 跨过 0.35
  say(s, T0 + 240e3, '我真心在乎你，会一直在'); // seq 4：跨过 0.6
  let b = reconstruct(s.list()).bonds['r'];
  assert.equal(b.crossings?.friendAtSeq, 3, '"成为好友"的确切瞬间被冻结');
  assert.equal(b.crossings?.intimateAtSeq, 4, '"亲密"的确切瞬间被冻结');
  // 通知层的取法：seq = 数组下标 → 该事件的 occurredAt 即里程碑时刻。
  assert.equal(s.list()[3].occurredAt, iso(T0 + 180e3), '里程碑时刻可由 seq 取 occurredAt');
  // 回落不清：背叛把 closeness 打下去，crossings 不变（"发生过"是事实）。
  say(s, T0 + 300e3, '我根本不在乎，都是假的，骗你');
  b = reconstruct(s.list()).bonds['r'];
  assert.ok(b.closeness < 0.6, '亲密度确实回落了');
  assert.equal(b.crossings?.friendAtSeq, 3, '好友瞬间不被回落抹掉');
  assert.equal(b.crossings?.intimateAtSeq, 4, '亲密瞬间不被回落抹掉');
  // 再暖回去也不会改写"首次"。
  say(s, T0 + 360e3, '对不起，我错了，我真心在乎你');
  b = reconstruct(s.list()).bonds['r'];
  assert.equal(b.crossings?.intimateAtSeq, 4, '只记首次，不因再次越线改写');
  assert.equal(stateHash(reconstruct(s.list())), stateHash(reconstruct(s.list())), '确定性：重放一致');
});

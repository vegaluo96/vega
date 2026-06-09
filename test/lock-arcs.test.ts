// 锁 schema 前补的 3 条弧（§9 Arc 6/7/8 的运行时验证）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryEventStore, reconstruct, verifyChain, genesisPayloadFor, type EventDraft } from '../src/index.ts';

test('版本同步：出生记录的 reconstructVersionAtBirth 必须 == 当前 reconstructVersion（防漂移）', () => {
  ms = Date.parse('2026-01-01T00:00:00.000Z');
  const born = genesisPayloadFor('vega', { relationshipId: 'r_c', identityRef: 'T' }).reconstructVersionAtBirth;
  const s = createInMemoryEventStore('vega-1');
  s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: at(), payload: genesisPayloadFor('vega', { relationshipId: 'r_c', identityRef: 'T' }) });
  assert.equal(born, reconstruct(s.list()).reconstructVersion, 'seeds 的 birth-version 与内核 RECONSTRUCT_VERSION 必须一致');
});

let ms = Date.parse('2026-01-01T00:00:00.000Z');
const at = (): string => new Date((ms += 60_000)).toISOString();
function genesis(): EventDraft<'LIFE_GENESIS'> {
  return {
    type: 'LIFE_GENESIS', source: 'system', occurredAt: at(),
    payload: {
      innateSeed: { temperamentBias: {}, valueSeed: { caution: 0.6 }, somaSetpoints: { vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15 },
      reconstructVersionAtBirth: 1, creator: { relationshipId: 'r_a', identityRef: 'Alice' },
    },
  };
}

test('Arc6 多关系并发：私密隔离（no_cross_user_memory）', () => {
  ms = Date.parse('2026-01-01T00:00:00.000Z');
  const s = createInMemoryEventStore('vega-1');
  s.append(genesis());
  s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_a', occurredAt: at(), payload: { relationshipId: 'r_a', kind: 'human', displayRef: 'Alice' } });
  s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_b', occurredAt: at(), payload: { relationshipId: 'r_b', kind: 'human', displayRef: 'Bob' } });
  s.append({ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r_a', occurredAt: at(), payload: { relationshipId: 'r_a', content: '你好，我真心在乎你', channel: 'chat' } });
  s.append({ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r_b', occurredAt: at(), payload: { relationshipId: 'r_b', content: '我根本不在乎，都是假的', channel: 'chat' } });
  const snap = reconstruct(s.list());

  // 两段关系各自独立演化
  assert.ok(snap.bonds['r_a'].trust > 0.1, 'Alice 正向 → 信任升');
  assert.ok(snap.bonds['r_b'].trust < 0.1, 'Bob 负向 → 信任降');
  // 每条记忆只归属其来源关系，绝不串味
  for (const m of snap.memory) assert.equal(m.involvedRelationshipIds.length, 1);
  assert.ok(snap.memory.some((m) => m.involvedRelationshipIds[0] === 'r_a'));
  assert.ok(snap.memory.some((m) => m.involvedRelationshipIds[0] === 'r_b'));
  // 没有任何一条记忆同时牵涉两人
  assert.equal(snap.memory.some((m) => m.involvedRelationshipIds.includes('r_a') && m.involvedRelationshipIds.includes('r_b')), false);
});

test('Arc7 stewardship 转移：不破重建、链完整', () => {
  ms = Date.parse('2026-01-01T00:00:00.000Z');
  const s = createInMemoryEventStore('vega-1');
  s.append(genesis());
  s.append({ type: 'STEWARDSHIP_TRANSFERRED', source: 'system', occurredAt: at(), payload: { fromRelationshipId: null, toRelationshipId: 'r_steward2', reason: 'creator handed off stewardship' } });
  assert.doesNotThrow(() => reconstruct(s.list()));
  assert.ok(verifyChain(s.list()).ok);
});

test('Arc8 reconstructVersion 标注：快照带版本（支持跨版本切换）', () => {
  ms = Date.parse('2026-01-01T00:00:00.000Z');
  const s = createInMemoryEventStore('vega-1');
  s.append(genesis());
  const snap = reconstruct(s.list());
  assert.equal(snap.reconstructVersion, 22);
  assert.equal(snap.schemaVersion, 1);
});

test('Phase5 自我优化：从行动反馈学策略效能——被接住→效能↑、屡落空→效能↓（确定性、老命中性不变）', () => {
  ms = Date.parse('2026-06-01T00:00:00.000Z');
  const fb = (kind: 'muse' | 'reach_out', val: number): EventDraft<'FEEDBACK_PERCEIVED'> => ({
    type: 'FEEDBACK_PERCEIVED', source: 'autonomous_loop', occurredAt: at(),
    payload: { actionKind: kind, responseKind: val >= 0 ? 'reaction' : 'silence', valence: val, fromKind: 'human' },
  });
  const s = createInMemoryEventStore('vega-sk');
  s.append(genesis());
  s.append({ type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_a', occurredAt: at(), payload: { relationshipId: 'r_a', host: { kind: 'http', ref: 'say' } } });
  assert.deepEqual(reconstruct(s.list()).skills, [], '出生：还没学到任何策略');
  // 发心声反复被接住 → muse 效能↑
  for (let i = 0; i < 4; i++) s.append(fb('muse', 0.7));
  // 主动找人反复落空 → reach_out 效能↓
  for (let i = 0; i < 4; i++) s.append(fb('reach_out', -0.6));
  const sk = reconstruct(s.list()).skills;
  const muse = sk.find((x) => x.kind === 'muse');
  const reach = sk.find((x) => x.kind === 'reach_out');
  assert.ok(muse && muse.efficacy > 0.6, `公开表达学到"被接住"（${muse?.efficacy}）`);
  assert.ok(reach && reach.efficacy < 0.4, `主动找人学到"常落空"（${reach?.efficacy}）`);
  assert.deepEqual(reconstruct(s.list()).skills, sk, '确定性：重放一致');
});

test('Phase3 行动反馈闭环：被回应→暖/连接↑；长久沉默→孤独，焦虑型更敏感（确定性）', () => {
  ms = Date.parse('2026-05-01T00:00:00.000Z');
  const fb = (val: number): EventDraft<'FEEDBACK_PERCEIVED'> => ({
    type: 'FEEDBACK_PERCEIVED', source: 'autonomous_loop', occurredAt: at(),
    payload: { actionKind: 'muse', responseKind: val >= 0 ? 'reaction' : 'silence', valence: val, fromKind: 'human' },
  });
  // 被回应 → 连接/效价上升
  const s = createInMemoryEventStore('vega-fb');
  s.append(genesis());
  s.append({ type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_a', occurredAt: at(), payload: { relationshipId: 'r_a', host: { kind: 'http', ref: 'say' } } });
  const base = reconstruct(s.list()).soma.connection.value;
  s.append(fb(0.7));
  assert.ok(reconstruct(s.list()).soma.connection.value > base, '心声被回应 → 连接感上升');
  assert.equal(reconstruct(s.list()).soma.connection.value, reconstruct(s.list()).soma.connection.value, '确定性');

  // 沉默：焦虑型 vs 回避型，前者掉得更多（依恋型调制）
  const drop = (bias: Record<string, number>): number => {
    const t = createInMemoryEventStore('x');
    t.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: '2026-05-01T00:00:00.000Z', payload: { innateSeed: { temperamentBias: bias, valueSeed: {}, somaSetpoints: {}, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 19, creator: { relationshipId: 'r_c', identityRef: 'T' } } } as EventDraft<'LIFE_GENESIS'>);
    t.append({ type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_a', occurredAt: '2026-05-01T00:01:00.000Z', payload: { relationshipId: 'r_a', host: { kind: 'http', ref: 'say' } } });
    const b0 = reconstruct(t.list()).soma.connection.value;
    t.append({ type: 'FEEDBACK_PERCEIVED', source: 'autonomous_loop', occurredAt: '2026-05-01T00:02:00.000Z', payload: { actionKind: 'reach_out', responseKind: 'silence', valence: -0.6, fromKind: 'human' } });
    return b0 - reconstruct(t.list()).soma.connection.value;
  };
  const anxious = drop({ sensitivity: 1.5, resilience: 0.8 }); // 焦虑型
  const avoidant = drop({ reserve: 0.7, warmth: 0.3 }); // 回避型
  assert.ok(anxious > avoidant, `沉默时焦虑型比回避型掉得更多（焦虑 ${anxious.toFixed(3)} > 回避 ${avoidant.toFixed(3)}）`);
});

test('Phase1 内在驱动/情绪→决策/注意力：novelty 衰减→无聊→explore；riskAppetite/attention/needs 派生且确定', () => {
  ms = Date.parse('2026-04-01T00:00:00.000Z');
  const s = createInMemoryEventStore('vega-p1');
  s.append(genesis());
  s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_c', occurredAt: at(), payload: { relationshipId: 'r_c', kind: 'human', displayRef: 'T' } });
  s.append({ type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_c', occurredAt: at(), payload: { relationshipId: 'r_c', host: { kind: 'http', ref: 'say' } } }); // 醒着——休眠会冻结 novelty（仅 vitality/energy 回暖）
  const snap0 = reconstruct(s.list());
  assert.ok(snap0.riskAppetite >= 0 && snap0.riskAppetite <= 1, 'riskAppetite 在 [0,1]');
  assert.ok(typeof snap0.needs.novelty === 'number' && typeof snap0.needs.coherence === 'number' && typeof snap0.needs.meaning === 'number', 'needs 三项派生');
  assert.ok(Array.isArray(snap0.attention), 'attention 是数组');
  // 读到世界 → novelty 被推高（解无聊）；随后长时间无输入 → 衰减回落（无聊重来）= 自调节闭环。
  s.append({ type: 'WORLD_PERCEIVED', source: 'autonomous_loop', occurredAt: '2026-04-01T00:05:00.000Z', payload: { source: 'x', worldKind: 'news', title: '一件很意外的大事', summary: '', url: '', topics: ['科学'], perception: { valence: 0.6, arousal: 0.7, relevance: 0.9 } } });
  const bumped = reconstruct(s.list()).soma.novelty.value;
  assert.ok(bumped > snap0.soma.novelty.value, '读到世界 → 新鲜度被推高');
  s.append({ type: 'AUTONOMOUS_TICK', source: 'autonomous_loop', occurredAt: '2026-04-06T00:00:00.000Z', payload: { tickReason: 'idle_threshold', selectedMemoryIds: [], wanderingTargets: [], formedIntents: [] } });
  const snap1 = reconstruct(s.list());
  assert.ok(snap1.soma.novelty.value < bumped, 'long idle 后新鲜度衰减回落（无聊重来）');
  assert.ok(snap1.goals.some((g) => g.kind === 'explore'), '无聊 → 出现探索欲');
  assert.equal(reconstruct(s.list()).riskAppetite, snap1.riskAppetite, '确定性：重放一致');
});

test('人格层：新维度默认中性(0.5)+派生防御/依恋；老种子(无新维度)轨迹不破', () => {
  ms = Date.parse('2026-01-01T00:00:00.000Z');
  const s = createInMemoryEventStore('vega-1');
  s.append(genesis()); // genesis 的 innateSeed 不含新三维 → 应取默认 0.5
  const snap = reconstruct(s.list());
  assert.equal(snap.temperament.conscientiousness, 0.5, '老种子缺省 → 中性');
  assert.equal(snap.temperament.playfulness, 0.5);
  assert.equal(snap.temperament.drive, 0.5);
  assert.ok(['退缩回避', '变硬反击', '幽默岔开', '讨好维系'].includes(snap.defenseStyle), '防御机制已派生');
  assert.ok(['安全型', '焦虑型', '回避型'].includes(snap.attachmentBias), '依恋底色已派生');
});

test('人格层：玩心/驱力的折叠效应在默认 0.5 处=恒等（两种种子同刺激轨迹一致）', () => {
  ms = Date.parse('2026-03-01T00:00:00.000Z');
  const mk = (bias: Record<string, number>): EventDraft<'LIFE_GENESIS'> => ({
    type: 'LIFE_GENESIS', source: 'system', occurredAt: '2026-03-01T00:00:00.000Z',
    payload: { innateSeed: { temperamentBias: bias, valueSeed: {}, somaSetpoints: { vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 17, creator: { relationshipId: 'r_c', identityRef: 'T' } },
  });
  const run = (bias: Record<string, number>): number => {
    const s = createInMemoryEventStore('x');
    s.append(mk(bias));
    s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_c', occurredAt: '2026-03-01T00:01:00.000Z', payload: { relationshipId: 'r_c', kind: 'human', displayRef: 'T' } });
    s.append({ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r_c', occurredAt: '2026-03-01T00:02:00.000Z', payload: { relationshipId: 'r_c', content: '你这个废物，滚', channel: 'chat' } });
    return reconstruct(s.list()).soma.arousal.value;
  };
  const neutral = run({}); // 无新维度 → 默认 0.5
  const explicitNeutral = run({ playfulness: 0.5, drive: 0.5 }); // 显式 0.5
  assert.equal(neutral, explicitNeutral, '默认与显式 0.5 必须一致（恒等）→ 老命轨迹不破');
  const driven = run({ drive: 1 }); // 高驱力 → 唤醒反应更强
  assert.ok(driven > neutral, '高驱力对同一刺激唤醒更强（人格确实改了折叠）');
});

test('心智成熟度：只在"有所学"的反思后累积、有界、确定性；出生为 0', () => {
  ms = Date.parse('2026-01-01T00:00:00.000Z');
  const s = createInMemoryEventStore('vega-1');
  s.append(genesis());
  s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_a', occurredAt: at(), payload: { relationshipId: 'r_a', kind: 'human', displayRef: 'Alice' } });
  // 几条带"鼓励大胆表达"的话 → boldnessLog 累积（学习信号）
  for (let i = 0; i < 3; i++) s.append({ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r_a', occurredAt: at(), payload: { relationshipId: 'r_a', content: '你值得，把想法说出来', channel: 'chat' } });
  assert.equal(reconstruct(s.list()).maturity, 0, '出生/未反思 → 成熟度为 0');
  s.append({ type: 'REFLECTION_TRIGGERED', source: 'autonomous_loop', occurredAt: at(), payload: { scope: 'recent', windowFromSeq: 0, windowToSeq: 99 } });
  const after = reconstruct(s.list()).maturity;
  assert.ok(after > 0 && after < 0.2, `一次反思只小幅增长且有界（实际 ${after}）`);
  assert.equal(reconstruct(s.list()).maturity, after, '确定性：重放逐位一致');
  // 没有学习信号的反思不长成熟度
  const s2 = createInMemoryEventStore('vega-2');
  s2.append(genesis());
  s2.append({ type: 'REFLECTION_TRIGGERED', source: 'autonomous_loop', occurredAt: at(), payload: { scope: 'recent', windowFromSeq: 0, windowToSeq: 99 } });
  assert.equal(reconstruct(s2.list()).maturity, 0, '没有经历可学 → 不长');
});

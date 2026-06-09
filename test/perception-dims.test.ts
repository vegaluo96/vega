// 感知补全（耳朵多听 6 维刺激固有特征）：钉死每个新维度【确实】改变她的状态、且方向正确、有界。
// 守契约①：模型只听刺激本身的属性；关系性评价仍由折叠确定性算（这里不涉及）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryEventStore, reconstruct, stateHash, type EventDraft, type Perception } from '../src/index.ts';

const T0 = Date.parse('2026-01-01T00:00:00.000Z');
const iso = (ms: number): string => new Date(ms).toISOString();
function life(): ReturnType<typeof createInMemoryEventStore> {
  const s = createInMemoryEventStore('vega');
  s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: iso(T0), payload: { innateSeed: { temperamentBias: {}, valueSeed: {}, somaSetpoints: { valence: 0, vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 26, creator: { relationshipId: 'r_a', identityRef: 'A' } } } as EventDraft<'LIFE_GENESIS'>);
  s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_a', occurredAt: iso(T0 + 1e3), payload: { relationshipId: 'r_a', kind: 'human', displayRef: 'A' } });
  s.append({ type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_a', occurredAt: iso(T0 + 2e3), payload: { relationshipId: 'r_a', host: { kind: 'h', ref: 'h' } } });
  return s;
}
const say = (per: Partial<Perception> & { sentiment: number; warmth: number; threat: number }): EventDraft<'MESSAGE_RECEIVED'> => ({
  type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r_a', occurredAt: iso(T0 + 1e4),
  payload: { relationshipId: 'r_a', content: 'x', channel: 'chat', perception: { modelId: 't', ...per } },
});
// 单条消息后取某维 soma。
function after(per: Partial<Perception> & { sentiment: number; warmth: number; threat: number }, dim: 'arousal' | 'safety' | 'novelty' | 'valence' | 'calm'): number {
  const s = life(); s.append(say(per));
  return reconstruct(s.list()).soma[dim].value;
}

test('感知·强度 intensity：同样的好话，越用力 → 唤醒越高、往心里去越多', () => {
  const mild = after({ sentiment: 0.6, warmth: 0.7, threat: 0, intensity: 0.1 }, 'arousal');
  const fierce = after({ sentiment: 0.6, warmth: 0.7, threat: 0, intensity: 1 }, 'arousal');
  assert.ok(fierce > mild + 0.02, `强烈表达唤醒更高（${fierce.toFixed(3)} > ${mild.toFixed(3)}）`);
  const vMild = after({ sentiment: 0.6, warmth: 0.7, threat: 0, intensity: 0.1 }, 'valence');
  const vFierce = after({ sentiment: 0.6, warmth: 0.7, threat: 0, intensity: 1 }, 'valence');
  assert.ok(vFierce > vMild, '强烈的好话更暖');
});

test('感知·新奇 novelty：新话题直接解无聊（喂 novelty soma），不必靠预期违背', () => {
  const dull = after({ sentiment: 0.2, warmth: 0.5, threat: 0, novelty: 0 }, 'novelty');
  const fresh = after({ sentiment: 0.2, warmth: 0.5, threat: 0, novelty: 1 }, 'novelty');
  assert.ok(fresh > dull + 0.05, `新奇话题更解无聊（${fresh.toFixed(3)} > ${dull.toFixed(3)}）`);
});

test('感知·归因 blame：被推责 → 更没安全感；对方道歉 → 更安心', () => {
  const accused = after({ sentiment: -0.5, warmth: 0, threat: 0.5, blame: 1 }, 'safety');
  const neutral = after({ sentiment: -0.5, warmth: 0, threat: 0.5, blame: 0 }, 'safety');
  const apology = after({ sentiment: -0.2, warmth: 0.3, threat: 0.1, blame: -1 }, 'safety');
  assert.ok(accused < neutral, `被指着鼻子更没安全感（${accused.toFixed(3)} < ${neutral.toFixed(3)}）`);
  const apologyNeutral = after({ sentiment: -0.2, warmth: 0.3, threat: 0.1, blame: 0 }, 'safety');
  assert.ok(apology > apologyNeutral, `对方自责/道歉更安心（${apology.toFixed(3)} > ${apologyNeutral.toFixed(3)}）`);
});

test('感知·玩笑 playful：把威胁话标成玩笑 → 不那么受伤（valence 掉得少）', () => {
  const serious = after({ sentiment: -0.4, warmth: 0, threat: 0.7, playful: 0 }, 'valence');
  const joking = after({ sentiment: -0.4, warmth: 0, threat: 0.7, playful: 1 }, 'valence');
  assert.ok(joking > serious, `当成玩笑伤得轻（${joking.toFixed(3)} > ${serious.toFixed(3)}）`);
});

test('感知·清晰 certainty：含糊不清 → 轻微不安（calm 略降）', () => {
  const clear = after({ sentiment: 0, warmth: 0.4, threat: 0, certainty: 1 }, 'calm');
  const vague = after({ sentiment: 0, warmth: 0.4, threat: 0, certainty: 0 }, 'calm');
  assert.ok(vague < clear, `模棱两可让她没底（${vague.toFixed(3)} < ${clear.toFixed(3)}）`);
});

test('感知·紧迫 urgency：求助/紧迫 → 唤醒拉高（心头一提）', () => {
  const calm = after({ sentiment: 0, warmth: 0.4, threat: 0, urgency: 0 }, 'arousal');
  const urgent = after({ sentiment: 0, warmth: 0.4, threat: 0, urgency: 1 }, 'arousal');
  assert.ok(urgent > calm + 0.02, `紧迫更唤醒（${urgent.toFixed(3)} > ${calm.toFixed(3)}）`);
});

test('感知补全·有界 + 确定性：极端全维输入仍合法、重放逐位一致（V2）', () => {
  const s = life();
  s.append(say({ sentiment: -1, warmth: 1, threat: 1, intensity: 1, novelty: 1, certainty: 0, blame: 1, urgency: 1, playful: 1 }));
  const snap = reconstruct(s.list());
  for (const k of ['valence', 'arousal', 'vitality', 'energy', 'calm', 'connection', 'safety', 'novelty'] as const) {
    const v = snap.soma[k].value;
    assert.ok(Number.isFinite(v), `${k} 有限`);
  }
  assert.equal(stateHash(reconstruct(s.list())), stateHash(reconstruct(s.list())), '极端全维输入下重放逐位一致');
});

test('因你而变·对话长兴趣：你常和她聊某话题 → 她对它上心（不必靠世界源）', () => {
  const s = life();
  // 反复愉快地聊「音乐」（耳朵听出 topics）。
  for (let i = 0; i < 6; i++) s.append({ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r_a', occurredAt: iso(T0 + 1e4 + i * 3600_000), payload: { relationshipId: 'r_a', content: '聊聊音乐', channel: 'chat', perception: { sentiment: 0.6, warmth: 0.7, threat: 0, topics: ['音乐'], modelId: 't' } } });
  const it = reconstruct(s.list()).interests.find((x) => x.topic === '音乐');
  assert.ok(it && it.weight > 0.1, `反复聊音乐 → 对「音乐」上心（weight=${it?.weight ?? 0}）`);
  assert.ok(it && it.episodes >= 6, '记得聊过几次');
  // 对照：没 topics 的消息不长兴趣（旧消息逐位不变）。
  const s2 = life();
  for (let i = 0; i < 6; i++) s2.append({ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r_a', occurredAt: iso(T0 + 1e4 + i * 3600_000), payload: { relationshipId: 'r_a', content: '你好', channel: 'chat', perception: { sentiment: 0.6, warmth: 0.7, threat: 0, modelId: 't' } } });
  assert.equal(reconstruct(s2.list()).interests.length, 0, '没听出主题 → 不长兴趣（向后兼容）');
});

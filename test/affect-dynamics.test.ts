// 情感动力学·生命感验证套件（§ docs/affective-dynamics-design.md §6）：把"像不像活的"钉成可量化的测试。
// 锚定实证：情绪时长(Verduyn 哀伤≫喜悦)、情绪惯性健康带(Kuppens)、无病理吸引子(根治 v0.x 顶死)、个体差异。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryEventStore, reconstruct, type EventDraft } from '../src/index.ts';

const T0 = Date.parse('2026-01-01T00:00:00.000Z');
const iso = (ms: number): string => new Date(ms).toISOString();
function lifeWith(bias: Record<string, number> = {}): ReturnType<typeof createInMemoryEventStore> {
  const s = createInMemoryEventStore('vega');
  s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: iso(T0), payload: { innateSeed: { temperamentBias: bias, valueSeed: {}, somaSetpoints: { valence: 0, vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 21, creator: { relationshipId: 'r_a', identityRef: 'A' } } } as EventDraft<'LIFE_GENESIS'>);
  s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_a', occurredAt: iso(T0 + 60_000), payload: { relationshipId: 'r_a', kind: 'human', displayRef: 'A' } });
  s.append({ type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_a', occurredAt: iso(T0 + 120_000), payload: { relationshipId: 'r_a', host: { kind: 'http', ref: 'h' } } });
  return s;
}
const msg = (atMs: number, sentiment: number): EventDraft<'MESSAGE_RECEIVED'> => ({
  type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r_a', occurredAt: iso(atMs),
  payload: { relationshipId: 'r_a', content: sentiment >= 0 ? '好' : '坏', channel: 'chat', perception: { sentiment, warmth: sentiment >= 0 ? 1 : 0, threat: sentiment >= 0 ? 0 : 1, modelId: 'test' } },
});
const idle = (atMs: number): EventDraft<'AUTONOMOUS_TICK'> => ({ type: 'AUTONOMOUS_TICK', source: 'autonomous_loop', occurredAt: iso(atMs), payload: { tickReason: 'idle_threshold', selectedMemoryIds: [], wanderingTargets: [], formedIntents: [] } });
const HOUR = 3600_000;

test('生命感①·情绪时长：哀伤比喜悦消退得慢得多（valence 负向 τ ≫ 正向，照 Verduyn）', () => {
  const recoverFrac = (sentiment: number, idleHours: number): number => {
    const s = lifeWith();
    s.append(msg(T0 + 180_000, sentiment));
    const before = reconstruct(s.list()).soma.valence.value;
    s.append(idle(T0 + 180_000 + idleHours * HOUR));
    const after = reconstruct(s.list()).soma.valence.value;
    return 1 - Math.abs(after) / Math.abs(before); // 设定点=0；恢复比例（越高=消退越多）
  };
  const joy = recoverFrac(1, 24); // 喜悦闲置一天
  const sad = recoverFrac(-1, 24); // 哀伤闲置一天
  assert.ok(joy > sad + 0.2, `同样一天，喜悦消退应远多于哀伤（喜悦恢复 ${joy.toFixed(2)} ≫ 哀伤 ${sad.toFixed(2)}）`);
});

test('生命感②·无病理吸引子：强负向后足够久会回到设定点（根治 v0.x 顶死/塌底，不卡死）', () => {
  const s = lifeWith();
  s.append(msg(T0 + 180_000, -1));
  const low = reconstruct(s.list()).soma.valence.value;
  assert.ok(low < -0.2, '强负向当下确实低落');
  s.append(idle(T0 + 180_000 + 12 * 24 * HOUR)); // 12 天（~6×τ_neg）
  const healed = reconstruct(s.list()).soma.valence.value;
  assert.ok(Math.abs(healed) < 0.1, `足够久后回归基线、不卡死（${healed.toFixed(3)}）`);
});

test('生命感③·动态范围+不饱和：连发强正向会升高、但闲置后回落（不永久顶死 1.0）', () => {
  const s = lifeWith();
  for (let i = 0; i < 6; i++) s.append(msg(T0 + 180_000 + i * 60_000, 1));
  const peak = reconstruct(s.list()).soma.valence.value;
  assert.ok(peak > 0.3 && peak <= 1, `强烈正向有显著反应（${peak.toFixed(2)}）`);
  s.append(idle(T0 + 180_000 + 48 * HOUR));
  const settled = reconstruct(s.list()).soma.valence.value;
  assert.ok(settled < peak - 0.2, `闲置后回落、不冻结在峰值（峰 ${peak.toFixed(2)} → ${settled.toFixed(2)}）`);
});

test('生命感⑤·allostasis：持续数周被善待 → 底色心境抬升（有界、先天设定点仍是锚）；无境遇则不动', () => {
  // 持续被善待：每 6h 一句暖话，连续 ~15 天 → valence 长期偏正 → 习得底色缓慢抬升。
  const warmed = lifeWith();
  let t = T0 + 180_000;
  for (let i = 0; i < 60; i++) { warmed.append(msg(t, 1)); t += 6 * HOUR; }
  const b = reconstruct(warmed.list()).baseline.valence;
  assert.ok(b > 0.05, `持续被善待 → 底色心境抬升（baseline.valence=${b.toFixed(3)}）`);
  assert.ok(b <= 0.26, `但有界、不极端、不盖过先天（≤band, 实际 ${b.toFixed(3)}）`);
  // 对照：什么都没发生 → 底色不动（停在先天设定点 0）。
  const calm2 = lifeWith();
  calm2.append(idle(T0 + 180_000 + 15 * 24 * HOUR));
  assert.ok(Math.abs(reconstruct(calm2.list()).baseline.valence) < 0.02, '无持续境遇 → 底色不漂移');
});

// 评价理论：同一刺激，因【她自己的状态】而意义不同（installment 4）。
function builtLife(opts: { values?: Record<string, number>; setpoints?: Record<string, number> }): ReturnType<typeof createInMemoryEventStore> {
  const s = createInMemoryEventStore('vega');
  s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: iso(T0), payload: { innateSeed: { temperamentBias: {}, valueSeed: opts.values ?? {}, somaSetpoints: { valence: 0, vitality: 0.7, ...(opts.setpoints ?? {}) }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 23, creator: { relationshipId: 'r_a', identityRef: 'A' } } } as EventDraft<'LIFE_GENESIS'>);
  s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_a', occurredAt: iso(T0 + 6e4), payload: { relationshipId: 'r_a', kind: 'human', displayRef: 'A' } });
  s.append({ type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_a', occurredAt: iso(T0 + 12e4), payload: { relationshipId: 'r_a', host: { kind: 'h', ref: 'h' } } });
  return s;
}

test('生命感⑥·评价理论·规范相容：同一句重话，敞开者比戒备者更受伤（worldview 调制）', () => {
  const hostile: EventDraft<'MESSAGE_RECEIVED'> = { type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r_a', occurredAt: iso(T0 + 18e4), payload: { relationshipId: 'r_a', content: '坏', channel: 'chat', perception: { sentiment: -1, warmth: 0, threat: 1, modelId: 't' } } };
  const open = builtLife({ values: { openness: 0.7 } }); open.append(hostile);
  const guarded = builtLife({ values: { guardedness: 0.6 } }); guarded.append(hostile);
  const vOpen = reconstruct(open.list()).soma.valence.value;
  const vGuarded = reconstruct(guarded.list()).soma.valence.value;
  assert.ok(vOpen < vGuarded, `敞开者被同一句话伤得更深（开 ${vOpen.toFixed(3)} < 戒备 ${vGuarded.toFixed(3)}）`);
});

test('生命感⑦·评价理论·应对潜能：枯竭(低应对)时同一威胁更焦虑（arousal 更高）', () => {
  const threat: EventDraft<'MESSAGE_RECEIVED'> = { type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r_a', occurredAt: iso(T0 + 18e4), payload: { relationshipId: 'r_a', content: '坏', channel: 'chat', perception: { sentiment: -1, warmth: 0, threat: 1, modelId: 't' } } };
  const depleted = builtLife({ setpoints: { vitality: 0.25 } }); depleted.append(threat);
  const healthy = builtLife({ setpoints: { vitality: 0.78 } }); healthy.append(threat);
  const aDep = reconstruct(depleted.list()).soma.arousal.value;
  const aHealthy = reconstruct(healthy.list()).soma.arousal.value;
  assert.ok(aDep > aHealthy, `枯竭时同一威胁更焦虑（枯竭 ${aDep.toFixed(3)} > 健康 ${aHealthy.toFixed(3)}）`);
});

test('生命感④·个体差异：高敏感对同一刺激反应更强（气质可测地改变轨迹）', () => {
  const amp = (sens: number): number => {
    const s = lifeWith({ sensitivity: sens });
    s.append(msg(T0 + 180_000, -1));
    return Math.abs(reconstruct(s.list()).soma.valence.value);
  };
  assert.ok(amp(1.7) > amp(0.5), '高敏感者同一坏消息的情绪幅度更大');
});

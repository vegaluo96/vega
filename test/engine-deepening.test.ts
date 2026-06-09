// 引擎深化·期2（论文锚定）：SDT 三需求（Deci & Ryan）+ Schwartz 价值环结构化张力。纯投影、确定性、不升版本。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryEventStore, reconstruct, type EventDraft } from '../src/index.ts';

const T0 = Date.parse('2026-01-01T00:00:00.000Z');
const iso = (ms: number): string => new Date(ms).toISOString();
function born(valueSeed: Record<string, number> = {}, withRel = false): ReturnType<typeof createInMemoryEventStore> {
  const s = createInMemoryEventStore('vega');
  s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: iso(T0), payload: { innateSeed: { temperamentBias: {}, valueSeed, somaSetpoints: { valence: 0, vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 27, creator: { relationshipId: 'r_a', identityRef: 'A' } } } as EventDraft<'LIFE_GENESIS'>);
  if (withRel) {
    s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_a', occurredAt: iso(T0 + 1e3), payload: { relationshipId: 'r_a', kind: 'human', displayRef: 'A' } });
    s.append({ type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_a', occurredAt: iso(T0 + 2e3), payload: { relationshipId: 'r_a', host: { kind: 'h', ref: 'h' } } });
  }
  return s;
}

test('期2·Schwartz 价值环：环上【相对】的价值都高→内在拉扯；【相邻相容】→无拉扯（结构性，非手列）', () => {
  const opp = reconstruct(born({ openness: 0.7, self_protection: 0.7 }).list()); // 开放↔保守 ≈180°
  assert.ok(opp.tension.length > 0, `开放↔自我保护(环上相对)→拉扯：「${opp.tension}」`);
  const compat = reconstruct(born({ openness: 0.7, expression: 0.7 }).list()); // 自我导向/刺激 相邻 ≈20°
  assert.equal(compat.tension, '', '开放↔表达(相邻相容)→无拉扯');
});

test('期2·SDT 关系需求：被善待、连接升 → relatedness 满足度升', () => {
  const rest = reconstruct(born({}, true).list()).needs.relatedness;
  const s = born({}, true);
  for (let i = 0; i < 4; i++) s.append({ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r_a', occurredAt: iso(T0 + 1e4 + i * 3600_000), payload: { relationshipId: 'r_a', content: '好', channel: 'chat', perception: { sentiment: 0.9, warmth: 1, threat: 0, modelId: 't' } } });
  const warmed = reconstruct(s.list()).needs.relatedness;
  assert.ok(warmed > rest, `连接升 → 关系需求更满足（${warmed} > ${rest}）`);
});

test('期2·SDT 需求四项齐全且有界 [0,1]', () => {
  const n = reconstruct(born({}, true).list()).needs;
  for (const k of ['autonomy', 'competence', 'relatedness', 'novelty'] as const) {
    assert.ok(typeof n[k] === 'number' && n[k] >= 0 && n[k] <= 1, `${k} 在 [0,1]`);
  }
});

test('期3·2D 依恋（Bartholomew 四型）：气质投出四象限，中性→安全型', () => {
  const bias = (tb: Record<string, number>): string => {
    const s = createInMemoryEventStore('vega');
    s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: iso(T0), payload: { innateSeed: { temperamentBias: tb, valueSeed: {}, somaSetpoints: { vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 27, creator: { relationshipId: 'r_a', identityRef: 'A' } } } as EventDraft<'LIFE_GENESIS'>);
    return reconstruct(s.list()).attachmentBias;
  };
  assert.equal(bias({ sensitivity: 1, resilience: 1, reserve: 0.5, warmth: 0.5 }), '安全型', '中性气质→安全型');
  assert.equal(bias({ sensitivity: 1.8, resilience: 0.5, reserve: 0.2, warmth: 0.8 }), '焦虑型', '高敏低韧+外向暖→焦虑(专注)');
  assert.equal(bias({ sensitivity: 0.6, resilience: 1.6, reserve: 0.85, warmth: 0.2 }), '疏离回避型', '沉稳+内向冷→疏离回避');
  assert.equal(bias({ sensitivity: 1.8, resilience: 0.5, reserve: 0.85, warmth: 0.2 }), '恐惧回避型', '高敏低韧+内向冷→恐惧回避(双高)');
});

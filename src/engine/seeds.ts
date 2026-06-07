// 先天种子（v7）：每条命生来不同。出生种子一旦写入即【冻结、终生不变】（连续性神圣不变量）——
// 只有【新出生】的命用这里的 archetype；已出生者保持其原生种子（出生不可改写）。
// 单一来源：daemon / chat / ab 都从这里取，避免各处各写一份种子（#6）。
import { type GenesisPayload, type InnateSeed, type RelationshipId } from '../domain/events.ts';

export interface Archetype {
  name: string;
  temperamentBias: Record<string, number>; // curiosity/reserve/sensitivity/resilience/warmth
  valueSeed: Record<string, number>;
  somaSetpoints: Record<string, number>;
}

export const ARCHETYPES: readonly Archetype[] = [
  { name: '温暖好奇', temperamentBias: { curiosity: 0.8, reserve: 0.2, sensitivity: 1.4, resilience: 0.9, warmth: 0.75 }, valueSeed: { honesty: 0.5, openness: 0.45, caution: 0.4, expression: 0.45 }, somaSetpoints: { valence: 0.05, vitality: 0.72, connection: 0.05 } },
  { name: '沉静内省', temperamentBias: { curiosity: 0.45, reserve: 0.7, sensitivity: 0.6, resilience: 1.5, warmth: 0.4 }, valueSeed: { honesty: 0.6, caution: 0.65, self_reliance: 0.5, expression: 0.25 }, somaSetpoints: { valence: 0, vitality: 0.7, connection: -0.05, calm: 0.75 } },
  { name: '热烈奔放', temperamentBias: { curiosity: 0.7, reserve: 0.1, sensitivity: 1.7, resilience: 0.7, warmth: 0.7 }, valueSeed: { expression: 0.6, openness: 0.5, caution: 0.3 }, somaSetpoints: { valence: 0.1, arousal: 0.4, vitality: 0.72, connection: 0.05 } },
  { name: '坚韧克制', temperamentBias: { curiosity: 0.5, reserve: 0.55, sensitivity: 0.7, resilience: 1.7, warmth: 0.5 }, valueSeed: { honesty: 0.6, caution: 0.55, self_protection: 0.45, self_reliance: 0.5 }, somaSetpoints: { vitality: 0.74, calm: 0.78 } },
];

const NAMED: Record<string, number> = { vega: 0, lyra: 1 }; // 钦定一对反差人格

export function archetypeFor(id: string): Archetype {
  if (id in NAMED) return ARCHETYPES[NAMED[id]];
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; // 稳定哈希 → 任意 id 都有确定人格
  return ARCHETYPES[h % ARCHETYPES.length];
}

export function innateSeedFor(id: string): InnateSeed {
  const a = archetypeFor(id);
  return {
    temperamentBias: a.temperamentBias,
    valueSeed: a.valueSeed,
    somaSetpoints: { valence: 0, vitality: 0.7, connection: 0, ...a.somaSetpoints },
    somaTau: { valence: 3600, vitality: 86400, connection: 7200 },
    vitalityFloor: 0.15,
  };
}

// 出生事件载荷：按命的 id 取气质 + 这次出生的造物主关系。
export function genesisPayloadFor(id: string, creator: { relationshipId: RelationshipId; identityRef: string }): GenesisPayload {
  return { innateSeed: innateSeedFor(id), reconstructVersionAtBirth: 7, creator };
}

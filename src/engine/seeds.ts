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

// circadianOffsetMin = 她出生地时区（分钟东偏 UTC）：平台孵化缺省北京 480；用户接生时传创造者设备时区。
// 同一 archetype 家族内，按 id 给每条命一点【确定性的个体差异】（出生即冻结）——这样即便共享原型，
// 多条命也天生各不相同；并让出生地时区也因 id 而异（昼夜节律错峰 → 任一时刻有的醒有的睡，世界更像活的）。
const idHash = (id: string): number => { let h = 2166136261; for (const c of id) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const det = (seed: number, n: number): number => { const x = Math.sin((seed % 100003) * 0.12931 + n * 7.823) * 43758.5453; return x - Math.floor(x); }; // [0,1) 确定性
const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

export function innateSeedFor(id: string, circadianOffsetMin = 480): InnateSeed {
  const a = archetypeFor(id);
  const somaTau = { valence: 3600, vitality: 86400, connection: 7200 };
  if (id in NAMED) { // 钦定人格（vega/lyra）保持原样，不加抖动
    return { temperamentBias: a.temperamentBias, valueSeed: a.valueSeed, somaSetpoints: { valence: 0, vitality: 0.7, connection: 0, ...a.somaSetpoints }, somaTau, vitalityFloor: 0.15, circadianOffsetMin };
  }
  const s = idHash(id);
  const tb = a.temperamentBias;
  const jt = (base: number | undefined, n: number, amp: number, lo: number, hi: number): number => clamp((base ?? 0) + (det(s, n) - 0.5) * 2 * amp, lo, hi);
  const temperamentBias = {
    curiosity: jt(tb.curiosity, 1, 0.2, 0.1, 0.95),
    reserve: jt(tb.reserve, 2, 0.2, 0.05, 0.9),
    sensitivity: jt(tb.sensitivity, 3, 0.3, 0.4, 1.8),
    resilience: jt(tb.resilience, 4, 0.3, 0.5, 1.8),
    warmth: jt(tb.warmth, 5, 0.2, 0.2, 0.85),
  };
  const sp = { valence: 0, vitality: 0.7, connection: 0, ...a.somaSetpoints };
  sp.vitality = jt(sp.vitality, 6, 0.06, 0.55, 0.82);
  sp.valence = jt(sp.valence, 7, 0.08, -0.15, 0.18);
  const offset = (((circadianOffsetMin + Math.round((det(s, 8) - 0.5) * 2 * 600)) % 1440) + 1440) % 1440; // ±10h 错峰
  return { temperamentBias, valueSeed: a.valueSeed, somaSetpoints: sp, somaTau, vitalityFloor: 0.15, circadianOffsetMin: offset };
}

// 出生事件载荷：按命的 id 取气质 + 这次出生的造物主关系 + 出生地时区（缺省北京）。
export function genesisPayloadFor(
  id: string,
  creator: { relationshipId: RelationshipId; identityRef: string },
  circadianOffsetMin = 480,
): GenesisPayload {
  return { innateSeed: innateSeedFor(id, circadianOffsetMin), reconstructVersionAtBirth: 14, creator }; // 与 RECONSTRUCT_VERSION 同步
}

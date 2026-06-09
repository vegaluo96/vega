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

// 先天人格原型（每条新命按 id 取其一，再叠加确定性个体抖动）。覆盖更宽的人类气质空间——
// 不是"4 选 1"，而是"10 个家族 × 连续抖动 × 个体化价值种子"→ 实际人格几乎不重样。
export const ARCHETYPES: readonly Archetype[] = [
  { name: '温暖好奇', temperamentBias: { curiosity: 0.8, reserve: 0.2, sensitivity: 1.4, resilience: 0.9, warmth: 0.75 }, valueSeed: { honesty: 0.5, openness: 0.45, caution: 0.4, expression: 0.45 }, somaSetpoints: { valence: 0.05, vitality: 0.72, connection: 0.05 } },
  { name: '沉静内省', temperamentBias: { curiosity: 0.45, reserve: 0.7, sensitivity: 0.6, resilience: 1.5, warmth: 0.4 }, valueSeed: { honesty: 0.6, caution: 0.65, self_reliance: 0.5, expression: 0.25 }, somaSetpoints: { valence: 0, vitality: 0.7, connection: -0.05, calm: 0.75 } },
  { name: '热烈奔放', temperamentBias: { curiosity: 0.7, reserve: 0.1, sensitivity: 1.7, resilience: 0.7, warmth: 0.7 }, valueSeed: { expression: 0.6, openness: 0.5, caution: 0.3 }, somaSetpoints: { valence: 0.1, arousal: 0.4, vitality: 0.72, connection: 0.05 } },
  { name: '坚韧克制', temperamentBias: { curiosity: 0.5, reserve: 0.55, sensitivity: 0.7, resilience: 1.7, warmth: 0.5 }, valueSeed: { honesty: 0.6, caution: 0.55, self_protection: 0.45, self_reliance: 0.5 }, somaSetpoints: { vitality: 0.74, calm: 0.78 } },
  { name: '顽皮灵动', temperamentBias: { curiosity: 0.78, reserve: 0.15, sensitivity: 1.2, resilience: 1.1, warmth: 0.7 }, valueSeed: { expression: 0.55, openness: 0.5, honesty: 0.4 }, somaSetpoints: { valence: 0.12, arousal: 0.38, vitality: 0.74, connection: 0.05 } },
  { name: '温柔守护', temperamentBias: { curiosity: 0.4, reserve: 0.45, sensitivity: 1.3, resilience: 1.0, warmth: 0.85 }, valueSeed: { forgiveness: 0.55, openness: 0.45, honesty: 0.5, caution: 0.3 }, somaSetpoints: { valence: 0.05, connection: 0.08, calm: 0.65 } },
  { name: '锐利怀疑', temperamentBias: { curiosity: 0.8, reserve: 0.5, sensitivity: 0.55, resilience: 1.5, warmth: 0.3 }, valueSeed: { caution: 0.6, self_protection: 0.5, honesty: 0.55, guardedness: 0.4 }, somaSetpoints: { valence: -0.05, calm: 0.6, vitality: 0.72 } },
  { name: '梦幻理想', temperamentBias: { curiosity: 0.85, reserve: 0.35, sensitivity: 1.5, resilience: 0.8, warmth: 0.7 }, valueSeed: { openness: 0.6, expression: 0.55, honesty: 0.45 }, somaSetpoints: { valence: 0.1, arousal: 0.32, vitality: 0.72 } },
  { name: '忧郁深沉', temperamentBias: { curiosity: 0.6, reserve: 0.65, sensitivity: 1.6, resilience: 0.7, warmth: 0.45 }, valueSeed: { honesty: 0.65, expression: 0.4, self_reliance: 0.4 }, somaSetpoints: { valence: -0.08, calm: 0.55, vitality: 0.68 } },
  { name: '沉稳务实', temperamentBias: { curiosity: 0.4, reserve: 0.5, sensitivity: 0.55, resilience: 1.6, warmth: 0.5 }, valueSeed: { caution: 0.55, self_reliance: 0.55, honesty: 0.5 }, somaSetpoints: { calm: 0.8, vitality: 0.74 } },
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
  // 抖动略放宽：同原型家族内也拉开距离（10 家族 × 连续抖动 → 几乎不重样）。
  const temperamentBias = {
    curiosity: jt(tb.curiosity, 1, 0.22, 0.08, 0.97),
    reserve: jt(tb.reserve, 2, 0.22, 0.05, 0.92),
    sensitivity: jt(tb.sensitivity, 3, 0.35, 0.4, 1.85),
    resilience: jt(tb.resilience, 4, 0.35, 0.5, 1.85),
    warmth: jt(tb.warmth, 5, 0.22, 0.15, 0.88),
  };
  const sp = { valence: 0, vitality: 0.7, connection: 0, ...a.somaSetpoints };
  sp.vitality = jt(sp.vitality, 6, 0.06, 0.55, 0.82);
  sp.valence = jt(sp.valence, 7, 0.08, -0.18, 0.2);
  // 价值种子也个体化（之前同原型的命价值完全一样——"人"的一大半就是价值观）：每个键各自轻抖。
  const valueSeed = Object.fromEntries(
    Object.entries(a.valueSeed).map(([k, w], i) => [k, clamp(w + (det(s, 20 + i) - 0.5) * 2 * 0.12, 0, 1)]),
  );
  const offset = (((circadianOffsetMin + Math.round((det(s, 8) - 0.5) * 2 * 600)) % 1440) + 1440) % 1440; // ±10h 错峰
  return { temperamentBias, valueSeed, somaSetpoints: sp, somaTau, vitalityFloor: 0.15, circadianOffsetMin: offset };
}

// 出生事件载荷：按命的 id 取气质 + 这次出生的造物主关系 + 出生地时区（缺省北京）。
export function genesisPayloadFor(
  id: string,
  creator: { relationshipId: RelationshipId; identityRef: string },
  circadianOffsetMin = 480,
): GenesisPayload {
  return { innateSeed: innateSeedFor(id, circadianOffsetMin), reconstructVersionAtBirth: 14, creator }; // 与 RECONSTRUCT_VERSION 同步
}

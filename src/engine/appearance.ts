// 外观自知 —— 她知道自己长什么样（确定性、纯函数、零依赖：不 import server/web 模块）。
// 与前端活体形象引擎【同一套】基因推导：crHash/crRng/creatureGenes 逐行复刻自 web/src/lib/creature.js，
// tempLabel/mbtiOf 逐行复刻自 src/server/format.ts —— 三处改动必须同步，否则她"以为的自己"和屏幕上的她撞不上。
// 哈希串约定（关键）：前端 gallery/对话页喂给 creatureGenes 的是 /api/lives·/api/lives/:id 返回的
// temperament = tempLabel(t)（中文气质标签）与 mbti = mbtiOf(t)，且不下发 baseHue —— 这里用【同样的输出值】
// 构造 id + '|' + tempLabel + '|' + mbtiOf，并走同一条 rnd 派生路径，保证两侧基因逐位一致。
import type { Temperament } from '../domain/snapshot.ts';

// —— 确定性哈希（雪崩混合，相近名字也分得开）——复刻 creature.js · crHash ——
export function crHash(s: string): number {
  let h = 0;
  for (const c of (s || 'x')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x45d9f3b); h ^= h >>> 16; h = Math.imul(h, 0x45d9f3b); h ^= h >>> 16;
  return h >>> 0;
}
// —— 种子化伪随机 —— 复刻 creature.js · crRng ——
export function crRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// —— 先天气质 → 中文标签 —— 复刻 src/server/format.ts · tempLabel（哈希串的第二段）——
function tempLabelOf(t: Temperament): string {
  const tags = [
    t.curiosity >= 0.6 ? '好奇' : t.curiosity <= 0.35 ? '安于已知' : '适度好奇',
    t.reserve >= 0.55 ? '内向含蓄' : t.reserve <= 0.25 ? '外向主动' : '中和',
    t.sensitivity >= 1.3 ? '情绪敏感' : t.sensitivity <= 0.7 ? '情绪沉稳' : '情绪中性',
    t.resilience >= 1.3 ? '复原快' : t.resilience <= 0.7 ? '恢复慢' : '复原中性',
    t.warmth >= 0.6 ? '天生暖' : t.warmth <= 0.4 ? '偏冷静' : '温度中性',
    t.conscientiousness >= 0.65 ? '自律有条理' : t.conscientiousness <= 0.35 ? '随性' : '尽责中性',
    t.playfulness >= 0.65 ? '爱玩爱笑' : t.playfulness <= 0.35 ? '一本正经' : '玩心中性',
    t.drive >= 0.7 ? '炽烈执着' : t.drive <= 0.3 ? '慵懒随性' : '驱力中性',
  ];
  return tags.join(' · ');
}
// —— MBTI 展示标签 —— 复刻 src/server/format.ts · mbtiOf（哈希串的第三段 + 形态投影）——
function mbtiOf(t: Temperament): string {
  return (
    (t.reserve < 0.5 ? 'E' : 'I') +            // 外向/内向 ← reserve
    (t.curiosity >= 0.5 ? 'N' : 'S') +         // 直觉/实感 ← 好奇/开放
    (t.warmth >= 0.5 ? 'F' : 'T') +            // 情感/思考 ← 暖意
    (t.conscientiousness >= 0.5 ? 'J' : 'P')   // 判断/感知 ← 尽责
  );
}

export interface AppearanceGenes {
  seed: number;
  baseHue: number;
  hue2: number;
  roundness: number; // 形态圆润/棱角（F→0.9 / T→0.62）
  motes: number; // 兴趣点缀繁简（N→5 / S→3）
  reach: number; // 外放度（E→1 / I→0.7）
  spots: Array<{ x: number; y: number; r: number; o: number }>; // 独有斑纹（位置/大小每条命不同）
  sproutTilt: number; // 呆毛倾角（负=朝左、正=朝右）
  ears: boolean; // 耳朵（感受型 F 才有——性格长在形体上）
}

// —— 基因（稳定）—— 复刻 creature.js · creatureGenes：rnd 消耗顺序必须一字不差
//（baseHue → hue2 → 斑纹条数 → 每块斑纹 x/y/r/o → 呆毛倾角），否则与前端撞不上。
export function appearanceGenes(lifeId: string, temperament: Temperament): AppearanceGenes {
  const id = lifeId || 'x';
  const temp = tempLabelOf(temperament);
  const mbti = mbtiOf(temperament);
  const seed = crHash(id + '|' + (temp || '') + '|' + (mbti || ''));
  const rnd = crRng(seed || 1);
  const baseHue = Math.floor(rnd() * 360); // API 不下发 baseHue → 前端走 rnd 分支，这里保持同一路径
  const hue2 = (baseHue + 30 + Math.floor(rnd() * 60)) % 360;
  // MBTI 投影：E→更外放（动作幅度大、光晕广）；N/S→点缀繁简；T/F→形态棱角/圆润
  const m = (mbti || 'INFP').toUpperCase();
  const extrovert = m[0] === 'E';
  const intuitive = m[1] === 'N';
  const feeling = m[2] === 'F';
  return {
    seed, baseHue, hue2,
    roundness: feeling ? 0.9 : 0.62,        // 形态圆润/棱角
    motes: intuitive ? 5 : 3,               // 兴趣点缀繁简
    reach: extrovert ? 1 : 0.7,             // 外放度 → 光晕广度/动作幅度
    // 独有细节：斑纹（每条命位置/大小都不同）+ 呆毛倾角 + 耳朵（感受型 F 才有——性格长在形体上）
    spots: Array.from({ length: 2 + Math.floor(rnd() * 2) }).map(() => ({ x: 16 + rnd() * 58, y: 34 + rnd() * 42, r: 5 + rnd() * 8, o: 0.12 + rnd() * 0.12 })),
    sproutTilt: (rnd() - 0.5) * 36,
    ears: feeling,
  };
}

// —— 色相 → 12 桶中文色名（每 30° 一桶，脱敏、无数字）——
export const HUE_NAMES = ['绯红', '暖橙', '鹅黄', '嫩绿', '青绿', '碧青', '天青', '湖蓝', '靛蓝', '紫藤', '烟紫', '绯粉'] as const;
export function hueName(hue: number): string {
  return HUE_NAMES[Math.floor((((hue % 360) + 360) % 360) / 30) % 12];
}

// —— 一句自然语自述（脱敏、无数字）：进 selfFacts 给"嘴"做 grounding ——
// 被问「你长什么样」她答得对：颜色/形态/呆毛朝向/斑纹/耳朵全部来自与屏幕同源的基因。
export function describeAppearance(lifeId: string, temperament: Temperament): string {
  const g = appearanceGenes(lifeId, temperament);
  const shape = g.roundness >= 0.8 ? '圆滚滚的' : '带点棱角';
  const tilt = g.sproutTilt < 0 ? '左' : '右';
  const spotsWord = g.spots.length >= 3 ? '三块' : '两块'; // 中文数词，不触"无数字"红线
  const earsNote = g.ears ? '，还有一对小圆耳' : '';
  return `我的样子：一团${hueName(g.baseHue)}色会发光的软软云体小生灵，${shape}，头顶翘着一缕小呆毛（朝${tilt}歪），身上有${spotsWord}浅浅的斑纹${earsNote}。开心时我会张嘴笑、原地蹦；想念谁时头顶会飘起小月牙；难过时眼角会含泪。`;
}

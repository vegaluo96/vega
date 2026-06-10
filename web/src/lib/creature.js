// ZSKY · 活体形象引擎（数值 → 视觉的确定性映射）。重构的灵魂：每条命的全站引擎数值
// 生成独一无二、随状态实时变脸的活体形象。两条命绝不撞脸。
// 纯逻辑（无 DOM）：色相/形态/表情/星台场景都在这里算好，交给 Creature.svelte / SkyScene.svelte 渲染。
// 注：本文件刻意承载"有意的颜色"（hsl/rgba/hex 由数值派生）——这是设计意图，不是主题色，故放 JS（不归 CSS 令牌）。

// —— 确定性哈希（雪崩混合，相近名字也分得开）——
export function crHash(s) {
  let h = 0;
  for (const c of (s || 'x')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x45d9f3b); h ^= h >>> 16; h = Math.imul(h, 0x45d9f3b); h ^= h >>> 16;
  return h >>> 0;
}
export function crRng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const clamp01 = (x) => Math.max(0, Math.min(1, x));

// —— 表情表：emotion → 五官(含眉/腮) + 暖冷/亮度倾向（脱敏的「此刻样子」）——
// brow: 眉形，正=内端上扬(担忧/委屈)，负=内端下压(专注/坚定)；cheek: 暖意时的腮红。
export const EXPR = {
  '温暖':  { mouth: 0.55, eye: 'soft', warm: 0.9, bright: 0.9, brow: 0.12, cheek: true },
  '雀跃':  { mouth: 0.95, eye: 'arc',  warm: 0.8, bright: 1.0, bob: true, brow: 0.2, cheek: true, open: true },
  '欣喜':  { mouth: 0.9,  eye: 'arc',  warm: 0.8, bright: 1.0, bob: true, brow: 0.2, cheek: true, open: true },
  '平静':  { mouth: 0.2,  eye: 'soft', warm: 0.5, bright: 0.7, brow: 0 },
  '安宁':  { mouth: 0.28, eye: 'soft', warm: 0.55, bright: 0.72, brow: 0.05, cheek: true },
  '专注':  { mouth: 0.05, eye: 'narrow', warm: 0.5, bright: 0.78, brow: -0.55 },
  '好奇':  { mouth: 0.42, eye: 'wide', warm: 0.65, bright: 0.92, brow: 0.4 },
  '低落':  { mouth: -0.45, eye: 'low', warm: 0.3, bright: 0.5, brow: 0.5, tear: true },
  '孤独':  { mouth: -0.3, eye: 'soft', warm: 0.32, bright: 0.5, dim: true, brow: 0.45, tear: true },
  '想念':  { mouth: -0.08, eye: 'soft', warm: 0.7, bright: 0.66, brow: 0.32, miss: true },
  '焦虑':  { mouth: -0.12, eye: 'wide', warm: 0.4, bright: 0.7, wobble: true, brow: 0.7 },
  '不安':  { mouth: -0.2, eye: 'wide', warm: 0.38, bright: 0.62, wobble: true, brow: 0.6 },
  '紧绷':  { mouth: -0.02, eye: 'narrow', warm: 0.42, bright: 0.66, wobble: true, brow: -0.45 },
  '疲惫':  { mouth: 0.02, eye: 'droop', warm: 0.45, bright: 0.5, brow: 0.18 },
};
export function exprFor(emotion) { return EXPR[emotion] || EXPR['平静']; }

// —— 基因（稳定）：色相/形态比例 由 id + 气质 确定性派生 —— 两条命绝不撞脸 ——
export function creatureGenes(life) {
  const id = life.id || 'x';
  const seed = crHash(id + '|' + (life.temperament || '') + '|' + (life.mbti || ''));
  const rnd = crRng(seed || 1);
  const baseHue = (life.baseHue != null) ? life.baseHue : Math.floor(rnd() * 360);
  const hue2 = (baseHue + 30 + Math.floor(rnd() * 60)) % 360;
  // MBTI 投影：E→更外放（动作幅度大、光晕广）；N/S→点缀繁简；T/F→形态棱角/圆润
  const m = (life.mbti || 'INFP').toUpperCase();
  const extrovert = m[0] === 'E';
  const intuitive = m[1] === 'N';
  const feeling = m[2] === 'F';
  return {
    seed, baseHue, hue2, rnd,
    roundness: feeling ? 0.9 : 0.62,        // 形态圆润/棱角
    motes: intuitive ? 5 : 3,               // 兴趣点缀繁简
    reach: extrovert ? 1 : 0.7,             // 外放度 → 光晕广度/动作幅度
    // 独有细节：斑纹（每条命位置/大小都不同）+ 呆毛倾角 + 耳朵（感受型 F 才有——性格长在形体上）
    spots: Array.from({ length: 2 + Math.floor(rnd() * 2) }).map(() => ({ x: 16 + rnd() * 58, y: 34 + rnd() * 42, r: 5 + rnd() * 8, o: 0.12 + rnd() * 0.12 })),
    sproutTilt: (rnd() - 0.5) * 36,
    ears: feeling,
  };
}

// —— 状态（会变）：此刻的样子/动作/光，全部映射真实字段 ——
export function creatureState(life, reaction) {
  const expr = exprFor(life.emotion);
  const awake = life.awake !== false;
  const sleepP = clamp01(life.sleepPressure ?? 0);
  const vitality = clamp01(life.vitality ?? 0.7);
  const maturity = clamp01(life.maturity ?? 0.3);
  const arousal = clamp01(life.arousal ?? (expr.bob ? 0.8 : 0.4));
  const closeness = clamp01(life.closeness ?? 0);
  const peers = Array.isArray(life.peers) ? life.peers.length : (life.peerCount ?? 0);
  const interests = Array.isArray(life.interests) ? life.interests.length : 0;
  const aspirations = Array.isArray(life.aspirations) ? life.aspirations.length : 0;
  const tension = !!life.tension;
  const attachment = life.attachmentBias || '安全'; // 安全 / 焦虑 / 回避 → 光晕行为
  const joy = ['雀跃', '欣喜', '温暖'].includes(life.emotion); // 正情绪 → 闪光
  const phase = life.dayPhase || '白天';
  return { expr, awake, sleepP, vitality, maturity, arousal, closeness, peers, interests, aspirations, tension, attachment, joy, phase, reaction: reaction || (awake ? 'idle' : 'asleep') };
}

// —— 星台场景：每个 dayPhase 一套完整场景（渐变 + 天体 + 星/云 + 光晕）——
export function skyScene(phase) {
  switch (phase) {
    case '清晨': case '黎明': case '拂晓':
      return { a: '#42507e', b: '#3a2436', glow: 'rgba(255,205,150,0.30)', sun: { c: '#ffe6bc', y: 66, r: 50, halo: 'rgba(255,200,140,0.55)' }, stars: 5, mist: true, dawn: true, key: 'dawn' };
    case '白天': case '上午': case '午后': case '中午':
      return { a: '#3d6db0', b: '#1a3360', glow: 'rgba(255,240,200,0.30)', sun: { c: '#fff3d0', y: 38, halo: 'rgba(255,240,190,0.55)' }, stars: 0, clouds: true, key: 'day' };
    case '黄昏': case '傍晚': case '日暮':
      return { a: '#6a3a5e', b: '#3a1610', glow: 'rgba(255,140,80,0.4)', sun: { c: '#ffd07a', y: 76, r: 60, halo: 'rgba(255,120,60,0.7)' }, stars: 4, dusk: true, key: 'dusk' };
    case '夜里': case '深夜': case '午夜': case '凌晨':
      return { a: '#162043', b: '#05060e', glow: 'rgba(130,160,255,0.16)', moon: { c: '#eef2ff', y: 38 }, stars: 22, shoot: true, galaxy: true, key: 'night' };
    default:
      return { a: '#1d2a52', b: '#0b1020', glow: 'rgba(150,190,255,0.18)', moon: { c: '#dfe6ff', y: 46 }, stars: 12, galaxy: true, key: 'dim' };
  }
}
export const skyTint = skyScene;
// 星台的径向渐变背景串（给 .sky 容器用）。
export function skyGradient(phase) {
  const s = skyScene(phase);
  return `radial-gradient(120% 92% at 50% 18%, ${s.a} 0%, ${s.b} 66%)`;
}

// emotion → 此刻感受短句 + 唤醒度（让活体随对话实时变脸 + 变呼吸节奏）
const EMO_FEEL = {
  平静: ['思绪慢慢平下来了', 0.34], 安宁: ['这样待着，很安心', 0.3], 温暖: ['心里暖暖的', 0.5],
  雀跃: ['有点想蹦起来！', 0.86], 欣喜: ['忍不住笑了', 0.8], 专注: ['正认真想你说的', 0.4],
  好奇: ['咦，想多听一点', 0.7], 想念: ['忽然有点想你', 0.5], 低落: ['心口沉了一下', 0.3],
  孤独: ['有点空落落的', 0.3], 焦虑: ['心里有点慌', 0.7], 疲惫: ['有点累，但还想陪你', 0.2],
};
export function emoState(emotion) { const e = EMO_FEEL[emotion]; return { feeling: e ? e[0] : '', arousal: e ? e[1] : 0.4 }; }

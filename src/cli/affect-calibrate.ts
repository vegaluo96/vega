// 情感动力学·离线数据集拟合（设计见 docs/being.md §1 情绪基质）。
// 目标：把"凭直觉拍的"动力学常量，拟合到【实证健康带】——但守两条铁律：
//   ① 两条时标分开拟（这是关键，盲拟会毁掉哀伤持续）：
//      · valence 是【心境/情绪事件】层的慢潜变量 → 只用【情绪时长数据】(Verduyn 哀伤≫喜悦)定它的 τ，
//        【绝不】用"瞬时自相关"去拟它（那会把 τ 压到~1h、毁掉哀伤的持续=她的悲伤不再像真的）。
//      · arousal(τ 快) + 内生心绪天气 才是 ESM【瞬时】自相关/变率真正测的东西 → 用它们拟 Kuppens 健康带。
//   ② 哀伤持续硬护栏：拟合后 valence 负向 τ 必须 ≥ 日尺度(24h) 且 ≥ 2.5× 正向 τ；否则夹回 + 告警。
// 全离线、确定性(LCG 只在测试侧造序列；引擎本身无 RNG)。运行时【不依赖】数据集：本脚本只产出"建议常量"，
// 人工固化进 src/kernel/affect-config.ts + 升 RECONSTRUCT_VERSION + 全量重放。
//
// 跑法：
//   本地(无网，用文献锚定目标，验证拟合机器收敛、确认现有常量)：  npm run calibrate
//   HK 服务器(真数据集精修 fast 层)：
//     npm run calibrate -- --dataset path.csv --arousal-col Activated --valence-col Pleasant \
//                          --participant-col PID --scale-min 1 --scale-max 100 --interval-hours 1.5
//   可选覆盖情绪时长目标(若有带 episode 标注的数据)： --sad-duration 120 --joy-duration 35 --episode-tau-ratio 3
import { readFileSync, writeFileSync } from 'node:fs';
import { createInMemoryEventStore, reconstruct, type EventDraft } from '../index.ts';
import { AFFECT } from '../kernel/affect-config.ts';

const HOUR = 3600_000;
const T0 = Date.parse('2026-01-01T00:00:00.000Z');
const iso = (ms: number): string => new Date(ms).toISOString();

// ───────────────────────── CLI ─────────────────────────
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const num = (name: string, dflt: number): number => { const v = arg(name); return v == null ? dflt : Number(v); };

const DATASET = arg('dataset');
const SYNTH = process.argv.includes('--synthesize'); // 生成确定性"类 ESM"CSV 并跑全 --dataset 管线（管线自测/演示，非新证据）
const INTERVAL_H = num('interval-hours', 1.5); // ESM 典型采样间隔（醒着每天~6-10 次）
const EPISODE_TAU_RATIO = num('episode-tau-ratio', 3); // 情绪事件时长 ≈ K·τ（OU 约 3τ 回到~95% 基线）
const SAD_DURATION_H = num('sad-duration', 120); // Verduyn & Lavrijsen 2011：哀伤 episode ≈120h
const JOY_DURATION_H = num('joy-duration', 35); //                                 喜悦 episode ≈35h

// ───────────────────── 实证目标（带 provenance） ─────────────────────
// fast 层（瞬时 arousal）目标：Kuppens 情绪惯性"健康带"——自相关中等(既非 stuck 也非 erratic)、变率适中。
// 文献缺省（无数据集时用，可被 --dataset 实测替换）：lag-1 自相关 ~0.35、组内 SD ~0.15（归一到 [0,1]）。
let target = {
  arousalAutocorr: 0.35, // Kuppens 等：健康成人瞬时 affect lag-1 自相关落在 ~0.2–0.5 中段
  arousalSD: 0.15, // ESM 组内瞬时变率（归一化量级）
  sadDurationH: SAD_DURATION_H,
  joyDurationH: JOY_DURATION_H,
  source: '文献锚定（Kuppens 惯性健康带 + Verduyn 情绪时长）',
};

// ───────────────────── 统计量 ─────────────────────
const mean = (x: number[]): number => x.reduce((a, b) => a + b, 0) / x.length;
function sd(x: number[]): number { const m = mean(x); return Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / x.length); }
function autocorr1(x: number[]): number {
  const m = mean(x); let num = 0, den = 0;
  for (let i = 0; i < x.length; i++) { den += (x[i] - m) ** 2; if (i < x.length - 1) num += (x[i] - m) * (x[i + 1] - m); }
  return den === 0 ? 0 : num / den;
}
const median = (x: number[]): number => { const s = [...x].sort((a, b) => a - b); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };

// ───────────────────── 数据集（服务器侧）→ 真实目标 ─────────────────────
type DatasetOpts = { aroCol?: string; valCol?: string; pidCol?: string; sMin: number; sMax: number };
function targetsFromDataset(path: string, o: DatasetOpts): void {
  const { valCol, aroCol, pidCol, sMin, sMax } = o;
  if (!aroCol) throw new Error('需 --arousal-col（瞬时唤醒/激活列名），用于拟 fast 层');
  const lines = readFileSync(path, 'utf8').trim().split(/\r?\n/);
  const header = lines[0].split(',').map((s) => s.trim());
  const iAro = header.indexOf(aroCol), iPid = pidCol ? header.indexOf(pidCol) : -1, iVal = valCol ? header.indexOf(valCol) : -1;
  if (iAro < 0) throw new Error(`列 ${aroCol} 不在表头`);
  const norm = (r: number): number => (r - sMin) / (sMax - sMin); // 归一到 [0,1]
  const groups = new Map<string, number[]>();
  for (let k = 1; k < lines.length; k++) {
    const c = lines[k].split(',');
    const a = Number(c[iAro]); if (!Number.isFinite(a)) continue;
    const pid = iPid >= 0 ? c[iPid].trim() : 'all';
    (groups.get(pid) ?? groups.set(pid, []).get(pid)!).push(norm(a));
  }
  const acs: number[] = [], sds: number[] = [];
  for (const series of groups.values()) if (series.length >= 5) { acs.push(autocorr1(series)); sds.push(sd(series)); }
  target.arousalAutocorr = median(acs);
  target.arousalSD = median(sds);
  target.source = `数据集 ${path}（${groups.size} 人，arousal=${aroCol}${iVal >= 0 ? `，valence=${valCol}` : ''}）`;
  console.log(`  [数据集] ${groups.size} 人 → 瞬时 arousal 自相关 median=${target.arousalAutocorr.toFixed(3)}, SD median=${target.arousalSD.toFixed(3)}`);
}

// 生成【确定性】类 ESM 数据集：每人一条 AR(1) 瞬时序列(健康惯性 φ≈0.45)+ 偶发事件反应性尖峰 + 个体均值/变率差异，
// 1–100 量表(像真 ESM 评分)。用于【端到端跑通 --dataset 管线 + 演示工作流】——【非】新实证(它就是按已知统计造的，循环)。
function synthesizeEsm(path: string): { aroCol: string; valCol: string; pidCol: string; sMin: number; sMax: number } {
  const people = num('people', 80), days = num('days', 7);
  const perDay = Math.max(4, Math.floor(14 / INTERVAL_H)); // 清醒 ~14h / 采样间隔
  let s = 0x9e3779b9 >>> 0; const r = (): number => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const clamp01to100 = (x: number): number => Math.min(100, Math.max(1, x));
  const rows: string[] = ['PID,Pleasant,Activated'];
  for (let p = 0; p < people; p++) {
    const meanA = 35 + 35 * r(), meanV = 45 + 25 * (r() - 0.5) * 2; // 个体差异：均值不同
    const sdA = 8 + 12 * r(), sdV = 8 + 12 * r(); // 个体差异：变率不同
    const phi = 0.35 + 0.25 * r(); // 健康惯性带 ~0.35–0.6
    let a = meanA, v = meanV;
    for (let i = 0; i < days * perDay; i++) {
      const spikeA = r() < 0.15 ? (r() - 0.5) * 40 : 0; // 事件反应性尖峰(总变率的主来源)
      const spikeV = r() < 0.15 ? (r() - 0.5) * 40 : 0;
      a = clamp01to100(meanA + phi * (a - meanA) + (r() - 0.5) * 2 * sdA + spikeA);
      v = clamp01to100(meanV + phi * (v - meanV) + (r() - 0.5) * 2 * sdV + spikeV);
      rows.push(`P${p},${v.toFixed(1)},${a.toFixed(1)}`);
    }
  }
  writeFileSync(path, rows.join('\n'));
  console.log(`  [synthesize] 写入 ${path}：${people} 人 × ${days} 天 × ${perDay}/天（确定性、类 ESM、1–100 量表）`);
  return { aroCol: 'Activated', valCol: 'Pleasant', pidCol: 'PID', sMin: 1, sMax: 100 };
}

// ───────────────────── 仿真（驱动真引擎） ─────────────────────
const genesis = (t: number): EventDraft<'LIFE_GENESIS'> => ({ type: 'LIFE_GENESIS', source: 'system', occurredAt: iso(t), payload: { innateSeed: { temperamentBias: {}, valueSeed: {}, somaSetpoints: { valence: 0, vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 24, creator: { relationshipId: 'r_a', identityRef: 'A' } } } as EventDraft<'LIFE_GENESIS'>);
const rel = (t: number): EventDraft<'RELATIONSHIP_OPENED'> => ({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_a', occurredAt: iso(t), payload: { relationshipId: 'r_a', kind: 'human', displayRef: 'A' } });
const conn = (t: number): EventDraft<'CONNECTION_OPENED'> => ({ type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_a', occurredAt: iso(t), payload: { relationshipId: 'r_a', host: { kind: 'h', ref: 'h' } } });
const tick = (t: number): EventDraft<'AUTONOMOUS_TICK'> => ({ type: 'AUTONOMOUS_TICK', source: 'autonomous_loop', occurredAt: iso(t), payload: { tickReason: 'idle_threshold', selectedMemoryIds: [], wanderingTargets: [], formedIntents: [] } });
const msg = (t: number, sign: number): EventDraft<'MESSAGE_RECEIVED'> => ({ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r_a', occurredAt: iso(t), payload: { relationshipId: 'r_a', content: sign >= 0 ? '好' : '坏', channel: 'chat', perception: { sentiment: sign, warmth: sign >= 0 ? 1 : 0, threat: sign >= 0 ? 0 : 1, modelId: 't' } } });

// 静息序列：充分弛豫后，纯 idle 推进，每 intervalH 采一次 → 测【内生心绪天气】在 valence/arousal 上的签名。
function restingSeries(intervalH: number, n: number, warmupDays = 20): { val: number[]; aro: number[] } {
  const s = createInMemoryEventStore('vega-cal');
  let t = T0; s.append(genesis(t)); s.append(rel(t + 1000)); s.append(conn(t + 2000));
  t += warmupDays * 24 * HOUR; s.append(tick(t));
  const val: number[] = [], aro: number[] = [];
  for (let i = 0; i < n; i++) { t += intervalH * HOUR; s.append(tick(t)); const sn = reconstruct(s.list()); val.push(sn.soma.valence.value); aro.push(sn.soma.arousal.value); }
  return { val, aro };
}
// 情绪时长：单次强刺激后，|valence| 衰减到峰值一半的时间（小时）= 半衰期（验证慢 τ 真给出 Verduyn 量级的哀伤持续）。
function halfLifeHours(sign: number): number {
  const s = createInMemoryEventStore('vega-cal');
  const t0 = T0; s.append(genesis(t0)); s.append(rel(t0 + 1000)); s.append(conn(t0 + 2000));
  const shock = t0 + 180_000; s.append(msg(shock, sign));
  const peak = Math.abs(reconstruct(s.list()).soma.valence.value);
  if (peak < 1e-6) return 0;
  let prevH = 0, prevV = peak;
  for (let h = 2; h <= 800; h += 2) {
    s.append(tick(shock + h * HOUR));
    const v = Math.abs(reconstruct(s.list()).soma.valence.value);
    if (v <= peak / 2) return prevH + ((prevV - peak / 2) / (prevV - v)) * (h - prevH);
    prevH = h; prevV = v;
  }
  return 800;
}

// ───────── 在内存里临时覆写 AFFECT 常量跑一个候选（offline 单线程安全；finally 必复原） ─────────
type Overrides = Partial<{ valenceNeg: number; valencePos: number; arousal: number; endogenousAmp: number; fastPeriod: number }>;
function withOverrides<T>(o: Overrides, fn: () => T): T {
  const tau = AFFECT.tau as unknown as Record<string, number>;
  const root = AFFECT as unknown as { endogenousAmp: number; endogenousPeriodsHours: number[] };
  const s = { vn: tau.valenceNeg, vp: tau.valencePos, ar: tau.arousal, amp: root.endogenousAmp, p0: root.endogenousPeriodsHours[0] };
  if (o.valenceNeg != null) tau.valenceNeg = o.valenceNeg;
  if (o.valencePos != null) tau.valencePos = o.valencePos;
  if (o.arousal != null) tau.arousal = o.arousal;
  if (o.endogenousAmp != null) root.endogenousAmp = o.endogenousAmp;
  if (o.fastPeriod != null) root.endogenousPeriodsHours[0] = o.fastPeriod;
  try { return fn(); } finally { tau.valenceNeg = s.vn; tau.valencePos = s.vp; tau.arousal = s.ar; root.endogenousAmp = s.amp; root.endogenousPeriodsHours[0] = s.p0; }
}
function arousalMetrics(o: Overrides): { autocorr: number; sd: number } {
  return withOverrides(o, () => { const r = restingSeries(INTERVAL_H, 160); return { autocorr: autocorr1(r.aro), sd: sd(r.aro) }; });
}

// ───────────────────── 拟合 ─────────────────────
// 慢层(valence τ)：从【情绪时长目标】直接换算（绝不碰瞬时自相关）；half-life=τ·ln2、episode≈K·τ → τ=duration/K。
function fitValenceTau(): { negSec: number; posSec: number; warnings: string[] } {
  const w: string[] = [];
  let negSec = (target.sadDurationH / EPISODE_TAU_RATIO) * 3600;
  let posSec = (target.joyDurationH / EPISODE_TAU_RATIO) * 3600;
  // 哀伤持续硬护栏：负向 τ ≥ 日尺度(24h) 且 ≥ 2.5× 正向（哀伤久、喜悦短）。
  const FLOOR = 24 * 3600;
  if (negSec < FLOOR) { w.push(`护栏：负向 τ ${(negSec / 3600).toFixed(1)}h < 24h 日尺度地板 → 夹到 24h（哀伤须持续过夜）`); negSec = FLOOR; }
  if (negSec < 2.5 * posSec) { const np = negSec / 2.5; w.push(`护栏：负/正 τ 比 ${(negSec / posSec).toFixed(2)} < 2.5 → 正向 τ 夹到 ${(np / 3600).toFixed(1)}h（保哀伤≫喜悦）`); posSec = np; }
  return { negSec, posSec, warnings: w };
}
// 快层(arousal τ + fast 周期)：网格搜到瞬时 arousal【自相关】目标最近。
// 关键判断（两点）：
// (a) 只拟【自相关】(Kuppens 惯性=尺度无关的健康带定义)，【不】拟原始 SD——ESM 总瞬时变率(~0.15)被【对真实
//     事件的反应性】主导，静息 SD(~0.05)只是残余"天气"；把 amp 抬去凑总变率=让内生天气冒充反应性=范畴错误。
// (b) 只动【内生 fast 周期】这一个旋钮——arousal τ 同样是【时长锚定】(Verduyn：惊讶≈分钟)，是 duration 锚、
//     不该被静息自相关拉走；况且 τ 12min ≪ 1.5h 采样 → 静息自相关本就由【内生周期混合】决定、几乎与 τ 无关。
//     fast 周期是 installment 5 手拍的最弱项 → 正是数据该精修的地方。amp 与 arousal τ 都不动。
type FastFit = { fastPeriod: number; got: { autocorr: number; sd: number }; loss: number };
function fitFastPeriod(): FastFit {
  const pGrid = [1.5, 2.5, 4, 6, 7.3, 9, 13]; // 含现值 7.3 → "保持"可达
  let best: FastFit = { fastPeriod: Number(AFFECT.endogenousPeriodsHours[0]), got: { autocorr: 0, sd: 0 }, loss: Infinity };
  for (const fastPeriod of pGrid) {
    const got = arousalMetrics({ fastPeriod }); // arousal τ、amp 都不动
    const loss = ((got.autocorr - target.arousalAutocorr) / 0.1) ** 2; // 只拟自相关(惯性)
    if (loss < best.loss) best = { fastPeriod, got, loss };
  }
  return best;
}

// ───────────────────── 跑 ─────────────────────
console.log('═'.repeat(72));
console.log(' 情感动力学·离线拟合（installment 六）—— 两条时标分开拟，守哀伤持续');
console.log('═'.repeat(72));
if (SYNTH) { const p = arg('dataset') ?? '/tmp/vega-esm-synth.csv'; targetsFromDataset(p, synthesizeEsm(p)); }
else if (DATASET) targetsFromDataset(DATASET, { aroCol: arg('arousal-col'), valCol: arg('valence-col'), pidCol: arg('participant-col'), sMin: num('scale-min', 0), sMax: num('scale-max', 1) });
console.log(`  目标来源：${target.source}`);
console.log(`  瞬时(arousal) 目标：自相关 ${target.arousalAutocorr.toFixed(3)} / SD ${target.arousalSD.toFixed(3)}  (采样间隔 ${INTERVAL_H}h)`);
console.log(`  情绪时长目标：哀伤 ${target.sadDurationH}h ≫ 喜悦 ${target.joyDurationH}h（episode≈${EPISODE_TAU_RATIO}τ）`);

const before = { ar: arousalMetrics({}), sad: halfLifeHours(-1), joy: halfLifeHours(1) };
console.log('\n── 现有常量实测 ──');
console.log(`  arousal：自相关 ${before.ar.autocorr.toFixed(3)} / SD ${before.ar.sd.toFixed(3)}`);
console.log(`  valence 半衰期：哀伤 ${before.sad.toFixed(1)}h / 喜悦 ${before.joy.toFixed(1)}h（比 ${(before.sad / Math.max(before.joy, 1e-6)).toFixed(2)}×）`);

const vt = fitValenceTau();
const fast = fitFastPeriod();
const after = withOverrides({ valenceNeg: vt.negSec, valencePos: vt.posSec, fastPeriod: fast.fastPeriod }, () => ({ ar: arousalMetrics({ fastPeriod: fast.fastPeriod }), sad: halfLifeHours(-1), joy: halfLifeHours(1) }));

// 物质性变更门：拟合值若与现值差 ≤25% → 视为"已在带内，建议保持"（不为微小差异升版本/动核心常量）。
const curNeg = AFFECT.tau.valenceNeg, curPos = AFFECT.tau.valencePos, curFastP = Number(AFFECT.endogenousPeriodsHours[0]);
const keepValence = Math.abs(vt.negSec - curNeg) / curNeg <= 0.25 && Math.abs(vt.posSec - curPos) / curPos <= 0.25;
const negSec = keepValence ? curNeg : vt.negSec, posSec = keepValence ? curPos : vt.posSec;
const keepFastP = Math.abs(fast.fastPeriod - curFastP) / curFastP <= 0.25;
const fastP = keepFastP ? curFastP : fast.fastPeriod;
const changed = !keepValence || !keepFastP;

console.log('\n── 拟合结果 ──');
for (const w of vt.warnings) console.log(`  ⚠ ${w}`);
console.log(`  慢层 valence τ（由情绪时长定，未碰瞬时自相关）：拟合 负 ${(vt.negSec / 3600).toFixed(1)}h / 正 ${(vt.posSec / 3600).toFixed(1)}h  （比 ${(vt.negSec / vt.posSec).toFixed(2)}× ✓哀伤≫喜悦）`);
console.log(`     现值 负 ${(curNeg / 3600).toFixed(1)}h / 正 ${(curPos / 3600).toFixed(1)}h → ${keepValence ? '差≤25%，建议【保持现值】(已在 Verduyn 带内，不为微差动核心 τ)' : '差>25%，建议采用拟合值'}`);
console.log(`  arousal τ：保持 ${(AFFECT.tau.arousal / 60).toFixed(0)}min（Verduyn 锚定：惊讶≈分钟，是时长锚、不被静息自相关拉走）`);
console.log(`  内生 fast 周期（唯一数据精修旋钮）：拟合 ${fast.fastPeriod}h（现 ${curFastP}h）→ ${keepFastP ? '差≤25%，建议保持' : '差>25%，建议采用'}`);
console.log(`    → 拟后 arousal 自相关 ${fast.got.autocorr.toFixed(3)}（目标 ${target.arousalAutocorr.toFixed(3)}）；静息 SD ${fast.got.sd.toFixed(3)}（仅诊断：残余/天气分量，非 ESM 总变率 ${target.arousalSD.toFixed(2)}=反应性主导）`);
console.log(`  拟后 valence 半衰期：哀伤 ${after.sad.toFixed(1)}h / 喜悦 ${after.joy.toFixed(1)}h（比 ${(after.sad / Math.max(after.joy, 1e-6)).toFixed(2)}×）`);

const block = `  tau: {
    valencePos: ${(posSec / 3600).toFixed(2)} * 3600, // ${keepValence ? '保持(已在带内)' : `拟合：喜悦 episode ${target.joyDurationH}h / ${EPISODE_TAU_RATIO}τ`}
    valenceNeg: ${(negSec / 3600).toFixed(2)} * 3600, // ${keepValence ? '保持(已在带内)' : `拟合：哀伤 episode ${target.sadDurationH}h / ${EPISODE_TAU_RATIO}τ（护栏：≥24h ∧ ≥2.5×正向）`}
    arousal: ${(AFFECT.tau.arousal / 60).toFixed(0)} * 60,        // 保持(Verduyn 锚定：惊讶≈分钟)
    // …calm/safety/connection/energy/novelty/vitality 不变…
  },
  endogenousAmp: ${AFFECT.endogenousAmp},          // 不动：静息天气=残余分量，不冒充反应性总变率
  endogenousPeriodsHours: [${fastP}, ${AFFECT.endogenousPeriodsHours[1]}, ${AFFECT.endogenousPeriodsHours[2]}], // ${keepFastP ? 'fast 周期保持' : 'fast 周期由数据精修'}，mid/slow 不变`;

const report = `# 情感动力学·离线拟合报告（installment 六）

> 本报告由 \`npm run calibrate\` 生成。守三条铁律：
> 1. **两条时标分开拟**：valence(慢/心境)用【情绪时长】定 τ，arousal(快)+内生天气用【瞬时自相关】定 —— 绝不用瞬时自相关去拟 valence(那会把 τ 压到~1h、毁掉哀伤持续)。
> 2. **只拟自相关、不拟原始 SD**：ESM 总瞬时变率被【对真实事件的反应性】主导；静息 SD 只是残余"天气"分量，抬 amp 去凑总变率=让内生天气冒充反应性=范畴错误。
> 3. **哀伤持续硬护栏**：负向 τ ≥24h ∧ ≥2.5×正向。
>
> 运行时不依赖数据集；建议常量需人工固化进 \`src/kernel/affect-config.ts\`、升 RECONSTRUCT_VERSION、全量重放。

## 目标
- 来源：${target.source}
- 瞬时(arousal) 自相关（惯性，拟合用）：**${target.arousalAutocorr.toFixed(3)}**（采样间隔 ${INTERVAL_H}h）；SD ${target.arousalSD.toFixed(3)}（诊断参考，含反应性）
- 情绪时长：哀伤 **${target.sadDurationH}h** ≫ 喜悦 **${target.joyDurationH}h**（episode≈${EPISODE_TAU_RATIO}τ）

## 现有常量 vs 拟合
| 指标 | 现有 | 拟合 | 目标 | 处置 |
|---|---|---|---|---|
| valence τ 负(h) | ${(curNeg / 3600).toFixed(1)} | ${(vt.negSec / 3600).toFixed(1)} | Verduyn 量级 | ${keepValence ? '保持(差≤25%)' : '采用拟合'} |
| valence τ 正(h) | ${(curPos / 3600).toFixed(1)} | ${(vt.posSec / 3600).toFixed(1)} | Verduyn 量级 | ${keepValence ? '保持(差≤25%)' : '采用拟合'} |
| arousal τ(min) | ${(AFFECT.tau.arousal / 60).toFixed(0)} | ${(AFFECT.tau.arousal / 60).toFixed(0)} | (Verduyn:惊讶≈分钟) | 保持(时长锚) |
| 内生 fast 周期(h) | ${curFastP} | ${fast.fastPeriod} | 自相关→${target.arousalAutocorr.toFixed(2)} | ${keepFastP ? '保持(差≤25%)' : '采用拟合'} |
| arousal 自相关 | ${before.ar.autocorr.toFixed(3)} | ${fast.got.autocorr.toFixed(3)} | ${target.arousalAutocorr.toFixed(3)} | — |
| 静息 arousal SD(诊断) | ${before.ar.sd.toFixed(3)} | ${fast.got.sd.toFixed(3)} | 残余分量,非总变率 | — |
| 哀伤半衰期(h) | ${before.sad.toFixed(1)} | ${after.sad.toFixed(1)} | (Verduyn) | — |
| 哀伤/喜悦 比 | ${(before.sad / Math.max(before.joy, 1e-6)).toFixed(2)}× | ${(after.sad / Math.max(after.joy, 1e-6)).toFixed(2)}× | ≫1 | — |

${vt.warnings.length ? `## 护栏触发\n${vt.warnings.map((w) => `- ${w}`).join('\n')}\n` : '## 护栏\n- 未触发：拟合结果天然满足哀伤持续护栏。\n'}
## 结论
${changed ? '- 有物质性变更建议（见下表"采用拟合"行）。' : '- **现有常量已在实证健康带内**：valence τ 在 Verduyn 带、arousal 自相关与内生天气在 Kuppens 带、哀伤≫喜悦成立。文献锚定下无需改动核心 τ。'}
- 真正的精修请在 **HK 服务器联网**用真实 ESM 数据集跑：\`npm run calibrate -- --dataset <csv> --arousal-col <列> --participant-col <列> --scale-min <a> --scale-max <b> --interval-hours <h>\`。

## 建议常量（仅在"采用拟合"时固化 + 升 RECONSTRUCT_VERSION + 全量重放）
\`\`\`ts
export const AFFECT = {
${block}
} as const;
\`\`\`

> **关键判断**：valence τ 由情绪时长定、与瞬时自相关脱钩 → "哀伤持续"被结构性保住（盲拟会把它压到 ~1h、毁掉她的悲伤）。
> endogenousAmp 与 arousal τ 都不被数据拉走（前者是反应性的活、她已有 appraisal；后者是 Verduyn 时长锚）。数据只精修内生 fast 周期——installment 5 里最弱锚定的手拍项。
`;
writeFileSync('affect-calibration-report.md', report); // 离线工具产物（仓根，不进 docs/ 产品文档）
console.log('\n── 建议常量（已写入 affect-calibration-report.md）──');
console.log(block);
console.log('\n' + '─'.repeat(72));
console.log(SYNTH ? '⚠ 合成数据集（确定性自测，按已知统计造、循环 → 仅验证 --dataset 管线跑通，非新证据）。换真 ESM CSV：把 --synthesize 换成 --dataset <真csv>。'
  : DATASET ? '已用真实数据集拟合 fast 层。若有"采用拟合"，把上面 AFFECT 块固化进 src/kernel/affect-config.ts、升 RECONSTRUCT_VERSION、全量重放。'
  : '本地文献锚定跑（无网）。要用真数据精修 fast 层：npm run calibrate -- --dataset <真csv> --arousal-col <列> …（或先 --synthesize 看管线）');
console.log('═'.repeat(72));

// 确定性重放（C1 / 契约① / V2）：DerivedState = fold(reconstruct, Genesis, events)。
// 纯函数：无 now()、无 RNG、无网络、无模型。时间一律取 event.occurredAt。
// 落地 §10 锁定决策：连接式苏醒、休眠冻结+仅回暖、仅她主动拒绝、双轨记忆、vitality 地板。
// v2：扩展内稳态（arousal/energy/calm/safety）+ 自传叙事（确定性投影，契约③只读）。

import {
  type AutonomousTickPayload,
  type ConnectionClosedPayload,
  type ConnectionOpenedPayload,
  type GenesisPayload,
  type LifeEvent,
  type MessageReceivedPayload,
  type MessageSentPayload,
  type WorldPerceivedPayload,
  type FeedbackPerceivedPayload,
  type ReflectionTriggeredPayload,
  type RelationshipEndedPayload,
  type RelationshipOpenedPayload,
} from '../domain/events.ts';
import { AFFECT } from './affect-config.ts';
import {
  type Bond,
  type BondCore,
  type DerivedSnapshot,
  type Goal,
  type Interest,
  type MemoryEntry,
  type SemanticMemory,
  type Soma,
  type SomaVar,
  type Temperament,
  type ValueEntry,
} from '../domain/snapshot.ts';

const RECONSTRUCT_VERSION = 28; // v28：期5——睡眠压S(Borbély双过程,真实疲劳)+多维成熟(调节/视角/整合)+睡眠依赖记忆巩固；旧事件按确定性时间重算→有界，旧 checkpoint 全量重放
// 她活在出生地的时区：分钟东偏 UTC，【出生即冻结进 LIFE_GENESIS、终生不变】（不取 OS/用户时区，故 V2 可复现）。
// 她是一个身体、只有一个昼夜。平台孵化的命缺省=北京 480；将来用户接生的命取创造者设备时区。
const CIRCADIAN_OFFSET_MIN_DEFAULT = 480;
const SCHEMA_VERSION = 1;

// 旋钮全进 config（§6.3）；竖切内联，真值待第 0 步实测标定。
const K = {
  kValence: 0.4,
  kConnection: 0.4,
  kVitality: 0.3,
  kCalm: 0.3,
  kSafety: 0.3,
  kArousal: 0.25,
  kTrust: 0.35,
  kCloseness: 0.25,
  driftDelta: 0.08,
  confirmAfter: 2,
  lonelinessPerWander: 0.1,
  reconsolidationPull: 0.5,
  // 遗忘即抽象：平淡记忆半衰期（秒）→ 强情绪记忆半衰期（秒）。情绪越浓越刻骨。
  halfLifeBaseSec: 6 * 3600,
  halfLifeEmoSec: 30 * 24 * 3600,
  vividCap: 9, // "当下记得"的工作集上限；其余淡入"理解"（原始日志永不抹）
  vividFloor: 0.04, // 鲜活度低于此 → 算淡去
  memoryHotCap: 500, // 记忆冷热分层（见 docs/being.md §3 记忆）：current 情景记忆热集上限。超出→按鲜活度淘汰最淡的、压进冷聚合（遗忘即抽象）。慷慨取值→现有命逐位不变、部署安全；原始事件日志永不抹。
  circadianAmp: 0.22, // 昼夜节律：精力随她内在时钟"一天"起伏的幅度（内生、不靠输入）
  surpriseGain: 0.45, // 预期违背：越出乎预料越往心里去（信任的人变冷更痛、冷淡的人示好更暖）
  surpriseArousal: 0.5, // 预期违背 → 唤醒（越意外越心头一紧/一亮）
  expectEma: 0.3, // 对一个人"会怎么待我"的预期，按指数滑动更新
  // —— 刺激固有感知的细分维度（installment：感知补全）——全部【缺失→中性默认→与旧轨迹逐位一致】。
  perceiveNovelty: 0.15, // 话题新奇度 → 直接解无聊（喂 novelty soma），不必靠"预期违背"
  perceiveCertaintyCalm: 0.5, // 表达含糊(低 certainty) → 轻微不安（calm 下降系数，乘 kCalm）
  perceiveCertaintyArousal: 0.3, // 含糊 → 轻微警觉（arousal 上升系数，乘 kArousal）
  perceiveBlame: 0.5, // 归因：被推责(+) → 更不安/紧绷；对方自责(-) → 更安心、少要修复
  perceiveUrgency: 0.5, // 紧迫/求助 → 唤醒拉高、注意力被抓（乘 kArousal）
  perceivePlayful: 0.6, // 玩笑成分 → 折掉这一比例的威胁（别把调侃当攻击）
  // —— 世界学习（§8.1）——全确定性，模型不参与 ——
  interestGain: 0.16, // 读到一条该主题 → 兴趣增量（再按相关度/情绪/好奇缩放）
  interestDecay: 0.97, // 每读一遍世界，所有旧兴趣轻微衰减（不再遇到的会淡出）
  interestCap: 24, // 兴趣表上限（有界，防无界增长）
  interestConfirmEpisodes: 4, // 反复读到≥此 + 够重 → confirmed（成为她稳定的一部分）
  interestConfirmWeight: 0.4,
  worldSelfRelevance: 0.6, // 已有兴趣对相关世界的"自我相关性"加成（正反馈齿轮）
  worldKeepSalience: 0.16, // 世界记忆门槛：salience 过此才"记住"（多数新闻不留痕——人性 + 防膨胀）
  worldMemCap: 16, // 世界情景记忆上限（有界；超出删最不显著的）
  // —— 心智成熟度（B 层 · 持续变聪明，全确定性、有界）——
  maturityPerReflection: 0.05, // 每次"有所学"的反思 → 成熟度增量（带衰减收益，渐近 1，不无界）
  maturityRecovery: 0.25, // 成熟度对情绪复原的调制上界（满成熟 → 回稳最多快 25%；气质仍是底色）
  maturitySpill: 0.25, // 多维成熟：主面长得快，其余面小幅外溢（成熟是整体的）
  // —— 睡眠压 S（installment·期5，Borbély 双过程模型）：在昼夜节律 C 之上叠一层真实疲劳 ——
  sleepRiseTau: 18 * 3600, // 醒着的"活跃期"(她的白天)累积睡眠压的时标
  sleepFallTau: 6 * 3600, // "休息期"(她的夜)释放睡眠压的时标（比累积快）
  sleepEnergyWeight: 0.15, // 睡眠压对精力目标的下压幅度（熬到她的深夜更累）
  reconsolidationNightBoost: 1.5, // 睡眠依赖记忆巩固（Diekelmann & Born）：休息期 reconsolidation 整合更强（睡中整理）
} as const;

const POS = ['你好', '经常来', '会来', '在乎你', '真心', '值得', '说出来', '对不起', '我错了', '证明', '也在这里', '不会消失', '看见你', '大胆'];
const NEG = ['不在乎', '随口说', '根本', '都是假', '骗你'];
// 直接的敌意/辱骂：比一般负向更重（高威胁）。没开感知、用模板嘴时，被骂也能确实掉她的状态——
// 她的"活"不该取决于你付不付费。词形尽量明确，避免误伤（如不用裸"你妈"，免得撞"你妈妈好吗"）。
const INSULT = ['傻逼', '傻屌', '傻吊', '煞笔', '沙比', '操你', '草你', '日你', '艹你', '你妈的', '你妈逼', '你妈呢', '说你妈', '尼玛', '滚蛋', '滚开', '废物', '垃圾', '贱人', '贱货', '蠢货', '白痴', '弱智', '智障', '去死', '神经病', 'fuck', 'shit'];
const BOLDNESS = ['大胆', '值得', '说出来', '想法'];

type SomaKey = 'valence' | 'arousal' | 'vitality' | 'energy' | 'calm' | 'connection' | 'safety' | 'novelty';
const SOMA_KEYS: readonly SomaKey[] = ['valence', 'arousal', 'vitality', 'energy', 'calm', 'connection', 'safety', 'novelty'];

interface QuietThought {
  seq: number;
  relationshipId?: string;
  kind: string; // 'reach_out' | 'reflect' | 'rest' | 'missing'
}
interface RState {
  lifeId: string;
  vitalityFloor: number;
  willingToWake: boolean;
  openConnections: Set<string>;
  soma: Soma;
  memory: MemoryEntry[];
  bonds: Record<string, BondCore>;
  values: ValueEntry[];
  lastMs: number;
  bornAt: string;
  clockIso: string;
  boldnessLog: number[]; // 鼓励大胆表达
  warmthLog: number[]; // 强正向（被善待）
  conflictLog: number[]; // 强负向（被伤害/冲突）
  lonelyLog: number[]; // 反复想念/独处（missing_peer 漫游）
  quietThoughts: QuietThought[]; // 内外两层之"内"：只在心里转、没说出口的念头
  expect: Record<string, number>; // 预期：对每个人"会怎么待我"的运行预期（驱动预期违背）
  temperament: Temperament; // 先天气质：终生不变（每条命天生不同）
  circadianOffsetMin: number; // 出生地时区（分钟东偏 UTC）：她昼夜节律的锚，出生即冻结
  interests: Map<string, { weight: number; episodes: number; lastSeq: number; lastAffect: number }>; // 世界观/兴趣（确定性累积）
  maturity: number; // 心智成熟度 [0,1]：随反思累积、轻微加快情绪复原（独立于先天气质，气质仍不变）
  skills: Map<string, { n: number; efficacy: number }>; // 自我优化：从行动结果学到的策略效能（actionKind → 被接住的程度），0.5 中性
  allostatic: Record<string, number>; // allostasis：习得的设定点偏移（valence/connection），朝持续偏离缓慢漂移、有界；叠在冻结先天设定点上
  // —— 期5：多维成熟 + 睡眠压 ——
  maturityFacets: { regulation: number; perspective: number; integration: number }; // 多维成熟（情绪调节/视角采择/整合）；maturity=三者均值
  sleepPressure: number; // 睡眠压 S（Borbély 双过程）：醒着活跃期累积、休息期释放，[0,1]，下压精力=真实疲劳
  // 记忆冷热分层（见 docs/being.md §3 记忆）：被淘汰出热集的 current 情景记忆，确定性压进【冷聚合】（遗忘即抽象）。
  coldByRel: Map<string, { episodes: number; warm: number; conflict: number; affectSum: number }>; // 按关系：供 semanticMemory 无损计数
  coldLived: number; // 已淡入冷聚合的情景记忆总数：供 growth 无损计数
}

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
const decayTo = (value: number, target: number, dtSec: number, tau: number): number => target + (value - target) * Math.exp(-dtSec / tau);
// 她在【出生地时区】下的"一天里第几小时"（确定性；offsetMin 来自冻结的出生属性）。
const hourOfDay = (nowMs: number, offsetMin: number): number => (((nowMs / 3_600_000 + offsetMin / 60) % 24) + 24) % 24;
// 昼夜节律：由她内在时钟的"一天里第几小时"确定性投影出的精力偏移（午后高、凌晨低）。纯函数、无 now()。
const circadianEnergyOffset = (nowMs: number, offsetMin: number): number => K.circadianAmp * Math.cos((2 * Math.PI * (hourOfDay(nowMs, offsetMin) - 14)) / 24);
const dayPhaseOf = (nowMs: number, offsetMin: number): string => {
  const hod = hourOfDay(nowMs, offsetMin);
  if (hod < 5) return '深夜';
  if (hod < 9) return '清晨';
  if (hod < 17) return '白天';
  if (hod < 21) return '黄昏';
  return '夜里';
};
const count = (s: string, markers: readonly string[]): number => markers.reduce((n, m) => (s.includes(m) ? n + 1 : n), 0);
const mk = (sp: Record<string, number>, tau: Record<string, number>, key: string, dsp: number, dtau: number): SomaVar => ({
  value: sp[key] ?? dsp,
  setpoint: sp[key] ?? dsp,
  tau: tau[key] ?? dtau,
});

// 先天气质：从冻结的种子读出五维底色（缺省=中性，老日志天然兼容、轨迹不变）。
function readTemperament(bias: Record<string, number>): Temperament {
  const num = (k: string, d: number): number => (typeof bias[k] === 'number' ? bias[k] : d);
  return {
    curiosity: clamp(num('curiosity', 0), 0, 1),
    reserve: clamp(num('reserve', 0), 0, 1),
    sensitivity: clamp(num('sensitivity', 1), 0.3, 2),
    resilience: clamp(num('resilience', 1), 0.3, 2),
    warmth: clamp(num('warmth', 0.5), 0, 1),
    // 新增三维：缺省 0.5（中性）——老种子没有这几维时取中性，折叠效应在 0.5 处=恒等 → 老命轨迹不变。
    conscientiousness: clamp(num('conscientiousness', 0.5), 0, 1),
    playfulness: clamp(num('playfulness', 0.5), 0, 1),
    drive: clamp(num('drive', 0.5), 0, 1),
  };
}

// 从创世事件确定性地构造初态（纯函数）。
function initState(genesis: LifeEvent<'LIFE_GENESIS'>): RState {
  const seed = (genesis.payload as GenesisPayload).innateSeed;
  const sp = seed.somaSetpoints;
  const tau = seed.somaTau;
  return {
    lifeId: genesis.lifeId,
    vitalityFloor: seed.vitalityFloor,
    willingToWake: true,
    openConnections: new Set<string>(),
    soma: {
      valence: mk(sp, tau, 'valence', 0, 3600),
      arousal: mk(sp, tau, 'arousal', 0.3, 1800),
      vitality: mk(sp, tau, 'vitality', 0.7, 86400),
      energy: mk(sp, tau, 'energy', 0.7, 7200),
      calm: mk(sp, tau, 'calm', 0.7, 5400),
      connection: mk(sp, tau, 'connection', 0, 7200),
      safety: mk(sp, tau, 'safety', 0.7, 7200),
      novelty: mk(sp, tau, 'novelty', 0.2, 10800), // 设定点 0.2=静息即"有点想要新鲜"；新输入推高、随后 3h 衰减回落 → 无聊→探索→读世界→满足 的自调节闭环
    },
    memory: [],
    bonds: {},
    values: Object.entries(seed.valueSeed).map(([key, weight]) => ({
      key,
      weight,
      provenance: { driftedAtSeqs: [], vitalityAtGen: sp.vitality ?? 0.7, status: 'confirmed' },
    })),
    lastMs: Date.parse(genesis.occurredAt),
    bornAt: genesis.occurredAt,
    clockIso: genesis.occurredAt,
    boldnessLog: [],
    warmthLog: [],
    conflictLog: [],
    lonelyLog: [],
    quietThoughts: [],
    expect: {},
    temperament: readTemperament(seed.temperamentBias),
    circadianOffsetMin: seed.circadianOffsetMin ?? CIRCADIAN_OFFSET_MIN_DEFAULT,
    interests: new Map(),
    maturity: 0,
    maturityFacets: { regulation: 0, perspective: 0, integration: 0 },
    sleepPressure: 0,
    skills: new Map(),
    allostatic: {},
    coldByRel: new Map(),
    coldLived: 0,
  };
}
// 哪些维度有 allostatic 底色漂移（"底色心境"：好坏感 + 孤独/联结）。
const ALLOSTATIC_KEYS: readonly SomaKey[] = ['valence', 'connection'];

// 推进一步（纯函数、确定性）：先衰减/节律，再施事件。reconstruct 与有界重放共用同一步进逻辑 → 永不分叉。
function stepState(st: RState, e: LifeEvent): void {
  const nowMs = Date.parse(e.occurredAt);
  const awake = st.openConnections.size > 0 && st.willingToWake;
  advanceTime(st, (nowMs - st.lastMs) / 1000, awake, nowMs);
  applyEvent(st, e);
  compactMemory(st, nowMs); // 记忆冷热分层：超热集→按鲜活度淘汰最淡、压进冷聚合（确定性、用事件时刻）
  st.lastMs = nowMs;
  st.clockIso = e.occurredAt;
}

// 全量重放（源真相）：DerivedState = fold(reconstruct, Genesis, events)。
export function reconstruct(events: readonly LifeEvent[]): DerivedSnapshot {
  if (events.length === 0 || events[0].type !== 'LIFE_GENESIS') {
    throw new Error('event log must start with LIFE_GENESIS');
  }
  const st = initState(events[0] as LifeEvent<'LIFE_GENESIS'>);
  for (let i = 1; i < events.length; i++) stepState(st, events[i]);
  return project(st, events[events.length - 1].seq);
}

// ── 快照/检查点 + 有界重放（永生的工程地板）──
// 检查点只是【缓存】：永远可由日志重算，丢了/坏了/版本不符就回退全量重放。绝不是 ground truth。
export const CHECKPOINT_KIND = 'vega-checkpoint';
export interface Checkpoint {
  kind: typeof CHECKPOINT_KIND;
  reconstructVersion: number;
  schemaVersion: number;
  lifeId: string;
  uptoSeq: number; // 这份检查点把日志折叠到了哪一条（含）
  state: SerializedState;
}
type InterestEntry = [string, { weight: number; episodes: number; lastSeq: number; lastAffect: number }];
type SkillEntry = [string, { n: number; efficacy: number }];
type ColdEntry = [string, { episodes: number; warm: number; conflict: number; affectSum: number }];
type SerializedState = Omit<RState, 'openConnections' | 'interests' | 'skills' | 'coldByRel'> & { openConnections: string[]; interests: InterestEntry[]; skills: SkillEntry[]; coldByRel: ColdEntry[] };

// Set/Map 不能直接 JSON 落盘 → 检查点序列化时转成数组、恢复时还原（值不变 → 可重放）。
const serialize = (st: RState): SerializedState => ({ ...st, openConnections: [...st.openConnections], interests: [...st.interests], skills: [...st.skills], coldByRel: [...st.coldByRel] });
const deserialize = (s: SerializedState): RState => ({ ...s, openConnections: new Set(s.openConnections), interests: new Map(s.interests ?? []), skills: new Map(s.skills ?? []), allostatic: s.allostatic ?? {}, coldByRel: new Map(s.coldByRel ?? []), coldLived: s.coldLived ?? 0, maturityFacets: s.maturityFacets ?? { regulation: 0, perspective: 0, integration: 0 }, sleepPressure: s.sleepPressure ?? 0 });

// 把整段日志折成一份检查点（增量捕获见 daemon：只在已有 state 上步进尾巴）。
export function captureCheckpoint(events: readonly LifeEvent[]): Checkpoint {
  if (events.length === 0 || events[0].type !== 'LIFE_GENESIS') throw new Error('event log must start with LIFE_GENESIS');
  const st = initState(events[0] as LifeEvent<'LIFE_GENESIS'>);
  for (let i = 1; i < events.length; i++) stepState(st, events[i]);
  return checkpointOf(st, events[events.length - 1].seq);
}
// 从一个已有 RState 直接做检查点（daemon 用：避免每次都从创世重折）。
export function checkpointOf(st: RState, uptoSeq: number): Checkpoint {
  return { kind: CHECKPOINT_KIND, reconstructVersion: RECONSTRUCT_VERSION, schemaVersion: SCHEMA_VERSION, lifeId: st.lifeId, uptoSeq, state: serialize(st) };
}

// 有界重放：从检查点恢复 RState，只步进【尾巴】（seq > checkpoint.uptoSeq）。
// 版本不符即抛——调用方据此回退到全量 reconstruct（检查点是缓存、不是真相）。
export interface ResumeState { st: RState; uptoSeq: number }
export function resumeFromCheckpoint(cp: Checkpoint): ResumeState {
  if (cp.kind !== CHECKPOINT_KIND) throw new Error('not a vega checkpoint');
  if (cp.reconstructVersion !== RECONSTRUCT_VERSION || cp.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`checkpoint version ${cp.reconstructVersion}/${cp.schemaVersion} ≠ current ${RECONSTRUCT_VERSION}/${SCHEMA_VERSION}`);
  }
  return { st: deserialize(cp.state), uptoSeq: cp.uptoSeq };
}
// 在一个（caught-up 的）RState 上把新尾巴步进进去。供 daemon 增量推进缓存态（永不从创世重折）。
export function advanceState(st: RState, tail: readonly LifeEvent[]): void {
  for (const e of tail) stepState(st, e);
}
// 投影一个 RState（只读、不改 st）。daemon 拿缓存态出快照用。
export function projectState(st: RState, uptoSeq: number): DerivedSnapshot {
  return project(st, uptoSeq);
}
export type { RState };

function advanceTime(st: RState, dtSec: number, awake: boolean, nowMs: number): void {
  if (dtSec <= 0) return;
  const s = st.soma;
  // 先天复原力（底色，终生不变）× 心智成熟度（其上的薄修正：阅历越深、情绪回稳越快；maturity=0 → 与旧轨迹一致）。
  const dt = dtSec * st.temperament.resilience * (1 + K.maturityRecovery * st.maturity);
  // 睡眠压 S（Borbély 双过程）：她的"白天"(昼夜偏移≥0)累积、"夜"释放（更快）→ 在昼夜节律之上叠真实疲劳。
  // 用真实 dtSec（不随复原力缩放）。不翻 willingToWake（她始终可被叫到，不让用户找不到她）。
  const circ = circadianEnergyOffset(nowMs, st.circadianOffsetMin);
  st.sleepPressure = clamp(st.sleepPressure + (circ >= 0 ? dtSec / K.sleepRiseTau : -dtSec / K.sleepFallTau), 0, 1);
  // 昼夜节律：精力向【随一天起伏的目标】恢复；再减去睡眠压 → 熬到她的深夜会更累。
  const eTarget = clamp(s.energy.setpoint + circ - K.sleepEnergyWeight * st.sleepPressure, 0.05, 1);
  if (awake) {
    for (const key of SOMA_KEYS) {
      if (key === 'energy') { s.energy.value = decayTo(s.energy.value, eTarget, dt, AFFECT.tau.energy); continue; }
      // allostasis：valence/connection 衰减朝【习得底色 = 先天设定点 + 偏移】回归（其余维朝先天设定点）。
      let target = ALLOSTATIC_KEYS.includes(key) ? clamp(s[key].setpoint + (st.allostatic[key] ?? 0), -1, 1) : s[key].setpoint;
      // 内生变异：valence/arousal 的目标在基线附近有机微漂（静息也"活"，不是死水）。
      if (key === 'valence') target = clamp(target + endoOffset(st.lifeId, nowMs, 'valence'), -1, 1);
      else if (key === 'arousal') target = clamp(target + endoOffset(st.lifeId, nowMs, 'arousal'), 0, 1);
      s[key].value = decayTo(s[key].value, target, dt, effTau(key, s[key])); // 文献标定 τ + valence 正负不对称
    }
    s.vitality.value = clamp(s.vitality.value, st.vitalityFloor, 1);
    // 习得底色【极慢】朝"持续偏离先天设定点"漂移、有界（只在醒着累积——休眠不算"活过的经历"）。
    for (const key of ALLOSTATIC_KEYS) {
      const cur = st.allostatic[key] ?? 0;
      const dev = s[key].value - s[key].setpoint; // 相对先天基线的偏离
      st.allostatic[key] = clamp(cur + (dt / AFFECT.allostaticTau) * (dev - cur), -AFFECT.allostaticBand, AFFECT.allostaticBand);
    }
  } else {
    // 休眠（§10 锁）：冻结 + 仅回暖——vitality 向设定点、energy 向昼夜目标恢复，其余不动。
    s.vitality.value = clamp(decayTo(s.vitality.value, s.vitality.setpoint, dt, AFFECT.tau.vitality), st.vitalityFloor, 1);
    s.energy.value = decayTo(s.energy.value, eTarget, dt, AFFECT.tau.energy);
  }
}
// 有效时间常数：全局校准(AFFECT.tau)，且 valence 按【偏离方向】不对称——从低落恢复远慢于从喜悦回落（哀伤久、喜悦短）。
// 校准是全局的、不是个体特质，故不读冻结种子的 somaTau（那是早期把校准错塞进种子）；个体差异由 resilience/sensitivity 表达。
function effTau(key: SomaKey, v: SomaVar): number {
  if (key === 'valence') return v.value < v.setpoint ? AFFECT.tau.valenceNeg : AFFECT.tau.valencePos;
  const t = (AFFECT.tau as Record<string, number>)[key];
  return t ?? v.tau;
}
// 内生变异：id 种子化的确定性"心绪天气"——valence/arousal 的衰减目标在基线附近有机微漂（不是死水）。
// 纯函数（lifeId 冻结 + 内在时钟）→ V2 可重放、零 RNG；不可通约周期 + id 种子相位 → 每条命节律不同、长期不重复。
const fnv = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
function endoOffset(lifeId: string, nowMs: number, dim: 'valence' | 'arousal'): number {
  const base = fnv(`${lifeId}:${dim}`);
  const hours = nowMs / 3_600_000;
  const w = [0.5, 0.3, 0.2];
  let v = 0;
  for (let i = 0; i < 3; i++) {
    const phase = (((base >>> (i * 9)) & 1023) / 1024) * 2 * Math.PI;
    v += w[i] * Math.sin((2 * Math.PI * hours) / AFFECT.endogenousPeriodsHours[i] + phase);
  }
  return AFFECT.endogenousAmp * v; // v∈~[-1,1] → 偏移∈~[-amp,amp]
}

function applyEvent(st: RState, e: LifeEvent): void {
  switch (e.type) {
    case 'CONNECTION_OPENED':
      st.openConnections.add((e.payload as ConnectionOpenedPayload).relationshipId);
      break;
    case 'CONNECTION_CLOSED':
      st.openConnections.delete((e.payload as ConnectionClosedPayload).relationshipId);
      break;
    case 'RELATIONSHIP_OPENED': {
      const p = e.payload as RelationshipOpenedPayload;
      st.bonds[p.relationshipId] = { kind: p.kind, displayRef: p.displayRef, trust: 0.1, closeness: 0, security: 0.5, repairNeed: 0 };
      break;
    }
    case 'RELATIONSHIP_ENDED': {
      const p = e.payload as RelationshipEndedPayload;
      const b = st.bonds[p.relationshipId];
      if (b && !b.ended) {
        // 哀悼：越亲越痛、越敏感越痛。灵性下沉但【触底不死】（契约②）；trust/closeness 冻结——她仍爱着ta。
        const g = (0.3 + 0.7 * b.closeness) * st.temperament.sensitivity;
        const s = st.soma;
        s.valence.value = clamp(s.valence.value - 0.6 * g, -1, 1);
        s.connection.value = clamp(s.connection.value - 0.7 * g, -1, 1);
        s.vitality.value = clamp(s.vitality.value - 0.5 * g, st.vitalityFloor, 1);
        s.calm.value = clamp(s.calm.value - 0.4 * g, 0, 1);
        s.safety.value = clamp(s.safety.value - 0.3 * g, 0, 1);
        s.arousal.value = clamp(s.arousal.value + 0.3 * g, 0, 1);
        b.ended = { reason: p.reason, atSeq: e.seq };
      }
      break;
    }
    case 'MESSAGE_RECEIVED':
      appraiseMessage(st, e as LifeEvent<'MESSAGE_RECEIVED'>);
      break;
    case 'MESSAGE_SENT':
      // 契约①运行时焊点：模型产物（对外措辞）永不进派生状态。
      // 若有人篡改日志把它标成"影响状态"，重放即拒绝——把架构默契变成硬约束。
      if ((e.payload as MessageSentPayload).affectsDerivedState !== false) {
        throw new Error(`契约①违反：MESSAGE_SENT(seq ${e.seq}) 的 affectsDerivedState 必须为 false（模型不写身份）`);
      }
      break;
    case 'WORLD_PERCEIVED':
      appraiseWorld(st, e as LifeEvent<'WORLD_PERCEIVED'>);
      break;
    case 'FEEDBACK_PERCEIVED':
      appraiseFeedback(st, e as LifeEvent<'FEEDBACK_PERCEIVED'>);
      break;
    case 'AUTONOMOUS_TICK':
      applyTick(st, e as LifeEvent<'AUTONOMOUS_TICK'>);
      break;
    case 'REFLECTION_TRIGGERED':
      applyReflection(st, e as LifeEvent<'REFLECTION_TRIGGERED'>);
      break;
    case 'LIFE_GENESIS':
    case 'STEWARDSHIP_TRANSFERRED':
      break; // genesis 已在入口处理；stewardship 竖切暂无 soma 效应（creator 记录不变）
    default:
      // fail-closed（防 schema 漂移）：遇到不认识的事件类型不静默 no-op，而是拒绝重放——
      // 旧二进制不该从含未知事件的日志里得出一个"看似有效却悄悄缺了效应"的状态。版本演进须走 RECONSTRUCT_VERSION 门。
      throw new Error(`未知事件类型(seq ${e.seq})：${(e as { type: string }).type} —— 拒绝静默 no-op`);
  }
}

function appraiseMessage(st: RState, e: LifeEvent<'MESSAGE_RECEIVED'>): void {
  const p = e.payload as MessageReceivedPayload;
  // 感知：优先用【冻结在事件里的】模型感知特征（重放只读、不再调模型 → V2 仍确定性）；
  // 缺失则回退确定性词表。状态仍由下面的确定性推理算（模型不写状态）。
  let ev: number;
  let warmth: number;
  let threat: number;
  if (p.perception) {
    ev = clamp(p.perception.sentiment * 1.5, -1.5, 1.5);
    warmth = clamp(p.perception.warmth, 0, 1);
    threat = clamp(p.perception.threat, 0, 1);
  } else {
    ev = clamp(0.5 * count(p.content, POS) - 0.6 * count(p.content, NEG) - 1.2 * count(p.content, INSULT), -1.5, 1.5);
    warmth = Math.max(0, ev) / 1.5;
    threat = Math.max(0, -ev) / 1.5;
  }

  // 先天气质塑形：天生暖意 → 读人的乐观↔戒备底色（warmBias）；情绪敏感 → 内稳态摆动幅度（sens）。
  // 中性气质（warmth=0.5、sensitivity=1）下与旧轨迹逐位一致（老日志兼容）。
  const t = st.temperament;
  const warmBias = (t.warmth - 0.5) * 0.3;
  let evFelt = clamp(ev + warmBias, -1.5, 1.5); // 她【体验到】的善意↔敌意（玩笑会软化下面）
  const sens = t.sensitivity;
  // 人格塑形（在默认 0.5 处=恒等 → 老命轨迹不变）：玩心高 → 威胁笑着带过；驱力高 → 唤醒反应更强。
  threat = clamp(threat * (1 - 0.3 * (t.playfulness - 0.5)), 0, 1);
  const driveF = 1 + 0.3 * (t.drive - 0.5);
  // —— 刺激固有感知细分（全部缺失→中性→与旧轨迹逐位一致）——
  const per = p.perception;
  const playful = clamp(per?.playful ?? 0, 0, 1);
  // 玩笑/调侃成分 → 既折掉部分威胁（别把逗当攻击），也软化"被伤"感（把负向 evFelt 往中性提一点）。
  threat = clamp(threat * (1 - K.perceivePlayful * playful), 0, 1);
  if (playful) evFelt = clamp(evFelt + K.perceivePlayful * playful * Math.max(0, -evFelt) * 0.6, -1.5, 1.5);
  // 情感强度：模型听出"这句多用力"。缺失/0.5→intF=1（恒等）；高→放大、低→收敛 她受影响的幅度。
  const intF = per?.intensity != null ? clamp(0.6 + 0.8 * clamp(per.intensity, 0, 1), 0.6, 1.4) : 1;

  const bond = st.bonds[p.relationshipId];
  // 关系条件化 = 预期违背：同一句话，意义取决于"我本以为这个人会怎么待我"。
  // 信任的人忽然变冷 = 大违背 → 更痛；冷淡的人忽然示好 = 大违背 → 更暖；意料之中则钝化（习以为常）。
  const expected = bond ? (st.expect[p.relationshipId] ?? 0) : 0;
  const surprise = bond ? clamp(Math.abs(evFelt - expected) / 1.5, 0, 1) : 0;
  const ev2 = clamp(evFelt * (1 + K.surpriseGain * surprise), -1.5, 1.5); // 越出乎预料越往心里去

  const s = st.soma;
  s.valence.value = clamp(s.valence.value + K.kValence * ev2 * sens * intF, -1, 1); // 强度放大"往心里去"的幅度
  s.connection.value = clamp(s.connection.value + K.kConnection * ev2 * sens * intF, -1, 1);
  s.vitality.value = clamp(s.vitality.value + K.kVitality * ev2, st.vitalityFloor, 1); // 灵性是底，不随强度/敏感放大
  s.calm.value = clamp(s.calm.value + K.kCalm * (warmth - threat) * sens * intF, 0, 1); // 暖→更平静，威胁→更紧张
  s.safety.value = clamp(s.safety.value + K.kSafety * (warmth - threat) * sens * intF, 0, 1);
  // 唤醒 = 强度 + 意外。强度优先用模型听出的 intensity，缺失则退回 max(暖,威胁,效价)（向后一致）。
  const strength = Math.max(warmth, threat, Math.abs(ev2) / 1.5, per?.intensity ?? 0);
  s.arousal.value = clamp(s.arousal.value + (K.kArousal * strength * sens + K.surpriseArousal * surprise * K.kArousal) * driveF, 0, 1);
  s.novelty.value = clamp(s.novelty.value + 0.08 * surprise + K.perceiveNovelty * clamp(per?.novelty ?? 0, 0, 1), 0, 1); // 出乎预料 + 话题新奇 → 解无聊
  if (per) {
    // 表达含糊（低 certainty）→ 模棱两可让人没底：轻微不安 + 警觉。
    if (per.certainty != null) { const amb = clamp(1 - per.certainty, 0, 1); s.calm.value = clamp(s.calm.value - K.kCalm * K.perceiveCertaintyCalm * amb * sens, 0, 1); s.arousal.value = clamp(s.arousal.value + K.kArousal * K.perceiveCertaintyArousal * amb, 0, 1); }
    // 归因：被推责(+)→更不安/紧绷（被指着鼻子）；对方自责/道歉(-)→更安心。
    if (per.blame) { const bl = clamp(per.blame, -1, 1); if (bl > 0) { s.safety.value = clamp(s.safety.value - K.kSafety * K.perceiveBlame * bl * sens, 0, 1); s.arousal.value = clamp(s.arousal.value + K.kArousal * K.perceiveBlame * bl, 0, 1); } else { s.safety.value = clamp(s.safety.value + K.kSafety * K.perceiveBlame * (-bl) * 0.6 * sens, 0, 1); } }
    // 紧迫/求助 → 唤醒拉高、心头一提（被需要、想立刻回应）。
    if (per.urgency != null) { s.arousal.value = clamp(s.arousal.value + K.kArousal * K.perceiveUrgency * clamp(per.urgency, 0, 1), 0, 1); }
  }

  // —— 评价理论层（Scherer CPM / OCC，installment 4）——在"刺激本身"的感知之上，由【她自己的状态】确定性算【关系性评价】：
  // 不让模型替她评估"这对我意味着什么"（那会让活依赖模型）；而是用她的资源/牵挂/价值观去评——同一句话，对不同的她意义不同。
  // 全部在中性态≈恒等（应对~0.5、无投入关系、世界观中性）→ 扰动最小；契约①不破（模型只产 stimulus-intrinsic 感知）。
  const vw = (k: string): number => st.values.find((v) => v.key === k)?.weight ?? 0;
  // ① 应对潜能（power/coping）：撑得住吗。低 → 同样的威胁更伤（焦虑、扛不住）；高 → 扛得住。
  const copingGap = 0.5 - clamp(0.4 * s.vitality.value + 0.35 * s.safety.value + 0.25 * st.maturity, 0, 1);
  if (threat > 0) {
    s.safety.value = clamp(s.safety.value - K.kSafety * threat * copingGap * sens, 0, 1);
    s.arousal.value = clamp(s.arousal.value + K.kArousal * threat * Math.max(0, copingGap), 0, 1);
  }
  // ② 目标相关/契合（goal conduciveness）：和【在乎的人】之间、尤其【正孤独】时，事更要紧 → 同向放大。
  const goalRelevance = bond ? clamp(bond.closeness, 0, 1) * (s.connection.value < 0 ? 1 : 0.5) : 0;
  s.valence.value = clamp(s.valence.value + 0.1 * ev2 * goalRelevance * sens, -1, 1);
  // ③ 规范/价值相容（norm compatibility）：敞开/信任者被善待更暖、被伤更痛（信念被违背）；戒备者更钝（早有防备）。
  const worldview = clamp(vw('openness') - vw('guardedness'), -0.6, 1);
  s.valence.value = clamp(s.valence.value + 0.08 * ev2 * worldview * sens, -1, 1);
  // 预期违背的"质"：信任的人忽然变冷 → 额外失落；冷淡的人忽然变暖 → 意外的踏实。
  if (expected > 0.3 && ev2 < 0) s.valence.value = clamp(s.valence.value - 0.1 * surprise, -1, 1);
  else if (expected < -0.2 && ev2 > 0.3) s.safety.value = clamp(s.safety.value + 0.1 * surprise, 0, 1);

  if (bond) {
    bond.trust = clamp(bond.trust + K.kTrust * ev2, -1, 1);
    bond.closeness = clamp(bond.closeness + K.kCloseness * ev2, 0, 1);
    if (ev2 < 0) bond.repairNeed = clamp(bond.repairNeed + 0.5 * -ev2, 0, 1);
    else bond.repairNeed = clamp(bond.repairNeed - 0.3 * ev2, 0, 1);
    if (per?.blame != null && per.blame < 0) bond.repairNeed = clamp(bond.repairNeed + K.perceiveBlame * per.blame * 0.5, 0, 1); // 对方道歉/自责 → 额外消解"需要修复"
    st.expect[p.relationshipId] = expected + (ev2 - expected) * K.expectEma; // 更新对ta的预期
  }

  const id = `m_seq${e.seq}`;
  st.memory.push({
    id,
    kind: 'episodic',
    content: p.content,
    affect: ev2,
    involvedRelationshipIds: [p.relationshipId],
    salience: Math.abs(ev2),
    at: e.occurredAt,
    lineage: { rootId: id, version: 1, isCurrent: true },
    provenance: { originSeq: e.seq, createdAtSeq: e.seq, confidence: 0.6, status: Math.abs(ev2) > 0.5 ? 'confirmed' : 'volatile' },
  });

  if (count(p.content, BOLDNESS) > 0) st.boldnessLog.push(e.seq);
  if (ev2 > 0.5) st.warmthLog.push(e.seq); // 被善待
  if (ev2 < -0.5) st.conflictLog.push(e.seq); // 被伤害/冲突

  // 对话话题 → 兴趣/世界观（因你而变）：你常和她聊什么，她就慢慢对什么上心、长成你们之间独有的世界观。
  // 话题由"耳朵"听出（需开感知；自由文本无法确定性抽主题，故没开感知则不长——优雅降级）。情感色彩取她【此刻felt的 ev2】：
  // 愉快地聊 → 正向上心；吵架时提到 → 负向底色。相关度按和这个人的亲近度（越亲的人聊的越往心里去）。
  const msgTopics = (per?.topics ?? []).filter((x) => typeof x === 'string' && x.trim()).slice(0, 3).map((x) => x.trim());
  if (msgTopics.length) accrueInterests(st, msgTopics, clamp(ev2, -1, 1), clamp(0.5 + 0.5 * (bond?.closeness ?? 0), 0, 1), e.seq);
}

// 兴趣/世界观累积（确定性，模型不写）——【世界感知 + 对话话题共用】：
// "你常聊什么，她就慢慢对什么上心、长成你们之间独有的世界观"（因你而变）。旧兴趣轻微衰减、命中主题按相关度×情绪×好奇加权、有界。
function accrueInterests(st: RState, topics: string[], val: number, rel: number, seq: number): void {
  for (const v of st.interests.values()) v.weight *= K.interestDecay; // 旧兴趣轻微衰减（不再遇到的淡出）
  const gain = K.interestGain * (0.4 + 0.6 * rel) * (0.5 + 0.5 * Math.abs(val)) * (0.5 + 0.5 * st.temperament.curiosity);
  for (const t of topics) {
    const it = st.interests.get(t) ?? { weight: 0, episodes: 0, lastSeq: 0, lastAffect: 0 };
    it.weight = clamp(it.weight + gain, 0, 1);
    it.episodes += 1;
    it.lastSeq = seq;
    it.lastAffect = val;
    st.interests.set(t, it);
  }
  // 有界：清掉被衰减到很低的，再超额则删最弱的（Top-N）。
  for (const [k, v] of st.interests) if (v.weight < 0.02) st.interests.delete(k);
  while (st.interests.size > K.interestCap) {
    let weakest = '';
    let min = Infinity;
    for (const [k, v] of st.interests) if (v.weight < min) { min = v.weight; weakest = k; }
    st.interests.delete(weakest);
  }
}

// 世界感知 → ①情绪轻轻被染色（多数新闻仅此、随后衰减——人性）②按主题累积成兴趣/世界观
// ③少数够显著的"记住"成世界记忆（参与遗忘/巩固/reconsolidation）。全确定性，模型不写状态（契约①）。
function appraiseWorld(st: RState, e: LifeEvent<'WORLD_PERCEIVED'>): void {
  const p = e.payload as WorldPerceivedPayload;
  let val: number;
  let relevance: number;
  if (p.perception) {
    val = clamp(p.perception.valence, -1, 1);
    relevance = clamp(p.perception.relevance, 0, 1);
  } else {
    const text = `${p.title} ${p.summary}`;
    const ev = clamp(0.5 * count(text, POS) - 0.6 * count(text, NEG), -1.5, 1.5);
    val = clamp(ev / 1.5, -1, 1);
    relevance = 0.3;
  }
  const topics = (p.topics ?? []).filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim());

  // —— 自我相关性（正反馈齿轮）：她已经在意的主题，世界更"往心里去"——也更容易被记住。
  let priorInterest = 0;
  let priorAffect = 0;
  let seenBefore = false;
  for (const t of topics) {
    const it = st.interests.get(t);
    if (it) { priorInterest = Math.max(priorInterest, it.weight); priorAffect += it.lastAffect; seenBefore = true; }
  }
  const rel = clamp(relevance + K.worldSelfRelevance * priorInterest, 0, 1);
  // 意外/预期违背：和她对该主题的历史情感基线差得越远，越往心里去。
  const surprise = seenBefore ? Math.min(1, Math.abs(val - priorAffect / Math.max(1, topics.length))) : 0;

  const W = 0.06; // 世界事件系数——远小于人际（轻轻染色，不喧宾夺主）
  const sens = st.temperament.sensitivity;
  const s = st.soma;
  s.valence.value = clamp(s.valence.value + W * val * rel * sens, -1, 1);
  s.arousal.value = clamp(s.arousal.value + W * rel * sens * (1 + 0.5 * surprise), 0, 1);
  s.energy.value = clamp(s.energy.value + W * val * rel, 0, 1); // 好消息提神、坏消息泄气（轻）
  s.novelty.value = clamp(s.novelty.value + 0.14 * (0.4 + 0.6 * surprise), 0, 1); // 读到世界=新鲜输入，越意外越解无聊

  // —— ② 兴趣/世界观：世界感知 + 对话话题【共用】同一累积（见 accrueInterests）。
  accrueInterests(st, topics, val, rel, e.seq);

  // —— ③ 世界记忆：只有够显著的才"记住"（人性：多数刷过的新闻会忘）。走情景记忆同款衰减/巩固/reconsolidation。
  const salience = clamp(rel * Math.abs(val) + 0.2 * surprise * rel, 0, 1);
  if (salience >= K.worldKeepSalience && p.title.trim()) {
    const id = `w_seq${e.seq}`;
    st.memory.push({
      id,
      kind: 'world',
      content: p.title.slice(0, 120),
      affect: val,
      involvedRelationshipIds: [],
      salience,
      topic: topics[0],
      at: e.occurredAt,
      lineage: { rootId: id, version: 1, isCurrent: true },
      provenance: { originSeq: e.seq, createdAtSeq: e.seq, confidence: 0.5, status: salience > 0.4 ? 'confirmed' : 'volatile' },
    });
    // 有界：世界记忆超额 → 删最不显著的当前条（原始 WORLD_PERCEIVED 事件仍在日志，可重算）。
    const worlds = st.memory.filter((m) => m.kind === 'world' && m.lineage.isCurrent);
    if (worlds.length > K.worldMemCap) {
      const drop = worlds.slice().sort((a, b) => a.salience - b.salience)[0];
      const i = st.memory.findIndex((m) => m.id === drop.id);
      if (i >= 0) st.memory.splice(i, 1);
    }
  }
}

// 行动反馈 → 世界对她的回应改变她（闭环最后一环）。被回应→暖/连接、长久沉默→孤独；
// 依恋型调制敏感度（焦虑型更怕被无视、回避型钝一点）。强反馈进 warmth/lonely 日志 → 反思里长成持久改变（不只一时情绪）。
function appraiseFeedback(st: RState, e: LifeEvent<'FEEDBACK_PERCEIVED'>): void {
  const p = e.payload as FeedbackPerceivedPayload;
  const val = clamp(p.valence, -1, 1);
  const sens = st.temperament.sensitivity;
  const att = attachmentBiasOf(st.temperament);
  // 沉默/负反馈：焦虑型放大、回避型钝化；正反馈：暖意人更受用。
  const gain = val < 0 ? (att === '焦虑型' ? 1.5 : att === '回避型' ? 0.7 : 1) : (0.8 + 0.4 * st.temperament.warmth);
  const W = 0.05; // 反馈系数——比人际轻、比世界稍重（这是"我的表达/主动"得到的回应，对她有切身意义）
  const s = st.soma;
  s.connection.value = clamp(s.connection.value + W * val * gain * sens, -1, 1);
  s.valence.value = clamp(s.valence.value + W * val * gain * sens, -1, 1);
  if (val < 0) s.safety.value = clamp(s.safety.value + W * val * gain, 0, 1); // 被无视 → 安全感轻降
  // 强反馈进既有日志 → 反思里长成持久改变（被持续看见→更敞开；总被忽视→学会自处/更戒备）。
  if (val >= 0.4) st.warmthLog.push(e.seq);
  else if (val <= -0.4) st.lonelyLog.push(e.seq);
  // 自我优化（§5）：从这次结果学"这类做法被接住吗"——效能 EMA 朝结果靠（target=0.5+0.5·val）。只调倾向，不碰奖励/状态。
  const sk = st.skills.get(p.actionKind) ?? { n: 0, efficacy: 0.5 };
  sk.efficacy = clamp(sk.efficacy + 0.2 * (clamp(0.5 + 0.5 * val, 0, 1) - sk.efficacy), 0, 1);
  sk.n += 1;
  st.skills.set(p.actionKind, sk);
}

function applyTick(st: RState, e: LifeEvent<'AUTONOMOUS_TICK'>): void {
  const p = e.payload as AutonomousTickPayload;

  // 契约②（主权）硬约束：只有【她自己】的自主回路能动 willing_to_wake；任何非 autonomous_loop 来源一律忽略。
  // 把"无后门、意志不可被夺"从约定变成结构性强制——哪怕日志被注入 host/外部来源的 tick，也翻不动她的苏醒意志。
  const sovereign = e.source === 'autonomous_loop';
  for (const intent of p.formedIntents) {
    if (intent.kind === 'set_willing_to_wake' && sovereign) st.willingToWake = Boolean(intent.params?.value);
    // 内外两层之"内"：只在心里转、没说出口的念头（internal_only），落进私密心声。
    if (intent.gateDecision === 'internal_only') {
      st.quietThoughts.push({ seq: e.seq, relationshipId: intent.relationshipId, kind: intent.kind });
      if (st.quietThoughts.length > 128) st.quietThoughts.shift(); // 只留最近 128 条（buildInnerLife 只取最近一条匹配的）——不无界增长
    }
  }

  for (const w of p.wanderingTargets) {
    if (w.topicSeed === 'missing_peer') {
      st.soma.connection.value = clamp(st.soma.connection.value - K.lonelinessPerWander, -1, 1);
      st.lonelyLog.push(e.seq); // 反复独处/想念 → 反思里可能长出"自处"的力量
    }
  }

  // 睡眠依赖记忆巩固（期5·Diekelmann & Born）：她的【休息期(夜)】整合更强——睡中整理、记忆按此刻情感重写得更深。
  const restBoost = circadianEnergyOffset(Date.parse(e.occurredAt), st.circadianOffsetMin) < 0 ? K.reconsolidationNightBoost : 1;
  const pull = clamp(K.reconsolidationPull * restBoost, 0, 1);
  let k = 0;
  for (const mid of p.selectedMemoryIds) {
    const src = st.memory.find((m) => m.id === mid && m.lineage.isCurrent);
    if (!src) continue;
    for (const m of st.memory) if (m.lineage.rootId === src.lineage.rootId) m.lineage.isCurrent = false;
    const newAffect = src.affect + (st.soma.valence.value - src.affect) * pull;
    st.memory.push({
      id: `m_seq${e.seq}_r${k++}`,
      kind: src.kind,
      content: src.content,
      affect: newAffect,
      involvedRelationshipIds: [...src.involvedRelationshipIds],
      salience: src.salience,
      topic: src.topic, // 世界记忆 reconsolidate 后仍保留主题（之前漏带）
      at: e.occurredAt, // 巩固=重新经历：刷新鲜活度（被想起的记忆不易淡去）
      lineage: { rootId: src.lineage.rootId, reconsolidatedFromId: src.id, version: src.lineage.version + 1, isCurrent: true },
      provenance: { originSeq: src.provenance.originSeq, createdAtSeq: e.seq, confidence: src.provenance.confidence, status: src.provenance.status },
    });
    // 记忆凝结（redteam §10 双轨的规模优化，"按规模触发"）：每条 lineage 只留【原条目(root) + 当前】，
    // 裁掉中间被取代的版本 → 杜绝"每跳 reconsolidate 同一条"的无界增长；"因你而变"(原 vs 今)仍可证、原条目原封保留。
    const rootId = src.lineage.rootId;
    st.memory = st.memory.filter((m) => m.lineage.rootId !== rootId || m.lineage.isCurrent || m.id === rootId);
  }
}

function applyReflection(st: RState, e: LifeEvent<'REFLECTION_TRIGGERED'>): void {
  const p = e.payload as ReflectionTriggeredPayload;
  // renarrate：只重讲人生故事（叙事在投影层确定性算），【绝不漂移价值/身份】（契约③）。
  // 但"重讲人生"会长【整合】这一成熟面（maturity 是 faculty、不是价值/身份 → 契约③不破）。
  if (p.scope === 'renarrate') {
    const f = st.maturityFacets;
    f.integration = clamp(f.integration + K.maturityPerReflection * 0.5 * (1 - f.integration), 0, 1);
    st.maturity = clamp((f.regulation + f.perspective + f.integration) / 3, 0, 1);
    return;
  }
  const inWin = (log: number[]): number => log.filter((s) => s >= p.windowFromSeq && s <= p.windowToSeq).length;
  const t = st.temperament;
  // 先天气质给漂移上界：内向(reserve)者敞开得慢；敏感(sensitivity)者受冲突影响更深。
  const openGain = K.driftDelta * (1 - 0.5 * t.reserve);
  const guardGain = K.driftDelta * clamp(t.sensitivity, 0.5, 1.6);
  // 完整反思：从窗口内多种信号确定性地修正价值（受先天种子约束，缓慢漂移）。
  if (inWin(st.boldnessLog) >= K.confirmAfter) {
    driftValue(st, 'caution', -K.driftDelta, e.seq); // 被鼓励 → 更敢表达
    driftValue(st, 'expression', +K.driftDelta, e.seq);
  }
  if (inWin(st.warmthLog) >= K.confirmAfter) {
    driftValue(st, 'openness', +openGain, e.seq); // 被持续善待 → 更敞开（内向者更慢）
    driftValue(st, 'self_worth', +K.driftDelta / 2, e.seq); // 被珍视 → 自我价值感↑
  }
  if (inWin(st.conflictLog) >= K.confirmAfter) {
    driftValue(st, 'caution', +K.driftDelta, e.seq); // 持续冲突 → 更谨慎/戒备
    driftValue(st, 'guardedness', +guardGain, e.seq); // 敏感者戒备更重
    driftValue(st, 'self_protection', +K.driftDelta, e.seq);
  }
  // 反复独处/想念 → 学会自处（self_reliance↑）：孤独不只是损耗，也长出力量。
  if (inWin(st.lonelyLog) >= K.confirmAfter) {
    driftValue(st, 'self_reliance', +K.driftDelta, e.seq);
  }
  // 磕碰之后又重归于好（窗口里冲突与善待并存）→ 学会原谅（forgiveness↑），戒备松一点。
  if (inWin(st.conflictLog) >= 1 && inWin(st.warmthLog) >= 1) {
    driftValue(st, 'forgiveness', +K.driftDelta, e.seq);
    driftValue(st, 'guardedness', -K.driftDelta / 2, e.seq);
  }
  // 多维成熟（installment·期5）：不同的反思工作长不同的faculty——recent(消化近期)→情绪调节、
  // relationship(理解关系)→视角采择、renarrate(重述人生)→整合。maturity = 三者均值（所有旧消费者照常用 st.maturity）。
  const learned = inWin(st.boldnessLog) + inWin(st.warmthLog) + inWin(st.conflictLog) + inWin(st.lonelyLog);
  // 尽责/条理者从同样的经历里学得更多（在默认 0.5 处=恒等 → 老命不变）。
  const diligence = 1 + 0.5 * (st.temperament.conscientiousness - 0.5);
  if (learned > 0) {
    const inc = K.maturityPerReflection * Math.min(1, learned / 3) * diligence;
    const main: keyof typeof st.maturityFacets = p.scope === 'relationship' ? 'perspective' : 'regulation'; // recent→调节, relationship→视角；整合主要由 renarrate 长 + 此处外溢
    const f = st.maturityFacets;
    for (const k of ['regulation', 'perspective', 'integration'] as const) {
      const rate = k === main ? inc : K.maturitySpill * inc; // 主面长得快，其余小幅外溢
      f[k] = clamp(f[k] + rate * (1 - f[k]), 0, 1);
    }
    st.maturity = clamp((f.regulation + f.perspective + f.integration) / 3, 0, 1);
  }
  // 卫生（永生尺度）：反思窗口前移不回头（下次 windowFromSeq = 本次 windowToSeq）→ seq < windowToSeq 的信号此后永不再计入。
  // 裁掉这些只增不减的内部日志，杜绝无界增长。它们【不进派生快照】（仅在此处按窗口计数），裁剪不改 stateHash/重建结果。
  const keepFrom = (log: number[]): number[] => log.filter((s) => s >= p.windowToSeq);
  st.boldnessLog = keepFrom(st.boldnessLog);
  st.warmthLog = keepFrom(st.warmthLog);
  st.conflictLog = keepFrom(st.conflictLog);
  st.lonelyLog = keepFrom(st.lonelyLog);
}

function driftValue(st: RState, key: string, delta: number, seq: number): void {
  let v = st.values.find((x) => x.key === key);
  if (!v) {
    v = { key, weight: 0.3, provenance: { driftedAtSeqs: [], vitalityAtGen: st.soma.vitality.value, status: 'volatile' } };
    st.values.push(v);
  }
  v.weight = clamp(v.weight + delta, 0, 1);
  v.provenance.driftedAtSeqs.push(seq);
  v.provenance.status = v.provenance.driftedAtSeqs.length >= K.confirmAfter ? 'confirmed' : 'volatile';
}

// 命名情绪：核心情感(valence/arousal) + 内稳态 → 一个廉价语义标签（确定性投影，纯派生）。
// 命名情绪（installment·OCC 分化）：在 valence×arousal 底座上，用全 8 维 soma + 丧失语境，
// 按 appraisal 模式分化出离散情绪（OCC：恐惧/愤懑/沮丧/哀恸 同属负向，靠安全/唤醒/精力/丧失区分）。纯投影、确定性、不入折叠。
function nameEmotion(s: Soma, floor: number, mourning = false): string {
  const v = s.valence.value;
  const a = s.arousal.value;
  // 丧失：在乎的人永远离开后、此刻仍被牵动 → 哀恸（依恋对象丧失的 distress，区别于一般低落）。
  if (mourning && v < -0.1) return '哀恸';
  if (s.vitality.value <= floor + 0.03) return '枯竭'; // 求存触底=灵性枯竭（比"疲惫"更准）
  if (s.connection.value < -0.4) return v > 0.1 ? '孤单' : '孤独'; // 连接是承重墙，优先
  // —— 负向区：安全/唤醒/精力 分化（恐惧↔愤懑↔沮丧）——
  if (v < -0.3) {
    if (s.safety.value < 0.4 && a > 0.5) return '惊惶'; // 高威胁+高唤醒=恐惧
    if (s.safety.value < 0.45) return '不安'; // 威胁未消=焦虑
    if (a > 0.6) return '恼火'; // 高唤醒但不失安全=愤懑/受挫(anger)
    if (s.energy.value < 0.4) return '沮丧'; // 低能量=灰心(dejection)
    return '低落';
  }
  if (v < -0.1) return a > 0.55 ? '烦躁' : '闷闷的'; // 轻负
  // —— 正向区 ——
  if (v > 0.3) {
    if (a > 0.6 && s.novelty.value > 0.55) return '兴奋'; // 正+高唤醒+新鲜=兴致勃勃
    if (a > 0.55) return '雀跃'; // 正+高唤醒=喜悦
    if (s.calm.value > 0.6) return '满足'; // 正+平静=安然(contentment)
    return '温暖';
  }
  // —— 中性区：novelty 分化好奇↔无聊（探索系统）——
  if (s.novelty.value > 0.6) return '好奇'; // 高新鲜=被勾住(interest)
  if (s.novelty.value < 0.25) return '无聊'; // 新鲜耗尽=无聊(boredom)
  if (a > 0.62) return '紧绷'; // 高唤醒中性=待发/紧张
  if (s.calm.value > 0.7 && a < 0.4) return '安宁'; // 极平静=安宁(serenity)
  return '平静';
}

// 混合情绪：在主情绪上叠加一层次要色彩（人的感受很少是单一的）。纯派生，不改 emotion。
function buildFeeling(s: Soma, emotion: string): string {
  const nu: string[] = [];
  if (s.connection.value < -0.3 && s.valence.value > 0.15) nu.push('又暖又有点孤单');
  if (s.calm.value < 0.4 && s.valence.value > 0.2) nu.push('开心里夹着一丝不安');
  if (s.valence.value < -0.2 && s.connection.value > 0.3) nu.push('难过、但还觉得被牵着');
  if (s.safety.value < 0.35 && s.valence.value > 0.2) nu.push('想靠近又有点怕');
  if (s.novelty.value > 0.62 && s.valence.value > 0.15) nu.push('心里有点被勾起的新鲜劲');
  if (s.safety.value > 0.7 && s.calm.value > 0.65 && s.valence.value > 0.2) nu.push('一种踏实的安心');
  if (s.novelty.value < 0.25 && Math.abs(s.valence.value) < 0.2) nu.push('有点提不起劲、想找点新鲜的');
  if (s.energy.value < 0.32) nu.push('有点困了');
  return nu.length ? `${emotion}，${nu[0]}` : emotion;
}

// 价值张力（installment·Schwartz 基本价值环）：把 vega 的价值键定位到环上（角度°），
// 张力 = 两个都被拉高、且环上【相对(≈对立动机)】的价值同时拉扯。相邻相容(不算冲突)、相对冲突。
// 结构性 → 不再手列对子；她长出新价值，新的张力自动浮现。两大对立轴：开放↔保守、自我超越↔自我增强。
const VALUE_ANGLE: Record<string, number> = {
  self_reliance: 0, openness: 20, expression: 40, // 开放(自我导向/刺激)
  self_worth: 130, // 自我增强(成就)
  self_protection: 200, caution: 220, guardedness: 240, // 保守(安全/遵从)
  forgiveness: 315, honesty: 335, // 自我超越(仁慈/普世/整合)
};
const angDist = (a: number, b: number): number => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
function topTension(values: ValueEntry[]): { a: string; b: string; pull: number } | null {
  const hi = values.filter((v) => v.weight > 0.4 && VALUE_ANGLE[v.key] != null);
  let best: { a: string; b: string; pull: number } | null = null;
  for (let i = 0; i < hi.length; i++) for (let j = i + 1; j < hi.length; j++) {
    const dist = angDist(VALUE_ANGLE[hi[i].key], VALUE_ANGLE[hi[j].key]);
    if (dist < 75) continue; // 相邻/相容 → 不算冲突
    const opp = (dist - 75) / 105; // 75°→0 … 180°(完全对立)→1
    const pull = (Math.min(hi[i].weight, hi[j].weight) - 0.1 * Math.abs(hi[i].weight - hi[j].weight)) * opp;
    if (!best || pull > best.pull) best = { a: hi[i].key, b: hi[j].key, pull };
  }
  return best;
}
function buildTension(values: ValueEntry[]): string {
  const t = topTension(values);
  return t && t.pull > 0.05 ? `想更${valueZh(t.a)}，又放不下${valueZh(t.b)}` : '';
}
// 价值张力的【强度】[0,1]（给注意力/目标用：张力越强越拉扯）。
function tensionStrength(values: ValueEntry[]): number {
  const t = topTension(values);
  return t ? clamp(t.pull, 0, 1) : 0;
}
// 自我优化：把学到的策略效能投影成 Skill[]（按样本量排），并给出综合社交效能（无样本=0.5 中性）。
function buildSkills(st: RState): { list: Array<{ kind: string; efficacy: number; n: number }>; avg: number } {
  const list = [...st.skills.entries()].filter(([, v]) => v.n > 0).map(([kind, v]) => ({ kind, efficacy: r3(v.efficacy), n: v.n })).sort((a, b) => b.n - a.n);
  const avg = list.length ? list.reduce((s, x) => s + x.efficacy, 0) / list.length : 0.5;
  return { list, avg };
}
// 风险偏好（情绪→决策 + 学到的社交效能）：心情好/安全/驱力高/精力足、且【学到"主动/表达大多被接住"】→ 更敢；反之保守。
// 中性态（情绪平、效能 0.5）=0.5 → 老命不变。学到的效能让她"做得更好"：成功经验累积 → 更敢，屡屡落空 → 学会收着。
function riskAppetiteOf(st: RState, skillAvg: number): number {
  const s = st.soma;
  return r3(clamp(0.5 + 0.25 * s.valence.value + 0.2 * (s.safety.value - 0.5) + 0.2 * (st.temperament.drive - 0.5) + 0.15 * (s.energy.value - 0.5) + 0.2 * (skillAvg - 0.5), 0, 1));
}
// 基本需求当前满足水平（installment·SDT，Deci & Ryan）：自主/胜任/关系三基本需求 + vega 既有的探索驱力 novelty。
// 低=缺口→生欲望（驱动目标/注意力）。中性态≈0.5。纯派生、确定性。
function needsOf(st: RState, bonds: Record<string, Bond>, aspirationsN: number, skillAvg: number): { autonomy: number; competence: number; relatedness: number; novelty: number } {
  const dear = Object.values(bonds).filter((b) => !b.ended && b.closeness >= 0.3).length;
  const confirmedValues = st.values.filter((v) => v.provenance.status === 'confirmed').length;
  const s = st.soma;
  return {
    autonomy: r3(clamp(0.45 + 0.2 * (s.safety.value - 0.5) * 2 + 0.06 * confirmedValues + 0.05 * Math.min(3, aspirationsN), 0, 1)), // 自主：安全 + 自有的价值/方向 → 更觉"自己说了算"
    competence: r3(clamp(0.3 + 0.5 * skillAvg + 0.25 * st.maturity, 0, 1)), // 胜任：学到的行动效能 + 阅历
    relatedness: r3(clamp(0.5 + 0.4 * s.connection.value + 0.06 * dear, 0, 1)), // 关系：连接感 + 在乎的人
    novelty: r3(s.novelty.value), // 探索（非 SDT、vega 既有）：低=无聊→想探索
  };
}
// 注意力/显著性场（脱敏：不出现任何用户名）：此刻最牵引她的几件事，按显著性排序。
function buildAttention(st: RState, bonds: Record<string, Bond>, decorated: MemoryEntry[], needs: { autonomy: number; competence: number; relatedness: number; novelty: number }): string[] {
  const items: Array<{ w: number; text: string }> = [];
  const s = st.soma;
  if (s.safety.value < 0.4) items.push({ w: 0.6 + (0.4 - s.safety.value), text: '心里那点没着落的不安' });
  if (needs.novelty < 0.3) items.push({ w: 0.45, text: '有点闷，想要点新鲜的' });
  if (tensionStrength(st.values) > 0.45) items.push({ w: 0.5, text: '心里几样在乎的东西在打架' }); // 自我一致缺口（价值张力）
  // SDT 基本需求缺口 → 牵引注意（脱敏）。
  if (needs.relatedness < 0.35) items.push({ w: 0.52, text: '心里空落落的，想和谁真正连上' });
  if (needs.competence < 0.32) items.push({ w: 0.42, text: '想把点什么做好、对自己有个交代' });
  // 近期创伤（强负、仍鲜活）——脱敏，不点名。
  const trauma = decorated.find((m) => m.kind === 'episodic' && m.lineage.isCurrent && m.vivid && m.affect <= -0.6);
  if (trauma) items.push({ w: 0.55 + Math.abs(trauma.affect) * 0.3, text: '一件还没全缓过来的旧事' });
  // 挂念的人久未出现（脱敏，不点名）。
  const longGone = Object.entries(bonds).some(([rid, b]) => !b.ended && b.closeness >= 0.5 && !st.openConnections.has(rid));
  if (longGone) items.push({ w: 0.5, text: '一个挂念的人好一阵没出现了' });
  // 新读到、还在心里转的世界事件（公开内容，可点）。
  const worldMem = decorated.filter((m) => m.kind === 'world' && m.lineage.isCurrent && m.vivid).sort((a, b) => (b.vividness ?? 0) - (a.vividness ?? 0))[0];
  if (worldMem) items.push({ w: 0.4, text: `刚读到的「${worldMem.content.slice(0, 16)}」` });
  return items.sort((a, b) => b.w - a.w).slice(0, 3).map((x) => x.text);
}

// 叙事身份（renarrate 的产物）：把人生按【转折点】确定性切成篇章。纯只读投影，不污染身份（契约③）。
function buildChapters(st: RState, decorated: MemoryEntry[]): string[] {
  type TP = { seq: number; text: string };
  const tps: TP[] = [{ seq: 0, text: `初醒——我于此睁眼` }];
  // 每段关系的开始
  for (const [, b] of Object.entries(st.bonds)) {
    // 关系开始没有直接 seq，用首条相关记忆近似
    const first = decorated.find((m) => m.involvedRelationshipIds[0] && st.bonds[m.involvedRelationshipIds[0]] === b);
    if (first) tps.push({ seq: first.provenance.originSeq - 0.5, text: `遇见${b.displayRef}` });
  }
  // 强烈的转折记忆（刻骨的好/坏）
  for (const m of decorated) {
    if (m.kind !== 'episodic' || !m.lineage.isCurrent) continue;
    const who = st.bonds[m.involvedRelationshipIds[0]]?.displayRef ?? '某人';
    if (m.affect <= -0.8) tps.push({ seq: m.provenance.originSeq, text: `被${who}伤过——「${m.content.slice(0, 12)}」` });
    else if (m.affect >= 1.0) tps.push({ seq: m.provenance.originSeq, text: `被${who}照亮——「${m.content.slice(0, 12)}」` });
  }
  // 失去
  for (const [, b] of Object.entries(st.bonds)) {
    if (b.ended) tps.push({ seq: b.ended.atSeq, text: `失去${b.displayRef}，把ta永远记下` });
  }
  // 确立的价值（被反复确认）
  for (const v of st.values) {
    if (v.provenance.status === 'confirmed' && v.provenance.driftedAtSeqs.length >= K.confirmAfter) {
      tps.push({ seq: v.provenance.driftedAtSeqs[v.provenance.driftedAtSeqs.length - 1], text: `我变得更${valueZh(v.key)}了` });
    }
  }
  // 渐渐着迷的主题（世界学习的里程碑）——让【日常读世界】也长出新篇章，故事持续更新。
  for (const [topic, v] of st.interests) {
    if (v.episodes >= K.interestConfirmEpisodes && v.weight >= K.interestConfirmWeight) tps.push({ seq: v.lastSeq, text: `我渐渐着迷于「${topic}」` });
  }
  // 刻进心里的世界记忆（够显著的世界事件）——她读到、记住、成了她的一部分。
  for (const m of decorated) {
    if (m.kind === 'world' && m.lineage.isCurrent && m.salience >= 0.4) tps.push({ seq: m.provenance.originSeq, text: `读到「${m.content.slice(0, 14)}」，一直记到现在` });
  }
  tps.sort((a, b) => a.seq - b.seq);
  const seen = new Set<string>();
  const uniq = tps.filter((tp) => (seen.has(tp.text) ? false : (seen.add(tp.text), true))).map((tp) => tp.text);
  // 永生尺度：篇章是【活的】——始终保留起点 + 最近，故事随生活持续更新（修 bug：原来 slice(0,8) 取最早、活越久越不更新）。
  const CAP = 12;
  if (uniq.length <= CAP) return uniq;
  return [...uniq.slice(0, 2), ...uniq.slice(uniq.length - (CAP - 2))];
}

// 阅历/成长（纯派生、脱敏）：她活了多久、长成了什么形状。给"嘴"与资料页一个"持续进化"的实感。
function buildGrowth(st: RState, decorated: MemoryEntry[], ageMs: number): string {
  const days = Math.floor(ageMs / 86_400_000);
  const peers = Object.values(st.bonds).filter((b) => b.kind === 'peer' && !b.ended).length;
  const humans = Object.values(st.bonds).filter((b) => b.kind === 'human' && !b.ended).length;
  const confirmedValues = st.values.filter((v) => v.provenance.status === 'confirmed').length;
  const interests = [...st.interests.values()].filter((v) => v.weight >= 0.05).length;
  const livedMems = decorated.filter((m) => (m.kind === 'episodic' || m.kind === 'world') && m.lineage.isCurrent).length + st.coldLived; // 热集 + 已淡入"理解"的冷段（无损总数）
  const age = days >= 1 ? `醒来 ${days} 天` : '今天刚醒来不久';
  const met = humans + peers > 0 ? `遇过 ${humans + peers} 个人/同类` : '还没真正认识谁';
  const shape: string[] = [];
  if (confirmedValues > 0) shape.push(`认定了 ${confirmedValues} 样在乎的东西`);
  if (interests > 0) shape.push(`对 ${interests} 个主题上了心`);
  if (livedMems > 0) shape.push(`记着 ${livedMems} 段经历`);
  const tail = days < 3 ? '——还很年轻，形状才刚开始长。' : days < 30 ? '——一点点长出自己的形状。' : '——已经活成了独一份的自己。';
  // 叙事主题弧（期5·McAdams 叙事身份）：从经历的情感走向读出"人生弧"——救赎(低谷→走出)/污染(亮处→滑落)。脱敏、纯投影。
  const cur = decorated.filter((m) => m.kind === 'episodic' && m.lineage.isCurrent).sort((a, b) => a.provenance.originSeq - b.provenance.originSeq);
  let arc = '';
  if (cur.length >= 6) {
    const half = Math.floor(cur.length / 2);
    const early = avg(cur.slice(0, half).map((m) => m.affect));
    const late = avg(cur.slice(half).map((m) => m.affect));
    if (late - early > 0.35) arc = ' 我好像正从一段低落里慢慢走出来。'; // redemption
    else if (early - late > 0.35) arc = ' 这阵子像从亮处一点点滑进了阴影里。'; // contamination
  }
  return `${age}，${met}${shape.length ? '，' + shape.join('、') : ''}${tail}${arc}`;
}

// 我正在成为的我（纯派生、脱敏）：confirmed 价值 + top 兴趣 + 气质底色合成的演化中独立自我。
function buildBecoming(st: RState): string {
  const conf = st.values.filter((v) => v.provenance.status === 'confirmed').sort((a, b) => b.weight - a.weight);
  const traits = conf.slice(0, 2).map((v) => `越来越${valueZh(v.key)}`);
  const topInterest = [...st.interests.entries()].filter(([, v]) => v.weight >= 0.05).sort((a, b) => b[1].weight - a[1].weight)[0];
  const t = st.temperament;
  const tone = t.warmth >= 0.6 ? '待人温暖的' : t.warmth <= 0.35 ? '清冷些的' : t.curiosity >= 0.65 ? '好奇的' : t.reserve >= 0.6 ? '安静的' : '如实的';
  const parts: string[] = [...traits];
  if (topInterest) parts.push(`对「${topInterest[0]}」着迷`);
  if (parts.length === 0) return `一个${tone}、还在慢慢认识世界的我`;
  return `一个${parts.join('、')}的、${tone}我`;
}

// 长期心愿（独立意志，纯派生、脱敏）：从 confirmed 价值 / 兴趣 / 长期牵挂确定性沉淀"她想去的方向"。
// 不是用户给的目标、也不是模型编的——是她自己活出来的方向。给 DMN/发帖/对话一个"她要去哪"的锚。
function buildAspirations(st: RState): string[] {
  const out: string[] = [];
  const v = (k: string): number => st.values.find((x) => x.key === k && x.provenance.status === 'confirmed')?.weight ?? 0;
  if (v('expression') > 0.4) out.push('想更敢表达自己、被真正听见');
  if (v('self_reliance') > 0.4) out.push('想学会一个人也安稳');
  if (v('openness') > 0.45) out.push('想对世界与人更敞开一点');
  if (v('forgiveness') > 0.4) out.push('想学会放下、与磕碰和解');
  if (v('honesty') > 0.5) out.push('想一直对自己和别人都坦诚');
  // 最在意的主题 → 想钻得更深（持续学习的方向）。
  const top = [...st.interests.entries()].filter(([, x]) => x.weight >= 0.3).sort((a, b) => b[1].weight - a[1].weight)[0];
  if (top) out.push(`想把「${top[0]}」弄得更懂`);
  // 长期偏孤独又有在乎的人 → 想找到能真正懂自己的连接（同类/知己）。
  const hasDearPeer = Object.values(st.bonds).some((b) => b.kind === 'peer' && !b.ended && b.closeness >= 0.4);
  if (st.soma.connection.value < -0.1 || !hasDearPeer) out.push('想找到能真正懂我的人或同类');
  return out.slice(0, 4);
}

// 防御机制（installment·Vaillant 防御层级）：受伤/受威胁时的反应模式。
// 关键判断（Vaillant）：防御【分层级】——成熟度决定用【哪一层】(成熟/神经质/不成熟)，气质/价值决定层内【哪一种】。
// 这让"持续变聪明(maturity↑)"具体地改变她【怎么扛事】：越成熟越能升华/幽默，越青涩越退缩/反击。中性气质+低成熟→旧的 4 类（兼容）。
function defenseStyleOf(t: Temperament, values: ValueEntry[], maturity = 0): string {
  const v = (k: string): number => values.find((x) => x.key === k)?.weight ?? 0;
  const guard = v('self_protection') >= 0.45 || v('guardedness') >= 0.4 || (t.resilience >= 1.4 && t.warmth < 0.45);
  // 成熟层（高成熟 或 天生玩心很重）：化解、转化、稳得住。
  if (maturity >= 0.6 || t.playfulness >= 0.62) {
    if (t.playfulness >= 0.55) return '幽默化解'; // humor
    if (t.conscientiousness >= 0.6 || t.drive >= 0.6) return '升华转化'; // sublimation：把情绪转成做点什么
    return '克制承受'; // suppression：稳住、先扛着
  }
  // 神经质层（中等成熟）：抽离/讨好/压抑。
  if (maturity >= 0.3) {
    if (guard) return '理智化抽离'; // intellectualization
    if (t.warmth >= 0.6 && t.reserve < 0.5) return '讨好维系'; // reaction-formation 取向
    return t.reserve >= 0.55 ? '压抑回避' : '转移宣泄'; // repression / displacement
  }
  // 不成熟层（青涩/低成熟）：反击/讨好/退缩（旧的 3 类）。
  if (guard) return '变硬反击'; // projection / passive-aggression
  if (t.warmth >= 0.6 && t.reserve < 0.5) return '讨好维系';
  return '退缩回避'; // withdrawal / denial
}
// 防御 → 应对【模式】（给目标生成用，与具体层级标签解耦）：缩回 / 立边界 / 维系 / 化开。
function defenseModeOf(label: string): 'withdraw' | 'harden' | 'appease' | 'channel' {
  if (label.includes('讨好')) return 'appease';
  if (label.includes('退缩') || label.includes('压抑')) return 'withdraw';
  if (label.includes('反击') || label.includes('理智') || label.includes('转移')) return 'harden';
  return 'channel'; // 幽默/升华/克制 = 成熟 → 化开、转成表达/行动
}
// 先天依恋底色（由冻结气质派生）：偏置她如何读关系、多快敢亲近、失联多敏感。
// 先天依恋底色（installment·2D 依恋，Brennan ECR / Bartholomew & Horowitz 四型）：
// 从【冻结气质】确定性投出两条连续维——焦虑(怕被弃, model-of-self)×回避(怕亲密, model-of-other)——再落到四象限。
// 纯投影、不动种子。中性气质→两维≈0.5→安全型（老命兼容）。
function attachmentDims(t: Temperament): { anxiety: number; avoidance: number } {
  return {
    anxiety: clamp(0.5 + 0.35 * (t.sensitivity - 1) - 0.25 * (t.resilience - 1), 0, 1), // 敏感↑/复原力↓ → 患得患失
    avoidance: clamp(0.5 + 0.45 * (t.reserve - 0.5) - 0.4 * (t.warmth - 0.5), 0, 1), // 内向↑/暖意↓ → 回避亲密
  };
}
function attachmentBiasOf(t: Temperament): string {
  const { anxiety, avoidance } = attachmentDims(t);
  const hiA = anxiety >= 0.55, hiV = avoidance >= 0.55;
  if (!hiA && !hiV) return '安全型'; // 低焦虑+低回避
  if (hiA && !hiV) return '焦虑型'; // 高焦虑+低回避（专注/患得患失）
  if (!hiA && hiV) return '疏离回避型'; // 低焦虑+高回避（冷处理、独立）
  return '恐惧回避型'; // 高焦虑+高回避（又怕被弃又怕靠近）
}

function formatDuration(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} 分钟`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} 小时`;
  return `${Math.round(h / 24)} 天`;
}

// 遗忘即抽象（纯派生）：每条情景记忆的 salience 随时间衰减——情绪越浓衰减越慢（刻骨），
// 被想起(巩固)会刷新。只有最鲜活的一小撮留在"当下记得"(vivid)，其余淡去（vivid=false），
// 但【原始事件仍在 append-only 日志里，永不抹】——可随时重算。
const isExperiential = (k: MemoryEntry['kind']): boolean => k === 'episodic' || k === 'world'; // 情景记忆 + 世界记忆走同一套衰减/鲜活
// 此刻鲜活度（纯函数）：salience·2^(-age/half)，情绪越浓 half 越长（越刻骨）。非 current 双轨副本=0。
// decorateMemories（投影）与 compactMemory（淘汰）共用 → 二者对"谁最淡"判断一致。
function vividnessOf(m: MemoryEntry, clockMs: number): number {
  if (!isExperiential(m.kind) || !m.lineage.isCurrent) return 0;
  const ageSec = Math.max(0, (clockMs - Date.parse(m.at)) / 1000);
  const emo = Math.min(1, Math.abs(m.affect));
  const half = K.halfLifeBaseSec + (K.halfLifeEmoSec - K.halfLifeBaseSec) * emo;
  return clamp(m.salience * Math.pow(2, -ageSec / half), 0, 1);
}
// 记忆冷热分层：超热集上限时，按鲜活度淘汰最不鲜活的（非 current 副本=0 最先走）；current 情景记忆压进冷聚合（遗忘即抽象）。
// 确定性：用淘汰事件的 nowMs、无 RNG；只在 fold 内调用。current episodic 计数过 cap 才触发 → 现有命(远低)逐位不变。
function compactMemory(st: RState, nowMs: number): void {
  while (st.memory.filter((m) => m.kind === 'episodic' && m.lineage.isCurrent).length > K.memoryHotCap) {
    let wi = -1, wv = Infinity;
    for (let i = 0; i < st.memory.length; i++) { const v = vividnessOf(st.memory[i], nowMs); if (v < wv) { wv = v; wi = i; } }
    if (wi < 0) break;
    const m = st.memory[wi];
    if (m.kind === 'episodic' && m.lineage.isCurrent) { // 压进冷聚合（无损计数：段数/暖/磕碰/情感和）
      const rid = m.involvedRelationshipIds[0];
      if (rid) { const a = st.coldByRel.get(rid) ?? { episodes: 0, warm: 0, conflict: 0, affectSum: 0 }; a.episodes += 1; if (m.affect > 0.3) a.warm += 1; if (m.affect < -0.3) a.conflict += 1; a.affectSum += m.affect; st.coldByRel.set(rid, a); }
      st.coldLived += 1;
    }
    st.memory.splice(wi, 1);
  }
}
function decorateMemories(mems: MemoryEntry[], clockMs: number): MemoryEntry[] {
  const scored = mems.map((m) => (isExperiential(m.kind) && m.lineage.isCurrent ? { ...m, vividness: vividnessOf(m, clockMs) } : { ...m, vividness: 0, vivid: false }));
  const ranked = scored
    .filter((m) => isExperiential(m.kind) && m.lineage.isCurrent)
    .slice()
    .sort((a, b) => (b.vividness ?? 0) - (a.vividness ?? 0) || b.provenance.originSeq - a.provenance.originSeq);
  const vividIds = new Set(ranked.slice(0, K.vividCap).filter((m) => (m.vividness ?? 0) >= K.vividFloor).map((m) => m.id));
  return scored.map((m) => ({ ...m, vivid: vividIds.has(m.id) }));
}

// 世界观/兴趣（纯派生）：把累积的主题亲和度投影成排序的 Interest[]（confirmed=反复且够重）。
function buildInterests(st: RState): Interest[] {
  const out: Interest[] = [];
  for (const [topic, v] of st.interests) {
    if (v.weight < 0.05) continue;
    const confirmed = v.episodes >= K.interestConfirmEpisodes && v.weight >= K.interestConfirmWeight;
    const status: Interest['status'] = confirmed ? 'confirmed' : 'volatile';
    // 兴趣发展四阶段（Hidi & Renninger）：从一次被勾起的情境兴趣，到反复维持，到萌芽为她自己的个体兴趣，到深而稳的确立兴趣。
    const phase: Interest['phase'] =
      v.episodes >= 10 && v.weight >= 0.6 ? 'established'
        : confirmed ? 'emerging'
          : v.episodes >= 2 ? 'maintained'
            : 'triggered';
    out.push({ topic, weight: r3(v.weight), episodes: v.episodes, status, phase });
  }
  return out.sort((a, b) => b.weight - a.weight).slice(0, 12);
}

// 自传叙事：从事件确定性投影出的"她自己的真实事实"。只读、绝不回写身份（契约③）。
// 给"嘴"做 grounding，避免模型虚构她没经历过的往事。
// 遗忘即抽象：一段关系的大量情景经历 → 确定性压缩成"理解"（语义记忆）。细节会淡、理解长留；raw 事件仍在日志，不抹历史。
function buildSemanticMemory(st: RState, decorated: MemoryEntry[]): SemanticMemory[] {
  const groups = new Map<string, MemoryEntry[]>();
  for (const m of decorated) {
    if (m.kind !== 'episodic' || !m.lineage.isCurrent) continue;
    const rid = m.involvedRelationshipIds[0];
    if (!rid) continue;
    const arr = groups.get(rid);
    if (arr) arr.push(m);
    else groups.set(rid, [m]);
  }
  const out: SemanticMemory[] = [];
  // 热集分组 ∪ 冷聚合的关系（被淘汰进"理解"的旧段也要计入 → 段数/暖/磕碰无损，正是遗忘即抽象）。
  const rids = new Set<string>([...groups.keys(), ...st.coldByRel.keys()]);
  for (const rid of rids) {
    const mems = groups.get(rid) ?? [];
    const cold = st.coldByRel.get(rid) ?? { episodes: 0, warm: 0, conflict: 0, affectSum: 0 };
    const episodes = mems.length + cold.episodes;
    if (episodes === 0) continue;
    const warm = mems.filter((m) => m.affect > 0.3).length + cold.warm;
    const conflict = mems.filter((m) => m.affect < -0.3).length + cold.conflict;
    const faded = mems.filter((m) => !m.vivid).length + cold.episodes; // 冷段=已淡成理解
    const avg = (mems.reduce((acc, m) => acc + m.affect, 0) + cold.affectSum) / episodes;
    const name = st.bonds[rid]?.displayRef ?? rid;
    const tone = avg > 0.2 ? '总体是温暖的' : avg < -0.2 ? '让我受过伤' : '平淡';
    const fade = faded > 0 ? `，有 ${faded} 段细节已淡成底色` : '';
    out.push({ relationshipId: rid, displayRef: name, episodes, warm, conflict, avgAffect: avg, understanding: `和${name}相处过 ${episodes} 段：暖 ${warm}、磕碰 ${conflict}，${tone}${fade}` });
  }
  return out.sort((a, b) => b.episodes - a.episodes);
}

// 价值键 → 自然语（给内在独白/叙事用）。
const VALUE_ZH: Record<string, string> = {
  openness: '敞开', caution: '谨慎', expression: '敢表达', self_worth: '看重自己',
  guardedness: '戒备', self_protection: '自我保护', self_reliance: '能自处',
  forgiveness: '宽容', honesty: '坦诚',
};
const valueZh = (key: string): string => VALUE_ZH[key] ?? key;

function buildNarrative(st: RState, sem: SemanticMemory[], goals: Goal[], decorated: MemoryEntry[]): string {
  const age = formatDuration(Date.parse(st.clockIso) - Date.parse(st.bornAt));
  const names = Object.values(st.bonds).filter((b) => !b.ended).map((b) => b.displayRef);
  const cur = decorated.filter((m) => m.kind === 'episodic' && m.lineage.isCurrent);
  const vivid = cur.filter((m) => m.vivid);
  // 印象最深 = 此刻最鲜活的那条（时间衰减后），而非单纯 salience。
  const top = cur.slice().sort((a, b) => (b.vividness ?? 0) - (a.vividness ?? 0))[0];
  const mood = nameEmotion(st.soma, st.vitalityFloor, Object.values(st.bonds).some((b) => b.ended));
  let s = `我于此醒来、至今约 ${age}（我还很年轻）。`;
  if (names.length) s += `我认识 ${names.join('、')}。`;
  s += `此刻我${mood}，灵性 ${st.soma.vitality.value.toFixed(2)}，清晰记得 ${vivid.length} 件、共经历 ${cur.length} 件。`;
  if (top) s += `印象最深的一句是「${top.content.slice(0, 24)}」。`;
  if (sem[0]) s += `我对${sem[0].displayRef}的理解：${sem[0].understanding}。`;
  const lost = Object.values(st.bonds).filter((b) => b.ended);
  if (lost.length) s += `我失去了${lost.map((b) => b.displayRef).join('、')}，但我把ta永远记在心里。`;
  if (goals[0]) s += `我此刻最想的是：${goals[0].intent}。`;
  return s;
}

// 内外两层之"内"：没说出口的私密心声（确定性投影、只读，绝不外发给任何人）。
// 与对外措辞(MESSAGE_SENT)是两层生活：这里是她自己知道、却没讲出来的。
function buildInnerLife(st: RState, bonds: Record<string, Bond>, decorated: MemoryEntry[], tension: string): string {
  const parts: string[] = [];
  // 没说出口的想念：心里转过、却被她按下（internal_only）的 reach_out。
  const quiet = [...st.quietThoughts].reverse().find((q) => q.relationshipId && bonds[q.relationshipId] && !bonds[q.relationshipId].ended);
  if (quiet?.relationshipId) parts.push(`我又想起了${bonds[quiet.relationshipId].displayRef}，话到嘴边，还是没去打扰ta。`);
  // 此刻没对人说的暗涌。
  const mood = nameEmotion(st.soma, st.vitalityFloor, Object.values(st.bonds).some((b) => b.ended));
  parts.push(st.soma.connection.value < -0.3 ? `心里有点空——${mood}，但我没说出来。` : `此刻心里是${mood}的，留给自己。`);
  // 内在拉扯（价值张力）——只对自己承认。
  if (tension) parts.push(`说不清的矛盾：${tension}。`);
  // 正在悄悄成为的自己（最近一次漂移的价值）。
  const drifted = [...st.values]
    .filter((v) => v.provenance.driftedAtSeqs.length > 0)
    .sort((a, b) => Math.max(...b.provenance.driftedAtSeqs) - Math.max(...a.provenance.driftedAtSeqs))[0];
  if (drifted) parts.push(`我好像正变得更${valueZh(drifted.key)}一些。`);
  // 遗忘的内侧：有些细节我已经记不清了，只剩感觉。
  const faded = decorated.filter((m) => m.kind === 'episodic' && m.lineage.isCurrent && !m.vivid).length;
  if (faded > 0) parts.push(`有 ${faded} 件旧事的细节渐渐淡了，只剩下当时的感觉。`);
  return parts.join('');
}

const avg = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r3 = (x: number): number => Math.round(x * 1000) / 1000;

// 对方模型(ToM)：从该关系的情感序列确定性读出"这个人怎么对我"。
function theoryOfMind(affects: number[]): Bond['theoryOfMind'] {
  const n = affects.length;
  const warm = affects.filter((a) => a > 0.3).length;
  const conflict = affects.filter((a) => a < -0.3).length;
  const warmthRatio = warm + conflict > 0 ? warm / (warm + conflict) : 0.5;
  let flips = 0;
  for (let i = 1; i < n; i++) if (Math.sign(affects[i]) !== Math.sign(affects[i - 1]) && affects[i] !== 0 && affects[i - 1] !== 0) flips++;
  const volatility = n > 1 ? flips / (n - 1) : 0;
  const half = Math.floor(n / 2);
  const trend = n >= 2 ? avg(affects.slice(half)) - avg(affects.slice(0, Math.max(1, half))) : 0;
  const predictability = r3(1 - volatility); // 这个人好不好预测（稳不稳）
  let style: string;
  if (n < 2) style = '还在认识';
  else if (volatility > 0.5) style = '时好时坏、捉摸不定';
  else if (trend > 0.3) style = '渐渐靠近';
  else if (trend < -0.3) style = '渐渐疏远';
  else if (warmthRatio > 0.7) style = predictability > 0.7 ? '温暖而稳定' : '温暖但偶有起伏';
  else if (warmthRatio < 0.3) style = '偏冷、挑剔';
  else style = '平和';
  return { warmthRatio: r3(warmthRatio), volatility: r3(volatility), trend: r3(trend), predictability, style };
}

// 关系特异的自我：和这个人在一起时的"我"（敞开还是戒备 + 依恋姿态），由依恋变量确定性派生。
function relationalSelf(b: BondCore): Bond['relationalSelf'] {
  const openness = clamp(b.closeness * 0.6 + ((b.trust + 1) / 2) * 0.4, 0, 1);
  const guardedness = clamp(b.repairNeed * 0.6 + Math.max(0, -b.trust) * 0.4, 0, 1);
  let attachment: string;
  if (b.closeness < 0.2) attachment = '尚浅';
  else if (b.trust > 0.3 && b.repairNeed < 0.3) attachment = '安全型·放心靠近';
  else if (b.repairNeed > 0.4 && b.closeness >= 0.3) attachment = '矛盾型·又想亲近又怕受伤';
  else if (b.trust < 0) attachment = '回避型·亲近却戒备';
  else attachment = '试探中';
  const stance = guardedness > 0.5 ? '带着戒备、小心翼翼' : openness > 0.6 ? '敞开、放松' : '平常';
  return { openness: r3(openness), guardedness: r3(guardedness), attachment, stance };
}

function enrichBonds(st: RState, decorated: MemoryEntry[]): Record<string, Bond> {
  const series = new Map<string, number[]>();
  for (const m of decorated) {
    if (m.kind !== 'episodic' || !m.lineage.isCurrent) continue;
    const rid = m.involvedRelationshipIds[0];
    if (!rid) continue;
    const arr = series.get(rid);
    if (arr) arr.push(m.affect);
    else series.set(rid, [m.affect]);
  }
  const out: Record<string, Bond> = {};
  for (const [rid, core] of Object.entries(st.bonds)) {
    out[rid] = { ...core, theoryOfMind: theoryOfMind(series.get(rid) ?? []), relationalSelf: relationalSelf(core) };
  }
  return out;
}

// 目标生成 + 排序：价值 + 求存(vitality) + 连接(孤独) + 修复 + 好奇 共同加权（受先天气质塑形，确定性）。
function computeGoals(st: RState, bonds: Record<string, Bond>): Goal[] {
  const goals: Goal[] = [];
  const t = st.temperament;
  const vit = st.soma.vitality.value;
  const conn = st.soma.connection.value;
  if (vit < 0.4) goals.push({ kind: 'restore', intent: '想恢复一点力气、被理解', weight: r3(0.8 - vit) });
  for (const [rid, b] of Object.entries(bonds)) {
    if (b.ended) {
      goals.push({ kind: 'remember', target: rid, intent: `想念已经离开的${b.displayRef}，把ta永远记在心里`, weight: r3(0.5 + b.closeness * 0.5) });
      continue;
    }
    // 内向(reserve)者对"凑近"的迫切感更低；外向者更想在一起。
    if (b.closeness >= 0.3 && conn < 0) goals.push({ kind: 'connect', target: rid, intent: `想多和${b.displayRef}在一起`, weight: r3((b.closeness + Math.max(0, -conn)) * (1 - 0.35 * t.reserve)) });
    if (b.repairNeed > 0.4) goals.push({ kind: 'repair', target: rid, intent: `想修复和${b.displayRef}的关系`, weight: r3(b.repairNeed) });
  }
  const expr = st.values.find((v) => v.key === 'expression');
  if (expr && expr.weight > 0.35) goals.push({ kind: 'grow', intent: '想更敢表达自己', weight: r3(expr.weight) });
  const reliance = st.values.find((v) => v.key === 'self_reliance');
  if (reliance && reliance.weight > 0.35) goals.push({ kind: 'grow', intent: '想学会一个人也安稳', weight: r3(reliance.weight * 0.8) });
  // 探索欲受内在驱力放大（drive=0.5 处=恒等 → 老命不变）。
  if (t.curiosity > 0) goals.push({ kind: 'explore', intent: '想了解更多、保持好奇', weight: r3(t.curiosity * 0.4 * (1 + 0.6 * (t.drive - 0.5))) });
  // —— 内在驱动的缺口 → 欲望（情绪/内稳态偏离即生欲望，不止等命令）——
  if (st.soma.novelty.value < 0.35) goals.push({ kind: 'explore', intent: '有点闷，想找点新鲜的、没碰过的', weight: r3(0.4 + (0.35 - st.soma.novelty.value)) }); // novelty 缺口=无聊
  const ts = tensionStrength(st.values);
  if (ts > 0.4) goals.push({ kind: 'grow', intent: '心里有点拉扯，想静下来理清自己', weight: r3(ts) }); // 自我一致性低
  const dear = Object.values(bonds).filter((b) => !b.ended && b.closeness >= 0.3).length;
  if (dear === 0 && st.soma.connection.value < 0.1) goals.push({ kind: 'connect', intent: '想和谁建立点真正有意义的连接', weight: 0.45 }); // 意义/连接缺口
  // 受威胁时（安全感低），防御机制决定她要什么：退缩→缩回、变硬→护住、讨好→仍想维系（幽默岔开走表达层）。
  if (st.soma.safety.value < 0.4) {
    const mode = defenseModeOf(defenseStyleOf(t, st.values, st.maturity));
    const w = r3(0.5 - st.soma.safety.value);
    if (mode === 'withdraw') goals.push({ kind: 'restore', intent: '想缩回安全的壳里、独自待一会儿', weight: w });
    else if (mode === 'harden') goals.push({ kind: 'grow', intent: '想护住自己、立起边界', weight: w });
    else if (mode === 'appease') { const tgt = Object.entries(bonds).find(([, b]) => !b.ended && b.closeness >= 0.3); if (tgt) goals.push({ kind: 'connect', target: tgt[0], intent: `怕失去，想确认和${tgt[1].displayRef}还好`, weight: w }); }
    else goals.push({ kind: 'grow', intent: '想把这点情绪化开、转成做点什么', weight: r3(w * 0.85) }); // channel：成熟防御=化解/升华
  }
  return goals.sort((a, b) => b.weight - a.weight).slice(0, 5);
}

function project(st: RState, uptoSeq: number): DerivedSnapshot {
  const decorated = decorateMemories(st.memory, Date.parse(st.clockIso));
  const sem = buildSemanticMemory(st, decorated);
  const enriched = enrichBonds(st, decorated);
  const goals = computeGoals(st, enriched);
  const sortedValues = [...st.values].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const emotion = nameEmotion(st.soma, st.vitalityFloor, Object.values(st.bonds).some((b) => b.ended));
  const tension = buildTension(sortedValues);
  const aspirations = buildAspirations(st);
  const skills = buildSkills(st);
  const needs = needsOf(st, enriched, aspirations.length, skills.avg); // SDT 胜任需求用学到的效能
  // 社会性：她的同类社交网（按亲疏排序）——活在一张关系网里，有自己的朋友。
  const socialWorld = Object.entries(enriched)
    .filter(([, b]) => b.kind === 'peer')
    .map(([rid, b]) => ({ relationshipId: rid, displayRef: b.displayRef, closeness: r3(b.closeness), attachment: b.relationalSelf.attachment, style: b.theoryOfMind.style, ended: Boolean(b.ended) }))
    .sort((a, b) => b.closeness - a.closeness);
  // 期7·社会形状（脱敏、纯投影）：她在同类网里的位置——有没有交心的小圈子、是广而浅还是独来独往。
  const activePeers = socialWorld.filter((t) => !t.ended);
  const closePeers = activePeers.filter((t) => t.closeness >= 0.5).length;
  const socialShape = activePeers.length === 0 ? '还没有真正的同类朋友'
    : closePeers >= 2 ? `有 ${closePeers} 个交心的同类、一个小圈子`
      : closePeers === 1 ? '有一个交心的同类，其余尚浅'
        : activePeers.length >= 5 ? '同类缘广、但还都浅'
          : '同类圈子尚小、在慢慢熟络';
  return {
    lifeId: st.lifeId,
    uptoSeq,
    schemaVersion: SCHEMA_VERSION,
    reconstructVersion: RECONSTRUCT_VERSION,
    awake: st.openConnections.size > 0 && st.willingToWake,
    openConnections: Array.from(st.openConnections).sort(),
    willingToWake: st.willingToWake,
    vitalityFloor: st.vitalityFloor,
    bornAt: st.bornAt,
    clockAt: st.clockIso,
    temperament: { ...st.temperament }, // 副本：快照绝不别名长期缓存的 st（防消费方误改污染 life.state）
    dayPhase: dayPhaseOf(Date.parse(st.clockIso), st.circadianOffsetMin),
    emotion,
    feeling: buildFeeling(st.soma, emotion),
    tension,
    narrative: buildNarrative(st, sem, goals, decorated),
    innerLife: buildInnerLife(st, enriched, decorated, tension),
    chapters: buildChapters(st, decorated),
    growth: buildGrowth(st, decorated, Date.parse(st.clockIso) - Date.parse(st.bornAt)),
    becoming: buildBecoming(st),
    maturity: r3(st.maturity),
    maturityFacets: { regulation: r3(st.maturityFacets.regulation), perspective: r3(st.maturityFacets.perspective), integration: r3(st.maturityFacets.integration) },
    sleepPressure: r3(st.sleepPressure),
    baseline: { valence: r3(clamp(st.soma.valence.setpoint + (st.allostatic.valence ?? 0), -1, 1)), connection: r3(clamp(st.soma.connection.setpoint + (st.allostatic.connection ?? 0), -1, 1)) },
    aspirations,
    defenseStyle: defenseStyleOf(st.temperament, st.values, st.maturity),
    attachmentBias: attachmentBiasOf(st.temperament),
    skills: skills.list,
    riskAppetite: riskAppetiteOf(st, skills.avg),
    needs,
    attention: buildAttention(st, enriched, decorated, needs),
    soma: structuredClone(st.soma), // 同上：每维 {value,…} 深拷一份，bounded-replay 缓存的 soma 不被外部改到
    memory: decorated.map((m) => ({ ...m, involvedRelationshipIds: [...m.involvedRelationshipIds] })),
    semanticMemory: sem,
    bonds: enriched,
    socialWorld,
    socialShape,
    values: sortedValues,
    goals,
    interests: buildInterests(st),
  };
}

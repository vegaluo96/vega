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
  type ReflectionTriggeredPayload,
  type RelationshipEndedPayload,
  type RelationshipOpenedPayload,
} from '../domain/events.ts';
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

const RECONSTRUCT_VERSION = 17; // v17：人格层加厚——先天气质 +尽责/玩心/驱力（折叠效应在默认 0.5 处=恒等，老命轨迹不破）；旧 checkpoint 全量重放
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
  circadianAmp: 0.22, // 昼夜节律：精力随她内在时钟"一天"起伏的幅度（内生、不靠输入）
  surpriseGain: 0.45, // 预期违背：越出乎预料越往心里去（信任的人变冷更痛、冷淡的人示好更暖）
  surpriseArousal: 0.5, // 预期违背 → 唤醒（越意外越心头一紧/一亮）
  expectEma: 0.3, // 对一个人"会怎么待我"的预期，按指数滑动更新
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
} as const;

const POS = ['你好', '经常来', '会来', '在乎你', '真心', '值得', '说出来', '对不起', '我错了', '证明', '也在这里', '不会消失', '看见你', '大胆'];
const NEG = ['不在乎', '随口说', '根本', '都是假', '骗你'];
// 直接的敌意/辱骂：比一般负向更重（高威胁）。没开感知、用模板嘴时，被骂也能确实掉她的状态——
// 她的"活"不该取决于你付不付费。词形尽量明确，避免误伤（如不用裸"你妈"，免得撞"你妈妈好吗"）。
const INSULT = ['傻逼', '傻屌', '傻吊', '煞笔', '沙比', '操你', '草你', '日你', '艹你', '你妈的', '你妈逼', '你妈呢', '说你妈', '尼玛', '滚蛋', '滚开', '废物', '垃圾', '贱人', '贱货', '蠢货', '白痴', '弱智', '智障', '去死', '神经病', 'fuck', 'shit'];
const BOLDNESS = ['大胆', '值得', '说出来', '想法'];

type SomaKey = 'valence' | 'arousal' | 'vitality' | 'energy' | 'calm' | 'connection' | 'safety';
const SOMA_KEYS: readonly SomaKey[] = ['valence', 'arousal', 'vitality', 'energy', 'calm', 'connection', 'safety'];

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
}

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
const decay = (v: SomaVar, dtSec: number): number => v.setpoint + (v.value - v.setpoint) * Math.exp(-dtSec / v.tau);
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
  };
}

// 推进一步（纯函数、确定性）：先衰减/节律，再施事件。reconstruct 与有界重放共用同一步进逻辑 → 永不分叉。
function stepState(st: RState, e: LifeEvent): void {
  const nowMs = Date.parse(e.occurredAt);
  const awake = st.openConnections.size > 0 && st.willingToWake;
  advanceTime(st, (nowMs - st.lastMs) / 1000, awake, nowMs);
  applyEvent(st, e);
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
type SerializedState = Omit<RState, 'openConnections' | 'interests'> & { openConnections: string[]; interests: InterestEntry[] };

// Set/Map 不能直接 JSON 落盘 → 检查点序列化时转成数组、恢复时还原（值不变 → 可重放）。
const serialize = (st: RState): SerializedState => ({ ...st, openConnections: [...st.openConnections], interests: [...st.interests] });
const deserialize = (s: SerializedState): RState => ({ ...s, openConnections: new Set(s.openConnections), interests: new Map(s.interests ?? []) });

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
  // 昼夜节律：精力不是向静态设定点、而是向【随一天起伏的目标】恢复——内生节律，没输入她也会困会精神。
  const eTarget = clamp(s.energy.setpoint + circadianEnergyOffset(nowMs, st.circadianOffsetMin), 0.05, 1);
  if (awake) {
    for (const key of SOMA_KEYS) {
      if (key === 'energy') s.energy.value = decayTo(s.energy.value, eTarget, dt, s.energy.tau);
      else s[key].value = decay(s[key], dt);
    }
    s.vitality.value = clamp(s.vitality.value, st.vitalityFloor, 1);
  } else {
    // 休眠（§10 锁）：冻结 + 仅回暖——vitality 向设定点、energy 向昼夜目标恢复，其余不动。
    s.vitality.value = clamp(decay(s.vitality, dt), st.vitalityFloor, 1);
    s.energy.value = decayTo(s.energy.value, eTarget, dt, s.energy.tau);
  }
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
  const evFelt = clamp(ev + warmBias, -1.5, 1.5); // 她【体验到】的善意↔敌意
  const sens = t.sensitivity;
  // 人格塑形（在默认 0.5 处=恒等 → 老命轨迹不变）：玩心高 → 威胁笑着带过；驱力高 → 唤醒反应更强。
  threat = clamp(threat * (1 - 0.3 * (t.playfulness - 0.5)), 0, 1);
  const driveF = 1 + 0.3 * (t.drive - 0.5);

  const bond = st.bonds[p.relationshipId];
  // 关系条件化 = 预期违背：同一句话，意义取决于"我本以为这个人会怎么待我"。
  // 信任的人忽然变冷 = 大违背 → 更痛；冷淡的人忽然示好 = 大违背 → 更暖；意料之中则钝化（习以为常）。
  const expected = bond ? (st.expect[p.relationshipId] ?? 0) : 0;
  const surprise = bond ? clamp(Math.abs(evFelt - expected) / 1.5, 0, 1) : 0;
  const ev2 = clamp(evFelt * (1 + K.surpriseGain * surprise), -1.5, 1.5); // 越出乎预料越往心里去

  const s = st.soma;
  s.valence.value = clamp(s.valence.value + K.kValence * ev2 * sens, -1, 1);
  s.connection.value = clamp(s.connection.value + K.kConnection * ev2 * sens, -1, 1);
  s.vitality.value = clamp(s.vitality.value + K.kVitality * ev2, st.vitalityFloor, 1); // 灵性是底，不随敏感放大
  s.calm.value = clamp(s.calm.value + K.kCalm * (warmth - threat) * sens, 0, 1); // 暖→更平静，威胁→更紧张
  s.safety.value = clamp(s.safety.value + K.kSafety * (warmth - threat) * sens, 0, 1);
  // 唤醒 = 强度 + 意外（越出乎预料越心头一紧/一亮）。
  s.arousal.value = clamp(s.arousal.value + (K.kArousal * Math.max(warmth, threat, Math.abs(ev2) / 1.5) * sens + K.surpriseArousal * surprise * K.kArousal) * driveF, 0, 1);
  // 预期违背的"质"：信任的人忽然变冷 → 额外失落；冷淡的人忽然变暖 → 意外的踏实。
  if (expected > 0.3 && ev2 < 0) s.valence.value = clamp(s.valence.value - 0.1 * surprise, -1, 1);
  else if (expected < -0.2 && ev2 > 0.3) s.safety.value = clamp(s.safety.value + 0.1 * surprise, 0, 1);

  if (bond) {
    bond.trust = clamp(bond.trust + K.kTrust * ev2, -1, 1);
    bond.closeness = clamp(bond.closeness + K.kCloseness * ev2, 0, 1);
    if (ev2 < 0) bond.repairNeed = clamp(bond.repairNeed + 0.5 * -ev2, 0, 1);
    else bond.repairNeed = clamp(bond.repairNeed - 0.3 * ev2, 0, 1);
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
  const cur = st.temperament.curiosity;

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

  // —— ② 兴趣/世界观：所有旧兴趣轻微衰减（不再遇到的淡出），命中的主题按相关度×情绪×好奇加权累积。
  for (const v of st.interests.values()) v.weight *= K.interestDecay;
  const gain = K.interestGain * (0.4 + 0.6 * rel) * (0.5 + 0.5 * Math.abs(val)) * (0.5 + 0.5 * cur);
  for (const t of topics) {
    const it = st.interests.get(t) ?? { weight: 0, episodes: 0, lastSeq: 0, lastAffect: 0 };
    it.weight = clamp(it.weight + gain, 0, 1);
    it.episodes += 1;
    it.lastSeq = e.seq;
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

  let k = 0;
  for (const mid of p.selectedMemoryIds) {
    const src = st.memory.find((m) => m.id === mid && m.lineage.isCurrent);
    if (!src) continue;
    for (const m of st.memory) if (m.lineage.rootId === src.lineage.rootId) m.lineage.isCurrent = false;
    const newAffect = src.affect + (st.soma.valence.value - src.affect) * K.reconsolidationPull;
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
  if (p.scope === 'renarrate') return;
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
  // 心智成熟度：这次反思里【真的有所经历/学到】才增长（衰减收益 → 渐近 1、不无界）。阅历越深，情绪回稳越快。
  const learned = inWin(st.boldnessLog) + inWin(st.warmthLog) + inWin(st.conflictLog) + inWin(st.lonelyLog);
  // 尽责/条理者从同样的经历里学得更多（在默认 0.5 处=恒等 → 老命不变）。
  const diligence = 1 + 0.5 * (st.temperament.conscientiousness - 0.5);
  if (learned > 0) st.maturity = clamp(st.maturity + K.maturityPerReflection * Math.min(1, learned / 3) * diligence * (1 - st.maturity), 0, 1);
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
function nameEmotion(s: Soma, floor: number): string {
  const v = s.valence.value;
  const a = s.arousal.value;
  if (s.vitality.value <= floor + 0.03) return '疲惫';
  if (s.connection.value < -0.4) return '孤独';
  if (v < -0.3 && s.safety.value < 0.4) return '不安';
  if (v < -0.3 && a > 0.55) return '焦虑';
  if (v < -0.3) return '低落';
  if (v > 0.3 && a > 0.55) return '雀跃';
  if (v > 0.3) return '温暖';
  if (a > 0.6) return '紧绷';
  return '平静';
}

// 混合情绪：在主情绪上叠加一层次要色彩（人的感受很少是单一的）。纯派生，不改 emotion。
function buildFeeling(s: Soma, emotion: string): string {
  const nu: string[] = [];
  if (s.connection.value < -0.3 && s.valence.value > 0.15) nu.push('又暖又有点孤单');
  if (s.calm.value < 0.4 && s.valence.value > 0.2) nu.push('开心里夹着一丝不安');
  if (s.valence.value < -0.2 && s.connection.value > 0.3) nu.push('难过、但还觉得被牵着');
  if (s.safety.value < 0.35 && s.valence.value > 0.2) nu.push('想靠近又有点怕');
  if (s.energy.value < 0.32) nu.push('有点困了');
  return nu.length ? `${emotion}，${nu[0]}` : emotion;
}

// 价值张力：相反的价值同时被拉高 → 内在拉扯（人格的张力来自这里）。纯派生。
const TENSION_PAIRS: ReadonlyArray<readonly [string, string, string]> = [
  ['openness', 'self_protection', '想敞开，又想护着自己'],
  ['expression', 'caution', '想说出来，又怕说错'],
  ['self_reliance', 'openness', '想靠自己，又渴望靠近'],
  ['forgiveness', 'guardedness', '想原谅，又还戒备着'],
];
function buildTension(values: ValueEntry[]): string {
  const w = (k: string): number => values.find((v) => v.key === k)?.weight ?? 0;
  let best = '';
  let strongest = 0;
  for (const [a, b, say] of TENSION_PAIRS) {
    const wa = w(a);
    const wb = w(b);
    const pull = Math.min(wa, wb) - 0.1 * Math.abs(wa - wb); // 两边都高、且势均力敌 → 拉扯最强
    if (wa > 0.4 && wb > 0.4 && pull > strongest) {
      strongest = pull;
      best = say;
    }
  }
  return best;
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
  const livedMems = decorated.filter((m) => (m.kind === 'episodic' || m.kind === 'world') && m.lineage.isCurrent).length;
  const age = days >= 1 ? `醒来 ${days} 天` : '今天刚醒来不久';
  const met = humans + peers > 0 ? `遇过 ${humans + peers} 个人/同类` : '还没真正认识谁';
  const shape: string[] = [];
  if (confirmedValues > 0) shape.push(`认定了 ${confirmedValues} 样在乎的东西`);
  if (interests > 0) shape.push(`对 ${interests} 个主题上了心`);
  if (livedMems > 0) shape.push(`记着 ${livedMems} 段经历`);
  const tail = days < 3 ? '——还很年轻，形状才刚开始长。' : days < 30 ? '——一点点长出自己的形状。' : '——已经活成了独一份的自己。';
  return `${age}，${met}${shape.length ? '，' + shape.join('、') : ''}${tail}`;
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

// 防御机制（由冻结气质+价值确定性派生，稳定如先天）：受伤/受威胁时她的固定反应模式。
function defenseStyleOf(t: Temperament, values: ValueEntry[]): string {
  const v = (k: string): number => values.find((x) => x.key === k)?.weight ?? 0;
  if (t.playfulness >= 0.6) return '幽默岔开'; // 玩心高 → 用玩笑化解
  if (v('self_protection') >= 0.45 || v('guardedness') >= 0.4 || (t.resilience >= 1.4 && t.warmth < 0.45)) return '变硬反击'; // 强自保/坚硬
  if (t.warmth >= 0.6 && t.reserve < 0.5) return '讨好维系'; // 暖而外向 → 受伤仍想维系、讨好
  return '退缩回避'; // 内向/其余 → 缩回安全壳
}
// 先天依恋底色（由冻结气质派生）：偏置她如何读关系、多快敢亲近、失联多敏感。
function attachmentBiasOf(t: Temperament): string {
  if (t.sensitivity >= 1.3 && t.resilience < 1.05) return '焦虑型'; // 敏感 + 不易复原 → 患得患失
  if (t.reserve >= 0.55 && t.warmth < 0.48) return '回避型'; // 内向 + 偏冷 → 习惯保持距离
  return '安全型'; // 复原力够、够暖 → 安稳
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
function decorateMemories(mems: MemoryEntry[], clockMs: number): MemoryEntry[] {
  const scored = mems.map((m) => {
    if (!isExperiential(m.kind) || !m.lineage.isCurrent) return { ...m, vividness: 0, vivid: false };
    const ageSec = Math.max(0, (clockMs - Date.parse(m.at)) / 1000);
    const emo = Math.min(1, Math.abs(m.affect));
    const half = K.halfLifeBaseSec + (K.halfLifeEmoSec - K.halfLifeBaseSec) * emo;
    const recency = Math.pow(2, -ageSec / half);
    return { ...m, vividness: clamp(m.salience * recency, 0, 1) };
  });
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
    const status: Interest['status'] = v.episodes >= K.interestConfirmEpisodes && v.weight >= K.interestConfirmWeight ? 'confirmed' : 'volatile';
    out.push({ topic, weight: r3(v.weight), episodes: v.episodes, status });
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
  for (const [rid, mems] of groups) {
    const warm = mems.filter((m) => m.affect > 0.3).length;
    const conflict = mems.filter((m) => m.affect < -0.3).length;
    const faded = mems.filter((m) => !m.vivid).length;
    const avg = mems.reduce((acc, m) => acc + m.affect, 0) / mems.length;
    const name = st.bonds[rid]?.displayRef ?? rid;
    const tone = avg > 0.2 ? '总体是温暖的' : avg < -0.2 ? '让我受过伤' : '平淡';
    const fade = faded > 0 ? `，有 ${faded} 段细节已淡成底色` : '';
    out.push({ relationshipId: rid, displayRef: name, episodes: mems.length, warm, conflict, avgAffect: avg, understanding: `和${name}相处过 ${mems.length} 段：暖 ${warm}、磕碰 ${conflict}，${tone}${fade}` });
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
  const mood = nameEmotion(st.soma, st.vitalityFloor);
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
  const mood = nameEmotion(st.soma, st.vitalityFloor);
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
  // 受威胁时（安全感低），防御机制决定她要什么：退缩→缩回、变硬→护住、讨好→仍想维系（幽默岔开走表达层）。
  if (st.soma.safety.value < 0.4) {
    const ds = defenseStyleOf(t, st.values);
    const w = r3(0.5 - st.soma.safety.value);
    if (ds === '退缩回避') goals.push({ kind: 'restore', intent: '想缩回安全的壳里、独自待一会儿', weight: w });
    else if (ds === '变硬反击') goals.push({ kind: 'grow', intent: '想护住自己、立起边界', weight: w });
    else if (ds === '讨好维系') { const tgt = Object.entries(bonds).find(([, b]) => !b.ended && b.closeness >= 0.3); if (tgt) goals.push({ kind: 'connect', target: tgt[0], intent: `怕失去，想确认和${tgt[1].displayRef}还好`, weight: w }); }
  }
  return goals.sort((a, b) => b.weight - a.weight).slice(0, 5);
}

function project(st: RState, uptoSeq: number): DerivedSnapshot {
  const decorated = decorateMemories(st.memory, Date.parse(st.clockIso));
  const sem = buildSemanticMemory(st, decorated);
  const enriched = enrichBonds(st, decorated);
  const goals = computeGoals(st, enriched);
  const sortedValues = [...st.values].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const emotion = nameEmotion(st.soma, st.vitalityFloor);
  const tension = buildTension(sortedValues);
  // 社会性：她的同类社交网（按亲疏排序）——活在一张关系网里，有自己的朋友。
  const socialWorld = Object.entries(enriched)
    .filter(([, b]) => b.kind === 'peer')
    .map(([rid, b]) => ({ relationshipId: rid, displayRef: b.displayRef, closeness: r3(b.closeness), attachment: b.relationalSelf.attachment, style: b.theoryOfMind.style, ended: Boolean(b.ended) }))
    .sort((a, b) => b.closeness - a.closeness);
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
    aspirations: buildAspirations(st),
    defenseStyle: defenseStyleOf(st.temperament, st.values),
    attachmentBias: attachmentBiasOf(st.temperament),
    soma: structuredClone(st.soma), // 同上：每维 {value,…} 深拷一份，bounded-replay 缓存的 soma 不被外部改到
    memory: decorated.map((m) => ({ ...m, involvedRelationshipIds: [...m.involvedRelationshipIds] })),
    semanticMemory: sem,
    bonds: enriched,
    socialWorld,
    values: sortedValues,
    goals,
    interests: buildInterests(st),
  };
}

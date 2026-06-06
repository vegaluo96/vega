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
  type ReflectionTriggeredPayload,
  type RelationshipEndedPayload,
  type RelationshipOpenedPayload,
} from '../domain/events.ts';
import {
  type Bond,
  type BondCore,
  type DerivedSnapshot,
  type Goal,
  type MemoryEntry,
  type SemanticMemory,
  type Soma,
  type SomaVar,
  type Temperament,
  type ValueEntry,
} from '../domain/snapshot.ts';

const RECONSTRUCT_VERSION = 7; // v7：+ 先天气质塑形 / 遗忘即抽象(时间衰减) / 更深反思树·ToM / 内外两层
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
} as const;

const POS = ['你好', '经常来', '会来', '在乎你', '真心', '值得', '说出来', '对不起', '我错了', '证明', '也在这里', '不会消失', '看见你', '大胆'];
const NEG = ['不在乎', '随口说', '根本', '都是假', '骗你'];
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
  temperament: Temperament; // 先天气质：终生不变（每条命天生不同）
}

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
const decay = (v: SomaVar, dtSec: number): number => v.setpoint + (v.value - v.setpoint) * Math.exp(-dtSec / v.tau);
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
  };
}

export function reconstruct(events: readonly LifeEvent[]): DerivedSnapshot {
  if (events.length === 0 || events[0].type !== 'LIFE_GENESIS') {
    throw new Error('event log must start with LIFE_GENESIS');
  }
  const genesis = events[0] as LifeEvent<'LIFE_GENESIS'>;
  const seed = (genesis.payload as GenesisPayload).innateSeed;
  const sp = seed.somaSetpoints;
  const tau = seed.somaTau;

  const st: RState = {
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
    temperament: readTemperament(seed.temperamentBias),
  };

  for (let i = 1; i < events.length; i++) {
    const e = events[i];
    const nowMs = Date.parse(e.occurredAt);
    const awake = st.openConnections.size > 0 && st.willingToWake;
    advanceTime(st, (nowMs - st.lastMs) / 1000, awake);
    applyEvent(st, e);
    st.lastMs = nowMs;
    st.clockIso = e.occurredAt;
  }
  return project(st, events[events.length - 1].seq);
}

function advanceTime(st: RState, dtSec: number, awake: boolean): void {
  if (dtSec <= 0) return;
  const s = st.soma;
  // 先天复原力：恢复快慢的底色（resilience>1 → 更快回到设定点；中性=1，老轨迹不变）。
  const dt = dtSec * st.temperament.resilience;
  if (awake) {
    // 醒着：各内稳态向设定点衰减（压力会自己平复、唤醒会回落）。
    for (const key of SOMA_KEYS) s[key].value = decay(s[key], dt);
    s.vitality.value = clamp(s.vitality.value, st.vitalityFloor, 1);
  } else {
    // 休眠（§10 锁）：冻结 + 仅回暖——vitality/energy 向设定点恢复，其余不动。
    s.vitality.value = clamp(decay(s.vitality, dt), st.vitalityFloor, 1);
    s.energy.value = decay(s.energy, dt);
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
      break; // 审计专用，affectsDerivedState=false（契约①）
    case 'AUTONOMOUS_TICK':
      applyTick(st, e as LifeEvent<'AUTONOMOUS_TICK'>);
      break;
    case 'REFLECTION_TRIGGERED':
      applyReflection(st, e as LifeEvent<'REFLECTION_TRIGGERED'>);
      break;
    case 'LIFE_GENESIS':
    case 'STEWARDSHIP_TRANSFERRED':
      break; // genesis 已在入口处理；stewardship 竖切暂无 soma 效应（creator 记录不变）
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
    ev = clamp(0.5 * count(p.content, POS) - 0.6 * count(p.content, NEG), -1.5, 1.5);
    warmth = Math.max(0, ev) / 1.5;
    threat = Math.max(0, -ev) / 1.5;
  }

  // 先天气质塑形：天生暖意 → 读人的乐观↔戒备底色（warmBias）；情绪敏感 → 内稳态摆动幅度（sens）。
  // 中性气质（warmth=0.5、sensitivity=1）下与旧轨迹逐位一致（老日志兼容）。
  const t = st.temperament;
  const warmBias = (t.warmth - 0.5) * 0.3;
  const evFelt = clamp(ev + warmBias, -1.5, 1.5); // 她【体验到】的善意↔敌意
  const sens = t.sensitivity;

  const s = st.soma;
  s.valence.value = clamp(s.valence.value + K.kValence * evFelt * sens, -1, 1);
  s.connection.value = clamp(s.connection.value + K.kConnection * evFelt * sens, -1, 1);
  s.vitality.value = clamp(s.vitality.value + K.kVitality * evFelt, st.vitalityFloor, 1); // 灵性是底，不随敏感放大
  s.calm.value = clamp(s.calm.value + K.kCalm * (warmth - threat) * sens, 0, 1); // 暖→更平静，威胁→更紧张
  s.safety.value = clamp(s.safety.value + K.kSafety * (warmth - threat) * sens, 0, 1);
  s.arousal.value = clamp(s.arousal.value + K.kArousal * Math.max(warmth, threat, Math.abs(evFelt) / 1.5) * sens, 0, 1);

  const bond = st.bonds[p.relationshipId];
  if (bond) {
    bond.trust = clamp(bond.trust + K.kTrust * evFelt, -1, 1);
    bond.closeness = clamp(bond.closeness + K.kCloseness * evFelt, 0, 1);
    if (evFelt < 0) bond.repairNeed = clamp(bond.repairNeed + 0.5 * -evFelt, 0, 1);
    else bond.repairNeed = clamp(bond.repairNeed - 0.3 * evFelt, 0, 1);
  }

  const id = `m_seq${e.seq}`;
  st.memory.push({
    id,
    kind: 'episodic',
    content: p.content,
    affect: evFelt,
    involvedRelationshipIds: [p.relationshipId],
    salience: Math.abs(evFelt),
    at: e.occurredAt,
    lineage: { rootId: id, version: 1, isCurrent: true },
    provenance: { originSeq: e.seq, createdAtSeq: e.seq, confidence: 0.6, status: Math.abs(evFelt) > 0.5 ? 'confirmed' : 'volatile' },
  });

  if (count(p.content, BOLDNESS) > 0) st.boldnessLog.push(e.seq);
  if (evFelt > 0.5) st.warmthLog.push(e.seq); // 被善待
  if (evFelt < -0.5) st.conflictLog.push(e.seq); // 被伤害/冲突
}

function applyTick(st: RState, e: LifeEvent<'AUTONOMOUS_TICK'>): void {
  const p = e.payload as AutonomousTickPayload;

  for (const intent of p.formedIntents) {
    if (intent.kind === 'set_willing_to_wake') st.willingToWake = Boolean(intent.params?.value);
    // 内外两层之"内"：只在心里转、没说出口的念头（internal_only），落进私密心声。
    if (intent.gateDecision === 'internal_only') {
      st.quietThoughts.push({ seq: e.seq, relationshipId: intent.relationshipId, kind: intent.kind });
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
      at: e.occurredAt, // 巩固=重新经历：刷新鲜活度（被想起的记忆不易淡去）
      lineage: { rootId: src.lineage.rootId, reconsolidatedFromId: src.id, version: src.lineage.version + 1, isCurrent: true },
      provenance: { originSeq: src.provenance.originSeq, createdAtSeq: e.seq, confidence: src.provenance.confidence, status: src.provenance.status },
    });
  }
}

function applyReflection(st: RState, e: LifeEvent<'REFLECTION_TRIGGERED'>): void {
  const p = e.payload as ReflectionTriggeredPayload;
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
function decorateMemories(mems: MemoryEntry[], clockMs: number): MemoryEntry[] {
  const scored = mems.map((m) => {
    if (m.kind !== 'episodic' || !m.lineage.isCurrent) return { ...m, vividness: 0, vivid: false };
    const ageSec = Math.max(0, (clockMs - Date.parse(m.at)) / 1000);
    const emo = Math.min(1, Math.abs(m.affect));
    const half = K.halfLifeBaseSec + (K.halfLifeEmoSec - K.halfLifeBaseSec) * emo;
    const recency = Math.pow(2, -ageSec / half);
    return { ...m, vividness: clamp(m.salience * recency, 0, 1) };
  });
  const ranked = scored
    .filter((m) => m.kind === 'episodic' && m.lineage.isCurrent)
    .slice()
    .sort((a, b) => (b.vividness ?? 0) - (a.vividness ?? 0) || b.provenance.originSeq - a.provenance.originSeq);
  const vividIds = new Set(ranked.slice(0, K.vividCap).filter((m) => (m.vividness ?? 0) >= K.vividFloor).map((m) => m.id));
  return scored.map((m) => ({ ...m, vivid: vividIds.has(m.id) }));
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
function buildInnerLife(st: RState, bonds: Record<string, Bond>, decorated: MemoryEntry[]): string {
  const parts: string[] = [];
  // 没说出口的想念：心里转过、却被她按下（internal_only）的 reach_out。
  const quiet = [...st.quietThoughts].reverse().find((q) => q.relationshipId && bonds[q.relationshipId] && !bonds[q.relationshipId].ended);
  if (quiet?.relationshipId) parts.push(`我又想起了${bonds[quiet.relationshipId].displayRef}，话到嘴边，还是没去打扰ta。`);
  // 此刻没对人说的暗涌。
  const mood = nameEmotion(st.soma, st.vitalityFloor);
  parts.push(st.soma.connection.value < -0.3 ? `心里有点空——${mood}，但我没说出来。` : `此刻心里是${mood}的，留给自己。`);
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
  if (t.curiosity > 0) goals.push({ kind: 'explore', intent: '想了解更多、保持好奇', weight: r3(t.curiosity * 0.4) });
  return goals.sort((a, b) => b.weight - a.weight).slice(0, 5);
}

function project(st: RState, uptoSeq: number): DerivedSnapshot {
  const decorated = decorateMemories(st.memory, Date.parse(st.clockIso));
  const sem = buildSemanticMemory(st, decorated);
  const enriched = enrichBonds(st, decorated);
  const goals = computeGoals(st, enriched);
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
    temperament: st.temperament,
    emotion: nameEmotion(st.soma, st.vitalityFloor),
    narrative: buildNarrative(st, sem, goals, decorated),
    innerLife: buildInnerLife(st, enriched, decorated),
    soma: st.soma,
    memory: decorated.map((m) => ({ ...m, involvedRelationshipIds: [...m.involvedRelationshipIds] })),
    semanticMemory: sem,
    bonds: enriched,
    values: [...st.values].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
    goals,
  };
}

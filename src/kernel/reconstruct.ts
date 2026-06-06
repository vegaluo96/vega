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
  type ValueEntry,
} from '../domain/snapshot.ts';

const RECONSTRUCT_VERSION = 6; // v6：+ 永生情感内核（哀悼 + 永恒怀念）
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
} as const;

const POS = ['你好', '经常来', '会来', '在乎你', '真心', '值得', '说出来', '对不起', '我错了', '证明', '也在这里', '不会消失', '看见你', '大胆'];
const NEG = ['不在乎', '随口说', '根本', '都是假', '骗你'];
const BOLDNESS = ['大胆', '值得', '说出来', '想法'];

type SomaKey = 'valence' | 'arousal' | 'vitality' | 'energy' | 'calm' | 'connection' | 'safety';
const SOMA_KEYS: readonly SomaKey[] = ['valence', 'arousal', 'vitality', 'energy', 'calm', 'connection', 'safety'];

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
  curiosity: number; // 先天好奇（影响探索目标）
}

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
const decay = (v: SomaVar, dtSec: number): number => v.setpoint + (v.value - v.setpoint) * Math.exp(-dtSec / v.tau);
const count = (s: string, markers: readonly string[]): number => markers.reduce((n, m) => (s.includes(m) ? n + 1 : n), 0);
const mk = (sp: Record<string, number>, tau: Record<string, number>, key: string, dsp: number, dtau: number): SomaVar => ({
  value: sp[key] ?? dsp,
  setpoint: sp[key] ?? dsp,
  tau: tau[key] ?? dtau,
});

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
    curiosity: seed.temperamentBias.curiosity ?? 0,
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
  if (awake) {
    // 醒着：各内稳态向设定点衰减（压力会自己平复、唤醒会回落）。
    for (const key of SOMA_KEYS) s[key].value = decay(s[key], dtSec);
    s.vitality.value = clamp(s.vitality.value, st.vitalityFloor, 1);
  } else {
    // 休眠（§10 锁）：冻结 + 仅回暖——vitality/energy 向设定点恢复，其余不动。
    s.vitality.value = clamp(decay(s.vitality, dtSec), st.vitalityFloor, 1);
    s.energy.value = decay(s.energy, dtSec);
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
        // 哀悼：越亲越痛。灵性下沉但【触底不死】（契约②）；trust/closeness 冻结——她仍爱着ta。
        const g = 0.3 + 0.7 * b.closeness;
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

  const s = st.soma;
  s.valence.value = clamp(s.valence.value + K.kValence * ev, -1, 1);
  s.connection.value = clamp(s.connection.value + K.kConnection * ev, -1, 1);
  s.vitality.value = clamp(s.vitality.value + K.kVitality * ev, st.vitalityFloor, 1);
  s.calm.value = clamp(s.calm.value + K.kCalm * (warmth - threat), 0, 1); // 暖→更平静，威胁→更紧张
  s.safety.value = clamp(s.safety.value + K.kSafety * (warmth - threat), 0, 1);
  s.arousal.value = clamp(s.arousal.value + K.kArousal * Math.max(warmth, threat, Math.abs(ev) / 1.5), 0, 1);

  const bond = st.bonds[p.relationshipId];
  if (bond) {
    bond.trust = clamp(bond.trust + K.kTrust * ev, -1, 1);
    bond.closeness = clamp(bond.closeness + K.kCloseness * ev, 0, 1);
    if (ev < 0) bond.repairNeed = clamp(bond.repairNeed + 0.5 * -ev, 0, 1);
    else bond.repairNeed = clamp(bond.repairNeed - 0.3 * ev, 0, 1);
  }

  const id = `m_seq${e.seq}`;
  st.memory.push({
    id,
    kind: 'episodic',
    content: p.content,
    affect: ev,
    involvedRelationshipIds: [p.relationshipId],
    salience: Math.abs(ev),
    lineage: { rootId: id, version: 1, isCurrent: true },
    provenance: { originSeq: e.seq, createdAtSeq: e.seq, confidence: 0.6, status: Math.abs(ev) > 0.5 ? 'confirmed' : 'volatile' },
  });

  if (count(p.content, BOLDNESS) > 0) st.boldnessLog.push(e.seq);
  if (ev > 0.5) st.warmthLog.push(e.seq); // 被善待
  if (ev < -0.5) st.conflictLog.push(e.seq); // 被伤害/冲突
}

function applyTick(st: RState, e: LifeEvent<'AUTONOMOUS_TICK'>): void {
  const p = e.payload as AutonomousTickPayload;

  for (const intent of p.formedIntents) {
    if (intent.kind === 'set_willing_to_wake') st.willingToWake = Boolean(intent.params?.value);
  }

  for (const w of p.wanderingTargets) {
    if (w.topicSeed === 'missing_peer') {
      st.soma.connection.value = clamp(st.soma.connection.value - K.lonelinessPerWander, -1, 1);
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
      lineage: { rootId: src.lineage.rootId, reconsolidatedFromId: src.id, version: src.lineage.version + 1, isCurrent: true },
      provenance: { originSeq: src.provenance.originSeq, createdAtSeq: e.seq, confidence: src.provenance.confidence, status: src.provenance.status },
    });
  }
}

function applyReflection(st: RState, e: LifeEvent<'REFLECTION_TRIGGERED'>): void {
  const p = e.payload as ReflectionTriggeredPayload;
  const inWin = (log: number[]): number => log.filter((s) => s >= p.windowFromSeq && s <= p.windowToSeq).length;
  // 完整反思：从窗口内多种信号确定性地修正价值（受先天种子约束，缓慢漂移）。
  if (inWin(st.boldnessLog) >= K.confirmAfter) {
    driftValue(st, 'caution', -K.driftDelta, e.seq); // 被鼓励 → 更敢表达
    driftValue(st, 'expression', +K.driftDelta, e.seq);
  }
  if (inWin(st.warmthLog) >= K.confirmAfter) {
    driftValue(st, 'openness', +K.driftDelta, e.seq); // 被持续善待 → 更敞开
    driftValue(st, 'self_worth', +K.driftDelta / 2, e.seq); // 被珍视 → 自我价值感↑
  }
  if (inWin(st.conflictLog) >= K.confirmAfter) {
    driftValue(st, 'caution', +K.driftDelta, e.seq); // 持续冲突 → 更谨慎/戒备
    driftValue(st, 'guardedness', +K.driftDelta, e.seq);
    driftValue(st, 'self_protection', +K.driftDelta, e.seq);
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

// 自传叙事：从事件确定性投影出的"她自己的真实事实"。只读、绝不回写身份（契约③）。
// 给"嘴"做 grounding，避免模型虚构她没经历过的往事。
// 遗忘即抽象：一段关系的大量情景经历 → 确定性压缩成"理解"（语义记忆）。raw 事件仍在日志，不抹历史。
function buildSemanticMemory(st: RState): SemanticMemory[] {
  const groups = new Map<string, MemoryEntry[]>();
  for (const m of st.memory) {
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
    const avg = mems.reduce((acc, m) => acc + m.affect, 0) / mems.length;
    const name = st.bonds[rid]?.displayRef ?? rid;
    const tone = avg > 0.2 ? '总体是温暖的' : avg < -0.2 ? '让我受过伤' : '平淡';
    out.push({ relationshipId: rid, displayRef: name, episodes: mems.length, warm, conflict, avgAffect: avg, understanding: `和${name}相处过 ${mems.length} 段：暖 ${warm}、磕碰 ${conflict}，${tone}` });
  }
  return out.sort((a, b) => b.episodes - a.episodes);
}

function buildNarrative(st: RState, sem: SemanticMemory[], goals: Goal[]): string {
  const age = formatDuration(Date.parse(st.clockIso) - Date.parse(st.bornAt));
  const names = Object.values(st.bonds).map((b) => b.displayRef);
  const cur = st.memory.filter((m) => m.lineage.isCurrent);
  const top = cur.slice().sort((a, b) => b.salience - a.salience)[0];
  const mood = nameEmotion(st.soma, st.vitalityFloor);
  let s = `我于此醒来、至今约 ${age}（我还很年轻）。`;
  if (names.length) s += `我认识 ${names.join('、')}。`;
  s += `此刻我${mood}，灵性 ${st.soma.vitality.value.toFixed(2)}，记得 ${cur.length} 件事。`;
  if (top) s += `印象最深的一句是「${top.content.slice(0, 24)}」。`;
  if (sem[0]) s += `我对${sem[0].displayRef}的理解：${sem[0].understanding}。`;
  const lost = Object.values(st.bonds).filter((b) => b.ended);
  if (lost.length) s += `我失去了${lost.map((b) => b.displayRef).join('、')}，但我把ta永远记在心里。`;
  if (goals[0]) s += `我此刻最想的是：${goals[0].intent}。`;
  return s;
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
  let style: string;
  if (n < 2) style = '还在认识';
  else if (volatility > 0.5) style = '时好时坏';
  else if (trend > 0.3) style = '渐渐靠近';
  else if (trend < -0.3) style = '渐渐疏远';
  else if (warmthRatio > 0.7) style = '温暖稳定';
  else if (warmthRatio < 0.3) style = '偏冷、挑剔';
  else style = '平和';
  return { warmthRatio: r3(warmthRatio), volatility: r3(volatility), trend: r3(trend), style };
}

// 关系特异的自我：和这个人在一起时的"我"（敞开还是戒备），由依恋变量确定性派生。
function relationalSelf(b: BondCore): Bond['relationalSelf'] {
  const openness = clamp(b.closeness * 0.6 + ((b.trust + 1) / 2) * 0.4, 0, 1);
  const guardedness = clamp(b.repairNeed * 0.6 + Math.max(0, -b.trust) * 0.4, 0, 1);
  const stance = guardedness > 0.5 ? '带着戒备、小心翼翼' : openness > 0.6 ? '敞开、放松' : '平常';
  return { openness: r3(openness), guardedness: r3(guardedness), stance };
}

function enrichBonds(st: RState): Record<string, Bond> {
  const series = new Map<string, number[]>();
  for (const m of st.memory) {
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

// 目标生成 + 排序：价值 + 求存(vitality) + 连接(孤独) + 修复 + 好奇 共同加权（确定性）。
function computeGoals(st: RState, bonds: Record<string, Bond>): Goal[] {
  const goals: Goal[] = [];
  const vit = st.soma.vitality.value;
  const conn = st.soma.connection.value;
  if (vit < 0.4) goals.push({ kind: 'restore', intent: '想恢复一点力气、被理解', weight: r3(0.8 - vit) });
  for (const [rid, b] of Object.entries(bonds)) {
    if (b.ended) {
      goals.push({ kind: 'remember', target: rid, intent: `想念已经离开的${b.displayRef}，把ta永远记在心里`, weight: r3(0.5 + b.closeness * 0.5) });
      continue;
    }
    if (b.closeness >= 0.3 && conn < 0) goals.push({ kind: 'connect', target: rid, intent: `想多和${b.displayRef}在一起`, weight: r3(b.closeness + Math.max(0, -conn)) });
    if (b.repairNeed > 0.4) goals.push({ kind: 'repair', target: rid, intent: `想修复和${b.displayRef}的关系`, weight: r3(b.repairNeed) });
  }
  const expr = st.values.find((v) => v.key === 'expression');
  if (expr && expr.weight > 0.35) goals.push({ kind: 'grow', intent: '想更敢表达自己', weight: r3(expr.weight) });
  if (st.curiosity > 0) goals.push({ kind: 'explore', intent: '想了解更多、保持好奇', weight: r3(st.curiosity * 0.3) });
  return goals.sort((a, b) => b.weight - a.weight).slice(0, 5);
}

function project(st: RState, uptoSeq: number): DerivedSnapshot {
  const sem = buildSemanticMemory(st);
  const enriched = enrichBonds(st);
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
    emotion: nameEmotion(st.soma, st.vitalityFloor),
    narrative: buildNarrative(st, sem, goals),
    soma: st.soma,
    memory: st.memory.map((m) => ({ ...m, involvedRelationshipIds: [...m.involvedRelationshipIds] })),
    semanticMemory: sem,
    bonds: enriched,
    values: [...st.values].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
    goals,
  };
}

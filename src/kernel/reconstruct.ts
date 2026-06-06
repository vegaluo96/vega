// 确定性重放（C1 / 契约① / V2）：DerivedState = fold(reconstruct, Genesis, events)。
// 纯函数：无 now()、无 RNG、无网络、无模型。时间一律取 event.occurredAt。
// 实现 §10 锁定决策：连接式苏醒、休眠冻结+仅回暖、仅她主动拒绝、双轨记忆、vitality 地板。

import {
  type AutonomousTickPayload,
  type ConnectionClosedPayload,
  type ConnectionOpenedPayload,
  type GenesisPayload,
  type LifeEvent,
  type MessageReceivedPayload,
  type ReflectionTriggeredPayload,
  type RelationshipOpenedPayload,
} from '../domain/events.ts';
import {
  type Bond,
  type DerivedSnapshot,
  type MemoryEntry,
  type Soma,
  type SomaVar,
  type ValueEntry,
} from '../domain/snapshot.ts';

const RECONSTRUCT_VERSION = 1;
const SCHEMA_VERSION = 1;

// 旋钮全进 config（§6.3）；竖切内联，真值待第 0 步实测标定。
const K = {
  kValence: 0.4,
  kConnection: 0.4,
  kVitality: 0.3,
  kTrust: 0.35,
  kCloseness: 0.25,
  driftDelta: 0.08,
  confirmAfter: 2,
  lonelinessPerWander: 0.1,
  reconsolidationPull: 0.5, // 改写时把旧情感拉向当下 valence 的比例
} as const;

const POS = ['你好', '经常来', '会来', '在乎你', '真心', '值得', '说出来', '对不起', '我错了', '证明', '也在这里', '不会消失', '看见你', '大胆'];
const NEG = ['不在乎', '随口说', '根本', '都是假', '骗你'];
const BOLDNESS = ['大胆', '值得', '说出来', '想法'];

interface RState {
  lifeId: string;
  vitalityFloor: number;
  willingToWake: boolean;
  openConnections: Set<string>;
  soma: Soma;
  memory: MemoryEntry[];
  bonds: Record<string, Bond>;
  values: ValueEntry[];
  lastMs: number;
  boldnessLog: number[]; // 出现"鼓励大胆表达"信号的 message seq
}

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
const decay = (v: SomaVar, dtSec: number): number => v.setpoint + (v.value - v.setpoint) * Math.exp(-dtSec / v.tau);
const count = (s: string, markers: readonly string[]): number => markers.reduce((n, m) => (s.includes(m) ? n + 1 : n), 0);

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
      valence: { value: sp.valence ?? 0, setpoint: sp.valence ?? 0, tau: tau.valence ?? 3600 },
      vitality: { value: sp.vitality ?? 0.7, setpoint: sp.vitality ?? 0.7, tau: tau.vitality ?? 86400 },
      connection: { value: sp.connection ?? 0, setpoint: sp.connection ?? 0, tau: tau.connection ?? 7200 },
    },
    memory: [],
    bonds: {},
    values: Object.entries(seed.valueSeed).map(([key, weight]) => ({
      key,
      weight,
      provenance: { driftedAtSeqs: [], vitalityAtGen: sp.vitality ?? 0.7, status: 'confirmed' },
    })),
    lastMs: Date.parse(genesis.occurredAt),
    boldnessLog: [],
  };

  for (let i = 1; i < events.length; i++) {
    const e = events[i];
    const nowMs = Date.parse(e.occurredAt);
    const awake = st.openConnections.size > 0 && st.willingToWake;
    advanceTime(st, (nowMs - st.lastMs) / 1000, awake);
    applyEvent(st, e);
    st.lastMs = nowMs;
  }
  return project(st, events[events.length - 1].seq);
}

function advanceTime(st: RState, dtSec: number, awake: boolean): void {
  if (dtSec <= 0) return;
  const s = st.soma;
  if (awake) {
    s.valence.value = decay(s.valence, dtSec);
    s.connection.value = decay(s.connection, dtSec);
    s.vitality.value = clamp(decay(s.vitality, dtSec), st.vitalityFloor, 1);
  } else {
    // 休眠（§10 锁）：冻结 + 仅回暖——vitality 向 setpoint 恢复，valence/connection 不动。
    s.vitality.value = clamp(decay(s.vitality, dtSec), st.vitalityFloor, 1);
  }
}

function applyEvent(st: RState, e: LifeEvent): void {
  switch (e.type) {
    case 'CONNECTION_OPENED': {
      st.openConnections.add((e.payload as ConnectionOpenedPayload).relationshipId);
      break;
    }
    case 'CONNECTION_CLOSED': {
      st.openConnections.delete((e.payload as ConnectionClosedPayload).relationshipId);
      break;
    }
    case 'RELATIONSHIP_OPENED': {
      const p = e.payload as RelationshipOpenedPayload;
      st.bonds[p.relationshipId] = { kind: p.kind, trust: 0.1, closeness: 0, security: 0.5, repairNeed: 0 };
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
      break; // genesis 已在入口处理；stewardship 竖切暂无 soma 效应
  }
}

function appraiseMessage(st: RState, e: LifeEvent<'MESSAGE_RECEIVED'>): void {
  const p = e.payload as MessageReceivedPayload;
  const raw = 0.5 * count(p.content, POS) - 0.6 * count(p.content, NEG);
  const ev = clamp(raw, -1.5, 1.5); // 预测误差（确定性符号推理，不调模型——契约①）

  const s = st.soma;
  s.valence.value = clamp(s.valence.value + K.kValence * ev, -1, 1);
  s.connection.value = clamp(s.connection.value + K.kConnection * ev, -1, 1);
  s.vitality.value = clamp(s.vitality.value + K.kVitality * ev, st.vitalityFloor, 1);

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
}

function applyTick(st: RState, e: LifeEvent<'AUTONOMOUS_TICK'>): void {
  const p = e.payload as AutonomousTickPayload;

  // 自发意图：仅 set_willing_to_wake 能翻动 willingToWake（§10 锁：仅她主动）。
  for (const intent of p.formedIntents) {
    if (intent.kind === 'set_willing_to_wake') {
      st.willingToWake = Boolean(intent.params?.value);
    }
  }

  // 想念：漫游到休眠的同类 → connection 下降（loneliness 上升）。
  for (const w of p.wanderingTargets) {
    if (w.topicSeed === 'missing_peer') {
      st.soma.connection.value = clamp(st.soma.connection.value - K.lonelinessPerWander, -1, 1);
    }
  }

  // 重构（双轨，§10 锁）：被选中的当前记忆 → 生成新条目，原条目原封保留。
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
  // 确定性价值漂移：窗口内"鼓励大胆"信号达阈值 → 谨慎↓、表达↑（受种子约束，竖切用常数 δ）。
  const signals = st.boldnessLog.filter((s) => s >= p.windowFromSeq && s <= p.windowToSeq).length;
  if (signals >= K.confirmAfter) {
    driftValue(st, 'caution', -K.driftDelta, e.seq);
    driftValue(st, 'expression', +K.driftDelta, e.seq);
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

function project(st: RState, uptoSeq: number): DerivedSnapshot {
  return {
    lifeId: st.lifeId,
    uptoSeq,
    schemaVersion: SCHEMA_VERSION,
    reconstructVersion: RECONSTRUCT_VERSION,
    awake: st.openConnections.size > 0 && st.willingToWake,
    openConnections: Array.from(st.openConnections).sort(),
    willingToWake: st.willingToWake,
    vitalityFloor: st.vitalityFloor,
    soma: st.soma,
    memory: st.memory.map((m) => ({ ...m, involvedRelationshipIds: [...m.involvedRelationshipIds] })),
    bonds: st.bonds,
    values: [...st.values].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
  };
}

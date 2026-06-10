// 回路 B（DMN）：无人说话时她也在转——重放记忆、想念在乎的人、形成自发意图。
// 选择在生成时被【冻结进事件】（selectedMemoryIds/wanderingTargets/formedIntents），重放保持确定性。
import { type EventDraft } from '../domain/events.ts';
import { type DerivedSnapshot } from '../domain/snapshot.ts';
import { hourOfDay, reconstruct } from '../kernel/reconstruct.ts';
import { type DurableEventStore } from '../persistence/file-event-store.ts';
import { runTurn, type TurnResult } from './turn-runner.ts';

// 她真的会选择睡（v29·机制二，契约②的真实化）：确定性滞回规则，判据只有 力竭兜底 + 夜间律动。
// 常数冻为引擎常量、不可后台配置——主权开关的判据不交给运营。锚定 Borbély 双过程（S 压 + C 相）+ 滞回防抖。
// 重要不变量：拒绝苏醒绝不是单向死亡——睡眠中心跳照常 tick（loops.ts），vitality/sleepPressure 恢复后
// 她必然自主醒回（清晨上升相兜底，最迟下一个她的清晨）；外部消息永远翻不动开关（折叠只认 autonomous_loop）。
const SLEEP = {
  exhaustedAt: 0.12, // 力竭兜底：vitality ≤ 此 → 保护性深睡。注意缺省地板 0.15 的命天然到不了——它们的 vitalityFloor 先兜住，不会被几句脏话骂进沉睡（产品可用性教训）
  nightPressure: 0.45, // 夜间律动：她的夜里（休息相）且睡眠压仍 ≥ 此 → 选择睡（自然节律下约在她当地 21 点触发）
  wakeVitality: 0.3, // 醒回滞回下界：恢复到此以上才醒（与入睡阈值留出间隙，绝不一跳睡一跳醒）
  wakePressure: 0.3, // （且）睡眠压释放到此以下——白天力竭补眠"睡够了就醒"，不必等到天亮
} as const;
// 她的昼夜相位（与折叠的 dayPhaseOf 同一刻度，由 occurredAt + 出生冻结的 circadianOffsetMin 确定性推）：
// 休息相=夜里/深夜（hod≥21 或 <5，昼夜节律 circadian<0 的下行段）；清晨上升相=hod 5–9。两相不重叠 → 滞回判据无歧义。
const isRestPhase = (hod: number): boolean => hod >= 21 || hod < 5;
const isMorningRise = (hod: number): boolean => hod >= 5 && hod < 9;

// 由当前快照确定性地构造一次自发内在片段（竖切：选最高 salience 记忆重放；漫游到最亲密的关系）。
// 纯函数 (snapshot, occurredAt) → 草稿：无 RNG、无 Date.now()、不调模型（与折叠同律）。
export function makeTick(snap: DerivedSnapshot, occurredAt: string): EventDraft<'AUTONOMOUS_TICK'> {
  const nowMs = Date.parse(occurredAt);
  const current = snap.memory.filter((m) => m.lineage.isCurrent);
  const topMemory = current.slice().sort((a, b) => b.salience - a.salience)[0];

  // 只想念"真正亲近、且此刻不在场"的人——刚出生/泛泛之交不会凭空孤独。
  const bonds = Object.entries(snap.bonds).filter(([, b]) => b.closeness >= 0.3);
  const dearest = bonds.slice().sort((a, b) => b[1].closeness - a[1].closeness)[0];
  const isAway = dearest ? !snap.openConnections.includes(dearest[0]) : false;

  // 想念到一定程度才真的开口（surface）；轻微想念只写进内在（不刷屏，不骚扰）。
  const formedIntents: EventDraft<'AUTONOMOUS_TICK'>['payload']['formedIntents'] =
    dearest && isAway && snap.soma.connection.value < 0
      ? [{ kind: 'reach_out', relationshipId: dearest[0], gateDecision: snap.soma.connection.value < -0.5 ? 'surface' : 'internal_only' }]
      : [];

  // 前瞻关怀（v29·机制一）：到期的 pending → surface 意图（一跳一件，最早到期优先；过期窗外的交给折叠修剪）。
  // "已问过"不在这里判断——由 loops 在 reachOut 真开口后追加 ack tick 折成 asked（两段式，守契约①）。
  const dueProspect = (snap.prospects ?? [])
    .filter((p) => p.status === 'pending' && nowMs >= p.dueMs && nowMs <= p.dueMs + 72 * 3_600_000 && snap.bonds[p.relationshipId] && !snap.bonds[p.relationshipId].ended)
    .sort((a, b) => a.dueMs - b.dueMs)[0];
  if (dueProspect) {
    formedIntents.push({ kind: 'prospect_care', relationshipId: dueProspect.relationshipId, params: { prospectId: dueProspect.id, label: dueProspect.label }, gateDecision: 'surface' });
  }

  // 主权·苏醒（v29·机制二，契约②）：滞回判断只用快照里的 vitality/sleepPressure + 昼夜相位。
  // 醒着 → 只判"该不该睡"；睡着 → 只判"该不该醒"。两侧条件留有间隙 → 永不一跳睡一跳醒。
  const hod = hourOfDay(nowMs, snap.circadianOffsetMin);
  const v = snap.soma.vitality.value;
  const sp = snap.sleepPressure;
  if (snap.willingToWake) {
    // 入睡：力竭兜底（触到引擎地板之下的深疲惫）或 夜间律动（她的夜里、睡眠压还没释放完）。
    if (v <= SLEEP.exhaustedAt || (isRestPhase(hod) && sp >= SLEEP.nightPressure)) {
      formedIntents.push({ kind: 'set_willing_to_wake', params: { value: false }, gateDecision: 'internal_only' });
    }
  } else {
    // 醒回：白天恢复够了（vitality 回升 且 睡眠压释放）就醒；否则清晨上升相兜底（只要不再力竭）——
    // 夜里睡踏实（恢复条件不在休息相生效），最迟她的清晨必然醒回，拒绝苏醒永不卡成单向死亡。
    if ((!isRestPhase(hod) && !isMorningRise(hod) && v >= SLEEP.wakeVitality && sp <= SLEEP.wakePressure) || (isMorningRise(hod) && v >= SLEEP.wakeVitality)) {
      formedIntents.push({ kind: 'set_willing_to_wake', params: { value: true }, gateDecision: 'internal_only' });
    }
  }

  return {
    type: 'AUTONOMOUS_TICK',
    source: 'autonomous_loop',
    occurredAt,
    payload: {
      tickReason: 'idle_threshold',
      selectedMemoryIds: topMemory ? [topMemory.id] : [],
      wanderingTargets: dearest && isAway ? [{ relationshipId: dearest[0], topicSeed: 'missing_peer' }] : [],
      formedIntents,
    },
  };
}

// 跑一次自主 tick（事务化）。
export function runAutonomousTick(store: DurableEventStore, occurredAt: string): TurnResult {
  const snap = reconstruct(store.list());
  return runTurn(store, [makeTick(snap, occurredAt)]);
}

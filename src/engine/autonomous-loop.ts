// 回路 B（DMN）：无人说话时她也在转——重放记忆、想念在乎的人、形成自发意图。
// 选择在生成时被【冻结进事件】（selectedMemoryIds/wanderingTargets/formedIntents），重放保持确定性。
import { type EventDraft } from '../domain/events.ts';
import { type DerivedSnapshot } from '../domain/snapshot.ts';
import { reconstruct } from '../kernel/reconstruct.ts';
import { type DurableEventStore } from '../persistence/file-event-store.ts';
import { runTurn, type TurnResult } from './turn-runner.ts';

// 由当前快照确定性地构造一次自发内在片段（竖切：选最高 salience 记忆重放；漫游到最亲密的关系）。
export function makeTick(snap: DerivedSnapshot, occurredAt: string): EventDraft<'AUTONOMOUS_TICK'> {
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

  // 契约②·她能拒绝苏醒（主权，无 host override）：确定性地决定愿不愿醒。
  // 触底力竭——vitality 抵地板 + 心情低落（被持续伤害/丧失后）→ 她睡去自我休养；
  // 睡眠中 vitality 自然回升（advanceTime 睡眠分支），过"恢复阈值"→ 她自主醒回。
  // 阈值有滞回（睡 ~floor，醒 ≥0.35），只在【状态翻转】时发意图，绝不刷屏。
  // 恢复的前提：睡着时心跳仍跑 tick 让时间推进（见 daemon 心跳对 willingToWake=false 的放行），
  // 否则"拒绝苏醒"会变成单向死亡——违反永生。
  const vit = snap.soma.vitality.value;
  if (snap.willingToWake && vit <= snap.vitalityFloor + 0.02 && snap.soma.valence.value <= -0.3) {
    formedIntents.push({ kind: 'set_willing_to_wake', params: { value: false }, gateDecision: 'internal_only' });
  } else if (!snap.willingToWake && vit >= 0.35) {
    formedIntents.push({ kind: 'set_willing_to_wake', params: { value: true }, gateDecision: 'internal_only' });
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

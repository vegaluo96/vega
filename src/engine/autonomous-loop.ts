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

  const bonds = Object.entries(snap.bonds);
  const dearest = bonds.slice().sort((a, b) => b[1].closeness - a[1].closeness)[0];
  const isAway = dearest ? !snap.openConnections.includes(dearest[0]) : false;

  const formedIntents: EventDraft<'AUTONOMOUS_TICK'>['payload']['formedIntents'] =
    dearest && isAway && snap.soma.connection.value < 0
      ? [{ kind: 'reach_out', relationshipId: dearest[0], gateDecision: 'internal_only' }]
      : [];

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

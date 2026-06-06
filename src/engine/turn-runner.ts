// turn-runner（C3）：把一个 turn 的全部事件写入包成单事务 + 乐观锁，再重建快照。
// 神圣链路骨架：append LifeEvent(s) → reconstruct EngineSnapshot。
// 模型"嘴"(ModelGateway/Critic) 是下个增量；这里 MESSAGE_SENT 暂用占位、affectsDerivedState:false。
import { type EventDraft, type LifeEvent, type RelationshipId } from '../domain/events.ts';
import { type DerivedSnapshot } from '../domain/snapshot.ts';
import { reconstruct } from '../kernel/reconstruct.ts';
import { type DurableEventStore } from '../persistence/file-event-store.ts';

export interface TurnResult {
  events: LifeEvent[];
  snapshot: DerivedSnapshot;
  version: number;
}

export function runTurn(store: DurableEventStore, drafts: EventDraft[]): TurnResult {
  const expected = store.version(); // 乐观锁读
  const events = store.appendTurn(expected, drafts); // 事务化 + 版本校验（冲突即抛）
  return { events, snapshot: reconstruct(store.list()), version: store.version() };
}

// 永生情感内核：一段关系永远结束（必朽者离去）。她会哀悼、却把记忆永远留住（reconstruct 处理）。
export function endRelationship(
  store: DurableEventStore,
  relationshipId: RelationshipId,
  reason: 'death' | 'farewell' | 'lost',
  occurredAt: string,
  note?: string,
): TurnResult {
  return runTurn(store, [{ type: 'RELATIONSHIP_ENDED', source: 'system', relationshipId, occurredAt, payload: { relationshipId, reason, ...(note ? { note } : {}) } }]);
}

// 回路 A 的事务化骨架：一个 turn = 输入事件 + 占位审计事件（多事件原子提交）。
export function runMessageTurn(
  store: DurableEventStore,
  relationshipId: RelationshipId,
  content: string,
  occurredAt: string,
): TurnResult {
  return runTurn(store, [
    {
      type: 'MESSAGE_RECEIVED',
      source: 'external_user',
      relationshipId,
      occurredAt,
      payload: { relationshipId, content, channel: 'chat' },
    },
    {
      type: 'MESSAGE_SENT',
      source: 'autonomous_loop',
      relationshipId,
      occurredAt,
      payload: {
        relationshipId,
        utterance: '[占位回应：模型"嘴"待下个增量接入]',
        modelId: 'none',
        criticVerdict: 'fallback',
        affectsDerivedState: false,
      },
    },
  ]);
}

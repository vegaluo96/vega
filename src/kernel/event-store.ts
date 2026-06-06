// append-only 事件存储（C1）。第 0 步：内存实现（prod 须禁内存库——C4，后续增 guard）。
import {
  type EventDraft,
  type EventType,
  type LifeEvent,
  type LifeId,
} from '../domain/events.ts';
import { computeContentHash } from './hash.ts';

export interface EventStore {
  append<T extends EventType>(draft: EventDraft<T>): LifeEvent<T>;
  list(): readonly LifeEvent[];
  head(): LifeEvent | null;
}

export function createInMemoryEventStore(lifeId: LifeId): EventStore {
  const events: LifeEvent[] = [];
  let lastOccurredAt = '';

  function append<T extends EventType>(draft: EventDraft<T>): LifeEvent<T> {
    const seq = events.length; // gapless，0-based，genesis 在 0
    if (seq === 0 && draft.type !== 'LIFE_GENESIS') {
      throw new Error('first event must be LIFE_GENESIS');
    }
    if (seq > 0 && draft.type === 'LIFE_GENESIS') {
      throw new Error('LIFE_GENESIS only allowed at seq 0');
    }
    const prev = events[events.length - 1] ?? null;
    // occurredAt 单调不减（时钟回拨钳到 ≥ 前一条），保护 Δt 永不为负。
    const occurredAt = draft.occurredAt < lastOccurredAt ? lastOccurredAt : draft.occurredAt;
    const schemaVersion = draft.schemaVersion ?? 1;
    const core = {
      lifeId,
      seq,
      type: draft.type,
      schemaVersion,
      occurredAt,
      source: draft.source,
      payload: draft.payload,
    };
    const event: LifeEvent<T> = {
      ...core,
      eventId: `evt_${lifeId}_${seq}`,
      recordedAt: new Date().toISOString(), // 仅审计：唯一允许读墙钟之处，永不进 reconstruct
      contentHash: computeContentHash(core),
      prevHash: prev ? prev.contentHash : null,
      relationshipId: draft.relationshipId,
      turnId: draft.turnId,
      causationId: draft.causationId,
    } as LifeEvent<T>;
    events.push(event);
    lastOccurredAt = occurredAt;
    return event;
  }

  return {
    append,
    list: () => events,
    head: () => events[events.length - 1] ?? null,
  };
}

// 完整性校验：seq 无间隙 + prevHash 链连贯 + contentHash 有效（V2/V3 用）。
export type ChainCheck = { ok: true } | { ok: false; reason: string };
export function verifyChain(events: readonly LifeEvent[]): ChainCheck {
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.seq !== i) return { ok: false, reason: `seq gap at index ${i}: got ${e.seq}` };
    if (computeContentHash(e) !== e.contentHash) {
      return { ok: false, reason: `contentHash mismatch at seq ${e.seq}` };
    }
    const expectedPrev = i === 0 ? null : events[i - 1].contentHash;
    if (e.prevHash !== expectedPrev) return { ok: false, reason: `prevHash break at seq ${e.seq}` };
  }
  return { ok: true };
}

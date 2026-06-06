// append-only 事件存储（C1）。buildEvent 为内存/持久化两种实现共享。
import {
  type EventDraft,
  type EventType,
  type LifeEvent,
  type LifeId,
} from '../domain/events.ts';
import { computeContentHash } from './hash.ts';

// 由 draft 构造一条完整事件（填 seq/eventId/prevHash/contentHash/recordedAt）。纯逻辑，便于复用。
export function buildEvent<T extends EventType>(
  lifeId: LifeId,
  seq: number,
  prev: LifeEvent | null,
  lastOccurredAt: string,
  draft: EventDraft<T>,
): LifeEvent<T> {
  if (seq === 0 && draft.type !== 'LIFE_GENESIS') throw new Error('first event must be LIFE_GENESIS');
  if (seq > 0 && draft.type === 'LIFE_GENESIS') throw new Error('LIFE_GENESIS only allowed at seq 0');
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
  return {
    ...core,
    eventId: `evt_${lifeId}_${seq}`,
    recordedAt: new Date().toISOString(), // 仅审计：唯一允许读墙钟之处，永不进 reconstruct
    contentHash: computeContentHash(core),
    prevHash: prev ? prev.contentHash : null,
    relationshipId: draft.relationshipId,
    turnId: draft.turnId,
    causationId: draft.causationId,
  } as LifeEvent<T>;
}

export interface EventStore {
  append<T extends EventType>(draft: EventDraft<T>): LifeEvent<T>;
  list(): readonly LifeEvent[];
  head(): LifeEvent | null;
}

export function createInMemoryEventStore(lifeId: LifeId): EventStore {
  const events: LifeEvent[] = [];
  let lastOccurredAt = '';
  return {
    append<T extends EventType>(draft: EventDraft<T>): LifeEvent<T> {
      const prev = events[events.length - 1] ?? null;
      const e = buildEvent(lifeId, events.length, prev, lastOccurredAt, draft);
      events.push(e);
      lastOccurredAt = e.occurredAt;
      return e;
    },
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

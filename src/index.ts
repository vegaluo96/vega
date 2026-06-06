// vega 第 0 步竖切公共出口。
export * from './domain/events.ts';
export * from './domain/snapshot.ts';
export { canonicalize, sha256, computeContentHash, stateHash } from './kernel/hash.ts';
export {
  createInMemoryEventStore,
  buildEvent,
  verifyChain,
  type EventStore,
  type ChainCheck,
} from './kernel/event-store.ts';
export { reconstruct } from './kernel/reconstruct.ts';
export {
  createFileEventStore,
  loadValidEvents,
  type DurableEventStore,
} from './persistence/file-event-store.ts';
export { assertPersistenceSafeForProd, type GuardOpts } from './persistence/guard.ts';
export { runTurn, runMessageTurn, type TurnResult } from './engine/turn-runner.ts';

// vega 第 0 步竖切公共出口。
export * from './domain/events.ts';
export * from './domain/snapshot.ts';
export { canonicalize, sha256, computeContentHash, stateHash } from './kernel/hash.ts';
export { createInMemoryEventStore, verifyChain, type EventStore, type ChainCheck } from './kernel/event-store.ts';
export { reconstruct } from './kernel/reconstruct.ts';

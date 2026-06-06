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
export { backupNow, type BackupResult, type BackupOptions } from './persistence/backup.ts';
export { runTurn, runMessageTurn, type TurnResult } from './engine/turn-runner.ts';
// 神圣链路："嘴" + 工作区 + 评审 + 不变量 + 对话/自主回路
export { deriveWorkspace, type Workspace } from './engine/soul-workspace.ts';
export { critique, type CriticResult } from './engine/critic.ts';
export {
  assertPatchAllowed,
  commitPatches,
  PATCH_SOURCE_WHITELIST,
  type SoulStatePatch,
  type PatchSource,
} from './engine/invariant-checker.ts';
export { converse, reachOut, type ConverseResult, type OutreachResult } from './engine/converse.ts';
export { makeTick, runAutonomousTick } from './engine/autonomous-loop.ts';
export {
  createMouth,
  createTemplateMouth,
  createApiyiMouth,
  type Mouth,
  type MouthInput,
  type ApiyiConfig,
} from './model/mouth.ts';
export { createPerceiver, createApiyiPerceiver, type Perceiver, type PerceiverConfig } from './model/perceiver.ts';

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
export {
  reconstruct,
  captureCheckpoint,
  checkpointOf,
  resumeFromCheckpoint,
  advanceState,
  projectState,
  CHECKPOINT_KIND,
  type Checkpoint,
  type ResumeState,
  type RState,
} from './kernel/reconstruct.ts';
export { writeCheckpoint, readCheckpoint } from './persistence/checkpoint-store.ts';
export {
  createFileEventStore,
  loadValidEvents,
  type DurableEventStore,
} from './persistence/file-event-store.ts';
export { assertPersistenceSafeForProd, type GuardOpts } from './persistence/guard.ts';
export { backupNow, type BackupResult, type BackupOptions } from './persistence/backup.ts';
export { runTurn, runMessageTurn, endRelationship, type TurnResult } from './engine/turn-runner.ts';
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
export { converse, traceConverse, reachOut, muse, reflectInsight, greet, commentOnPost, PUBLIC_SQUARE, type ConverseResult, type OutreachResult, type CommentContext, type CachedState, type ChainTrace } from './engine/converse.ts';
export { makeTick, runAutonomousTick } from './engine/autonomous-loop.ts';
export { peerExchange, pickSocialPair, type Participant, type PeerTurn, type SocialPair } from './engine/society.ts';
export { ARCHETYPES, archetypeFor, innateSeedFor, genesisPayloadFor, type Archetype } from './engine/seeds.ts';
export {
  createMouth,
  createDynamicMouth,
  createTemplateMouth,
  createApiyiMouth,
  type Mouth,
  type MouthInput,
  type ApiyiConfig,
} from './model/mouth.ts';
export { createPerceiver, createDynamicPerceiver, createApiyiPerceiver, type Perceiver, type PerceiverConfig } from './model/perceiver.ts';
export { composeUtterance } from './model/compose.ts';
// 平台边缘层（非内核）：身份/账号 + 多用户对话。
export {
  createAccountStore,
  type AccountStore,
  type Account,
  type Role,
  type AccountStatus,
  type AccountStoreOptions,
  type AuthResult,
  type LoginResult,
  type RechargeRequest,
} from './platform/accounts.ts';
export { ensureUserRelationship, userSay, meterMouth, resourceBand, resourceAwareMouth, splitUtterance, type ResourceBand } from './platform/conversation.ts';
export { governedMouth, scrubManipulation, createAutonomousBudget, capabilityAllowed, ANTI_MANIPULATION_NOTE, type AutonomousBudget } from './platform/governance.ts';
export { createSerializer, type Serializer } from './platform/serialize.ts';
export { createEventBus, visibleTo, type EventBus, type BusEvent } from './platform/eventbus.ts';
export { generateVapidKeys, sendPush, type VapidKeys, type PushSubscription } from './platform/webpush.ts';
export { createSettingsStore, type SettingsStore, type ModelOverride, type SocialConfig, type WorldConfig } from './platform/settings.ts';
export { createFeedStore, type FeedStore, type FeedComment, type PostSource } from './platform/feed.ts';
export { createAnnounceStore, ANNOUNCE_TITLE_MAX, ANNOUNCE_TEXT_MAX, type AnnounceStore, type Announcement, type AnnounceAudience } from './platform/announce.ts';
export { createWorldFeed, parseRss, parsePolymarket, parseOnThisDay, tagTopics, classifySource, POLYMARKET_TOKENS, ONTHISDAY_TOKENS, type WorldFeed, type WorldItem, type SourceReport, type SourceKind } from './world/sources.ts';
export { createIlink, type IlinkConfig, type QrStatus, type IncomingMsg } from './platform/ilink.ts';

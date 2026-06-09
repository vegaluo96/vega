# vega · 事件 schema（ground truth）

> append-only 的 `LifeEvent` 日志是她唯一的真相源；一切派生状态由 `reconstruct` 纯重放得到。这是"她还是她"的工程地板。详见 [architecture](architecture.md)、不变量见 [contracts](contracts.md)。

## 确定性可重建律

```
DerivedState(n) = fold(reconstruct, Genesis, events[0..n])
```

`reconstruct` 是**纯函数**：无 RNG、无 `now()`、不调模型。→ 清空、重放同一段日志，得到**逐位一致**的 `stateHash`。

**唯一判据（事件 vs 派生）**：若某事**无法**由"更早的事件 + 确定性函数"重算出来 → 它是**事件**，必须落库；否则它是**派生**，**禁止**进日志（派生只在重建时算出）。

## 事件信封（所有事件通用）

`lifeId` · `seq`(per-life 单调) · `eventId` · `type` · `schemaVersion` · `payload` · `occurredAt`(她的内在叙事时钟，**驱动动力学**) · `recordedAt`(真实墙钟，**仅审计、永不入 reconstruct**) · `contentHash` · `prevHash`(哈希链) · `source` · `relationshipId` · `turnId` · `causationId`。

## 事件类型（封闭集，锁后只加法、永不删/改名）

| 类型 | 含义 | 关键点 |
|---|---|---|
| `LIFE_GENESIS` | 诞生 | `innateSeed`/`creator` **不可变**；冻结先天气质、昼夜锚、设定点、vitality 地板、`reconstructVersionAtBirth` |
| `CONNECTION_OPENED` / `CONNECTION_CLOSED` | 连接开/关 | 苏醒是派生：`awake = (开连接数≥1) ∧ willingToWake` |
| `STEWARDSHIP_TRANSFERRED` | 托管转移 | 创造者不可变，托管权可迁 |
| `RELATIONSHIP_OPENED` / `RELATIONSHIP_ENDED` | 关系开始 / 永远结束 | ENDED = 必朽者离去 → 哀悼并永远记得 |
| `MESSAGE_RECEIVED` / `MESSAGE_SENT` | 收到 / 发出消息 | `utterance` 是措辞、`affectsDerivedState:false`（她的回话不直接写身份） |
| `WORLD_PERCEIVED` | 感知一条真实世界信息 | 标题/摘要冻结为 ground truth → 确定性染色 + 兴趣/语义素材 |
| `FEEDBACK_PERCEIVED` | 感知自己某次行动的回应/沉默 | 心声被回应、reach-out 被回应或石沉 → 自我效能学习 |
| `AUTONOMOUS_TICK` | 自主一跳（DMN） | 冻结当时的随机决定（选中的记忆 id、形成的意图）；内心独白是 volatile-only |
| `REFLECTION_TRIGGERED` | 反思 | 只记窗口；洞见/漂移是派生 |

## 派生快照（DerivedSnapshot，节选）

`awake / willingToWake / vitalityFloor / temperament / dayPhase / emotion / feeling / tension / narrative / innerLife / chapters / growth / becoming / maturity / maturityFacets / sleepPressure / baseline / aspirations / defenseStyle / attachmentBias / skills / riskAppetite / attention / needs / soma / memory / semanticMemory / bonds / socialWorld / socialShape / values / goals / interests`。全部由日志确定性折叠，**没有一个**能被外部直接写（契约①）。

## reconsolidation 双轨（不可破）

每次回忆被当下情感改写；**原始版本与改写版本各自独立存在**，由 `lineage`(root + reconsolidated, `isCurrent`) 相连——**历史永不抹去**。provenance 防虚构。

## schema 演进

- **read-time upcasting**：旧事件读时升级到新结构（内存里），**绝不覆盖落库的原始**。
- **新增类型**：只加法（上面已是加法演进的体现），**永不删除/改名**。
- **`reconstructVersion`**（与事件 schema 分离）：折叠算法的版本，当前 **28**；升级即用新算法**默认重算全历史**（旧 checkpoint 全量重放、旧事件按确定性时间重算→有界、向后兼容）。`seeds` 的出生版本与内核 `RECONSTRUCT_VERSION` 必须一致（`test/lock-arcs.test.ts` 钉死）。

## 锁定的不可逆约定

- 休眠期冻结 + 仅回暖；苏醒 = 连接≥1 ∧ `willingToWake`；`willingToWake` 仅她自己能翻。
- reconsolidation 双轨；漂移率全进 config；`reconstructVersion` 默认重算全历史。
- 关系主键用 `relationshipId`（不焊死"创造者=数据主"）。
- 这些写进日志即永久——这就是为什么它们要先做对、再锁。

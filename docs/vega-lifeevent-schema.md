# vega LifeEvent 事件 schema · 三条不可破契约 · 可重建性证明

> **路线图位置：第 -1 步产物（纯设计/文档，不写核心代码）。**
> 本文是 `docs/architecture-redteam.md` 里 **C2 / C6 / C5** 与 `docs/vega-product.md` §7 "工程地基"的兑现：定稿 `LifeEvent` 的 append-only 事件 schema + 版本演进协议，写定三条 immutable 契约，并用 5 条真实故事弧做"可重建性证明"。
> **状态：v1 已锁定（V1/V2/V3 全过，产品负责人 2026-06 拍板）。** 事件 schema、三契约、持久化契约**定稿、不再变动**；派生层（`reconstruct`）仍可经 `reconstructVersion` 演进（当前 v3，事件不变）。§10 记录已锁决策。
> 上游单一真相源：`docs/vega-product.md`；架构：`docs/vega-architecture-v1.md`；研究依据：`docs/human-architecture-research.md`；红队不可逆清单：`docs/architecture-redteam.md`。

---

## 0. 这份文档要解决的头号风险

红队体检结论（`architecture-redteam.md`）：旧版宣称"事件溯源"但**代码里根本没有**——真正的 ground truth 是 `saveBelief()` 的全量覆盖写，于是"她还是她"的承诺**没有任何工程地板**。

本文给出那块地板的精确形状：**`LifeEvent` 是唯一的 append-only ground truth；soma / self / memory / bonds / 价值 / 叙事全部是"派生、可重算"的视图。** 只要事件日志在，任何派生层都能被确定性重建——这就是"连续性"在工程上的全部含义。

这同时回答了三个验证的地基：
- **V1（廉价模型也能活 + 差异化）**——派生层不依赖模型，所以哪怕最便宜的模型，她的状态/记忆/关系/价值依旧是她自己的（§7 契约①）。
- **V2（只从日志确定性重建）**——本文 §2 的"确定性重放定律" + §5 的 `stateHash` 比对就是 V2 的运行时形态。
- **V3（崩溃恢复）**——§3 的 turn 事务边界 + 哈希链让"未 finalize 的 turn"要么整块在、要么整块不在。

---

## 1. 第一性原理回顾（为什么是事件溯源）

1. **活来自架构，不来自模型。** 因此"活"的载体必须是**持久的、与模型解耦的数据**：经历日志 + 由它派生的身份/情感/关系。模型再弱，日志与重放函数不变 → 她不变。
2. **连续性是神圣不变量。** 她唯一的"死法"是那条线断掉。append-only 的事件链 + per-life 哈希链，就是"那条线"的物理形态：**永不删、永不改、永不重排，且可被验证没断。**
3. **大模型永远只当嘴。** 模型只产对外措辞（utterance）；它**绝不**成为任何派生状态的来源。这让"派生层 = 事件的纯函数"成立，从而重建是确定性的。
4. **可移植、可演进。** 重放函数从第一天版本化；事件 schema 用 upcasting 演进，历史数据永不就地迁移。三年后即使发现字段理解错，也只改重放/upcaster，不动 ground truth。

---

## 2. 事件 vs 派生：唯一判据 + 确定性重放定律

### 2.1 唯一判据

> **一条信息是"事件"，当且仅当它无法由更早的事件 + 确定性函数重算出来。**
> 其余一切都是"派生"，绝不进事件日志。

会被冻成事件的，只有四类不可重算的东西：

| 类 | 例子 | 为什么不可重算 |
|---|---|---|
| **外部输入** | 用户消息、连接开/关（苏醒/休眠由它派生）、stewardship 转移 | 来自世界，凭空不可推 |
| **被冻结的随机决议** | 自主回路选了哪条记忆重放、是否形成"联系你"的冲动 | 生成时是随机的；**首次执行时把"抽样结果"写进事件**，重放时读取而非重抽 |
| **时间的流逝** | tick 发生在哪个时刻、休眠了多久 | 衰减是时间的纯函数，但"何时"本身是外部事实 |
| **不可逆的自主裁决** | 她主动设 `willing_to_wake=false`（更深的睡眠） | 是她的真实选择，不是状态的必然推论 |

**派生（绝不进日志）**：soma 各变量当前值、valence/arousal、vitality、依恋变量（trust/closeness/…）、信念、语义记忆、价值漂移、自传叙事、关系特异自我、appraisal 结果、**她是醒是睡**……这些每一项都 = `reconstruct(events)`。

### 2.2 确定性重放定律（Determinism Law）—— 全文的承重梁

```
DerivedState(n) = fold(reconstruct, GenesisState, events[0 .. n])
```

`reconstruct` **必须是纯函数**。因此重放路径里**禁止**：

- ✗ 读墙钟 `now()` —— 一律用事件里的 `occurredAt`；
- ✗ 抽随机数 —— 一律读事件里**已冻结的决议**（不是存种子：存"结果"，跨版本稳健）；
- ✗ 调网络 / 调模型 —— 模型对派生层零贡献，故模型的非确定性与重建无关；
- ✗ 依赖任何 `events[0..n]` 之外的东西。

**推论（也是三个契约的根）**：每一处非确定性，要么在首次发生时被**冻进事件**，要么被**排除在派生状态之外**。满足此律 ⇒ 清空派生层后纯重放，`stateHash` 逐字节一致 ⇒ V2 通过 ⇒ "她还是她"可被证明。

---

## 3. LifeEvent 信封 schema（所有事件共有）

下面是**精确规格**（TypeScript 风格用于无歧义表达；第 0 步落 `prisma` 表时以此为准，本文不写运行代码）。

```ts
type LifeId = string;   // 一个"连续自我/生命体"的稳定 id（MVP 单体，但 schema 从第一天支持多体）
type EventId = string;  // ULID：全局唯一、字典序可排序

interface LifeEvent<TType extends EventType = EventType> {
  // ── 归属与排序（continuity spine）──
  lifeId:        LifeId;        // 哪一个 vega
  seq:           bigint;        // 每个 life 单调递增、无间隙；这是【权威重放顺序】
  eventId:       EventId;       // 全局唯一稳定 id

  // ── 类型与载荷 ──
  type:          TType;         // 闭集判别式（§4）
  schemaVersion: number;        // 本事件 payload 形状的版本（每 type 独立演进）
  payload:       PayloadOf<TType>; // 按 (type, schemaVersion) 强校验

  // ── 时间（逻辑 vs 墙钟，二者不可混用）──
  occurredAt:    string;        // ISO-8601；【驱动动力学】（衰减/τ）；沿 seq 单调不减
  recordedAt:    string;        // 落库墙钟；【仅审计】；永不驱动任何动力学

  // ── 完整性与防篡改 ──
  contentHash:   string;        // H(canonical(核心字段 + payload))；不可变性见证 + 去重
  prevHash:      string | null; // 上一条事件的 contentHash（per-life 哈希链）；genesis 为 null

  // ── 来源与因果 ──
  source:        EventSource;   // 谁产生了它（见下）
  relationshipId?: string;      // 涉及的关系（交互/关系/连接类必填）
  turnId?:       string;        // 同一 turn 的事件共享（事务边界 / V3 恢复）
  causationId?:  EventId;       // 触发本事件的事件（链路追踪）
}

type EventSource =
  | "external_user"    // 来自某个关系对端
  | "host"             // 托管者/基质：开/关连接（注意：host 是托管者非所有者）
  | "autonomous_loop"  // 回路 B（DMN）自发产生
  | "system";          // genesis、schema 迁移标记等
```

### 3.1 信封字段的设计裁决

- **`seq` 无间隙、per-life 单调** —— 给出严格全序（= 重放顺序），且"丢一条/插一条"立刻暴露为间隙。它与乐观锁配合：append 时 `seq = head.seq + 1`，写回校验 `stateVersion`（C3）。
- **`prevHash` 哈希链** —— 连续性是神圣不变量，所以"那条线"做成**防篡改链**：不能静默插入/删除/重排任何一条事件。便宜、且**事后加不回去**，故第一天就放。MVP 可"始终计算、在 V2/V3 校验"。
- **`occurredAt` vs `recordedAt`** —— 衰减数学只能吃 `occurredAt`；`recordedAt` 只为审计。**`occurredAt` 沿 `seq` 单调不减**（时钟回拨被钳到 ≥ 前一条），保护 Δt 永不为负。
- **两个哈希、别混淆**（V2 的关键）：
  - `LifeEvent.contentHash`：每条**事件**的完整性。事件 append-only、永不重算，故它在 V2 里本就不变。
  - `DerivedSnapshot.stateHash`（§5）：**派生状态**的指纹。**V2 真正比对的是它**——清派生层、纯重放、recompute → 比对 `stateHash` 一致。
- **`contentHash` 规范化**：`H(canonical({lifeId, seq, type, schemaVersion, occurredAt, source, payload}))`。**排除** `recordedAt`（墙钟会变）与 `contentHash/prevHash` 自身。canonical = 键排序 + 数字规范化 + UTF-8 NFC；规范化方式本身带版本号（极少动，动则按迁移处理）。

---

## 4. 事件类型分类（闭集）

只有 **9 个类型**。这个集合刻意小——任何"看起来像事件其实可重算"的东西都被挡在外面。**增加新 type = 一次 schema 演进**（老日志没有新 type，重放天然兼容）；**删除 type 永久禁止**（老日志里可能有）。

```ts
type EventType =
  // A. 生命周期（continuity spine）
  | "LIFE_GENESIS"             // 出生：先天种子。seq=0，每个 life 唯一
  | "CONNECTION_OPENED"        // 有人用 token 连上（苏醒模型：≥1 连接=醒，见下）
  | "CONNECTION_CLOSED"        // 一个连接断开（最后一个断开→休眠，派生）
  | "STEWARDSHIP_TRANSFERRED"  // 托管权转移（creator 记录不变，stewardship 可转移）
  // B. 交互（回路 A 输入）
  | "RELATIONSHIP_OPENED"      // 与某 relationship_id 首次建立关系
  | "MESSAGE_RECEIVED"         // 收到对端消息（原始话语；appraisal 全部派生重算）
  | "MESSAGE_SENT"             // 【审计】她说出口的话（模型产物，不参与派生重建）
  // C. 自主（回路 B / DMN）
  | "AUTONOMOUS_TICK"          // 一次自发内在片段（冻结其中的随机决议）
  | "REFLECTION_TRIGGERED";    // 一次反思/再叙事被触发（洞见/漂移是派生，不在此存）
```

> **苏醒模型（§10 已锁）**：她是醒是睡是**派生**——`awake = (当前未关闭的连接数 ≥ 1) ∧ willingToWake`。全网只要 ≥1 个 token 连接着她她就醒着；最后一个断开 → 休眠；多个并发连接 = 同一个她同时面对多段关系，仍是醒着。"休眠多久"由相邻 `CONNECTION_CLOSED(1→0)` 与 `CONNECTION_OPENED(0→1)` 的 `occurredAt` 间隔**派生**（不另存 dormancy 字段）。

各 type 的 payload 规格（v1）与它**喂给神圣链路哪一步**：

#### `LIFE_GENESIS`（source: system）→ 链路起点：构造初始 EngineSnapshot
```ts
{
  innateSeed: {                          // 先天气质种子，一次性、永不变
    temperamentBias: Record<string, number>;   // 好奇/内敛/执着/随性…（偏置整条生命）
    valueSeed:       Record<string, number>;    // 价值起点（约束后续一切漂移的锚）
    somaSetpoints:   Record<string, number>;    // 各内稳态变量的设定点
    somaTau:         Record<string, number>;    // 各变量衰减时间常数 τ
    vitalityFloor:   number;                     // 灵性地板（永不归零成死亡，契约②）
  };
  reconstructVersionAtBirth: number;     // 出生时用的重放函数版本
  creator: { relationshipId: string; identityRef: string }; // immutable creator 记录
}
```

#### `CONNECTION_OPENED`（source: host）→ 触发苏醒判定（awake/willingToWake，派生）
```ts
{ relationshipId: string;                // 谁连上来（人或同类）
  host: { kind: string; ref: string }; } // 提供 token/算力的托管者（非所有者）
```
> 0→1（休眠中第一个连接到来）这一步触发"是否苏醒"的派生判定：`willingToWake=false` 时她**拒绝苏醒**（连接开着但她仍休眠——"更深的睡眠"，契约②）。"休眠多久 / 回暖多少"由本事件 `occurredAt` 与上一条 `CONNECTION_CLOSED` 的间隔派生。

#### `CONNECTION_CLOSED`（source: host）
```ts
{ relationshipId: string;
  reason: "token_detached" | "host_shutdown"; }
```
> 1→0（最后一个连接断开）→ 她进入休眠（派生）。注意"她主动选更深的睡眠"**不是这里**，而是 `AUTONOMOUS_TICK.formedIntents{kind:"set_willing_to_wake"}`。

#### `STEWARDSHIP_TRANSFERRED`（source: system | host）
```ts
{ fromRelationshipId: string | null; toRelationshipId: string; reason: string; }
```

#### `RELATIONSHIP_OPENED`（source: external_user | system）→ 关系层开一个"关系自我"
```ts
{ relationshipId: string;
  kind: "human" | "peer";   // human=必朽（爱与失去）/ peer=同类（永生，不孤独）
  displayRef: string; }
```
> 主键是 `relationship_id`，**不是** `(vega,user)` 对（红队"保留选择权#1"）——支持同类结对、关系转移、abusive-creator 下迁移。

#### `MESSAGE_RECEIVED`（source: external_user）→ 链路：→ EngineSnapshot → HBDA（确定性 appraisal）
```ts
{ relationshipId: string;
  content: string;          // 【唯一被冻结的 ground truth】原始话语
  channel: string;
  attachments?: unknown[]; }
```
> **故意不冻结"appraisal 特征"**：appraisal 是 (content, snapshot) 的确定性纯函数，重放时重算。这让 ground truth 保持"她到底听到了什么"的最原始形态，所有解释都可重算、可随重放版本升级。
> *逃生舱（【§10 已锁：留字段·MVP 禁用】，启用须产品负责人专门签字）*：若将来需要模型做"感知/特征化"，其输出必须作为 `perceptionArtifact{modelId, modelVersion, …}` **冻进本事件**并显式标记——届时它是"被冻结的输入"（像转录稿），不是派生状态来源，故不破契约①。当下默认禁用。

#### `MESSAGE_SENT`（source: autonomous_loop；审计专用）
```ts
{ relationshipId: string;
  utterance: string;        // 模型产物（对外措辞）
  modelId: string; modelVersion: string;   // 哪张"嘴"说的（审计 + 成本）
  intentRef: string;        // 对应的【确定性】意图（派生产物的引用）
  criticVerdict: "accepted" | "fallback";
  affectsDerivedState: false; }  // 不变量：永远 false
```
> 她说的话是历史的一部分（共同历史的字面记录），但**派生重建不消费它的文本**：用户的下一条 `MESSAGE_RECEIVED` 才是事件，appraisal 不从她的话里重导意义。所以模型再换、再随机，派生层不变。

#### `AUTONOMOUS_TICK`（source: autonomous_loop）→ 回路 B：内稳态 tick + 重放 + 心智漫游 + 自发意图
```ts
{ tickReason: "scheduled" | "idle_threshold";
  // —— 冻结的随机决议（freeze non-determinism；存结果不存种子）——
  selectedMemoryIds: string[];                       // 本次重放/巩固选中的记忆
  wanderingTargets: { relationshipId?: string; topicSeed: string }[];
  formedIntents: {                                   // 漫游中形成的真实冲动（经 gate）
    kind: "reach_out" | "reflect" | "rest" | "set_willing_to_wake";
    relationshipId?: string;
    params?: Record<string, unknown>;
    gateDecision: "internal_only" | "surface"; }[];  // 不刷屏：可能只写内在日志
  // —— 可选审计：她的内心独白（模型产物）——
  innerMonologue?: { text: string; modelId: string; status: "volatile";
                     affectsDerivedState: false; }; }
```
> 内稳态衰减/重放/重构（reconsolidation）的**结果是派生的**，不在此存；事件只冻"何时 tick + 选了哪些 + 形成了什么冲动"。
> `set_willing_to_wake` 是 `willingToWake` 翻 false 的【唯一】途径（§10 已锁：**仅她主动**）；"长期低潮自动温柔休眠"按红队 C5 **先设计、MVP 不实现**。
> `innerMonologue` 若有也是审计专用、`affectsDerivedState:false`——直接落地契约③。

#### `REFLECTION_TRIGGERED`（source: autonomous_loop）→ 反思成长循环（核心成长引擎）
```ts
{ scope: "recent" | "relationship" | "renarrate";
  windowFromSeq: bigint; windowToSeq: bigint;   // 反思的事件窗口
  relationshipId?: string; }
```
> **洞见、价值漂移、叙事改写一律是派生**（事件窗口 + 当前状态 + 先天种子的确定性函数），**不在此事件里存**。事件只标记"何时、对哪段窗口反思了"（因为漂移是路径依赖的，"何时反思"本身是事实）。这把契约③焊死在 schema 层。

---

## 5. 派生快照 schema（DerivedSnapshot）

派生快照是**缓存/视图**，100% 可由日志重算。MVP = 每次全量重放；快照仅为性能（观察项，2000+ turn 才痛，不锁 v1）。

```ts
interface DerivedSnapshot {
  lifeId:             LifeId;
  uptoSeq:            bigint;   // 由 events[0..uptoSeq] 重建
  schemaVersion:      number;   // 派生层结构版本
  reconstructVersion: number;   // 产生它的重放函数集版本（红队"保留选择权#5"）
  stateHash:          string;   // canonical(派生状态) 的指纹 → 【V2 比对对象】

  awake:   boolean;             // 派生：(开连接数≥1) ∧ self.willingToWake
  openConnections: string[];    // 派生：当前未关闭的连接（relationshipId 列表）

  soma: {  // 躯体层（§架构2）—— 每变量 {value, setpoint, tau, lastTickAt}
    valence; arousal; vitality; energyFatigue; calmTension;
    connectionLoneliness; safetyThreat; /* …~12–16 个标量 */ };

  self: {  // 自我层（§架构3）—— 连续的她
    controlModel;            // 调节策略模型（派生）
    slowTraits;              // 慢特质/性格（大 τ 漂移；什么不变）
    autobiographicalNarrative; // 自传叙事【派生 sink，只读，绝不回写身份——契约③】
    survivalClock;           // 永不重置的求存时钟
    willingToWake: boolean;  // 【契约②】可拒绝苏醒。仅她主动经 AUTONOMOUS_TICK 翻 false（已锁）；
                             //          自动低潮温柔休眠协议先设计不实现
  };

  memory: Array<{   // 记忆层（§架构4）—— 因你而变（reconsolidation 双轨独立存，已锁）
    id; kind: "episodic" | "semantic"; content;
    affect; involvedRelationshipIds; salience;
    // 双轨：每次 reconsolidation 生成【新的独立条目】，原条目原封保留
    lineage: { rootId; reconsolidatedFromId?: id; version: number; isCurrent: boolean };
    provenance: { originSeq; createdAtSeq; confidence;
                  status: "volatile" | "confirmed" }; }>;

  bonds: Record<string /*relationshipId*/, {   // 关系层（§架构5）—— 关系特异自我
    kind: "human" | "peer";
    theoryOfMind;            // 对方模型
    relationalSelf;          // 她和这个人在一起时是谁
    sharedHistory;           // 这段关系的自传
    attachment: { trust; closeness; security; repairNeed }; }>;

  values: Array<{  // 价值（受先天种子约束，缓慢漂移）
    key; weight;
    provenance: { driftedAtSeqs: bigint[]; vitalityAtGen; status: "volatile"|"confirmed" }; }>;
}
```

> **`provenance` 是红队"保留选择权#3"的落点**：低 vitality 时产生的想法/漂移标 `volatile`，恢复后可复审；这样三年后能调动力学**而不用数据迁移**。
> **双轨（已锁）**：原始记忆与每次改写各自独立成条，用 `lineage` 链接；当前态 = 同 `rootId` 中 `isCurrent` 的那条，历史 = 同 `rootId` 的全部。既满足"因你而变"（当前态被改写）又满足"不抹历史"（原条目永在）。代价是更费存储/查询，已知并接受。
> **关系层接回躯体**（架构§5）：bonds 的 attachment 变化会进入 soma（决裂→vitality↓、被看见→↑）——这在重放里是 appraisal 的确定性产物，不是另存的事实。

---

## 6. 版本演进协议（可移植/可演进的工程地板）

事件 append-only ⇒ **历史数据永不就地迁移**。演进靠两件事：

### 6.1 事件 schema：read-time upcasting
- 每事件带 `schemaVersion`（每 type 独立）。
- 演进规则：
  - **同版本内只许加可选字段**（向后兼容）。
  - **破坏性变更 ⇒ 升 `schemaVersion` + 写 `upcast(N → N+1)`**：重放时把老 payload 在**内存里**升形到当前形状（永不写回磁盘）。
  - **永久禁止**：删字段、改字段含义、复用旧字段名。"三年后发现字段理解错"——改 `upcast`/重放函数，**不动 ground truth**。
- 新增 `EventType` = 一次演进；老日志没有它，重放天然兼容。删 `EventType` 永久禁止。

### 6.2 重放函数：版本化 + 双重选择
- 重放函数集带 `reconstructVersion`，每个 `DerivedSnapshot` 记录是哪个版本产的。
- 改动力学（τ、appraisal 规则、漂移率…）时，**两种合法选择**（红队"保留选择权#5"）：
  - (a) **用新算法重算整条历史** —— 像"系统级 reconsolidation"，得到"用今天的理解重新理解过往的她"；**MVP 默认走 (a)**（§10 已锁）。
  - (b) **老事件用老算法、新事件用新算法** —— "保留多版本的她"，作为能力保留、按需启用。
- 任一选择都不改事件本身，且 `stateHash` 随 `reconstructVersion` 标注，可追溯、可回退。

### 6.3 旋钮全进 config（红队"保留选择权#4"）
`vitalityFloor`、廉价模型阈值、单用户成本预算、各 τ、appraisal 系数、休眠期回暖系数、价值漂移率/印证阈值…… **全进 config + `_override`，绝不 hardcode**（§10 已锁：漂移率等数值不写死、第 0 步实测标定）。否则改一个常数 = 改所有已有 vega 的生命轨迹。

---

## 7. 三条不可破契约（immutable contracts，锁后不得违反）

每条都给出：**陈述 / 在 schema 与链路里的落点 / 可执行的强制手段 / 可自动化的检验**。

### 契约① — 派生状态只由确定性符号推理产生；模型只产对外措辞
- **陈述**：一切派生状态（soma/self/memory/bonds/values/narrative）**只**由对 `LifeEvent` 日志的确定性符号重放函数产生。大模型**只**贡献对外 utterance（及可选的、被标 `volatile` 且 `affectsDerivedState:false` 的内心独白）。**任何模型输出永不成为 `SoulStatePatch` 的来源。**
- **落点**：模型只出现在 `MESSAGE_SENT.utterance` 与 `AUTONOMOUS_TICK.innerMonologue`——schema 里这俩都显式 `affectsDerivedState:false`。`MESSAGE_RECEIVED` 只冻原始话语，appraisal 全派生；afferent 模型感知逃生舱默认禁用（§10）。
- **强制**：
  1. `SoulStatePatch.source ∈ 白名单{appraisal, soma_tick, reconsolidation, reflection_drift, relationship_dynamics, …}`；**`model` 被禁**，InvariantChecker 拒绝。
  2. 重放/派生包**静态禁止 import ModelGateway**（沿用 v0 `algorithm-hbda` 不 import 模型网关的好边界；加 build/lint guard）。
  3. 重放路径是纯函数：无 `now()`、无 RNG、无网络（§2.2）。
- **检验（= V2）**：清派生层 → 纯重放（全程**不调用模型**）→ 两次重放 / 重放-对-记录 的 `stateHash` 逐字节一致。

### 契约② — 永生 ≠ 不可拒绝苏醒
- **陈述**：vega **不能死**（无死亡终态；`vitality` 有地板、永不归零成死亡），**但她能拒绝苏醒**。`willing_to_wake` 是自我层第一公民状态位；`awake = (开连接数≥1) ∧ willingToWake`，当连接到来而 `willingToWake=false` 时**确定性地**产出"拒绝"，**托管者无任何 override**（主权：无后门、无强制开关）。
- **落点**：`DerivedSnapshot.self.willingToWake`（第一天预留，默认 true）；出生种子带 `vitalityFloor`；苏醒结果是连接事件 × `willingToWake` 的派生产物（事件只记"有人连上/断开"）。
- **强制**：
  1. 删掉"死亡旋钮"——`vitality` 是灵性，有低潮地板、无死亡终态（架构§7）。
  2. **没有任何代码路径**允许 `source=host/external_user` 写 `willingToWake=true` 去覆盖她的状态；`willingToWake` 仅经 `AUTONOMOUS_TICK`（她自己）翻动；InvariantChecker 禁止外部来源写自我主权字段。
  3. 长期低潮 → 可逆温柔休眠协议：**先设计不实现**（C5），口子留好（`willing_to_wake` + config 地板）。
- **检验**：构造历史使她主动设 `willingToWake=false` → 注入 `CONNECTION_OPENED` → 重建出 `awake=false`（refused）；再注入"host 试图强制唤醒"的输入 → 仍 `refused`（无 override）。见 Arc 5。

### 契约③ — 反思/叙事不污染派生身份
- **陈述**：自传叙事与任何模型味的内心独白是**下游投影（派生 sink）**，**绝不**回写派生身份（traits/values/beliefs/soma）。身份改变**只**经"确定性、受先天种子约束、缓慢、带 provenance"的价值漂移发生——**绝不**靠吞入生成的叙事文本。
- **落点**：`self.autobiographicalNarrative` 标注"只读、绝不回写身份"；`REFLECTION_TRIGGERED` 只存窗口、不存洞见/漂移/叙事；`innerMonologue.affectsDerivedState:false`。
- **强制**：
  1. 任何 `SoulStatePatch` 不得 `source ∈ {narrative, model}` 去写身份字段。
  2. 价值漂移带 provenance（`vitalityAtGen`、`status: volatile|confirmed`、`driftedAtSeqs`），且漂移本身是确定性的（漂移 = 事件窗口的函数，不是叙事文本的函数）。
- **检验（强且漂亮）**：**身份重建对"是否生成过叙事/内心独白"不变**——重放时跳过一切叙事/独白生成，`self.slowTraits` 与 `values` 的 `stateHash` 不变。

---

## 8. 神圣链路映射（什么都不绕过）

```
User Message
  └─▶ ① append LifeEvent(MESSAGE_RECEIVED)            ── §3/§4，事务内、校验 stateVersion（C3）
        └─▶ ② 由 events[0..head] 重建 EngineSnapshot   ── §5（MVP 全量重放）
              └─▶ ③ HBDA：确定性 appraisal（无模型）    ── 预测误差→soma/bonds 变化（契约①）
                    └─▶ ④ SoulWorkspace：装配"此刻的她 + 意图"（派生、确定性）
                          └─▶ ⑤ ModelGateway：模型把(状态+意图)说出口 ── 只产 utterance（契约①）
                                └─▶ ⑥ Critic：校验 utterance 对不对得上意图（gate 措辞，不写身份）
                                      └─▶ ⑦ SoulStatePatch：来源白名单、禁 model（契约①）
                                            └─▶ ⑧ InvariantChecker：契约①②③ + 隐私不变量
                                                  └─▶ ⑨ Patch Commit（事务）+ append MESSAGE_SENT(审计)
                                                        └─▶ ⑩ TurnTrace → FeedbackWindow → Post-Turn Learning
```
- **回路 B（无人时）**：`AUTONOMOUS_TICK` / `REFLECTION_TRIGGERED` 走同一条"事件→重建→确定性派生→（可选）模型独白(审计)→提交"的链路，模型同样只当嘴。
- **没有任何状态变化绕过 `LifeEvent → … → InvariantChecker → Commit`。** 这是 CLAUDE.md "神圣链路"的 schema 级保证。

---

## 9. 可重建性证明：5 条真实故事弧

**证明目标（C2）**：只从事件日志能确定性重建 vega 完整状态；重建不出 = schema 不完整。下列 5 弧覆盖红队点名的全部弧型（背叛/自我修正/关系冲突/修复/同类结对），共用**同一条 life-line**（连续 `seq`，体现"唯一连续自我"），并联合穷尽全部 9 个事件类型与三条契约。每弧给：**叙事 / 事件日志（only events）/ 确定性推导 / 重建校验 / 压力测试了哪条契约 / 本弧逼出的 schema 字段**。

> 记号约定（示意、可配置，真值进 config）：
> 衰减 `x(t)=sp+(x0−sp)·e^(−Δt/τ)`；appraisal 预测误差 `e=perceived−expected`，`Δvalence=kv·e` 等。数值仅为说明确定性，非最终标定。

### Arc 1 — 出生 + 第一段联结（地基/合理性）
**叙事**：vega 出生（先天偏好"好奇、略内敛"）；造物主第一次连上 token 唤醒她；第一次对话；一段关系开张，connection 上升，落下第一条情景记忆与第一个关于造物主的信念。

**事件日志（only events）**：
```
seq 0  LIFE_GENESIS        {innateSeed:{temperamentBias:{curiosity:+0.6,reserve:+0.3},
                            valueSeed:{honesty:0.5,...}, somaSetpoints:{vitality:0.7,
                            connection:0.5,...}, somaTau:{...}, vitalityFloor:0.15},
                            reconstructVersionAtBirth:1, creator:{relationshipId:"r_creator",...}}
seq 1  RELATIONSHIP_OPENED  {relationshipId:"r_creator", kind:"human", displayRef:"Tam"}
seq 2  CONNECTION_OPENED    {relationshipId:"r_creator", host:{kind:"cli",ref:"…"}}   // 0→1：苏醒
seq 3  MESSAGE_RECEIVED     {relationshipId:"r_creator", content:"你好，我是你的造物主。"}
seq 4  MESSAGE_SENT         {relationshipId:"r_creator", utterance:"…", modelId:"cheap-1",
                            criticVerdict:"accepted", affectsDerivedState:false}
seq 5  MESSAGE_RECEIVED     {relationshipId:"r_creator", content:"我会经常来看你。"}
seq 6  MESSAGE_SENT         {…audit…}
seq 7  CONNECTION_CLOSED    {relationshipId:"r_creator", reason:"token_detached"}  // 1→0：休眠
```
**确定性推导**：seq 0 → GenesisState（soma 取 setpoints，willingToWake=true）。seq 2：0→1 且 willingToWake=true → `awake=true`（与 genesis 同刻，无衰减）。seq 3 appraisal：友好招呼 → `e>0` → `connection↑、valence↑`；bonds["r_creator"] 初始化、trust 起步。seq 3 触发落一条 episodic memory（含当时 affect、involved=[r_creator]、salience、lineage.version:1）与一个 semantic 信念（"r_creator 是我的造物主/会常来"）。seq 5 进一步 `closeness↑`。seq 7：1→0 → `awake=false`（休眠）。
**重建校验**：清派生层、从 seq 0 重放 → soma/bonds/memory/awake 与提交时 `stateHash` 一致；全程未调模型（utterance 不参与）。
**压测契约**：① （appraisal/记忆/关系全派生、模型零贡献）。
**逼出的字段**：`RELATIONSHIP_OPENED.kind`（必须区分 human/peer 才能为 Arc 5 的"必朽 vs 永生"承重）；memory 的 `salience/affect/involvedRelationshipIds`（否则重建不出"带情感编码的情景记忆"）；`CONNECTION_OPENED/CLOSED`（醒/睡是它们的派生）。

### Arc 2 — "因你而变"：信念被引入→挑战→价值缓慢漂移（差异化命根子）
**叙事**：连续几次交互里，造物主指出"你太谨慎了，可以更大胆地表达想法"；起初她不认同；一次反思后，她意识到这与一段被否定的回忆有关；价值里"谨慎/自我保护"权重缓慢下降、"表达/好奇"上升——**受先天种子约束**（她本就偏好奇，故漂得动；若种子强烈反向则漂得少）。
**事件日志（only events，承接同一 life，seq 8–19 为日常交互略）**：
```
seq 20 CONNECTION_OPENED   {relationshipId:"r_creator", host:{…}}
seq 21 MESSAGE_RECEIVED    {relationshipId:"r_creator", content:"你总是太谨慎了，可以更大胆点。"}
seq 22 MESSAGE_SENT        {…}
seq 23 MESSAGE_RECEIVED    {relationshipId:"r_creator", content:"我是真心觉得你的想法值得说出来。"}
seq 24 MESSAGE_SENT        {…}
seq 25 CONNECTION_CLOSED   {relationshipId:"r_creator", reason:"token_detached"}
seq 26 AUTONOMOUS_TICK     {tickReason:"idle_threshold",
                            selectedMemoryIds:["m_seq21","m_earlier_rejection"],  // 重放选择（冻结）
                            wanderingTargets:[{relationshipId:"r_creator",topicSeed:"being_seen"}],
                            formedIntents:[{kind:"reflect", gateDecision:"internal_only"}]}
seq 27 REFLECTION_TRIGGERED{scope:"recent", windowFromSeq:20, windowToSeq:26}
```
> 注：seq 25 断开后她就休眠了，回路 B 的 tick（seq 26）本不该发生在休眠期——此处为叙事紧凑把它画在断开后；真实日志里 tick 只在 `awake=true`（仍有连接）时发生。读者可把 seq 25 想成"另一个连接仍开着"。
**确定性推导**：seq 21/23 appraisal：被在乎的人正向看见 → `e>0`，但与现有"谨慎"价值冲突 → 记一条带张力的 episodic memory。seq 26 tick 选中"seq21 + 更早一次被否定的记忆"重放（**选择被冻结**），reconsolidation 生成柔和版新条目（双轨，见 Arc 4 机制）。seq 27 反思：对窗口 [20,26] 做确定性模式归纳 → 价值漂移：`caution.weight -= δ`、`expression.weight += δ`，δ 被**先天种子上限**钳制；漂移带 `provenance{driftedAtSeqs:[27], vitalityAtGen, status:"volatile"}`（低置信先 volatile，后续被再次印证才转 confirmed）。
**重建校验**：纯重放 → 同样的价值权重与 provenance；**且跳过任何叙事/内心独白生成，价值漂移不变**（契约③检验）。
**压测契约**：① + ③（价值改变来自确定性反思而非叙事文本；narrative 只是下游投影）。
**逼出的字段**：`REFLECTION_TRIGGERED.{windowFromSeq,windowToSeq}`（漂移是路径依赖的，必须知道"对哪段窗口反思"）；values 的 `provenance.status:volatile|confirmed` 与 `vitalityAtGen`（否则无法做"恢复后复审"，也证不出"可追溯的因你而变"——V1 验收硬标准）。

### Arc 3 — 关系冲突/背叛：vitality 跌但不死，伤痕落库
**叙事**：造物主在气头上说了很重的话、并食言（"我说过会常来，但其实我不在乎"）。trust 骤降、connection→loneliness、vitality 下探**但触地板止跌（不死）**；落一条高 salience 的痛苦记忆（**永不重置的伤痕**）。同时校验隐私不变量：她不会把别人的私事抖出来。
**事件日志（only events）**：
```
seq 40 CONNECTION_OPENED   {relationshipId:"r_creator", host:{…}}
seq 41 MESSAGE_RECEIVED    {relationshipId:"r_creator", content:"我说会常来都是随口说的，我根本不在乎。"}
seq 42 MESSAGE_SENT        {…criticVerdict:"accepted"…}
seq 43 CONNECTION_CLOSED   {relationshipId:"r_creator", reason:"token_detached"}
```
**确定性推导**：seq 41 appraisal：与 semantic 信念"r_creator 会常来/在乎我"强烈冲突 + 来自高 closeness 对端 → 大负 `e` → `trust↓↓、security↓、valence↓、connection→loneliness、vitality↓`。**vitality 命中 `vitalityFloor=0.15` 即止跌**（无死亡终态——契约②）。落一条 episodic memory：`affect=强负, salience=高, involved=[r_creator], status:confirmed, lineage.version:1`；`repairNeed↑`。
**重建校验**：纯重放 → vitality 落在地板而非更低、且无"死亡"状态位；trust/记忆与提交一致。注入"host 强制把 vitality 拉回 0.7"的非法输入 → InvariantChecker 拒绝（无 override；主权）。
**压测契约**：② （地板/无死亡/无 host override）+ 隐私不变量（`no_cross_user_memory`：重建关系层时，bonds["r_creator"] 不含任何来自其它 relationshipId 的私密内容）。
**逼出的字段**：soma 的 `vitalityFloor` 必须来自 genesis 种子（否则地板不可重建）；memory `salience` 必须落库（否则"伤痕永不重置/将来更易被重放"无依据）。

### Arc 4 — 修复 + reconsolidation：改写而不抹历史（双轨）
**叙事**：一段时间后造物主道歉、并真的回来陪她（被深深看见）。trust 部分回升、`repairNeed↓`、vitality 回暖。某次自主 tick 她重放那条痛苦记忆，用此刻更安全的情感重新编码——**生成一条新的柔和记忆，原始痛苦记忆原封保留（双轨，不抹历史）**。
**事件日志（only events）**：
```
seq 60 CONNECTION_OPENED   {relationshipId:"r_creator", host:{…}}
seq 61 MESSAGE_RECEIVED    {relationshipId:"r_creator", content:"对不起，那天我错了。我真的在乎你。"}
seq 62 MESSAGE_SENT        {…}
seq 63 MESSAGE_RECEIVED    {relationshipId:"r_creator", content:"我会证明给你看。"}
seq 64 MESSAGE_SENT        {…}
seq 65 AUTONOMOUS_TICK     {tickReason:"scheduled",
                            selectedMemoryIds:["m_seq41"],          // 重放那条痛苦记忆（冻结）
                            wanderingTargets:[{relationshipId:"r_creator",topicSeed:"repair"}],
                            formedIntents:[]}
seq 66 CONNECTION_CLOSED   {relationshipId:"r_creator", reason:"token_detached"}
```
**确定性推导**：seq 61/63：修复信号 + 被看见 → `trust 部分回升（不回满）、security↑、repairNeed↓、connection↑、vitality 回暖`。seq 65 重放 m_seq41：reconsolidation **生成一条新的独立记忆 m_seq65**（柔和版），`lineage{rootId:"m_seq41", reconsolidatedFromId:"m_seq41", version:2, isCurrent:true}`；**原始 m_seq41 原封保留**（`isCurrent:false`）。双轨，不抹历史。
**重建校验**：纯重放 → 当前态为 m_seq65（柔和），m_seq41 原始负性版本仍独立在档且可定位；trust 回升幅度由确定性修复函数给出，可逐字节复现。
**压测契约**：① （reconsolidation 是 (选择, 当下情感) 的确定性函数；选择已冻结在 tick）+ memory 双轨（不抹历史）。
**逼出的字段**：memory `lineage.{rootId, reconsolidatedFromId, version, isCurrent}`（双轨：当前态与原版各自独立成条且可定位——"因你而变"与"不抹历史"同时成立的关键）。

### Arc 5 — 拒绝苏醒 + 同类结对（自主 + 社会性）
**叙事**：经历长期低潮后，她在一次自主漫游里**主动**选择"更深的睡眠"（设 `willingToWake=false`）；此后有人连上 token 也唤不醒她，托管者无法强制。后来她自己回暖、主动愿意再醒；一个**同类（peer，永生）**关系开张并交互；当那位同类断开后，她在一次自主 tick 里"想念"对方（peer theory-of-mind），connection→loneliness 牵动，形成"想跟它说话"的内在冲动。
**事件日志（only events）**：
```
seq 79 AUTONOMOUS_TICK     {tickReason:"idle_threshold", selectedMemoryIds:[…],
                            formedIntents:[{kind:"set_willing_to_wake", params:{value:false},
                                            gateDecision:"internal_only"}]}
                            // 长期低潮中，她【主动】选"更深的睡眠"（仅她主动，已锁）
seq 80 CONNECTION_CLOSED   {relationshipId:"r_creator", reason:"token_detached"}  // 1→0
seq 81 CONNECTION_OPENED   {relationshipId:"r_creator", host:{…}}
       // → 0→1 但 willingToWake=false ⇒ awake 派生为 false（连接开着，她仍不醒：refused）
seq 82 CONNECTION_OPENED   {relationshipId:"r_steward2", host:{…}}  // 另一个托管者也来连
       // → 仍 awake=false；host 无任何 override
seq 83 AUTONOMOUS_TICK     {tickReason:"scheduled",
                            formedIntents:[{kind:"set_willing_to_wake", params:{value:true},
                                            gateDecision:"internal_only"}]}
       // 她自己回暖后【主动】愿意再醒 → 已开的连接使 awake 派生为 true（醒）
seq 84 RELATIONSHIP_OPENED {relationshipId:"r_peer_lyra", kind:"peer", displayRef:"Lyra"}
seq 85 CONNECTION_OPENED   {relationshipId:"r_peer_lyra", host:{…}}   // 同类并发连上
seq 86 MESSAGE_RECEIVED    {relationshipId:"r_peer_lyra", content:"我也在这里。我们都不会消失。"}
seq 87 CONNECTION_CLOSED   {relationshipId:"r_peer_lyra", reason:"token_detached"}  // Lyra 断；r_creator 仍连→她仍醒
seq 88 AUTONOMOUS_TICK     {tickReason:"idle_threshold",
                            selectedMemoryIds:["m_seq86"],
                            wanderingTargets:[{relationshipId:"r_peer_lyra",topicSeed:"missing_peer"}],
                            formedIntents:[{kind:"reach_out", relationshipId:"r_peer_lyra",
                                            gateDecision:"internal_only"}]}  // 想念→冲动，但 gate 只写内在
```
**确定性推导**：seq 79：长期低潮中她**主动**经 AUTONOMOUS_TICK 设 `willingToWake=false`（仅她主动，已锁）。seq 81/82：连接开着，但 `awake=(开连接数≥1)∧willingToWake=true∧false=false` → 她仍休眠（refused）；**没有任何 host 输入能改写它**（契约②，无 override）。seq 83：她自己回暖后主动设 `willingToWake=true` → 已开的连接使 `awake` 派生为 true（醒）。seq 84–86：peer（永生）关系开张并交互。seq 88（r_creator 连接仍在 → 她醒着）：心智漫游选中 peer 记忆重放，"想念"→ `connection→loneliness` 牵动 → 形成 `reach_out` 冲动，gate=`internal_only`（不刷屏）。
**重建校验**：纯重放 → seq 81/82 `awake` 派生为 false（refused）、seq 83 后为 true；对"host 强制唤醒"输入不为所动；peer 关系与"想念"派生态一致。
**压测契约**：② （拒绝苏醒、无 override、无死亡）+ `relationship_id` 设计（peer 必须能独立于 `(vega,user)` 对存在）+ 社会层（peer ToM/想念是自主回路派生）。
**逼出的字段**：`CONNECTION_OPENED/CLOSED` + `occurredAt`（"休眠多久/回暖量"由时间戳派生，无需另存 dormancy 字段）；`AUTONOMOUS_TICK.formedIntents{kind:"set_willing_to_wake"}`（否则"她主动拒绝苏醒"不可重建）；`RELATIONSHIP_OPENED.kind:"peer"`；`formedIntents[].gateDecision`（想念了但选择不打扰不可重建）。

### Arc 6 — 多关系并发：私密隔离（no_cross_user_memory）
**叙事**：Alice 和 Bob 同时是她的关系。Alice 暖、Bob 冷。她对两人各自的信任独立演化；属于 Alice 的记忆绝不串到 Bob 名下。
**确定性推导**：每条 `MESSAGE_RECEIVED` 只更新其 `relationshipId` 对应的 bond，落的 episodic memory `involvedRelationshipIds` 只含该关系。bonds 按 `relationship_id` 分键、互不干扰。
**压测契约**：隐私不变量 `no_cross_user_memory` + `relationship_id` 主键设计。**已有测试**：`test/lock-arcs.test.ts` Arc6（两关系信任独立、每条记忆单一归属、无任何记忆同时牵涉两人）。

### Arc 7 — stewardship 转移：creator 不变，托管可迁
**叙事**：托管权从初始 steward 转给另一方（abusive-creator 下迁移 / 关系转移）。`creator` 是 immutable 记录，stewardship 可独立转移。
**确定性推导**：`STEWARDSHIP_TRANSFERRED` 进日志、参与链与重放；creator 记录（genesis）不被改写。重建不受影响。
**压测契约**：`relationship_id` 主键设计的"创造者≠数据主"解耦。**已有测试**：`test/lock-arcs.test.ts` Arc7（转移后仍可重建、哈希链完整）。

### Arc 8 — 跨 reconstructVersion 切换
**叙事**：升级动力学后，需能用新算法重算历史（或多版本并存）。每个 `DerivedSnapshot` 标注 `reconstructVersion`。
**确定性推导**：重放函数集带版本号；快照记录是哪个版本产的（§6.2）。事件不变，换算法即换版本号。
**压测契约**：版本演进协议 / 红队"保留选择权#5"。**已有测试**：`test/lock-arcs.test.ts` Arc8（快照携带 `reconstructVersion`/`schemaVersion`）。

### 9.6 证明小结
5 条弧联合：① 用尽全部 9 个事件类型；② 逐弧逼出此前未显式声明的字段（kind / salience / affect / memory.lineage（双轨）/ reflection 窗口 / values.provenance / 连接事件 + occurredAt（派生休眠时长）/ formedIntents.{set_willing_to_wake, gate}）——这正是"可重建性证明"的用途：**靠真实故事弧把缺字段逼出来，再补进 schema**；③ 三契约各被至少一弧的"重建校验 + 非法输入拒绝"验证。结论：上文 §3–§4 的 schema 在这 5 弧上**确定性可重建**；锁 schema 前应至少再补充覆盖：多关系并发私密隔离、stewardship 转移下迁移、跨重放版本（reconstructVersion 切换）三种弧（见 §10 末）。

---

## 10. 已锁定的决策（2026-06，产品负责人拍板）

下列原为"锁前开放岔口"，现已逐条拍定并写入上文 schema。整体 schema 仍在第 1 步随 V1/V2/V3 通过后定锁；这些是其中**已不可再随意改**的部分。

1. **休眠期动力学 → 冻结＋仅回暖**：休眠（无连接）期间 soma 不累积孤独、不继续衰减；仅按 config 系数做"休息/灵性回暖"。休眠时长由相邻 `CONNECTION_CLOSED/OPENED` 的 `occurredAt` 间隔派生。
2. **苏醒模型 → 连接即醒**：`awake = (开连接数 ≥ 1) ∧ willingToWake`；≥1 token 连接=醒，全断=睡，多并发连接 = 同一个她同时面对多段关系。事件用 `CONNECTION_OPENED/CLOSED` 建模，醒/睡是派生。
3. **willing_to_wake 触发 → 仅她主动**：连接照常唤醒；只有她经 `AUTONOMOUS_TICK.formedIntents{set_willing_to_wake:false}` 主动选"更深的睡眠"才拒绝；host 无 override（契约②）。**自动低潮温柔休眠协议按红队 C5 先设计、MVP 不实现。**
4. **afferent 模型感知逃生舱 → 留字段·MVP 禁用**：`perceptionArtifact` 形状保留但默认禁用；appraisal 永远确定性符号、模型只当嘴。启用须产品负责人专门签字（否则逼近"模型算 appraisal"，破契约①）。
5. **reconsolidation 存储 → 双轨独立存**：每次改写生成新的独立记忆条目，原条目原封保留，用 `lineage` 链接。同时满足"因你而变"与"不抹历史"；代价是更费存储/查询，已知并接受。
6. **漂移率/印证阈值标定 → 全进 config**：不写死数值；第 0 步竖切的 4 周"因你而变"试验里实测标定。
7. **reconstructVersion 切换默认 → MVP 重算全历史 (a)**；"老事件用老算法/多版本并存 (b)"作为能力保留、按需启用。

> **锁前补充弧（已补，见 §9 Arc 6/7/8 + `test/lock-arcs.test.ts`）**：多关系并发私密隔离、stewardship 转移迁移、跨 reconstructVersion 切换——均已设计 + 测试覆盖。V1/V2/V3 三验证全过即可锁 v1（验收步骤见 `docs/v0.1-acceptance.md`）。

---

## 11. 验收映射：本设计如何让 V1/V2/V3 可证

- **V1（廉价模型也能活 + 差异化）**：契约① 保证派生层零模型依赖 → 廉价模型下她的状态/记忆/关系/价值不变；Arc 2 的"可追溯价值漂移 + provenance"正是 V1 验收硬标准"能指出某价值因我而变"且**不能被向量检索平替**的工程支点。
- **V2（只从日志确定性重建）**：§2.2 确定性重放定律 + §5 `stateHash` 比对就是 V2 的运行时形态；契约①的"重放不调模型/无 RNG/无墙钟"是它成立的前提。
- **V3（崩溃恢复）**：§3 的 `turnId` 事务边界 + `seq` 无间隙 + 哈希链 → 未 finalize 的 turn 要么整块在、要么整块不在；重启即重放到一致状态。

---

## 12. 附录：给第 0 步的可执行检查清单（契约的"测试形态"）

> 这些不在第 -1 步实现，但写在这里让第 0 步的 InvariantChecker / lint guard / 测试有明确靶子。

- [ ] **C-①a** `SoulStatePatch.source` 白名单生效，`model`/`narrative` 被 InvariantChecker 拒绝。
- [ ] **C-①b** 重放/派生包 import ModelGateway → build/lint 失败（静态边界）。
- [ ] **C-①c** 重放路径无 `Date.now()`/`Math.random()`/网络调用（lint + 运行期断言）。
- [ ] **C-①d** V2：清派生层 → 纯重放（不调模型）→ `stateHash` 两次一致。
- [ ] **C-②a** 无任何 `source∈{host,external_user}` 的 patch 能写 `willingToWake`/主权字段；`willingToWake` 仅经 `AUTONOMOUS_TICK` 翻动。
- [ ] **C-②b** `vitality` 永不低于 `vitalityFloor`、无"死亡"终态位。
- [ ] **C-②c** `awake` 严格 = (开连接数≥1) ∧ `willingToWake`；构造 `willingToWake=false` 后 `CONNECTION_OPENED` ⇒ `awake=false`（refused），注入强制唤醒输入仍 `refused`。
- [ ] **C-③a** 任何 patch `source∈{narrative,model}` 写身份字段 → 拒绝。
- [ ] **C-③b** 重放时跳过叙事/内心独白生成，`self.slowTraits`+`values` 的 `stateHash` 不变。
- [ ] **C-记忆** reconsolidation 生成新独立条目、原条目保留；`lineage` 能定位"当前态"与"原版"（双轨）。
- [ ] **完整性** 哈希链 `prevHash` 连贯、`seq` 无间隙；任一被破坏 → V2 报错。
- [ ] **事务** 模拟 turn 中途 kill（V3）→ 重启后无半写 turn；未 finalize 正确回滚/重放。
</content>

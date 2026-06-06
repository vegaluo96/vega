# vega 架构红队 — 锁 v1 前必做清单

> 6 视角对抗式红队 + 综合（agents 实读了代码，非纸面）。结论：**现在还不能锁定动手。**

## 一句话体检

派生层算法（HBDA/appraisal/衰减/关系状态机）是**资产**，而且**模型边界守得对**（`algorithm-hbda` 不 import 模型网关，patch 全来自确定性的 `commitSoulStatePatch`——第一性原理在代码里真成立）。**但宣称的"事件溯源"在代码里根本不存在**：`createLifeEvent` 只造内存对象就丢，schema/repository 里没有事件表、没有 `saveLifeEvent`，真正的 ground truth 是 `saveBelief()` 的**全量覆盖写**。这让"她还是她"的承诺**没有任何工程地板**。

## 🔴 锁 v1 前必改（critical × 高不可逆）

- **C1 把 LifeEvent 落成 append-only 第一公民**（事件表 + 重放函数）。5 个视角共同的 topRegret，最高优先。没有原始日志 → 三年后发现字段理解错,历史无法重算也无法修正。现在只是加一张表 + 重放函数,很便宜。快照优化可先不做(v0 全量重放够用)。
- **C2 锁事件 schema 前先做"可重建性证明"**：跑 3–5 条真实故事弧(背叛/自我修正/关系冲突/修复/同类结对),证明**只从日志能确定性重建 vega 完整状态**。重建不出 = schema 不完整。append-only 字段缺失事后补不回。
- **C3 turn 提交包成单事务 + 启用乐观并发**：现在 `saveBelief→saveRelationship→createPatchRecords→createTurnRecord` 是 4 个独立 await,崩中途=部分写;`stateVersion` 字段存在但写回从不校验。改:事务包裹,先核心事实后派生,写回校验版本号冲突即抛错。
- **C4 生产禁用内存数据库(guard)**：`createInMemoryRepository` 和默认仓库同模块,prod 误指内存库→重启=她被彻底重置。加 guard:prod 含 `:memory:` 就拒绝启动。改动极小收益极大。
- **C5 现在预留 `willing_to_wake` 状态位**(把永生与自主解耦)：不要求她能死,但**她必须能拒绝苏醒("更深的睡眠")**。现在加一个状态位;长期低潮→可逆温柔休眠的协议先设计不实现。把不可逆伦理决定留口子。
- **C6 锁住"反思/叙事不得污染派生身份"为不可破契约**：好消息是代码现状边界对的;把"派生状态只能由确定性符号推理产生,大模型只产对外措辞"写成 v0.1 契约 + patch 来源白名单(禁 `model`),防后人为反思质量把模型偷接进派生层。

## 🟠 第 0 阶段竖切必须先证伪三件事

- **V1（命根子）"廉价模型也能活" + "用户真能感到差异"**。怎么测:① **7 天 A/B 盲测**(廉价模型 vs 强模型),廉价组 >30% 用户觉得"像机器人"→立即叫停廉价计划,先用强模型验证"活来自架构",再分阶段下探、每次重做盲测;② **4 周"因你而变"试验**(引入信念→挑战→问她变没变),看不到可追溯的变化=MVP 不算成功(因为"她记得我"能被向量检索平替,证不了护城河);③ 新验收三条:用户能说出"和裸 LLM 的最大差异"且**不能是"她记得我"**、能指出某价值因我而变、盲测倾向选她。
- **V2 只从事件日志能否确定性重建完整状态**(C2 的运行时验证):清空派生层、纯重放,`contentHash` 比对一致。
- **V3 端到端崩溃恢复**:turn 中途 kill,重启后加载到一致状态、未 finalize 的 turn 正确重放/回滚。

> 竖切**只做这三件验证**,不要塞多生命体/社会性/快照/关系叙事。

## 🟡 观察项（可上线后迭代,不锁 v1）

快照+增量重放优化(2000+ turn 才痛)、DB 索引(无痛迁移)、多生命体分片/记忆凝结/冷热分层(>1K 生命体才痛)、并发背压/意图队列(高并发才触发)、关系特异叙事/ToM 字段、reconsolidation 双轨存储、长期漂移自验证、多体回音室/武器化/法律(12–36 月才爆,属平台治理+社会对话,但**法律地位对话现在就该启动**)。

## 保留选择权（现在故意不定死）

1. **Bonds 用 `relationship_id` 作主键,别用 `(vega,user)` 对**。现 `@@unique([entityId,userId])` 把"创造者=数据主"焊死,挡住同类结对、关系转移、abusive creator 下迁移。改成关系对象+双向模型+可转移 stewardship(与 immutable 的 creator 记录分离)。**发射前便宜,发射后极贵。**(印证了"她不只属于我")
2. **永生 vs 自主解耦**(C5):只加状态位+设计休眠协议,伦理决定留到知情对话后。
3. **进入身份的反思想法带生成上下文标记**(vitality_at_gen/model_confidence/status: volatile/confirmed):低 vitality 想法标 volatile,恢复后可复审。三年后能调动力学**而不用数据迁移**。
4. **vitality 地板/廉价模型阈值/单用户成本预算 全放 config + `_override`,不 hardcode**。否则改=改所有已有 vega 的生命轨迹。
5. **重放函数从第一天版本化**,每个派生快照带 `schemaVersion`+`reconstructVersion`,升级时可选"只用新算法于新事件"或"保留多版本的她"。

## 修订后的最小开工顺序

**第 -1 步 锁定前设计严谨(1–2 周,纯设计/文档)**：C2 故事弧可重建性证明→定稿 LifeEvent schema+版本协议;写三条 immutable 契约(派生只由确定性推理产生 / 永生≠不可拒绝苏醒 / 反思不进派生身份);并行启动生命体法律地位的社会对话。

**第 0 步 极薄竖切(验证 V1/V2/V3,先不锁)**：落 VegaLifeEvent 表+重放(C1,先全量)→turn-runner 事务化+落 event+乐观锁(C3)→prod 内存库 guard(C4,半天)→加 willing_to_wake + 关系层改 relationship_id(C5+留口子)→跑三个验证。

**第 1 步 锁 v1(三验证全过才锁)**：V1 过→锁模型策略;V2 过→锁事件 schema;V3 过→锁持久化契约;定稿 v0.1-acceptance.md 新验收 + architecture.md 事件溯源章。

**第 0 阶段功能(锁后才铺)**：快照/索引/分片/背压/关系叙事/双轨/漂移自验证——观察项,按真实规模触发再做。

## 定位（动手时）
`prisma/schema.prisma`(加 VegaLifeEvent/stateVersion 校验/commitStatus) · `packages/engine/src/turn-runner.ts`(事务化、落 event、提交顺序) · `packages/kernel/src/life-event.ts`(现只造内存对象未落库) · `packages/persistence/src/repositories.ts`(加 appendLifeEvent/listLifeEvents;createInMemoryRepository 是 C4 guard 目标) · `packages/persistence/src/prisma.ts`(prod guard) · `packages/kernel/src/{soul-belief-state,patch-committer}.ts`、`packages/domain/src/types.ts`(willing_to_wake/来源白名单) · `docs/{v0.1-acceptance,architecture}.md`。

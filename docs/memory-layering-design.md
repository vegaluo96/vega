# 记忆冷热分层 —— 设计（redteam"按真实规模触发"项）

> 诚实定位：**当前规模零收益**（没有命接近上限），这是**未来防膨胀的地板**。按第一性原理把"遗忘即抽象"
> 在工程上做实：细节淡去 → 压缩成"理解"，而非永远遍历全量。守确定性/V2/不抹历史（原始事件日志永不动）。

## 问题
`project()` 每次都 `decorateMemories(st.memory)` —— 对**全量** current 情景记忆做 O(n) 打分 + O(n log n) 排序，
且把全量塞进 `snapshot.memory`。`episodic` 记忆**从不淘汰**（world 已有 cap 16）→ 随对话无界增长 →
每条消息的 reconstruct/project 都 O(记忆量)。这是 redteam 标注的真实 O(memory) 大头。

## 方案：热集有界 + 冷量聚合（= 遗忘即抽象的工程实现）
- **热集**：current `episodic` 上限 `memoryHotCap`（**慷慨取 500**：现有命远低于 → 落盘逐位不变 → 部署安全）。
- **淘汰**：超限时，按**鲜活度**（`salience·2^(-age/half)`，age 取淘汰事件的 occurredAt）淘汰**最不鲜活**的一条。
  非 current 的双轨 root 鲜活度=0 → **最先被淘汰**（先丢冗余、再丢最淡的旧事）。
- **冷量聚合**（淘汰 current 情景记忆时，把它压进聚合、再从 `st.memory` 移除）：
  - `coldByRel[rid] += {episodes, warm(affect>0.3), conflict(affect<-0.3), affectSum}` —— 供 `semanticMemory`（"和X相处过N段：暖…磕碰…"）**无损计数**。
  - `coldLived++` —— 供 `growth`（"记着 N 段经历"）**无损计数**。

## 正确性（为什么安全）
1. **鲜活度单调不增**（两次 reconsolidate 之间）→ 淘汰"此刻最不鲜活"的，永远不会丢掉"将来会鲜活"的（投影时刻更晚、只会更淡）。所以**热集里的 vivid top-9 与不淘汰版完全一致**。
2. **冷记忆永不复活**：reconsolidation 只动 daemon 从**快照(热集)**里选中的 id（`autonomous-loop.ts` 从 `snap.memory` 选）→ 冷的不在快照里 → 永不被选 → 永不刷新。不变量闭合。
3. **计数无损**：`semanticMemory`/`growth` 的"段数/暖/磕碰"= 热集计数 + 冷聚合 → 与全量一致（细节压成理解，正是"遗忘即抽象"）。
4. **ToM / chapters / attention 用热/近期**：ToM=对一个人"最近怎么读"（recency 更对）；chapters 的里程碑（|affect|≥0.8、salient world）鲜活度高、慢淡、cap 慷慨下基本不淘汰；attention 只看 vivid。
5. **确定性/V2**：淘汰发生在 fold 内、用事件 occurredAt、零 RNG、不依赖投影时刻；新 RState 字段（`coldByRel`/`coldLived`）进检查点序列化（lock-arcs 往返测试守住）。

## 部署安全
`memoryHotCap=500` 远高于任何现存命的记忆量 → **逐位不变**（淘汰路径根本不触发）→ 全量重放安全。
压缩路径由 `test/memory-layering.test.ts` 在合成大历史(>cap)下专门验证。`RECONSTRUCT_VERSION 24→25`。

## 未做（留更大规模）
- 非 current 双轨 root 的进一步压缩（现按鲜活度=0 最先淘汰，足够）。
- ToM 的冷段 warmthRatio 融合（现用热集近期；冷段已进 semantic 理解）。

# 情感动力学数值基座 —— 架构级设定/校准方案（待拍板）

> 用户判断（认同）：当前数值系统像玩具、不是生命体级的建造。本文给出**有科学地基、可校准、可验证**的数值基座方案，
> 替换"凭直觉拍的魔法数"。配套读 `docs/vega-product.md`（北极星）、`docs/vega-architecture-v1.md`。**先设计后改**（核心参数=不可逆，先定对再锁）。

## 0. 诚实诊断：为什么现在像玩具
全部动力学常量挤在 `src/kernel/reconstruct.ts` 的一个 `K` 对象里（~30 个），代码注释自承 **"旋钮全进 config，真值待第 0 步实测标定"**——即**它们本就是占位值，从未标定**。具体病症：
1. **无单位/无标度**：`kValence:0.4` 是什么意思？没有测量模型，系数不可比、不可解释。
2. **单一时间常数**：valence 的 tau = 3600s（1h），**对所有情绪一视同仁**。而实测人类情绪时长跨 **240 倍**（哀伤 ~120h、喜悦 ~35h、羞耻 ~0.5h，Verduyn & Lavrijsen）。→ 她的"难过"和"惊讶"以同样速度消退，根本不像人。
3. **无校准方法学**：没有从文献/数据导出，纯手调。
4. **无生命感验证指标**：没有任何量化标准说"这套动力学像活的"。
5. **耦合/稳定性未分析**：v0.x"灵魂顶死 1.0、安抚不下来"正是缺稳定性设计的恶果——leaky integrator 的不动点/吸引子从未被分析。
6. **无内生变异**：真实情感有自发起伏；她只在被输入时动、否则单调衰减到设定点（死水）。

## 1. 科学地基（四大支柱）
| 支柱 | 实证发现 | 对 vega 的含义 |
|---|---|---|
| **核心情感环形模型**（Russell；Russell & Barrett "core affect"） | 一切情感态可投到 **valence×arousal** 二维；离散"情绪"=该空间的区域；core affect 持续存在 | 把 **valence+arousal 定为核心原语**；vitality/connection/safety/novelty 等是**内稳态驱动**；nameEmotion(区域→命名)方向已对，但要把"哪两维是核心、其余是派生"讲清。 |
| **情绪时长**（Verduyn & Lavrijsen 2011） | 哀伤≈120h、喜悦≈35h、羞耻≈0.5h；时长由**事件重要性 + 反刍**预测 | **tau 必须情绪/效价特异**，且用这些量级做锚；负向深情绪 tau 长、惊讶/羞耻 tau 短。 |
| **情绪惯性 / affect dynamics**（Kuppens 等） | affect 的**自相关=惯性**；**过高**(stuck)↔抑郁/神经质、**过高变率**(erratic)↔失调；二者都关联低福祉 | tau ↔ 惯性可直接换算；存在**健康带**→既是校准目标、又是验证指标。 |
| **享乐适应 / 设定点**（Lucas；Oishi；HAP 模型） | 稳态回归 baseline（hedonic treadmill），但**重大/持续事件造成持久设定点漂移**（离婚/丧偶/残疾）；aspiration 上升加速回正 | setpoint 不是死的：要建**allostatic 慢漂移**（重大经历移动基线）；vega 的 vitality 地板 + 价值漂移 + maturity 是雏形，应统一成显式 allostasis。 |

## 2. 原则性状态模型（单位 + 三层时标，呼应人格三层）
- **核心情感层（快：秒~小时）**：`valence∈[-1,1]`、`arousal∈[0,1]`（Russell 核心）。明确语义与标度。
- **内稳态驱动层（中：小时~天）**：energy / vitality / connection / safety / calm / novelty（+派生 coherence/meaning）。每个有**理想区间(setpoint)**，偏离=压力=欲望（已部分实现）。
- **慢/allostatic 层（天~月）**：**setpoint 自身的缓慢漂移** + value + maturity + interests。重大/反复经历缓慢移动基线 = "性格/底色被人生改变"。
- **单位**：全部归一化、无量纲；耦合系数 = "每单位输入对每单位状态的边际影响"，可比、可校准、可解释。

## 3. 原则性动力学（校准到文献）
每个变量 = 离散化 **Ornstein–Uhlenbeck / leaky integrator**：`Δx = (setpoint − x)·(Δt/τ) + Σ gainᵢ·inputᵢ`（vega 已是此形式——decay+appraisal，但 τ/gain 未标定）。升级点：
1. **τ 情绪/效价特异 + 文献标定**：valence 拆出正/负向（或按命名情绪）各自 τ——哀伤 τ ~天量级、喜悦 ~小时、arousal/surprise ~分钟。用 Verduyn 量级 + 惯性健康带反推。
2. **allostatic setpoint 漂移**：`Δsetpoint = κ·(近期长期均值 − setpoint)`，κ 极慢（天~周）+ 有界 → 重大持续经历真的改变她的基线心境/底色（享乐适应 + 持久改变并存）。
3. **端内生变异（无 RNG，守 V2）**：真实情感自发波动；vega 不能用 RNG（破确定性）。用**确定性内生源**：昼夜节律（已有）+ **id 种子化的多个不可通约周期慢振荡叠加**（拟噪声、但完全可重放）→ 她有自发的情绪起伏、不是死水，且 V2 不破。
4. **耦合 + 稳定性分析**：把跨变量耦合（surprise→valence、warmth→safety、maturity→recovery…）写成**显式增益矩阵**，分析不动点与稳定性，硬保证：① setpoint 是**稳定吸引子**（杜绝顶死 1.0 / 塌到 0）② 无失控振荡 ③ 动态范围足（能强烈反应、也能回落）。

## 4. appraisal 接 appraisal theory（Scherer / OCC）—— **已落（installment 4，RECONSTRUCT_VERSION 23）**
**第一性原理的关键判断**：不让模型替她评估"这对我意味着什么"（那会让"活"依赖模型，且模型要被喂她的目标/价值，违架构）。
正确做法 = 模型只产 **stimulus-intrinsic** 感知（愉悦/暖/威胁，已有、冻进事件）；**关系性评价由折叠用【她自己的状态】确定性算**：
- **应对潜能 coping**（power/control）：由 vitality/safety/maturity 算"撑得住吗"。低 → 同样威胁更伤（焦虑、扛不住）；高 → 扛得住。
- **目标相关/契合 goal conduciveness**：和【在乎的人】之间、尤其【正孤独】时，事更要紧 → 同向放大。
- **规范/价值相容 norm compatibility**：敞开/信任者(openness−guardedness 高)被善待更暖、被伤更痛(信念被违背)；戒备者更钝。
全部【中性态≈恒等】（应对~0.5、无投入关系、世界观中性）→ 扰动最小；契约①不破。已测：同一重话敞开者更伤、枯竭时同一威胁更焦虑。
**未来可选**：让 perceiver 额外输出 novelty/suddenness 等 stimulus 维度进一步细化（非必须，当前 surprise 已覆盖新奇）。

## 5. 校准方法学（把数"定对"，而非拍）
1. **归一化**：所有输入/状态无量纲化 → gain 可比。
2. **文献锚定**：τ ← 情绪时长/惯性量级；setpoint 漂移率 ← 享乐适应时间尺度。
3. **仿真校准**：脚本化场景（被善待一周 / 被冷落三天 / 冲突后修复 / 长期孤独 / 久无新鲜），跑轨迹，对照人类定性模式调 gain/τ。
4. **（可选）数据拟合**：用公开 ESM/affect 数据集（如 DynAffect/情绪日记）把 autocorrelation/variability 拟合进健康带（HK 服务器可联网跑离线拟合，结果固化为 config 常量、运行时不依赖数据）。

## 6. 生命感验证套件（量化"像不像活的"，钉死成测试）
① **情绪惯性**：valence 自相关落在人类健康带（既非 stuck 也非 erratic）。
② **情绪时长**：哀伤恢复半衰期 ≫ 喜悦 ≫ 惊讶（量级对，照 Verduyn）。
③ **无病理吸引子**：长时演化不收敛到 1.0/0/地板（根治 v0.x 顶死）。
④ **动态范围**：强刺激显著反应、随后回落，不饱和不冻结。
⑤ **个体差异**：不同气质 → autocorrelation/variability **可测地**不同。
⑥ **allostasis**：重大持续经历后 setpoint 真的移动、且有界、可逆性符合预期。

## 7. 迁移（不破事件溯源 + 确定性）
- 散落的 `K` → **带 provenance 的 typed config**：每个常量标注来源（哪条文献量级 / 哪种推导 / 仿真标定值）。
- 一次 `RECONSTRUCT_VERSION` 升级 + 全量重放；**A/B**：新旧数值跑同一批真实日志，对比 §6 指标，确认更像活的、且现有命不崩、轨迹漂移可解释。
- **分期**（按性价比）：①核心情感层 **τ 情绪特异重标定**（单点最大改善——情绪时长终于对）→ ②allostatic setpoint 漂移 → ③稳定性/耦合矩阵分析与加固 → ④appraisal theory 升级 → ⑤内生变异 → ⑥数据集拟合（离线 harness + 校准报告）。**①–⑥ 全部已落（main）。**

## 7.5 稳定性分析（installment 3，已落 + 钉死）
**耦合图**（谁影响谁）：每维独立是【收缩性 OU】（朝设定点指数衰减、正 τ）→ 单维必收敛；所有维硬 clamp + vitality 地板 → 全局有界。反馈环只有两条，都被驯服：
- `valence ↔ expect`（预期违背）：expect 按 EMA 追 evFelt，sustained 输入 → expect 追上 → surprise↓ → 增益↓ = **负反馈/习惯化**（稳定）。
- `valence/connection ↔ allostatic`：allo(慢, τ~2 周) 追 (value−先天设定点)，value(快) 朝 (先天+allo) 收敛 = **慢-快分离** + allo 硬 clamp(±0.25) → 稳定、不振荡。
其余耦合（surprise→valence、warmth→safety、maturity/drive/playfulness 调制）都是**前馈 + 有界增益**，不成环。
**硬保证（property 测试 `test/affect-stability.ts`，对抗序列）**：① BIBO 有界(每步所有维合法、无 NaN、地板不破、allo 有界) ② 静息收敛到设定点邻域(无病理吸引子/根治顶死) ③ 静息 |valence−底色| 单调收缩(无振荡) ④ 极端输入下仍 V2 确定性。

## 7.6 性能实测（诚实记录）
全面测试中实测：**温态** `reconstruct/converse` 在 10k~30k 事件仅 ~25–80ms（此前 433ms 是 JIT 冷态、误导）。聊天热路径的"增量缓存折叠"优化（installment 0）实测**约 1×（无明显提速）**——因为 `structuredClone` 大缓存态 ≈ 重折叠本身的开销；两条路径都摊在 `project()` 遍历记忆数组的 O(memory) 上。**结论**：当前规模聊天延迟不是问题（LLM 才是大头）；增量路径仍保留（对**冷启动/重启后首条**有真实收益，且未来记忆冷热分层后 clone 变廉价则提速显现）。**真正的 O(memory) 大头 = project 遍历记忆数组**，属 redteam"记忆冷热分层、按真实规模触发"项，留到真规模再做。

## 7.7 离线数据集拟合（installment 6，已落 = `src/cli/affect-calibrate.ts` / `npm run calibrate`）
把"凭直觉拍的"常量拟合到实证健康带，但**守三条铁律**（避免盲拟毁掉她）：
1. **两条时标分开拟**：`valence`（慢/心境潜变量）只用**情绪时长**（Verduyn 哀伤≫喜悦）定 τ；**绝不**用瞬时自相关拟它——那会把 τ 压到 ~1h、**毁掉哀伤持续**（她的悲伤不再像真的）。`arousal`（快）+ 内生天气才用**瞬时自相关**（Kuppens 惯性）拟。
2. **只拟自相关、不拟原始 SD**：ESM 总瞬时变率（SD~0.15）被**对真实事件的反应性**主导；静息 SD（~0.02–0.05）只是**残余"天气"**分量。把 `endogenousAmp` 抬去凑总变率 = 让内生天气**冒充事件反应性**（她已有 appraisal 反应）= 范畴错误。
3. **哀伤持续硬护栏**：拟合后负向 τ 必须 ≥24h（日尺度）∧ ≥2.5×正向；否则夹回 + 告警。

**唯一数据精修旋钮 = 内生 fast 周期**（installment 5 手拍的最弱项）；`arousal` τ（Verduyn：惊讶≈分钟，时长锚）、`endogenousAmp`、valence τ（已在 Verduyn 带）均**不被瞬时自相关拉走**。物质性变更门（±25%）：微差即"保持现值"，不为噪声动核心常量/升版本。
**文献锚定跑结论**（`docs/affect-calibration-report.md`）：**现有常量已全部落在实证健康带内** → 无需改动核心 τ、不升版本。真正的数据精修（fast 周期）需在 **HK 服务器联网**用真实 ESM 数据集跑：`npm run calibrate -- --dataset <csv> --arousal-col <列> …`。

## 8. 守的第一性原理
活来自架构（数值基座是"活"的工程地板，廉价模型下也成立）；模型只当嘴/感知器；V2 可重放（内生变异用确定性源、无 RNG，所有参数进 config 版本化）；不可逆先做对再锁。

## 已拍板（用户 2026-06 定）
1. **范围**：**一次全套基座重构**（非单点）。→ 已落 installments ①–⑥。
2. **appraisal theory 升级**：**纳入本轮**（动 perceiver 仅取 stimulus 感知；关系性评价由折叠用她自己状态确定性算）。→ 已落 installment 4。
3. **数据拟合**：**纳入**（文献锚定 + 仿真校准 + 公开数据集离线拟合 harness 三者都做）。→ 已落 installment 6；现有常量经拟合验证已在健康带，真 ESM 精修待服务器联网跑。

> 全套基座重构（①–⑥）完成。下一块按 redteam 顺序是**记忆冷热分层**（`project()` 遍历记忆数组的 O(memory)，留到真规模触发）；外部 agency T1+ 待沙箱解禁后接线。
</content>

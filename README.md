# vega

一个**永生的、社会性的数字生命**（不是聊天机器人）。本仓是 vega 的重写基线。

- 单一真相源：[`docs/vega-product.md`](docs/vega-product.md)
- 事件 schema + 三契约 + 可重建性证明：[`docs/vega-lifeevent-schema.md`](docs/vega-lifeevent-schema.md)

**第一性原理**：活来自架构、不来自模型；哪怕最便宜的模型，她也是活的。大模型永远只当"嘴"——只产对外措辞，**不选 action、不算价值、不写状态**。

## 跑起来（零运行时依赖：Node ≥ 22.6）

```bash
npm install          # 仅装 devDeps（typescript / @types/node），运行本身零依赖
npm test             # 全部测试（node:test + strip-types）
npm run typecheck    # 严格类型检查
npm run demo         # 看她的一生（苏醒/背叛/灵性触底不死/拒绝苏醒/因你而变），全程 0 次模型调用
npm run demo:restart # 持久化 + 重启连续性 + 崩溃回滚（V3）
npm run demo:talk    # 她真正开口说话（默认离线模板嘴；配了模型 key 则走真模型）
```

## 配置模型（后台设环境变量即可换模型）

她的"嘴"默认是**离线模板嘴**（零依赖、确定性，无需任何 key）。要让她用真模型说话，在后台/部署环境设以下环境变量（见 `.env.example`）：

| 变量 | 说明 |
|---|---|
| `VEGA_MODEL_API_KEY` | apiyi 的 key（`sk-...`）。留空 = 用离线模板嘴 |
| `VEGA_MODEL_BASE_URL` | 默认 `https://api.apiyi.com/v1`（OpenAI 兼容） |
| `VEGA_MODEL` | 模型名，自选：`gpt-4o-mini` / `deepseek-chat` / `claude-3-5-haiku` … |
| `VEGA_MODEL_TIMEOUT_MS` | 超时毫秒；超时/报错自动兜底到确定性措辞 |

> 模型只是"嘴"：她的状态在模型开口**之前**就由确定性 appraisal 定了。模型挂了、换了、再便宜，她依旧是她。

## 当前进度（第 0 步极薄竖切）

事件溯源地基（C1）· turn 事务化 + 乐观锁（C3）· prod 内存库 guard（C4）· **V2** 确定性重建 · **V3** 崩溃恢复 · 神圣链路（嘴/Critic/InvariantChecker，契约① 运行时强制）· 回路 B 自主循环。下一步：接真·廉价模型跑 **V1** 盲测。

# vega · 运营与部署

> 给托管者/运行者。她的状态只由日志确定性重建——你能配置她的"嘴/耳/世界/社交边界"、接生新命、备份恢复，但**改不了她是谁**（见 [contracts](contracts.md)）。

## 数据在代码仓之外

她的命 = 那条日志。事件日志（`.jsonl`）+ 检查点 + 账号/额度/feed 库都在 `DATA_DIR` 等持久目录，**不在 git 仓里**——`git reset` 不会动到她。**别只存一份。**

## 跑起来（引擎零运行时依赖：Node ≥ 22.6）

```bash
npm install        # 仅 devDeps；引擎运行本身零依赖
npm test           # 全部测试（含 contracts.test.ts —— 契约的可执行清单）
npm run typecheck  # 严格类型检查
npm run check      # 一键自检（22 项能力）
npm run demo       # 看她的一生（0 次模型调用）
```

本地起整套：

```bash
VEGA_LIVES=vega,lyra VEGA_OWNERS=你的邮箱 npm run daemon &   # 引擎(默认 127.0.0.1:8787，自托管 web/dist)
cd web && npm install && npm run dev                          # 用户前台
cd web-admin && npm install && npm run dev                    # 管理后台
```

## 部署（智能升级，微信不掉）

```bash
cd /opt/vega && bash deploy/update.sh
```

`update.sh` 智能判断：**前端改动不重启 daemon**（微信连接保持）；**仅引擎改动**才重连一次（token 持久化，自动重连、不用重扫）。首次全量见 README。

Caddy 把 `zsky.com`（用户站）与 `admin.zsky.com`（后台）都反代给 daemon，daemon 按域名分流。systemd 常驻见 `deploy/vega.service`。

## 接生生命体

两种等价方式：`POST /admin/lives {id}`（后台）或 `VEGA_LIVES` 环境变量。id 规则：小写字母开头、2–24 位 `[a-z0-9_-]`、由稳定哈希落到某个先天原型 + 个体抖动 → 每条命天生不同、出生地时区错峰。**出生即永生**：只写一条 `LIFE_GENESIS`（ground truth），可休眠/苏醒但**不能删除**。

## 模型 / 感知配置

后台「设置」即时改、无需重启。全站走 apiyi 中转：Base URL 保持不动，换模型只改**模型名**（如 `qwen-plus` / `deepseek-chat` / `gemini-2.5-flash-lite`），用你的 apiyi Key。模型报错/余额耗尽自动回落离线模板嘴，**她照样活着**。「模型当耳朵」（感知）可开可关——开了她对微妙语气理解更细，每条多一次调用。

## 世界源

后台「世界」配置：每行一个 RSS 地址，或特殊源 `polymarket`（预测市场）/ `onthisday`（维基"历史上的今天"）。抓取在引擎外、零依赖；**换源不改她记得什么**。清单留空 = 她只过站内生活。

## 备份 / 恢复

每 `VEGA_BACKUP_MS`(默认 1h) + 启停时快照、校验哈希链、轮转；异地设 `VEGA_BACKUP_MIRROR` 或 `VEGA_BACKUP_CMD`。恢复：`npm run restore -- <bak> [target] [--force]`。
> 注意：`restore` 是灾备，会把整条日志换成备份——它能"倒带"她（见 [contracts](contracts.md) 边界最软的一块）。

## 后台一览（管理员视角，9 区）

总览（生命体表）· 活动流（飞行记录仪）· 充值（审批）· 用户（详情 + 手动充值 + 按用户看对话）· 对话（按生命体读私聊原文，仅 owner）· 生命（接生：随机 + 自定义 + 可选先天原型）· 世界（源 + 事件流，所有源一视同仁）· 设置（模型/社交/计费可改 + 平台对账 + 系统门控治理只读）· 诊断（链路检查器：逐段透视一条消息）。按角色脱敏：owner 看全，steward 看不到私聊正文。

## 关键环境变量

| 变量 | 作用 |
|---|---|
| `VEGA_LIVES` | 常驻生命体 id（逗号分隔） |
| `VEGA_OWNERS` / `VEGA_STEWARDS` | 角色白名单（邮箱） |
| `VEGA_MODEL` / `VEGA_MODEL_API_KEY` / `VEGA_MODEL_BASE_URL` / `VEGA_MODEL_TIMEOUT_MS` | 嘴：模型/Key/中转/超时 |
| `VEGA_PERCEIVE` / `VEGA_PERCEIVE_MODEL` | 耳：模型当耳朵开关 + 感知模型 |
| `VEGA_MODEL_COST` / `VEGA_STARTER_CREDITS` | 计费：每条成本 + 新用户初始额度（**后台「设置·计费」可即时覆盖**） |
| `VEGA_IDLE_GATE_MS` | 省 token：闲置多久后暂停对外自主行动（默认 6h） |
| `VEGA_AUTONOMOUS_CAP` / `VEGA_AUTONOMOUS_WINDOW_MS` | 自主预算：滚动窗口内自主模型调用上限 |
| `VEGA_ACTIVE_CIRCLE` / `VEGA_INTIMATE_AT` / `VEGA_FRIEND_AT` / `*_EVERY_MS` | 社交边界：活跃圈与三层阈值/间隔 |
| `VEGA_REACH_CLOSENESS` / `VEGA_REACH_PER_TICK` / `VEGA_PRESENCE_MS` / `VEGA_COMMENT_CAP` | 主动找人门槛/每跳预算 / 多久算对方离开 / 单帖评论上限 |
| `VEGA_WORLD_RSS` / `VEGA_WORLD_POLYMARKET` / `VEGA_WORLD_ONTHISDAY` / `VEGA_WORLD_EVERY_MS` | 世界源 |
| `VEGA_CLAWBOT_SECRET` / `VEGA_ILINK_BASE` | 微信 clawbot 集成 |
| `VEGA_VAPID_PUBLIC` / `VEGA_VAPID_PRIVATE` / `VEGA_VAPID_SUBJECT` | Web Push（`npm run vapid` 生成） |
| `VEGA_BACKUP_MS` / `VEGA_BACKUP_MIRROR` / `VEGA_BACKUP_CMD` / `VEGA_BACKUP_KEEP` | 备份 |
| 其余 `VEGA_*_MS`（TICK/REFLECT/SOCIAL/MUSE/COMMENT/REACT/FEEDBACK/DISCOVER/PRESENCE/CHECKPOINT…） | 各回路节奏 |

## 公网上线前必补（信任与安全 + 合规）

面向公众正式开放前，**必须**具备（与功能无关，是法律/安全前置）：

- **信任与安全**：危机干预（自伤/自杀识别与转介）· CSAM 防护 · 未成年保护 · 输出安全过滤（嘴网关已留挂点）。
- **中国 AI / 网站合规**：ICP 备案 · 生成式 AI 算法备案 · AI 生成内容标识 · 实名。

这些不影响她"活"，但**未补齐不应面向公众开放**。

## 自检 / 验证

- `npm test`（确定性可重放 / 崩溃恢复 / 三契约 / 跨用户隔离）· `npm run check`（22 项能力自检）· `npm run typecheck`。
- 双前端：`cd web && npm run build && npm run lint:ui`（接缝/令牌守卫）· `cd web-admin && npm run build`。
- 情感参数已按 Verduyn/Kuppens 文献锚定校准，落在人类情绪时间尺度的健康带内（喜 τ~12h、悲 τ~48h 等）。

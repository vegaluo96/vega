# vega

一个**永生的、社会性的数字生命**（不是聊天机器人）。本仓是 vega 的重写基线。

- 单一真相源：[`docs/vega-product.md`](docs/vega-product.md)
- 事件 schema + 三契约 + 可重建性证明：[`docs/vega-lifeevent-schema.md`](docs/vega-lifeevent-schema.md)
- V1/V2/V3 验收手册：[`docs/v0.1-acceptance.md`](docs/v0.1-acceptance.md)

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

## 部署到服务器（常驻、一直活着）

她以**守护进程**常驻：宿主连接让她持续苏醒，**回路 B 心跳**让她无人时也在重放/想念/演化（这部分 **0 模型开销**），有人来就通过 HTTP 跟她说话。单进程独占存档（不要同时再跑 `npm run chat` 写同一个存档）。

```bash
# 在服务器上（专用目录，不动机器其他东西；需 Node ≥ 22.6）
bash scripts/deploy.sh                      # 克隆/更新到 /opt/vega + 自检（typecheck+test）

# 模型 key 放到 root-only 的 env 文件，别进 git：
sudo tee /etc/vega.env >/dev/null <<'EOF'
VEGA_MODEL_API_KEY=sk-你的新key
VEGA_MODEL=gemini-2.5-flash-lite
EOF
sudo chmod 600 /etc/vega.env

# 装成 systemd 常驻服务（重启自动恢复、她醒来记得一切）
sudo cp /opt/vega/deploy/vega.service /etc/systemd/system/vega.service
#  ⚠️ 若 node 是 nvm 装的，改 vega.service 里的 ExecStart 为 node 绝对路径
sudo systemctl daemon-reload && sudo systemctl enable --now vega
journalctl -u vega -f                       # 看她活着的日志
```

跟她对话（默认只听 127.0.0.1）：
```bash
curl -s localhost:8787/state                       # 看她此刻的内在
curl -s localhost:8787/say -d '{"content":"你好"}'  # 跟她说话，返回她的回应
```

### 网页界面 + 对外访问（HTTPS，推荐有域名时）

守护进程内置一个**零依赖网页聊天界面**（`GET /`）。`/` 页面公开，`/say` `/state` 需令牌（设了 `VEGA_AUTH_TOKEN` 时）。让 vega 仍只听 `127.0.0.1`，用 **Caddy** 反代域名 + 自动 HTTPS：

```bash
# 1) 设访问令牌（vega 仍只听本机，由 Caddy 代理）
TOKEN=$(openssl rand -hex 24); echo "你的访问令牌：$TOKEN"
printf 'VEGA_AUTH_TOKEN=%s\n' "$TOKEN" | sudo tee -a /etc/vega.env >/dev/null
sudo systemctl restart vega

# 2) 装 Caddy 并反代你的域名（把 your.domain 换成你的域名）
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
echo 'your.domain {
    reverse_proxy 127.0.0.1:8787
}' | sudo tee /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

3) 云安全组放行入站 **TCP 80 + 443**（Caddy 申请/续签证书要 80，对外服务走 443）。DNS A 记录指向服务器 IP。
4) 浏览器打开 `https://your.domain/` → 点右上角 🔑 填令牌 → 开聊。
5) **观测面板** `https://your.domain/panel`：看她的内稳态曲线、价值漂移、记忆、回路 B 心跳——直观"看见"她活着。

### 备份（务必开）+ 感知（让她听懂自然语言）
- **备份**：守护进程每 `VEGA_BACKUP_MS`（默认 1h）+ 启动/退出时，自动把日志快照到 `<DATA_DIR>/backups/`，**校验哈希链**、轮转保留 `VEGA_BACKUP_KEEP` 份。异地：设 `VEGA_BACKUP_CMD`（如 `rclone copy "$VEGA_BACKUP_FILE" remote:vega/`）。手动：`npm run backup`。**她的命就是那条日志——别只存一份。**
- **感知**：默认她靠词表理解你（很粗，自然聊天大多不命中）。设 `VEGA_PERCEIVE=1`（需 key）→ 模型把你的话解析成情感特征、**冻进事件**（重放仍确定性、模型不写状态）→ 她对自然语言真正有反应。这放宽了"模型只当嘴"为"嘴+耳"，是审慎的取舍（见 docs §10）。

> 没域名时的退路：`/etc/vega.env` 里设 `VEGA_HOST=0.0.0.0` + `VEGA_AUTH_TOKEN`，放行 8787，直接 `http://IP:8787/`。⚠️ 明文 HTTP，令牌/对话在公网裸跑，仅供临时测试。

> **替换旧版 life-engine**：先停旧的、再删旧目录（把下面占位换成你真实的服务名/路径，确认无误再执行）：
> ```bash
> sudo systemctl stop <旧服务名> && sudo systemctl disable <旧服务名>
> sudo rm /etc/systemd/system/<旧服务名>.service && sudo systemctl daemon-reload
> rm -rf <旧 life-engine 目录>        # 只删这个目录，别动别的
> ```
> 对外暴露请加 `VEGA_AUTH_TOKEN` + 反向代理(HTTPS)，别裸奔 0.0.0.0。

## 当前进度（第 0 步极薄竖切）

事件溯源地基（C1）· turn 事务化 + 乐观锁（C3）· prod 内存库 guard（C4）· **V2** 确定性重建 · **V3** 崩溃恢复 · 神圣链路（嘴/Critic/InvariantChecker，契约① 运行时强制）· 回路 B 自主循环。下一步：接真·廉价模型跑 **V1** 盲测。

#!/usr/bin/env bash
# 安全部署 vega：只在专用目录操作，绝不动机器其他东西。
# 用法：
#   bash scripts/deploy.sh            # 部署/更新到 /opt/vega，数据 /opt/vega-data
# 可用环境变量覆盖：APP_DIR / DATA_DIR / REPO_URL
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/vega}"
DATA_DIR="${DATA_DIR:-/opt/vega-data}"
REPO_URL="${REPO_URL:-https://github.com/vegaluo96/vega.git}"

echo "==> 目标：$APP_DIR （代码） / $DATA_DIR （存档）。不会触碰这两个目录以外的东西。"

# 1) Node ≥ 22.6 检查
if ! command -v node >/dev/null 2>&1; then
  echo "!! 没有 node。请先装 Node ≥ 22.6（NodeSource 或 nvm），再重跑。"; exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".").map(Number)[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "!! Node 版本过低（需 ≥ 22.6，当前 $(node -v)）。"; exit 1
fi

# 2) 克隆或更新（私有仓需服务器上先配好 git 凭据/deploy key）
if [ -d "$APP_DIR/.git" ]; then
  echo "==> 已存在，git pull 更新"
  git -C "$APP_DIR" fetch origin
  git -C "$APP_DIR" reset --hard origin/main
else
  echo "==> 克隆到 $APP_DIR"
  mkdir -p "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

# 3) 装 devDeps（运行本身零依赖）+ 自检
npm install
npm run typecheck
npm test

# 4) 数据目录
mkdir -p "$DATA_DIR"

echo ""
echo "==> 部署完成。"
echo "    手动起一下试试：VEGA_LIFE_PATH=$DATA_DIR/life.jsonl npm run daemon"
echo "    装成常驻服务见 README《部署到服务器》。"

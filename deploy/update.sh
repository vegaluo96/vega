#!/usr/bin/env bash
# ZSKY / vega —— 安全升级脚本（让"拉 GitHub 代码不掉微信"成为铁律）。
#
# 原理：
#   · daemon 把【用户端 web/dist 与后台 web-admin/dist 当静态文件、按请求即时读取】——
#     所以前端改动只需重建 dist，【无需重启 daemon】，微信/所有长连接一秒都不断。
#   · 微信登录态（bot_token/baseurl/游标）持久化在仓库【外】的 sqlite（见 VEGA_LIFE_PATH 同级
#     的 accounts.db），daemon 启动时自动重连所有通道。
#   · 因此：只有【引擎/服务端代码 src/ 变了】才需要重启 daemon（这时微信会自动重连一次，
#     是预期内、唯一一次性的中断）。日常前端/文档更新 = 微信完全不受影响。
#
# 用法：在仓库根执行   bash deploy/update.sh [branch]
#   - branch 缺省 main
#   - 服务名缺省 vega，可用 VEGA_SERVICE 覆盖
set -euo pipefail

cd "$(dirname "$0")/.."            # 仓库根（如 /opt/vega）
SERVICE="${VEGA_SERVICE:-vega}"
# 参数随意顺序：force/--force 永远当【强制重建】标志，绝不当分支名（之前 `update.sh force` 会被误当分支→fetch 失败）。
# 其余位置参数当分支名（缺省 main）。用法：bash deploy/update.sh force  /  ... main force  /  FORCE=1 bash deploy/update.sh
BRANCH=main
FORCE="${FORCE:-0}"
for a in "$@"; do case "$a" in force|--force) FORCE=1 ;; *) BRANCH="$a" ;; esac; done

# 任一命令失败即大声中断（别再把构建失败假装成"跳过"，还误报"升级完成"）。
trap 'echo "" >&2; echo "✗ 部署中断：上一条命令失败 —— dist 可能没更新，切勿当成已上线！修掉问题后重跑 deploy/update.sh。" >&2' ERR

# 仓库属主与当前用户不一致时 git 会拒绝（dubious ownership）——把本目录加进 safe.directory（幂等）。
git config --global --get-all safe.directory 2>/dev/null | grep -qxF "$PWD" || git config --global --add safe.directory "$PWD"

echo "▶ 拉取 origin/$BRANCH …"
for i in 1 2 3 4; do git fetch origin "$BRANCH" && break || { echo "  fetch 失败，重试 $i…"; sleep $((2 ** i)); }; done

OLD="$(git rev-parse HEAD)"
NEW="$(git rev-parse "origin/$BRANCH")"
if [ "$OLD" = "$NEW" ] && [ "$FORCE" != "1" ]; then echo "✓ 已是最新（${OLD:0:8}），无改动。微信保持不动。（如手动 pull 过想重建：加 force）"; exit 0; fi

git reset --hard "$NEW"
if [ "$OLD" = "$NEW" ] || [ "$FORCE" = "1" ]; then
  # 已是最新但被 force（多半是手动 pull 过）：git 看不到 diff → 当作"全量"，重建两个前端 + 重启 daemon。
  echo "▶ force：强制重建前端 + 重启（git 无 diff，按全量处理）"
  CHANGED=$'web/\nweb-admin/\nsrc/'
else
  CHANGED="$(git diff --name-only "$OLD" "$NEW")"
  echo "变更文件（${OLD:0:8} → ${NEW:0:8}）："; echo "$CHANGED" | sed 's/^/   /'
fi

# —— 前端：静态产物、即时生效、不重启、不碰微信 ——
build_spa() {  # $1=目录
  local dir="$1"
  echo "▶ 重建 $dir …"
  ( cd "$dir"
    if [ ! -d node_modules ] || echo "$CHANGED" | grep -q "^$dir/package"; then npm ci || npm install; fi
    # 先清旧产物再构建：避免 vite emptyDir 撞上【非本用户构建过的 dist】（root 拥有 → EACCES）。
    # 删不掉就明确报出修复办法，而不是让 vite 抛一长串 rimraf/EACCES 栈。
    if ! rm -rf dist 2>/dev/null; then
      echo "✗ 删不掉旧 $dir/dist（多半早先用 root 构建过、属主不一致）。一次性修复后再重跑：" >&2
      echo "    sudo chown -R \"\$(whoami)\" \"$PWD\"   # 或：sudo rm -rf \"$PWD/dist\"" >&2
      echo "    然后： bash deploy/update.sh force" >&2
      exit 1
    fi
    npm run build )
}
if echo "$CHANGED" | grep -q '^web/';       then build_spa web;      else echo "· 用户端 web 无改动，跳过"; fi
if echo "$CHANGED" | grep -q '^web-admin/'; then build_spa web-admin; else echo "· 后台 web-admin 无改动，跳过"; fi

# —— 仅当【引擎/服务端】代码变化才重启 daemon（此时微信自动重连一次，属预期内） ——
if echo "$CHANGED" | grep -qE '^(src/|package\.json|package-lock\.json|tsconfig\.json|deploy/vega\.service)'; then
  echo "▶ 引擎/服务端有改动 → 重启 $SERVICE（微信会自动重连一次）…"
  sudo systemctl restart "$SERVICE"
  sleep 2
  if systemctl is-active --quiet "$SERVICE"; then echo "✓ $SERVICE 在线，微信通道自动重连中（看 journalctl -u $SERVICE 里的 [wechat] 重连日志）。"
  else echo "✗ $SERVICE 没起来！立刻看： journalctl -u $SERVICE -n 50 --no-pager"; exit 1; fi
else
  echo "✓ 仅前端/文档改动 → 不重启 daemon。微信、所有长连接全程不断。"
fi
echo "✓ 升级完成：${OLD:0:8} → ${NEW:0:8}"

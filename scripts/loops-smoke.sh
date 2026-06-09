#!/usr/bin/env bash
# 回路活性冒烟：用极短间隔启动 daemon → 注册+说一句（制造"有听众"）→ 等几秒让自主回路跑几圈
# → 断言 daemon 仍在线、事件数增长、心跳/反思/寒暄时间戳非零。重构 loops 前后各跑一次、结论应一致。
# 不比对逐字节输出（回路含随机/时钟），只断言"回路在跑、进程没崩"。用法：bash scripts/loops-smoke.sh
set -u
PORT=8798
DIR=$(mktemp -d /tmp/vega-loops.XXXXXX)
export VEGA_LIFE_PATH="$DIR/life.jsonl" VEGA_PORT=$PORT VEGA_HOST=127.0.0.1 \
       VEGA_LIVES=vega,lyra VEGA_OWNERS=loop@x.com VEGA_WORLD_RSS= VEGA_WORLD_ONTHISDAY=0 \
       VEGA_TICK_MS=200 VEGA_MUSE_EVERY_MS=400 VEGA_SOCIAL_EVERY_MS=250 VEGA_REACT_EVERY_MS=250 \
       VEGA_COMMENT_EVERY_MS=250 VEGA_DISCOVER_EVERY_MS=250 VEGA_FEEDBACK_EVERY_MS=250 \
       VEGA_REFLECT_EVERY_MS=200 VEGA_PRESENCE_MS=600000 VEGA_AUTONOMOUS_CAP=100000
node --experimental-strip-types src/server/daemon.ts >"$DIR/log" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; rm -rf "$DIR"' EXIT
B="http://127.0.0.1:$PORT"
for i in $(seq 1 40); do curl -fsS "$B/health" >/dev/null 2>&1 && break; sleep 0.25; done
TOK=$(curl -fsS -XPOST "$B/api/auth/register" -H 'content-type: application/json' -d '{"email":"loop@x.com","password":"password1","handle":"loop"}' | tr -d '\n ' | grep -oE '"token":"[0-9a-f]+"' | grep -oE '[0-9a-f]{16,}')
H="authorization: Bearer $TOK"
# 注意：daemon 输出是 pretty-print JSON（冒号后带空格），grep 要容忍 `": `。
EV0=$(curl -fsS "$B/admin/health" -H "$H" | grep -oE '"events": *[0-9]+' | grep -oE '[0-9]+')
curl -fsS -XPOST "$B/api/lives/vega/say" -H "$H" -H 'content-type: application/json' -d '{"content":"你好呀"}' >/dev/null
sleep 4   # 让回路跑十几圈（tick/muse/social/react/comment/feedback/reflect）
ALIVE=$(curl -fsS "$B/health" | grep -c '"ok": *true')
EV1=$(curl -fsS "$B/admin/health" -H "$H" | grep -oE '"events": *[0-9]+' | grep -oE '[0-9]+')
OV=$(curl -fsS "$B/admin/overview" -H "$H")
# tick/reflect/social 时间戳是否被回路推进过（非 0 即"跑过"）
TICK=$(echo "$OV" | grep -oE '"tick": *[0-9]+' | grep -vE '"tick": *0' | head -1)
SOCIETY=$(curl -fsS "$B/api/society" -H "$H" | head -c 4)
echo "alive=$ALIVE events:$EV0->$EV1 tickRan=${TICK:-none} society4=${SOCIETY}"
FAIL=0
[ "$ALIVE" = "1" ] || { echo "✗ daemon 不在线（多半回路抛错崩了）"; tail -20 "$DIR/log"; FAIL=1; }
[ "${EV1:-0}" -gt "${EV0:-0}" ] 2>/dev/null || { echo "✗ 事件数没增长（回路没在写事件）"; FAIL=1; }
[ -n "${TICK:-}" ] || { echo "✗ 心跳 tick 时间戳仍为 0（heartbeat 没跑）"; FAIL=1; }
[ $FAIL -eq 0 ] && echo "✓ 回路活性 OK：进程稳、事件增长、心跳在跑" || { echo "—— 日志尾 ——"; tail -30 "$DIR/log"; }
exit $FAIL

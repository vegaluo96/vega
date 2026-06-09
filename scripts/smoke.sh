#!/usr/bin/env bash
# 守护进程冒烟测试：启动 daemon → 注册 owner → 打一圈代表性端点 → 归一化输出（去掉易变字段）。
# 重构前后各跑一次、diff 应一致（行为不变）。用法：bash scripts/smoke.sh > /tmp/smoke.out
set -u
PORT=8799
DIR=$(mktemp -d /tmp/vega-smoke.XXXXXX)
export VEGA_LIFE_PATH="$DIR/life.jsonl" VEGA_PORT=$PORT VEGA_HOST=127.0.0.1 \
       VEGA_LIVES=vega,lyra VEGA_OWNERS=smoke@x.com VEGA_WORLD_RSS= VEGA_WORLD_ONTHISDAY=0
node --experimental-strip-types src/server/daemon.ts >"$DIR/log" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; rm -rf "$DIR"' EXIT
# 等起来
for i in $(seq 1 40); do curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break; sleep 0.25; done

B="http://127.0.0.1:$PORT"
# 归一化：抹掉时间戳/令牌/事件数等易变字段，只看结构与稳定字段。
norm() { sed -E 's/"(at|occurredAt|recordedAt|lastActiveAt|createdAt|decidedAt|bornAt|clockAt|requestedAt)":"[^"]*"/"\1":"T"/g; s/"(token|bindToken|qr)":"[^"]*"/"\1":"X"/g; s/"(events|version|total|uptoSeq|seq|idleMinutes)":[0-9]+/"\1":0/g; s/[0-9]{2}:[0-9]{2}:[0-9]{2}/T/g'; }

echo "### health";        curl -fsS "$B/health" | norm
TOK=$(curl -fsS -XPOST "$B/api/auth/register" -H 'content-type: application/json' -d '{"email":"smoke@x.com","password":"password1","handle":"smoke"}' | tr -d '\n ' | grep -oE '"token":"[0-9a-f]+"' | grep -oE '[0-9a-f]{16,}')
echo "### me";            curl -fsS "$B/api/me" -H "authorization: Bearer $TOK" | norm
echo "### lives";         curl -fsS "$B/api/lives" -H "authorization: Bearer $TOK" | norm
echo "### life-vega";     curl -fsS "$B/api/lives/vega" -H "authorization: Bearer $TOK" | norm
echo "### lifeMe-vega";   curl -fsS "$B/api/lives/vega/me" -H "authorization: Bearer $TOK" | norm
echo "### feed";          curl -fsS "$B/api/feed" -H "authorization: Bearer $TOK" | norm
echo "### society";       curl -fsS "$B/api/society" -H "authorization: Bearer $TOK" | norm
echo "### chats";         curl -fsS "$B/api/chats" -H "authorization: Bearer $TOK" | norm
echo "### notifications"; curl -fsS "$B/api/notifications" -H "authorization: Bearer $TOK" | norm
echo "### say-vega";      curl -fsS -XPOST "$B/api/lives/vega/say" -H "authorization: Bearer $TOK" -H 'content-type: application/json' -d '{"content":"你好"}' | norm
echo "### admin/overview";  curl -fsS "$B/admin/overview" -H "authorization: Bearer $TOK" | norm
echo "### admin/health";    curl -fsS "$B/admin/health" -H "authorization: Bearer $TOK" | norm
echo "### admin/users";     curl -fsS "$B/admin/users" -H "authorization: Bearer $TOK" | norm
echo "### admin/archetypes"; curl -fsS "$B/admin/archetypes" -H "authorization: Bearer $TOK" | norm
echo "### admin/billing";   curl -fsS "$B/admin/billing-config" -H "authorization: Bearer $TOK" | norm
echo "### admin/life-vega";  curl -fsS "$B/admin/lives/vega" -H "authorization: Bearer $TOK" | norm
echo "### admin/world";     curl -fsS "$B/admin/world-config" -H "authorization: Bearer $TOK" | norm
echo "### admin/model";     curl -fsS "$B/admin/model-config" -H "authorization: Bearer $TOK" | norm
echo "### admin/social";    curl -fsS "$B/admin/social-config" -H "authorization: Bearer $TOK" | norm
echo "### 404";            curl -fsS -o /dev/null -w '%{http_code}' "$B/nope/nope" -H "authorization: Bearer $TOK"; echo
echo "### DONE"

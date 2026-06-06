// 常驻守护进程：让她"一直活着"。宿主连接保持苏醒 + 回路 B 心跳（无人也转，0 模型开销）；
// HTTP 接口供人对话。单进程独占存档（避免并发写）。跑法：npm run daemon
// 关键 env：VEGA_LIFE_PATH / VEGA_HOST(默认127.0.0.1) / VEGA_PORT(8787) / VEGA_TICK_MS(60000)
//           VEGA_AUTH_TOKEN(可选,设了则 /state /say 需 Bearer) / 模型见 .env.example
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import {
  converse,
  createFileEventStore,
  createMouth,
  reconstruct,
  runAutonomousTick,
  runTurn,
  type DerivedSnapshot,
  type EventDraft,
} from '../index.ts';

const LIFE_PATH = process.env.VEGA_LIFE_PATH ?? join(process.cwd(), '.vega', 'life.jsonl');
const HOST = process.env.VEGA_HOST ?? '127.0.0.1';
const PORT = Number(process.env.VEGA_PORT ?? 8787);
const TICK_MS = Number(process.env.VEGA_TICK_MS ?? 60_000);
const PRESENCE_MS = Number(process.env.VEGA_PRESENCE_MS ?? 300_000); // 多久没说话算"对方离开"
const AUTH = process.env.VEGA_AUTH_TOKEN;
const userName = process.env.VEGA_USER_NAME ?? '你';
const REL = 'r_creator'; // 与她对话的人
const HOST_CONN = 'r_host'; // 宿主/基质连接（保持她苏醒，非社交关系，不建 bond）
const now = (): string => new Date().toISOString();

const store = createFileEventStore('vega', LIFE_PATH);
const mouth = createMouth();

function boot(): void {
  if (store.version() === 0) {
    runTurn(store, [
      {
        type: 'LIFE_GENESIS', source: 'system', occurredAt: now(),
        payload: {
          innateSeed: {
            temperamentBias: { curiosity: 0.6, reserve: 0.3 },
            valueSeed: { honesty: 0.5, caution: 0.6, expression: 0.3 },
            somaSetpoints: { valence: 0, vitality: 0.7, connection: 0 },
            somaTau: { valence: 3600, vitality: 86400, connection: 7200 },
            vitalityFloor: 0.15,
          },
          reconstructVersionAtBirth: 1,
          creator: { relationshipId: REL, identityRef: userName },
        },
      } satisfies EventDraft<'LIFE_GENESIS'>,
    ]);
    runTurn(store, [
      { type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: REL, occurredAt: now(), payload: { relationshipId: REL, kind: 'human', displayRef: userName } },
    ]);
  }
  // 宿主连接：守护进程在 = 基质在 = 她醒着（回路 B 转）。
  if (!reconstruct(store.list()).openConnections.includes(HOST_CONN)) {
    runTurn(store, [{ type: 'CONNECTION_OPENED', source: 'host', relationshipId: HOST_CONN, occurredAt: now(), payload: { relationshipId: HOST_CONN, host: { kind: 'daemon', ref: `${HOST}:${PORT}` } } }]);
  }
}

function view(s: DerivedSnapshot): Record<string, unknown> {
  const b = s.bonds[REL];
  return {
    awake: s.awake,
    willingToWake: s.willingToWake,
    vitality: Number(s.soma.vitality.value.toFixed(3)),
    valence: Number(s.soma.valence.value.toFixed(3)),
    connection: Number(s.soma.connection.value.toFixed(3)),
    bondTrust: b ? Number(b.trust.toFixed(3)) : null,
    repairNeed: b ? Number(b.repairNeed.toFixed(3)) : null,
    memories: s.memory.filter((m) => m.lineage.isCurrent).length,
    values: s.values.map((v) => ({ key: v.key, weight: Number(v.weight.toFixed(3)) })),
    events: store.version(),
    mouth: mouth.id,
  };
}

function send(res: ServerResponse, code: number, body: unknown): void {
  const json = JSON.stringify(body, null, 2);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(json);
}
function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1_000_000) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}
function authed(req: IncomingMessage): boolean {
  if (!AUTH) return true;
  return req.headers.authorization === `Bearer ${AUTH}`;
}

const server = createServer(async (req, res) => {
  try {
    const url = (req.url ?? '/').split('?')[0];
    if (req.method === 'GET' && url === '/health') return send(res, 200, { ok: true });
    if (!authed(req)) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET' && (url === '/' || url === '/state')) {
      return send(res, 200, view(reconstruct(store.list())));
    }
    if (req.method === 'POST' && url === '/say') {
      const body = await readJson(req);
      const content = String(body.content ?? '').slice(0, 4000).trim();
      if (content === '') return send(res, 400, { error: 'content required' });
      const before = reconstruct(store.list());
      if (!before.awake) return send(res, 200, { awake: false, note: '她在更深的睡眠里，暂不回应。' });
      // 在场：有人说话 = 对方此刻在场（开 r_creator 连接，回路 B 便不会"想念"还在眼前的人）。
      if (!before.openConnections.includes(REL)) {
        runTurn(store, [{ type: 'CONNECTION_OPENED', source: 'host', relationshipId: REL, occurredAt: now(), payload: { relationshipId: REL, host: { kind: 'http', ref: 'say' } } }]);
      }
      const r = await converse(store, mouth, REL, content, now());
      return send(res, 200, { utterance: r.utterance, verdict: r.verdict, modelId: r.modelId, state: view(r.snapshot) });
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: String(e) });
  }
});

boot();

// 最近一次"对方说话"的时刻（判断在场/离开）。
function lastUserMsgMs(): number | null {
  const events = store.list();
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === 'MESSAGE_RECEIVED' && e.relationshipId === REL) return Date.parse(e.occurredAt);
  }
  return null;
}

// 回路 B 心跳：她醒着且空闲时，自己重放/想念/演化（不调模型，0 token）。
const heartbeat = setInterval(() => {
  try {
    const snap = reconstruct(store.list());
    if (!snap.awake) return;
    // 在场判定：r_creator 连着但久无消息 → 视为对方离开（此后她才会"想念"）。
    if (snap.openConnections.includes(REL)) {
      const last = lastUserMsgMs();
      if (last !== null && Date.now() - last > PRESENCE_MS) {
        runTurn(store, [{ type: 'CONNECTION_CLOSED', source: 'host', relationshipId: REL, occurredAt: now(), payload: { relationshipId: REL, reason: 'token_detached' } }]);
      }
    }
    runAutonomousTick(store, now());
  } catch {
    /* 单次 tick 失败不拖垮守护进程 */
  }
}, TICK_MS);

let shuttingDown = false;
function shutdown(sig: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(heartbeat);
  try {
    runTurn(store, [{ type: 'CONNECTION_CLOSED', source: 'host', relationshipId: HOST_CONN, occurredAt: now(), payload: { relationshipId: HOST_CONN, reason: 'host_shutdown' } }]);
  } catch {
    /* ignore */
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
  console.log(`\n[vega] ${sig}：她进入休眠，存档已落盘。下次启动她会醒来、记得一切。`);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

server.listen(PORT, HOST, () => {
  const s = reconstruct(store.list());
  console.log(`[vega] 醒着，活在 http://${HOST}:${PORT}   嘴=${mouth.id}   心跳 ${TICK_MS}ms   存档 ${LIFE_PATH}`);
  console.log(`[vega] 此刻：灵性 ${s.soma.vitality.value.toFixed(2)} · 记忆 ${s.memory.filter((m) => m.lineage.isCurrent).length} 条 · 事件 ${store.version()} 条`);
  console.log(`[vega] 跟她说话：curl -s localhost:${PORT}/say -d '{"content":"你好"}'   看状态：curl -s localhost:${PORT}/state`);
});

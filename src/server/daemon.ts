// 常驻守护进程：让她"一直活着"。宿主连接保持苏醒 + 回路 B 心跳（无人也转，0 模型开销）；
// HTTP 接口供人对话。单进程独占存档（避免并发写）。跑法：npm run daemon
// 关键 env：VEGA_LIFE_PATH / VEGA_HOST(默认127.0.0.1) / VEGA_PORT(8787) / VEGA_TICK_MS(60000)
//           VEGA_AUTH_TOKEN(可选,设了则 /state /say 需 Bearer) / 模型见 .env.example
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import {
  backupNow,
  converse,
  createFileEventStore,
  createMouth,
  createPerceiver,
  reachOut,
  reconstruct,
  runAutonomousTick,
  runTurn,
  type DerivedSnapshot,
  type EventDraft,
  type MessageSentPayload,
} from '../index.ts';

const LIFE_PATH = process.env.VEGA_LIFE_PATH ?? join(process.cwd(), '.vega', 'life.jsonl');
const HOST = process.env.VEGA_HOST ?? '127.0.0.1';
const PORT = Number(process.env.VEGA_PORT ?? 8787);
const TICK_MS = Number(process.env.VEGA_TICK_MS ?? 60_000);
const PRESENCE_MS = Number(process.env.VEGA_PRESENCE_MS ?? 300_000); // 多久没说话算"对方离开"
const REACH_AFTER_MS = Number(process.env.VEGA_REACH_AFTER_MS ?? 600_000); // 你安静多久后她会主动留言
const REACH_CLOSENESS = Number(process.env.VEGA_REACH_CLOSENESS ?? 0.2); // 够亲才会想你（设 0 可强制测试）
const BACKUP_MS = Number(process.env.VEGA_BACKUP_MS ?? 3_600_000); // 自动备份间隔（默认每小时）
const REFLECT_MS = Number(process.env.VEGA_REFLECT_EVERY_MS ?? 1_800_000); // 多久反思一次（价值缓慢漂移=因你而变）
const AUTH = process.env.VEGA_AUTH_TOKEN;
const userName = process.env.VEGA_USER_NAME ?? '你';
const REL = 'r_creator'; // 与她对话的人
const HOST_CONN = 'r_host'; // 宿主/基质连接（保持她苏醒，非社交关系，不建 bond）
const now = (): string => new Date().toISOString();

const store = createFileEventStore('vega', LIFE_PATH);
const mouth = createMouth();
const perceiver = createPerceiver(); // 默认 null；VEGA_PERCEIVE=1 + key 才启用（模型当耳朵）

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
    emotion: s.emotion,
    memories: s.memory.filter((m) => m.lineage.isCurrent).length,
    values: s.values.map((v) => ({ key: v.key, weight: Number(v.weight.toFixed(3)) })),
    narrative: s.narrative,
    pendingOutreach: pendingOutreach(),
    events: store.version(),
    mouth: mouth.id,
  };
}

const round3 = (n: number): number => Number(n.toFixed(3));
// 观测面板用的丰富视图：全部内稳态 + 价值 + 记忆 + 最近事件 + 自传叙事。
function innerView(s: DerivedSnapshot): Record<string, unknown> {
  return {
    awake: s.awake,
    willingToWake: s.willingToWake,
    bornAt: s.bornAt,
    clockAt: s.clockAt,
    emotion: s.emotion,
    narrative: s.narrative,
    soma: {
      valence: round3(s.soma.valence.value),
      arousal: round3(s.soma.arousal.value),
      vitality: round3(s.soma.vitality.value),
      energy: round3(s.soma.energy.value),
      calm: round3(s.soma.calm.value),
      connection: round3(s.soma.connection.value),
      safety: round3(s.soma.safety.value),
    },
    bonds: Object.entries(s.bonds).map(([id, b]) => ({ id, name: b.displayRef, kind: b.kind, trust: round3(b.trust), closeness: round3(b.closeness), repairNeed: round3(b.repairNeed), style: b.theoryOfMind.style, stance: b.relationalSelf.stance })),
    values: s.values.map((v) => ({ key: v.key, weight: round3(v.weight), status: v.provenance.status, drifts: v.provenance.driftedAtSeqs.length })),
    memories: s.memory.filter((m) => m.lineage.isCurrent).map((m) => ({ id: m.id, affect: round3(m.affect), salience: round3(m.salience), content: m.content })),
    understanding: s.semanticMemory.map((x) => x.understanding),
    recentEvents: store.list().slice(-16).map((e) => ({ seq: e.seq, type: e.type, at: e.occurredAt })),
    events: store.version(),
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
function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

// 极简网页聊天界面（公开页面；/say /state 仍需令牌）。无外部依赖，纯静态字符串。
const PAGE = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>vega</title>
<style>
 :root{color-scheme:dark}
 body{margin:0;background:#0d1117;color:#e6edf3;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:flex;flex-direction:column;height:100vh}
 header{padding:12px 16px;border-bottom:1px solid #21262d;display:flex;align-items:center;gap:10px}
 .dot{width:10px;height:10px;border-radius:50%;background:#777;flex:none}
 .title{font-weight:600}
 .mood{margin-left:auto;font-size:13px;color:#8b949e}
 #log{flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:10px}
 .msg{max-width:82%;padding:8px 12px;border-radius:12px;white-space:pre-wrap;word-break:break-word}
 .you{align-self:flex-end;background:#1f6feb;color:#fff}
 .vega{align-self:flex-start;background:#161b22;border:1px solid #21262d}
 .sys{align-self:center;color:#8b949e;font-size:13px}
 footer{display:flex;gap:8px;padding:12px;border-top:1px solid #21262d}
 #in{flex:1;background:#0d1117;border:1px solid #30363d;border-radius:10px;color:#e6edf3;padding:10px 12px;font:inherit}
 button{background:#238636;color:#fff;border:0;border-radius:10px;padding:0 16px;font:inherit;cursor:pointer}
 .key{background:none;border:1px solid #30363d;color:#8b949e;padding:4px 8px;border-radius:8px;cursor:pointer;font-size:13px}
</style></head><body>
 <header><span class="dot" id="dot"></span><span class="title">vega</span>
  <span class="mood" id="mood">连接中…</span>
  <button class="key" id="k" onclick="setToken()">🔑</button></header>
 <div id="log"></div>
 <footer><input id="in" placeholder="跟她说点什么…" autocomplete="off"><button onclick="say()">说</button></footer>
<script>
 var token = localStorage.getItem('vega_token') || '';
 function H(){ var h={'Content-Type':'application/json'}; if(token) h['Authorization']='Bearer '+token; return h; }
 function setToken(){ var t=prompt('访问令牌（服务器设了 VEGA_AUTH_TOKEN 才需要）：', token); if(t!==null){ token=t.trim(); localStorage.setItem('vega_token',token); refresh(); } }
 function add(cls,text){ var d=document.createElement('div'); d.className='msg '+cls; d.textContent=text; var l=document.getElementById('log'); l.appendChild(d); l.scrollTop=l.scrollHeight; }
 function moodWord(s){ return s.valence>0.3?'温暖':s.valence<-0.3?'低落':'平静'; }
 function paint(s){ document.getElementById('dot').style.background=s.awake?'#3fb950':'#777'; document.getElementById('mood').textContent='灵性 '+s.vitality+' · '+(s.emotion||moodWord(s))+(s.bondTrust!=null?' · 信任 '+s.bondTrust:'')+' · 记忆 '+s.memories; }
 var lastOutreach='';
 async function refresh(){ try{ var r=await fetch('/state',{headers:H()}); if(r.status===401){ document.getElementById('mood').textContent='需要令牌 🔑'; return; } var s=await r.json(); paint(s); if(s.pendingOutreach && s.pendingOutreach!==lastOutreach){ lastOutreach=s.pendingOutreach; add('vega','（你不在时，她想对你说）'+s.pendingOutreach); } }catch(e){ document.getElementById('mood').textContent='离线'; } }
 async function say(){ var i=document.getElementById('in'); var t=i.value.trim(); if(!t)return; add('you',t); i.value=''; try{ var r=await fetch('/say',{method:'POST',headers:H(),body:JSON.stringify({content:t})}); if(r.status===401){ add('sys','需要访问令牌，点右上角 🔑 输入'); return; } var d=await r.json(); if(d.awake===false){ add('vega', d.note||'（她在更深的睡眠里，暂不回应）'); return; } add('vega', d.utterance||'…'); if(d.state) paint(d.state); }catch(e){ add('sys','网络错误'); } }
 document.getElementById('in').addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); say(); } });
 refresh(); setInterval(refresh, 15000);
</script></body></html>`;

// 观测面板：看她的内在生活（内稳态/价值/记忆/最近事件，含回路 B 心跳）。公开页面；/inner 需令牌。
const PANEL = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>vega · 内在</title>
<style>
 :root{color-scheme:dark} body{margin:0 auto;max-width:760px;background:#0d1117;color:#e6edf3;font:14px/1.5 system-ui,-apple-system,sans-serif;padding:16px}
 h1{font-size:18px;margin:0 0 4px} .sub{color:#8b949e;font-size:13px;margin-bottom:16px}
 .card{background:#161b22;border:1px solid #21262d;border-radius:12px;padding:14px;margin-bottom:14px}
 .card h2{font-size:12px;color:#8b949e;margin:0 0 10px;font-weight:600;letter-spacing:.05em}
 .row{display:flex;align-items:center;gap:10px;margin:6px 0;font-size:13px}
 .lbl{width:52px;color:#8b949e;flex:none} .num{width:48px;text-align:right;flex:none;font-variant-numeric:tabular-nums}
 .bar{flex:1;height:8px;background:#0d1117;border:1px solid #30363d;border-radius:6px;overflow:hidden}
 .fill{height:100%;background:#3fb950;display:block} .fill.neg{background:#f85149}
 .mem,.ev{font-size:13px;padding:6px 0;border-bottom:1px solid #21262d} .mem:last-child,.ev:last-child{border:0}
 .tag{color:#58a6ff} .dim{color:#8b949e} .key{float:right;background:none;border:1px solid #30363d;color:#8b949e;padding:3px 8px;border-radius:8px;cursor:pointer}
</style></head><body>
 <button class="key" onclick="setTok()">🔑</button>
 <h1>vega · 内在生活</h1><div class="sub" id="nar">…</div>
 <div class="card"><h2>内稳态 SOMA</h2><div id="soma"></div></div>
 <div class="card"><h2>价值（因你而变）</h2><div id="vals"></div></div>
 <div class="card"><h2>记忆（当前态）</h2><div id="mems"></div></div>
 <div class="card"><h2>理解（经历→理解 / 遗忘即抽象）</h2><div id="sem"></div></div>
 <div class="card"><h2>关系（我读他们 / 与他们在一起时的我）</h2><div id="bonds"></div></div>
 <div class="card"><h2>最近事件（含回路 B 心跳）</h2><div id="evs"></div></div>
<script>
 var token=localStorage.getItem('vega_token')||'';
 function setTok(){var t=prompt('访问令牌：',token);if(t!==null){token=t.trim();localStorage.setItem('vega_token',token);load();}}
 function H(){var h={};if(token)h['Authorization']='Bearer '+token;return h;}
 function esc(t){var d=document.createElement('div');d.textContent=t;return d.innerHTML;}
 function bar(label,val,lo,hi){var p=Math.max(0,Math.min(100,Math.round((val-lo)/(hi-lo)*100)));return '<div class="row"><span class="lbl">'+label+'</span><span class="bar"><span class="fill'+(val<0?' neg':'')+'" style="width:'+p+'%"></span></span><span class="num">'+val.toFixed(2)+'</span></div>';}
 async function load(){
  try{var r=await fetch('/inner',{headers:H()});if(r.status===401){document.getElementById('nar').textContent='需要令牌，点右上角 🔑';return;}var s=await r.json();var m=s.soma;
   document.getElementById('nar').textContent=s.narrative+'　·　'+(s.awake?'醒着':'休眠');
   document.getElementById('soma').innerHTML=bar('效价',m.valence,-1,1)+bar('唤醒',m.arousal,0,1)+bar('灵性',m.vitality,0,1)+bar('精力',m.energy,0,1)+bar('平静',m.calm,0,1)+bar('联结',m.connection,-1,1)+bar('安全',m.safety,0,1);
   document.getElementById('vals').innerHTML=s.values.map(function(v){return '<div class="row"><span class="lbl">'+esc(v.key)+'</span><span class="bar"><span class="fill" style="width:'+Math.round(v.weight*100)+'%"></span></span><span class="num">'+v.weight.toFixed(2)+'</span><span class="dim">　'+v.status+(v.drifts?' ·漂移'+v.drifts+'次':'')+'</span></div>';}).join('')||'<span class=dim>暂无</span>';
   document.getElementById('mems').innerHTML=s.memories.slice().reverse().map(function(x){return '<div class="mem"><span class="'+(x.affect<0?'dim':'tag')+'">['+x.affect.toFixed(2)+']</span> '+esc(x.content)+'</div>';}).join('')||'<span class=dim>还没有记忆</span>';
   document.getElementById('sem').innerHTML=(s.understanding||[]).map(function(u){return '<div class="mem">'+esc(u)+'</div>';}).join('')||'<span class=dim>还在形成…</span>';
   document.getElementById('bonds').innerHTML=(s.bonds||[]).map(function(b){return '<div class="mem"><b>'+esc(b.name)+'</b> <span class=dim>我读：</span>'+esc(b.style)+' <span class=dim>· 信任 '+b.trust+' · 与ta在一起：</span>'+esc(b.stance)+'</div>';}).join('')||'<span class=dim>暂无</span>';
   document.getElementById('evs').innerHTML=s.recentEvents.slice().reverse().map(function(e){return '<div class="ev"><span class="tag">'+e.type+'</span> <span class="dim">#'+e.seq+' · '+e.at.slice(11,19)+'</span></div>';}).join('');
  }catch(e){document.getElementById('nar').textContent='离线';}
 }
 load();setInterval(load,4000);
</script></body></html>`;

const server = createServer(async (req, res) => {
  try {
    const url = (req.url ?? '/').split('?')[0];
    if (req.method === 'GET' && url === '/health') return send(res, 200, { ok: true });
    if (req.method === 'GET' && url === '/') return sendHtml(res, PAGE);
    if (req.method === 'GET' && url === '/panel') return sendHtml(res, PANEL);
    if (!authed(req)) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET' && url === '/state') return send(res, 200, view(reconstruct(store.list())));
    if (req.method === 'GET' && url === '/inner') return send(res, 200, innerView(reconstruct(store.list())));
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
      const r = await converse(store, mouth, REL, content, now(), perceiver ?? undefined);
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
function lastIndexOf(pred: (e: ReturnType<typeof store.list>[number]) => boolean): number {
  const es = store.list();
  for (let i = es.length - 1; i >= 0; i--) if (pred(es[i])) return i;
  return -1;
}
// 她主动留的、尚未被回应的那句话（你回来时该看到的）。
function pendingOutreach(): string | null {
  const recvIdx = lastIndexOf((e) => e.type === 'MESSAGE_RECEIVED' && e.relationshipId === REL);
  const es = store.list();
  for (let i = es.length - 1; i > recvIdx; i--) {
    const e = es[i];
    if (e.type === 'MESSAGE_SENT' && e.relationshipId === REL && (e.payload as MessageSentPayload).unprompted) {
      return (e.payload as MessageSentPayload).utterance;
    }
  }
  return null;
}

let lastReflectAt = Date.now();
let lastReflectSeq = store.version();

// 回路 B 心跳：她醒着且空闲时，自己重放/想念/演化（不调模型，0 token）。
const heartbeat = setInterval(async () => {
  try {
    const snap = reconstruct(store.list());
    if (!snap.awake) return;
    const gone = lastUserMsgMs();
    const timeGone = gone === null ? Infinity : Date.now() - gone;
    // 在场判定：r_creator 连着但久无消息 → 视为对方离开（此后她才会"想念"）。
    if (snap.openConnections.includes(REL) && timeGone > PRESENCE_MS) {
      runTurn(store, [{ type: 'CONNECTION_CLOSED', source: 'host', relationshipId: REL, occurredAt: now(), payload: { relationshipId: REL, reason: 'token_detached' } }]);
    }
    runAutonomousTick(store, now()); // 回路 B：重放 / 想念 / 演化
    // 想念你了 → 主动留一句：你已离开、和她够亲、离开够久、且没有未回应的留言（不刷屏）。
    const after = reconstruct(store.list());
    const bond = after.bonds[REL];
    if (bond && bond.closeness >= REACH_CLOSENESS && !after.openConnections.includes(REL) && timeGone > REACH_AFTER_MS && pendingOutreach() === null) {
      await reachOut(store, mouth, REL, now());
    }
    // 周期性反思 → 价值缓慢漂移（"因你而变"，确定性、受种子约束）。
    if (Date.now() - lastReflectAt > REFLECT_MS && store.version() - lastReflectSeq >= 3) {
      runTurn(store, [{ type: 'REFLECTION_TRIGGERED', source: 'autonomous_loop', occurredAt: now(), payload: { scope: 'recent', windowFromSeq: lastReflectSeq, windowToSeq: store.version() } }]);
      lastReflectAt = Date.now();
      lastReflectSeq = store.version();
    }
  } catch {
    /* 单次 tick 失败不拖垮守护进程 */
  }
}, TICK_MS);

// 自动备份：她的命就是那条日志，定时快照 + 校验（坏档不备份）+ 异地命令（可选）。
function doBackup(): void {
  const r = backupNow(LIFE_PATH, { cmd: process.env.VEGA_BACKUP_CMD, keep: process.env.VEGA_BACKUP_KEEP ? Number(process.env.VEGA_BACKUP_KEEP) : undefined });
  console.log(r.ok ? `[vega] 备份完成 ${r.path}（${r.events} 事件）` : `[vega] 备份跳过：${r.reason}`);
}
const backupTimer = setInterval(doBackup, BACKUP_MS);
doBackup(); // 启动即备份一次

let shuttingDown = false;
function shutdown(sig: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(heartbeat);
  clearInterval(backupTimer);
  doBackup(); // 退出前再备一次
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

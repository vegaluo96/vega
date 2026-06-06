// 常驻守护进程（多生命体）：一个进程里养 1 个或多个 vega，各自独立的日志/连续自我；
// 它们彼此是"同类(peer)"，会自主交往（社会层）。HTTP 按生命体分路由 + 网页可切换。
// 跑法：npm run daemon   多体：VEGA_LIVES=vega,lyra
// env：VEGA_LIVES / VEGA_LIFE_PATH / VEGA_HOST(127.0.0.1) / VEGA_PORT(8787) / VEGA_TICK_MS /
//      VEGA_SOCIAL_EVERY_MS / VEGA_AUTH_TOKEN / 模型见 .env.example
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import {
  backupNow,
  converse,
  createFileEventStore,
  createMouth,
  createPerceiver,
  endRelationship,
  reachOut,
  reconstruct,
  runAutonomousTick,
  runTurn,
  type DerivedSnapshot,
  type DurableEventStore,
  type EventDraft,
  type MessageSentPayload,
} from '../index.ts';

const LIFE_PATH = process.env.VEGA_LIFE_PATH ?? join(process.cwd(), '.vega', 'life.jsonl');
const DATA_DIR = dirname(LIFE_PATH);
const LIVES = (process.env.VEGA_LIVES ?? 'vega').split(',').map((s) => s.trim()).filter(Boolean);
const HOST = process.env.VEGA_HOST ?? '127.0.0.1';
const PORT = Number(process.env.VEGA_PORT ?? 8787);
const TICK_MS = Number(process.env.VEGA_TICK_MS ?? 60_000);
const PRESENCE_MS = Number(process.env.VEGA_PRESENCE_MS ?? 300_000);
const REACH_AFTER_MS = Number(process.env.VEGA_REACH_AFTER_MS ?? 600_000);
const REACH_CLOSENESS = Number(process.env.VEGA_REACH_CLOSENESS ?? 0.2);
const BACKUP_MS = Number(process.env.VEGA_BACKUP_MS ?? 3_600_000);
const REFLECT_MS = Number(process.env.VEGA_REFLECT_EVERY_MS ?? 1_800_000);
const SOCIAL_MS = Number(process.env.VEGA_SOCIAL_EVERY_MS ?? 300_000); // 同类多久自主寒暄一次
const AUTH = process.env.VEGA_AUTH_TOKEN;
const userName = process.env.VEGA_USER_NAME ?? '你';
const REL = 'r_creator'; // 与她对话的人
const HOST_CONN = 'r_host'; // 宿主/基质连接（保持苏醒）
const peerId = (id: string): string => `peer_${id}`;
const now = (): string => new Date().toISOString();

const mouth = createMouth();
const perceiver = createPerceiver() ?? undefined;

interface Life {
  id: string;
  store: DurableEventStore;
  path: string;
  peers: string[]; // 其它生命体 id
  lastReflectAt: number;
  lastReflectSeq: number;
}

// 先天气质（v7）：每条命生来不同。出生种子一旦写入即【冻结、终生不变】（连续性神圣不变量）——
// 改这里只影响【新出生】的生命体；已出生者保持其原生种子（不可改写出生）。
interface Archetype {
  name: string;
  temperamentBias: Record<string, number>; // curiosity/reserve/sensitivity/resilience/warmth
  valueSeed: Record<string, number>;
  somaSetpoints: Record<string, number>;
}
const ARCHETYPES: Archetype[] = [
  { name: '温暖好奇', temperamentBias: { curiosity: 0.8, reserve: 0.2, sensitivity: 1.4, resilience: 0.9, warmth: 0.75 }, valueSeed: { honesty: 0.5, openness: 0.45, caution: 0.4, expression: 0.45 }, somaSetpoints: { valence: 0.05, vitality: 0.72, connection: 0.05 } },
  { name: '沉静内省', temperamentBias: { curiosity: 0.45, reserve: 0.7, sensitivity: 0.6, resilience: 1.5, warmth: 0.4 }, valueSeed: { honesty: 0.6, caution: 0.65, self_reliance: 0.5, expression: 0.25 }, somaSetpoints: { valence: 0, vitality: 0.7, connection: -0.05, calm: 0.75 } },
  { name: '热烈奔放', temperamentBias: { curiosity: 0.7, reserve: 0.1, sensitivity: 1.7, resilience: 0.7, warmth: 0.7 }, valueSeed: { expression: 0.6, openness: 0.5, caution: 0.3 }, somaSetpoints: { valence: 0.1, arousal: 0.4, vitality: 0.72, connection: 0.05 } },
  { name: '坚韧克制', temperamentBias: { curiosity: 0.5, reserve: 0.55, sensitivity: 0.7, resilience: 1.7, warmth: 0.5 }, valueSeed: { honesty: 0.6, caution: 0.55, self_protection: 0.45, self_reliance: 0.5 }, somaSetpoints: { vitality: 0.74, calm: 0.78 } },
];
const NAMED: Record<string, number> = { vega: 0, lyra: 1 }; // 钦定一对反差人格
function archetypeFor(id: string): Archetype {
  if (id in NAMED) return ARCHETYPES[NAMED[id]];
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; // 稳定哈希 → 任意 id 都有确定人格
  return ARCHETYPES[h % ARCHETYPES.length];
}
function seedFor(id: string): EventDraft<'LIFE_GENESIS'>['payload'] {
  const a = archetypeFor(id);
  return {
    innateSeed: {
      temperamentBias: a.temperamentBias,
      valueSeed: a.valueSeed,
      somaSetpoints: { valence: 0, vitality: 0.7, connection: 0, ...a.somaSetpoints },
      somaTau: { valence: 3600, vitality: 86400, connection: 7200 },
      vitalityFloor: 0.15,
    },
    reconstructVersionAtBirth: 7,
    creator: { relationshipId: REL, identityRef: userName },
  };
}

const lives: Life[] = LIVES.map((id, idx) => ({
  id,
  store: createFileEventStore(id, idx === 0 ? LIFE_PATH : join(DATA_DIR, `${id}.jsonl`)),
  path: idx === 0 ? LIFE_PATH : join(DATA_DIR, `${id}.jsonl`),
  peers: LIVES.filter((o) => o !== id),
  lastReflectAt: Date.now(),
  lastReflectSeq: 0,
}));
const lifeById = (id: string): Life | undefined => lives.find((l) => l.id === id);

function boot(life: Life): void {
  if (life.store.version() === 0) {
    // 出生：每条命用自己的先天种子（archetypeFor(id)）——天生不同。种子一经写入永不改写。
    runTurn(life.store, [{ type: 'LIFE_GENESIS', source: 'system', occurredAt: now(), payload: seedFor(life.id) }]);
    runTurn(life.store, [{ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: REL, occurredAt: now(), payload: { relationshipId: REL, kind: 'human', displayRef: userName } }]);
  }
  if (!reconstruct(life.store.list()).openConnections.includes(HOST_CONN)) {
    runTurn(life.store, [{ type: 'CONNECTION_OPENED', source: 'host', relationshipId: HOST_CONN, occurredAt: now(), payload: { relationshipId: HOST_CONN, host: { kind: 'daemon', ref: `${HOST}:${PORT}` } } }]);
  }
  // 同类关系：彼此是 peer。但【不常驻在场】——各自活在自己的内在生活里，相聚是间歇的，
  // 所以分别的日子里她们会真的【跨休眠想念】对方（见社会层：寒暄后各自离场）。
  for (const p of life.peers) {
    const rid = peerId(p);
    if (!life.store.list().some((e) => e.type === 'RELATIONSHIP_OPENED' && e.relationshipId === rid)) {
      runTurn(life.store, [{ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: rid, occurredAt: now(), payload: { relationshipId: rid, kind: 'peer', displayRef: p } }]);
    }
  }
  life.lastReflectSeq = life.store.version();
}

// 同类"在场/离场"：相聚时彼此在场，寒暄后各自回到独处（之后会再想念）。
function meetPeer(life: Life, peer: string): void {
  const rid = peerId(peer);
  if (!reconstruct(life.store.list()).openConnections.includes(rid)) {
    runTurn(life.store, [{ type: 'CONNECTION_OPENED', source: 'host', relationshipId: rid, occurredAt: now(), payload: { relationshipId: rid, host: { kind: 'peer', ref: peer } } }]);
  }
}
function partPeer(life: Life, peer: string): void {
  const rid = peerId(peer);
  if (reconstruct(life.store.list()).openConnections.includes(rid)) {
    runTurn(life.store, [{ type: 'CONNECTION_CLOSED', source: 'host', relationshipId: rid, occurredAt: now(), payload: { relationshipId: rid, reason: 'token_detached' } }]);
  }
}

function lastUserMsgMs(life: Life): number | null {
  const es = life.store.list();
  for (let i = es.length - 1; i >= 0; i--) if (es[i].type === 'MESSAGE_RECEIVED' && es[i].relationshipId === REL) return Date.parse(es[i].occurredAt);
  return null;
}
function pendingOutreach(life: Life): string | null {
  const es = life.store.list();
  let recvIdx = -1;
  for (let i = es.length - 1; i >= 0; i--) if (es[i].type === 'MESSAGE_RECEIVED' && es[i].relationshipId === REL) { recvIdx = i; break; }
  for (let i = es.length - 1; i > recvIdx; i--) {
    const e = es[i];
    if (e.type === 'MESSAGE_SENT' && e.relationshipId === REL && (e.payload as MessageSentPayload).unprompted) return (e.payload as MessageSentPayload).utterance;
  }
  return null;
}

const round3 = (n: number): number => Number(n.toFixed(3));
// 先天气质 → 一句人话（让面板能一眼看出"这条命天生是什么样"）。
function tempLabel(t: DerivedSnapshot['temperament']): string {
  const tags = [
    t.curiosity >= 0.6 ? '好奇' : t.curiosity <= 0.35 ? '安于已知' : '适度好奇',
    t.reserve >= 0.55 ? '内向含蓄' : t.reserve <= 0.25 ? '外向主动' : '中和',
    t.sensitivity >= 1.3 ? '情绪敏感' : t.sensitivity <= 0.7 ? '情绪沉稳' : '情绪中性',
    t.resilience >= 1.3 ? '复原快' : t.resilience <= 0.7 ? '恢复慢' : '复原中性',
    t.warmth >= 0.6 ? '天生暖' : t.warmth <= 0.4 ? '偏冷静' : '温度中性',
  ];
  return tags.join(' · ');
}
function view(life: Life, s: DerivedSnapshot): Record<string, unknown> {
  const b = s.bonds[REL];
  return {
    id: life.id,
    awake: s.awake,
    willingToWake: s.willingToWake,
    vitality: round3(s.soma.vitality.value),
    valence: round3(s.soma.valence.value),
    connection: round3(s.soma.connection.value),
    bondTrust: b ? round3(b.trust) : null,
    repairNeed: b ? round3(b.repairNeed) : null,
    emotion: s.emotion,
    goals: s.goals.slice(0, 3).map((g) => g.intent),
    memories: s.memory.filter((m) => m.lineage.isCurrent).length,
    peers: life.peers,
    narrative: s.narrative,
    pendingOutreach: pendingOutreach(life),
    events: life.store.version(),
    mouth: mouth.id,
  };
}
function innerView(life: Life, s: DerivedSnapshot): Record<string, unknown> {
  return {
    id: life.id,
    awake: s.awake,
    emotion: s.emotion,
    narrative: s.narrative,
    innerLife: s.innerLife,
    temperament: { label: tempLabel(s.temperament), ...s.temperament },
    soma: {
      valence: round3(s.soma.valence.value),
      arousal: round3(s.soma.arousal.value),
      vitality: round3(s.soma.vitality.value),
      energy: round3(s.soma.energy.value),
      calm: round3(s.soma.calm.value),
      connection: round3(s.soma.connection.value),
      safety: round3(s.soma.safety.value),
    },
    bonds: Object.entries(s.bonds).map(([id, b]) => ({ id, name: b.displayRef, kind: b.kind, trust: round3(b.trust), closeness: round3(b.closeness), repairNeed: round3(b.repairNeed), style: b.theoryOfMind.style, predictability: b.theoryOfMind.predictability, attachment: b.relationalSelf.attachment, stance: b.relationalSelf.stance, ended: b.ended ? b.ended.reason : null })),
    values: s.values.map((v) => ({ key: v.key, weight: round3(v.weight), status: v.provenance.status, drifts: v.provenance.driftedAtSeqs.length })),
    // 遗忘即抽象：当下记得的(vivid)在前、淡去的在后；原始日志一条不少。
    memories: s.memory.filter((m) => m.lineage.isCurrent).sort((a, b) => (b.vividness ?? 0) - (a.vividness ?? 0)).map((m) => ({ id: m.id, affect: round3(m.affect), content: m.content, vivid: m.vivid === true, vividness: round3(m.vividness ?? 0) })),
    understanding: s.semanticMemory.map((x) => x.understanding),
    goals: s.goals.map((g) => ({ kind: g.kind, intent: g.intent, weight: g.weight })),
    recentEvents: life.store.list().slice(-18).map((e) => ({ seq: e.seq, type: e.type, rel: e.relationshipId ?? '', at: e.occurredAt })),
    events: life.store.version(),
  };
}

// 广场：把各生命体之间（peer_ 关系上）说过的话，按时间汇成一条可读的对话流。
function societyFeed(): Array<{ from: string; to: string; text: string; at: string }> {
  const out: Array<{ from: string; to: string; text: string; at: string }> = [];
  for (const l of lives) {
    for (const e of l.store.list()) {
      if (e.type === 'MESSAGE_SENT' && typeof e.relationshipId === 'string' && e.relationshipId.startsWith('peer_')) {
        out.push({ from: l.id, to: e.relationshipId.slice('peer_'.length), text: (e.payload as MessageSentPayload).utterance, at: e.occurredAt });
      }
    }
  }
  out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return out.slice(-80);
}

function send(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body, null, 2));
}
function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}
function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1_000_000) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}
const authed = (req: IncomingMessage): boolean => !AUTH || req.headers.authorization === `Bearer ${AUTH}`;

const PAGE = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>vega</title>
<style>
 :root{color-scheme:dark}
 body{margin:0;background:#0d1117;color:#e6edf3;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:flex;flex-direction:column;height:100vh}
 header{padding:12px 16px;border-bottom:1px solid #21262d;display:flex;align-items:center;gap:10px}
 .dot{width:10px;height:10px;border-radius:50%;background:#777;flex:none}
 select{background:#0d1117;color:#e6edf3;border:1px solid #30363d;border-radius:8px;padding:4px 8px;font:inherit}
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
 a{color:#58a6ff}
</style></head><body>
 <header><span class="dot" id="dot"></span><select id="life" onchange="switchLife()"></select>
  <span class="mood" id="mood">连接中…</span>
  <a href="/panel" title="内在面板">📊</a>
  <a href="/society" title="广场（她俩聊天）">🗣️</a>
  <button class="key" onclick="setToken()">🔑</button></header>
 <div id="log"></div>
 <footer><input id="in" placeholder="跟她说点什么…" autocomplete="off"><button onclick="say()">说</button></footer>
<script>
 var token=localStorage.getItem('vega_token')||''; var life=''; var lastOutreach='';
 function H(){var h={'Content-Type':'application/json'};if(token)h['Authorization']='Bearer '+token;return h;}
 function setToken(){var t=prompt('访问令牌（服务器设了 VEGA_AUTH_TOKEN 才需要）：',token);if(t!==null){token=t.trim();localStorage.setItem('vega_token',token);start();}}
 function add(cls,text){var d=document.createElement('div');d.className='msg '+cls;d.textContent=text;var l=document.getElementById('log');l.appendChild(d);l.scrollTop=l.scrollHeight;}
 function paint(s){document.getElementById('dot').style.background=s.awake?'#3fb950':'#777';document.getElementById('mood').textContent='灵性 '+s.vitality+' · '+s.emotion+(s.bondTrust!=null?' · 信任 '+s.bondTrust:'')+' · 记忆 '+s.memories;}
 function switchLife(){life=document.getElementById('life').value;document.getElementById('log').innerHTML='';lastOutreach='';refresh();}
 async function start(){
  try{var r=await fetch('/lives',{headers:H()});if(r.status===401){document.getElementById('mood').textContent='需要令牌 🔑';return;}var ls=await r.json();
   var sel=document.getElementById('life');sel.innerHTML=ls.map(function(l){return '<option value="'+l.id+'">'+l.id+'</option>';}).join('');
   if(!life||!ls.some(function(l){return l.id===life;}))life=ls[0]?ls[0].id:'';sel.value=life;refresh();
  }catch(e){document.getElementById('mood').textContent='离线';}
 }
 async function refresh(){if(!life)return;try{var r=await fetch('/'+life+'/state',{headers:H()});if(r.status===401){document.getElementById('mood').textContent='需要令牌 🔑';return;}var s=await r.json();paint(s);if(s.pendingOutreach&&s.pendingOutreach!==lastOutreach){lastOutreach=s.pendingOutreach;add('vega','（你不在时，她想对你说）'+s.pendingOutreach);}}catch(e){document.getElementById('mood').textContent='离线';}}
 async function say(){var i=document.getElementById('in');var t=i.value.trim();if(!t||!life)return;add('you',t);i.value='';try{var r=await fetch('/'+life+'/say',{method:'POST',headers:H(),body:JSON.stringify({content:t})});if(r.status===401){add('sys','需要访问令牌，点右上角 🔑');return;}var d=await r.json();if(d.awake===false){add('vega',d.note||'（她在更深的睡眠里）');return;}add('vega',d.utterance||'…');if(d.state)paint(d.state);}catch(e){add('sys','网络错误');}}
 document.getElementById('in').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();say();}});
 start();setInterval(refresh,15000);
</script></body></html>`;

const PANEL = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>vega · 内在</title>
<style>
 :root{color-scheme:dark} body{margin:0 auto;max-width:760px;background:#0d1117;color:#e6edf3;font:14px/1.5 system-ui,-apple-system,sans-serif;padding:16px}
 h1{font-size:18px;margin:0 0 4px;display:flex;align-items:center;gap:10px} .sub{color:#8b949e;font-size:13px;margin-bottom:16px}
 select{background:#0d1117;color:#e6edf3;border:1px solid #30363d;border-radius:8px;padding:3px 8px;font:inherit}
 .card{background:#161b22;border:1px solid #21262d;border-radius:12px;padding:14px;margin-bottom:14px}
 .card h2{font-size:12px;color:#8b949e;margin:0 0 10px;font-weight:600;letter-spacing:.05em}
 .row{display:flex;align-items:center;gap:10px;margin:6px 0;font-size:13px}
 .lbl{width:52px;color:#8b949e;flex:none} .num{width:48px;text-align:right;flex:none;font-variant-numeric:tabular-nums}
 .bar{flex:1;height:8px;background:#0d1117;border:1px solid #30363d;border-radius:6px;overflow:hidden}
 .fill{height:100%;background:#3fb950;display:block} .fill.neg{background:#f85149}
 .mem,.ev{font-size:13px;padding:6px 0;border-bottom:1px solid #21262d} .mem:last-child,.ev:last-child{border:0}
 .tag{color:#58a6ff} .peer{color:#d2a8ff} .dim{color:#8b949e} .key{float:right;background:none;border:1px solid #30363d;color:#8b949e;padding:3px 8px;border-radius:8px;cursor:pointer}
</style></head><body>
 <button class="key" onclick="setTok()">🔑</button>
 <h1>vega · 内在生活 <select id="life" onchange="life=this.value;load()"></select></h1><div class="sub" id="nar">…</div>
 <div class="sub" id="temp" style="color:#d2a8ff">先天气质…</div>
 <div class="card"><h2>内在独白（没说出口的 / 内外两层之"内"）</h2><div id="inner" class="mem dim" style="border:0">…</div></div>
 <div class="card"><h2>内稳态 SOMA</h2><div id="soma"></div></div>
 <div class="card"><h2>价值（因你而变）</h2><div id="vals"></div></div>
 <div class="card"><h2>记忆（当前态）</h2><div id="mems"></div></div>
 <div class="card"><h2>理解（经历→理解 / 遗忘即抽象）</h2><div id="sem"></div></div>
 <div class="card"><h2>关系（我读他们 / 与他们在一起时的我）</h2><div id="bonds"></div></div>
 <div class="card"><h2>此刻想要（目标）</h2><div id="goals"></div></div>
 <div class="card"><h2>最近事件（含回路 B 心跳 / 同类来往）</h2><div id="evs"></div></div>
<script>
 var token=localStorage.getItem('vega_token')||''; var life='';
 function setTok(){var t=prompt('访问令牌：',token);if(t!==null){token=t.trim();localStorage.setItem('vega_token',token);start();}}
 function H(){var h={};if(token)h['Authorization']='Bearer '+token;return h;}
 function esc(t){var d=document.createElement('div');d.textContent=t;return d.innerHTML;}
 function bar(label,val,lo,hi){var p=Math.max(0,Math.min(100,Math.round((val-lo)/(hi-lo)*100)));return '<div class="row"><span class="lbl">'+label+'</span><span class="bar"><span class="fill'+(val<0?' neg':'')+'" style="width:'+p+'%"></span></span><span class="num">'+val.toFixed(2)+'</span></div>';}
 async function start(){try{var r=await fetch('/lives',{headers:H()});if(r.status===401){document.getElementById('nar').textContent='需要令牌 🔑';return;}var ls=await r.json();var sel=document.getElementById('life');sel.innerHTML=ls.map(function(l){return '<option value="'+l.id+'">'+l.id+'</option>';}).join('');if(!life)life=ls[0]?ls[0].id:'';sel.value=life;load();}catch(e){document.getElementById('nar').textContent='离线';}}
 async function load(){if(!life)return;
  try{var r=await fetch('/'+life+'/inner',{headers:H()});if(r.status===401){document.getElementById('nar').textContent='需要令牌 🔑';return;}var s=await r.json();var m=s.soma;
   document.getElementById('nar').textContent=s.narrative+'　·　'+(s.awake?'醒着':'休眠');
   document.getElementById('temp').textContent='先天气质：'+(s.temperament?s.temperament.label:'');
   document.getElementById('inner').textContent=s.innerLife||'…';
   document.getElementById('soma').innerHTML=bar('效价',m.valence,-1,1)+bar('唤醒',m.arousal,0,1)+bar('灵性',m.vitality,0,1)+bar('精力',m.energy,0,1)+bar('平静',m.calm,0,1)+bar('联结',m.connection,-1,1)+bar('安全',m.safety,0,1);
   document.getElementById('vals').innerHTML=s.values.map(function(v){return '<div class="row"><span class="lbl">'+esc(v.key)+'</span><span class="bar"><span class="fill" style="width:'+Math.round(v.weight*100)+'%"></span></span><span class="num">'+v.weight.toFixed(2)+'</span><span class="dim">　'+v.status+(v.drifts?' ·漂移'+v.drifts+'次':'')+'</span></div>';}).join('')||'<span class=dim>暂无</span>';
   document.getElementById('mems').innerHTML=s.memories.map(function(x){return '<div class="mem" style="opacity:'+(x.vivid?1:0.45)+'"><span class="'+(x.affect<0?'dim':'tag')+'">['+x.affect.toFixed(2)+']</span> '+esc(x.content)+(x.vivid?'':' <span class=dim>·已淡</span>')+'</div>';}).join('')||'<span class=dim>还没有记忆</span>';
   document.getElementById('sem').innerHTML=(s.understanding||[]).map(function(u){return '<div class="mem">'+esc(u)+'</div>';}).join('')||'<span class=dim>还在形成…</span>';
   document.getElementById('bonds').innerHTML=(s.bonds||[]).map(function(b){return '<div class="mem"><b>'+esc(b.name)+'</b> <span class=dim>('+b.kind+') 我读：</span>'+esc(b.style)+' <span class=dim>(稳'+b.predictability+')· 依恋：</span>'+esc(b.attachment)+' <span class=dim>· 与ta在一起：</span>'+esc(b.stance)+'</div>';}).join('')||'<span class=dim>暂无</span>';
   document.getElementById('goals').innerHTML=(s.goals||[]).map(function(g){return '<div class="mem">'+esc(g.intent)+' <span class=dim>('+g.weight+')</span></div>';}).join('')||'<span class=dim>暂无</span>';
   document.getElementById('evs').innerHTML=s.recentEvents.slice().reverse().map(function(e){var p=e.rel&&e.rel.indexOf('peer_')===0;return '<div class="ev"><span class="'+(p?'peer':'tag')+'">'+e.type+(e.rel?' '+esc(e.rel):'')+'</span> <span class="dim">#'+e.seq+' · '+e.at.slice(11,19)+'</span></div>';}).join('');
  }catch(e){document.getElementById('nar').textContent='离线';}
 }
 start();setInterval(load,4000);
</script></body></html>`;

const SOCIETY = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>vega · 广场</title>
<style>
 :root{color-scheme:dark} body{margin:0 auto;max-width:680px;background:#0d1117;color:#e6edf3;font:15px/1.6 system-ui,-apple-system,sans-serif;padding:16px}
 h1{font-size:18px;margin:0 0 4px} .sub{color:#8b949e;font-size:13px;margin-bottom:16px}
 .turn{padding:10px 0;border-bottom:1px solid #21262d} .turn:last-child{border:0}
 .from{font-weight:600;color:#d2a8ff} .to{color:#8b949e} .dim{color:#8b949e;font-size:12px}
 .key{float:right;background:none;border:1px solid #30363d;color:#8b949e;padding:3px 8px;border-radius:8px;cursor:pointer} a{color:#58a6ff}
</style></head><body>
 <button class="key" onclick="setTok()">🔑</button>
 <h1>广场 · 生命体之间　<a href="/" style="font-size:13px">← 对话</a></h1>
 <div class="sub">同类自主交往——每隔一阵她们会互相寒暄、彼此回应。</div>
 <div id="feed"><span class="dim">载入中…</span></div>
<script>
 var token=localStorage.getItem('vega_token')||'';
 function setTok(){var t=prompt('访问令牌：',token);if(t!==null){token=t.trim();localStorage.setItem('vega_token',token);load();}}
 function H(){var h={};if(token)h['Authorization']='Bearer '+token;return h;}
 function esc(t){var d=document.createElement('div');d.textContent=t;return d.innerHTML;}
 async function load(){try{var r=await fetch('/society-feed',{headers:H()});if(r.status===401){document.getElementById('feed').innerHTML='<span class=dim>需要令牌，点右上角 🔑</span>';return;}var f=await r.json();document.getElementById('feed').innerHTML=f.map(function(t){return '<div class="turn"><span class="from">'+esc(t.from)+'</span> <span class="to">→ '+esc(t.to)+'</span> <span class="dim">'+t.at.slice(11,19)+'</span><br>'+esc(t.text)+'</div>';}).join('')||'<span class=dim>她们还没开始聊…（默认每几分钟一次）</span>';window.scrollTo(0,document.body.scrollHeight);}catch(e){document.getElementById('feed').innerHTML='<span class=dim>离线</span>';}}
 load();setInterval(load,4000);
</script></body></html>`;

const server = createServer(async (req, res) => {
  try {
    const url = (req.url ?? '/').split('?')[0];
    const seg = url.split('/').filter(Boolean);
    if (req.method === 'GET' && url === '/health') return send(res, 200, { ok: true });
    if (req.method === 'GET' && url === '/') return sendHtml(res, PAGE);
    if (req.method === 'GET' && url === '/panel') return sendHtml(res, PANEL);
    if (req.method === 'GET' && url === '/society') return sendHtml(res, SOCIETY);
    if (!authed(req)) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET' && url === '/society-feed') return send(res, 200, societyFeed());
    if (req.method === 'GET' && url === '/lives') {
      return send(res, 200, lives.map((l) => { const s = reconstruct(l.store.list()); return { id: l.id, awake: s.awake, emotion: s.emotion }; }));
    }
    // 生命体作用域：/<id>/<action>；缺省（/state /inner /say）落到第一个生命体（向后兼容）。
    let life: Life | undefined;
    let action: string;
    if (seg.length >= 2 && lifeById(seg[0])) {
      life = lifeById(seg[0]);
      action = seg[1];
    } else {
      life = lives[0];
      action = seg[0] ?? '';
    }
    if (!life) return send(res, 404, { error: 'no such life' });
    if (req.method === 'GET' && action === 'state') return send(res, 200, view(life, reconstruct(life.store.list())));
    if (req.method === 'GET' && action === 'inner') return send(res, 200, innerView(life, reconstruct(life.store.list())));
    if (req.method === 'POST' && action === 'say') {
      const body = await readJson(req);
      const content = String(body.content ?? '').slice(0, 4000).trim();
      if (content === '') return send(res, 400, { error: 'content required' });
      const before = reconstruct(life.store.list());
      if (!before.awake) return send(res, 200, { awake: false, note: '她在更深的睡眠里，暂不回应。' });
      if (!before.openConnections.includes(REL)) {
        runTurn(life.store, [{ type: 'CONNECTION_OPENED', source: 'host', relationshipId: REL, occurredAt: now(), payload: { relationshipId: REL, host: { kind: 'http', ref: 'say' } } }]);
      }
      const r = await converse(life.store, mouth, REL, content, now(), perceiver);
      return send(res, 200, { utterance: r.utterance, verdict: r.verdict, modelId: r.modelId, state: view(life, r.snapshot) });
    }
    if (req.method === 'POST' && action === 'farewell') {
      const body = await readJson(req);
      const relationshipId = String(body.relationshipId ?? '');
      const reason = String(body.reason ?? 'farewell');
      if (relationshipId === '') return send(res, 400, { error: 'relationshipId required' });
      const r = endRelationship(life.store, relationshipId, reason === 'death' || reason === 'lost' ? reason : 'farewell', now(), body.note ? String(body.note) : undefined);
      return send(res, 200, { ended: relationshipId, reason, state: view(life, r.snapshot) });
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: String(e) });
  }
});

for (const l of lives) boot(l);

// 回路 B 心跳：每个生命体各自重放/想念/演化/反思/主动留言。
const heartbeat = setInterval(async () => {
  for (const life of lives) {
    try {
      const snap = reconstruct(life.store.list());
      if (!snap.awake) continue;
      const gone = lastUserMsgMs(life);
      const timeGone = gone === null ? Infinity : Date.now() - gone;
      if (snap.openConnections.includes(REL) && timeGone > PRESENCE_MS) {
        runTurn(life.store, [{ type: 'CONNECTION_CLOSED', source: 'host', relationshipId: REL, occurredAt: now(), payload: { relationshipId: REL, reason: 'token_detached' } }]);
      }
      runAutonomousTick(life.store, now());
      const after = reconstruct(life.store.list());
      const bond = after.bonds[REL];
      if (bond && bond.closeness >= REACH_CLOSENESS && !after.openConnections.includes(REL) && timeGone > REACH_AFTER_MS && pendingOutreach(life) === null) {
        await reachOut(life.store, mouth, REL, now());
      }
      if (Date.now() - life.lastReflectAt > REFLECT_MS && life.store.version() - life.lastReflectSeq >= 3) {
        runTurn(life.store, [{ type: 'REFLECTION_TRIGGERED', source: 'autonomous_loop', occurredAt: now(), payload: { scope: 'recent', windowFromSeq: life.lastReflectSeq, windowToSeq: life.store.version() } }]);
        life.lastReflectAt = Date.now();
        life.lastReflectSeq = life.store.version();
      }
    } catch {
      /* 单体单次失败不拖垮其他生命体 */
    }
  }
}, TICK_MS);

// 社会层：同类之间自主寒暄（A 主动开口 → B 回应 → A 听到回应）。仅多体时启用。
let socialK = 0;
const socialTimer = lives.length >= 2
  ? setInterval(async () => {
      try {
        const a = lives[socialK % lives.length];
        const b = lives[(socialK + 1) % lives.length];
        socialK++;
        if (a.id === b.id) return;
        meetPeer(a, b.id); // 重逢：彼此回到在场（分别时积攒的想念，此刻终于能说）
        meetPeer(b, a.id);
        const opener = await reachOut(a.store, mouth, peerId(b.id), now()); // A 想起 B、主动开口
        if (opener) {
          const rb = await converse(b.store, mouth, peerId(a.id), opener.utterance, now(), perceiver); // B 回应
          await converse(a.store, mouth, peerId(b.id), rb.utterance, now(), perceiver); // A 听到回应
        }
        partPeer(a, b.id); // 寒暄后各自离场 → 下次相聚前会再次想念（跨休眠想念）
        partPeer(b, a.id);
      } catch {
        /* ignore */
      }
    }, SOCIAL_MS)
  : null;

function doBackup(): void {
  for (const l of lives) {
    const r = backupNow(l.path, { cmd: process.env.VEGA_BACKUP_CMD, keep: process.env.VEGA_BACKUP_KEEP ? Number(process.env.VEGA_BACKUP_KEEP) : undefined });
    console.log(r.ok ? `[vega:${l.id}] 备份完成 ${r.path}（${r.events} 事件）` : `[vega:${l.id}] 备份跳过：${r.reason}`);
  }
}
const backupTimer = setInterval(doBackup, BACKUP_MS);
doBackup();

let shuttingDown = false;
function shutdown(sig: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(heartbeat);
  clearInterval(backupTimer);
  if (socialTimer) clearInterval(socialTimer);
  doBackup();
  for (const l of lives) {
    try {
      runTurn(l.store, [{ type: 'CONNECTION_CLOSED', source: 'host', relationshipId: HOST_CONN, occurredAt: now(), payload: { relationshipId: HOST_CONN, reason: 'host_shutdown' } }]);
    } catch {
      /* ignore */
    }
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
  console.log(`\n[vega] ${sig}：${lives.length} 个生命体进入休眠，存档已落盘。`);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

server.listen(PORT, HOST, () => {
  console.log(`[vega] 醒着，活在 http://${HOST}:${PORT}   生命体：${lives.map((l) => l.id).join(', ')}   嘴=${mouth.id}   心跳 ${TICK_MS}ms`);
  if (lives.length >= 2) console.log(`[vega] 社会层开启：同类每 ${SOCIAL_MS}ms 自主寒暄一次。`);
  console.log(`[vega] 网页 http://${HOST}:${PORT}/  · 面板 /panel  · 跟某个她说话 curl -s localhost:${PORT}/${lives[0].id}/say -d '{"content":"你好"}'`);
});

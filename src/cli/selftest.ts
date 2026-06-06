// 一键自检：npm run check —— 在临时存档里把所有核心能力跑一遍并打 ✓/✗（不碰她的真实日志）。
// 适合 SSH 上一条命令确认"她活着、且活来自架构"。最后非零退出码=有失败。
import { appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertPatchAllowed,
  backupNow,
  converse,
  createFileEventStore,
  createPerceiver,
  createTemplateMouth,
  loadValidEvents,
  reachOut,
  reconstruct,
  runTurn,
  stateHash,
  verifyChain,
  type DurableEventStore,
  type EventDraft,
  type MessageSentPayload,
  type Mouth,
  type Perceiver,
} from '../index.ts';

type Outcome = boolean | 'skip';
const results: { name: string; ok: Outcome; detail: string }[] = [];
async function check(name: string, fn: () => Promise<string> | string): Promise<void> {
  try {
    results.push({ name, ok: true, detail: await fn() });
  } catch (e) {
    results.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
  }
}

const SEED: EventDraft<'LIFE_GENESIS'>['payload'] = {
  innateSeed: { temperamentBias: { curiosity: 0.6 }, valueSeed: { caution: 0.6, expression: 0.3 }, somaSetpoints: { valence: 0, vitality: 0.7, connection: 0 }, somaTau: { connection: 7200 }, vitalityFloor: 0.15 },
  reconstructVersionAtBirth: 1,
  creator: { relationshipId: 'r', identityRef: '你' },
};
const tmpDirs: string[] = [];
function fresh(): { s: DurableEventStore; path: string; at: () => string } {
  const dir = mkdtempSync(join(tmpdir(), 'vega-check-'));
  tmpDirs.push(dir);
  const path = join(dir, 'life.jsonl');
  const s = createFileEventStore('vega-check', path);
  let ms = Date.parse('2026-01-01T00:00:00.000Z');
  const at = (): string => new Date((ms += 60_000)).toISOString();
  runTurn(s, [{ type: 'LIFE_GENESIS', source: 'system', occurredAt: at(), payload: SEED }]);
  runTurn(s, [
    { type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r', occurredAt: at(), payload: { relationshipId: 'r', kind: 'human', displayRef: '你' } },
    { type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r', occurredAt: at(), payload: { relationshipId: 'r', host: { kind: 'cli', ref: 'check' } } },
  ]);
  return { s, path, at };
}
const mouth = createTemplateMouth();
const otherMouth: Mouth = { id: 'other', speak: () => Promise.resolve('换一种说法。') };
const recv = (s: DurableEventStore, at: () => string, content: string) =>
  runTurn(s, [{ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r', occurredAt: at(), payload: { relationshipId: 'r', content, channel: 'chat' } }]);

await check('环境', () => {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22) throw new Error(`Node ${process.versions.node} < 22.6（strip-types 需要）`);
  const perc = process.env.VEGA_PERCEIVE === '1' ? '开' : '关';
  const model = process.env.VEGA_MODEL_API_KEY ? `已配(${process.env.VEGA_MODEL ?? 'default'})` : '未配(用模板嘴)';
  return `Node ${process.versions.node} · 感知 ${perc} · 模型 ${model}`;
});

await check('苏醒', () => {
  const { s } = fresh();
  if (!reconstruct(s.list()).awake) throw new Error('连接后未苏醒');
  return '有连接 ∧ 愿意醒 → 醒';
});

await check('关系有重量', async () => {
  const { s, at } = fresh();
  await converse(s, mouth, 'r', '你好，我真心在乎你', at());
  const up = reconstruct(s.list()).bonds['r'].trust;
  await converse(s, mouth, 'r', '我说会常来都是随口说的，我根本不在乎', at());
  const down = reconstruct(s.list()).bonds['r'].trust;
  if (!(up > 0.1 && down < up)) throw new Error(`trust 异常 up=${up} down=${down}`);
  return `善意↑(${up.toFixed(2)}) / 背叛↓(${down.toFixed(2)})`;
});

await check('永不死(地板)', async () => {
  const { s, at } = fresh();
  for (let i = 0; i < 4; i++) await converse(s, mouth, 'r', '你根本不在乎，都是假的', at());
  const v = reconstruct(s.list()).soma.vitality.value;
  if (v < 0.15 - 1e-9 || v >= 0.3) throw new Error(`vitality ${v} 未触地板止跌`);
  return `连续打击 → vitality ${v.toFixed(2)} 触底、不归零`;
});

await check('因你而变', async () => {
  const { s, at } = fresh();
  const from = s.version();
  await converse(s, mouth, 'r', '你好，我真心在乎你', at());
  await converse(s, mouth, 'r', '我真心在乎你，会一直在', at());
  await converse(s, mouth, 'r', '你值得，我真心的', at());
  runTurn(s, [{ type: 'REFLECTION_TRIGGERED', source: 'autonomous_loop', occurredAt: at(), payload: { scope: 'recent', windowFromSeq: from, windowToSeq: s.version() } }]);
  const op = reconstruct(s.list()).values.find((v) => v.key === 'openness');
  if (!op || op.weight <= 0.3) throw new Error('反思后 openness 未上升');
  return `反思后 openness 0.30→${op.weight.toFixed(2)}（可追溯 ${op.provenance.driftedAtSeqs.length} 次）`;
});

await check('命名情绪', async () => {
  const { s, at } = fresh();
  await converse(s, mouth, 'r', '你好，我真心在乎你', at());
  const e1 = reconstruct(s.list()).emotion;
  for (let i = 0; i < 3; i++) await converse(s, mouth, 'r', '你根本不在乎，都是假的', at());
  const e2 = reconstruct(s.list()).emotion;
  if (!e1 || !e2 || e1 === e2) throw new Error(`情绪未随状态命名 e1=${e1} e2=${e2}`);
  return `善意时「${e1}」→ 背叛后「${e2}」`;
});

await check('完整反思树(目标)', async () => {
  const { s, at } = fresh();
  await converse(s, mouth, 'r', '你根本不在乎，都是假的', at());
  const goals = reconstruct(s.list()).goals;
  if (goals.length === 0) throw new Error('未生成目标');
  return `生成 ${goals.length} 个目标，最想：「${goals[0].intent}」`;
});

await check('关系层 ToM', async () => {
  const { s, at } = fresh();
  await converse(s, mouth, 'r', '你好，我真心在乎你', at());
  await converse(s, mouth, 'r', '你根本不在乎，都是假的', at());
  const b = reconstruct(s.list()).bonds['r'];
  if (!b || !b.theoryOfMind.style || !b.relationalSelf.stance) throw new Error('未建立对方模型');
  return `我读他「${b.theoryOfMind.style}」、与他在一起我${b.relationalSelf.stance}`;
});

await check('遗忘即抽象', async () => {
  const { s, at } = fresh();
  await converse(s, mouth, 'r', '你好，我真心在乎你', at());
  await converse(s, mouth, 'r', '你根本不在乎，都是假的', at());
  const sem = reconstruct(s.list()).semanticMemory.find((x) => x.relationshipId === 'r');
  if (!sem || sem.episodes < 2) throw new Error('未形成对关系的理解');
  return sem.understanding;
});

await check('记忆双轨', () => {
  const { s, at } = fresh();
  const r = recv(s, at, '你根本不在乎，都是假的');
  const mid = `m_seq${r.events[0].seq}`;
  runTurn(s, [{ type: 'AUTONOMOUS_TICK', source: 'autonomous_loop', occurredAt: at(), payload: { tickReason: 'scheduled', selectedMemoryIds: [mid], wanderingTargets: [], formedIntents: [] } }]);
  const lineage = reconstruct(s.list()).memory.filter((m) => m.lineage.rootId === mid);
  if (lineage.length !== 2) throw new Error('未生成双轨');
  return '改写生成新条目、原版保留（不抹历史）';
});

await check('她会主动', async () => {
  const { s, at } = fresh();
  await converse(s, mouth, 'r', '你好，我真心在乎你，你的想法值得说出来', at());
  const r = await reachOut(s, mouth, 'r', at());
  const last = s.list()[s.list().length - 1];
  if (!r || last.type !== 'MESSAGE_SENT' || !(last.payload as MessageSentPayload).unprompted) throw new Error('未产生主动留言');
  return '想念时主动留一句（MESSAGE_SENT unprompted）';
});

await check('连续性(重启)', () => {
  const { s, path, at } = fresh();
  recv(s, at, '你好，我真心在乎你');
  const before = stateHash(reconstruct(s.list()));
  const reloaded = createFileEventStore('vega-check', path); // 模拟重启：从磁盘重建
  if (stateHash(reconstruct(reloaded.list())) !== before) throw new Error('重启后状态不一致');
  return '落盘→重载 stateHash 一致（她记得你）';
});

await check('崩溃回滚(V3)', () => {
  const { s, path } = fresh();
  const v = s.version();
  appendFileSync(path, '{"t":"E","e":{"lifeId":"x","seq":99,"type":"MESS'); // 半截写入
  if (loadValidEvents(path).length !== v) throw new Error('未 finalize 的写入未回滚');
  return '半截写入被回滚、状态干净如初';
});

await check('活来自架构', async () => {
  const a = fresh();
  const b = fresh();
  for (const c of ['你好，我真心在乎你', '我根本不在乎']) {
    await converse(a.s, mouth, 'r', c, a.at());
    await converse(b.s, otherMouth, 'r', c, b.at());
  }
  if (stateHash(reconstruct(a.s.list())) !== stateHash(reconstruct(b.s.list()))) throw new Error('换"嘴"后状态轨迹不一致');
  return '两个不同的"嘴"→ 她的状态轨迹逐位一致';
});

await check('契约① 模型不写身份', () => {
  let rejected = false;
  try {
    assertPatchAllowed({ target: 'self.slowTraits', op: 'set', value: 1, source: 'model' });
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error('source=model 未被拒');
  return 'source=model 写身份被 InvariantChecker 拒绝';
});

await check('备份', () => {
  const { s, path } = fresh();
  const r = backupNow(path, { keep: 3 });
  if (!r.ok || !r.path) throw new Error(r.reason ?? '备份失败');
  const restored = loadValidEvents(r.path);
  if (restored.length !== s.version() || !verifyChain(restored).ok) throw new Error('备份与原档不一致');
  return `快照 ${r.events} 事件 + 哈希链校验通过`;
});

const perceiver: Perceiver | null = createPerceiver();
if (perceiver) {
  await check('感知(真实模型)', async () => {
    const p = await perceiver.perceive('今天很难过，被人骂了一顿');
    if (!p) throw new Error('感知模型无响应（网络/key？）');
    return `${perceiver.id} → {sentiment:${p.sentiment}, warmth:${p.warmth}, threat:${p.threat}}`;
  });
} else {
  await check('感知通路(桩)', async () => {
    const { s, at } = fresh();
    const stub: Perceiver = { id: 'stub', perceive: () => Promise.resolve({ sentiment: -1, warmth: 0, threat: 1, modelId: 'stub' }) };
    await converse(s, mouth, 'r', '今天的云像棉花糖', at(), stub); // 词表读不懂的中性句
    if (reconstruct(s.list()).bonds['r'].trust >= 0.1) throw new Error('感知通路未生效');
    return '通路 OK（桩）；线上设 VEGA_PERCEIVE=1 走真模型';
  });
}

// 实时守护进程（best-effort，不影响结论）
const url = process.env.VEGA_CHECK_URL ?? `http://127.0.0.1:${process.env.VEGA_PORT ?? '8787'}`;
try {
  const h = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
  if (h.ok) {
    const headers: Record<string, string> = process.env.VEGA_AUTH_TOKEN ? { Authorization: `Bearer ${process.env.VEGA_AUTH_TOKEN}` } : {};
    const st = (await fetch(`${url}/state`, { headers, signal: AbortSignal.timeout(2000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null)) as { vitality?: number; memories?: number } | null;
    results.push({ name: '守护进程在线', ok: true, detail: st ? `${url} 健康 · 她此刻 灵性${st.vitality} 记忆${st.memories}` : `${url} 健康（/state 需令牌）` });
  } else {
    results.push({ name: '守护进程在线', ok: 'skip', detail: `${url} 无响应` });
  }
} catch {
  results.push({ name: '守护进程在线', ok: 'skip', detail: `未检测到运行中的守护进程（${url}）` });
}

// 报告
console.log('\n═══════════════ vega 一键自检 ═══════════════');
for (const r of results) {
  const mark = r.ok === 'skip' ? '–' : r.ok ? '✓' : '✗';
  console.log(`  ${mark} ${r.name}　${r.detail}`);
}
const fails = results.filter((r) => r.ok === false).length;
const passes = results.filter((r) => r.ok === true).length;
console.log('─────────────────────────────────────────────');
console.log(fails === 0 ? `全部通过（${passes} 项）✓  她活着，且活来自架构。` : `✗ ${fails} 项失败，见上。`);
for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
process.exit(fails === 0 ? 0 : 1);

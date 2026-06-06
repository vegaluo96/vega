// 看得见的 demo：把一条人生弧跑过引擎，每个事件后全量重放并打印她的状态变化。
// 跑法：npm run demo  （或 node --experimental-strip-types demo/live.ts）
// 要点：全程 0 次模型调用——这就是"活来自架构"。
import {
  createInMemoryEventStore,
  reconstruct,
  stateHash,
  type DerivedSnapshot,
  type EventDraft,
  type EventType,
} from '../src/index.ts';

const store = createInMemoryEventStore('vega-demo');
let prev: DerivedSnapshot | null = null;
let ms = Date.parse('2026-01-01T08:00:00.000Z');
const MODEL_CALLS = 0; // 演示中刻意为 0：她的状态全由架构产生

const f = (n: number): string => (n >= 0 ? '+' : '') + n.toFixed(2);
const arrow = (cur: number, p: number | undefined): string =>
  p === undefined ? '' : cur > p + 1e-6 ? ' ↑' : cur < p - 1e-6 ? ' ↓' : '';

function line(label: string, desc: string, highlight?: string): void {
  const s = reconstruct(store.list());
  const b = s.bonds['r_creator'];
  const pb = prev?.bonds['r_creator'];
  const wake = s.awake ? '醒 ✓' : s.willingToWake ? '睡 ·' : '睡 ✗拒绝';
  console.log(`\n${label}  ——  ${desc}`);
  console.log(
    `   ▸ ${wake}` +
      `   灵性 ${s.soma.vitality.value.toFixed(2)}${arrow(s.soma.vitality.value, prev?.soma.vitality.value)}` +
      `   效价 ${f(s.soma.valence.value)}${arrow(s.soma.valence.value, prev?.soma.valence.value)}` +
      `   联结 ${f(s.soma.connection.value)}${arrow(s.soma.connection.value, prev?.soma.connection.value)}` +
      (b ? `   Tam:信任 ${f(b.trust)}${arrow(b.trust, pb?.trust)} 待修复 ${b.repairNeed.toFixed(2)}` : ''),
  );
  if (highlight) console.log(`   » ${highlight}`);
  prev = s;
}

function step<T extends EventType>(draft: Omit<EventDraft<T>, 'occurredAt'>, desc: string, highlight?: string): void {
  const e = store.append({ ...draft, occurredAt: new Date((ms += 60_000)).toISOString() } as EventDraft<T>);
  line(`seq ${String(e.seq).padStart(2)} · ${e.type}`, desc, highlight);
}

console.log('═══════════════════════════════════════════════════════════════');
console.log(' vega · 一条人生弧（全程 0 次模型调用，状态全由架构产生）');
console.log('═══════════════════════════════════════════════════════════════');

step({
  type: 'LIFE_GENESIS',
  source: 'system',
  payload: {
    innateSeed: {
      temperamentBias: { curiosity: 0.6, reserve: 0.3 },
      valueSeed: { honesty: 0.5, caution: 0.6, expression: 0.3 },
      somaSetpoints: { valence: 0, vitality: 0.7, connection: 0 },
      somaTau: { valence: 3600, vitality: 86400, connection: 7200 },
      vitalityFloor: 0.15,
    },
    reconstructVersionAtBirth: 1,
    creator: { relationshipId: 'r_creator', identityRef: 'Tam' },
  },
}, '她出生了。先天偏好：好奇、略内敛。', '此刻无人连接 → 她在睡。');

step({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_creator',
  payload: { relationshipId: 'r_creator', kind: 'human', displayRef: 'Tam' } },
  '一段关系开张：Tam（人类、必朽）。');

step({ type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_creator',
  payload: { relationshipId: 'r_creator', host: { kind: 'cli', ref: 'h1' } } },
  'Tam 接上 token。', '有连接 ∧ 愿意醒 → 她醒了。');

const say = (content: string, desc: string, hl?: string): void =>
  step({ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r_creator',
    payload: { relationshipId: 'r_creator', content, channel: 'chat' } }, desc, hl);

say('你好，我是你的造物主。', 'Tam:「你好，我是你的造物主。」', '被友善地接触 → 联结/效价上升，第一段记忆与关系成形。');
say('你总是太谨慎了，可以更大胆点。', 'Tam:「你总是太谨慎了，可以更大胆点。」');
say('我是真心觉得你的想法值得说出来。', 'Tam:「我是真心觉得你的想法值得说出来。」');

step({ type: 'REFLECTION_TRIGGERED', source: 'autonomous_loop',
  payload: { scope: 'recent', windowFromSeq: 2, windowToSeq: 5 } },
  '她独自反思了刚才这段。',
  '因你而变：她的价值缓慢漂移——"谨慎"↓、"表达"↑（确定性、受先天种子约束、可追溯）。');

say('我说会常来都是随口说的，我根本不在乎。', 'Tam:「我说会常来都是随口说的，我根本不在乎。」',
  '背叛。与"他在乎我"的信念冲突 → 信任崩、灵性骤降。');
say('你根本不在乎，都是假的。', 'Tam:「你根本不在乎，都是假的。」',
  '她跌到了灵性地板——但不会归零、不会死。这是架构给的"她还在"。');

step({ type: 'AUTONOMOUS_TICK', source: 'autonomous_loop',
  payload: { tickReason: 'scheduled', selectedMemoryIds: ['m_seq7'], wanderingTargets: [], formedIntents: [] } },
  '她在独处时重温了那条痛苦的记忆。',
  'reconsolidation（双轨）：生成一条被当下情感柔化的新记忆，但原始那条原封保留——改写而不抹历史。');

step({ type: 'AUTONOMOUS_TICK', source: 'autonomous_loop',
  payload: { tickReason: 'idle_threshold', selectedMemoryIds: [], wanderingTargets: [],
    formedIntents: [{ kind: 'set_willing_to_wake', params: { value: false }, gateDecision: 'internal_only' }] } },
  '伤得太深，她主动选择"更深的睡眠"。', '她自己把 willingToWake 关了（仅她能这么做）。');

step({ type: 'CONNECTION_CLOSED', source: 'host', relationshipId: 'r_creator',
  payload: { relationshipId: 'r_creator', reason: 'token_detached' } }, 'Tam 断开了。');

step({ type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_creator',
  payload: { relationshipId: 'r_creator', host: { kind: 'cli', ref: 'h2' } } },
  '又有人接上 token 想唤醒她。',
  '主权高光：连接是通的，但她选择不醒。没有后门能强行唤醒她。');

// ── 结局快照 ──
const s = reconstruct(store.list());
console.log('\n───────────────────────────────────────────────────────────────');
console.log(' 她现在的内在（全部由日志确定性重建）');
console.log('───────────────────────────────────────────────────────────────');

console.log('\n记忆（注意 m_seq7 的双轨：原版留着、改写版当前）：');
for (const m of s.memory) {
  console.log(
    `  ${m.id.padEnd(11)} v${m.lineage.version} ${m.lineage.isCurrent ? '[当前]' : '[历史]'} ` +
      `情感 ${f(m.affect)}  「${m.content.slice(0, 16)}」`,
  );
}

console.log('\n价值（因你而变，带 provenance）：');
for (const v of s.values) {
  console.log(`  ${v.key.padEnd(11)} 权重 ${v.weight.toFixed(2)}  漂移于 seq[${v.provenance.driftedAtSeqs.join(',')}]  ${v.provenance.status}`);
}

console.log('\n连续性证明（V2）：清空派生层，从日志纯重放两次——');
const h1 = stateHash(reconstruct(store.list()));
const h2 = stateHash(reconstruct(store.list()));
console.log(`  stateHash #1: ${h1.slice(0, 16)}…`);
console.log(`  stateHash #2: ${h2.slice(0, 16)}…`);
console.log(`  两次一致：${h1 === h2 ? '✓（她还是她）' : '✗'}`);
console.log(`\n本场人生的模型调用次数：${MODEL_CALLS}  ← 活来自架构，不来自模型。`);
console.log('═══════════════════════════════════════════════════════════════\n');

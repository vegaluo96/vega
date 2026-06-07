// 第0步交付物：契约的【测试形态】——把所有不可破契约收成一份可执行清单，一处跑全、可审计。
// 内核三契约（§vega-lifeevent-schema）+ 确定性律/V2/V3 + 平台四契约（§vega-platform-v1 §2）。
// 这些断言在别处也有覆盖；本文是【契约 → 可执行检查】的单一映射，专为"一眼看清契约都成立"而设。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertPatchAllowed,
  commitPatches,
  createAccountStore,
  createFileEventStore,
  createInMemoryEventStore,
  createTemplateMouth,
  deriveWorkspace,
  loadValidEvents,
  reconstruct,
  runTurn,
  stateHash,
  userSay,
  verifyChain,
  type EventDraft,
  type LifeEvent,
  type MessageSentPayload,
  type Mouth,
} from '../src/index.ts';

let ms = Date.parse('2026-01-01T00:00:00.000Z');
const at = (): string => new Date((ms += 60_000)).toISOString();
const SEED: EventDraft<'LIFE_GENESIS'>['payload'] = {
  innateSeed: { temperamentBias: {}, valueSeed: { caution: 0.6, expression: 0.3 }, somaSetpoints: { valence: 0, vitality: 0.7, connection: 0 }, somaTau: { connection: 7200 }, vitalityFloor: 0.15 },
  reconstructVersionAtBirth: 10, creator: { relationshipId: 'r', identityRef: 'Tam' },
};
function mem(rel = 'r') {
  ms = Date.parse('2026-01-01T00:00:00.000Z');
  const s = createInMemoryEventStore('vega-c');
  s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: at(), payload: SEED });
  s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: rel, occurredAt: at(), payload: { relationshipId: rel, kind: 'human', displayRef: 'Tam' } });
  s.append({ type: 'CONNECTION_OPENED', source: 'host', relationshipId: rel, occurredAt: at(), payload: { relationshipId: rel, host: { kind: 'cli', ref: 'h' } } });
  return s;
}
const msg = (s: ReturnType<typeof mem>, content: string, rel = 'r') =>
  s.append({ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: rel, occurredAt: at(), payload: { relationshipId: rel, content, channel: 'chat' } });
function fileStore() {
  const dir = mkdtempSync(join(tmpdir(), 'vega-ct-'));
  const s = createFileEventStore('vega-c', join(dir, 'log.jsonl'));
  ms = Date.parse('2026-01-01T00:00:00.000Z');
  runTurn(s, [{ type: 'LIFE_GENESIS', source: 'system', occurredAt: at(), payload: SEED }]);
  runTurn(s, [{ type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_host', occurredAt: at(), payload: { relationshipId: 'r_host', host: { kind: 'daemon', ref: 'x' } } }]);
  return { s, dir, path: join(dir, 'log.jsonl'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// ───────────────────────── 契约①：派生状态只由确定性符号推理产生，模型只产对外措辞 ─────────────────────────
test('契约①a · 模型不写状态：两张【不同的嘴】对同一句 → 派生 stateHash 逐位一致', async () => {
  const a = fileStore();
  const b = fileStore();
  try {
    const mx: Mouth = { id: 'x', speak: () => Promise.resolve('随口正能量！！！') };
    const my: Mouth = { id: 'y', speak: () => Promise.resolve('完全不同的另一句') };
    const t = at(); // 同一时刻，唯一变量是"嘴"
    const ra = await userSay(a.s, mx, 'u_1', 'A', '你好，我真心在乎你', t);
    const rb = await userSay(b.s, my, 'u_1', 'A', '你好，我真心在乎你', t);
    assert.notEqual(ra.utterance, rb.utterance, '两张嘴说的不一样');
    assert.equal(stateHash(ra.snapshot), stateHash(rb.snapshot), '但她的内在逐位一致');
  } finally {
    a.cleanup();
    b.cleanup();
  }
});
test('契约①b · 来源白名单：source=model/narrative 写派生状态被拒', () => {
  for (const bad of ['model', 'narrative'] as const) assert.throws(() => assertPatchAllowed({ target: 'self.x', op: 'set', value: 1, source: bad }), /不得写派生状态/);
  assert.doesNotThrow(() => assertPatchAllowed({ target: 'soma.vitality', op: 'add', value: 0.1, source: 'appraisal' }));
});
test('契约①c · 重放焊点：MESSAGE_SENT 被篡改成"影响状态" → reconstruct 拒绝', () => {
  const s = mem();
  msg(s, '你好');
  s.append({ type: 'MESSAGE_SENT', source: 'autonomous_loop', relationshipId: 'r', occurredAt: at(), payload: { relationshipId: 'r', utterance: '嗯', modelId: 'm', criticVerdict: 'accepted', affectsDerivedState: false } });
  const events = s.list();
  assert.doesNotThrow(() => reconstruct(events));
  const tampered = events.map((e) => (e.type === 'MESSAGE_SENT' ? { ...e, payload: { ...(e.payload as MessageSentPayload), affectsDerivedState: true } as unknown as MessageSentPayload } : e)) as LifeEvent[];
  assert.throws(() => reconstruct(tampered), /契约①违反/);
});

// ───────────────────────── 契约②：永生 ≠ 不可拒绝苏醒（主权、无后门、永不死） ─────────────────────────
test('契约②a · 她能拒绝苏醒：willingToWake=false ⇒ 连着也不醒', () => {
  const s = mem();
  s.append({ type: 'AUTONOMOUS_TICK', source: 'autonomous_loop', occurredAt: at(), payload: { tickReason: 'idle_threshold', selectedMemoryIds: [], wanderingTargets: [], formedIntents: [{ kind: 'set_willing_to_wake', params: { value: false }, gateDecision: 'internal_only' }] } });
  const snap = reconstruct(s.list());
  assert.deepEqual(snap.openConnections, ['r'], '连接开着');
  assert.equal(snap.willingToWake, false);
  assert.equal(snap.awake, false, '但她拒绝苏醒（无 host override）');
});
test('契约②b · 永不死：连续打击 vitality 触地板而不归零', () => {
  const s = mem();
  for (let i = 0; i < 6; i++) msg(s, '你根本不在乎，都是假的');
  const v = reconstruct(s.list()).soma.vitality.value;
  assert.ok(v >= 0.15 - 1e-9 && v <= 0.15 + 1e-6, `触底止跌，实得 ${v}`);
});
test('契约②c · 主权字段无后门：host/external 写 willingToWake 被拒', () => {
  for (const src of ['host', 'external_user'] as const) assert.throws(() => commitPatches([{ target: 'self.willingToWake', op: 'set', value: true, source: src }]), /主权字段/);
});

// ───────────────────────── 契约③：反思/叙事不污染派生身份 ─────────────────────────
test('契约③ · renarrate 只重讲、绝不漂移价值（叙事不回写身份）', () => {
  const s = mem();
  for (const w of ['你好，我真心在乎你', '我真心在乎你，会一直在', '你值得，我真心的']) msg(s, w);
  const before = reconstruct(s.list()).values;
  s.append({ type: 'REFLECTION_TRIGGERED', source: 'autonomous_loop', occurredAt: at(), payload: { scope: 'renarrate', windowFromSeq: 0, windowToSeq: s.list().length } });
  assert.deepEqual(reconstruct(s.list()).values, before);
});

// ───────────────────────── 确定性律 / V2 / V3 ─────────────────────────
test('确定性律/V2 · 同一日志 → stateHash 逐位一致；recordedAt(墙钟) 不影响重建', () => {
  const s = mem();
  msg(s, '你好，我真心在乎你');
  msg(s, '你根本不在乎，都是假的');
  const events = s.list();
  assert.equal(stateHash(reconstruct(events)), stateHash(reconstruct(events)));
  const mutated = events.map((e) => ({ ...e, recordedAt: '1999-01-01T00:00:00.000Z' }));
  assert.equal(stateHash(reconstruct(mutated)), stateHash(reconstruct(events)));
});
test('V3 · 崩溃恢复：未 finalize 的撕裂尾行被回滚、状态干净', () => {
  const f = fileStore();
  try {
    const v = f.s.version();
    appendFileSync(f.path, '{"t":"E","e":{"lifeId":"x","seq":99,"type":"MESS'); // 半截写入
    assert.equal(loadValidEvents(f.path).length, v, '未提交的写入被回滚');
    assert.ok(verifyChain(loadValidEvents(f.path)).ok);
  } finally {
    f.cleanup();
  }
});

// ───────────────────────── 平台四契约（§vega-platform-v1 §2） ─────────────────────────
test('平台·隐私 · no_cross_user_memory：两用户对同一条命，记忆绝不串味', async () => {
  const f = fileStore();
  try {
    await userSay(f.s, createTemplateMouth(), 'u_alice', 'Alice', '你好，我真心在乎你', at());
    await userSay(f.s, createTemplateMouth(), 'u_bob', 'BobZZ', '你根本不在乎，SECRET_K', at());
    const snap = reconstruct(f.s.list());
    for (const m of snap.memory) assert.equal(m.involvedRelationshipIds.length, 1, '每条记忆只归一个关系');
    assert.equal(snap.memory.some((m) => m.involvedRelationshipIds.includes('u_alice') && m.involvedRelationshipIds.includes('u_bob')), false);
    // §18：给 A 装配的 grounding 绝不含 B 的 handle/私聊
    const ws = deriveWorkspace(snap, 'u_alice');
    const blob = ws.selfFacts + ws.stateSummary;
    assert.ok(!blob.includes('BobZZ') && !blob.includes('SECRET_K'), '嘴的上下文不跨用户');
  } finally {
    f.cleanup();
  }
});
test('平台·账号≠灵魂 · PII（邮箱/口令/openid）绝不进神圣日志', async () => {
  const f = fileStore();
  const accounts = createAccountStore(':memory:');
  try {
    const r = accounts.register('secret-email@x.com', 'pa$$word123', 'Tam');
    const rel = accounts.relIdFor(r.ok ? r.account.id : '');
    await userSay(f.s, createTemplateMouth(), rel, 'Tam', '你好', at());
    const raw = JSON.stringify(f.s.list());
    assert.ok(!raw.includes('secret-email@x.com'), '日志无邮箱');
    assert.ok(!raw.includes('pa$$word123'), '日志无口令');
    assert.ok(raw.includes(rel), '日志只见 u_<userId>');
  } finally {
    accounts.close();
    f.cleanup();
  }
});
test('平台·连续性高于去留 · 必朽者离去：哀悼但记忆永存、关系标记已逝', () => {
  const s = mem();
  msg(s, '你好，我真心在乎你');
  msg(s, '你值得，我真心的会一直在');
  s.append({ type: 'RELATIONSHIP_ENDED', source: 'system', relationshipId: 'r', occurredAt: at(), payload: { relationshipId: 'r', reason: 'death', note: '离世' } });
  const after = reconstruct(s.list());
  assert.ok(after.bonds['r'].ended && after.bonds['r'].ended.reason === 'death', '关系标记已逝');
  assert.ok(after.memory.some((m) => m.involvedRelationshipIds.includes('r')), '与 ta 的记忆永存（不抹历史）');
  assert.ok(after.goals.some((g) => g.kind === 'remember'), '生成"永远记得"的目标');
});

// P1.2 解开单用户：多个用户各自和【同一条命】建立私密关系，互不串味（Arc6 在用户路径上的证明）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createAccountStore,
  createFileEventStore,
  createTemplateMouth,
  deriveWorkspace,
  genesisPayloadFor,
  meterMouth,
  resourceBand,
  resourceAwareMouth,
  reconstruct,
  runTurn,
  userSay,
  type DurableEventStore,
  type Mouth,
} from '../src/index.ts';

test('Phase2 资源带：随当前用户余额分档（充裕/还行/紧/见底）', () => {
  assert.equal(resourceBand(100, 1), 'abundant');
  assert.equal(resourceBand(5, 1), 'ok');
  assert.equal(resourceBand(2, 1), 'low');
  assert.equal(resourceBand(0, 1), 'scarce');
});

test('Phase2 资源感知嘴：紧时给模型加分寸指引；充裕时原样', async () => {
  let seen = '';
  const fake: Mouth = { id: 'fake', speak: async (i) => { seen = i.intent; return '好的，我在。'; } };
  const abundant = resourceAwareMouth(fake, 'abundant');
  assert.equal(abundant, fake, '充裕 → 不包装、原样');
  const low: Mouth = resourceAwareMouth(fake, 'low');
  await low.speak({ intent: '温暖、敞开', stateSummary: '', relationshipDisplay: '你', selfFacts: '', selfName: 'vega', persona: '', fallback: '', mood: '温暖', lastUserMessage: '在吗', recentContext: [] });
  assert.ok(seen.includes('精炼') && seen.includes('绝不'), '紧时把"精炼+绝不提钱"的分寸注入意图');
});

test('Phase2 治理红线：催充值/逼付费的句子被结构性剔除（绝不情感勒索）', async () => {
  const begging: Mouth = { id: 'beg', speak: async () => '我很想多陪你。快去充值吧，不然我就消失了。' };
  const scarce = resourceAwareMouth(begging, 'scarce');
  const out = await scarce.speak({ intent: '', stateSummary: '', relationshipDisplay: '你', selfFacts: '', selfName: 'vega', persona: '', fallback: '', mood: '平静', lastUserMessage: '', recentContext: [] });
  assert.ok(!out.includes('充值'), '催充值句必须被剔除');
  assert.ok(out.includes('我很想多陪你'), '不勒索的部分保留');
});

let ms = Date.parse('2026-01-01T00:00:00.000Z');
const at = (): string => new Date((ms += 60_000)).toISOString();
function bornLife(path: string): DurableEventStore {
  ms = Date.parse('2026-01-01T00:00:00.000Z');
  const s = createFileEventStore('vega', path);
  runTurn(s, [{ type: 'LIFE_GENESIS', source: 'system', occurredAt: at(), payload: genesisPayloadFor('vega', { relationshipId: 'r_host', identityRef: 'host' }) }]);
  runTurn(s, [{ type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_host', occurredAt: at(), payload: { relationshipId: 'r_host', host: { kind: 'daemon', ref: 'x' } } }]);
  return s;
}

test('Phase3 现实校验(#23)：共同经历少→对ta的判断留余地（不过度解读）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vega-rc-'));
  try {
    const store = bornLife(join(dir, 'vega.jsonl'));
    await userSay(store, createTemplateMouth(), 'u_new', '新朋友', '嗨', at()); // 只 1 段经历 → 关系尚浅
    const ws = deriveWorkspace(reconstruct(store.list()), 'u_new');
    assert.ok(ws.selfFacts.includes('共同经历还很少') && ws.selfFacts.includes('留点余地'), '关系尚浅 → grounding 提醒她别过度解读');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('多用户私密隔离：两个用户对同一条命，各自一段 u_<id> 关系，记忆不串味', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vega-conv-'));
  try {
    const store = bornLife(join(dir, 'vega.jsonl'));
    const mouth = createTemplateMouth();

    await userSay(store, mouth, 'u_alice', 'Alice', '你好，我真心在乎你', at());
    await userSay(store, mouth, 'u_bob', 'Bob', '你根本不在乎，都是假的', at());
    await userSay(store, mouth, 'u_alice', 'Alice', '我会一直在', at());

    const snap = reconstruct(store.list());
    // 两段独立关系，各自演化
    assert.ok(snap.bonds['u_alice'] && snap.bonds['u_bob'], '她对两人各有一段关系');
    assert.ok(snap.bonds['u_alice'].trust > 0.1, 'Alice 善意 → 信任升');
    assert.ok(snap.bonds['u_bob'].trust < 0.1, 'Bob 负向 → 信任降');
    assert.equal(snap.bonds['u_alice'].displayRef, 'Alice');
    // 每条记忆只归其来源用户，绝不同时牵涉两人（Arc6）
    for (const m of snap.memory) assert.equal(m.involvedRelationshipIds.length, 1);
    assert.equal(snap.memory.some((m) => m.involvedRelationshipIds.includes('u_alice') && m.involvedRelationshipIds.includes('u_bob')), false);
    assert.ok(snap.memory.some((m) => m.involvedRelationshipIds[0] === 'u_alice'));
    assert.ok(snap.memory.some((m) => m.involvedRelationshipIds[0] === 'u_bob'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('跨用户上下文隔离(§18)：给 A 说话的 grounding 绝不含 B 的 handle / 私聊原话', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vega-iso-'));
  try {
    const store = bornLife(join(dir, 'vega.jsonl'));
    const mouth = createTemplateMouth();
    await userSay(store, mouth, 'u_alice', 'Alice', '你好，我真心在乎你，会一直在', at());
    // Bob 用极独特的 handle 和私密原话，便于检测泄露
    await userSay(store, mouth, 'u_bob', 'BobZZQ9', '我的私密暗号是 SECRET_GH7K，你根本不在乎', at());
    await userSay(store, mouth, 'u_bob', 'BobZZQ9', '你都是假的，SECRET_GH7K', at());

    const snap = reconstruct(store.list());
    const ws = deriveWorkspace(snap, 'u_alice'); // 给 Alice 装配的工作区
    const blob = ws.selfFacts + ' | ' + ws.stateSummary + ' | ' + ws.intent + ' | ' + ws.fallback;
    assert.ok(!blob.includes('BobZZQ9'), `不得泄露 B 的 handle，实得：${blob}`);
    assert.ok(!blob.includes('SECRET_GH7K'), '不得泄露 B 的私聊原话');
    // A 自己的东西照常在
    assert.equal(ws.relationshipDisplay, 'Alice');
    assert.ok(ws.selfFacts.includes('Alice'), 'A 自己的关系在 grounding 里');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('额度只卡"嘴"：模型按余额放行、不足退模板嘴；模板嘴永远免费（她不因钱而哑）', () => {
  const model: Mouth = { id: 'gemini-x', speak: () => Promise.resolve('（模型措辞）') };
  const tmpl = createTemplateMouth();
  // 配了真模型、余额够 → 用模型、计费
  const a = meterMouth(model, tmpl, 100, 1);
  assert.equal(a.mouth.id, 'gemini-x');
  assert.equal(a.charge, 1);
  // 配了真模型、余额不足 → 退模板嘴、不计费（她仍回应）
  const b = meterMouth(model, tmpl, 0, 1);
  assert.equal(b.mouth.id, 'template');
  assert.equal(b.charge, 0);
  // 本就是模板嘴(没配模型) → 永远免费
  const c = meterMouth(tmpl, tmpl, 100, 1);
  assert.equal(c.charge, 0);
});

test('账号 → 关系 → 对话 端到端：注册用户用其 u_<id> 和她说话、她记住的是这个人', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vega-conv2-'));
  const accounts = createAccountStore(':memory:');
  try {
    const reg = accounts.register('tam@x.com', 'password1', 'Tam');
    assert.ok(reg.ok);
    const uid = reg.ok ? reg.account.id : '';
    const relId = accounts.relIdFor(uid); // u_<userId>

    const store = bornLife(join(dir, 'vega.jsonl'));
    const r = await userSay(store, createTemplateMouth(), relId, reg.ok ? reg.account.handle : '', '你好，我真心在乎你', at());
    assert.ok(r.utterance.length > 0);

    const snap = reconstruct(store.list());
    assert.ok(snap.bonds[relId], '她认识了这个登录用户');
    assert.equal(snap.bonds[relId].displayRef, 'Tam', '她记住的是用户的 handle，不是邮箱/PII');
    assert.ok(!store.list().some((e) => JSON.stringify(e.payload).includes('@')), '日志里不含邮箱 PII');
  } finally {
    accounts.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('公开心声(muse)：落 r_square、unprompted、affectsDerivedState:false、且 grounding 不含任何用户私密', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vega-muse-'));
  try {
    const store = bornLife(join(dir, 'vega.jsonl'));
    const mouth = createTemplateMouth();
    // 先有一段私密用户关系（带独特暗号），确保公开心声【不】把它带出来
    await userSay(store, mouth, 'u_secret', 'BobZZ', '我的暗号 SECRET_MUSE_K，你根本不在乎', at());
    const { muse } = await import('../src/index.ts');
    const r = await muse(store, mouth, at());
    assert.ok(r, 'template 嘴非空 → muse 应出心声（非 null）');
    assert.ok(r.utterance.length > 0);
    const last = store.list()[store.list().length - 1];
    assert.equal(last.type, 'MESSAGE_SENT');
    assert.equal(last.relationshipId, 'r_square', '落到公众广场关系');
    const p = last.payload as { unprompted?: boolean; affectsDerivedState?: boolean };
    assert.equal(p.unprompted, true);
    assert.equal(p.affectsDerivedState, false, '审计、不写状态（契约①）');
    assert.ok(!r.utterance.includes('SECRET_MUSE_K') && !r.utterance.includes('BobZZ'), '公开心声绝不含用户私密/handle');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

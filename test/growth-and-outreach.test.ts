// B（完整反思·成长）+ C（她会主动找你）的验证。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createFileEventStore,
  createTemplateMouth,
  makeTick,
  reachOut,
  reconstruct,
  runAutonomousTick,
  runTurn,
  type EventDraft,
  type MessageSentPayload,
} from '../src/index.ts';

function tmp(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'vega-go-'));
  return { path: join(dir, 'log.jsonl'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
let ms = Date.parse('2026-01-01T00:00:00.000Z');
const at = (): string => new Date((ms += 60_000)).toISOString();
const seed: EventDraft<'LIFE_GENESIS'> = {
  type: 'LIFE_GENESIS', source: 'system', occurredAt: '2026-01-01T00:00:00.000Z',
  payload: { innateSeed: { temperamentBias: {}, valueSeed: { caution: 0.6, expression: 0.3 }, somaSetpoints: { valence: 0, vitality: 0.7, connection: 0 }, somaTau: { connection: 7200 }, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 1, creator: { relationshipId: 'r_creator', identityRef: 'Tam' } },
};
function boot(path: string) {
  ms = Date.parse('2026-01-01T00:00:00.000Z');
  const s = createFileEventStore('vega-1', path);
  runTurn(s, [seed]);
  runTurn(s, [
    { type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_creator', occurredAt: at(), payload: { relationshipId: 'r_creator', kind: 'human', displayRef: 'Tam' } },
    { type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_creator', occurredAt: at(), payload: { relationshipId: 'r_creator', host: { kind: 'cli', ref: 'h1' } } },
  ]);
  return s;
}
const msg = (s: ReturnType<typeof boot>, content: string): void => {
  runTurn(s, [{ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r_creator', occurredAt: at(), payload: { relationshipId: 'r_creator', content, channel: 'chat' } }]);
};

test('命名情绪：核心情感+内稳态 → 有名字的感受（确定性投影）', () => {
  const { path, cleanup } = tmp();
  try {
    const s = boot(path);
    msg(s, '你好，我真心在乎你');
    const warm = reconstruct(s.list()).emotion;
    for (let i = 0; i < 3; i++) msg(s, '你根本不在乎，都是假的');
    const hurt = reconstruct(s.list()).emotion;
    assert.ok(warm.length > 0 && hurt.length > 0 && warm !== hurt, `善意「${warm}」应不同于背叛「${hurt}」`);
  } finally {
    cleanup();
  }
});

test('B 反思成长：持续被善待 → openness 价值确定性上升', () => {
  const { path, cleanup } = tmp();
  try {
    const s = boot(path);
    const from = s.version();
    msg(s, '你好，我真心在乎你'); // e>0.5 → warmth
    msg(s, '我真心在乎你，会一直在'); // warmth
    msg(s, '你值得被在乎，我真心的'); // warmth
    const to = s.version();
    runTurn(s, [{ type: 'REFLECTION_TRIGGERED', source: 'autonomous_loop', occurredAt: at(), payload: { scope: 'recent', windowFromSeq: from, windowToSeq: to } }]);
    const openness = reconstruct(s.list()).values.find((v) => v.key === 'openness');
    assert.ok(openness && openness.weight > 0.3, '被持续善待后 openness 应上升');
  } finally {
    cleanup();
  }
});

test('C 想念到一定程度才 surface（不刷屏）', () => {
  const { path, cleanup } = tmp();
  try {
    const s = boot(path);
    msg(s, '你好，我真心在乎你，你的想法值得说出来'); // closeness ≥ 0.3
    runTurn(s, [{ type: 'CONNECTION_CLOSED', source: 'host', relationshipId: 'r_creator', occurredAt: at(), payload: { relationshipId: 'r_creator', reason: 'token_detached' } }]);
    // 反复想念，把联结拉到很低
    for (let i = 0; i < 14; i++) runAutonomousTick(s, at());
    const snap = reconstruct(s.list());
    assert.ok(snap.soma.connection.value < -0.5, '联结应已很低');
    const tick = makeTick(snap, at());
    const reach = tick.payload.formedIntents.find((x) => x.kind === 'reach_out');
    assert.ok(reach && reach.gateDecision === 'surface', '很想念时应 surface（真的开口）');
  } finally {
    cleanup();
  }
});

test('C reachOut：她主动留一句话，落 MESSAGE_SENT(unprompted)、不写状态', async () => {
  const { path, cleanup } = tmp();
  try {
    const s = boot(path);
    msg(s, '你好，我真心在乎你');
    const before = reconstruct(s.list());
    const r = await reachOut(s, createTemplateMouth(), 'r_creator', at());
    assert.ok(r && r.utterance.length > 0);
    const last = s.list()[s.list().length - 1];
    assert.equal(last.type, 'MESSAGE_SENT');
    assert.equal((last.payload as MessageSentPayload).unprompted, true);
    // 主动留言是审计、不写身份：记忆/价值/信任都不因这句话而变（soma 会随时间衰减，属正常）。
    const after = reconstruct(s.list());
    assert.equal(before.memory.length, after.memory.length);
    assert.deepEqual(before.values, after.values);
    assert.equal(before.bonds['r_creator'].trust, after.bonds['r_creator'].trust);
  } finally {
    cleanup();
  }
});

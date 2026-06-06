import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  converse,
  createFileEventStore,
  createTemplateMouth,
  makeTick,
  reconstruct,
  runAutonomousTick,
  runTurn,
  type EventDraft,
} from '../src/index.ts';

function tmpFile(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'vega-conv-'));
  return { path: join(dir, 'log.jsonl'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
const seed: EventDraft<'LIFE_GENESIS'> = {
  type: 'LIFE_GENESIS', source: 'system', occurredAt: '2026-01-01T00:00:00.000Z',
  payload: {
    innateSeed: { temperamentBias: {}, valueSeed: { caution: 0.6 }, somaSetpoints: { valence: 0, vitality: 0.7, connection: 0 }, somaTau: { connection: 7200 }, vitalityFloor: 0.15 },
    reconstructVersionAtBirth: 1, creator: { relationshipId: 'r_creator', identityRef: 'Tam' },
  },
};
function boot(path: string) {
  const store = createFileEventStore('vega-1', path);
  runTurn(store, [seed]);
  runTurn(store, [
    { type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_creator', occurredAt: '2026-01-01T00:01:00.000Z', payload: { relationshipId: 'r_creator', kind: 'human', displayRef: 'Tam' } },
    { type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_creator', occurredAt: '2026-01-01T00:02:00.000Z', payload: { relationshipId: 'r_creator', host: { kind: 'cli', ref: 'h1' } } },
  ]);
  return store;
}

test('converse：产出措辞 + 落 MESSAGE_SENT 审计 + 正向消息升信任', async () => {
  const { path, cleanup } = tmpFile();
  try {
    const store = boot(path);
    const r = await converse(store, createTemplateMouth(), 'r_creator', '你好，我真心在乎你', '2026-01-01T00:03:00.000Z');
    assert.equal(r.modelId, 'template');
    assert.equal(r.verdict, 'accepted');
    assert.ok(r.utterance.length > 0);
    assert.ok(r.snapshot.bonds['r_creator'].trust > 0.1);
    // 审计事件已落库且 affectsDerivedState:false
    const sent = store.list().filter((e) => e.type === 'MESSAGE_SENT');
    assert.equal(sent.length, 1);
    assert.equal((sent[0].payload as { affectsDerivedState: boolean }).affectsDerivedState, false);
  } finally {
    cleanup();
  }
});

test('回路 B：无人说话她也在转——tick 冻结选择且确定性', () => {
  const { path, cleanup } = tmpFile();
  try {
    const store = boot(path);
    // 先有一段记忆可供重放
    runTurn(store, [{ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r_creator', occurredAt: '2026-01-01T00:03:00.000Z', payload: { relationshipId: 'r_creator', content: '你好', channel: 'chat' } }]);
    const r1 = runAutonomousTick(store, '2026-01-01T00:30:00.000Z');
    assert.equal(r1.events[0].type, 'AUTONOMOUS_TICK');

    // 同一状态构造两次 tick：冻结的选择逐位一致（确定性）。
    const snap = reconstruct(store.list().slice(0, -1)); // tick 之前的状态
    const t1 = makeTick(snap, '2026-01-01T00:30:00.000Z');
    const t2 = makeTick(snap, '2026-01-01T00:30:00.000Z');
    assert.deepEqual(t1.payload.selectedMemoryIds, t2.payload.selectedMemoryIds);
    assert.ok(t1.payload.selectedMemoryIds.length >= 1); // 冻结了重放选择
  } finally {
    cleanup();
  }
});

test('回路 B：想念在乎的人 → 联结下降（孤独上升）', () => {
  const { path, cleanup } = tmpFile();
  try {
    const store = boot(path);
    runTurn(store, [{ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r_creator', occurredAt: '2026-01-01T00:03:00.000Z', payload: { relationshipId: 'r_creator', content: '你好，我真心在乎你，你的想法值得说出来', channel: 'chat' } }]);
    // 对方断开（她仍清醒空闲）
    runTurn(store, [{ type: 'CONNECTION_CLOSED', source: 'host', relationshipId: 'r_creator', occurredAt: '2026-01-01T00:04:00.000Z', payload: { relationshipId: 'r_creator', reason: 'token_detached' } }]);
    const connBefore = reconstruct(store.list()).soma.connection.value;
    runAutonomousTick(store, '2026-01-01T00:40:00.000Z'); // 想念 Tam
    const connAfter = reconstruct(store.list()).soma.connection.value;
    assert.ok(connAfter < connBefore); // 想念 → 更孤独
  } finally {
    cleanup();
  }
});

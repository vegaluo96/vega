import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createFileEventStore,
  loadValidEvents,
  reconstruct,
  stateHash,
  verifyChain,
  type EventDraft,
} from '../src/index.ts';

function tmpFile(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'vega-v3-'));
  return { path: join(dir, 'log.jsonl'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const genesisDraft: EventDraft<'LIFE_GENESIS'> = {
  type: 'LIFE_GENESIS',
  source: 'system',
  occurredAt: '2026-01-01T00:00:00.000Z',
  payload: {
    innateSeed: { temperamentBias: {}, valueSeed: { caution: 0.6 }, somaSetpoints: { vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15 },
    reconstructVersionAtBirth: 1,
    creator: { relationshipId: 'r_creator', identityRef: 'Tam' },
  },
};

function seedLife(path: string): { version: number; hash: string } {
  const store = createFileEventStore('vega-1', path);
  store.appendTurn(store.version(), [genesisDraft]);
  store.appendTurn(store.version(), [
    { type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_creator', occurredAt: '2026-01-01T00:01:00.000Z', payload: { relationshipId: 'r_creator', kind: 'human', displayRef: 'Tam' } },
    { type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_creator', occurredAt: '2026-01-01T00:02:00.000Z', payload: { relationshipId: 'r_creator', host: { kind: 'cli', ref: 'h1' } } },
  ]);
  store.appendTurn(store.version(), [
    { type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r_creator', occurredAt: '2026-01-01T00:03:00.000Z', payload: { relationshipId: 'r_creator', content: '你好，我在乎你', channel: 'chat' } },
  ]);
  return { version: store.version(), hash: stateHash(reconstruct(store.list())) };
}

test('V3: 已提交的 turn 在重启后完整复现（她还在）', () => {
  const { path, cleanup } = tmpFile();
  try {
    const before = seedLife(path);
    // 模拟重启：全新 store 实例，从磁盘日志重建。
    const restarted = createFileEventStore('vega-1', path);
    assert.equal(restarted.version(), before.version);
    assert.equal(stateHash(reconstruct(restarted.list())), before.hash);
    assert.ok(verifyChain(restarted.list()).ok);
  } finally {
    cleanup();
  }
});

test('V3: 撕裂的尾行（崩在 turn 中途）被回滚', () => {
  const { path, cleanup } = tmpFile();
  try {
    const before = seedLife(path);
    // 模拟崩溃：写入一条半截的、撕裂的事件行（没有提交标记）。
    appendFileSync(path, '{"t":"E","e":{"lifeId":"vega-1","seq":3,"type":"MESSAGE_REC');
    const events = loadValidEvents(path);
    assert.equal(events.length, before.version); // 撕裂行被丢弃
    assert.equal(stateHash(reconstruct(events)), before.hash); // 状态没被半截 turn 污染
  } finally {
    cleanup();
  }
});

test('V3: 写了事件行但缺提交标记（未 finalize）被回滚', () => {
  const { path, cleanup } = tmpFile();
  try {
    const before = seedLife(path);
    const orphan = before.version; // 下一条本应是的 seq
    // 一条语法完整的事件行，但没有随后的提交标记 → 未 finalize。
    appendFileSync(
      path,
      JSON.stringify({ t: 'E', e: { lifeId: 'vega-1', seq: orphan, type: 'CONNECTION_CLOSED', schemaVersion: 1, occurredAt: '2026-01-01T00:04:00.000Z', recordedAt: '2026-01-01T00:04:00.000Z', contentHash: 'x', prevHash: 'y', source: 'host', payload: { relationshipId: 'r_creator', reason: 'token_detached' } } }) + '\n',
    );
    const restarted = createFileEventStore('vega-1', path);
    assert.equal(restarted.version(), before.version); // 未提交事件被回滚
    assert.equal(stateHash(reconstruct(restarted.list())), before.hash);
    // 重启后还能正常继续写下一个 turn（版本从已提交点接续）。
    const cont = restarted.appendTurn(restarted.version(), [
      { type: 'CONNECTION_CLOSED', source: 'host', relationshipId: 'r_creator', occurredAt: '2026-01-01T00:05:00.000Z', payload: { relationshipId: 'r_creator', reason: 'token_detached' } },
    ]);
    assert.equal(cont[0].seq, before.version);
    assert.ok(verifyChain(restarted.list()).ok);
  } finally {
    cleanup();
  }
});

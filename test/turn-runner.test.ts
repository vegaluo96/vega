import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileEventStore, runTurn, runMessageTurn, type EventDraft } from '../src/index.ts';

function tmpFile(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'vega-turn-'));
  return { path: join(dir, 'log.jsonl'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const genesisDraft: EventDraft<'LIFE_GENESIS'> = {
  type: 'LIFE_GENESIS',
  source: 'system',
  occurredAt: '2026-01-01T00:00:00.000Z',
  payload: {
    innateSeed: {
      temperamentBias: {},
      valueSeed: { caution: 0.6 },
      somaSetpoints: { vitality: 0.7 },
      somaTau: {},
      vitalityFloor: 0.15,
    },
    reconstructVersionAtBirth: 1,
    creator: { relationshipId: 'r_creator', identityRef: 'Tam' },
  },
};

test('turn-runner: 事务化追加 + 版本递增 + 快照重建', () => {
  const { path, cleanup } = tmpFile();
  try {
    const store = createFileEventStore('vega-1', path);
    const g = runTurn(store, [genesisDraft]);
    assert.equal(g.version, 1);

    // 一个 turn 多事件（关系 + 连接）原子提交
    const t2 = runTurn(store, [
      { type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_creator', occurredAt: '2026-01-01T00:01:00.000Z', payload: { relationshipId: 'r_creator', kind: 'human', displayRef: 'Tam' } },
      { type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_creator', occurredAt: '2026-01-01T00:02:00.000Z', payload: { relationshipId: 'r_creator', host: { kind: 'cli', ref: 'h1' } } },
    ]);
    assert.equal(t2.version, 3);
    assert.equal(t2.snapshot.awake, true);

    const t3 = runMessageTurn(store, 'r_creator', '你好', '2026-01-01T00:03:00.000Z');
    assert.equal(t3.version, 5); // +2 事件（received + sent 审计）
    assert.equal(t3.events.length, 2);
    assert.equal(t3.snapshot.bonds['r_creator'].trust > 0.1, true);
  } finally {
    cleanup();
  }
});

test('乐观锁：stale expectedVersion 提交冲突即抛', () => {
  const { path, cleanup } = tmpFile();
  try {
    const store = createFileEventStore('vega-1', path);
    runTurn(store, [genesisDraft]);
    const stale = store.version(); // 读到旧版本
    store.appendTurn(stale, [
      { type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r', occurredAt: '2026-01-01T00:01:00.000Z', payload: { relationshipId: 'r', host: { kind: 'k', ref: 'r' } } },
    ]);
    // 用同一个（已过期的）版本号再提交 → 冲突
    assert.throws(
      () =>
        store.appendTurn(stale, [
          { type: 'CONNECTION_CLOSED', source: 'host', relationshipId: 'r', occurredAt: '2026-01-01T00:02:00.000Z', payload: { relationshipId: 'r', reason: 'token_detached' } },
        ]),
      /optimistic lock conflict/,
    );
  } finally {
    cleanup();
  }
});

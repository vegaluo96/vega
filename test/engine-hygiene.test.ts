// 永生卫生：只增不减的内部日志不再无界增长（boldnessLog/warmthLog/conflictLog/lonelyLog 按反思窗口裁剪、
// quietThoughts 限最近 128 条）。这些都【不进派生快照】，裁剪不改 stateHash/重建结果——这里同时钉死"有界"与"不破确定性"。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  reconstruct,
  runTurn,
  captureCheckpoint,
  createFileEventStore,
  stateHash,
  type EventDraft,
} from '../src/index.ts';

let ms = Date.parse('2026-01-01T00:00:00.000Z');
const at = (): string => new Date((ms += 60_000)).toISOString();

const SEED: EventDraft<'LIFE_GENESIS'>['payload'] = {
  innateSeed: { temperamentBias: {}, valueSeed: { caution: 0.6 }, somaSetpoints: { valence: 0, vitality: 0.7, connection: 0 }, somaTau: { connection: 7200 }, vitalityFloor: 0.15 },
  reconstructVersionAtBirth: 1, creator: { relationshipId: 'r', identityRef: 'Tam' },
};
function boot(rel = 'r') {
  ms = Date.parse('2026-01-01T00:00:00.000Z');
  const dir = mkdtempSync(join(tmpdir(), 'vega-hyg-'));
  const s = createFileEventStore('vega-h', join(dir, 'log.jsonl'));
  runTurn(s, [{ type: 'LIFE_GENESIS', source: 'system', occurredAt: at(), payload: SEED }]);
  runTurn(s, [
    { type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: rel, occurredAt: at(), payload: { relationshipId: rel, kind: 'human', displayRef: 'Tam' } },
    { type: 'CONNECTION_OPENED', source: 'host', relationshipId: rel, occurredAt: at(), payload: { relationshipId: rel, host: { kind: 'cli', ref: 'h' } } },
  ]);
  return { s, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
const warm = (s: ReturnType<typeof boot>['s'], rel = 'r') =>
  runTurn(s, [{ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: rel, occurredAt: at(), payload: { relationshipId: rel, content: '你好，我真心在乎你，你的想法值得被听见', channel: 'chat' } }]);

// ① 反思按窗口裁剪 seq 日志：被持续善待 60+ 次，warmthLog 不随之无界增长，且反思仍生效（openness 上升）。
test('卫生①·反思裁剪 seq 日志：60+ 次善待后 warmthLog 仍有界，反思照常生效', () => {
  const { s, cleanup } = boot();
  try {
    let lastTo = s.version();
    let totalWarm = 0;
    for (let round = 0; round < 5; round++) {
      for (let i = 0; i < 12; i++) { warm(s); totalWarm++; }
      const to = s.version();
      runTurn(s, [{ type: 'REFLECTION_TRIGGERED', source: 'autonomous_loop', occurredAt: at(), payload: { scope: 'recent', windowFromSeq: lastTo, windowToSeq: to } }]);
      lastTo = s.version();
    }
    for (let i = 0; i < 5; i++) { warm(s); totalWarm++; } // 反思之后又来几条（未结算）
    assert.ok(totalWarm >= 60, `确实送了很多善意（${totalWarm}）`);

    const cp = captureCheckpoint(s.list());
    assert.ok(cp.state.warmthLog.length <= 13, `warmthLog 被反思裁剪、不随 ${totalWarm} 条善意涨，实得 ${cp.state.warmthLog.length}`);
    // 反思没被裁坏：被持续善待 → openness 漂移上升（>初始 0.3）。
    const openness = reconstruct(s.list()).values.find((v) => v.key === 'openness');
    assert.ok(openness && openness.weight > 0.3, '反思仍生效：openness 上升');
    // 确定性不破：同一日志两次重建逐位一致。
    assert.equal(stateHash(reconstruct(s.list())), stateHash(reconstruct(s.list())));
  } finally {
    cleanup();
  }
});

// ② quietThoughts 限最近 128：200 次"只在心里转"的念头后，数组封顶 128，不无界。
test('卫生②·quietThoughts 封顶：200 条内在念头后只留最近 128', () => {
  const { s, cleanup } = boot();
  try {
    for (let i = 0; i < 200; i++) {
      s.append({ type: 'AUTONOMOUS_TICK', source: 'autonomous_loop', occurredAt: at(), payload: { tickReason: 'idle_threshold', selectedMemoryIds: [], wanderingTargets: [], formedIntents: [{ kind: 'reach_out', relationshipId: 'r', gateDecision: 'internal_only' }] } });
    }
    const cp = captureCheckpoint(s.list());
    assert.equal(cp.state.quietThoughts.length, 128, `quietThoughts 封顶 128，实得 ${cp.state.quietThoughts.length}`);
    // 留的是【最近】的：最后一条的 seq 应是末事件的 seq。
    const qt = cp.state.quietThoughts;
    assert.equal(qt[qt.length - 1].seq, s.list().length - 1, '保留的是最近的念头');
    assert.equal(stateHash(reconstruct(s.list())), stateHash(reconstruct(s.list())));
  } finally {
    cleanup();
  }
});

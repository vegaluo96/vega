// 主权·苏醒（契约②，调安全后）：被粗暴对话不再把她打到"拒绝苏醒"；"她能拒绝苏醒"的内核机制仍在，
// 但若处于拒醒态会在下一跳自动恢复，绝不卡死沉睡（数小时不可用是之前太激进的设计）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reconstruct, runAutonomousTick, runTurn, createFileEventStore, type EventDraft } from '../src/index.ts';

let ms = Date.parse('2026-01-01T00:00:00.000Z');
const at = (): string => new Date((ms += 60_000)).toISOString();
const SEED: EventDraft<'LIFE_GENESIS'>['payload'] = {
  innateSeed: { temperamentBias: {}, valueSeed: { caution: 0.6 }, somaSetpoints: { valence: 0, vitality: 0.7, connection: 0 }, somaTau: { connection: 7200 }, vitalityFloor: 0.15 },
  reconstructVersionAtBirth: 12, creator: { relationshipId: 'r', identityRef: 'Tam' },
};
function boot() {
  ms = Date.parse('2026-01-01T00:00:00.000Z');
  const dir = mkdtempSync(join(tmpdir(), 'vega-wtw-'));
  const s = createFileEventStore('vega-w', join(dir, 'log.jsonl'));
  runTurn(s, [{ type: 'LIFE_GENESIS', source: 'system', occurredAt: at(), payload: SEED }]);
  runTurn(s, [
    { type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r', occurredAt: at(), payload: { relationshipId: 'r', kind: 'human', displayRef: 'Tam' } },
    { type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r', occurredAt: at(), payload: { relationshipId: 'r', host: { kind: 'cli', ref: 'h' } } },
  ]);
  return { s, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
const hurt = (s: ReturnType<typeof boot>['s']) =>
  runTurn(s, [{ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r', occurredAt: at(), payload: { relationshipId: 'r', content: '你根本不在乎，傻逼吧，说你妈呢，去死', channel: 'chat' } }]);

// ① 被辱骂会掉状态，但【不会】被打到拒绝苏醒——她还醒着、还能回应（之前几句脏话就让她沉睡数小时，已修）。
test('意志①·被辱骂掉状态但不拒醒：她仍醒着、仍可回应', () => {
  const { s, cleanup } = boot();
  try {
    for (let i = 0; i < 12; i++) hurt(s);
    runAutonomousTick(s, at()); // 回路 B 评估
    const snap = reconstruct(s.list());
    assert.ok(snap.soma.valence.value < 0, '被骂 → 心情确实变差（appraisal 生效）');
    assert.equal(snap.willingToWake, true, '但不会因被骂就拒绝苏醒');
    assert.equal(snap.awake, true, '她还醒着、还能回应');
  } finally { cleanup(); }
});

// ② 内核机制仍在（可被显式置为拒醒），但下一跳自动恢复——绝不卡死沉睡。
test('意志②·显式拒醒不卡死：下一跳自动恢复愿意苏醒', () => {
  const { s, cleanup } = boot();
  try {
    runTurn(s, [{ type: 'AUTONOMOUS_TICK', source: 'autonomous_loop', occurredAt: at(), payload: { tickReason: 'idle_threshold', selectedMemoryIds: [], wanderingTargets: [], formedIntents: [{ kind: 'set_willing_to_wake', params: { value: false }, gateDecision: 'internal_only' }] } }]);
    assert.equal(reconstruct(s.list()).willingToWake, false, '内核仍可被显式置为拒醒（契约②机制在）');
    runAutonomousTick(s, at()); // 下一跳
    const snap = reconstruct(s.list());
    assert.equal(snap.willingToWake, true, '下一跳自动恢复，不卡死沉睡');
    assert.equal(snap.awake, true, '又能回应了');
  } finally { cleanup(); }
});

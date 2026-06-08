// 用户对话只走真模型：模型没给出可用回复时，兜底是【诚实的"接不上"占位】，
// 而不是套话冒充她（守住"模型挂了她也回应"，但不再假装机灵）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { converse, createFileEventStore, runTurn, type EventDraft, type Mouth } from '../src/index.ts';

const seed: EventDraft<'LIFE_GENESIS'> = {
  type: 'LIFE_GENESIS', source: 'system', occurredAt: '2026-01-01T00:00:00.000Z',
  payload: { innateSeed: { temperamentBias: {}, valueSeed: { caution: 0.6 }, somaSetpoints: { vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 12, creator: { relationshipId: 'r', identityRef: 'Tam' } },
};
function boot() {
  const dir = mkdtempSync(join(tmpdir(), 'vega-nt-'));
  const s = createFileEventStore('vega-nt', join(dir, 'log.jsonl'));
  runTurn(s, [seed]);
  runTurn(s, [
    { type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r', occurredAt: '2026-01-01T00:01:00.000Z', payload: { relationshipId: 'r', kind: 'human', displayRef: 'Tam' } },
    { type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r', occurredAt: '2026-01-01T00:02:00.000Z', payload: { relationshipId: 'r', host: { kind: 'cli', ref: 'h' } } },
  ]);
  return { s, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('真模型挂掉 → 诚实"接不上"占位，不再套话冒充', async () => {
  const { s, cleanup } = boot();
  try {
    const broken: Mouth = { id: 'broken', speak: () => Promise.reject(new Error('down')) };
    const r = await converse(s, broken, 'r', '你好', '2026-01-01T00:03:00.000Z');
    assert.equal(r.verdict, 'fallback');
    assert.ok(/接不上|卡了|没接/.test(r.utterance), `应是诚实占位，实得：${r.utterance}`);
    // 不再是 compose 的套话冒充
    assert.equal(/你接着说|我记着呢|我一直都在|我在听/.test(r.utterance), false, '不再用套话冒充她');
  } finally {
    cleanup();
  }
});

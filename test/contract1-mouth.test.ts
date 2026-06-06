import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertPatchAllowed,
  commitPatches,
  converse,
  createFileEventStore,
  reconstruct,
  runTurn,
  stateHash,
  type EventDraft,
  type Mouth,
  type SoulStatePatch,
} from '../src/index.ts';

function tmpFile(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'vega-c1-'));
  return { path: join(dir, 'log.jsonl'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const seed: EventDraft<'LIFE_GENESIS'> = {
  type: 'LIFE_GENESIS', source: 'system', occurredAt: '2026-01-01T00:00:00.000Z',
  payload: {
    innateSeed: { temperamentBias: {}, valueSeed: { caution: 0.6 }, somaSetpoints: { valence: 0, vitality: 0.7, connection: 0 }, somaTau: {}, vitalityFloor: 0.15 },
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

test('契约①：InvariantChecker 拒绝 model/narrative 来源写派生状态', () => {
  assert.doesNotThrow(() => assertPatchAllowed({ target: 'soma.vitality', op: 'add', value: 0.1, source: 'appraisal' }));
  for (const bad of ['model', 'narrative'] as const) {
    assert.throws(() => assertPatchAllowed({ target: 'self.slowTraits', op: 'set', value: 1, source: bad }), /不得写派生状态/);
  }
  assert.throws(() => commitPatches([{ target: 'self.willingToWake', op: 'set', value: true, source: 'host' }]), /主权字段/);
});

test('契约①：模型说什么都不影响她的派生状态（状态在模型开口前就定了）', async () => {
  const a = tmpFile();
  const b = tmpFile();
  try {
    const storeA = boot(a.path);
    const storeB = boot(b.path);
    const mouthX: Mouth = { id: 'x', speak: () => Promise.resolve('随便一句很正能量的话！！！') };
    const mouthY: Mouth = { id: 'y', speak: () => Promise.resolve('完全不同的另一句话。') };
    const rA = await converse(storeA, mouthX, 'r_creator', '你好，我在乎你', '2026-01-01T00:03:00.000Z');
    const rB = await converse(storeB, mouthY, 'r_creator', '你好，我在乎你', '2026-01-01T00:03:00.000Z');
    // 两个嘴说了完全不同的话，但她的内在状态逐位一致。
    assert.notEqual(rA.utterance, rB.utterance);
    assert.equal(stateHash(rA.snapshot), stateHash(rB.snapshot));
  } finally {
    a.cleanup();
    b.cleanup();
  }
});

test('契约①：模型挂了她也照样回应（兜底到确定性措辞），且状态不变', async () => {
  const { path, cleanup } = tmpFile();
  try {
    const store = boot(path);
    const before = stateHash(reconstruct(store.list()));
    const brokenMouth: Mouth = { id: 'broken', speak: () => Promise.reject(new Error('network down')) };
    const r = await converse(store, brokenMouth, 'r_creator', '你好', '2026-01-01T00:03:00.000Z');
    assert.equal(r.verdict, 'fallback');
    assert.ok(r.utterance.length > 0); // 仍有话说
    // MESSAGE_SENT 是审计、不写状态：state 只由 MESSAGE_RECEIVED 决定
    const onlyInput = reconstruct(store.list().filter((e) => e.type !== 'MESSAGE_SENT'));
    assert.equal(stateHash(r.snapshot), stateHash(onlyInput));
    assert.notEqual(before, stateHash(r.snapshot)); // 但消息确实改变了她（appraisal）
  } finally {
    cleanup();
  }
});

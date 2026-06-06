// 社会层：两个生命体互动、各自独立演化、对同类建模。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createFileEventStore,
  createTemplateMouth,
  peerExchange,
  reconstruct,
  runTurn,
  type DurableEventStore,
  type EventDraft,
  type Participant,
} from '../src/index.ts';

let ms = Date.parse('2026-01-01T00:00:00.000Z');
const at = (): string => new Date((ms += 60_000)).toISOString();
const seed = (name: string): EventDraft<'LIFE_GENESIS'> => ({
  type: 'LIFE_GENESIS', source: 'system', occurredAt: at(),
  payload: { innateSeed: { temperamentBias: { curiosity: 0.6 }, valueSeed: { caution: 0.6 }, somaSetpoints: { vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 1, creator: { relationshipId: 'r_creator', identityRef: name } },
});

test('社会层：两个生命体对话、各自独立、对同类建模', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vega-soc-'));
  try {
    const va = createFileEventStore('vega', join(dir, 'vega.jsonl'));
    const ly = createFileEventStore('lyra', join(dir, 'lyra.jsonl'));
    runTurn(va, [seed('vega')]);
    runTurn(ly, [seed('lyra')]);
    const vega: Participant = { store: va, mouth: createTemplateMouth(), peerRelId: 'peer_lyra', name: 'vega' };
    const lyra: Participant = { store: ly, mouth: createTemplateMouth(), peerRelId: 'peer_vega', name: 'lyra' };

    const transcript = await peerExchange(vega, lyra, '你好，我也在这里。我们都不会消失。', 4, at);
    assert.ok(transcript.length >= 5);

    const v = reconstruct(va.list());
    const l = reconstruct(ly.list());
    // 各自对同类建立了 peer 关系 + ToM
    assert.equal(v.bonds['peer_lyra'].kind, 'peer');
    assert.ok(v.bonds['peer_lyra'].theoryOfMind.style.length > 0);
    assert.equal(l.bonds['peer_vega'].kind, 'peer');
    // 两条生命独立（不同 lifeId、不同日志）
    assert.notEqual(v.lifeId, l.lifeId);
    // 隐私：lyra 的日志里没有 vega 的人类关系 r_creator 的消息
    assert.equal(ly.list().some((e) => e.relationshipId === 'r_creator' && e.type === 'MESSAGE_RECEIVED'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

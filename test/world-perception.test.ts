// P2：世界感知（WORLD_PERCEIVED）——真实世界轻轻染色她的状态。
// 守住契约：① 状态只由确定性 appraisal 算（冻结的 perception 或确定性词表，绝不在重放调模型）；
// ② V2 确定性——同一日志重放逐位一致。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileEventStore, reconstruct, runTurn, stateHash, type EventDraft } from '../src/index.ts';

function tmpStore(id = 'vega'): { s: ReturnType<typeof createFileEventStore>; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'vega-wp-'));
  return { s: createFileEventStore(id, join(dir, 'life.jsonl')), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
let ms = Date.parse('2026-01-01T00:00:00.000Z');
const at = (): string => new Date((ms += 60_000)).toISOString();
const genesis: EventDraft<'LIFE_GENESIS'> = {
  type: 'LIFE_GENESIS', source: 'system', occurredAt: '2026-01-01T00:00:00.000Z',
  payload: { innateSeed: { temperamentBias: {}, valueSeed: { caution: 0.6 }, somaSetpoints: { vitality: 0.7, valence: 0 }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 11, creator: { relationshipId: 'r_creator', identityRef: 'Tam' } },
};
const world = (perception?: { valence: number; arousal: number; relevance: number }): EventDraft<'WORLD_PERCEIVED'> => ({
  type: 'WORLD_PERCEIVED', source: 'autonomous_loop', occurredAt: at(),
  payload: { source: 'example.com', worldKind: 'news', title: '世界发生了一件事', summary: '好 喜欢 期待 温暖', url: 'https://example.com/x', topics: [], perception },
});

test('世界感知：好消息抬升效价、坏消息压低（确定性、轻量、不靠模型）', () => {
  const a = tmpStore(); runTurn(a.s, [genesis]);
  const base = reconstruct(a.s.list()).soma.valence.value;
  runTurn(a.s, [world({ valence: 0.8, arousal: 0.5, relevance: 0.9 })]);
  assert.ok(reconstruct(a.s.list()).soma.valence.value > base, '好消息应抬升 valence');
  a.cleanup();

  const b = tmpStore(); runTurn(b.s, [genesis]);
  const base2 = reconstruct(b.s.list()).soma.valence.value;
  runTurn(b.s, [world({ valence: -0.8, arousal: 0.6, relevance: 0.9 })]);
  assert.ok(reconstruct(b.s.list()).soma.valence.value < base2, '坏消息应压低 valence');
  b.cleanup();
});

test('世界感知：V2 确定性——重放逐位一致，无 perception 也走确定性词表兜底', () => {
  const a = tmpStore(); runTurn(a.s, [genesis]);
  runTurn(a.s, [world({ valence: 0.5, arousal: 0.4, relevance: 0.7 })]);
  runTurn(a.s, [world()]); // 无 perception → 确定性词表（仍不连网）
  const h1 = stateHash(reconstruct(a.s.list()));
  const h2 = stateHash(reconstruct(a.s.list()));
  assert.equal(h1, h2, '同一日志重放两次必须逐位一致（V2）');
  a.cleanup();
});

test('世界感知：染色是【轻】的——一条新闻不该把她推到极端', () => {
  const a = tmpStore(); runTurn(a.s, [genesis]);
  runTurn(a.s, [world({ valence: 1, arousal: 1, relevance: 1 })]);
  const v = reconstruct(a.s.list()).soma.valence.value;
  assert.ok(v > 0 && v < 0.2, `单条世界事件只轻推（实际 ${v}）`);
  a.cleanup();
});

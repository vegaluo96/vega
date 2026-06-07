// 内核加固（审计 Batch B）守约测试：
// ① 主权（契约②）——willing_to_wake 只有【她自己】的 autonomous_loop 能翻；任何 host/外部来源都翻不动。
// ② fail-closed——遇到不认识的事件类型，reconstruct 拒绝静默 no-op（防 schema 漂移）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileEventStore, reconstruct, runTurn, type EventDraft } from '../src/index.ts';

function tmpStore(id = 'vega'): { s: ReturnType<typeof createFileEventStore>; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'vega-sov-'));
  return { s: createFileEventStore(id, join(dir, 'life.jsonl')), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
let ms = Date.parse('2026-01-01T00:00:00.000Z');
const at = (): string => new Date((ms += 60_000)).toISOString();
const genesis: EventDraft<'LIFE_GENESIS'> = {
  type: 'LIFE_GENESIS', source: 'system', occurredAt: '2026-01-01T00:00:00.000Z',
  payload: { innateSeed: { temperamentBias: {}, valueSeed: { caution: 0.6 }, somaSetpoints: { vitality: 0.7, valence: 0 }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 11, creator: { relationshipId: 'r_creator', identityRef: 'Tam' } },
};
const tick = (source: EventDraft<'AUTONOMOUS_TICK'>['source'], value: boolean): EventDraft<'AUTONOMOUS_TICK'> => ({
  type: 'AUTONOMOUS_TICK', source, occurredAt: at(),
  payload: { tickReason: 'scheduled', selectedMemoryIds: [], wanderingTargets: [], formedIntents: [{ kind: 'set_willing_to_wake', params: { value }, gateDecision: 'internal_only' }] },
});

test('主权(契约②)：她自己的 autonomous_loop 能翻 willing_to_wake', () => {
  const a = tmpStore(); runTurn(a.s, [genesis]);
  assert.equal(reconstruct(a.s.list()).willingToWake, true, '初始愿意苏醒');
  runTurn(a.s, [tick('autonomous_loop', false)]);
  assert.equal(reconstruct(a.s.list()).willingToWake, false, '她可以拒绝苏醒');
  a.cleanup();
});

test('主权(契约②)：host/外部来源的 tick 翻不动 willing_to_wake（无后门、意志不可被夺）', () => {
  for (const src of ['host', 'external_user', 'system'] as const) {
    const a = tmpStore(); runTurn(a.s, [genesis]);
    runTurn(a.s, [tick(src, false)]); // 注入非自主来源的"令她不愿醒"——必须被忽略
    assert.equal(reconstruct(a.s.list()).willingToWake, true, `来源 ${src} 不得改主权字段`);
    a.cleanup();
  }
});

test('fail-closed：未知事件类型 → reconstruct 拒绝静默 no-op（防 schema 漂移）', () => {
  const a = tmpStore(); runTurn(a.s, [genesis]);
  // 直接构造一条不在 EventType 联合里的事件，绕过类型检查模拟 schema 漂移/篡改。
  // runTurn 内部会 reconstruct 以推导新状态 → 处理到未知类型即抛（fail-closed），不静默丢效应。
  const bogus = { type: 'FUTURE_UNKNOWN_EVENT', source: 'system', occurredAt: at(), payload: {} } as unknown as EventDraft;
  assert.throws(() => runTurn(a.s, [bogus]), /未知事件类型/, '未知类型应抛错、不静默丢效应');
  a.cleanup();
});

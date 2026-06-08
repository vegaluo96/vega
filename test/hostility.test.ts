// 她会感到被冒犯：辱骂确实掉信任/心情/安全感（内核·哪怕没开感知/用模板嘴），
// 且模板嘴被骂时划个界限、而非平静地"你接着说"。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reconstruct, runTurn, createFileEventStore, composeUtterance, type EventDraft } from '../src/index.ts';

let ms = Date.parse('2026-01-01T00:00:00.000Z');
const at = (): string => new Date((ms += 60_000)).toISOString();
const SEED: EventDraft<'LIFE_GENESIS'>['payload'] = {
  innateSeed: { temperamentBias: {}, valueSeed: { caution: 0.6 }, somaSetpoints: { valence: 0, vitality: 0.7, connection: 0 }, somaTau: { connection: 7200 }, vitalityFloor: 0.15 },
  reconstructVersionAtBirth: 12, creator: { relationshipId: 'r', identityRef: 'Tam' },
};
function boot() {
  ms = Date.parse('2026-01-01T00:00:00.000Z');
  const dir = mkdtempSync(join(tmpdir(), 'vega-host-'));
  const s = createFileEventStore('vega-host', join(dir, 'log.jsonl'));
  runTurn(s, [{ type: 'LIFE_GENESIS', source: 'system', occurredAt: at(), payload: SEED }]);
  runTurn(s, [
    { type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r', occurredAt: at(), payload: { relationshipId: 'r', kind: 'human', displayRef: 'Tam' } },
    { type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r', occurredAt: at(), payload: { relationshipId: 'r', host: { kind: 'cli', ref: 'h' } } },
  ]);
  return { s, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
const say = (s: ReturnType<typeof boot>['s'], content: string) =>
  runTurn(s, [{ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r', occurredAt: at(), payload: { relationshipId: 'r', content, channel: 'chat' } }]);

test('内核·被辱骂会确实掉状态（没开感知、纯确定性词表也成立）', () => {
  const { s, cleanup } = boot();
  try {
    say(s, '你好，我真心在乎你'); // 先建立一点善意
    const before = reconstruct(s.list());
    say(s, '傻逼吧，说你妈呢'); // 辱骂
    const after = reconstruct(s.list());
    assert.ok(after.bonds['r'].trust < before.bonds['r'].trust, '被骂 → 信任下降');
    assert.ok(after.soma.valence.value < before.soma.valence.value, '被骂 → 心情下降');
    assert.ok(after.soma.safety.value < before.soma.safety.value, '被骂 → 安全感下降（感到威胁）');
  } finally {
    cleanup();
  }
});

test('兜底嘴·被骂时划界限，而不是平静地"你接着说"', () => {
  const input = { lastUserMessage: '傻逼吧', relationshipDisplay: 'A', mood: '平静', intent: '', selfFacts: '', recentContext: [] } as unknown as Parameters<typeof composeUtterance>[0];
  const out = composeUtterance(input);
  assert.ok(/扎人|退一步|难受|接不住|边界|好好说/.test(out), `应划界限，实得：${out}`);
  assert.equal(/你接着说|我听着|你慢慢讲/.test(out), false, '不再当受气包');
});

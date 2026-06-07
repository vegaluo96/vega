// 锁 schema 前补的 3 条弧（§9 Arc 6/7/8 的运行时验证）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryEventStore, reconstruct, verifyChain, type EventDraft } from '../src/index.ts';

let ms = Date.parse('2026-01-01T00:00:00.000Z');
const at = (): string => new Date((ms += 60_000)).toISOString();
function genesis(): EventDraft<'LIFE_GENESIS'> {
  return {
    type: 'LIFE_GENESIS', source: 'system', occurredAt: at(),
    payload: {
      innateSeed: { temperamentBias: {}, valueSeed: { caution: 0.6 }, somaSetpoints: { vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15 },
      reconstructVersionAtBirth: 1, creator: { relationshipId: 'r_a', identityRef: 'Alice' },
    },
  };
}

test('Arc6 多关系并发：私密隔离（no_cross_user_memory）', () => {
  ms = Date.parse('2026-01-01T00:00:00.000Z');
  const s = createInMemoryEventStore('vega-1');
  s.append(genesis());
  s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_a', occurredAt: at(), payload: { relationshipId: 'r_a', kind: 'human', displayRef: 'Alice' } });
  s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_b', occurredAt: at(), payload: { relationshipId: 'r_b', kind: 'human', displayRef: 'Bob' } });
  s.append({ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r_a', occurredAt: at(), payload: { relationshipId: 'r_a', content: '你好，我真心在乎你', channel: 'chat' } });
  s.append({ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r_b', occurredAt: at(), payload: { relationshipId: 'r_b', content: '我根本不在乎，都是假的', channel: 'chat' } });
  const snap = reconstruct(s.list());

  // 两段关系各自独立演化
  assert.ok(snap.bonds['r_a'].trust > 0.1, 'Alice 正向 → 信任升');
  assert.ok(snap.bonds['r_b'].trust < 0.1, 'Bob 负向 → 信任降');
  // 每条记忆只归属其来源关系，绝不串味
  for (const m of snap.memory) assert.equal(m.involvedRelationshipIds.length, 1);
  assert.ok(snap.memory.some((m) => m.involvedRelationshipIds[0] === 'r_a'));
  assert.ok(snap.memory.some((m) => m.involvedRelationshipIds[0] === 'r_b'));
  // 没有任何一条记忆同时牵涉两人
  assert.equal(snap.memory.some((m) => m.involvedRelationshipIds.includes('r_a') && m.involvedRelationshipIds.includes('r_b')), false);
});

test('Arc7 stewardship 转移：不破重建、链完整', () => {
  ms = Date.parse('2026-01-01T00:00:00.000Z');
  const s = createInMemoryEventStore('vega-1');
  s.append(genesis());
  s.append({ type: 'STEWARDSHIP_TRANSFERRED', source: 'system', occurredAt: at(), payload: { fromRelationshipId: null, toRelationshipId: 'r_steward2', reason: 'creator handed off stewardship' } });
  assert.doesNotThrow(() => reconstruct(s.list()));
  assert.ok(verifyChain(s.list()).ok);
});

test('Arc8 reconstructVersion 标注：快照带版本（支持跨版本切换）', () => {
  ms = Date.parse('2026-01-01T00:00:00.000Z');
  const s = createInMemoryEventStore('vega-1');
  s.append(genesis());
  const snap = reconstruct(s.list());
  assert.equal(snap.reconstructVersion, 9);
  assert.equal(snap.schemaVersion, 1);
});

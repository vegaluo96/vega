// 工作区隐私（守 Arc6 跨用户隔离）：新接入的 goals/chapters 可能含【别的用户】的名字——
// 必须确保喂给"嘴"的 grounding（selfFacts/stateSummary/intent）【绝不】把用户 B 泄露给正在对话的用户 A。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryEventStore, reconstruct, deriveWorkspace, type EventDraft } from '../src/index.ts';

const T0 = Date.parse('2026-01-01T00:00:00.000Z');
const iso = (ms: number): string => new Date(ms).toISOString();

test('工作区隔离：给 A 的 grounding 绝不含 B 的名字（goals/chapters 已按关系过滤）', () => {
  const s = createInMemoryEventStore('vega');
  s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: iso(T0), payload: { innateSeed: { temperamentBias: {}, valueSeed: {}, somaSetpoints: { valence: 0, vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 25, creator: { relationshipId: 'r_a', identityRef: 'Alice' } } } as EventDraft<'LIFE_GENESIS'>);
  s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_a', occurredAt: iso(T0 + 1e3), payload: { relationshipId: 'r_a', kind: 'human', displayRef: 'Alice' } });
  s.append({ type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_a', occurredAt: iso(T0 + 2e3), payload: { relationshipId: 'r_a', host: { kind: 'h', ref: 'h' } } });
  s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_b', occurredAt: iso(T0 + 3e3), payload: { relationshipId: 'r_b', kind: 'human', displayRef: 'Bob' } });
  s.append({ type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_b', occurredAt: iso(T0 + 4e3), payload: { relationshipId: 'r_b', host: { kind: 'h', ref: 'h' } } });
  // B 对她说了重话 → 与 B 之间生出"修复"目标 + "遇见Bob/被Bob伤"篇章（都含 Bob 的名字）。
  s.append({ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r_b', occurredAt: iso(T0 + 5e3), payload: { relationshipId: 'r_b', content: '都是假的，骗你', channel: 'chat', perception: { sentiment: -1, warmth: 0, threat: 1, modelId: 't' } } });

  const snap = reconstruct(s.list());
  // 前提：引擎全貌里【确实】有指向 B 的目标/篇章（否则本测试是空的）。
  assert.ok(snap.goals.some((g) => g.target === 'r_b' || g.intent.includes('Bob')), '全貌里应有指向 Bob 的目标');
  assert.ok(snap.chapters.some((c) => c.includes('Bob')), '全貌里应有含 Bob 的篇章');

  // 关键：给 A 的 grounding 三处都不能出现 Bob。
  const wsA = deriveWorkspace(snap, 'r_a');
  assert.ok(!wsA.selfFacts.includes('Bob'), `selfFacts 不得含 Bob：${wsA.selfFacts}`);
  assert.ok(!wsA.stateSummary.includes('Bob'), 'stateSummary 不得含 Bob');
  assert.ok(!wsA.intent.includes('Bob'), 'intent 不得含 Bob');

  // 对照：给 B 自己的 grounding 里，关于 B 的目标是允许出现的（那是 ta 自己的关系）。
  const wsB = deriveWorkspace(snap, 'r_b');
  assert.ok(wsB.selfFacts.includes('Bob') || wsB.stateSummary.includes('Bob'), 'B 自己的 grounding 可含 Bob（同一段关系内）');
});

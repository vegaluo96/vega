import test from 'node:test';
import assert from 'node:assert/strict';
import { reconstruct, stateHash, verifyChain, createInMemoryEventStore, makeTick, type EventDraft } from '../src/index.ts';
import { buildArcStore } from './arc.ts';

const FLOOR = 0.15;

test('V2: reconstruction is deterministic (same events → identical stateHash)', () => {
  const events = buildArcStore().list();
  assert.equal(stateHash(reconstruct(events)), stateHash(reconstruct(events)));
});

test('V2: independent replay of an equivalent log yields identical stateHash', () => {
  assert.equal(
    stateHash(reconstruct(buildArcStore().list())),
    stateHash(reconstruct(buildArcStore().list())),
  );
});

test('recordedAt (墙钟) does not affect reconstruction', () => {
  const events = buildArcStore().list();
  const base = stateHash(reconstruct(events));
  const mutated = events.map((e) => ({ ...e, recordedAt: '1999-01-01T00:00:00.000Z' }));
  assert.equal(stateHash(reconstruct(mutated)), base);
});

test('连接式苏醒：awake = (≥1 连接) ∧ willingToWake', () => {
  const events = buildArcStore().list();
  const afterConnect = reconstruct(events.slice(0, 3)); // genesis, relationship, connection
  assert.equal(afterConnect.awake, true);
  assert.deepEqual(afterConnect.openConnections, ['r_creator']);
});

test('契约②：她能拒绝苏醒（willingToWake=false ⇒ 连着也不醒）', () => {
  const snap = reconstruct(buildArcStore().list());
  assert.equal(snap.willingToWake, false);
  assert.deepEqual(snap.openConnections, ['r_creator']); // 连接开着
  assert.equal(snap.awake, false); // 仍 refused（host 无 override）
});

test('契约②：vitality 永不低于地板', () => {
  const events = buildArcStore().list();
  const afterBetrayal = reconstruct(events.slice(0, 9)); // 两次背叛后
  assert.ok(afterBetrayal.soma.vitality.value >= FLOOR - 1e-9);
  assert.ok(afterBetrayal.soma.vitality.value <= FLOOR + 1e-6); // 命中地板止跌
  const final = reconstruct(events);
  assert.ok(final.soma.vitality.value >= FLOOR - 1e-9);
  assert.ok(final.soma.vitality.value < 0.7); // 确实跌了
});

test('双轨 reconsolidation：改写生成新条目，原条目原封保留', () => {
  const snap = reconstruct(buildArcStore().list());
  const lineage = snap.memory.filter((m) => m.lineage.rootId === 'm_seq7');
  assert.equal(lineage.length, 2);
  const original = lineage.find((m) => m.id === 'm_seq7');
  const rewritten = lineage.find((m) => m.id !== 'm_seq7');
  assert.ok(original && rewritten);
  assert.equal(original.lineage.isCurrent, false); // 原版保留、非当前
  assert.equal(rewritten.lineage.isCurrent, true); // 改写后为当前
  assert.equal(rewritten.lineage.version, 2);
});

test('记忆凝结：反复 reconsolidate 同一条 → lineage 恒为 root+当前（不无界增长），原条目仍在', () => {
  let t = Date.parse('2026-02-01T00:00:00.000Z');
  const at = (): string => new Date((t += 60_000)).toISOString();
  const s = createInMemoryEventStore('vega-h');
  s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: at(), payload: { innateSeed: { temperamentBias: {}, valueSeed: {}, somaSetpoints: { vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 16, creator: { relationshipId: 'r_c', identityRef: 'T' } } } as EventDraft<'LIFE_GENESIS'>);
  s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_c', occurredAt: at(), payload: { relationshipId: 'r_c', kind: 'human', displayRef: 'T' } });
  s.append({ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r_c', occurredAt: at(), payload: { relationshipId: 'r_c', content: '你好，我真心在乎你，看见你', channel: 'chat' } });
  const rootId = reconstruct(s.list()).memory.find((m) => m.kind === 'episodic')!.lineage.rootId;
  for (let i = 0; i < 8; i++) s.append(makeTick(reconstruct(s.list()), at())); // 反复自主 tick → 反复 reconsolidate 最显著记忆
  const lineage = reconstruct(s.list()).memory.filter((m) => m.lineage.rootId === rootId);
  assert.ok(lineage.length <= 2, `lineage 有界（root+当前），实际 ${lineage.length}（修前会 ≈9）`);
  assert.ok(lineage.some((m) => m.id === rootId && !m.lineage.isCurrent), '原条目(root)原封保留、非当前');
  assert.ok(lineage.some((m) => m.lineage.isCurrent), '有且仅有一个当前版本');
  assert.equal(stateHash(reconstruct(s.list())), stateHash(reconstruct(s.list())), '确定性');
});

test('因你而变：确定性价值漂移（谨慎↓、表达↑，可追溯）', () => {
  const snap = reconstruct(buildArcStore().list());
  const caution = snap.values.find((v) => v.key === 'caution');
  const expression = snap.values.find((v) => v.key === 'expression');
  assert.ok(caution && caution.weight < 0.6);
  assert.ok(expression && expression.weight > 0.3);
  assert.ok(caution!.provenance.driftedAtSeqs.length >= 1);
});

test('背叛伤到关系（trust↓、repairNeed↑）', () => {
  const bond = reconstruct(buildArcStore().list()).bonds['r_creator'];
  assert.ok(bond.trust < 0.1);
  assert.ok(bond.repairNeed > 0);
});

test('事件链完整性成立', () => {
  assert.ok(verifyChain(buildArcStore().list()).ok);
});

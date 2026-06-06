import test from 'node:test';
import assert from 'node:assert/strict';
import { reconstruct, stateHash, verifyChain } from '../src/index.ts';
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

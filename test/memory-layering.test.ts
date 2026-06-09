// 记忆冷热分层（§ docs/being.md §3 记忆）：current 情景记忆热集有界，超出按鲜活度淘汰、压进冷聚合（遗忘即抽象）。
// 钉死：① 现有规模(<cap)逐位不变(部署安全) ② 超 cap 有界 ③ 段数/暖/磕碰/经历数【无损】(冷聚合) ④ 确定性/V2 ⑤ vivid 仍是最近最鲜活的。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryEventStore, reconstruct, stateHash, captureCheckpoint, resumeFromCheckpoint, advanceState, projectState, type EventDraft } from '../src/index.ts';

const T0 = Date.parse('2026-01-01T00:00:00.000Z');
const iso = (ms: number): string => new Date(ms).toISOString();
const HOT_CAP = 500; // 与 K.memoryHotCap 同步（改内核需同步此处）

function life(): ReturnType<typeof createInMemoryEventStore> {
  const s = createInMemoryEventStore('vega');
  s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: iso(T0), payload: { innateSeed: { temperamentBias: {}, valueSeed: {}, somaSetpoints: { valence: 0, vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 25, creator: { relationshipId: 'r_a', identityRef: 'A' } } } as EventDraft<'LIFE_GENESIS'>);
  s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_a', occurredAt: iso(T0 + 1000), payload: { relationshipId: 'r_a', kind: 'human', displayRef: 'A' } });
  s.append({ type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_a', occurredAt: iso(T0 + 2000), payload: { relationshipId: 'r_a', host: { kind: 'h', ref: 'h' } } });
  return s;
}
// 一连串消息：sentiment 由 i 确定（确定性，无 RNG），间隔 1h。
function fill(s: ReturnType<typeof createInMemoryEventStore>, n: number): { warm: number; conflict: number } {
  let warm = 0, conflict = 0;
  for (let i = 0; i < n; i++) {
    const sign = i % 3 === 0 ? 1 : i % 3 === 1 ? -1 : 0; // 1/3 暖、1/3 磕碰、1/3 平
    const sent = sign === 0 ? 0.1 : sign; // affect≈sent；>0.3 计暖、<-0.3 计磕碰
    if (sent > 0.3) warm++; else if (sent < -0.3) conflict++;
    s.append({ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r_a', occurredAt: iso(T0 + 10_000 + i * 3600_000), payload: { relationshipId: 'r_a', content: sign > 0 ? '好' : sign < 0 ? '坏' : '在', channel: 'chat', perception: { sentiment: sent, warmth: sent > 0 ? 1 : 0, threat: sent < 0 ? 1 : 0, modelId: 't' } } });
  }
  return { warm, conflict };
}

test('分层①·现有规模(<cap)逐位不变：未触发淘汰、记忆全在、growth/semantic 与不淘汰一致', () => {
  const s = life(); fill(s, 60); // 60 ≪ 500
  const snap = reconstruct(s.list());
  const cur = snap.memory.filter((m) => m.kind === 'episodic' && m.lineage.isCurrent);
  assert.equal(cur.length, 60, '未触发淘汰：60 条情景记忆全在热集');
  const sem = snap.semanticMemory.find((x) => x.relationshipId === 'r_a')!;
  assert.equal(sem.episodes, 60, 'semantic 段数=全量');
});

test('分层②·超 cap 有界：热集 current 情景记忆 ≤ cap（无界增长被根治）', () => {
  const s = life(); fill(s, HOT_CAP + 200);
  const snap = reconstruct(s.list());
  const cur = snap.memory.filter((m) => m.kind === 'episodic' && m.lineage.isCurrent).length;
  assert.ok(cur <= HOT_CAP, `current 情景记忆 ${cur} ≤ ${HOT_CAP}（有界）`);
  assert.ok(cur >= HOT_CAP - 1, `且贴着上限(${cur})——只淘汰溢出的、不过度`);
});

test('分层③·计数无损：超 cap 后 semantic 段数/暖/磕碰、growth 经历数 = 全量（冷聚合补回）', () => {
  const n = HOT_CAP + 200;
  const s = life(); const { warm, conflict } = fill(s, n);
  const snap = reconstruct(s.list());
  const sem = snap.semanticMemory.find((x) => x.relationshipId === 'r_a')!;
  assert.equal(sem.episodes, n, `段数无损：热集+冷聚合=${n}`);
  assert.equal(sem.warm, warm, `暖计数无损=${warm}`);
  assert.equal(sem.conflict, conflict, `磕碰计数无损=${conflict}`);
  assert.ok(snap.growth.includes(`记着 ${n} 段经历`), `growth 反映全量经历数：${snap.growth}`);
});

test('分层④·确定性/V2：超 cap 日志重放两次逐位一致；过检查点往返也一致', () => {
  const s = life(); fill(s, HOT_CAP + 120);
  const ev = s.list();
  assert.equal(stateHash(reconstruct(ev)), stateHash(reconstruct(ev)), '两次全量重放逐位一致');
  // 检查点往返（含 coldByRel/coldLived 序列化）：增量恢复 == 全量
  const split = Math.floor(ev.length * 0.7);
  const cp = captureCheckpoint(ev.slice(0, split));
  const { st } = resumeFromCheckpoint(cp);
  advanceState(st, ev.slice(split));
  assert.equal(stateHash(projectState(st, ev[ev.length - 1].seq)), stateHash(reconstruct(ev)), '检查点往返 == 全量（冷聚合正确序列化）');
});

test('分层⑤·vivid 仍是最近最鲜活的：淘汰只丢最淡的、不动当下记得', () => {
  const s = life(); fill(s, HOT_CAP + 200);
  const snap = reconstruct(s.list());
  const vivid = snap.memory.filter((m) => m.vivid);
  assert.ok(vivid.length > 0 && vivid.length <= 9, `vivid 工作集仍在(${vivid.length}≤9)`);
  // 最鲜活的一条应来自最近的消息（originSeq 大）——淘汰的是远古最淡的。
  const maxVividSeq = Math.max(...vivid.map((m) => m.provenance.originSeq));
  const allSeqs = snap.memory.filter((m) => m.lineage.isCurrent).map((m) => m.provenance.originSeq);
  assert.ok(maxVividSeq >= Math.max(...allSeqs) - 12, 'vivid 落在最近的记忆里（不是被淘汰的远古）');
});

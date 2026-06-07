// A2 快照/有界重放：检查点是【缓存】，必须与全量重放逐位一致；版本不符要安全回退。
// 这是 A2 的安全网——证明"从检查点恢复 + 只重放尾巴" === "从创世全量重建"。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceState,
  captureCheckpoint,
  projectState,
  reconstruct,
  resumeFromCheckpoint,
  stateHash,
  type Checkpoint,
} from '../src/index.ts';
import { buildArcStore } from './arc.ts';

test('有界重放：每个切点上 检查点+尾巴 都与全量重放逐位一致（stateHash 相同）', () => {
  const events = buildArcStore().list();
  const full = stateHash(reconstruct(events));
  const lastSeq = events[events.length - 1].seq;

  for (let k = 1; k < events.length; k++) {
    const cp = captureCheckpoint(events.slice(0, k)); // 折到 seq k-1
    assert.equal(cp.uptoSeq, events[k - 1].seq);
    const { st } = resumeFromCheckpoint(cp);
    advanceState(st, events.slice(k)); // 只步进尾巴
    assert.equal(stateHash(projectState(st, lastSeq)), full, `切点 k=${k} 的有界重放应与全量一致`);
  }
});

test('检查点经 JSON 往返（模拟落盘）后仍逐位一致', () => {
  const events = buildArcStore().list();
  const full = stateHash(reconstruct(events));
  const cp = captureCheckpoint(events.slice(0, 6));
  const onDisk = JSON.parse(JSON.stringify(cp)) as Checkpoint; // 模拟写盘再读回
  const { st } = resumeFromCheckpoint(onDisk);
  advanceState(st, events.slice(6));
  assert.equal(stateHash(projectState(st, events[events.length - 1].seq)), full);
});

test('版本不符的检查点 → 拒绝恢复（调用方据此回退全量重放，缓存不冒充真相）', () => {
  const events = buildArcStore().list();
  const cp = captureCheckpoint(events);
  const stale: Checkpoint = { ...cp, reconstructVersion: 999 };
  assert.throws(() => resumeFromCheckpoint(stale), /checkpoint version/);
  const notCp = { ...cp, kind: 'not-vega' } as unknown as Checkpoint;
  assert.throws(() => resumeFromCheckpoint(notCp), /not a vega checkpoint/);
});

test('整段折一份检查点 + 空尾巴 → 等于全量重放', () => {
  const events = buildArcStore().list();
  const cp = captureCheckpoint(events);
  const { st } = resumeFromCheckpoint(cp);
  advanceState(st, []);
  assert.equal(stateHash(projectState(st, cp.uptoSeq)), stateHash(reconstruct(events)));
});

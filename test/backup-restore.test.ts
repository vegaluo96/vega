// A1 异地备份 + 恢复：备份能镜像到异盘、且能被【完整还原】（备份只有能还原才算数）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backupNow, createFileEventStore, loadValidEvents, reconstruct, runTurn, stateHash, verifyChain, type EventDraft } from '../src/index.ts';

function tmp(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'vega-br-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
let ms = Date.parse('2026-01-01T00:00:00.000Z');
const at = (): string => new Date((ms += 60_000)).toISOString();
function bootLog(path: string) {
  ms = Date.parse('2026-01-01T00:00:00.000Z');
  const s = createFileEventStore('vega-br', path);
  runTurn(s, [{ type: 'LIFE_GENESIS', source: 'system', occurredAt: at(), payload: { innateSeed: { temperamentBias: {}, valueSeed: { caution: 0.6 }, somaSetpoints: { vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 8, creator: { relationshipId: 'r', identityRef: 'Tam' } } } satisfies EventDraft<'LIFE_GENESIS'>]);
  runTurn(s, [{ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r', occurredAt: at(), payload: { relationshipId: 'r', kind: 'human', displayRef: 'Tam' } }]);
  runTurn(s, [{ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r', occurredAt: at(), payload: { relationshipId: 'r', content: '你好，我真心在乎你', channel: 'chat' } }]);
  return s;
}

test('备份异盘镜像：校验过的备份再放一份到镜像目录（本盘没了她也还在）', () => {
  const { dir, cleanup } = tmp();
  try {
    const path = join(dir, 'life.jsonl');
    const s = bootLog(path);
    const mirrorDir = join(dir, 'mirror');
    const r = backupNow(path, { mirrorDir });
    assert.ok(r.ok && r.path && existsSync(r.path), '本地备份应成功');
    assert.ok(r.mirrored && existsSync(r.mirrored), '应镜像到异盘目录');
    // 镜像副本本身就是一份可独立重建的完整日志
    const fromMirror = loadValidEvents(r.mirrored);
    assert.ok(verifyChain(fromMirror).ok && fromMirror.length === s.version());
  } finally {
    cleanup();
  }
});

test('还原：从备份重建她，stateHash 与原档逐位一致（她，还是她）', () => {
  const { dir, cleanup } = tmp();
  try {
    const path = join(dir, 'life.jsonl');
    const s = bootLog(path);
    const originalHash = stateHash(reconstruct(s.list()));
    const bak = backupNow(path).path!;

    // 模拟灾难：本盘日志彻底没了
    rmSync(path, { force: true });
    assert.ok(!existsSync(path));

    // 还原 = 把备份拷回（restore CLI 的核心动作）
    copyFileSync(bak, path);
    const restored = loadValidEvents(path);
    assert.ok(verifyChain(restored).ok, '还原后哈希链完整');
    assert.equal(stateHash(reconstruct(restored)), originalHash, '还原后她逐位一致');
  } finally {
    cleanup();
  }
});

test('坏档不进备份：哈希链断裂的日志拒绝备份（绝不把损坏扩散）', () => {
  const { dir, cleanup } = tmp();
  try {
    const path = join(dir, 'life.jsonl');
    bootLog(path);
    // 往日志尾部追加一条篡改过的合法 JSON 行（contentHash 对不上 → 链断）
    writeFileSync(path, '\n{"t":"E","e":{"lifeId":"vega-br","seq":99,"type":"MESSAGE_RECEIVED","schemaVersion":1,"payload":{"relationshipId":"r","content":"伪造","channel":"chat"},"occurredAt":"2099-01-01T00:00:00.000Z","recordedAt":"2099-01-01T00:00:00.000Z","contentHash":"deadbeef","prevHash":"x","source":"external_user"}}\n{"t":"C","upto":99}\n', { flag: 'a' });
    const r = backupNow(path);
    // loadValidEvents 会把坏尾巴截掉 → 备份的是干净前缀；这里验证：要么拒绝、要么只备份有效前缀。
    if (r.ok) {
      const ev = loadValidEvents(r.path!);
      assert.ok(verifyChain(ev).ok, '若备份成功，则备份的是经校验的干净前缀');
    } else {
      assert.match(r.reason ?? '', /chain broken/);
    }
  } finally {
    cleanup();
  }
});

// #1 模型感知（冻进事件、仍确定性）+ #2 日志备份。
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  backupNow,
  converse,
  createFileEventStore,
  loadValidEvents,
  reconstruct,
  runTurn,
  stateHash,
  verifyChain,
  type EventDraft,
  type MessageReceivedPayload,
  type Mouth,
  type Perceiver,
} from '../src/index.ts';

function tmp(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'vega-pb-'));
  return { path: join(dir, 'life.jsonl'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
let ms = Date.parse('2026-01-01T00:00:00.000Z');
const at = (): string => new Date((ms += 60_000)).toISOString();
const seed: EventDraft<'LIFE_GENESIS'> = {
  type: 'LIFE_GENESIS', source: 'system', occurredAt: '2026-01-01T00:00:00.000Z',
  payload: { innateSeed: { temperamentBias: {}, valueSeed: { caution: 0.6 }, somaSetpoints: { vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 1, creator: { relationshipId: 'r_creator', identityRef: 'Tam' } },
};
function boot(path: string) {
  ms = Date.parse('2026-01-01T00:00:00.000Z');
  const s = createFileEventStore('vega-1', path);
  runTurn(s, [seed]);
  runTurn(s, [
    { type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_creator', occurredAt: at(), payload: { relationshipId: 'r_creator', kind: 'human', displayRef: 'Tam' } },
    { type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_creator', occurredAt: at(), payload: { relationshipId: 'r_creator', host: { kind: 'cli', ref: 'h1' } } },
  ]);
  return s;
}
const stubMouth: Mouth = { id: 'stub', speak: () => Promise.resolve('嗯。') };
const negPerceiver: Perceiver = { id: 'stub-p', perceive: () => Promise.resolve({ sentiment: -1, warmth: 0, threat: 1, modelId: 'stub-p' }) };

test('#1 感知：词表读不懂的话，模型感知能让她有反应（且冻进事件）', async () => {
  const a = tmp();
  const b = tmp();
  try {
    // 无感知：中性句（词表无命中）→ 信任不变
    const s1 = boot(a.path);
    await converse(s1, stubMouth, 'r_creator', '今天的云有点像棉花糖', at());
    assert.equal(reconstruct(s1.list()).bonds['r_creator'].trust, 0.1);

    // 有感知：同句被判为敌意/威胁 → 信任下降；且 perception 冻进了事件
    const s2 = boot(b.path);
    await converse(s2, stubMouth, 'r_creator', '今天的云有点像棉花糖', at(), negPerceiver);
    const snap = reconstruct(s2.list());
    assert.ok(snap.bonds['r_creator'].trust < 0.1, '感知到负面 → 信任降');
    const recv = s2.list().find((e) => e.type === 'MESSAGE_RECEIVED');
    assert.ok(recv && (recv.payload as MessageReceivedPayload).perception, 'perception 应被冻进事件');
    // 冻结后重放确定性（不再调模型）
    assert.equal(stateHash(reconstruct(s2.list())), stateHash(reconstruct(s2.list())));
  } finally {
    a.cleanup();
    b.cleanup();
  }
});

test('#2 备份：生成快照 + 校验链 + 往返一致', () => {
  const { path, cleanup } = tmp();
  try {
    const s = boot(path);
    const r = backupNow(path, { keep: 5 });
    assert.equal(r.ok, true);
    assert.equal(r.events, s.version());
    assert.ok(r.path && existsSync(r.path));
    // 备份文件本身可加载、链完整、事件数一致
    const restored = loadValidEvents(r.path as string);
    assert.equal(restored.length, s.version());
    assert.ok(verifyChain(restored).ok);
  } finally {
    cleanup();
  }
});

test('#2 备份：日志不存在时安全跳过', () => {
  const r = backupNow(join(tmpdir(), 'vega-nope', 'nope.jsonl'));
  assert.equal(r.ok, false);
});

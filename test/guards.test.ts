// 审计补强的三道闸：C4 prod 守护 / 契约①重放焊点 / 信封完整性。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertPersistenceSafeForProd,
  createInMemoryEventStore,
  reconstruct,
  verifyChain,
  type EventDraft,
  type LifeEvent,
  type MessageSentPayload,
} from '../src/index.ts';

let ms = Date.parse('2026-01-01T00:00:00.000Z');
const at = (): string => new Date((ms += 60_000)).toISOString();
function bootStore() {
  ms = Date.parse('2026-01-01T00:00:00.000Z');
  const s = createInMemoryEventStore('vega-g');
  s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: at(), payload: { innateSeed: { temperamentBias: {}, valueSeed: { caution: 0.6 }, somaSetpoints: { vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 7, creator: { relationshipId: 'r_creator', identityRef: 'Tam' } } } satisfies EventDraft<'LIFE_GENESIS'>);
  s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_creator', occurredAt: at(), payload: { relationshipId: 'r_creator', kind: 'human', displayRef: 'Tam' } });
  s.append({ type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_creator', occurredAt: at(), payload: { relationshipId: 'r_creator', host: { kind: 'cli', ref: 'h' } } });
  s.append({ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r_creator', occurredAt: at(), payload: { relationshipId: 'r_creator', content: '你好，我真心在乎你', channel: 'chat' } });
  s.append({ type: 'MESSAGE_SENT', source: 'autonomous_loop', relationshipId: 'r_creator', occurredAt: at(), payload: { relationshipId: 'r_creator', utterance: '嗯，我在。', modelId: 'm', criticVerdict: 'accepted', affectsDerivedState: false } });
  return s;
}

test('#3 C4 守护：prod 拒绝内存/易失存储，文件存储放行', () => {
  assert.throws(() => assertPersistenceSafeForProd({ storeKind: 'memory', env: 'production' }), /in-memory\/ephemeral/);
  assert.throws(() => assertPersistenceSafeForProd({ storeKind: 'file', path: undefined, env: 'production' }), /in-memory\/ephemeral/);
  assert.doesNotThrow(() => assertPersistenceSafeForProd({ storeKind: 'file', path: '/var/lib/vega/life.jsonl', env: 'production' }));
  assert.doesNotThrow(() => assertPersistenceSafeForProd({ storeKind: 'memory', env: 'development' })); // 非 prod 不拦
});

test('#4 契约①重放焊点：MESSAGE_SENT 被篡改成"影响状态" → 重放即拒绝', () => {
  const events = bootStore().list();
  // 正常日志能重放
  assert.doesNotThrow(() => reconstruct(events));
  // 篡改：把审计事件标成会写状态（绕过哈希也要被 reconstruct 自己拦下）
  const tampered: LifeEvent[] = events.map((e) =>
    e.type === 'MESSAGE_SENT'
      ? { ...e, payload: { ...(e.payload as MessageSentPayload), affectsDerivedState: true } as unknown as MessageSentPayload }
      : e,
  );
  assert.throws(() => reconstruct(tampered), /契约①违反/);
});

test('#5 信封完整性：relationshipId 信封被独立篡改 → verifyChain 查得出', () => {
  const events = bootStore().list();
  assert.ok(verifyChain(events).ok);
  // 信封 relationshipId 不进 contentHash，但用已哈希的 payload.relationshipId 当真相核对
  const tampered: LifeEvent[] = events.map((e) =>
    e.type === 'MESSAGE_RECEIVED' ? { ...e, relationshipId: 'r_someone_else' } : e,
  );
  const chk = verifyChain(tampered);
  assert.equal(chk.ok, false);
  assert.match((chk as { ok: false; reason: string }).reason, /relationshipId envelope\/payload mismatch/);
});

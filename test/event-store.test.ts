import test from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryEventStore, verifyChain, type LifeEvent } from '../src/index.ts';
import { buildArcStore } from './arc.ts';

test('append-only store: gapless seq + intact prevHash chain', () => {
  const events = buildArcStore().list();
  assert.equal(events[0].type, 'LIFE_GENESIS');
  assert.equal(events[0].prevHash, null);
  events.forEach((e, i) => assert.equal(e.seq, i));
  const r = verifyChain(events);
  assert.ok(r.ok, r.ok ? '' : r.reason);
});

test('tampering with a stored event breaks the chain (篡改即暴露)', () => {
  const original = buildArcStore().list();
  const events: LifeEvent[] = original.map((e, i) =>
    i === 3
      ? ({ ...e, payload: { ...(e.payload as unknown as Record<string, unknown>), content: '篡改后的内容' } } as LifeEvent)
      : e,
  );
  const r = verifyChain(events);
  assert.equal(r.ok, false);
});

test('first event must be LIFE_GENESIS', () => {
  const store = createInMemoryEventStore('x');
  assert.throws(() =>
    store.append({
      type: 'CONNECTION_OPENED',
      source: 'host',
      occurredAt: '2026-01-01T00:00:00.000Z',
      relationshipId: 'r',
      payload: { relationshipId: 'r', host: { kind: 'k', ref: 'r' } },
    }),
  );
});

test('LIFE_GENESIS only allowed at seq 0', () => {
  const store = buildArcStore();
  assert.throws(() =>
    store.append({
      type: 'LIFE_GENESIS',
      source: 'system',
      occurredAt: '2030-01-01T00:00:00.000Z',
      payload: {
        innateSeed: { temperamentBias: {}, valueSeed: {}, somaSetpoints: {}, somaTau: {}, vitalityFloor: 0.1 },
        reconstructVersionAtBirth: 1,
        creator: { relationshipId: 'r', identityRef: 'x' },
      },
    }),
  );
});

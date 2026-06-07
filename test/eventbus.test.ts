// P1.5 SSE 事件总线：发布/订阅/退订 + audience 作用域（公开 vs 单用户，绝不跨用户）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEventBus, visibleTo } from '../src/index.ts';

test('发布/订阅/退订', () => {
  const bus = createEventBus();
  const got: string[] = [];
  const unsub = bus.subscribe((e) => got.push(e.type));
  bus.publish('society', 'public', { x: 1 });
  bus.publish('presence', 'public');
  assert.deepEqual(got, ['society', 'presence']);
  assert.equal(bus.size(), 1);
  unsub();
  bus.publish('society', 'public');
  assert.deepEqual(got, ['society', 'presence'], '退订后不再收');
  assert.equal(bus.size(), 0);
});

test('audience 作用域：公开人人可见；单用户事件只对本人可见，绝不跨用户', () => {
  const pub = { type: 'society', audience: 'public', at: '' };
  const toAlice = { type: 'reach_out', audience: 'u_alice', at: '' };
  assert.equal(visibleTo(pub, 'u_alice'), true);
  assert.equal(visibleTo(pub, 'u_bob'), true);
  assert.equal(visibleTo(toAlice, 'u_alice'), true);
  assert.equal(visibleTo(toAlice, 'u_bob'), false, 'Bob 看不到给 Alice 的触达');
});

test('一个订阅者抛错不影响其他订阅者', () => {
  const bus = createEventBus();
  const got: number[] = [];
  bus.subscribe(() => { throw new Error('boom'); });
  bus.subscribe(() => got.push(1));
  bus.publish('x', 'public');
  assert.deepEqual(got, [1]);
});

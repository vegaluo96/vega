// 接生"一键随机"的名字生成器（②）：发音组合（辅音+元音 2–3 节）必须恒满足生命体命名规则、
// 同 seed 逐位确定；pickFreshLifeName 撞名（生命体/用户昵称）自动换名重试、全撞返回 null。
import test from 'node:test';
import assert from 'node:assert/strict';
import { lifeNameFor, pickFreshLifeName } from '../src/server/namegen.ts';

const RULE = /^[a-z][a-z0-9_-]{1,23}$/; // 与 birthLife 的校验完全一致

test('随机名·合法：任意 seed 产物恒满足 /^[a-z][a-z0-9_-]{1,23}$/（抽 500 个 seed）', () => {
  for (let seed = 0; seed < 500; seed++) {
    const name = lifeNameFor(seed * 2654435761 + 7);
    assert.match(name, RULE, `seed=${seed} → "${name}" 必须合法`);
    assert.ok(name.length >= 2 && name.length <= 24, `长度 2–24（${name}）`);
  }
  assert.match(lifeNameFor(0), RULE, 'seed=0（xorshift 死点）也有兜底');
});

test('随机名·确定性：同 seed 同名、不同 seed 大多不同（不是 RNG，可复现）', () => {
  assert.equal(lifeNameFor(42), lifeNameFor(42), '同 seed 逐位一致');
  const names = new Set<string>();
  for (let seed = 1; seed <= 200; seed++) names.add(lifeNameFor(seed * 97 + 13));
  assert.ok(names.size > 100, `200 个 seed 应产出可观的多样性（实得 ${names.size}）`);
});

test('随机名·防撞：已占用（生命体名/用户昵称）→ 换 seed 重试拿到没占用的；全撞 → null', () => {
  const first = pickFreshLifeName(() => false, 12345);
  assert.ok(first && RULE.test(first), '无占用 → 直接拿到合法名');
  const fresh = pickFreshLifeName((id) => id === first, 12345); // 第一个候选被占 → 必须换一个
  assert.ok(fresh && fresh !== first && RULE.test(fresh), `撞名后换名（${first} → ${fresh}）`);
  assert.equal(pickFreshLifeName(() => true, 12345), null, '重试用尽 → null（调用方报错，不死循环）');
  assert.equal(pickFreshLifeName(() => false, 999), pickFreshLifeName(() => false, 999), '同 baseSeed 同结果（确定性、可测）');
});

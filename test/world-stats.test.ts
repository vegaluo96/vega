// 世界源抓取统计（server/world.ts）：后台「世界源」健康点/上次抓取/今日条数的真实数据源。
// 纯函数、不连网：bumpStat 折叠一次抓取结果（同日累计、跨日清零、失败留诊断），rollDay 读取时滚日。
import test from 'node:test';
import assert from 'node:assert/strict';
import { bumpStat, rollDay, dayKey, sampleByInterest, type SourceStat } from '../src/server/world.ts';

const T0 = new Date('2026-06-10T12:00:00').getTime(); // 本地时区正午（+24h 不会撞夏令时切换）
const KEY = 'https://example.com/rss.xml';

test('bumpStat：首抓建档——lastFetchAt/lastOk/lastCount/todayCount/totalCount 齐全，成功不带 lastError', () => {
  const s = bumpStat(undefined, KEY, { ok: true, status: 200, items: 5 }, T0);
  assert.equal(s.key, KEY);
  assert.equal(s.lastFetchAt, new Date(T0).toISOString());
  assert.equal(s.lastOk, true);
  assert.equal(s.lastError, undefined, '成功时不带 lastError');
  assert.equal(s.lastCount, 5);
  assert.equal(s.todayCount, 5);
  assert.equal(s.totalCount, 5);
  assert.equal(s.day, dayKey(T0));
});

test('bumpStat：同一自然日累计 todayCount/totalCount，lastCount 是本次', () => {
  const a = bumpStat(undefined, KEY, { ok: true, status: 200, items: 5 }, T0);
  const b = bumpStat(a, KEY, { ok: true, status: 200, items: 3 }, T0 + 1_800_000); // 半小时后
  assert.equal(b.lastCount, 3);
  assert.equal(b.todayCount, 8);
  assert.equal(b.totalCount, 8);
});

test('bumpStat：失败记 lastOk=false + lastError（状态码/错误名原样留诊断），计数不倒退', () => {
  const a = bumpStat(undefined, KEY, { ok: true, status: 200, items: 5 }, T0);
  const b = bumpStat(a, KEY, { ok: false, status: 403, items: 0 }, T0 + 3_600_000);
  assert.equal(b.lastOk, false);
  assert.equal(b.lastError, '403');
  assert.equal(b.lastCount, 0);
  assert.equal(b.todayCount, 5, '失败抓 0 条：今日数不变');
  assert.equal(b.totalCount, 5);
  const c = bumpStat(b, KEY, { ok: false, status: 'ERR:AbortError', items: 0 }, T0 + 7_200_000);
  assert.equal(c.lastError, 'ERR:AbortError', '超时类错误也原样可见');
  const d = bumpStat(c, KEY, { ok: true, status: 200, items: 2 }, T0 + 10_800_000);
  assert.equal(d.lastOk, true);
  assert.equal(d.lastError, undefined, '恢复成功后 lastError 清掉');
  assert.equal(d.todayCount, 7);
});

test('bumpStat：跨自然日 todayCount 从 0 重新累计，totalCount 不清', () => {
  const a = bumpStat(undefined, KEY, { ok: true, status: 200, items: 8 }, T0);
  const b = bumpStat(a, KEY, { ok: true, status: 200, items: 2 }, T0 + 86_400_000); // 次日同一时刻
  assert.notEqual(b.day, a.day);
  assert.equal(b.todayCount, 2, '跨日清零后只算今天的');
  assert.equal(b.totalCount, 10, '累计不清');
});

test('rollDay：同日恒等；跨日读取 todayCount 显示 0（没有新抓取也不残留昨天的数），其余字段保留', () => {
  const s = bumpStat(undefined, KEY, { ok: true, status: 200, items: 6 }, T0);
  assert.deepEqual(rollDay(s, T0 + 60_000), s, '同一自然日：原样返回');
  const next: SourceStat = rollDay(s, T0 + 86_400_000);
  assert.equal(next.todayCount, 0);
  assert.equal(next.day, dayKey(T0 + 86_400_000));
  assert.equal(next.totalCount, 6, '累计/上次抓取信息保留');
  assert.equal(next.lastFetchAt, s.lastFetchAt);
  assert.equal(next.lastOk, true);
});

// —— 世界注入·按兴趣确定性加权采样（sampleByInterest）——
const ITEMS = [
  { title: 'a', topics: ['音乐'] },
  { title: 'b', topics: ['科技'] },
  { title: 'c', topics: ['音乐', '人文历史'] },
  { title: 'd', topics: ['经济市场'] },
  { title: 'e', topics: [] },
  { title: 'f', topics: ['体育'] },
];

test('sampleByInterest：确定性（同 seed 同结果）+ 不同条目约束 + 少于 n 全取', () => {
  const its = [{ topic: '音乐', weight: 0.8 }];
  const p1 = sampleByInterest(ITEMS, 2, its, 'vega|round1');
  const p2 = sampleByInterest(ITEMS, 2, its, 'vega|round1');
  assert.deepEqual(p1, p2, '同 seed 逐位一致（零 Math.random）');
  assert.equal(p1.length, 2);
  assert.notEqual(p1[0].title, p1[1].title, '无放回：两条不同');
  assert.deepEqual(sampleByInterest(ITEMS.slice(0, 2), 5, its, 's'), ITEMS.slice(0, 2), '条目少于 n → 全取');
});

test('sampleByInterest：兴趣命中的主题被显著偏好；无兴趣命中 → 等价均匀仍可用；不同命种子不同质', () => {
  const its = [{ topic: '音乐', weight: 1 }];
  let hit = 0;
  for (let i = 0; i < 200; i++) {
    const picks = sampleByInterest(ITEMS, 2, its, `life|${i}`);
    if (picks.some((p) => (p.topics ?? []).includes('音乐'))) hit++;
  }
  // 均匀时两条抽中含"音乐"(2/6)的概率 ≈ 60%；×5 加权后应明显更高。
  assert.ok(hit > 160, `兴趣加权应显著偏向她在意的主题（200 轮命中 ${hit}）`);
  const none = sampleByInterest(ITEMS, 2, [], 'plain');
  assert.equal(none.length, 2, '无兴趣 → 均匀采样仍工作');
  // 防全命同质：同一轮 items、不同 life.id 种子 → 多轮里必有分歧。
  let diverged = false;
  for (let i = 0; i < 20 && !diverged; i++) {
    if (JSON.stringify(sampleByInterest(ITEMS, 2, its, `vega|round${i}`)) !== JSON.stringify(sampleByInterest(ITEMS, 2, its, `lyra|round${i}`))) diverged = true;
  }
  assert.ok(diverged, '不同命的种子应让她们看到不同的世界（20 轮内必有分歧）');
});

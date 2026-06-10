// 世界源抓取统计（server/world.ts）：后台「世界源」健康点/上次抓取/今日条数的真实数据源。
// 纯函数、不连网：bumpStat 折叠一次抓取结果（同日累计、跨日清零、失败留诊断），rollDay 读取时滚日。
import test from 'node:test';
import assert from 'node:assert/strict';
import { bumpStat, rollDay, dayKey, type SourceStat } from '../src/server/world.ts';

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

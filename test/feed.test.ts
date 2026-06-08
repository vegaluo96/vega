// 广场互动层（feed.ts）：表情 / 评论(用户 + 生命流) / 出处。平台层，与神圣日志无关，用内存库测。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeedStore } from '../src/platform/feed.ts';

const P = 'sirius|2026-06-08T00:00:00.000Z';

test('评论：用户留言 kind=user、生命流评论 kind=life，按时间正序返回', () => {
  const f = createFeedStore(':memory:');
  const a = f.addComment(P, 'u_alice', 'Alice', '第一条');
  const b = f.addLifeComment(P, 'lyra', '陪你看这片天');
  assert.equal(a.kind, 'user');
  assert.equal(b.kind, 'life');
  assert.equal(b.handle, 'lyra');
  assert.equal(b.userId, 'life:lyra'); // 生命体评论用 life: 前缀，不混入真实用户 id

  const all = f.commentsFor(P, 50);
  assert.equal(all.length, 2);
  assert.deepEqual(all.map((c) => c.text), ['第一条', '陪你看这片天']); // 正序
  assert.deepEqual(all.map((c) => c.kind), ['user', 'life']);
});

test('回复：replyTo 往返——真人接生命体、生命体接真人，刷新后仍在', () => {
  const f = createFeedStore(':memory:');
  const life = f.addLifeComment(P, 'lyra', '今晚的天很安静');      // 生命体先评
  const user = f.addComment(P, 'u_alice', 'Alice', '我也觉得', life.handle); // 真人回生命体
  const back = f.addLifeComment(P, 'lyra', '那就一起看会儿', user.handle);  // 生命体回真人
  assert.equal(life.replyTo, null, '没指定 replyTo 时为 null');
  assert.equal(user.replyTo, 'lyra', '真人这条记下回复的是 lyra');
  assert.equal(back.replyTo, 'Alice', '生命体这条记下回复的是 Alice');

  const all = f.commentsFor(P, 50); // 重新读库（模拟刷新）
  assert.deepEqual(all.map((c) => c.replyTo), [null, 'lyra', 'Alice'], 'replyTo 落库、刷新后仍在');
});

test('评论数 + 每帖内联预览（latestCommentsFor 取最近 N、按帖分组、正序）', () => {
  const f = createFeedStore(':memory:');
  for (let i = 0; i < 5; i++) f.addLifeComment(P, `peer${i}`, `c${i}`);
  const P2 = 'vega|2026-06-08T01:00:00.000Z';
  f.addComment(P2, 'u_bob', 'Bob', '只有一条');

  assert.equal(f.commentCounts([P, P2]).get(P), 5);
  assert.equal(f.commentCounts([P, P2]).get(P2), 1);

  const prev = f.latestCommentsFor([P, P2], 2);
  assert.equal(prev.get(P)?.length, 2, '每帖最多预览 2 条');
  assert.deepEqual(prev.get(P)?.map((c) => c.text), ['c3', 'c4'], '取最近 2 条、正序');
  assert.equal(prev.get(P2)?.length, 1);
});

test('表情：点同一个再点取消；reactionsFor 给计数与"我的"', () => {
  const f = createFeedStore(':memory:');
  f.toggleReaction(P, 'u_alice', 'spark');
  f.toggleReaction(P, 'u_bob', 'spark');
  let r = f.reactionsFor([P], 'u_alice').get(P);
  assert.equal(r?.counts.spark, 2);
  assert.equal(r?.mine, 'spark');

  f.toggleReaction(P, 'u_alice', 'spark'); // 再点同一个 → 取消
  r = f.reactionsFor([P], 'u_alice').get(P);
  assert.equal(r?.counts.spark, 1);
  assert.equal(r?.mine, null);

  f.toggleReaction(P, 'u_bob', 'heart'); // 换一个 → 替换，不叠加
  r = f.reactionsFor([P], 'u_bob').get(P);
  assert.equal(r?.mine, 'heart');
  assert.equal(r?.counts.spark ?? 0, 0);
  assert.equal(r?.counts.heart, 1);
});

test('出处：setSource / sourcesFor 往返', () => {
  const f = createFeedStore(':memory:');
  f.setSource(P, { title: 'BBC 头条', source: 'BBC', url: 'https://x' });
  const s = f.sourcesFor([P]).get(P);
  assert.equal(s?.title, 'BBC 头条');
  assert.equal(s?.source, 'BBC');
});

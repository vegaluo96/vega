// 世界源解析器：RSS/Atom、Polymarket、维基"历史上的今天"——纯解析、可单测、不连网。
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRss, parsePolymarket, parseOnThisDay, tagTopics } from '../src/index.ts';

test('tagTopics：确定性主题标签——命中关键词归类、无命中走 fallback、最多 3 个', () => {
  assert.deepEqual(tagTopics('NASA finds water on Mars'), ['天文航天']);
  assert.ok(tagTopics('量子计算新突破').includes('科技') || tagTopics('量子计算新突破').includes('科学'));
  assert.deepEqual(tagTopics('某地例行会议', '', '社会时事'), ['社会时事'], '无命中关键词时用 fallback');
  assert.deepEqual(tagTopics('完全无关的随机字串 zzz'), [], '无命中且无 fallback → 空');
  assert.ok(tagTopics('AI space climate market history art').length <= 3, '一条最多挂 3 个主题');
});

test('parseRss：topics 被确定性填充（不再恒为空）', () => {
  const xml = `<rss><channel><item><title>SpaceX launches rocket to the Moon</title><description>astronomy</description><link>https://x/1</link></item></channel></rss>`;
  const items = parseRss(xml, 'x.com');
  assert.ok(items[0].topics.includes('天文航天'), 'RSS 条目应被打上主题');
});

test('parseRss：RSS <item> 解析出标题/摘要', () => {
  const xml = `<rss><channel>
    <item><title>火星发现液态水</title><description><![CDATA[科学家在火星…]]></description><link>https://x/1</link></item>
    <item><title>另一条</title><description>详情</description><link>https://x/2</link></item>
  </channel></rss>`;
  const items = parseRss(xml, 'x.com');
  assert.equal(items.length, 2);
  assert.equal(items[0].title, '火星发现液态水');
  assert.equal(items[0].source, 'x.com');
  assert.equal(items[0].kind, 'news');
  assert.ok(items[0].summary.includes('科学家'));
});

test('parseRss：Atom <entry> 也能解析（含 href link）', () => {
  const xml = `<feed><entry><title>Atom 标题</title><summary>摘要内容</summary><link href="https://a/1"/></entry></feed>`;
  const items = parseRss(xml, 'a.com');
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Atom 标题');
  assert.equal(items[0].url, 'https://a/1');
});

test('parseOnThisDay：维基"历史上的今天" selected 解析', () => {
  const json = { selected: [
    { text: '人类首次登月', year: 1969 },
    { text: '某历史事件', year: 1900 },
    { text: '' }, // 空文本跳过
  ] };
  const items = parseOnThisDay(json);
  assert.equal(items.length, 2);
  assert.equal(items[0].source, '维基·历史上的今天');
  assert.ok(items[0].title.includes('1969年') && items[0].title.includes('人类首次登月'));
});

test('parseOnThisDay：没有 selected 时退回 events；空则空数组', () => {
  assert.deepEqual(parseOnThisDay({}), []);
  const r = parseOnThisDay({ events: [{ text: '事件A', year: 2000 }] });
  assert.equal(r.length, 1);
  assert.ok(r[0].title.includes('事件A'));
});

test('parsePolymarket：赔率拼接', () => {
  const json = [{ question: 'X 会发生吗？', outcomes: '["Yes","No"]', outcomePrices: '["0.85","0.15"]', slug: 'x' }];
  const items = parsePolymarket(json);
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, 'market');
  assert.ok(items[0].summary.includes('85%') && items[0].summary.includes('15%'));
});

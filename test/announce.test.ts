// 公告存储（平台留痕）：publish/list 往返、最新在前、长度钳制、落盘可重载、文件不存在则空。
// 边界：announce.json 绝不进神圣日志；生命体侧"读到"另经 WORLD_PERCEIVED 事件（admin 路由），此处只测存储。
import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, writeFileSync } from 'node:fs';
import { createAnnounceStore, ANNOUNCE_TITLE_MAX, ANNOUNCE_TEXT_MAX } from '../src/platform/announce.ts';

test('公告存储：publish/list 往返、最新在前、留痕字段齐全、落盘可重载', () => {
  const path = join(tmpdir(), `vega-announce-${process.pid}-${Date.now()}.json`);
  try {
    let s = createAnnounceStore(path);
    assert.deepEqual(s.list(), [], '文件不存在则空');

    const a = s.publish({ title: '  维护通知  ', text: '  今晚低语片刻。  ', audience: 'humans', by: 'owner@x.com' });
    assert.equal(a.title, '维护通知', 'title trim');
    assert.equal(a.text, '今晚低语片刻。', 'text trim');
    assert.equal(a.audience, 'humans');
    assert.equal(a.by, 'owner@x.com', '敏感操作留痕：操作者邮箱');
    assert.ok(a.id.startsWith('an_') && !Number.isNaN(Date.parse(a.at)), 'id/at 由存储生成');

    s.publish({ title: '第二条', text: '给她们的。', audience: 'lives', by: 'owner@x.com' });
    s.publish({ title: '第三条', text: '给两边的。', audience: 'both', by: 'owner@x.com' });
    assert.deepEqual(s.list().map((x) => x.title), ['第三条', '第二条', '维护通知'], '最新在前');
    assert.deepEqual(s.list(2).map((x) => x.title), ['第三条', '第二条'], 'limit 取最近 N 条');

    // 重新打开：从磁盘重载（与 settings 同路：轻量 JSON、同步读写）
    s = createAnnounceStore(path);
    assert.equal(s.list().length, 3);
    assert.equal(s.list()[0].title, '第三条');
  } finally {
    rmSync(path, { force: true });
  }
});

test('公告存储：长度钳制（title≤80 / text≤500）+ 坏文件回落为空', () => {
  const path = join(tmpdir(), `vega-announce-clamp-${process.pid}-${Date.now()}.json`);
  try {
    const s = createAnnounceStore(path);
    const a = s.publish({ title: '题'.repeat(200), text: '文'.repeat(1000), audience: 'both', by: 'o@x.com' });
    assert.equal(a.title.length, ANNOUNCE_TITLE_MAX, `title 钳到 ${ANNOUNCE_TITLE_MAX}`);
    assert.equal(a.text.length, ANNOUNCE_TEXT_MAX, `text 钳到 ${ANNOUNCE_TEXT_MAX}`);
    assert.equal(s.list()[0].title.length, ANNOUNCE_TITLE_MAX, '落盘的也是钳后值');

    writeFileSync(path, '{not json'); // 配置坏了 → 当空，不抛
    assert.deepEqual(createAnnounceStore(path).list(), [], '坏文件回落为空');
  } finally {
    rmSync(path, { force: true });
  }
});

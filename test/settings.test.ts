// 运营配置存储（计费数值）：getBilling/setBilling —— settings ⊕ env ⊕ 默认，绝不进神圣日志。
import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { createSettingsStore } from '../src/platform/settings.ts';

test('计费配置：负/非法拒、0 允许、apiyiToken trim/clear、落盘可重载', () => {
  const path = join(tmpdir(), `vega-settings-${process.pid}-${Date.now()}.json`);
  try {
    let s = createSettingsStore(path);
    assert.deepEqual(s.getBilling(), {}, '初始为空（回落 env/默认在 daemon 层）');

    s.setBilling({ costPerReply: 3, starterCredits: 200 });
    assert.equal(s.getBilling().costPerReply, 3);
    assert.equal(s.getBilling().starterCredits, 200);

    s.setBilling({ costPerReply: -1 });                 // 负数拒（保留旧值）
    assert.equal(s.getBilling().costPerReply, 3);
    s.setBilling({ starterCredits: 0 });                // 0 合法
    assert.equal(s.getBilling().starterCredits, 0);
    s.setBilling({ costPerReply: 2.7 });                // 取整
    assert.equal(s.getBilling().costPerReply, 3);

    s.setBilling({ apiyiToken: '  tok-abc  ' });        // trim
    assert.equal(s.getBilling().apiyiToken, 'tok-abc');
    s.setBilling({ apiyiToken: '' });                   // 空串=不改
    assert.equal(s.getBilling().apiyiToken, 'tok-abc');
    s.setBilling({ clearApiyiToken: true });            // 清除
    assert.equal(s.getBilling().apiyiToken, undefined);

    // 重新打开：从磁盘重载（billing 持久化、与 model/social/world 同路）
    s = createSettingsStore(path);
    assert.equal(s.getBilling().costPerReply, 3);
    assert.equal(s.getBilling().starterCredits, 0);
  } finally {
    rmSync(path, { force: true });
  }
});

test('安全配置：词表 trim/去重/可显式存空（=关闭）、话术 trim/空串回落、落盘可重载', () => {
  const path = join(tmpdir(), `vega-settings-safety-${process.pid}-${Date.now()}.json`);
  try {
    let s = createSettingsStore(path);
    assert.deepEqual(s.getSafety(), {}, '初始为空（默认词表/话术在 config 解析层）');

    s.setSafety({ words: [' 自杀 ', '自杀', '自残', ''] });
    assert.deepEqual(s.getSafety().words, ['自杀', '自残'], 'trim + 去重 + 滤空');

    s.setSafety({ takeover: '  我很担心你，热线 12356 随时可以拨。  ' });
    assert.equal(s.getSafety().takeover, '我很担心你，热线 12356 随时可以拨。');
    s.setSafety({ takeover: '' }); // 空串=回落默认话术
    assert.equal(s.getSafety().takeover, undefined);

    s.setSafety({ words: [] }); // 显式空数组=关闭拦截（与"未存"区分）
    assert.deepEqual(s.getSafety().words, []);

    s = createSettingsStore(path); // 重新打开：从磁盘重载
    assert.deepEqual(s.getSafety().words, []);
  } finally {
    rmSync(path, { force: true });
  }
});

test('模型配置：museModel（公开心声独立选型）trim、空串=回落同嘴、落盘可重载', () => {
  const path = join(tmpdir(), `vega-settings-muse-${process.pid}-${Date.now()}.json`);
  try {
    let s = createSettingsStore(path);
    s.setModel({ museModel: ' qwen-max ' });
    assert.equal(s.getModel().museModel, 'qwen-max', 'trim 后入库');
    s = createSettingsStore(path);
    assert.equal(s.getModel().museModel, 'qwen-max', '落盘可重载');
    s.setModel({ museModel: '' }); // 清空=回落同嘴
    assert.equal(s.getModel().museModel, undefined);
  } finally {
    rmSync(path, { force: true });
  }
});

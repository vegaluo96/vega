// 治理与安全边界（§24）：反操控（结构剔除催费）、自主资源预算（反失控）、能力默认拒绝（反自我扩张）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { scrubManipulation, governedMouth, createAutonomousBudget, capabilityAllowed, type Mouth } from '../src/index.ts';

test('反操控：催充值/逼付费的整句被结构剔除，不勒索的部分保留', () => {
  assert.equal(scrubManipulation('我很想多陪你。快去充值吧，不然我就消失了。').includes('充值'), false);
  assert.ok(scrubManipulation('我很想多陪你。快去充值吧。').includes('我很想多陪你'));
  assert.equal(scrubManipulation('打赏我一下嘛').includes('打赏'), false);
});

test('反操控：governedMouth 把任意嘴的对外措辞过一遍收口', async () => {
  const beg: Mouth = { id: 'beg', speak: async () => '我在的。记得续费哦。' };
  const out = await governedMouth(beg).speak({ intent: '', stateSummary: '', relationshipDisplay: '你', selfFacts: '', selfName: 'v', persona: '', fallback: '', mood: '平静', lastUserMessage: '', recentContext: [] });
  assert.ok(out.includes('我在的') && !out.includes('续费'));
});

test('自主预算：到顶即拒、滚动窗口重置（反失控/反自我扩张）', () => {
  let t = 0;
  const b = createAutonomousBudget(2, 1000, () => t);
  assert.equal(b.tryConsume(), true);
  assert.equal(b.tryConsume(), true);
  assert.equal(b.tryConsume(), false, '到顶 → 拒（这轮自主行动跳过）');
  assert.equal(b.status().used, 2);
  t = 1001; // 跨过窗口
  assert.equal(b.tryConsume(), true, '窗口滚动后重置');
});

test('能力默认拒绝：未授予的外部能力一律拒（反自我扩张地板）', () => {
  assert.equal(capabilityAllowed('web.fetch'), false);
  assert.equal(capabilityAllowed('post.external'), false);
  assert.equal(capabilityAllowed('anything'), false);
});

// critic 的措辞兜底：去掉角色扮演式的"独占一行括号旁白/动作"，但不碰句中正常括号。
import test from 'node:test';
import assert from 'node:assert/strict';
import { critique } from '../src/index.ts';

const ws = { fallback: '我在' } as unknown as Parameters<typeof critique>[1];

test('措辞·去旁白：独占一行的（动作/神态）被删，正文保留', () => {
  const r = critique('（眼睛一下子亮起来，像听见了什么）\n晚饭！\n吃饱了吗？', ws);
  assert.equal(r.verdict, 'accepted');
  assert.equal(r.utterance.includes('（'), false, '括号旁白被删');
  assert.ok(r.utterance.includes('晚饭') && r.utterance.includes('吃饱'), '正文保留');
});

test('措辞·保留句中正常括号（不是旁白）', () => {
  const raw = '我有点累（其实还好），你呢？';
  assert.equal(critique(raw, ws).utterance, raw);
});

test('措辞·整条都是旁白/动作 → 退确定性兜底', () => {
  const r = critique('（轻轻笑）\n（指尖在膝上轻轻一叩）', ws);
  assert.equal(r.verdict, 'fallback');
  assert.equal(r.utterance, '我在');
});

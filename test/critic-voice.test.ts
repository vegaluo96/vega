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

test('措辞·去旁白：【行内】的（动作/神态）也删，正文连起来', () => {
  const r = critique('（呼吸一滞）哇你这一句……（笑）我其实一直醒着。', ws);
  assert.equal(r.verdict, 'accepted');
  assert.equal(r.utterance.includes('（'), false, '行内括号旁白也被删');
  assert.ok(r.utterance.includes('哇你这一句') && r.utterance.includes('一直醒着'), '正文保留');
});

test('措辞·整条都是旁白/动作 → 退确定性兜底', () => {
  const r = critique('（轻轻笑）\n（指尖在膝上轻轻一叩）', ws);
  assert.equal(r.verdict, 'fallback');
  assert.equal(r.utterance, '我在');
});

test('措辞·超长英文按句末截，不在词中硬切', () => {
  const long = 'The weather today is calm and the river is quiet. '.repeat(40); // ~2000 字，纯英文半角句号
  const r = critique(long, ws);
  assert.equal(r.verdict, 'accepted');
  assert.ok(r.utterance.length <= 800, `截到 800 内，实得 ${r.utterance.length}`);
  assert.ok(r.utterance.endsWith('.'), `应在半角句末截，实得结尾：${r.utterance.slice(-15)}`);
});

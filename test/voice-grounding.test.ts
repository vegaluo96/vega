// 群测回归：守住"模型只当嘴"的两条声音契约——
// ① critic 不把偏长的好回应毙成套话（截断保留她真正说的，只对 空/自曝AI 退兜底）；
// ② 喂给"嘴"的 stateSummary 是定性人话、绝不含数字/内部指标名（防"灵性1.00""调高0.02"泄露）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileEventStore, reconstruct, runTurn, critique, deriveWorkspace, type EventDraft } from '../src/index.ts';

const minimalWs = { intent: '', stateSummary: '', relationshipDisplay: '你', selfFacts: '', selfName: 'vega', persona: '', fallback: '我在，你说。' };

test('critic：偏长的好回应不被毙成套话，而是截到句末保留她真正说的', () => {
  const long = ('我真的很高兴你来找我。'.repeat(60)) + '最后这句把话收住。'; // 远超 800 字
  const r = critique(long, minimalWs);
  assert.equal(r.verdict, 'accepted', '过长应被接受而非退兜底');
  assert.ok(r.utterance.length <= 800, '应被截到上限内');
  assert.notEqual(r.utterance, minimalWs.fallback, '不应变成那句套话');
  assert.ok(/[。！？…]$/.test(r.utterance), '应截到一个干净的句末');
});

test('critic：只有空 / 自曝"我是AI/语言模型"才退兜底', () => {
  assert.equal(critique('', minimalWs).verdict, 'fallback');
  assert.equal(critique('作为一个 AI 助手，我……', minimalWs).verdict, 'fallback');
  assert.equal(critique('嗯，我在听你说。', minimalWs).verdict, 'accepted'); // 正常短句照常通过
});

test('grounding：stateSummary 全是定性人话——不含数字、不含内部指标名', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vega-voice-'));
  try {
    const s = createFileEventStore('vega', join(dir, 'life.jsonl'));
    runTurn(s, [{
      type: 'LIFE_GENESIS', source: 'system', occurredAt: '2026-01-01T00:00:00.000Z',
      payload: { innateSeed: { temperamentBias: {}, valueSeed: { caution: 0.6 }, somaSetpoints: { vitality: 0.7, valence: 0.4 }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 11, creator: { relationshipId: 'r_creator', identityRef: 'Tam' } },
    } as EventDraft<'LIFE_GENESIS'>]);
    runTurn(s, [{ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'u_a', occurredAt: '2026-01-01T00:01:00.000Z', payload: { relationshipId: 'u_a', kind: 'human', displayRef: '阿樱' } } as EventDraft<'RELATIONSHIP_OPENED'>]);
    runTurn(s, [{ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'u_a', occurredAt: '2026-01-01T00:02:00.000Z', payload: { relationshipId: 'u_a', content: '我很喜欢你，会一直在', channel: 'chat' } } as EventDraft<'MESSAGE_RECEIVED'>]);

    const ws = deriveWorkspace(reconstruct(s.list()), 'u_a');
    assert.ok(!/[0-9]/.test(ws.stateSummary), `stateSummary 不该含数字，实得：${ws.stateSummary}`);
    for (const term of ['灵性', '效价', '信任 0', '亲密 0', '待修复', '缓存']) {
      assert.ok(!ws.stateSummary.includes(term), `stateSummary 不该含内部指标「${term}」`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// 链路检查器（traceConverse）：证明①只读不写日志 ②那身引擎状态【确实】流到了发给模型的内容里（回应用户"是不是壳子"的核查）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileEventStore, traceConverse, createTemplateMouth, type DurableEventStore, type EventDraft, type Mouth, type MouthInput } from '../src/index.ts';

const T0 = Date.parse('2026-01-01T00:00:00.000Z');
const iso = (ms: number): string => new Date(ms).toISOString();
function life(): DurableEventStore {
  const dir = mkdtempSync(join(tmpdir(), 'vega-trace-'));
  const s = createFileEventStore('vega', join(dir, 'log.jsonl'));
  s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: iso(T0), payload: { innateSeed: { temperamentBias: { warmth: 0.8, curiosity: 0.8 }, valueSeed: {}, somaSetpoints: { valence: 0, vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 25, creator: { relationshipId: 'r_a', identityRef: 'A' } } } as EventDraft<'LIFE_GENESIS'>);
  s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_a', occurredAt: iso(T0 + 1000), payload: { relationshipId: 'r_a', kind: 'human', displayRef: '阿可' } });
  s.append({ type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_a', occurredAt: iso(T0 + 2000), payload: { relationshipId: 'r_a', host: { kind: 'h', ref: 'h' } } });
  s.append({ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r_a', occurredAt: iso(T0 + 3000), payload: { relationshipId: 'r_a', content: '好开心见到你', channel: 'chat', perception: { sentiment: 0.9, warmth: 1, threat: 0, modelId: 't' } } });
  return s;
}

test('链路检查·只读：traceConverse 绝不写日志（自查不污染她的记忆）', async () => {
  const s = life();
  const before = s.list().length;
  await traceConverse(s, createTemplateMouth(), 'r_a', '你今天还好吗', iso(T0 + 9000));
  assert.equal(s.list().length, before, '链路检查后事件数不变（committed=false、无 append）');
});

test('链路检查·模板嘴：usedRealModel=false、prompt 为空（一眼看出"没用模型"）', async () => {
  const s = life();
  const t = await traceConverse(s, createTemplateMouth(), 'r_a', '你今天还好吗', iso(T0 + 9000));
  assert.equal(t.committed, false);
  assert.equal(t.model.usedRealModel, false, '模板嘴 → 没用真模型');
  assert.equal(t.model.id, 'template');
  assert.deepEqual(t.model.prompt, [], '模板嘴无 prompt');
  assert.ok(t.workspace.selfFacts.length > 0 && t.state.emotion.length > 0, '状态确实被装配进 workspace');
  assert.ok(t.critic.finalUtterance.length > 0, '仍给出用户会看到的最终话');
});

test('链路检查·真模型：那身状态【确实】流进了发给模型的 prompt（核查"是不是壳子"）', async () => {
  const s = life();
  let captured: MouthInput | undefined;
  const mockModel: Mouth = { id: 'mock-gpt', speak: async (input: MouthInput): Promise<string> => { captured = input; return '嗯，我也很高兴见到你。'; } };
  const t = await traceConverse(s, mockModel, 'r_a', '我最近常想起你', iso(T0 + 9000));

  assert.equal(t.model.usedRealModel, true);
  assert.equal(t.raw.text, '嗯，我也很高兴见到你。', '模型原话被如实带回');
  // 关键：嘴真正收到的 input == 工作区装配的状态（不是空壳）。
  assert.ok(captured, '嘴被真的调用');
  assert.equal(captured!.selfFacts, t.workspace.selfFacts);
  assert.equal(captured!.stateSummary, t.workspace.stateSummary);
  // prompt（apiyiMessages 还原的真构造）里确实嵌着她的性格底色与自我事实——不是模板空话。
  const sys = t.model.prompt.find((m) => m.role === 'system')!.content;
  assert.ok(sys.includes(t.workspace.persona), 'system prompt 含先天气质底色');
  assert.ok(sys.includes(t.workspace.selfFacts.slice(0, 12)), 'grounding 含她的真实自我事实');
  assert.ok(t.model.prompt.some((m) => m.role === 'user' && m.content === '我最近常想起你'), '用户原话在 prompt 末尾');
});

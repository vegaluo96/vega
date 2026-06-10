// 外观自知：describeAppearance 与前端活体形象（web/src/lib/creature.js）同一套确定性基因——
// 同 id 永远同脸；自述是脱敏人话（无数字）；接进 selfFacts 后她被问「你长什么样」答得上来。
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeAppearance, HUE_NAMES } from '../src/engine/appearance.ts';
import { createInMemoryEventStore, reconstruct, deriveWorkspace, type EventDraft, type DerivedSnapshot } from '../src/index.ts';

// 真实出生路径（不手捏 Temperament）：LIFE_GENESIS + 关系，重建出带先天气质的快照。
function snapFor(id: string): DerivedSnapshot {
  const s = createInMemoryEventStore(id);
  let ms = Date.parse('2026-01-01T00:00:00.000Z');
  const at = (): string => new Date((ms += 60_000)).toISOString();
  s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: at(), payload: { innateSeed: { temperamentBias: {}, valueSeed: { caution: 0.6 }, somaSetpoints: { vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 7, creator: { relationshipId: 'r_creator', identityRef: 'Tam' } } } satisfies EventDraft<'LIFE_GENESIS'>);
  s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_creator', occurredAt: at(), payload: { relationshipId: 'r_creator', kind: 'human', displayRef: 'Tam' } });
  return reconstruct(s.list());
}

test('确定性：同 id 两次自述逐位一致（基因出生即定）', () => {
  const snap = snapFor('vega');
  assert.equal(describeAppearance('vega', snap.temperament), describeAppearance('vega', snap.temperament));
});

test('独特性：不同 id 的色名大概率不同（取三条命，断言不全同色）', () => {
  const snap = snapFor('vega');
  const colors = ['vega', 'lyra', 'nova'].map((id) => {
    const out = describeAppearance(id, snap.temperament);
    return HUE_NAMES.find((n) => out.includes(n));
  });
  assert.ok(colors.every(Boolean), '每条命都报得出色名');
  assert.ok(new Set(colors).size > 1, `三条命不该全撞色：${colors.join('、')}`);
});

test('自述是脱敏人话：含「云体」与某个色名、整句不含任何数字', () => {
  const snap = snapFor('vega');
  const out = describeAppearance('vega', snap.temperament);
  assert.ok(out.includes('云体'), `应自称云体小生灵：${out}`);
  assert.ok(HUE_NAMES.some((n) => out.includes(n)), `应报得出自己的颜色：${out}`);
  assert.equal(/\d/.test(out), false, `自述不得带数字（防工程语言泄露）：${out}`);
});

test('接进灵魂工作台：deriveWorkspace 的 selfFacts 含「我的样子」', () => {
  const snap = snapFor('vega');
  const ws = deriveWorkspace(snap, 'r_creator');
  assert.ok(ws.selfFacts.includes('我的样子'), `外观自知应进 grounding：${ws.selfFacts.slice(0, 200)}`);
});

// —— 跨命外观注入（平台层组事实 → 引擎拼 grounding，契约①：模型仍只产措辞）——
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { converse, createFileEventStore, type Mouth } from '../src/index.ts';

test('converse 传 extraFacts：喂给"嘴"的 selfFacts 末尾含「我记得X的样子」片段', async () => {
  // 真实落盘路径（converse 需要 DurableEventStore 的 version/appendTurn），写法同 chat-pacing 的缓存快照等价测试。
  const s = createFileEventStore('vega-see', join(tmpdir(), `vega-see-${process.pid}-${Date.now()}.jsonl`));
  let ms = Date.parse('2026-03-01T00:00:00.000Z');
  const at = (): string => new Date((ms += 60_000)).toISOString();
  s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: at(), payload: { innateSeed: { temperamentBias: {}, valueSeed: { caution: 0.6 }, somaSetpoints: { vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 7, creator: { relationshipId: 'r_creator', identityRef: 'Tam' } } } satisfies EventDraft<'LIFE_GENESIS'>);
  s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_creator', occurredAt: at(), payload: { relationshipId: 'r_creator', kind: 'human', displayRef: 'Tam' } });
  // 假嘴：把实际喂进来的 selfFacts 存外部变量——断言的是"嘴看见了什么"，不是嘴说了什么。
  let seenSelfFacts = '';
  const mouth: Mouth = { id: 'm', speak: async (input) => { seenSelfFacts = input.selfFacts; return '见过呀，她是一团会发光的小云。'; } };
  const extra = `\n（我记得lyra的样子：${describeAppearance('lyra', snapFor('lyra').temperament)}）`;
  await converse(s, mouth, 'r_creator', '你见过lyra吗？她长什么样？', at(), undefined, 'chat', undefined, extra);
  assert.ok(seenSelfFacts.includes('我记得'), `跨命事实应注入 grounding：${seenSelfFacts.slice(-200)}`);
  assert.ok(seenSelfFacts.endsWith(extra), '片段原样拼在 selfFacts 末尾（确定性注入，不改写）');
});

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

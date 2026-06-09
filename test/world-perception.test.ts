// P2：世界感知（WORLD_PERCEIVED）——真实世界轻轻染色她的状态。
// 守住契约：① 状态只由确定性 appraisal 算（冻结的 perception 或确定性词表，绝不在重放调模型）；
// ② V2 确定性——同一日志重放逐位一致。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileEventStore, reconstruct, runTurn, stateHash, captureCheckpoint, resumeFromCheckpoint, projectState, type EventDraft } from '../src/index.ts';

function tmpStore(id = 'vega'): { s: ReturnType<typeof createFileEventStore>; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'vega-wp-'));
  return { s: createFileEventStore(id, join(dir, 'life.jsonl')), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
let ms = Date.parse('2026-01-01T00:00:00.000Z');
const at = (): string => new Date((ms += 60_000)).toISOString();
const genesis: EventDraft<'LIFE_GENESIS'> = {
  type: 'LIFE_GENESIS', source: 'system', occurredAt: '2026-01-01T00:00:00.000Z',
  payload: { innateSeed: { temperamentBias: {}, valueSeed: { caution: 0.6 }, somaSetpoints: { vitality: 0.7, valence: 0 }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 11, creator: { relationshipId: 'r_creator', identityRef: 'Tam' } },
};
const world = (perception?: { valence: number; arousal: number; relevance: number }): EventDraft<'WORLD_PERCEIVED'> => ({
  type: 'WORLD_PERCEIVED', source: 'autonomous_loop', occurredAt: at(),
  payload: { source: 'example.com', worldKind: 'news', title: '世界发生了一件事', summary: '好 喜欢 期待 温暖', url: 'https://example.com/x', topics: [], perception },
});

test('世界感知：好消息抬升效价、坏消息压低（确定性、轻量、不靠模型）', () => {
  const a = tmpStore(); runTurn(a.s, [genesis]);
  const base = reconstruct(a.s.list()).soma.valence.value;
  runTurn(a.s, [world({ valence: 0.8, arousal: 0.5, relevance: 0.9 })]);
  assert.ok(reconstruct(a.s.list()).soma.valence.value > base, '好消息应抬升 valence');
  a.cleanup();

  const b = tmpStore(); runTurn(b.s, [genesis]);
  const base2 = reconstruct(b.s.list()).soma.valence.value;
  runTurn(b.s, [world({ valence: -0.8, arousal: 0.6, relevance: 0.9 })]);
  assert.ok(reconstruct(b.s.list()).soma.valence.value < base2, '坏消息应压低 valence');
  b.cleanup();
});

test('世界感知：V2 确定性——重放逐位一致，无 perception 也走确定性词表兜底', () => {
  const a = tmpStore(); runTurn(a.s, [genesis]);
  runTurn(a.s, [world({ valence: 0.5, arousal: 0.4, relevance: 0.7 })]);
  runTurn(a.s, [world()]); // 无 perception → 确定性词表（仍不连网）
  const h1 = stateHash(reconstruct(a.s.list()));
  const h2 = stateHash(reconstruct(a.s.list()));
  assert.equal(h1, h2, '同一日志重放两次必须逐位一致（V2）');
  a.cleanup();
});

test('世界感知：染色是【轻】的——一条新闻不该把她推到极端', () => {
  const a = tmpStore(); runTurn(a.s, [genesis]);
  runTurn(a.s, [world({ valence: 1, arousal: 1, relevance: 1 })]);
  const v = reconstruct(a.s.list()).soma.valence.value;
  assert.ok(v > 0 && v < 0.2, `单条世界事件只轻推（实际 ${v}）`);
  a.cleanup();
});

// —— 世界学习（v14）：兴趣/世界观 + 世界记忆 ——
const curiousGenesis: EventDraft<'LIFE_GENESIS'> = {
  type: 'LIFE_GENESIS', source: 'system', occurredAt: '2026-01-01T00:00:00.000Z',
  payload: { innateSeed: { temperamentBias: { curiosity: 0.8 }, valueSeed: {}, somaSetpoints: { vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 14, creator: { relationshipId: 'r_creator', identityRef: 'Tam' } },
};
const worldT = (topics: string[], perception: { valence: number; arousal: number; relevance: number }, title = '世界发生了一件事'): EventDraft<'WORLD_PERCEIVED'> => ({
  type: 'WORLD_PERCEIVED', source: 'autonomous_loop', occurredAt: at(),
  payload: { source: 'example.com', worldKind: 'news', title, summary: '', url: 'https://x/y', topics, perception },
});

test('世界学习：反复读到同一主题 → 兴趣累积、够多够重即 confirmed（持续变聪明）', () => {
  const a = tmpStore(); runTurn(a.s, [curiousGenesis]);
  for (let i = 0; i < 6; i++) runTurn(a.s, [worldT(['天文航天'], { valence: 0.8, arousal: 0.5, relevance: 0.9 }, `天文消息 ${i}`)]);
  const snap = reconstruct(a.s.list());
  const astro = snap.interests.find((it) => it.topic === '天文航天');
  assert.ok(astro, '反复读到的主题应进入兴趣');
  assert.ok(astro!.weight > 0.3 && astro!.episodes === 6, `兴趣应累积（实际 weight=${astro!.weight}, episodes=${astro!.episodes}）`);
  assert.equal(astro!.status, 'confirmed', '反复且够重 → 成为她稳定的一部分');
  a.cleanup();
});

test('世界学习：兴趣会衰减——很久不碰的主题淡出（不是只升不降）', () => {
  const a = tmpStore(); runTurn(a.s, [curiousGenesis]);
  runTurn(a.s, [worldT(['文化艺术'], { valence: 0.7, arousal: 0.4, relevance: 0.8 })]); // 碰一次
  const w1 = reconstruct(a.s.list()).interests.find((i) => i.topic === '文化艺术')!.weight;
  for (let i = 0; i < 10; i++) runTurn(a.s, [worldT(['天文航天'], { valence: 0.6, arousal: 0.4, relevance: 0.7 })]); // 之后一直读别的
  const after = reconstruct(a.s.list()).interests.find((i) => i.topic === '文化艺术');
  assert.ok(!after || after.weight < w1, '久不碰的兴趣应被衰减（甚至淡出）');
  a.cleanup();
});

test('世界记忆：够显著才"记住"（kind:world）、平淡的会忘——多数新闻不留痕（人性）', () => {
  const a = tmpStore(); runTurn(a.s, [curiousGenesis]);
  runTurn(a.s, [worldT(['天文航天'], { valence: 0.9, arousal: 0.7, relevance: 0.9 }, '人类首次拍到黑洞')]); // 显著 → 记住
  runTurn(a.s, [worldT(['社会时事'], { valence: 0.05, arousal: 0.1, relevance: 0.1 }, '某地例行会议')]); // 平淡 → 不留痕
  const mems = reconstruct(a.s.list()).memory.filter((m) => m.kind === 'world');
  assert.equal(mems.length, 1, '只有够显著的世界事件留成记忆');
  assert.ok(mems[0].content.includes('黑洞') && mems[0].topic === '天文航天');
  a.cleanup();
});

test('人生篇章：随生活持续更新——保留近况，不再冻结在最早几条（修 bug）+ growth/becoming 确定性', () => {
  const a = tmpStore(); runTurn(a.s, [curiousGenesis]);
  for (let i = 0; i < 15; i++) runTurn(a.s, [worldT(['天文航天'], { valence: 0.9, arousal: 0.6, relevance: 0.9 }, `星空大事件 ${i}`)]);
  const snap = reconstruct(a.s.list());
  assert.ok(snap.chapters.length > 1 && snap.chapters.length <= 12, '篇章有界、且不止初醒一条');
  assert.ok(snap.chapters.some((c) => c.includes('星空大事件 14')), '最近的转折点必须出现在篇章里（原 bug：slice(0,8) 只保留最早）');
  assert.ok(!snap.chapters.some((c) => c.includes('星空大事件 3')), '中段较早的被让位给近况');
  assert.ok(snap.growth.length > 0 && snap.becoming.length > 0, 'growth/becoming 非空');
  assert.deepEqual(reconstruct(a.s.list()).chapters, snap.chapters, '篇章确定性'); // V2
  assert.equal(reconstruct(a.s.list()).becoming, snap.becoming, 'becoming 确定性');
  a.cleanup();
});

test('世界学习：V2 + 检查点往返——兴趣(Map)/世界记忆经 serialize→deserialize 逐位一致', () => {
  const a = tmpStore(); runTurn(a.s, [curiousGenesis]);
  for (let i = 0; i < 5; i++) runTurn(a.s, [worldT(['科技', '科学'], { valence: 0.6, arousal: 0.4, relevance: 0.8 }, `科技 ${i}`)]);
  const all = a.s.list();
  const full = stateHash(reconstruct(all));
  const cp = captureCheckpoint(all);              // serialize（Map→数组）
  const rs = resumeFromCheckpoint(cp);            // deserialize（数组→Map）
  const viaCp = stateHash(projectState(rs.st, rs.uptoSeq));
  assert.equal(viaCp, full, '检查点往返后投影必须与全量重建逐位一致（兴趣 Map 不能在落盘时丢）');
  a.cleanup();
});

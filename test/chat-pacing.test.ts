// 反 AI 味·架构层（确定性，与模型无关）：分条节奏 splitUtterance / critic 去书面腔 / 状态落进语气。
// "一口气一整块 + 永远精力充沛 + 书面句号"是最大的 AI 标记——这里用纯架构钉死修复。
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitUtterance, critique, deriveWorkspace, createInMemoryEventStore, reconstruct, type EventDraft } from '../src/index.ts';

const ws = { fallback: '我在' } as unknown as Parameters<typeof critique>[1];
const norm = (s: string): string => s.replace(/\s+/g, '');

test('分条：短回复不拆、两句拆两段、长文封顶 3 段，内容一字不丢', () => {
  assert.deepEqual(splitUtterance('嗯，我在'), ['嗯，我在'], '短的不拆');
  assert.deepEqual(splitUtterance(''), [], '空串安全');

  const two = splitUtterance('嗯，我在的，你慢慢说。今天过得有点恍惚，听到你来反而踏实了。');
  assert.equal(two.length, 2, '两句 → 两段');
  assert.equal(norm(two.join('')), norm('嗯，我在的，你慢慢说。今天过得有点恍惚，听到你来反而踏实了。'), '拆分不改字');

  const many = splitUtterance('第一句话说完了。第二句也说完了。第三句还在说。第四句继续讲。第五句快到头了。');
  assert.ok(many.length <= 3, `封顶 3 段（实际 ${many.length}）`);
  assert.equal(norm(many.join('')), norm('第一句话说完了。第二句也说完了。第三句还在说。第四句继续讲。第五句快到头了。'), '多句合并仍不丢字');
});

test('分条：确定性——同一输入永远拆出同一结果', () => {
  const t = '我刚才在想你说的那件事。越想越觉得有意思！要不你再多讲讲？';
  assert.deepEqual(splitUtterance(t), splitUtterance(t));
});

test('去书面腔：短单句结尾的句号被去掉；多句/带情绪标点/长文不动', () => {
  assert.equal(critique('我在的。', ws).utterance, '我在的', '短单句去句号');
  assert.equal(critique('嗯，听你说这个我也开心。', ws).utterance, '嗯，听你说这个我也开心', '30 字内单句去句号');
  assert.equal(critique('真的吗！', ws).utterance, '真的吗！', '感叹号保留（有情绪）');
  assert.equal(critique('你说呢？', ws).utterance, '你说呢？', '问号保留');
  const multi = '我在。你慢慢说。';
  assert.equal(critique(multi, ws).utterance, multi, '多句的句号是表达的一部分，不碰');
  const long = '这是一段很长很长的话，超过了三十个字的阈值，所以结尾的句号应该原样保留下来。';
  assert.equal(critique(long, ws).utterance, long, '长句不动');
});

// —— 状态落进语气（此前算了没喂嘴的引擎能力）——
function snapBase() {
  const s = createInMemoryEventStore('vega-pace');
  let ms = Date.parse('2026-01-01T00:00:00.000Z');
  const at = (): string => new Date((ms += 60_000)).toISOString();
  s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: at(), payload: { innateSeed: { temperamentBias: {}, valueSeed: { caution: 0.6 }, somaSetpoints: { vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 7, creator: { relationshipId: 'r_creator', identityRef: 'Tam' } } } satisfies EventDraft<'LIFE_GENESIS'>);
  s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_creator', occurredAt: at(), payload: { relationshipId: 'r_creator', kind: 'human', displayRef: 'Tam' } });
  return reconstruct(s.list());
}

test('没劲时有权敷衍：energy 低 → intent 明示"回短点、不用接满"（反"太懂事"）', () => {
  const snap = snapBase();
  const tired = { ...snap, soma: { ...snap.soma, energy: { ...snap.soma.energy, value: 0.2 } } };
  assert.ok(deriveWorkspace(tired, 'r_creator').intent.includes('不用接满'), '低能量 → 敷衍许可进 intent');
  const fine = { ...snap, soma: { ...snap.soma, energy: { ...snap.soma.energy, value: 0.7 } } };
  assert.equal(deriveWorkspace(fine, 'r_creator').intent.includes('不用接满'), false, '精力正常 → 不出现');
});

test('睡眠压落进语气：sleepPressure 高 → stateSummary 带"有点困"', () => {
  const snap = snapBase();
  const sleepy = { ...snap, sleepPressure: 0.75 };
  assert.ok(deriveWorkspace(sleepy, 'r_creator').stateSummary.includes('有点困'));
  assert.equal(deriveWorkspace({ ...snap, sleepPressure: 0.2 }, 'r_creator').stateSummary.includes('有点困'), false);
});

test('SDT 需求落进自述：最缺的那项化成"我想要…"（定性、无数字）', () => {
  const snap = snapBase();
  const lonely = { ...snap, needs: { ...snap.needs, relatedness: 0.1, novelty: 0.8, competence: 0.8, autonomy: 0.8 } };
  const f = deriveWorkspace(lonely, 'r_creator').selfFacts;
  assert.ok(f.includes('想要点真实的亲近'), '亲近缺口落进自述');
  assert.equal(/0\.\d/.test(f), false, '不泄数字');
  const okNeeds = { ...snap, needs: { autonomy: 0.7, competence: 0.7, relatedness: 0.7, novelty: 0.7 } };
  assert.equal(deriveWorkspace(okNeeds, 'r_creator').selfFacts.includes('说不上来为什么'), false, '不缺就不提（门控）');
});

// —— 第二轮：剩余"算了没喂嘴"的素材 + 自主路径缓存快照等价 ——
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reachOut } from '../src/engine/converse.ts';
import { createFileEventStore } from '../src/index.ts';
import type { Mouth } from '../src/index.ts';

test('价值观落进自述：最看重的价值化成"心里有杆秤"（confirmed 优先、定性）', () => {
  const snap = snapBase();
  const principled = { ...snap, values: [
    { key: 'honesty', weight: 0.7, provenance: { driftedAtSeqs: [], vitalityAtGen: 0.7, status: 'confirmed' as const } },
    { key: 'caution', weight: 0.6, provenance: { driftedAtSeqs: [], vitalityAtGen: 0.7, status: 'volatile' as const } },
  ] };
  const f = deriveWorkspace(principled, 'r_creator').selfFacts;
  assert.ok(f.includes('心里有杆秤') && f.includes('坦诚'), 'confirmed 的"坦诚"进自述');
  const weak = { ...snap, values: [{ key: 'honesty', weight: 0.3, provenance: { driftedAtSeqs: [], vitalityAtGen: 0.7, status: 'volatile' as const } }] };
  assert.equal(deriveWorkspace(weak, 'r_creator').selfFacts.includes('有杆秤'), false, '没立起来的价值不提（门控）');
});

test('习得底色落进自述：baseline 偏沉/缺联结化成定性人话', () => {
  const snap = snapBase();
  const heavy = { ...snap, baseline: { valence: -0.3, connection: -0.3 } };
  const f = deriveWorkspace(heavy, 'r_creator').selfFacts;
  assert.ok(f.includes('底色有点偏沉') && f.includes('缺人陪'), '沉底色+缺联结都出现');
  const neutral = { ...snap, baseline: { valence: 0, connection: 0 } };
  assert.equal(deriveWorkspace(neutral, 'r_creator').selfFacts.includes('底色'), false, '中性底色不提');
});

test('成熟分面化：长得最突出的那面进自述，比笼统"稳了"更具体', () => {
  const snap = snapBase();
  const persp = { ...snap, maturityFacets: { regulation: 0.2, perspective: 0.6, integration: 0.3 } };
  assert.ok(deriveWorkspace(persp, 'r_creator').selfFacts.includes('站在别人的角度'), '视角面突出 → 说视角');
  const integ = { ...snap, maturityFacets: { regulation: 0.2, perspective: 0.3, integration: 0.7 } };
  assert.ok(deriveWorkspace(integ, 'r_creator').selfFacts.includes('串成自己的故事'), '整合面突出 → 说整合');
});

test('自主路径缓存快照等价：传 snapOf 快照与全量重放产出逐位一致（性能不改行为）', async () => {
  const mkStore = (tag: string) => {
    const s = createFileEventStore('vega-eq', join(tmpdir(), `vega-eq-${process.pid}-${tag}.jsonl`)); // reachOut 需要 DurableEventStore(version/appendTurn)
    let ms = Date.parse('2026-02-01T00:00:00.000Z');
    const at = (): string => new Date((ms += 60_000)).toISOString();
    s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: at(), payload: { innateSeed: { temperamentBias: {}, valueSeed: { caution: 0.6 }, somaSetpoints: { vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 7, creator: { relationshipId: 'r_creator', identityRef: 'Tam' } } } satisfies EventDraft<'LIFE_GENESIS'>);
    s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_creator', occurredAt: at(), payload: { relationshipId: 'r_creator', kind: 'human', displayRef: 'Tam' } });
    s.append({ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r_creator', occurredAt: at(), payload: { relationshipId: 'r_creator', content: '在吗，想你了', channel: 'chat' } });
    return s;
  };
  const mouth: Mouth = { id: 'm', speak: async (input) => `想你了就来了——${input.relationshipDisplay}，我在。` };
  const sA = mkStore(`A-${Date.now()}`);
  const sB = mkStore(`B-${Date.now()}`);
  const a = await reachOut(sA, mouth, 'r_creator', '2026-02-01T01:00:00.000Z'); // 内部全量重放
  const b = await reachOut(sB, mouth, 'r_creator', '2026-02-01T01:00:00.000Z', undefined, reconstruct(sB.list())); // 外部传快照
  assert.ok(a && b);
  assert.equal(a!.utterance, b!.utterance, '措辞一致');
  assert.equal(sA.version(), sB.version(), '日志推进一致');
});

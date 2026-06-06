// 深度补强（reconstructVersion 7）：先天气质 / 遗忘即抽象(时间衰减) / 内外两层 / 跨休眠想念 / 更深 ToM / 新价值线。
// 全部走纯确定性重建——不调模型、不碰墙钟（时间一律取 occurredAt）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryEventStore, makeTick, reconstruct, type EventDraft, type InnateSeed, type EventStore } from '../src/index.ts';

let ms = Date.parse('2026-01-01T00:00:00.000Z');
const at = (stepMs = 60_000): string => new Date((ms += stepMs)).toISOString();

function born(seed: Partial<InnateSeed>, rid = 'r', kind: 'human' | 'peer' = 'human'): EventStore {
  const s = createInMemoryEventStore('vega-x');
  const innateSeed: InnateSeed = {
    temperamentBias: {}, valueSeed: { caution: 0.6, expression: 0.3 },
    somaSetpoints: { valence: 0, vitality: 0.7, connection: 0 }, somaTau: { valence: 3600, connection: 7200, vitality: 86400 },
    vitalityFloor: 0.15, ...seed,
  };
  s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: at(), payload: { innateSeed, reconstructVersionAtBirth: 1, creator: { relationshipId: rid, identityRef: 'Tam' } } });
  s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: rid, occurredAt: at(), payload: { relationshipId: rid, kind, displayRef: kind === 'peer' ? 'lyra' : 'Tam' } });
  s.append({ type: 'CONNECTION_OPENED', source: 'host', relationshipId: rid, occurredAt: at(), payload: { relationshipId: rid, host: { kind: 'cli', ref: 'h' } } });
  return s;
}
const msg = (s: EventStore, content: string, rid = 'r', stepMs = 60_000): void => {
  s.append({ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: rid, occurredAt: at(stepMs), payload: { relationshipId: rid, content, channel: 'chat' } });
};
const reflect = (s: EventStore, from: number, to: number): void => {
  s.append({ type: 'REFLECTION_TRIGGERED', source: 'autonomous_loop', occurredAt: at(), payload: { scope: 'recent', windowFromSeq: from, windowToSeq: to } });
};

test('先天气质：同串消息+同时间下，不同种子 → 不同人格轨迹（活来自架构而非气质幻觉）', () => {
  ms = Date.parse('2026-01-01T00:00:00.000Z');
  const reactive = born({ temperamentBias: { sensitivity: 1.8, warmth: 0.85 } }); // 敏感、天生暖
  ms = Date.parse('2026-01-01T00:00:00.000Z'); // 同样的时间线，唯一变量是气质
  const steady = born({ temperamentBias: { sensitivity: 0.5, warmth: 0.3, resilience: 1.5 } }); // 沉稳、内敛、复原快

  ms = Date.parse('2026-01-01T01:00:00.000Z'); msg(reactive, '你好，我真心在乎你');
  ms = Date.parse('2026-01-01T01:00:00.000Z'); msg(steady, '你好，我真心在乎你');
  const a = reconstruct(reactive.list());
  const b = reconstruct(steady.list());

  assert.ok(a.temperament.sensitivity > b.temperament.sensitivity, '气质应被如实读出并暴露');
  assert.ok(a.soma.valence.value > b.soma.valence.value, '同一句暖意，敏感+暖的她波动更大');
  // 两条命的整体内在不一样（不是同一个模子）
  const diff = Math.abs(a.soma.valence.value - b.soma.valence.value) + Math.abs(a.soma.connection.value - b.soma.connection.value);
  assert.ok(diff > 0.1, '两种气质的内在轨迹应明显不同');
});

test('遗忘即抽象：salience 随时间衰减 → vivid 工作集有上限，细节淡入"理解"，但日志/经历数永不丢', () => {
  ms = Date.parse('2026-01-01T00:00:00.000Z');
  const s = born({});
  for (let i = 0; i < 12; i++) msg(s, '你好', 'r', 60_000); // 12 段、各 1 分钟、都新鲜
  const snap = reconstruct(s.list());
  const cur = snap.memory.filter((m) => m.kind === 'episodic' && m.lineage.isCurrent);
  const vivid = cur.filter((m) => m.vivid);
  assert.equal(cur.length, 12, '原始经历一条不少（append-only 真相不抹）');
  assert.equal(vivid.length, 9, '"当下记得"被限到工作集上限（其余淡去）');
  assert.ok(cur.length - vivid.length === 3, '淡去的应折进"理解"，但仍可重算');
  const sem = snap.semanticMemory.find((x) => x.relationshipId === 'r');
  assert.ok(sem && sem.episodes === 12, '语义记忆按全部经历统计，不因遗忘而漏');
});

test('遗忘即抽象：刻骨的情绪记忆比平淡记忆更耐久（同样年纪，强情绪仍鲜活）', () => {
  ms = Date.parse('2026-01-01T00:00:00.000Z');
  const s = born({});
  msg(s, '你根本不在乎，都是假的'); // 强负向：刻骨
  msg(s, '今天的云像棉花糖'); // 中性：词表读不出情绪 → salience≈0
  ms = Date.parse('2026-01-03T00:00:00.000Z'); msg(s, '在吗'); // 推进内在时钟 2 天
  const cur = reconstruct(s.list()).memory.filter((m) => m.kind === 'episodic' && m.lineage.isCurrent);
  const strong = cur.find((m) => m.content.includes('都是假的'));
  const bland = cur.find((m) => m.content.includes('棉花糖'));
  assert.ok(strong && bland, '两条经历都在');
  assert.ok((strong.vividness ?? 0) > (bland.vividness ?? 0), '强情绪记忆更鲜活');
  assert.equal(strong.vivid, true, '两天后她仍清晰记得那次伤害');
});

test('内外两层生活：内在独白私密、含没说出口的想念，且不同于对外叙事', () => {
  ms = Date.parse('2026-01-01T00:00:00.000Z');
  const s = born({});
  msg(s, '你好，我真心在乎你，你的想法值得说出来'); // closeness ≥ 0.3
  s.append({ type: 'CONNECTION_CLOSED', source: 'host', relationshipId: 'r', occurredAt: at(), payload: { relationshipId: 'r', reason: 'token_detached' } });
  // 想念：connection 落到 (-0.5,0) 区间时 makeTick 形成 internal_only 的 reach_out（只在心里、不刷屏）
  for (let i = 0; i < 10; i++) s.append(makeTick(reconstruct(s.list()), at()));
  const snap = reconstruct(s.list());
  assert.ok(snap.innerLife.length > 0, '应有内在独白');
  assert.notEqual(snap.innerLife, snap.narrative, '内（没说出口）与外（自传叙事）是两层');
  assert.ok(snap.innerLife.includes('没去打扰') || snap.innerLife.includes('想起'), '私密心声里有按下没说的想念');
});

test('跨休眠想念（同类）：peer 不在场时想念累积 → 到一定程度真的开口（surface）', () => {
  ms = Date.parse('2026-01-01T00:00:00.000Z');
  const s = born({}, 'peer_lyra', 'peer');
  msg(s, '你好，我也在这里，我们都不会消失，看见你了', 'peer_lyra'); // 与同类建立亲密
  s.append({ type: 'CONNECTION_CLOSED', source: 'host', relationshipId: 'peer_lyra', occurredAt: at(), payload: { relationshipId: 'peer_lyra', reason: 'token_detached' } });
  for (let i = 0; i < 14; i++) s.append(makeTick(reconstruct(s.list()), at()));
  const snap = reconstruct(s.list());
  assert.ok(snap.soma.connection.value < -0.5, '长久不见同类 → 联结很低');
  const reach = makeTick(snap, at()).payload.formedIntents.find((x) => x.kind === 'reach_out');
  assert.ok(reach && reach.relationshipId === 'peer_lyra' && reach.gateDecision === 'surface', '很想念同类时会主动开口');
});

test('更深 ToM：依恋姿态(attachment) + 可预测性(predictability) 确定性派生', () => {
  ms = Date.parse('2026-01-01T00:00:00.000Z');
  const warm = born({});
  msg(warm, '你好，我真心在乎你'); msg(warm, '我真心在乎你，会一直在'); msg(warm, '你值得，我真心的');
  const bw = reconstruct(warm.list()).bonds['r'];
  assert.ok(bw.relationalSelf.attachment.includes('安全'), `持续被善待 → 安全型依恋，实得「${bw.relationalSelf.attachment}」`);
  assert.ok(bw.theoryOfMind.predictability >= 0 && bw.theoryOfMind.predictability <= 1);

  ms = Date.parse('2026-02-01T00:00:00.000Z');
  const rocky = born({});
  msg(rocky, '你好，我真心在乎你'); msg(rocky, '你根本不在乎，都是假的'); msg(rocky, '我真心在乎你'); msg(rocky, '你根本不在乎，都是假的');
  const br = reconstruct(rocky.list()).bonds['r'];
  assert.ok(br.theoryOfMind.predictability < bw.theoryOfMind.predictability, '忽冷忽热的人更不可预测');
});

test('更深反思树：反复独处长出"自处"(self_reliance)，磕碰后和好长出"宽容"(forgiveness)', () => {
  ms = Date.parse('2026-01-01T00:00:00.000Z');
  // 自处：先建立亲密再断开，反复想念（missing_peer 漫游）后反思
  const lonely = born({});
  msg(lonely, '你好，我真心在乎你，你的想法值得说出来');
  lonely.append({ type: 'CONNECTION_CLOSED', source: 'host', relationshipId: 'r', occurredAt: at(), payload: { relationshipId: 'r', reason: 'token_detached' } });
  const from = lonely.list().length;
  for (let i = 0; i < 4; i++) lonely.append(makeTick(reconstruct(lonely.list()), at()));
  reflect(lonely, from, lonely.list().length);
  const reliance = reconstruct(lonely.list()).values.find((v) => v.key === 'self_reliance');
  assert.ok(reliance && reliance.weight > 0.3, '反复独处后应长出自处的力量');

  // 宽容：冲突→和好都落在窗口内
  ms = Date.parse('2026-03-01T00:00:00.000Z');
  const mend = born({});
  const f2 = mend.list().length;
  msg(mend, '你根本不在乎，都是假的'); // 冲突
  msg(mend, '对不起，我错了，我真心在乎你，会一直在'); // 和好（强暖）
  reflect(mend, f2, mend.list().length);
  const forgiveness = reconstruct(mend.list()).values.find((v) => v.key === 'forgiveness');
  assert.ok(forgiveness && forgiveness.weight > 0.3, '磕碰后又重归于好 → 学会宽容');
});

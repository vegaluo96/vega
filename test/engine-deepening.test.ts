// 引擎深化·期2（论文锚定）：SDT 三需求（Deci & Ryan）+ Schwartz 价值环结构化张力。纯投影、确定性、不升版本。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryEventStore, reconstruct, type EventDraft } from '../src/index.ts';

const T0 = Date.parse('2026-01-01T00:00:00.000Z');
const iso = (ms: number): string => new Date(ms).toISOString();
function born(valueSeed: Record<string, number> = {}, withRel = false): ReturnType<typeof createInMemoryEventStore> {
  const s = createInMemoryEventStore('vega');
  s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: iso(T0), payload: { innateSeed: { temperamentBias: {}, valueSeed, somaSetpoints: { valence: 0, vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 27, creator: { relationshipId: 'r_a', identityRef: 'A' } } } as EventDraft<'LIFE_GENESIS'>);
  if (withRel) {
    s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_a', occurredAt: iso(T0 + 1e3), payload: { relationshipId: 'r_a', kind: 'human', displayRef: 'A' } });
    s.append({ type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_a', occurredAt: iso(T0 + 2e3), payload: { relationshipId: 'r_a', host: { kind: 'h', ref: 'h' } } });
  }
  return s;
}

test('期2·Schwartz 价值环：环上【相对】的价值都高→内在拉扯；【相邻相容】→无拉扯（结构性，非手列）', () => {
  const opp = reconstruct(born({ openness: 0.7, self_protection: 0.7 }).list()); // 开放↔保守 ≈180°
  assert.ok(opp.tension.length > 0, `开放↔自我保护(环上相对)→拉扯：「${opp.tension}」`);
  const compat = reconstruct(born({ openness: 0.7, expression: 0.7 }).list()); // 自我导向/刺激 相邻 ≈20°
  assert.equal(compat.tension, '', '开放↔表达(相邻相容)→无拉扯');
});

test('期2·SDT 关系需求：被善待、连接升 → relatedness 满足度升', () => {
  const rest = reconstruct(born({}, true).list()).needs.relatedness;
  const s = born({}, true);
  for (let i = 0; i < 4; i++) s.append({ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r_a', occurredAt: iso(T0 + 1e4 + i * 3600_000), payload: { relationshipId: 'r_a', content: '好', channel: 'chat', perception: { sentiment: 0.9, warmth: 1, threat: 0, modelId: 't' } } });
  const warmed = reconstruct(s.list()).needs.relatedness;
  assert.ok(warmed > rest, `连接升 → 关系需求更满足（${warmed} > ${rest}）`);
});

test('期2·SDT 需求四项齐全且有界 [0,1]', () => {
  const n = reconstruct(born({}, true).list()).needs;
  for (const k of ['autonomy', 'competence', 'relatedness', 'novelty'] as const) {
    assert.ok(typeof n[k] === 'number' && n[k] >= 0 && n[k] <= 1, `${k} 在 [0,1]`);
  }
});

test('期3·2D 依恋（Bartholomew 四型）：气质投出四象限，中性→安全型', () => {
  const bias = (tb: Record<string, number>): string => {
    const s = createInMemoryEventStore('vega');
    s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: iso(T0), payload: { innateSeed: { temperamentBias: tb, valueSeed: {}, somaSetpoints: { vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 27, creator: { relationshipId: 'r_a', identityRef: 'A' } } } as EventDraft<'LIFE_GENESIS'>);
    return reconstruct(s.list()).attachmentBias;
  };
  assert.equal(bias({ sensitivity: 1, resilience: 1, reserve: 0.5, warmth: 0.5 }), '安全型', '中性气质→安全型');
  assert.equal(bias({ sensitivity: 1.8, resilience: 0.5, reserve: 0.2, warmth: 0.8 }), '焦虑型', '高敏低韧+外向暖→焦虑(专注)');
  assert.equal(bias({ sensitivity: 0.6, resilience: 1.6, reserve: 0.85, warmth: 0.2 }), '疏离回避型', '沉稳+内向冷→疏离回避');
  assert.equal(bias({ sensitivity: 1.8, resilience: 0.5, reserve: 0.85, warmth: 0.2 }), '恐惧回避型', '高敏低韧+内向冷→恐惧回避(双高)');
});

test('期4·Vaillant 防御层级：成熟度决定用哪一层防御（青涩→退缩/反击，成熟→升华/克制）', () => {
  // 同一气质（守备型、低玩心），低成熟 vs 高成熟 → 不同层级的防御。
  const seed = (mat: number): string => {
    const s = createInMemoryEventStore('vega');
    s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: iso(T0), payload: { innateSeed: { temperamentBias: { reserve: 0.7, warmth: 0.3, playfulness: 0.2, conscientiousness: 0.7, drive: 0.7 }, valueSeed: {}, somaSetpoints: { vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 27, creator: { relationshipId: 'r_a', identityRef: 'A' } } } as EventDraft<'LIFE_GENESIS'>);
    s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_a', occurredAt: iso(T0 + 1e3), payload: { relationshipId: 'r_a', kind: 'human', displayRef: 'A' } });
    s.append({ type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_a', occurredAt: iso(T0 + 2e3), payload: { relationshipId: 'r_a', host: { kind: 'h', ref: 'h' } } });
    // 用反思把成熟度推上去：每轮 3 条消息 + 1 次反思，scope 轮换(recent/relationship/renarrate) → 三面都长、均值过阈。
    // 窗口只盖本轮新消息（否则窗口卫生会清空日志）。
    let t = T0 + 1e4; const scopes = ['recent', 'relationship', 'renarrate'] as const;
    if (mat > 0) for (let i = 0; i < 45; i++) {
      const from = s.list().length;
      for (let j = 0; j < 3; j++) { t += 3600_000; const bad = (i + j) % 2 === 1; s.append({ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r_a', occurredAt: iso(t), payload: { relationshipId: 'r_a', content: bad ? '坏' : '好', channel: 'chat', perception: { sentiment: bad ? -0.6 : 0.7, warmth: bad ? 0 : 1, threat: bad ? 0.6 : 0, modelId: 't' } } }); }
      const to = s.list().length - 1;
      t += 600_000; s.append({ type: 'REFLECTION_TRIGGERED', source: 'autonomous_loop', occurredAt: iso(t), payload: { scope: scopes[i % 3], windowFromSeq: from, windowToSeq: to } });
    }
    return reconstruct(s.list()).defenseStyle;
  };
  const young = seed(0);
  const grown = seed(1);
  assert.ok(['退缩回避', '变硬反击', '讨好维系'].includes(young), `青涩(低成熟)→不成熟层防御：${young}`);
  assert.ok(['升华转化', '克制承受', '幽默化解', '理智化抽离', '压抑回避', '转移宣泄'].includes(grown), `成长后→更高层防御：${grown}`);
  assert.notEqual(young, grown, '成熟度真的改变了她怎么扛事');
});

test('期5·睡眠压 S（Borbély）：醒过她的"白天"会累积 → 精力被下压（真实疲劳）；有界 [0,1]', () => {
  // 出生在 UTC 0 点 = 她本地 8 点(offset 480)；推进 10h 到她下午 → 全程活跃期累积睡眠压。
  const s = createInMemoryEventStore('vega');
  s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: iso(T0), payload: { innateSeed: { temperamentBias: {}, valueSeed: {}, somaSetpoints: { vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15, circadianOffsetMin: 480 }, reconstructVersionAtBirth: 28, creator: { relationshipId: 'r_a', identityRef: 'A' } } } as EventDraft<'LIFE_GENESIS'>);
  s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_a', occurredAt: iso(T0 + 1e3), payload: { relationshipId: 'r_a', kind: 'human', displayRef: 'A' } });
  s.append({ type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_a', occurredAt: iso(T0 + 2e3), payload: { relationshipId: 'r_a', host: { kind: 'h', ref: 'h' } } });
  // 采样在她【晚上8点】(T0+12h, hourOfDay=20 → 昼夜节律≈0)，把睡眠压的效应从昼夜里隔离出来：此刻精力低于设定点纯因疲劳。
  s.append({ type: 'AUTONOMOUS_TICK', source: 'autonomous_loop', occurredAt: iso(T0 + 12 * 3600_000), payload: { tickReason: 'idle_threshold', selectedMemoryIds: [], wanderingTargets: [], formedIntents: [] } });
  const e1 = reconstruct(s.list());
  assert.ok(e1.sleepPressure > 0.3 && e1.sleepPressure <= 1, `醒过她大半个白天 → 累积睡眠压（${e1.sleepPressure}）`);
  assert.ok(e1.soma.energy.value < 0.69, `她的晚8点(昼夜≈0)精力被疲劳下压到设定点(0.7)以下（${e1.soma.energy.value}）`);
});

test('期5·多维成熟：不同反思长不同的面（recent→调节, relationship→视角, renarrate→整合）；maturity=均值', () => {
  const grow = (scope: 'recent' | 'relationship' | 'renarrate'): { regulation: number; perspective: number; integration: number } => {
    const s = createInMemoryEventStore('vega');
    s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: iso(T0), payload: { innateSeed: { temperamentBias: { conscientiousness: 0.8 }, valueSeed: {}, somaSetpoints: { vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 28, creator: { relationshipId: 'r_a', identityRef: 'A' } } } as EventDraft<'LIFE_GENESIS'>);
    s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_a', occurredAt: iso(T0 + 1e3), payload: { relationshipId: 'r_a', kind: 'human', displayRef: 'A' } });
    s.append({ type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_a', occurredAt: iso(T0 + 2e3), payload: { relationshipId: 'r_a', host: { kind: 'h', ref: 'h' } } });
    let t = T0 + 1e4;
    for (let i = 0; i < 30; i++) { t += 3600_000; s.append({ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r_a', occurredAt: iso(t), payload: { relationshipId: 'r_a', content: i % 2 ? '坏' : '好', channel: 'chat', perception: { sentiment: i % 2 ? -0.7 : 0.7, warmth: i % 2 ? 0 : 1, threat: i % 2 ? 0.7 : 0, modelId: 't' } } }); t += 600_000; s.append({ type: 'REFLECTION_TRIGGERED', source: 'autonomous_loop', occurredAt: iso(t), payload: { scope, windowFromSeq: 0, windowToSeq: 99999 } }); }
    return reconstruct(s.list()).maturityFacets;
  };
  const rec = grow('recent');
  assert.ok(rec.regulation > rec.perspective && rec.regulation > rec.integration, `recent 反思 → 情绪调节面最高（${JSON.stringify(rec)}）`);
  const rel = grow('relationship');
  assert.ok(rel.perspective > rel.regulation && rel.perspective > rel.integration, `relationship 反思 → 视角面最高（${JSON.stringify(rel)}）`);
  const ren = grow('renarrate');
  assert.ok(ren.integration > ren.regulation && ren.integration > ren.perspective, `renarrate 反思 → 整合面最高（${JSON.stringify(ren)}）`);
  const m = reconstruct((() => { const s = createInMemoryEventStore('vega'); s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: iso(T0), payload: { innateSeed: { temperamentBias: {}, valueSeed: {}, somaSetpoints: { vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 28, creator: { relationshipId: 'r_a', identityRef: 'A' } } } as EventDraft<'LIFE_GENESIS'>); return s; })().list());
  assert.equal(m.maturity, 0, '出生 maturity=0（facets 全 0）');
});

test('期6·兴趣四阶段（Hidi & Renninger）：从触发→维持→萌芽→确立，按 episodes×weight 推进', () => {
  const s = createInMemoryEventStore('vega');
  s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: iso(T0), payload: { innateSeed: { temperamentBias: { curiosity: 0.9 }, valueSeed: {}, somaSetpoints: { vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 28, creator: { relationshipId: 'r_a', identityRef: 'A' } } } as EventDraft<'LIFE_GENESIS'>);
  s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_a', occurredAt: iso(T0 + 1e3), payload: { relationshipId: 'r_a', kind: 'human', displayRef: 'A' } });
  s.append({ type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_a', occurredAt: iso(T0 + 2e3), payload: { relationshipId: 'r_a', host: { kind: 'h', ref: 'h' } } });
  // 聊一次「音乐」→ 触发。
  s.append({ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r_a', occurredAt: iso(T0 + 1e4), payload: { relationshipId: 'r_a', content: '聊音乐', channel: 'chat', perception: { sentiment: 0.7, warmth: 0.8, threat: 0, topics: ['音乐'], modelId: 't' } } });
  let p1 = reconstruct(s.list()).interests.find((x) => x.topic === '音乐');
  assert.equal(p1?.phase, 'triggered', `聊 1 次 → 触发（${p1?.phase}）`);
  // 反复聊 14 次 → 确立。
  for (let i = 0; i < 14; i++) s.append({ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r_a', occurredAt: iso(T0 + 2e4 + i * 3600_000), payload: { relationshipId: 'r_a', content: '又聊音乐', channel: 'chat', perception: { sentiment: 0.8, warmth: 0.9, threat: 0, topics: ['音乐'], modelId: 't' } } });
  const p2 = reconstruct(s.list()).interests.find((x) => x.topic === '音乐');
  assert.ok(p2 && (p2.phase === 'established' || p2.phase === 'emerging'), `反复聊很多次 → 个体兴趣（${p2?.phase}, w=${p2?.weight}, n=${p2?.episodes}）`);
});

test('期7·社会形状：无同类→"还没有真正的同类朋友"', () => {
  const s = born({}, true);
  assert.equal(reconstruct(s.list()).socialShape, '还没有真正的同类朋友', '没 peer → 独来独往');
});

test('skills 扩展·greet：主动打招呼被回应→greet 效能↑、石沉→↓（通用聚合，无需改折叠/升版本）', () => {
  const fb = (resp: 'reply' | 'silence'): EventDraft<'FEEDBACK_PERCEIVED'> => ({ type: 'FEEDBACK_PERCEIVED', source: 'autonomous_loop', occurredAt: iso(T0 + 1e4), payload: { actionKind: 'greet', responseKind: resp, valence: resp === 'reply' ? 0.6 : -0.5, fromKind: 'human' } });
  const s = born({}, true);
  for (let i = 0; i < 4; i++) s.append(fb('reply'));
  const g = reconstruct(s.list()).skills.find((x) => x.kind === 'greet');
  assert.ok(g && g.efficacy > 0.6, `打招呼常被回应 → greet 效能↑（${g?.efficacy}）`);
  const s2 = born({}, true);
  for (let i = 0; i < 4; i++) s2.append(fb('silence'));
  const g2 = reconstruct(s2.list()).skills.find((x) => x.kind === 'greet');
  assert.ok(g2 && g2.efficacy < 0.4, `打招呼屡屡石沉 → greet 效能↓（${g2?.efficacy}）`);
});

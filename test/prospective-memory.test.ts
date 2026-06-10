// 前瞻记忆（v29·机制一，锚 prospective memory）："周五有面试"→ 到周五被惦记、主动来问。
// 纯架构能力：捕捉冻进事件、到期由折叠内纯函数推算、跨回合存活——裸模型永远没有。全确定性、可重放。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceState, captureCheckpoint, createInMemoryEventStore, deriveWorkspace, makeTick,
  projectState, reconstruct, resolveDueMs, resumeFromCheckpoint, stateHash,
  type Checkpoint, type EventDraft, type EventStore, type Perception,
} from '../src/index.ts';

// 缺省时区 480（UTC+8）。2026-06-08 是周一：她当地周一上午说"周五有面试"→ 周五（6/12）当地 09:00 到期。
const MONDAY = Date.parse('2026-06-08T01:00:00.000Z'); // 她当地周一 09:00
const FRIDAY_DUE = Date.parse('2026-06-12T01:00:00.000Z'); // 她当地周五 09:00
const iso = (ms: number): string => new Date(ms).toISOString();

function boot(t0 = MONDAY): EventStore {
  const s = createInMemoryEventStore('vega-pm');
  s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: iso(t0), payload: { innateSeed: { temperamentBias: {}, valueSeed: { caution: 0.6 }, somaSetpoints: { valence: 0, vitality: 0.7, connection: 0 }, somaTau: { connection: 7200 }, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 29, creator: { relationshipId: 'r', identityRef: 'Tam' } } } as EventDraft<'LIFE_GENESIS'>);
  s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r', occurredAt: iso(t0 + 60e3), payload: { relationshipId: 'r', kind: 'human', displayRef: 'Tam' } });
  s.append({ type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r', occurredAt: iso(t0 + 120e3), payload: { relationshipId: 'r', host: { kind: 'cli', ref: 'h' } } });
  return s;
}
const say = (s: EventStore, atMs: number, content: string, rel = 'r', perception?: Perception): void => {
  s.append({ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: rel, occurredAt: iso(atMs), payload: { relationshipId: rel, content, channel: 'chat', ...(perception ? { perception } : {}) } });
};
const ackTick = (s: EventStore, atMs: number, rel: string, prospectId: string): void => {
  s.append({ type: 'AUTONOMOUS_TICK', source: 'autonomous_loop', occurredAt: iso(atMs), payload: { tickReason: 'idle_threshold', selectedMemoryIds: [], wanderingTargets: [], formedIntents: [{ kind: 'prospect_care', relationshipId: rel, params: { prospectId, ack: true }, gateDecision: 'internal_only' }] } });
};

test('resolveDueMs 纯函数：相对特征 → 她当地目标日 09:00（精确到毫秒）', () => {
  const monday = Date.parse('2026-06-08T02:00:00.000Z'); // 她当地周一 10:00
  assert.equal(resolveDueMs({ inDays: 1 }, monday, 480), Date.parse('2026-06-09T01:00:00.000Z'), '明天 → 次日她当地 09:00');
  assert.equal(resolveDueMs({ weekday: 5 }, monday, 480), FRIDAY_DUE, '周一说"周五" → 本周五');
  assert.equal(resolveDueMs({ weekday: 5 }, Date.parse('2026-06-12T02:00:00.000Z'), 480), Date.parse('2026-06-19T01:00:00.000Z'), '周五当天再说"周五" → 下周五（严格未来）');
  assert.equal(resolveDueMs({ dayOfMonth: 15 }, monday, 480), Date.parse('2026-06-15T01:00:00.000Z'), '"15 号" → 本月 15 日');
  assert.equal(resolveDueMs({ dayOfMonth: 8 }, monday, 480), Date.parse('2026-07-08T01:00:00.000Z'), '8 号当天说"8 号" → 下月 8 日');
  assert.equal(resolveDueMs({}, monday, 480), null, '没有时间特征 → null');
});

test('词表回退捕捉："我周五有个面试"（无感知）→ prospect 落账、dueMs 精确', () => {
  const s = boot();
  say(s, MONDAY + 180e3, '我周五有个面试');
  const snap = reconstruct(s.list());
  assert.equal(snap.prospects.length, 1, '捕捉到一件将来的事');
  const p = snap.prospects[0];
  assert.equal(p.relationshipId, 'r');
  assert.equal(p.label, '面试');
  assert.equal(p.dueMs, FRIDAY_DUE, '到期 = 周五她当地 09:00（精确断言）');
  assert.equal(p.status, 'pending');
  assert.equal(p.id, 'p3', 'id = p+捕捉事件 seq');
  // 防误报：时间词+事件词必须同现。
  const s2 = boot();
  say(s2, MONDAY + 180e3, '周五见呀'); // 有时间词、无事件词
  say(s2, MONDAY + 240e3, '我最近在准备面试的事'); // 有事件词、无时间词
  assert.equal(reconstruct(s2.list()).prospects.length, 0, '时间词/事件词单独出现都不入 prospect');
});

test('模型感知路径：futureRef 冻进事件（相对特征）→ 折叠确定性推算到期', () => {
  const s = boot();
  say(s, MONDAY + 180e3, '跟你说件事', 'r', { sentiment: 0.2, warmth: 0.3, threat: 0, modelId: 't', futureRef: { inDays: 2, label: '手术' } });
  const p = reconstruct(s.list()).prospects[0];
  assert.ok(p, '感知 futureRef → prospect');
  assert.equal(p.label, '手术');
  assert.equal(p.dueMs, Date.parse('2026-06-10T01:00:00.000Z'), 'inDays:2 → 周三她当地 09:00');
});

test('确定性：同一日志双重放 → prospects 逐位一致、stateHash 相同', () => {
  const s = boot();
  say(s, MONDAY + 180e3, '我周五有个面试');
  const events = s.list();
  assert.deepEqual(reconstruct(events).prospects, reconstruct(events).prospects);
  assert.equal(stateHash(reconstruct(events)), stateHash(reconstruct(events)));
});

test('到期 → makeTick 形成 surface 的 prospect_care；ack tick 折成 asked → 不复发', () => {
  const s = boot();
  say(s, MONDAY + 180e3, '我周五有个面试');
  // 未到期：不形成关怀意图。
  assert.equal(makeTick(reconstruct(s.list()), iso(MONDAY + 240e3)).payload.formedIntents.some((i) => i.kind === 'prospect_care'), false, '没到日子不问');
  // 周五上午（到期后）：形成 surface 意图，带 prospectId/label。
  const fri = Date.parse('2026-06-12T02:00:00.000Z'); // 她当地周五 10:00
  const t1 = makeTick(reconstruct(s.list()), iso(fri));
  const care = t1.payload.formedIntents.find((i) => i.kind === 'prospect_care');
  assert.ok(care, '到期 → 形成 prospect_care');
  assert.equal(care.gateDecision, 'surface', '到期就该开口问（surface）');
  assert.equal(care.relationshipId, 'r');
  assert.deepEqual(care.params, { prospectId: 'p3', label: '面试' });
  // 两段式后半：reachOut 成功后回路追加 ack tick → 折成 asked（"已问过"由她自己的 tick 落账，契约①）。
  s.append(t1);
  ackTick(s, fri + 60e3, 'r', 'p3');
  assert.equal(reconstruct(s.list()).prospects[0].status, 'asked');
  assert.equal(makeTick(reconstruct(s.list()), iso(fri + 120e3)).payload.formedIntents.some((i) => i.kind === 'prospect_care'), false, '问过就不再问（不复发）');
});

test('用户自己先说了 → resolved（她不再去问）', () => {
  const s = boot();
  say(s, MONDAY + 180e3, '我周五有个面试');
  say(s, Date.parse('2026-06-12T02:00:00.000Z'), '面试结束啦，还挺顺利的'); // 到期窗口内、含 label 词干
  const snap = reconstruct(s.list());
  assert.equal(snap.prospects[0].status, 'resolved');
  assert.equal(makeTick(snap, iso(Date.parse('2026-06-12T03:00:00.000Z'))).payload.formedIntents.some((i) => i.kind === 'prospect_care'), false, '已了的事不再问');
});

test('跨用户隔离：A 的"将来的事"绝不进 B 的 grounding（仿 workspace-privacy）', () => {
  const s = boot();
  s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_b', occurredAt: iso(MONDAY + 150e3), payload: { relationshipId: 'r_b', kind: 'human', displayRef: 'Bob' } });
  say(s, MONDAY + 180e3, '我周五有个面试'); // A（r）说的
  const snap = reconstruct(s.list());
  assert.ok(snap.prospects.some((p) => p.relationshipId === 'r'), '全貌里确实有 A 的 prospect');
  const wsA = deriveWorkspace(snap, 'r');
  const wsB = deriveWorkspace(snap, 'r_b');
  assert.ok(wsA.selfFacts.includes('面试') && wsA.selfFacts.includes('惦记'), 'A 自己的 grounding 带着这份惦记');
  assert.ok(!wsB.selfFacts.includes('面试'), 'B 的 grounding 绝不含 A 的事');
});

test('上界与去重：同 rel 同到期日覆盖；每 rel 上限 4（最旧淘汰）', () => {
  const s = boot();
  const per = (inDays: number, label: string): Perception => ({ sentiment: 0, warmth: 0, threat: 0, modelId: 't', futureRef: { inDays, label } });
  // 去重：同一天的事，新说法覆盖旧的。
  say(s, MONDAY + 180e3, '说个事', 'r', per(3, '考试'));
  say(s, MONDAY + 240e3, '改主意了', 'r', per(3, '答辩'));
  let ps = reconstruct(s.list()).prospects;
  assert.equal(ps.length, 1, '同到期日只留一份');
  assert.equal(ps[0].label, '答辩', '新说法覆盖旧的');
  // 上限：再加 4 件不同日子的 → 共 5 件 → 淘汰最旧（createdSeq 最小）。
  for (let d = 4; d <= 7; d++) say(s, MONDAY + (240 + d) * 60e3, '还有事', 'r', per(d, `事${d}`));
  ps = reconstruct(s.list()).prospects;
  assert.equal(ps.length, 4, '每 rel 上限 4');
  assert.ok(!ps.some((p) => p.label === '答辩'), '最旧的惦记先放下');
});

test('过期修剪：到期 72h 仍没问上/没说起 → 退场（有界，不留陈账）', () => {
  const s = boot();
  say(s, MONDAY + 180e3, '我周五有个面试');
  assert.equal(reconstruct(s.list()).prospects.length, 1);
  // 周五 09:00 到期 +72h = 周一 09:00；周二再来一条消息 → 修剪。
  say(s, Date.parse('2026-06-16T02:00:00.000Z'), '在吗');
  assert.equal(reconstruct(s.list()).prospects.length, 0, '过期的惦记被修剪');
});

test('checkpoint 往返：含 prospects 的检查点 + 尾巴 == 全量重放（逐位一致）', () => {
  const s = boot();
  say(s, MONDAY + 180e3, '我周五有个面试');
  const fri = Date.parse('2026-06-12T02:00:00.000Z');
  s.append(makeTick(reconstruct(s.list()), iso(fri)));
  ackTick(s, fri + 60e3, 'r', 'p3');
  const events = s.list();
  const full = stateHash(reconstruct(events));
  const cp = captureCheckpoint(events.slice(0, 4)); // 折到 prospect 刚捕捉后
  const onDisk = JSON.parse(JSON.stringify(cp)) as Checkpoint; // 模拟落盘再读回
  const { st } = resumeFromCheckpoint(onDisk);
  advanceState(st, events.slice(4));
  const resumed = projectState(st, events[events.length - 1].seq);
  assert.equal(stateHash(resumed), full, '检查点+尾巴 与 全量重放 逐位一致');
  assert.deepEqual(resumed.prospects, reconstruct(events).prospects, 'prospects 经 JSON 往返不变形');
});

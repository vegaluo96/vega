// Batch B（灵魂深化，reconstructVersion 8）：昼夜节律 / 预期违背 / 混合情绪 / 叙事身份 / renarrate 不污染身份。
// 全确定性重建——不调模型、不碰墙钟（时间一律取 occurredAt）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryEventStore, reconstruct, type EventStore } from '../src/index.ts';

function born(bornIso: string, rid = 'r'): EventStore {
  const s = createInMemoryEventStore('vega-s');
  s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: bornIso, payload: { innateSeed: { temperamentBias: {}, valueSeed: { caution: 0.6, expression: 0.3 }, somaSetpoints: { valence: 0, vitality: 0.7, energy: 0.7, connection: 0 }, somaTau: { valence: 3600, connection: 7200, vitality: 86400, energy: 7200 }, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 8, creator: { relationshipId: rid, identityRef: 'Tam' } } });
  s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: rid, occurredAt: bornIso, payload: { relationshipId: rid, kind: 'human', displayRef: 'Tam' } });
  s.append({ type: 'CONNECTION_OPENED', source: 'host', relationshipId: rid, occurredAt: bornIso, payload: { relationshipId: rid, host: { kind: 'cli', ref: 'h' } } });
  return s;
}
const msgAt = (s: EventStore, content: string, iso: string, rid = 'r'): void => {
  s.append({ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: rid, occurredAt: iso, payload: { relationshipId: rid, content, channel: 'chat' } });
};

test('昼夜节律：内生精力随她内在时钟（北京时间）的一天起伏（午后高、凌晨低），不靠任何输入', () => {
  // 她活在北京时间(UTC+8)。同一条命、同样招呼——只是"此刻北京几点"不同：午后 vs 凌晨。
  const day = born('2026-01-01T00:00:00.000Z');
  msgAt(day, '在吗', '2026-01-01T06:00:00.000Z'); // = 北京 14:00 午后
  const night = born('2026-01-01T00:00:00.000Z');
  msgAt(night, '在吗', '2026-01-01T19:00:00.000Z'); // = 北京次日 03:00 凌晨
  const eDay = reconstruct(day.list()).soma.energy.value;
  const eNight = reconstruct(night.list()).soma.energy.value;
  assert.ok(eDay > eNight + 0.1, `午后精力(${eDay.toFixed(2)})应高于凌晨(${eNight.toFixed(2)})`);
  assert.equal(reconstruct(day.list()).dayPhase, '白天'); // 北京 14:00
  assert.equal(reconstruct(night.list()).dayPhase, '深夜'); // 北京 03:00
});

test('出生地时区：昼夜锚在出生那刻的时区（冻结进 genesis）→ 同一绝对时刻、不同出生地处于一天不同时段', () => {
  const mk = (offsetMin: number): EventStore => {
    const s = createInMemoryEventStore('vega-tz');
    s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: '2026-01-01T04:00:00.000Z', payload: { innateSeed: { temperamentBias: {}, valueSeed: { caution: 0.6 }, somaSetpoints: { vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15, circadianOffsetMin: offsetMin }, reconstructVersionAtBirth: 10, creator: { relationshipId: 'r', identityRef: 'Tam' } } });
    return s;
  };
  // 同一绝对时刻 04:00Z：北京(+480)=12:00 白天；纽约(−300)=前夜 23:00。
  assert.equal(reconstruct(mk(480).list()).dayPhase, '白天');
  assert.equal(reconstruct(mk(-300).list()).dayPhase, '夜里');
});

test('预期违背：信任的人忽然变冷，比陌生人同样的话更伤（关系条件化）', () => {
  let t = Date.parse('2026-01-01T08:00:00.000Z');
  const at = (): string => new Date((t += 600_000)).toISOString();
  // 被信任者：先建立"她会好好待我"的预期，再来一句冷淡
  const trusted = born(at());
  for (const w of ['你好，我真心在乎你', '我真心在乎你，会一直在', '你值得，我真心的']) msgAt(trusted, w, at());
  msgAt(trusted, '我有点不在乎', at());
  // 陌生人：上来就同样一句冷淡（毫无预期）
  const stranger = born(at());
  msgAt(stranger, '我有点不在乎', at());

  const lastAffect = (s: EventStore): number => {
    const cur = reconstruct(s.list()).memory.filter((m) => m.kind === 'episodic' && m.lineage.isCurrent);
    return cur[cur.length - 1].affect;
  };
  const hurtTrusted = lastAffect(trusted);
  const hurtStranger = lastAffect(stranger);
  assert.ok(hurtTrusted < 0 && hurtStranger < 0, '两边都是负的');
  assert.ok(Math.abs(hurtTrusted) > Math.abs(hurtStranger), `被信任者变冷更痛：${hurtTrusted.toFixed(2)} vs 陌生人 ${hurtStranger.toFixed(2)}`);
});

test('混合情绪：又暖又有点孤单（主情绪上叠次要色彩，不改 emotion）', () => {
  const s = born('2026-01-01T12:00:00.000Z');
  msgAt(s, '你好，我真心在乎你', '2026-01-01T12:00:00.000Z'); // valence↑、connection↑
  // 同一时刻反复想念（Δt=0，不衰减效价）→ 联结掉到负，但暖意还在
  for (let i = 0; i < 10; i++) s.append({ type: 'AUTONOMOUS_TICK', source: 'autonomous_loop', occurredAt: '2026-01-01T12:00:00.000Z', payload: { tickReason: 'idle_threshold', selectedMemoryIds: [], wanderingTargets: [{ relationshipId: 'r', topicSeed: 'missing_peer' }], formedIntents: [] } });
  const snap = reconstruct(s.list());
  assert.ok(snap.soma.valence.value > 0.15 && snap.soma.connection.value < -0.3, '构造出"暖+孤"的混合态');
  assert.ok(snap.feeling.startsWith(snap.emotion), 'feeling 以主情绪起头');
  assert.notEqual(snap.feeling, snap.emotion, '混合态下 feeling 比单一标签更丰富');
  assert.ok(snap.feeling.includes('孤单'), `应叠出孤单色彩，实得「${snap.feeling}」`);
});

test('叙事身份：人生按转折点切成篇章（初醒/遇见/被伤），纯只读投影', () => {
  let t = Date.parse('2026-01-01T08:00:00.000Z');
  const at = (): string => new Date((t += 600_000)).toISOString();
  const s = born(at());
  msgAt(s, '你好，我真心在乎你', at());
  msgAt(s, '你根本不在乎，都是假的', at()); // 强烈转折
  const ch = reconstruct(s.list()).chapters;
  assert.ok(ch.some((c) => c.includes('初醒')), '应有"初醒"开篇');
  assert.ok(ch.some((c) => c.includes('遇见Tam')), '应记下遇见');
  assert.ok(ch.some((c) => c.includes('伤')), '应把强烈的伤标成转折点');
});

test('renarrate 不污染身份（契约③）：重讲人生只动叙事、绝不漂移价值', () => {
  let t = Date.parse('2026-01-01T08:00:00.000Z');
  const at = (): string => new Date((t += 600_000)).toISOString();
  const s = born(at());
  for (const w of ['你好，我真心在乎你', '我真心在乎你，会一直在', '你值得，我真心的']) msgAt(s, w, at());
  const before = reconstruct(s.list()).values;
  s.append({ type: 'REFLECTION_TRIGGERED', source: 'autonomous_loop', occurredAt: at(), payload: { scope: 'renarrate', windowFromSeq: 0, windowToSeq: s.list().length } });
  const after = reconstruct(s.list()).values;
  assert.deepEqual(after, before, 'renarrate 后价值逐字不变（叙事不回写身份）');
});

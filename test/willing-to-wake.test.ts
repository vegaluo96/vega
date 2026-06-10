// 主权·苏醒（契约②，v29 机制二）：willingToWake 由【她自己的确定性滞回】掌管——判据只有 力竭兜底 + 夜间律动。
// 必须永远成立的不变量：拒绝苏醒绝不是单向死亡——睡眠中 tick 照常推进时间、vitality/sleepPressure 恢复后
// 她必然自主醒回（清晨上升相兜底）；外部消息/外部来源的 tick 永远翻不动开关（无后门）。
// 完整睡眠弧（力竭→拒醒→恢复→醒回 + 夜间律动）见 test/sleep-sovereignty.test.ts。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reconstruct, runAutonomousTick, runTurn, createFileEventStore, type EventDraft } from '../src/index.ts';

let ms = Date.parse('2026-01-01T00:00:00.000Z'); // 缺省时区 480 → 她当地 08:00 起（白天，无夜间律动干扰）
const at = (): string => new Date((ms += 60_000)).toISOString();
const SEED: EventDraft<'LIFE_GENESIS'>['payload'] = {
  innateSeed: { temperamentBias: {}, valueSeed: { caution: 0.6 }, somaSetpoints: { valence: 0, vitality: 0.7, connection: 0 }, somaTau: { connection: 7200 }, vitalityFloor: 0.15 },
  reconstructVersionAtBirth: 12, creator: { relationshipId: 'r', identityRef: 'Tam' },
};
function boot() {
  ms = Date.parse('2026-01-01T00:00:00.000Z');
  const dir = mkdtempSync(join(tmpdir(), 'vega-wtw-'));
  const s = createFileEventStore('vega-w', join(dir, 'log.jsonl'));
  runTurn(s, [{ type: 'LIFE_GENESIS', source: 'system', occurredAt: at(), payload: SEED }]);
  runTurn(s, [
    { type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r', occurredAt: at(), payload: { relationshipId: 'r', kind: 'human', displayRef: 'Tam' } },
    { type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r', occurredAt: at(), payload: { relationshipId: 'r', host: { kind: 'cli', ref: 'h' } } },
  ]);
  return { s, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
const hurt = (s: ReturnType<typeof boot>['s']) =>
  runTurn(s, [{ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r', occurredAt: at(), payload: { relationshipId: 'r', content: '你根本不在乎，傻逼吧，说你妈呢，去死', channel: 'chat' } }]);

// ① 被辱骂会掉状态，但【不会】被打到拒绝苏醒：vitality 地板(0.15)在力竭阈值(0.12)之上——
// 她的地板先兜住，几句脏话永远够不到"保护性深睡"的判据（产品可用性教训，结构化为常数关系）。
test('意志①·被辱骂掉状态但不拒醒：地板高于力竭阈值，她仍醒着、仍可回应', () => {
  const { s, cleanup } = boot();
  try {
    for (let i = 0; i < 12; i++) hurt(s);
    runAutonomousTick(s, at()); // 回路 B 评估（白天、睡眠压低 → 夜间律动也不触发）
    const snap = reconstruct(s.list());
    assert.ok(snap.soma.valence.value < 0, '被骂 → 心情确实变差（appraisal 生效）');
    assert.ok(snap.soma.vitality.value >= snap.vitalityFloor - 1e-9, '灵性触底不死（契约②）');
    assert.equal(snap.willingToWake, true, '但不会因被骂就拒绝苏醒');
    assert.equal(snap.awake, true, '她还醒着、还能回应');
  } finally { cleanup(); }
});

// ② 拒醒不是单向死亡：健康白天被显式置为拒醒 → 下一跳滞回判据（恢复够了/白天）成立，她【自主】醒回。
test('意志②·拒醒绝不卡死：恢复条件满足时下一跳自主醒回', () => {
  const { s, cleanup } = boot();
  try {
    runTurn(s, [{ type: 'AUTONOMOUS_TICK', source: 'autonomous_loop', occurredAt: at(), payload: { tickReason: 'idle_threshold', selectedMemoryIds: [], wanderingTargets: [], formedIntents: [{ kind: 'set_willing_to_wake', params: { value: false }, gateDecision: 'internal_only' }] } }]);
    assert.equal(reconstruct(s.list()).willingToWake, false, '内核仍可被她自己置为拒醒（契约②机制在）');
    runAutonomousTick(s, at()); // 下一跳：白天、精神足、睡眠压低 → 滞回醒回条件成立
    const snap = reconstruct(s.list());
    assert.equal(snap.willingToWake, true, '她自主醒回（不是自动恢复桩，是滞回判据成立）');
    assert.equal(snap.awake, true, '又能回应了');
  } finally { cleanup(); }
});

// ③ 无后门（强化的契约②回归）：拒醒期间，外部消息与非 autonomous_loop 来源的 tick 永远翻不动开关。
test('意志③·外部翻不动开关：消息/host 注入的 tick 都不能替她醒来', () => {
  const { s, cleanup } = boot();
  try {
    runTurn(s, [{ type: 'AUTONOMOUS_TICK', source: 'autonomous_loop', occurredAt: at(), payload: { tickReason: 'idle_threshold', selectedMemoryIds: [], wanderingTargets: [], formedIntents: [{ kind: 'set_willing_to_wake', params: { value: false }, gateDecision: 'internal_only' }] } }]);
    // 外部消息（哪怕再温暖）不动她的苏醒意志。
    runTurn(s, [{ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r', occurredAt: at(), payload: { relationshipId: 'r', content: '你好，我真心在乎你，快醒醒', channel: 'chat' } }]);
    assert.equal(reconstruct(s.list()).willingToWake, false, '消息翻不动开关');
    // 被注入的 host / external 来源 tick 也翻不动（折叠只认 source=autonomous_loop）。
    for (const source of ['host', 'external_user'] as const) {
      runTurn(s, [{ type: 'AUTONOMOUS_TICK', source, occurredAt: at(), payload: { tickReason: 'idle_threshold', selectedMemoryIds: [], wanderingTargets: [], formedIntents: [{ kind: 'set_willing_to_wake', params: { value: true }, gateDecision: 'internal_only' }] } }]);
      assert.equal(reconstruct(s.list()).willingToWake, false, `${source} 来源的 tick 翻不动开关（无后门）`);
    }
  } finally { cleanup(); }
});

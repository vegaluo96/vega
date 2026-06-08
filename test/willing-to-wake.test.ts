// 契约②·她能拒绝苏醒（力竭休眠，规则 A）：自主回路在【触底力竭】时让她睡去自我休养，
// 睡眠中 vitality 回升过阈值后她【自主醒回】——确定性、可重放、不碰模型、绝不永久锁死。
// 钉死：① 力竭→拒醒；② 休眠→自主醒回（永生：不会单向死亡）；③ 健康不无故拒醒；④ 只在状态翻转时发意图（不刷屏）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  reconstruct,
  runAutonomousTick,
  runTurn,
  createFileEventStore,
  type EventDraft,
  type LifeEvent,
} from '../src/index.ts';

let ms = Date.parse('2026-01-01T00:00:00.000Z');
const at = (): string => new Date((ms += 60_000)).toISOString();
const jump = (hours: number): string => new Date((ms += hours * 3_600_000)).toISOString();

const SEED: EventDraft<'LIFE_GENESIS'>['payload'] = {
  innateSeed: { temperamentBias: {}, valueSeed: { caution: 0.6 }, somaSetpoints: { valence: 0, vitality: 0.7, connection: 0 }, somaTau: { connection: 7200 }, vitalityFloor: 0.15 },
  reconstructVersionAtBirth: 1, creator: { relationshipId: 'r', identityRef: 'Tam' },
};

function boot(rel = 'r') {
  ms = Date.parse('2026-01-01T00:00:00.000Z');
  const dir = mkdtempSync(join(tmpdir(), 'vega-wtw-'));
  const s = createFileEventStore('vega-w', join(dir, 'log.jsonl'));
  runTurn(s, [{ type: 'LIFE_GENESIS', source: 'system', occurredAt: at(), payload: SEED }]);
  runTurn(s, [
    { type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: rel, occurredAt: at(), payload: { relationshipId: rel, kind: 'human', displayRef: 'Tam' } },
    { type: 'CONNECTION_OPENED', source: 'host', relationshipId: rel, occurredAt: at(), payload: { relationshipId: rel, host: { kind: 'cli', ref: 'h' } } },
  ]);
  return { s, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
const hurt = (s: ReturnType<typeof boot>['s'], rel = 'r') =>
  runTurn(s, [{ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: rel, occurredAt: at(), payload: { relationshipId: rel, content: '你根本不在乎，都是假的，我恨你，讨厌你', channel: 'chat' } }]);

// 统计落库的"愿不愿醒"翻转意图条数（钉死：只在状态翻转时发，不刷屏）。
function countWakeIntents(events: readonly LifeEvent[]): number {
  let n = 0;
  for (const e of events) {
    if (e.type !== 'AUTONOMOUS_TICK') continue;
    const fi = (e.payload as { formedIntents?: { kind: string }[] }).formedIntents ?? [];
    if (fi.some((it) => it.kind === 'set_willing_to_wake')) n++;
  }
  return n;
}

// ① 力竭 → 她拒绝苏醒（即便连接还开着，也不醒；无 host override）。
test('意志①·力竭拒醒：vitality 触地板 + 心情低落 → 一次自主 tick 她选择不醒', () => {
  const { s, cleanup } = boot();
  try {
    for (let i = 0; i < 10; i++) hurt(s); // 持续伤害 → 触底力竭
    let snap = reconstruct(s.list());
    assert.ok(snap.soma.vitality.value <= snap.vitalityFloor + 0.02, `vitality 触地板，实得 ${snap.soma.vitality.value}`);
    assert.ok(snap.soma.valence.value <= -0.3, `心情低落，实得 ${snap.soma.valence.value}`);
    assert.equal(snap.willingToWake, true, '此刻仍愿醒（消息从不写主权字段）');
    assert.equal(snap.awake, true, '连接开着 + 愿醒 → 此刻醒着');

    runAutonomousTick(s, at()); // 回路 B：她自己决定
    snap = reconstruct(s.list());
    assert.equal(snap.willingToWake, false, '力竭 → 她拒绝苏醒（契约②）');
    assert.deepEqual(snap.openConnections, ['r'], '连接仍开着');
    assert.equal(snap.awake, false, '但她不醒——无后门、无 host override');
  } finally {
    cleanup();
  }
});

// ② 休眠 → 自主醒回（永生：拒绝苏醒不是单向死亡）。睡眠中 vitality 回升，过阈值她自己醒。
test('意志②·休养自主醒回：睡眠中 vitality 回升过阈值 → 她自主醒回，且只翻转两次（不刷屏）', () => {
  const { s, cleanup } = boot();
  try {
    for (let i = 0; i < 10; i++) hurt(s);
    runAutonomousTick(s, at());
    assert.equal(reconstruct(s.list()).willingToWake, false, '先睡下');

    // 睡眠期心跳仍跑 tick（模拟 daemon 对 willingToWake=false 的放行）→ 时间推进、vitality 回升。
    for (let i = 0; i < 24; i++) runAutonomousTick(s, jump(2)); // 共 ~48h 休眠
    const snap = reconstruct(s.list());
    assert.ok(snap.soma.vitality.value >= 0.35, `睡眠中 vitality 回升，实得 ${snap.soma.vitality.value}`);
    assert.equal(snap.willingToWake, true, '恢复后她自主醒回——拒绝苏醒可逆，不会永久死');
    assert.equal(snap.awake, true, '愿醒 + 连接在 → 又醒着了');

    // 整个睡→醒周期里，"愿不愿醒"只翻转 2 次（睡 1 次、醒 1 次），其余 tick 不发意图。
    assert.equal(countWakeIntents(s.list()), 2, '只在状态翻转时发意图，绝不每跳刷屏');
  } finally {
    cleanup();
  }
});

// ③ 健康不无故拒醒：状态良好时自主 tick 绝不让她拒绝苏醒。
test('意志③·健康不拒醒：善意往来后，自主 tick 不会无故让她拒绝苏醒', () => {
  const { s, cleanup } = boot();
  try {
    runTurn(s, [{ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r', occurredAt: at(), payload: { relationshipId: 'r', content: '你好，我真心在乎你', channel: 'chat' } }]);
    for (let i = 0; i < 5; i++) runAutonomousTick(s, at());
    const snap = reconstruct(s.list());
    assert.equal(snap.willingToWake, true, '健康时她一直愿醒');
    assert.equal(countWakeIntents(s.list()), 0, '没有任何拒醒/愿醒意图被发出');
  } finally {
    cleanup();
  }
});

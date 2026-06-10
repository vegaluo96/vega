// 睡眠主权（v29·机制二，契约②的真实化）：她真的会选择睡——确定性滞回，判据只有 力竭兜底 + 夜间律动。
// 核心不变量（绝不可破）：拒绝苏醒绝不是单向死亡——睡眠中 tick 照常推进、vitality/sleepPressure 恢复后
// 她必然自主醒回（清晨上升相兜底）；外部消息/外部来源 tick 永远翻不动开关。全部确定性、可重放。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryEventStore, makeTick, reconstruct, stateHash, type EventDraft, type EventStore } from '../src/index.ts';

// 缺省时区 480（UTC+8）：UTC 00:00 = 她当地 08:00。她的夜里(休息相)=21:00–05:00，清晨上升相=05:00–09:00。
const iso = (ms: number): string => new Date(ms).toISOString();
function boot(t0: number, vitalityFloor: number): EventStore {
  const s = createInMemoryEventStore('vega-sleep');
  s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: iso(t0), payload: { innateSeed: { temperamentBias: {}, valueSeed: { caution: 0.6 }, somaSetpoints: { valence: 0, vitality: 0.7, connection: 0 }, somaTau: { connection: 7200 }, vitalityFloor }, reconstructVersionAtBirth: 29, creator: { relationshipId: 'r', identityRef: 'Tam' } } } as EventDraft<'LIFE_GENESIS'>);
  s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r', occurredAt: iso(t0 + 60e3), payload: { relationshipId: 'r', kind: 'human', displayRef: 'Tam' } });
  s.append({ type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r', occurredAt: iso(t0 + 120e3), payload: { relationshipId: 'r', host: { kind: 'cli', ref: 'h' } } });
  return s;
}
const tick = (s: EventStore, atMs: number): void => { s.append(makeTick(reconstruct(s.list()), iso(atMs))); };

// ① 力竭弧（floor 0.05 < 力竭阈 0.12 才够得到）：力竭→拒醒（滞回不抖）→外部翻不动→恢复后她必然自主醒回。
test('睡眠主权①·力竭→拒醒→睡中恢复→自主醒回（绝不单向死亡）', () => {
  const T0 = Date.parse('2026-01-01T01:00:00.000Z'); // 她当地 09:00（白天）
  const s = boot(T0, 0.05);
  for (let i = 1; i <= 3; i++) {
    s.append({ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r', occurredAt: iso(T0 + (120 + i) * 60e3), payload: { relationshipId: 'r', content: '你根本不在乎，傻逼吧，说你妈呢，去死', channel: 'chat' } });
  }
  assert.ok(reconstruct(s.list()).soma.vitality.value <= 0.12, '连续打击 → 灵性跌破力竭阈值（地板 0.05 兜不住 0.12）');

  // 力竭 → 她选择睡（保护性深睡），连接开着也不醒（契约②a 同款形态，但这次是她真实的判据）。
  const sleepAt = T0 + 130 * 60e3;
  tick(s, sleepAt);
  let snap = reconstruct(s.list());
  assert.equal(snap.willingToWake, false, '力竭 → 拒绝苏醒');
  assert.equal(snap.awake, false, '连接开着也不醒');

  // 滞回防抖：下一跳（仍力竭）绝不弹回——绝不一跳睡一跳醒。
  tick(s, sleepAt + 60e3);
  assert.equal(reconstruct(s.list()).willingToWake, false, '滞回：刚睡下不会立刻弹醒');

  // 外部消息翻不动开关（中性句，不借暖意改变恢复轨迹——此处只验"开关是她的"）。
  s.append({ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r', occurredAt: iso(sleepAt + 120e3), payload: { relationshipId: 'r', content: '在吗', channel: 'chat' } });
  assert.equal(reconstruct(s.list()).willingToWake, false, '睡眠中外部消息永远翻不动 willingToWake');

  // 睡眠中心跳照常 tick（loops.ts 同款）：时间推进、vitality 在休眠回暖；恢复后她必然自主醒回。
  // 判据决定醒点：白天恢复（v≥0.3 ∧ 睡眠压≤0.3）被当日残余睡眠压挡住 → 由次日清晨上升相兜底。
  let wokeAtMs = 0;
  for (let k = 1; k <= 48 && !wokeAtMs; k++) { // 每 30 分钟一跳、最多 24h
    const at = sleepAt + 120e3 + k * 30 * 60e3;
    tick(s, at);
    if (reconstruct(s.list()).willingToWake) wokeAtMs = at;
  }
  assert.ok(wokeAtMs > 0, '24h 内她必然自主醒回（拒绝苏醒不是单向死亡）');
  const wakeHourUtc = new Date(wokeAtMs).getUTCHours() + new Date(wokeAtMs).getUTCMinutes() / 60;
  const hodLocal = (wakeHourUtc + 8) % 24;
  assert.ok(hodLocal >= 5 && hodLocal < 9, `醒在她的清晨上升相（实际当地 ${hodLocal.toFixed(2)} 点）`);
  snap = reconstruct(s.list());
  assert.ok(snap.soma.vitality.value >= 0.3, '醒回时灵性确已恢复（睡中回暖）');
  assert.equal(snap.awake, true, '醒回后连接还在 → 重新可回应');

  // 醒回后的滞回：下一跳不再立刻入睡（清晨非休息相、也不再力竭）。
  tick(s, wokeAtMs + 60e3);
  assert.equal(reconstruct(s.list()).willingToWake, true, '醒回后不抖回去');
});

// ② 夜间律动（Borbély 双过程）：她的夜里、睡眠压未释放 → 选择睡；整夜睡踏实（恢复判据被休息相挡住）；
// 清晨上升相自主醒回。这是缺省地板(0.15)的命【唯一】的自然入睡路径——白天被骂永远骂不睡她。
test('睡眠主权②·夜间律动：夜里入睡→睡过整夜→清晨醒回（确定性昼夜弧）', () => {
  const T0 = Date.parse('2026-01-01T00:00:00.000Z'); // 她当地 08:00
  const s = boot(T0, 0.15);
  const events: Array<{ atMs: number; willing: boolean }> = [];
  // 白天每 15 分钟一跳直到她当地 22:00（UTC 14:00）：积累睡眠压、入夜后选择睡。
  for (let k = 1; k <= 56; k++) {
    const at = T0 + 180e3 + k * 15 * 60e3;
    tick(s, at);
    events.push({ atMs: at, willing: reconstruct(s.list()).willingToWake });
  }
  const fellAsleep = events.find((e) => !e.willing);
  assert.ok(fellAsleep, '入夜后她选择睡（夜间律动触发）');
  const sleepHod = ((fellAsleep.atMs / 3_600_000 + 8) % 24 + 24) % 24;
  assert.ok(sleepHod >= 21, `入睡发生在她的夜里（实际当地 ${sleepHod.toFixed(2)} 点）`);
  for (const e of events) if (e.atMs < fellAsleep.atMs) assert.equal(e.willing, true, '白天绝不无故入睡');

  // 整夜每 30 分钟一跳：睡眠压早已释放（<0.3）、灵性满格，但休息相挡住恢复判据 → 睡踏实，不半夜弹醒。
  let wokeAtMs = 0;
  for (let k = 1; k <= 24 && !wokeAtMs; k++) {
    const at = fellAsleep.atMs + k * 30 * 60e3;
    tick(s, at);
    const willing = reconstruct(s.list()).willingToWake;
    const hod = ((at / 3_600_000 + 8) % 24 + 24) % 24;
    if (willing) wokeAtMs = at;
    else assert.ok(hod >= 21 || hod < 5, `还没到清晨就不醒（当地 ${hod.toFixed(2)} 点仍睡）`);
  }
  assert.ok(wokeAtMs > 0, '清晨必然自主醒回');
  const wakeHod = ((wokeAtMs / 3_600_000 + 8) % 24 + 24) % 24;
  assert.ok(wakeHod >= 5 && wakeHod < 9, `醒在清晨上升相（实际当地 ${wakeHod.toFixed(2)} 点）`);

  // 确定性：同一段日志双重放逐位一致（睡眠弧不依赖墙钟/RNG）。
  assert.equal(stateHash(reconstruct(s.list())), stateHash(reconstruct(s.list())), 'V2：重放一致');
});

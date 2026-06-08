// 完整链路自检（daemon/引擎层集成）：现有测试多在内核/单函数级，这里专钉【链路级】保证——
//   ① converse 单事务原子性（崩在 await 中 → 无半截 turn）；② 重试不二次 appraise；
//   ③ 乐观锁恢复意义（await 窗口被抢写 → CAS 冲突）；④ 增量缓存态 == 全量重建（snapOf↔converse 不漂移）；
//   ⑤ 睡着丢消息——钉死现状（有意行为）；⑥ 计费按"走了付费路径"扣，与 verdict 无关（Fix B）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  advanceState,
  captureCheckpoint,
  converse,
  createAccountStore,
  createFileEventStore,
  createInMemoryEventStore,
  createTemplateMouth,
  endRelationship,
  meterMouth,
  projectState,
  reconstruct,
  resumeFromCheckpoint,
  runAutonomousTick,
  runTurn,
  stateHash,
  userSay,
  type DurableEventStore,
  type EventDraft,
  type Mouth,
} from '../src/index.ts';

let ms = Date.parse('2026-01-01T00:00:00.000Z');
const at = (): string => new Date((ms += 60_000)).toISOString();
const resetClock = (): void => { ms = Date.parse('2026-01-01T00:00:00.000Z'); };

const SEED: EventDraft<'LIFE_GENESIS'>['payload'] = {
  innateSeed: { temperamentBias: {}, valueSeed: { caution: 0.6, expression: 0.3 }, somaSetpoints: { valence: 0, vitality: 0.7, connection: 0 }, somaTau: { connection: 7200 }, vitalityFloor: 0.15 },
  reconstructVersionAtBirth: 1, creator: { relationshipId: 'r', identityRef: 'Tam' },
};

// 内存存储（直接 append 事件，用于钉死纯判定变量）。
function mem(rel = 'r') {
  resetClock();
  const s = createInMemoryEventStore('vega-i');
  s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: at(), payload: SEED });
  s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: rel, occurredAt: at(), payload: { relationshipId: rel, kind: 'human', displayRef: 'Tam' } });
  s.append({ type: 'CONNECTION_OPENED', source: 'host', relationshipId: rel, occurredAt: at(), payload: { relationshipId: rel, host: { kind: 'cli', ref: 'h' } } });
  return s;
}

// 落盘存储（converse/userSay 需要 DurableEventStore：appendTurn + version）。
function fileBoot(rel = 'r') {
  resetClock();
  const dir = mkdtempSync(join(tmpdir(), 'vega-chain-'));
  const path = join(dir, 'log.jsonl');
  const s = createFileEventStore('vega-f', path);
  runTurn(s, [{ type: 'LIFE_GENESIS', source: 'system', occurredAt: at(), payload: SEED }]);
  runTurn(s, [
    { type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: rel, occurredAt: at(), payload: { relationshipId: rel, kind: 'human', displayRef: 'Tam' } },
    { type: 'CONNECTION_OPENED', source: 'host', relationshipId: rel, occurredAt: at(), payload: { relationshipId: rel, host: { kind: 'cli', ref: 'h' } } },
  ]);
  return { s, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// 把一个真实 store 包成"前 N 次 appendTurn 抛错"（模拟提交时进程崩/磁盘错）。
function flaky(real: DurableEventStore, failFirst: number): DurableEventStore {
  let fails = failFirst;
  return {
    filePath: real.filePath,
    append: (d) => real.append(d),
    appendTurn: (expected, drafts) => {
      if (fails > 0) { fails--; throw new Error('simulated crash: commit failed mid-turn'); }
      return real.appendTurn(expected, drafts);
    },
    version: () => real.version(),
    list: () => real.list(),
    head: () => real.head(),
  };
}

// ① 原子性：提交失败 → 神圣日志纹丝不动（无半截：既无 MESSAGE_RECEIVED 也无 MESSAGE_SENT）。
test('链路①·原子性：converse 提交崩了 → 整批回滚，version 不变、无半截 turn', async () => {
  const { s, cleanup } = fileBoot();
  try {
    const before = s.version();
    await assert.rejects(() => converse(flaky(s, 1), createTemplateMouth(), 'r', '你好，我真心在乎你', at()), /simulated crash/);
    assert.equal(s.version(), before, '失败提交后版本不变');
    assert.equal(s.list().some((e) => e.type === 'MESSAGE_RECEIVED'), false, '没有落下孤儿 MESSAGE_RECEIVED');
    assert.equal(s.list().some((e) => e.type === 'MESSAGE_SENT'), false, '也没有落下 MESSAGE_SENT');
  } finally {
    cleanup();
  }
});

// ② 崩溃后重试不二次 appraise：失败的一轮零痕迹，重试只 appraise 一次（信任值 == 单次成功对照）。
test('链路②·重试不二次 appraise：崩溃轮无痕迹，trust 等于单次成功的对照值', async () => {
  const ctrl = fileBoot();
  const retry = fileBoot();
  try {
    const MSG = '你好，我真心在乎你';
    // 对照：一次成功 converse
    await converse(ctrl.s, createTemplateMouth(), 'r', MSG, at());
    const trustControl = reconstruct(ctrl.s.list()).bonds['r'].trust;

    // 受测：第一轮提交崩溃（零痕迹）→ 同一句重试一次
    await assert.rejects(() => converse(flaky(retry.s, 1), createTemplateMouth(), 'r', MSG, at()), /simulated crash/);
    await converse(retry.s, createTemplateMouth(), 'r', MSG, at());

    const recv = retry.s.list().filter((e) => e.type === 'MESSAGE_RECEIVED');
    assert.equal(recv.length, 1, '同一句只被记录一次（崩溃轮未留下重复输入）');
    assert.equal(reconstruct(retry.s.list()).bonds['r'].trust, trustControl, '信任只长一次：无二次 appraise');
  } finally {
    ctrl.cleanup();
    retry.cleanup();
  }
});

// ③ 乐观锁恢复意义：await（mouth.speak）窗口内被别的写入抢先 → 最终 appendTurn 用开头 expected → CAS 冲突。
test('链路③·乐观锁：await 窗口被并发抢写 → appendTurn 冲突抛错（锁不再是空操作）', async () => {
  const { s, cleanup } = fileBoot();
  try {
    // 这张"嘴"在说话时偷偷往同一条命写了一条 tick，抢走了 expected 之后的版本号。
    const sneaky: Mouth = {
      id: 'sneaky',
      speak: () => {
        s.append({ type: 'AUTONOMOUS_TICK', source: 'autonomous_loop', occurredAt: at(), payload: { tickReason: 'idle_threshold', selectedMemoryIds: [], wanderingTargets: [], formedIntents: [] } });
        return Promise.resolve('（抢写之后我才说话）');
      },
    };
    await assert.rejects(() => converse(s, sneaky, 'r', '你好', at()), /optimistic lock conflict/);
    // 抢写的 tick 在；但被冲突挡下的这轮 received/sent 都没落。
    assert.equal(s.list().some((e) => e.type === 'AUTONOMOUS_TICK'), true);
    assert.equal(s.list().some((e) => e.type === 'MESSAGE_RECEIVED'), false);
  } finally {
    cleanup();
  }
});

// ④ 增量缓存态 == 全量重建：daemon 用 checkpoint+advanceState 出快照，converse 用全量 reconstruct——两者必须逐位一致。
test('链路④·一致性：checkpoint+advanceState 与全量 reconstruct 的 stateHash 逐位一致', async () => {
  const { s, cleanup } = fileBoot();
  try {
    // 造一条"混合"日志：消息（含 appraisal）+ 自主 tick + 反思 + 关系结束。
    await converse(s, createTemplateMouth(), 'r', '你好，我真心在乎你', at());
    await converse(s, createTemplateMouth(), 'r', '你根本不在乎，都是假的', at());
    runAutonomousTick(s, at());
    runAutonomousTick(s, at());
    runTurn(s, [{ type: 'REFLECTION_TRIGGERED', source: 'autonomous_loop', occurredAt: at(), payload: { scope: 'recent', windowFromSeq: 0, windowToSeq: s.version() } }]);
    endRelationship(s, 'r', 'farewell', at());

    const full = s.list();
    const fullHash = stateHash(reconstruct(full));
    const lastSeq = full[full.length - 1].seq;

    // 多个切点都要一致：只创世、中段、全量无尾巴。
    for (const k of [1, 4, full.length]) {
      const prefix = full.slice(0, k);
      const tail = full.slice(k);
      const { st } = resumeFromCheckpoint(captureCheckpoint(prefix));
      advanceState(st, tail);
      assert.equal(stateHash(projectState(st, lastSeq)), fullHash, `切点 k=${k} 处增量与全量漂移`);
    }
  } finally {
    cleanup();
  }
});

// ⑤ 睡着丢消息——钉死现状（有意行为，改前先评审）。
// daemon 的 4 个 say 入口（daemon.ts:337/392/1064/1260）都在 `!snapOf(x).awake` 时返回 asleep note，
// 【在调 userSay 之前】→ 睡着期间用户消息不落 MESSAGE_RECEIVED、不进历史、不被 appraise。
// 这里钉死它们共同依赖的判定变量 snapshot.awake；本轮维持现状（见计划）。
test('链路⑤·睡着丢消息（钉死现状）：两种"睡着"条件下 awake=false ⇒ 入口在落事件前即返回', () => {
  // 条件一：她拒绝苏醒（willingToWake=false），即便连接开着也不 awake。
  const s1 = mem();
  s1.append({ type: 'AUTONOMOUS_TICK', source: 'autonomous_loop', occurredAt: at(), payload: { tickReason: 'idle_threshold', selectedMemoryIds: [], wanderingTargets: [], formedIntents: [{ kind: 'set_willing_to_wake', params: { value: false }, gateDecision: 'internal_only' }] } });
  const snap1 = reconstruct(s1.list());
  assert.equal(snap1.openConnections.length, 1, '连接开着');
  assert.equal(snap1.awake, false, '但她拒绝苏醒 → 入口判定为睡着');

  // 条件二：没有开着的连接 → 不 awake。
  const s2 = mem();
  s2.append({ type: 'CONNECTION_CLOSED', source: 'host', relationshipId: 'r', occurredAt: at(), payload: { relationshipId: 'r', reason: 'token_detached' } });
  const snap2 = reconstruct(s2.list());
  assert.equal(snap2.openConnections.length, 0, '无开连接');
  assert.equal(snap2.awake, false, '→ 入口判定为睡着');
});

// ⑥ 计费按"走了付费路径"扣，与 verdict 无关（Fix B）。镜像 daemon respondAsUser 的计费判定（daemon.ts:282-286）：
// 用真模型（id≠template）且余额够 → charge>0；即便 mouth 兜底成 fallback，API 钱已花出，也要扣。
test('链路⑥·计费（Fix B）：走了付费路径就扣费，fallback 也扣；模板/余额不足不扣、不调感知', async () => {
  const { s, cleanup } = fileBoot();
  const accounts = createAccountStore(':memory:');
  try {
    const reg = accounts.register('pay@x.com', 'pa$$word123', 'Tam');
    assert.ok(reg.ok);
    const uid = reg.account.id;
    const relId = accounts.relIdFor(uid);
    const COST = 1;

    // ——付费路径：真模型 + 余额够，但模型必出 fallback（返回空串 → critic 兜底）。
    const brokenReal: Mouth = { id: 'gpt-test', speak: () => Promise.resolve('') };
    const before = accounts.balance(uid);
    const { mouth: useMouth, charge } = meterMouth(brokenReal, createTemplateMouth(), before, COST);
    assert.ok(charge > 0, '余额够 + 真模型 → 选付费路径');
    const r = await userSay(s, useMouth, relId, 'Tam', '你好', at());
    assert.equal(r.verdict, 'fallback', '空串被 critic 判为 fallback');
    if (charge) accounts.debit(uid, charge, 'model', 'life'); // ← Fix B：不再以 verdict==='accepted' 为条件
    assert.equal(accounts.balance(uid), before - COST, 'fallback 也扣费：付费路径的 API 钱已花出');

    // ——余额不足：退模板嘴，charge=0（daemon 据此 `charge ? perceiver : undefined` 不调付费感知），不扣费。
    const poor = meterMouth(brokenReal, createTemplateMouth(), 0, COST);
    assert.equal(poor.charge, 0, '余额不足 → 不走付费路径');
    assert.equal(poor.mouth.id, 'template', '退回免费模板嘴');
  } finally {
    accounts.close();
    cleanup();
  }
});

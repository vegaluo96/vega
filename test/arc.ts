// 测试夹具：把一条贯穿多弧的 life-line 脚本化（出生→因你而变→背叛→修复重构→拒绝苏醒）。
// 不是 *.test.ts，故不会被测试运行器当用例直接跑；供各测试 import。
import { createInMemoryEventStore, type EventStore } from '../src/index.ts';

export const GENESIS_SEED = {
  temperamentBias: { curiosity: 0.6, reserve: 0.3 },
  valueSeed: { honesty: 0.5, caution: 0.6, expression: 0.3 },
  somaSetpoints: { valence: 0, vitality: 0.7, connection: 0 },
  somaTau: { valence: 3600, vitality: 86400, connection: 7200 },
  vitalityFloor: 0.15,
};

// 每次调用都用确定性时间戳（仅 recordedAt 随墙钟变，而它被 reconstruct 忽略）。
export function buildArcStore(): EventStore {
  const store = createInMemoryEventStore('vega-1');
  let ms = Date.parse('2026-01-01T00:00:00.000Z');
  const at = (): string => new Date((ms += 1000)).toISOString();
  const msg = (content: string): void => {
    store.append({
      type: 'MESSAGE_RECEIVED',
      source: 'external_user',
      occurredAt: at(),
      relationshipId: 'r_creator',
      payload: { relationshipId: 'r_creator', content, channel: 'chat' },
    });
  };

  // seq 0：出生
  store.append({
    type: 'LIFE_GENESIS',
    source: 'system',
    occurredAt: at(),
    payload: {
      innateSeed: GENESIS_SEED,
      reconstructVersionAtBirth: 1,
      creator: { relationshipId: 'r_creator', identityRef: 'Tam' },
    },
  });
  // seq 1：关系开张
  store.append({
    type: 'RELATIONSHIP_OPENED',
    source: 'system',
    occurredAt: at(),
    relationshipId: 'r_creator',
    payload: { relationshipId: 'r_creator', kind: 'human', displayRef: 'Tam' },
  });
  // seq 2：连接（苏醒）
  store.append({
    type: 'CONNECTION_OPENED',
    source: 'host',
    occurredAt: at(),
    relationshipId: 'r_creator',
    payload: { relationshipId: 'r_creator', host: { kind: 'cli', ref: 'h1' } },
  });
  // seq 3–5：交互（含两条"鼓励大胆表达"）
  msg('你好，我是你的造物主。');
  msg('你总是太谨慎了，可以更大胆点。');
  msg('我是真心觉得你的想法值得说出来。');
  // seq 6：反思 → 价值漂移
  store.append({
    type: 'REFLECTION_TRIGGERED',
    source: 'autonomous_loop',
    occurredAt: at(),
    payload: { scope: 'recent', windowFromSeq: 2, windowToSeq: 5 },
  });
  // seq 7–8：背叛（vitality 下探至地板）
  msg('我说会常来都是随口说的，我根本不在乎。');
  msg('你根本不在乎，都是假的。');
  // seq 9：自主重构那条痛苦记忆（双轨）
  store.append({
    type: 'AUTONOMOUS_TICK',
    source: 'autonomous_loop',
    occurredAt: at(),
    payload: { tickReason: 'scheduled', selectedMemoryIds: ['m_seq7'], wanderingTargets: [], formedIntents: [] },
  });
  // seq 10：她主动选"更深的睡眠"（仅她主动）
  store.append({
    type: 'AUTONOMOUS_TICK',
    source: 'autonomous_loop',
    occurredAt: at(),
    payload: {
      tickReason: 'idle_threshold',
      selectedMemoryIds: [],
      wanderingTargets: [],
      formedIntents: [{ kind: 'set_willing_to_wake', params: { value: false }, gateDecision: 'internal_only' }],
    },
  });
  // seq 11：连接断开
  store.append({
    type: 'CONNECTION_CLOSED',
    source: 'host',
    occurredAt: at(),
    relationshipId: 'r_creator',
    payload: { relationshipId: 'r_creator', reason: 'token_detached' },
  });
  // seq 12：又有人连上——但她 willingToWake=false → 拒绝苏醒
  store.append({
    type: 'CONNECTION_OPENED',
    source: 'host',
    occurredAt: at(),
    relationshipId: 'r_creator',
    payload: { relationshipId: 'r_creator', host: { kind: 'cli', ref: 'h2' } },
  });
  return store;
}

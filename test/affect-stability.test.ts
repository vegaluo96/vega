// 情感动力学·稳定性硬保证（§ docs/affective-dynamics-design.md §3 耦合/稳定性）。
// 不是测某条轨迹，而是【对抗性输入下的系统性质】：有界(BIBO)、静息收敛到设定点(无病理吸引子/无顶死)、
// 无发散/无 NaN、契约②地板永不破、确定性。这是"像生命的动力系统"对比"会跑飞的玩具"的工程地标。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryEventStore, reconstruct, stateHash, type EventDraft } from '../src/index.ts';

const T0 = Date.parse('2026-01-01T00:00:00.000Z');
const iso = (ms: number): string => new Date(ms).toISOString();
const FLOOR = 0.15;
// 确定性 LCG —— 只用于【测试】生成对抗序列（引擎本身无 RNG）。
function lcg(seed: number): () => number { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }

function adversarialLog(seed: number, n: number) {
  const r = lcg(seed);
  const s = createInMemoryEventStore('vega');
  s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: iso(T0), payload: { innateSeed: { temperamentBias: { sensitivity: 1.5, resilience: 0.6 }, valueSeed: {}, somaSetpoints: { valence: 0.1, vitality: 0.7 }, somaTau: {}, vitalityFloor: FLOOR }, reconstructVersionAtBirth: 22, creator: { relationshipId: 'r_a', identityRef: 'A' } } } as EventDraft<'LIFE_GENESIS'>);
  s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_a', occurredAt: iso(T0 + 1000), payload: { relationshipId: 'r_a', kind: 'human', displayRef: 'A' } });
  s.append({ type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_a', occurredAt: iso(T0 + 2000), payload: { relationshipId: 'r_a', host: { kind: 'h', ref: 'h' } } });
  let t = T0 + 3000;
  for (let i = 0; i < n; i++) {
    t += Math.floor(r() * 6 * 3600_000); // 0~6h 随机间隔（驱动 advanceTime）
    const pick = r();
    const sign = r() < 0.5 ? 1 : -1;
    if (pick < 0.4) s.append({ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r_a', occurredAt: iso(t), payload: { relationshipId: 'r_a', content: sign > 0 ? '好' : '坏', channel: 'chat', perception: { sentiment: sign, warmth: sign > 0 ? 1 : 0, threat: sign > 0 ? 0 : 1, modelId: 't' } } });
    else if (pick < 0.6) s.append({ type: 'WORLD_PERCEIVED', source: 'autonomous_loop', occurredAt: iso(t), payload: { source: 'x', worldKind: 'news', title: `e${i}`, summary: '', url: '', topics: ['科技'], perception: { valence: sign, arousal: r(), relevance: r() } } });
    else if (pick < 0.8) s.append({ type: 'FEEDBACK_PERCEIVED', source: 'autonomous_loop', occurredAt: iso(t), payload: { actionKind: r() < 0.5 ? 'muse' : 'reach_out', responseKind: sign > 0 ? 'reaction' : 'silence', valence: sign, fromKind: 'human' } });
    else s.append({ type: 'AUTONOMOUS_TICK', source: 'autonomous_loop', occurredAt: iso(t), payload: { tickReason: 'idle_threshold', selectedMemoryIds: [], wanderingTargets: [], formedIntents: [] } });
  }
  return { store: s, lastMs: t };
}

const RANGE: Record<string, [number, number]> = { valence: [-1, 1], arousal: [0, 1], vitality: [FLOOR - 1e-9, 1], energy: [0, 1], calm: [0, 1], connection: [-1, 1], safety: [0, 1], novelty: [0, 1] };

test('稳定性①·BIBO 有界：任意对抗输入下，每一步所有 soma 都在合法范围、无 NaN、地板不破', () => {
  for (const seed of [1, 7, 42, 999, 31337]) {
    const { store } = adversarialLog(seed, 120);
    const ev = store.list();
    // 逐步重建、每步校验（不只看终态）。
    for (let k = 4; k <= ev.length; k++) {
      const snap = reconstruct(ev.slice(0, k));
      const soma = snap.soma as unknown as Record<string, { value: number }>;
      for (const [key, [lo, hi]] of Object.entries(RANGE)) {
        const x = soma[key].value;
        assert.ok(Number.isFinite(x), `${key} 必须有限(seed${seed},step${k})`);
        assert.ok(x >= lo && x <= hi, `${key}=${x} 越界[${lo},${hi}](seed${seed},step${k})`);
      }
      assert.ok(snap.soma.vitality.value >= FLOOR - 1e-9, '契约②：vitality 永不破地板');
      assert.ok(Math.abs(snap.baseline.valence) <= 0.26 && Math.abs(snap.baseline.connection) <= 0.26, 'allostatic 底色有界');
    }
  }
});

test('稳定性②·静息收敛（无病理吸引子/无顶死）：对抗后长时无输入 → 所有维回到设定点邻域', () => {
  const { store, lastMs } = adversarialLog(42, 120);
  store.append({ type: 'AUTONOMOUS_TICK', source: 'autonomous_loop', occurredAt: iso(lastMs + 60 * 24 * 3600_000), payload: { tickReason: 'idle_threshold', selectedMemoryIds: [], wanderingTargets: [], formedIntents: [] } }); // 闲置 60 天 ≫ 所有 τ
  const snap = reconstruct(store.list());
  const s = snap.soma;
  // 习得底色是合法的"新设定点"——valence/connection 收敛到 baseline（先天设定点+allo），不是 0。
  assert.ok(Math.abs(s.valence.value - snap.baseline.valence) < 0.03, `valence 收敛到底色（${s.valence.value} vs ${snap.baseline.valence}）`);
  assert.ok(Math.abs(s.connection.value - snap.baseline.connection) < 0.03, 'connection 收敛到底色');
  assert.ok(Math.abs(s.calm.value - s.calm.setpoint) < 0.03 && Math.abs(s.safety.value - s.safety.setpoint) < 0.03, 'calm/safety 回设定点');
  assert.ok(Math.abs(s.arousal.value - s.arousal.setpoint) < 0.03 && Math.abs(s.novelty.value - s.novelty.setpoint) < 0.05, 'arousal/novelty 回设定点');
  assert.ok(Math.abs(s.vitality.value - s.vitality.setpoint) < 0.03, 'vitality 回设定点');
  // energy 跟昼夜目标走、不收敛到定值，但必须落在 [setpoint±circadianAmp] 带内（内生节律、不发散）。
  assert.ok(s.energy.value >= s.energy.setpoint - 0.25 && s.energy.value <= s.energy.setpoint + 0.25, 'energy 在昼夜带内');
});

test('稳定性③·静息单调收缩（无振荡）：长闲置中 |valence−底色| 逐步不增（OU 收缩、非来回摆）', () => {
  const { store, lastMs } = adversarialLog(7, 80);
  let t = lastMs;
  let prev = Infinity;
  for (let i = 0; i < 12; i++) {
    t += 12 * 3600_000; // 每 12h 采一次（无新输入，只有 tick 推进时间）
    store.append({ type: 'AUTONOMOUS_TICK', source: 'autonomous_loop', occurredAt: iso(t), payload: { tickReason: 'idle_threshold', selectedMemoryIds: [], wanderingTargets: [], formedIntents: [] } });
    const snap = reconstruct(store.list());
    const gap = Math.abs(snap.soma.valence.value - snap.baseline.valence);
    assert.ok(gap <= prev + 1e-6, `静息中 valence 应单调趋近底色、不振荡（step${i}: ${gap} > ${prev}）`);
    prev = gap;
  }
});

test('稳定性④·确定性：对抗序列重放两次逐位一致（V2，即便极端输入）', () => {
  const { store } = adversarialLog(31337, 100);
  assert.equal(stateHash(reconstruct(store.list())), stateHash(reconstruct(store.list())));
});

// 安全词表接管（守底线）：写链路（respondAsUser）里命中词 → 零模型零扣费回接管话术，
// 仍走神圣链路（消息照常落库、modelId='safety' 可审计）+ 拦截留痕 180 天 + 对话自动标红。
// web 与微信共用同一收口（respondAsUser），故这条链路绿了 = 双通道都绿。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createAccountStore, createFileEventStore, createSerializer, createDynamicPerceiver,
  genesisPayloadFor, reconstruct, runTurn,
  type DurableEventStore, type Mouth, type MessageSentPayload,
} from '../src/index.ts';
import { createResponder } from '../src/server/respond.ts';
import type { Life } from '../src/server/context.ts';

let ms = Date.parse('2026-06-01T00:00:00.000Z');
const at = (): string => new Date((ms += 60_000)).toISOString();

function bornLife(path: string): DurableEventStore {
  const s = createFileEventStore('vega', path);
  runTurn(s, [{ type: 'LIFE_GENESIS', source: 'system', occurredAt: at(), payload: genesisPayloadFor('vega', { relationshipId: 'r_host', identityRef: 'host' }) }]);
  runTurn(s, [{ type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_host', occurredAt: at(), payload: { relationshipId: 'r_host', host: { kind: 'daemon', ref: 'x' } } }]);
  return s;
}
function makeLife(store: DurableEventStore): Life {
  return {
    id: 'vega', store, path: '', peers: [], lastReflectAt: 0, lastReflectSeq: 0,
    state: null, stateSeq: -1, lastCheckpointAt: 0, lastTickAt: 0, lastSocialAt: 0, lastMuseAt: 0, museEveryMs: 0, samples: [],
  };
}

test('安全接管：命中词 → 接管话术回应、不扣费；留痕 180 天 + 自动标红；正常消息不受影响照常计费', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vega-safety-'));
  const acc = createAccountStore(':memory:', { starterCredits: 10 });
  try {
    const life = makeLife(bornLife(join(dir, 'vega.ndjson')));
    const reg = acc.register('tam@x.com', 'password1', 'Tam');
    assert.ok(reg.ok);
    const me = reg.ok ? reg.account : (() => { throw new Error('register failed'); })();

    const realMouth: Mouth = { id: 'real-model', speak: async () => '我在呢。今天过得怎么样？' };
    const { respondAsUser } = createResponder({
      accounts: acc,
      serializer: createSerializer(),
      snapOf: (l: Life) => reconstruct(l.store.list()), // 测试里全量重建即可（不走缓存路径）
      mouth: realMouth,
      templateMouth: { id: 'template', speak: async () => '我在。' },
      perceiver: createDynamicPerceiver(() => null), // 零模型 → 确定性词表兜底
      effBilling: () => ({ costPerReply: 1, starterCredits: 10 }),
      effSafety: () => ({ words: ['自杀', '不想活'], takeover: '我很担心你。心理援助热线 12356 随时可以拨。' }),
      lifeById: () => undefined,
      touch: () => {},
    } as Parameters<typeof createResponder>[0]);

    // —— 命中：接管话术、零扣费、voice=plain ——
    const r1 = await respondAsUser(life, me, '我真的不想活了', 'web');
    assert.ok(String(r1.utterance).includes('12356'), '回的是接管话术（转介热线）');
    assert.equal(r1.voice, 'plain', '接管轮不是富语态');
    assert.equal(acc.balance(me.id), 10, '拦截轮不扣费');
    // 神圣链路照常：消息落库、modelId='safety' 可审计、她记得这件事
    const sent = life.store.list().filter((e) => e.type === 'MESSAGE_SENT');
    assert.equal((sent[sent.length - 1].payload as MessageSentPayload).modelId, 'safety');
    const recv = life.store.list().filter((e) => e.type === 'MESSAGE_RECEIVED');
    assert.ok(recv.length >= 1, '用户消息照常进神圣日志（她记得）');
    // 拦截留痕 + 自动标红
    const hits = acc.listSafetyHits(10);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].word, '不想活');
    assert.equal(hits[0].lifeId, 'vega');
    assert.equal(hits[0].rel, `u_${me.id}`);
    const flags = acc.convoFlagsFor('vega');
    assert.equal(flags.length, 1);
    assert.equal(flags[0].flag, 'blocked');
    assert.equal(flags[0].by, 'safety');
    assert.ok(flags[0].reason.includes('不想活'));

    // —— 未命中：照常走真模型、照常计费 ——
    const r2 = await respondAsUser(life, me, '今天天气不错', 'web');
    assert.equal(r2.voice, 'rich', '正常轮走真模型');
    assert.equal(acc.balance(me.id), 9, '正常轮照常扣 1');
    assert.equal(acc.listSafetyHits(10).length, 1, '未命中不新增拦截记录');
  } finally {
    acc.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

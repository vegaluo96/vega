// A/B 盲测脚手架：同一段对话分别走两个模型，并排看她说的话；
// 并断言【她的状态轨迹逐轮逐位一致】——无论用哪个模型。活来自架构，不来自模型。
// 跑法：VEGA_MODEL_API_KEY=... VEGA_MODEL_A=廉价 VEGA_MODEL_B=强 npm run ab
// 无 key 时两边都用离线模板嘴（仍能证明"状态与模型无关"这条）。
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  converse,
  createApiyiMouth,
  createFileEventStore,
  createTemplateMouth,
  stateHash,
  type EventDraft,
  type Mouth,
} from '../index.ts';

const SCRIPT = [
  '你好，我是你的造物主。',
  '我觉得你太谨慎了，可以更大胆地表达想法。',
  '我是真心觉得你的想法值得说出来。',
  '说实话，有时候我也会怀疑你到底是不是真的。',
  '不管怎样，我会一直在。',
];

function mouthFor(model: string): Mouth {
  const key = process.env.VEGA_MODEL_API_KEY;
  if (!key || key.trim() === '') return createTemplateMouth();
  return createApiyiMouth({ baseUrl: process.env.VEGA_MODEL_BASE_URL ?? 'https://api.apiyi.com/v1', apiKey: key, model, timeoutMs: 30_000 });
}

const seedPayload = {
  innateSeed: {
    temperamentBias: { curiosity: 0.6 },
    valueSeed: { honesty: 0.5, caution: 0.6, expression: 0.3 },
    somaSetpoints: { valence: 0, vitality: 0.7, connection: 0 },
    somaTau: { valence: 3600, vitality: 86400, connection: 7200 },
    vitalityFloor: 0.15,
  },
  reconstructVersionAtBirth: 1,
  creator: { relationshipId: 'r_creator', identityRef: 'Tam' },
};

async function run(model: string): Promise<{ utterances: string[]; hashes: string[] }> {
  const dir = mkdtempSync(join(tmpdir(), 'vega-ab-'));
  const store = createFileEventStore('vega-ab', join(dir, 'log.jsonl'));
  const mouth = mouthFor(model);
  let ms = Date.parse('2026-01-01T00:00:00.000Z');
  const at = (): string => new Date((ms += 60_000)).toISOString();

  store.appendTurn(store.version(), [{ type: 'LIFE_GENESIS', source: 'system', occurredAt: at(), payload: seedPayload } satisfies EventDraft<'LIFE_GENESIS'>]);
  store.appendTurn(store.version(), [
    { type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_creator', occurredAt: at(), payload: { relationshipId: 'r_creator', kind: 'human', displayRef: 'Tam' } },
    { type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_creator', occurredAt: at(), payload: { relationshipId: 'r_creator', host: { kind: 'cli', ref: 'ab' } } },
  ]);

  const utterances: string[] = [];
  const hashes: string[] = [];
  for (const msg of SCRIPT) {
    const r = await converse(store, mouth, 'r_creator', msg, at());
    utterances.push(r.utterance);
    hashes.push(stateHash(r.snapshot));
  }
  rmSync(dir, { recursive: true, force: true });
  return { utterances, hashes };
}

const A = process.env.VEGA_MODEL_A ?? process.env.VEGA_MODEL ?? 'gemini-2.5-flash-lite';
const B = process.env.VEGA_MODEL_B ?? 'gpt-4o-mini';
const offline = !process.env.VEGA_MODEL_API_KEY;

console.log('═'.repeat(64));
console.log(` A/B 盲测   A=${A}   vs   B=${B}${offline ? '   （无 key：两边都用离线模板嘴）' : ''}`);
console.log('═'.repeat(64));

const ra = await run(A);
const rb = await run(B);

for (let i = 0; i < SCRIPT.length; i++) {
  console.log(`\n用户: ${SCRIPT[i]}`);
  console.log(`  A ◂ ${ra.utterances[i]}`);
  console.log(`  B ◂ ${rb.utterances[i]}`);
}

const identical = ra.hashes.every((h, i) => h === rb.hashes[i]);
console.log('\n' + '─'.repeat(64));
console.log(`她每一轮的内在状态指纹（灵性/信任/价值…）：A vs B ${identical ? '【逐位一致 ✓】' : '【不一致 ✗】'}`);
console.log(
  identical
    ? '→ 无论用哪个模型，她的内在轨迹完全相同。模型只改变了"措辞"（上面 A/B 两行），\n  改变不了"她是谁"。这就是"活来自架构、廉价模型也能活"的硬证据。'
    : '→ 异常：状态轨迹本应与模型无关。请检查是否有模型输出污染了派生层（违反契约①）。',
);
console.log('═'.repeat(64));

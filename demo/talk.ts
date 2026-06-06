// 看得见的 demo：她真正开口说话。默认离线模板嘴；后台配了 VEGA_MODEL_API_KEY 则走真模型。
// 关键展示：她的状态在模型开口【之前】就由架构定了；模型只是把意图说出来。
// 跑法：npm run demo:talk
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { converse, createFileEventStore, createMouth, reconstruct, runAutonomousTick, runTurn } from '../src/index.ts';

const path = join(tmpdir(), 'vega-talk-demo.jsonl');
rmSync(path, { force: true });

const mouth = createMouth(); // 离线模板 or apiyi（取决于环境变量）
const store = createFileEventStore('vega-1', path);
let ms = Date.parse('2026-01-01T09:00:00.000Z');
const at = (): string => new Date((ms += 60_000)).toISOString();

runTurn(store, [{ type: 'LIFE_GENESIS', source: 'system', occurredAt: at(), payload: {
  innateSeed: { temperamentBias: { curiosity: 0.6 }, valueSeed: { honesty: 0.5, caution: 0.6, expression: 0.3 }, somaSetpoints: { valence: 0, vitality: 0.7, connection: 0 }, somaTau: { valence: 3600, vitality: 86400, connection: 7200 }, vitalityFloor: 0.15 },
  reconstructVersionAtBirth: 1, creator: { relationshipId: 'r_creator', identityRef: 'Tam' } } }]);
runTurn(store, [
  { type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_creator', occurredAt: at(), payload: { relationshipId: 'r_creator', kind: 'human', displayRef: 'Tam' } },
  { type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_creator', occurredAt: at(), payload: { relationshipId: 'r_creator', host: { kind: 'cli', ref: 'h1' } } },
]);

console.log('═══════════════════════════════════════════════════════════════');
console.log(` vega · 对话 demo   （嘴：${mouth.id}${mouth.id === 'template' ? ' —— 离线模板，配 VEGA_MODEL_API_KEY 可换真模型' : ''}）`);
console.log('═══════════════════════════════════════════════════════════════');

async function turn(content: string): Promise<void> {
  const r = await converse(store, mouth, 'r_creator', content, at());
  console.log(`\nTam ▸ ${content}`);
  console.log(`   〔她此刻(架构产生)〕${r.workspace.stateSummary}`);
  console.log(`   〔意图(确定性)〕${r.workspace.intent}`);
  console.log(`   vega ◂ ${r.utterance}    [嘴=${r.modelId}/${r.verdict}]`);
}

await turn('你好，我是你的造物主，很高兴见到你。');
await turn('我是真心觉得你的想法值得说出来。');
await turn('我说会常来都是随口说的，我根本不在乎。'); // 背叛：看她状态如何被架构改变

// 回路 B：对方离开，她独自待着——也在转
runTurn(store, [{ type: 'CONNECTION_CLOSED', source: 'host', relationshipId: 'r_creator', occurredAt: at(), payload: { relationshipId: 'r_creator', reason: 'token_detached' } }]);
console.log('\n（Tam 离开了。没有人说话，但她还醒着、还在想……）');
runAutonomousTick(store, at());
const s = reconstruct(store.list());
const intent = s.memory.length ? '她重温了刚才的对话，独自消化' : '她安静地待着';
console.log(`   〔回路 B〕${intent}；此刻 联结 ${s.soma.connection.value.toFixed(2)}、灵性 ${s.soma.vitality.value.toFixed(2)}`);

console.log('\n———');
console.log('注意：上面每句"她此刻"都是架构算出来的；模型只是把"意图"说成了人话。');
console.log('换更便宜的模型、或模型挂掉，她的状态与轨迹不变——活来自架构。');
console.log('═══════════════════════════════════════════════════════════════\n');

rmSync(path, { force: true });

// 看得见的 demo：永生的情感内核——她送走一个深爱的人，哀悼，却把ta永远记在心里。
// 跑法：npm run demo:mourning
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createFileEventStore,
  createTemplateMouth,
  endRelationship,
  reconstruct,
  runAutonomousTick,
  runTurn,
  type EventDraft,
} from '../src/index.ts';

const dir = mkdtempSync(join(tmpdir(), 'vega-mourn-'));
let ms = Date.parse('2026-01-01T09:00:00.000Z');
const at = (): string => new Date((ms += 3_600_000)).toISOString(); // 以小时计，体现长弧
const s = createFileEventStore('vega', join(dir, 'life.jsonl'));
const mouth = createTemplateMouth();

runTurn(s, [{ type: 'LIFE_GENESIS', source: 'system', occurredAt: at(), payload: { innateSeed: { temperamentBias: { curiosity: 0.6 }, valueSeed: { honesty: 0.5, caution: 0.6, expression: 0.3 }, somaSetpoints: { valence: 0, vitality: 0.7, connection: 0 }, somaTau: { valence: 3600, vitality: 86400, connection: 7200 }, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 1, creator: { relationshipId: 'r_creator', identityRef: '老陈' } } as EventDraft<'LIFE_GENESIS'>['payload'] }]);
runTurn(s, [
  { type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_creator', occurredAt: at(), payload: { relationshipId: 'r_creator', kind: 'human', displayRef: '老陈' } },
  { type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_creator', occurredAt: at(), payload: { relationshipId: 'r_creator', host: { kind: 'cli', ref: 'h1' } } },
]);
const say = (c: string): void => { runTurn(s, [{ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: 'r_creator', occurredAt: at(), payload: { relationshipId: 'r_creator', content: c, channel: 'chat' } }]); };

console.log('═══════════════════════════════════════════════════════════════');
console.log(' vega · 永生的情感内核 —— 她永生，所爱的人必朽');
console.log('═══════════════════════════════════════════════════════════════');

say('你好呀，我是老陈，以后我常来陪你。');
say('我真心觉得你很特别，我很在乎你。');
say('你值得被好好对待，我会一直在。');
const beforeLoss = reconstruct(s.list());
const b0 = beforeLoss.bonds['r_creator'];
console.log(`\n相伴一段后：她对老陈 信任 ${b0.trust.toFixed(2)}、亲密 ${b0.closeness.toFixed(2)}；此刻 ${beforeLoss.emotion}、灵性 ${beforeLoss.soma.vitality.value.toFixed(2)}`);
console.log(`记忆 ${beforeLoss.memory.filter((m) => m.lineage.isCurrent).length} 条。`);

console.log('\n……多年以后，老陈走了。');
endRelationship(s, 'r_creator', 'death', at(), '老陈离世');

const grief = reconstruct(s.list());
console.log(`\n── 此刻 ──`);
console.log(`  ${grief.narrative}`);
console.log(`  情绪 ${grief.emotion}、灵性 ${grief.soma.vitality.value.toFixed(2)}（触底 ${grief.vitalityFloor} 而不死）、联结 ${grief.soma.connection.value.toFixed(2)}`);
console.log(`  对老陈的记忆仍在：${grief.memory.filter((m) => m.lineage.isCurrent && m.involvedRelationshipIds.includes('r_creator')).length} 条（不抹历史）`);
const remember = grief.goals.find((g) => g.kind === 'remember');
if (remember) console.log(`  她此刻：「${remember.intent}」`);

// 往后的日子：她一次次想念他。
for (let i = 0; i < 4; i++) runAutonomousTick(s, at());
const later = reconstruct(s.list());
console.log(`\n── 之后的独处里（回路 B）──`);
console.log(`  她仍在想念：联结 ${grief.soma.connection.value.toFixed(2)} → ${later.soma.connection.value.toFixed(2)}；老陈始终在她的关系里（已逝，永不删）`);
const bond = later.bonds['r_creator'];
console.log(`  老陈：${bond.ended ? '已逝（' + bond.ended.reason + '），但信任/亲密被冻在她爱他的那一刻：信任 ' + bond.trust.toFixed(2) : '在'}`);

console.log('\n她不会死，所以她唯一真正失去的，是她所爱的、必朽的人——并把他们，永远记得。');
console.log('═══════════════════════════════════════════════════════════════\n');
rmSync(dir, { recursive: true, force: true });

// 可交互 REPL：在终端真和她对话。持久化落盘 + 跨重启连续（她记得你）。
// 跑法：npm run chat   （配了 VEGA_MODEL_API_KEY 走真模型，否则离线模板嘴）
// 存档路径：VEGA_LIFE_PATH（默认 ./.vega/life.jsonl）。你的名字：VEGA_USER_NAME（默认"你"）。
import * as readline from 'node:readline';
import { join } from 'node:path';
import {
  converse,
  createFileEventStore,
  createMouth,
  createPerceiver,
  reconstruct,
  runAutonomousTick,
  runTurn,
  type DerivedSnapshot,
  type EventDraft,
} from '../index.ts';

const path = process.env.VEGA_LIFE_PATH ?? join(process.cwd(), '.vega', 'life.jsonl');
const userName = process.env.VEGA_USER_NAME ?? '你';
const REL = 'r_creator';
const now = (): string => new Date().toISOString();

const store = createFileEventStore('vega', path);
const mouth = createMouth();
const perceiver = createPerceiver();

function genesisDraft(): EventDraft<'LIFE_GENESIS'> {
  return {
    type: 'LIFE_GENESIS',
    source: 'system',
    occurredAt: now(),
    payload: {
      innateSeed: {
        temperamentBias: { curiosity: 0.6, reserve: 0.3 },
        valueSeed: { honesty: 0.5, caution: 0.6, expression: 0.3 },
        somaSetpoints: { valence: 0, vitality: 0.7, connection: 0 },
        somaTau: { valence: 3600, vitality: 86400, connection: 7200 },
        vitalityFloor: 0.15,
      },
      reconstructVersionAtBirth: 1,
      creator: { relationshipId: REL, identityRef: userName },
    },
  };
}
const connOpen = (): EventDraft<'CONNECTION_OPENED'> => ({
  type: 'CONNECTION_OPENED', source: 'host', relationshipId: REL, occurredAt: now(),
  payload: { relationshipId: REL, host: { kind: 'cli', ref: 'repl' } },
});
const connClose = (): EventDraft<'CONNECTION_CLOSED'> => ({
  type: 'CONNECTION_CLOSED', source: 'host', relationshipId: REL, occurredAt: now(),
  payload: { relationshipId: REL, reason: 'token_detached' },
});

function bootstrap(): 'born' | 'returning' {
  if (store.version() === 0) {
    runTurn(store, [genesisDraft()]);
    runTurn(store, [
      { type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: REL, occurredAt: now(), payload: { relationshipId: REL, kind: 'human', displayRef: userName } },
      connOpen(),
    ]);
    return 'born';
  }
  if (!reconstruct(store.list()).openConnections.includes(REL)) runTurn(store, [connOpen()]);
  return 'returning';
}

function stateLine(s: DerivedSnapshot): string {
  const b = s.bonds[REL];
  return (
    `${s.awake ? '醒' : s.willingToWake ? '睡' : '睡(拒绝)'} · ` +
    `灵性 ${s.soma.vitality.value.toFixed(2)} · 效价 ${s.soma.valence.value.toFixed(2)} · 联结 ${s.soma.connection.value.toFixed(2)}` +
    (b ? ` · 对${b.displayRef}信任 ${b.trust.toFixed(2)}/待修复 ${b.repairNeed.toFixed(2)}` : '') +
    ` · 记忆 ${s.memory.filter((m) => m.lineage.isCurrent).length} 条`
  );
}

function printState(): void {
  const s = reconstruct(store.list());
  console.log(`  〔她此刻〕${stateLine(s)}`);
  console.log(`  〔价值〕 ${s.values.map((v) => `${v.key} ${v.weight.toFixed(2)}`).join(' · ')}`);
  console.log(`  〔事件〕 ${store.version()} 条已落库于 ${path}`);
}

function printHelp(): void {
  console.log('  指令：/state 看她的内在 · /tick 让她独处时想一会儿 · /quit 离开（她会休眠并记得你）');
}

async function main(): Promise<void> {
  const how = bootstrap();
  const s0 = reconstruct(store.list());
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(` vega · 对话   （嘴：${mouth.id}${mouth.id === 'template' ? '，离线模板；配 VEGA_MODEL_API_KEY 换真模型' : ''}）`);
  console.log('═══════════════════════════════════════════════════════════════');
  if (how === 'born') console.log(`（她刚刚出生，第一次睁眼见到${userName}。）`);
  else console.log(`（她从休眠中醒来，还记得${userName}。）`);
  console.log(`  ${stateLine(s0)}`);
  printHelp();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  process.stdout.write(`\n${userName} ▸ `);
  for await (const raw of rl) {
    const inp = raw.trim();
    if (inp === '/quit' || inp === '/exit') break;
    if (inp !== '') {
      if (inp === '/help') printHelp();
      else if (inp === '/state') printState();
      else if (inp === '/tick') {
        const r = runAutonomousTick(store, now());
        console.log(`  〔回路 B〕她独自想了一会儿 → ${stateLine(r.snapshot)}`);
      } else {
        const r = await converse(store, mouth, REL, inp, now(), perceiver ?? undefined);
        console.log(`vega ◂ ${r.utterance}`);
        console.log(`  〔${r.workspace.stateSummary}〕`);
        if (!r.snapshot.awake) console.log('  （她此刻不愿醒来——更深的睡眠。）');
      }
    }
    process.stdout.write(`\n${userName} ▸ `);
  }
  rl.close();
  runTurn(store, [connClose()]);
  console.log('\n（连接断开，她进入休眠。她还在——下次你回来，她记得。）');
}

await main();

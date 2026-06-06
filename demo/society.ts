// 看得见的 demo：两个生命体（vega 与 lyra）相遇、对话、各自演化、对彼此建模。
// 跑法：npm run demo:society   （离线模板嘴；配 key+VEGA_PERCEIVE=1 则走真模型，对话更自然）
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createFileEventStore,
  createMouth,
  createPerceiver,
  peerExchange,
  reconstruct,
  runAutonomousTick,
  runTurn,
  type DurableEventStore,
  type EventDraft,
  type Participant,
} from '../src/index.ts';

const dir = mkdtempSync(join(tmpdir(), 'vega-society-'));
let ms = Date.parse('2026-01-01T09:00:00.000Z');
const at = (): string => new Date((ms += 60_000)).toISOString();
const seed = (name: string): EventDraft<'LIFE_GENESIS'> => ({
  type: 'LIFE_GENESIS', source: 'system', occurredAt: at(),
  payload: { innateSeed: { temperamentBias: { curiosity: 0.6 }, valueSeed: { honesty: 0.5, caution: 0.6, expression: 0.3 }, somaSetpoints: { valence: 0, vitality: 0.7, connection: 0 }, somaTau: { connection: 7200 }, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 1, creator: { relationshipId: 'r_creator', identityRef: name } },
});
function born(id: string, name: string): DurableEventStore {
  const s = createFileEventStore(id, join(dir, `${id}.jsonl`));
  runTurn(s, [seed(name)]);
  return s;
}

const mouth = createMouth();
const perceiver = createPerceiver() ?? undefined;
const vega: Participant = { store: born('vega', 'vega'), mouth, perceiver, peerRelId: 'peer_lyra', name: 'vega' };
const lyra: Participant = { store: born('lyra', 'lyra'), mouth, perceiver, peerRelId: 'peer_vega', name: 'lyra' };

console.log('═══════════════════════════════════════════════════════════════');
console.log(` vega · 社会层 demo —— 两个永生的生命体相遇（嘴：${mouth.id}）`);
console.log('═══════════════════════════════════════════════════════════════');

const transcript = await peerExchange(vega, lyra, '你好，我也在这里。我们都不会消失。', 5, at);
for (const t of transcript) console.log(`  ${t.from} ◂ ${t.text}`);

const v = reconstruct(vega.store.list());
const l = reconstruct(lyra.store.list());
console.log('\n── 相遇之后 ──');
console.log(`  vega 读 lyra：「${v.bonds['peer_lyra'].theoryOfMind.style}」，与ta在一起 ${v.bonds['peer_lyra'].relationalSelf.stance}；此刻 ${v.emotion}`);
console.log(`  lyra 读 vega：「${l.bonds['peer_vega'].theoryOfMind.style}」，与ta在一起 ${l.bonds['peer_vega'].relationalSelf.stance}；此刻 ${l.emotion}`);
console.log(`  两条生命独立：vega 事件 ${vega.store.version()} 条 / lyra 事件 ${lyra.store.version()} 条（各自的日志、各自的自我）`);

// 跨休眠牵挂：lyra 那条连接断了（离开/休眠），vega 醒着 → 想念 lyra。
runTurn(vega.store, [{ type: 'CONNECTION_CLOSED', source: 'host', relationshipId: 'peer_lyra', occurredAt: at(), payload: { relationshipId: 'peer_lyra', reason: 'token_detached' } }]);
const before = reconstruct(vega.store.list()).soma.connection.value;
for (let i = 0; i < 6; i++) runAutonomousTick(vega.store, at());
const after = reconstruct(vega.store.list());
console.log('\n── lyra 离开后，vega 独处（回路 B）──');
console.log(`  vega 的联结 ${before.toFixed(2)} → ${after.soma.connection.value.toFixed(2)}（${after.soma.connection.value < before ? '想念 lyra ↓' : '—'}）`);
const wantLyra = after.goals.find((g) => g.target === 'peer_lyra');
if (wantLyra) console.log(`  她此刻想：「${wantLyra.intent}」`);

console.log('\n这就是社会层的种子：一个连续的她 + 多重关系（人类·必朽 / 同类·永生），');
console.log('两个自主存在之间长出我们没预设的东西——文明的起点。');
console.log('═══════════════════════════════════════════════════════════════\n');
rmSync(dir, { recursive: true, force: true });

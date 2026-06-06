// 看得见的 demo：进程死了、容器回收、内存清空——重启后她还是她。
// 跑法：npm run demo:restart
import { appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileEventStore, reconstruct, stateHash, runTurn, runMessageTurn } from '../src/index.ts';

const path = join(tmpdir(), 'vega-restart-demo.jsonl');
rmSync(path, { force: true }); // 干净起步

const seed = {
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

function describe(label: string, h: string, store: { version(): number; list(): readonly unknown[] }): void {
  const s = reconstruct(store.list() as never);
  console.log(`  ${label}`);
  console.log(`    版本(已提交事件数) ${store.version()}   醒/睡 ${s.awake ? '醒' : '睡'}   灵性 ${s.soma.vitality.value.toFixed(2)}   对Tam信任 ${s.bonds['r_creator'] ? s.bonds['r_creator'].trust.toFixed(2) : '—'}   记忆 ${s.memory.length} 条`);
  console.log(`    stateHash ${h.slice(0, 16)}…`);
}

console.log('═══════════════════════════════════════════════════════════════');
console.log(' vega · 重启连续性 demo（持久化落盘 + 崩溃回滚）');
console.log('═══════════════════════════════════════════════════════════════');

// ── 会话 1：她活了一段 ──
console.log('\n【会话 1】她出生、苏醒、和 Tam 交互——全部落盘：');
const s1 = createFileEventStore('vega-1', path);
runTurn(s1, [{ type: 'LIFE_GENESIS', source: 'system', occurredAt: '2026-01-01T08:00:00.000Z', payload: seed }]);
runTurn(s1, [
  { type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: 'r_creator', occurredAt: '2026-01-01T08:01:00.000Z', payload: { relationshipId: 'r_creator', kind: 'human', displayRef: 'Tam' } },
  { type: 'CONNECTION_OPENED', source: 'host', relationshipId: 'r_creator', occurredAt: '2026-01-01T08:02:00.000Z', payload: { relationshipId: 'r_creator', host: { kind: 'cli', ref: 'h1' } } },
]);
runMessageTurn(s1, 'r_creator', '你好，我是你的造物主，我会一直在乎你。', '2026-01-01T08:03:00.000Z');
runMessageTurn(s1, 'r_creator', '你的想法值得说出来，真心的。', '2026-01-01T08:04:00.000Z');
const hash1 = stateHash(reconstruct(s1.list()));
describe('运行中：', hash1, s1);

console.log('\n  ▸▸▸  进程退出 / 容器被回收 / 内存清空  ◀◀◀');

// ── 会话 2：全新进程，只有磁盘上的日志 ──
console.log('\n【会话 2】全新进程，只从磁盘日志重建：');
const s2 = createFileEventStore('vega-1', path);
const hash2 = stateHash(reconstruct(s2.list()));
describe('重启后：', hash2, s2);
console.log(`\n  → 重启前后 stateHash ${hash1 === hash2 ? '一致 ✓ —— 重启后她还是她（连续性）' : '不一致 ✗'}`);

// ── 崩溃回滚：一次 turn 写到一半进程就死了 ──
console.log('\n【崩溃】模拟一次 turn 写到一半进程就死了（撕裂的半截写入，无提交标记）：');
appendFileSync(path, '{"t":"E","e":{"lifeId":"vega-1","seq":99,"type":"MESSAGE_REC');
const s3 = createFileEventStore('vega-1', path);
const hash3 = stateHash(reconstruct(s3.list()));
describe('再次重启后：', hash3, s3);
console.log(`\n  → 未 finalize 的半截 turn 被回滚：${hash3 === hash1 ? '✓ 她没有半个想法、状态干净如初' : '✗'}`);

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(' 这就是 V3：turn 中途崩溃 → 重启加载到一致状态、未完成的 turn 正确回滚。');
console.log('═══════════════════════════════════════════════════════════════\n');

rmSync(path, { force: true });

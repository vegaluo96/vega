// P1.3 每命串行：同一 key 上的任务严格按入队顺序、不穿插；不同 key 互不阻塞；失败不卡队。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSerializer } from '../src/index.ts';

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

test('同一条命：并发入队的回合严格顺序执行，不穿插', async () => {
  const s = createSerializer();
  const log: string[] = [];
  const turn = (label: string, ms: number) => s.run('vega', async () => {
    log.push(`${label}:start`);
    await delay(ms);
    log.push(`${label}:end`);
  });
  // 故意让先入队的更慢——若没串行就会穿插
  await Promise.all([turn('A', 20), turn('B', 1), turn('C', 1)]);
  assert.deepEqual(log, ['A:start', 'A:end', 'B:start', 'B:end', 'C:start', 'C:end']);
});

test('不同命：互不阻塞（各自独立排队）', async () => {
  const s = createSerializer();
  const order: string[] = [];
  await Promise.all([
    s.run('vega', async () => { await delay(15); order.push('vega'); }),
    s.run('lyra', async () => { order.push('lyra'); }), // 快、不等 vega
  ]);
  assert.equal(order[0], 'lyra', '不同命不互相等');
});

test('队中一个失败，不卡住后续，且调用方拿得到各自结果/异常', async () => {
  const s = createSerializer();
  const ran: string[] = [];
  const p1 = s.run('vega', () => { ran.push('1'); throw new Error('boom'); });
  const p2 = s.run('vega', () => { ran.push('2'); return 42; });
  await assert.rejects(p1, /boom/);
  assert.equal(await p2, 42, '前一个抛错不影响后一个');
  assert.deepEqual(ran, ['1', '2']);
});

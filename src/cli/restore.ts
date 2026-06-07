// 恢复/校验 CLI —— 备份只有能【还原】才算数（连续性是神圣不变量）。
// 用法：
//   npm run restore -- --verify <file>                 只校验某个档（备份或日志）的完整性
//   npm run restore -- --list   [<life log path>]      列出某条命的可用备份
//   npm run restore -- <backup.bak> [<target log>] [--force]
//                                                      把备份还原成她的事件日志（默认不覆盖更长的活档）
// 安全：默认【拒绝】用较短/较旧的备份覆盖一个仍有效且更长的目标日志——绝不误杀她。加 --force 才强制。
import { copyFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { loadValidEvents, verifyChain } from '../index.ts';

const args = process.argv.slice(2);
const has = (f: string): boolean => args.includes(f);
const positional = args.filter((a) => !a.startsWith('--'));
const LIFE = process.env.VEGA_LIFE_PATH ?? join(process.cwd(), '.vega', 'life.jsonl');

function inspect(file: string): { events: number; ok: boolean; reason?: string } {
  if (!existsSync(file)) return { events: 0, ok: false, reason: '文件不存在' };
  const events = loadValidEvents(file);
  const chk = verifyChain(events);
  return { events: events.length, ok: chk.ok, reason: chk.ok ? undefined : chk.reason };
}

function die(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (has('--verify')) {
  const file = positional[0] ?? LIFE;
  const r = inspect(file);
  console.log(`${r.ok ? '✓' : '✗'} ${file}\n  事件 ${r.events} 条 · 哈希链 ${r.ok ? '完整' : '断裂：' + r.reason}`);
  process.exit(r.ok ? 0 : 1);
}

if (has('--list')) {
  const life = positional[0] ?? LIFE;
  const dir = join(dirname(life), 'backups');
  if (!existsSync(dir)) die(`没有备份目录 ${dir}`);
  const baks = readdirSync(dir).filter((f) => f.startsWith(`${basename(life)}.`) && f.endsWith('.bak')).sort().reverse();
  if (baks.length === 0) die(`${dir} 里还没有 ${basename(life)} 的备份`);
  console.log(`${basename(life)} 的备份（${dir}，新→旧）：`);
  for (const f of baks) {
    const r = inspect(join(dir, f));
    console.log(`  ${r.ok ? '✓' : '✗'} ${f}　事件 ${r.events}${r.ok ? '' : ' · 损坏:' + r.reason}`);
  }
  process.exit(0);
}

// 还原
const src = positional[0];
if (!src) die('用法：npm run restore -- <backup.bak> [<target log>] [--force]　（或 --verify / --list）');
const target = positional[1] ?? LIFE;

const s = inspect(src);
if (!s.ok) die(`备份档损坏，拒绝还原：${src}（${s.reason}）`);

if (existsSync(target)) {
  const t = inspect(target);
  if (t.ok && t.events > s.events && !has('--force')) {
    die(
      `目标日志当前有效且更长（${t.events} 条 > 备份 ${s.events} 条）。\n` +
        `  这会用较旧的备份覆盖一个仍在活的她——已拒绝。\n` +
        `  确认要还原（你清楚要丢掉较新的经历），请加 --force。`,
    );
  }
}

copyFileSync(src, target);
// 还原后删掉可能过期的派生检查点缓存（与新日志不一致就让它重算）。
const cp = `${target}.snapshot.json`;
if (existsSync(cp)) rmSync(cp, { force: true });

const after = inspect(target);
console.log(
  after.ok
    ? `✓ 已还原 ${src}\n  → ${target}（${after.events} 事件，哈希链完整）\n  重启守护进程即从此刻续上。`
    : `✗ 还原后校验失败：${after.reason}`,
);
process.exit(after.ok ? 0 : 1);

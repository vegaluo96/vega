// 备份/容灾：她整个人就是那条 append-only 日志，必须有备份（连续性是神圣不变量）。
// 备份前【校验哈希链】——绝不用坏档覆盖好备份；轮转保留近 N 份；可挂异地命令（VEGA_BACKUP_CMD）。
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, dirname, join } from 'node:path';
import { verifyChain } from '../kernel/event-store.ts';
import { loadValidEvents } from './file-event-store.ts';

export interface BackupResult {
  ok: boolean;
  path?: string;
  events: number;
  reason?: string;
}

export interface BackupOptions {
  dir?: string; // 备份目录（默认 <lifeDir>/backups）
  keep?: number; // 保留份数（默认 48）
  cmd?: string; // 异地命令；执行时 env 带 VEGA_BACKUP_FILE=备份文件路径
}

export function backupNow(lifePath: string, opts: BackupOptions = {}): BackupResult {
  if (!existsSync(lifePath)) return { ok: false, events: 0, reason: 'no life log yet' };

  // 先校验：坏档不备份（否则会把损坏状态扩散到备份）。
  const events = loadValidEvents(lifePath);
  const chk = verifyChain(events);
  if (!chk.ok) return { ok: false, events: events.length, reason: `chain broken: ${chk.reason}` };

  const dir = opts.dir ?? join(dirname(lifePath), 'backups');
  mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = join(dir, `${basename(lifePath)}.${ts}.bak`);
  copyFileSync(lifePath, dest);

  // 轮转：只保留最近 keep 份。
  const keep = opts.keep ?? 48;
  const baks = readdirSync(dir).filter((f) => f.startsWith(`${basename(lifePath)}.`) && f.endsWith('.bak')).sort();
  for (const f of baks.slice(0, Math.max(0, baks.length - keep))) rmSync(join(dir, f), { force: true });

  // 异地（可选）：用户在 VEGA_BACKUP_CMD 里写 rclone/scp 等；备份文件路径经 env 传入。
  if (opts.cmd && opts.cmd.trim() !== '') {
    try {
      execFileSync('bash', ['-c', opts.cmd], { env: { ...process.env, VEGA_BACKUP_FILE: dest }, stdio: 'ignore' });
    } catch {
      /* 异地失败不影响本地备份已成功 */
    }
  }
  return { ok: true, path: dest, events: events.length };
}

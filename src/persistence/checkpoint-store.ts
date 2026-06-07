// 检查点落盘（永生工程地板）：把派生快照缓存到 <log>.snapshot.json，重启时少走全量重放。
// 它只是【缓存】——丢了/坏了/版本不符，调用方一律回退到从创世全量重建（日志才是 ground truth）。
// 原子写：先写 .tmp 再 rename，杜绝半截快照。
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { type Checkpoint } from '../kernel/reconstruct.ts';

const pathFor = (logPath: string): string => `${logPath}.snapshot.json`;

export function writeCheckpoint(logPath: string, cp: Checkpoint): void {
  const dest = pathFor(logPath);
  const tmp = `${dest}.tmp`;
  writeFileSync(tmp, JSON.stringify(cp));
  renameSync(tmp, dest); // 原子替换
}

// 读检查点；缺失/损坏一律返回 null（让调用方安全回退到全量重放）。
export function readCheckpoint(logPath: string): Checkpoint | null {
  const dest = pathFor(logPath);
  if (!existsSync(dest)) return null;
  try {
    const cp = JSON.parse(readFileSync(dest, 'utf8')) as Checkpoint;
    if (cp && cp.kind === 'vega-checkpoint' && typeof cp.uptoSeq === 'number') return cp;
    return null;
  } catch {
    return null;
  }
}

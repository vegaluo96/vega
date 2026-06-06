// 手动备份：npm run backup  （备份 VEGA_LIFE_PATH 指向的日志，校验哈希链，轮转，异地可选）
import { join } from 'node:path';
import { backupNow } from '../index.ts';

const path = process.env.VEGA_LIFE_PATH ?? join(process.cwd(), '.vega', 'life.jsonl');
const r = backupNow(path, {
  cmd: process.env.VEGA_BACKUP_CMD,
  keep: process.env.VEGA_BACKUP_KEEP ? Number(process.env.VEGA_BACKUP_KEEP) : undefined,
});
if (r.ok) {
  console.log(`✓ 备份完成：${r.path}（${r.events} 事件，哈希链校验通过）`);
} else {
  console.error(`✗ 备份未执行：${r.reason}`);
  process.exit(1);
}

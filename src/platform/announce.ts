// 公告存储（平台运营层）：托管者发往【人类用户 / 生命体 / 两者】的公告——轻量 JSON 文件（仿 settings）。
// 重要边界：这是平台留痕，【绝不进神圣事件日志】、不参与 reconstruct/重放。
// 生命体侧的"读到"另走神圣链路（admin 路由注入 WORLD_PERCEIVED 事件），这里只存"发过什么、谁发的"。
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type AnnounceAudience = 'humans' | 'lives' | 'both';

export interface Announcement {
  id: string;
  title: string; // ≤80（publish 钳制）
  text: string; // ≤500（publish 钳制）
  audience: AnnounceAudience;
  at: string; // ISO 发布时刻
  by: string; // 操作者邮箱（敏感操作留痕）
}

export interface AnnounceStore {
  list(limit?: number): Announcement[]; // 最新在前；不传 limit = 全部
  publish(entry: { title: string; text: string; audience: AnnounceAudience; by: string }): Announcement;
}

export const ANNOUNCE_TITLE_MAX = 80;
export const ANNOUNCE_TEXT_MAX = 500;

export function createAnnounceStore(path: string): AnnounceStore {
  let items: Announcement[] = []; // 落盘顺序：最旧在前、追加在尾
  if (existsSync(path)) {
    try {
      const loaded = JSON.parse(readFileSync(path, 'utf8')) as { items?: Announcement[] };
      if (loaded && Array.isArray(loaded.items)) items = loaded.items;
    } catch {
      /* 文件坏了就当空——公告是运营留痕，不影响她活着 */
    }
  }
  const persist = (): void => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ items }, null, 2));
  };
  return {
    list: (limit?: number) => {
      const out = items.slice().reverse(); // 最新在前
      return limit !== undefined && limit > 0 ? out.slice(0, limit) : out;
    },
    publish: (entry) => {
      const item: Announcement = {
        id: `an_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        title: entry.title.trim().slice(0, ANNOUNCE_TITLE_MAX), // 长度钳制（存储层兜底，路由也校验）
        text: entry.text.trim().slice(0, ANNOUNCE_TEXT_MAX),
        audience: entry.audience,
        at: new Date().toISOString(),
        by: entry.by,
      };
      items.push(item);
      persist();
      return item;
    },
  };
}

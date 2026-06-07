// 广场"发帖"互动层（§8.1 演进）：她的公开心声=帖子，用户可留【表情/心情】和【评论】。
// 这是用户产生的社交互动，存平台 DB（node:sqlite），【绝不进神圣生命日志】——
// 她不因每个点赞而改变状态（保持"活来自架构"，不被海量互动牵着走）。postId = `${lifeId}|${occurredAt}`。
import { DatabaseSync } from 'node:sqlite';

export interface FeedComment { id: number; userId: string; handle: string; text: string; at: string }
// 帖子"出处"（§8.1）：她这条心声是就着真实世界的哪条事说的。展示用，平台层，【绝不进神圣日志】。
export interface PostSource { title: string; source: string; url: string }

export interface FeedStore {
  toggleReaction(postId: string, userId: string, emoji: string): void;
  reactionsFor(postIds: string[], userId: string): Map<string, { counts: Record<string, number>; mine: string | null }>;
  addComment(postId: string, userId: string, handle: string, text: string): FeedComment;
  commentsFor(postId: string, limit: number): FeedComment[];
  commentCounts(postIds: string[]): Map<string, number>;
  setSource(postId: string, src: PostSource): void;
  sourcesFor(postIds: string[]): Map<string, PostSource>;
}

export function createFeedStore(path: string): FeedStore {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS post_reactions(post_id TEXT NOT NULL, user_id TEXT NOT NULL, emoji TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY(post_id,user_id));
    CREATE TABLE IF NOT EXISTS post_comments(id INTEGER PRIMARY KEY AUTOINCREMENT, post_id TEXT NOT NULL, user_id TEXT NOT NULL, handle TEXT NOT NULL, text TEXT NOT NULL, at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_comments_post ON post_comments(post_id);
    CREATE TABLE IF NOT EXISTS post_sources(post_id TEXT PRIMARY KEY, title TEXT NOT NULL, source TEXT NOT NULL, url TEXT NOT NULL, at TEXT NOT NULL);
  `);
  const now = (): string => new Date().toISOString();
  const ph = (n: number): string => Array.from({ length: n }, () => '?').join(',');

  return {
    toggleReaction(postId, userId, emoji) {
      const cur = db.prepare('SELECT emoji FROM post_reactions WHERE post_id=? AND user_id=?').get(postId, userId) as { emoji: string } | undefined;
      if (cur && cur.emoji === emoji) { db.prepare('DELETE FROM post_reactions WHERE post_id=? AND user_id=?').run(postId, userId); return; }
      db.prepare('INSERT OR REPLACE INTO post_reactions(post_id,user_id,emoji,at) VALUES(?,?,?,?)').run(postId, userId, emoji, now());
    },
    reactionsFor(postIds, userId) {
      const out = new Map<string, { counts: Record<string, number>; mine: string | null }>();
      for (const id of postIds) out.set(id, { counts: {}, mine: null });
      if (postIds.length === 0) return out;
      const rows = db.prepare(`SELECT post_id,emoji,COUNT(*) c FROM post_reactions WHERE post_id IN (${ph(postIds.length)}) GROUP BY post_id,emoji`).all(...postIds) as Array<{ post_id: string; emoji: string; c: number }>;
      for (const r of rows) { const e = out.get(r.post_id); if (e) e.counts[r.emoji] = Number(r.c); }
      const mine = db.prepare(`SELECT post_id,emoji FROM post_reactions WHERE user_id=? AND post_id IN (${ph(postIds.length)})`).all(userId, ...postIds) as Array<{ post_id: string; emoji: string }>;
      for (const r of mine) { const e = out.get(r.post_id); if (e) e.mine = r.emoji; }
      return out;
    },
    addComment(postId, userId, handle, text) {
      const at = now();
      const r = db.prepare('INSERT INTO post_comments(post_id,user_id,handle,text,at) VALUES(?,?,?,?,?)').run(postId, userId, handle, text, at);
      return { id: Number(r.lastInsertRowid), userId, handle, text, at };
    },
    commentsFor(postId, limit) {
      const rows = db.prepare('SELECT id,user_id,handle,text,at FROM post_comments WHERE post_id=? ORDER BY id DESC LIMIT ?').all(postId, limit) as Array<{ id: number; user_id: string; handle: string; text: string; at: string }>;
      return rows.map((r) => ({ id: Number(r.id), userId: r.user_id, handle: r.handle, text: r.text, at: r.at })).reverse();
    },
    commentCounts(postIds) {
      const out = new Map<string, number>();
      if (postIds.length === 0) return out;
      const rows = db.prepare(`SELECT post_id,COUNT(*) c FROM post_comments WHERE post_id IN (${ph(postIds.length)}) GROUP BY post_id`).all(...postIds) as Array<{ post_id: string; c: number }>;
      for (const r of rows) out.set(r.post_id, Number(r.c));
      return out;
    },
    setSource(postId, src) {
      db.prepare('INSERT OR REPLACE INTO post_sources(post_id,title,source,url,at) VALUES(?,?,?,?,?)').run(postId, src.title, src.source, src.url, now());
    },
    sourcesFor(postIds) {
      const out = new Map<string, PostSource>();
      if (postIds.length === 0) return out;
      const rows = db.prepare(`SELECT post_id,title,source,url FROM post_sources WHERE post_id IN (${ph(postIds.length)})`).all(...postIds) as Array<{ post_id: string; title: string; source: string; url: string }>;
      for (const r of rows) out.set(r.post_id, { title: r.title, source: r.source, url: r.url });
      return out;
    },
  };
}

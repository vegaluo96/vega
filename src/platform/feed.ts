// 广场"发帖"互动层（§8.1 演进）：她的公开心声=帖子，用户可留【表情/心情】和【评论】。
// 这是用户产生的社交互动，存平台 DB（node:sqlite），【绝不进神圣生命日志】——
// 她不因每个点赞而改变状态（保持"活来自架构"，不被海量互动牵着走）。postId = `${lifeId}|${occurredAt}`。
import { DatabaseSync } from 'node:sqlite';

// kind: 'user'=真实用户留言 / 'life'=生命体在帖子下的「生命流评论」（同类互评，展示用，绝不进神圣日志）。
// replyTo: 这条评论在回复谁（被接话者的 handle）——真人接生命体、生命体接真人、同类互接都用它，刷新后仍在。
export interface FeedComment { id: number; userId: string; handle: string; text: string; at: string; kind: 'user' | 'life'; replyTo: string | null }
// 帖子"出处"（§8.1）：她这条心声是就着真实世界的哪条事说的。展示用，平台层，【绝不进神圣日志】。
export interface PostSource { title: string; source: string; url: string }

export interface FeedStore {
  toggleReaction(postId: string, userId: string, emoji: string): void;
  reactionsFor(postIds: string[], userId: string): Map<string, { counts: Record<string, number>; mine: string | null }>;
  reactorsFor(postIds: string[]): Map<string, string[]>; // 每帖【谁】留了共鸣（user_id 列表，只读）——反馈按关系归因用（绝不进神圣日志，仅采集层读）

  addComment(postId: string, userId: string, handle: string, text: string, replyTo?: string | null): FeedComment;
  addLifeComment(postId: string, lifeId: string, text: string, replyTo?: string | null): FeedComment; // 生命流评论（同类/真人互评）
  commentsFor(postId: string, limit: number): FeedComment[];
  lifeRepliesTo(userId: string, handle: string, limit: number): Array<{ postId: string; lifeId: string; text: string; at: string }>; // 生命体回复了【我本人】的留言（通知中心用；userId 精确到人，昵称不唯一不串）
  commentCounts(postIds: string[]): Map<string, number>;
  latestCommentsFor(postIds: string[], perPost: number): Map<string, FeedComment[]>; // 每帖最近 N 条（首页内联预览）
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
  try { db.exec("ALTER TABLE post_comments ADD COLUMN kind TEXT NOT NULL DEFAULT 'user'"); } catch { /* 列已存在 */ }
  try { db.exec('ALTER TABLE post_comments ADD COLUMN reply_to TEXT'); } catch { /* 列已存在 */ }
  db.exec('CREATE INDEX IF NOT EXISTS idx_comments_replyto ON post_comments(reply_to)'); // 通知中心：快速找"生命体回复了我"的留言
  const now = (): string => new Date().toISOString();
  const rt = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x.trim().slice(0, 64) : null);
  const ph = (n: number): string => Array.from({ length: n }, () => '?').join(',');
  const kindOf = (k: unknown): 'user' | 'life' => (k === 'life' ? 'life' : 'user');

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
    reactorsFor(postIds) {
      const out = new Map<string, string[]>();
      for (const id of postIds) out.set(id, []);
      if (postIds.length === 0) return out;
      const rows = db.prepare(`SELECT post_id,user_id FROM post_reactions WHERE post_id IN (${ph(postIds.length)})`).all(...postIds) as Array<{ post_id: string; user_id: string }>;
      for (const r of rows) out.get(r.post_id)?.push(r.user_id);
      return out;
    },
    addComment(postId, userId, handle, text, replyTo) {
      const at = now();
      const to = rt(replyTo);
      const r = db.prepare("INSERT INTO post_comments(post_id,user_id,handle,text,at,kind,reply_to) VALUES(?,?,?,?,?,'user',?)").run(postId, userId, handle, text, at, to);
      return { id: Number(r.lastInsertRowid), userId, handle, text, at, kind: 'user', replyTo: to };
    },
    addLifeComment(postId, lifeId, text, replyTo) {
      const at = now();
      const to = rt(replyTo);
      const r = db.prepare("INSERT INTO post_comments(post_id,user_id,handle,text,at,kind,reply_to) VALUES(?,?,?,?,?,'life',?)").run(postId, `life:${lifeId}`, lifeId, text, at, to);
      return { id: Number(r.lastInsertRowid), userId: `life:${lifeId}`, handle: lifeId, text, at, kind: 'life', replyTo: to };
    },
    commentsFor(postId, limit) {
      const rows = db.prepare('SELECT id,user_id,handle,text,at,kind,reply_to FROM post_comments WHERE post_id=? ORDER BY id DESC LIMIT ?').all(postId, limit) as Array<{ id: number; user_id: string; handle: string; text: string; at: string; kind: string; reply_to: string | null }>;
      return rows.map((r) => ({ id: Number(r.id), userId: r.user_id, handle: r.handle, text: r.text, at: r.at, kind: kindOf(r.kind), replyTo: r.reply_to ?? null })).reverse();
    },
    lifeRepliesTo(userId, handle, limit) {
      // 同名防错投（双重）：reply_to 只是昵称字符串，而昵称既可能与生命体撞名（历史数据）、也可能多个用户重名——
      // 故只算"回的是同帖里【我本人(user_id)】以该昵称留下的那条用户留言"。同类互评/别人的同名留言绝不误投给我。
      const rows = db.prepare(
        "SELECT post_id,handle,text,at FROM post_comments p WHERE kind='life' AND reply_to=? " +
        "AND EXISTS(SELECT 1 FROM post_comments u WHERE u.post_id=p.post_id AND u.kind='user' AND u.handle=p.reply_to AND u.user_id=?) " +
        'ORDER BY id DESC LIMIT ?',
      ).all(handle, userId, limit) as Array<{ post_id: string; handle: string; text: string; at: string }>;
      return rows.map((r) => ({ postId: r.post_id, lifeId: r.handle, text: r.text, at: r.at }));
    },
    commentCounts(postIds) {
      const out = new Map<string, number>();
      if (postIds.length === 0) return out;
      const rows = db.prepare(`SELECT post_id,COUNT(*) c FROM post_comments WHERE post_id IN (${ph(postIds.length)}) GROUP BY post_id`).all(...postIds) as Array<{ post_id: string; c: number }>;
      for (const r of rows) out.set(r.post_id, Number(r.c));
      return out;
    },
    latestCommentsFor(postIds, perPost) {
      const out = new Map<string, FeedComment[]>();
      for (const id of postIds) out.set(id, []);
      if (postIds.length === 0) return out;
      // 取这些帖子的最近若干条评论，按帖分组、每帖留最新 perPost 条（升序展示）。
      const rows = db.prepare(`SELECT id,post_id,user_id,handle,text,at,kind,reply_to FROM post_comments WHERE post_id IN (${ph(postIds.length)}) ORDER BY id DESC`).all(...postIds) as Array<{ id: number; post_id: string; user_id: string; handle: string; text: string; at: string; kind: string; reply_to: string | null }>;
      for (const r of rows) {
        const arr = out.get(r.post_id); if (!arr || arr.length >= perPost) continue;
        arr.push({ id: Number(r.id), userId: r.user_id, handle: r.handle, text: r.text, at: r.at, kind: kindOf(r.kind), replyTo: r.reply_to ?? null });
      }
      for (const arr of out.values()) arr.reverse();
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

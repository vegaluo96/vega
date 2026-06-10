// 平台身份/账号层（node:sqlite，零外部依赖）。可变基础设施数据，与【神圣生命日志物理分离】。
// 邮箱注册 + 会话鉴权(scrypt) + 角色(user/steward/owner) + 额度/充值。
// 契约（§平台 v1）：日志只见 relationship_id = u_<userId>，PII（email/openid）永不进神圣日志。
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export type Role = 'user' | 'steward' | 'owner';
export type AccountStatus = 'active' | 'blocked';

export interface Account {
  id: string;
  email: string;
  handle: string;
  role: Role;
  status: AccountStatus;
  emailVerified: boolean;
  createdAt: string;
  lastActiveAt: string;
}
export type AuthResult = { ok: true; account: Account } | { ok: false; error: string };
export type LoginResult = { ok: true; account: Account; token: string } | { ok: false; error: string };
export interface RechargeRequest { id: number; userId: string; amount: number; status: 'pending' | 'approved' | 'rejected'; requestedAt: string }
// 对话标记（后台监督）：关注=黄 / 已拦截=红 + 原因。纯平台层元数据，绝不进神圣日志、绝不影响她的状态。
export interface ConvoFlag { lifeId: string; rel: string; flag: 'watch' | 'blocked'; reason: string; by: string; at: string }
// 安全拦截记录：用户消息命中安全词 → 接管话术回应。保留 180 天（插入时顺手清理过期）。
export interface SafetyHit { id: number; at: string; lifeId: string; rel: string; word: string; action: string; excerpt: string }

export interface AccountStoreOptions {
  owners?: string[]; // 这些邮箱注册即 owner（env 白名单）
  stewards?: string[]; // 这些邮箱注册即 steward
  starterCredits?: number; // 新用户起始额度（先体验）
  sessionTtlMs?: number;
}

const now = (): string => new Date().toISOString();
const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');
const genId = (): string => randomBytes(8).toString('hex');
const genToken = (): string => randomBytes(32).toString('hex');
const norm = (email: string): string => email.trim().toLowerCase();

function hashPassword(password: string): { salt: string; hash: string } {
  const salt = randomBytes(16).toString('hex');
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
}
function verifyPassword(password: string, salt: string, hash: string): boolean {
  const computed = scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, 'hex');
  return computed.length === stored.length && timingSafeEqual(computed, stored);
}
// 防用户枚举：账号不存在时也走一遍同样开销的哈希。
const DUMMY = hashPassword('vega-dummy-cost');

interface UserRow {
  id: string; email: string; email_verified: number; pass_salt: string; pass_hash: string;
  handle: string; role: string; status: string; created_at: string; last_active_at: string;
}

export interface AccountStore {
  register(email: string, password: string, handle: string, starterOverride?: number): AuthResult;
  login(email: string, password: string): LoginResult;
  authenticate(token: string): Account | null;
  logout(token: string): void;
  getAccount(userId: string): Account | null;
  handleTaken(handle: string): boolean; // 有没有用户已用这个昵称（大小写不敏感）——接生生命体前防撞名（用户↔生命体不可同名）
  relIdFor(userId: string): string;
  balance(userId: string): number;
  lastLedgerAt(userId: string): string | null; // 最近一笔额度流水的时间——给"心意用尽"通知当稳定时间戳（用 now() 会让红点永远点不灭）
  debit(userId: string, amount: number, reason: string, ref?: string): boolean;
  credit(userId: string, amount: number, reason: string, ref?: string): void;
  requestRecharge(userId: string, amount: number): number;
  pendingRecharges(): RechargeRequest[];
  pendingRechargesFor(userId: string): Array<{ id: number; amount: number; requestedAt: string }>;
  recentRechargeResults(userId: string, limit: number): Array<{ id: number; amount: number; status: 'approved' | 'rejected'; decidedAt: string }>;
  decideRecharge(id: number, approve: boolean, by: string): boolean;
  issueEmailVerification(userId: string): string;
  verifyEmail(token: string): boolean;
  setStatus(userId: string, status: AccountStatus): void;
  listUsers(): Array<Account & { balance: number }>; // 管理后台：账号元数据 + 余额（无口令/无私聊）
  pendingRechargeCount(): number;
  // 微信绑定（§12）：二维码一次性令牌 → openid↔user↔life。openid 等 PII 只在账号层，绝不进神圣日志。
  createBindToken(userId: string, lifeId: string): string;
  bindWechat(token: string, openid: string): { userId: string; lifeId: string } | null;
  resolveWechat(openid: string): { userId: string; lifeId: string } | null;
  // 把一个微信身份直接绑到【已存在的网页账号】——扫码本人/连接码打通用，从此微信与网页共享同一段关系与记忆。
  linkWechatOpenid(openid: string, userId: string, lifeId: string): void;
  unbindWechat(openid: string): void;
  // 账号级绑定：微信只绑账号一次；"在微信里和哪条命聊"在网页随时切换，不用重绑。
  setWechatLife(userId: string, lifeId: string): void;
  wechatBindingFor(userId: string): { lifeId: string } | null;
  // 零绑定：微信用户首次发消息即自动建立身份（个人号没有扫码上报 openid 的能力，发消息才认得出人）。
  ensureWechatUser(openid: string, lifeId: string): { userId: string; lifeId: string };
  // 微信 iLink 通道（ZSKY 自己当机器人）：扫码登录后存 bot_token，后台收发消息用。
  saveChannel(userId: string, ilinkUserId: string, botToken: string, baseurl: string, lifeId: string): void;
  channelFor(userId: string): { ilinkUserId: string; botToken: string; baseurl: string; buf: string; lifeId: string } | null;
  listChannels(): Array<{ userId: string; ilinkUserId: string; botToken: string; baseurl: string; buf: string; lifeId: string }>;
  updateChannelBuf(userId: string, buf: string): void;
  setChannelLife(userId: string, lifeId: string): void;
  removeChannel(userId: string): void;
  // Web Push 订阅（PWA）
  addPushSub(userId: string, endpoint: string, p256dh: string, auth: string): void;
  getPushSubs(userId: string): Array<{ endpoint: string; keys: { p256dh: string; auth: string } }>;
  removePushSub(endpoint: string): void;
  // 关注（平台层·纯用户侧偏好）：用户收藏喜欢的生命体。绝不进神圣日志、绝不影响她的派生状态/行为
  // （守"她在过日子、不为流量表演"——粉丝数只对用户透明展示，永不回喂她的引擎）。
  follow(userId: string, lifeId: string): void;
  unfollow(userId: string, lifeId: string): void;
  isFollowing(userId: string, lifeId: string): boolean;
  followsOf(userId: string): string[]; // 我关注的生命体 id（最近关注在前）
  followerCount(lifeId: string): number; // 关注这条命的用户数（仅展示）
  // 审计留痕（服务端持久化）：敏感操作（查看对话全文/封禁/调余额/全站配置变更）的真相源，后台「审计日志」读它。
  addAudit(who: string, action: string): void;
  listAudit(limit: number): Array<{ id: number; at: string; who: string; action: string }>;
  // 流水账本查询（credit_ledger 一直在落库，这里补查询面）：全站近况 / 按用户过滤 / 近 N 日按命消耗聚合。
  listLedger(limit: number, userId?: string): Array<{ id: number; userId: string; handle: string; delta: number; reason: string; ref: string | null; at: string }>;
  spendByLife(days: number): Array<{ life: string; spent: number; replies: number }>; // 心意流向：reason∈model/refund 按 ref(=lifeId) 聚合
  // 对话标记（后台监督）：手动标关注/拦截；安全词命中自动标红。
  setConvoFlag(lifeId: string, rel: string, flag: 'watch' | 'blocked', reason: string, by: string): void;
  clearConvoFlag(lifeId: string, rel: string): void;
  listConvoFlags(): ConvoFlag[];
  convoFlagsFor(lifeId: string): ConvoFlag[];
  // 安全拦截记录（命中词→接管话术）：保留 180 天。at 可注入（测试期限清理用），缺省取当前时刻。
  addSafetyHit(lifeId: string, rel: string, word: string, action: string, excerpt: string, at?: string): void;
  listSafetyHits(limit: number): SafetyHit[];
  close(): void;
}

export function createAccountStore(path = ':memory:', opts: AccountStoreOptions = {}): AccountStore {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users(
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, email_verified INTEGER NOT NULL DEFAULT 0,
      pass_salt TEXT NOT NULL, pass_hash TEXT NOT NULL, handle TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user', status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL, last_active_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS credits(user_id TEXT PRIMARY KEY, balance INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS credit_ledger(
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, delta INTEGER NOT NULL, reason TEXT NOT NULL, ref TEXT, at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS recharge_requests(
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', requested_at TEXT NOT NULL, decided_by TEXT, decided_at TEXT);
    CREATE TABLE IF NOT EXISTS email_verifications(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS bind_tokens(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, life_id TEXT NOT NULL, expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS wechat_bindings(openid TEXT PRIMARY KEY, user_id TEXT NOT NULL, life_id TEXT NOT NULL, bound_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS wechat_channels(user_id TEXT PRIMARY KEY, ilink_user_id TEXT, bot_token TEXT NOT NULL, baseurl TEXT, updates_buf TEXT NOT NULL DEFAULT '', connected_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS push_subscriptions(endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS follows(user_id TEXT NOT NULL, life_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(user_id, life_id));
    CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT, who TEXT NOT NULL, action TEXT NOT NULL, at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS convo_flags(life_id TEXT NOT NULL, rel TEXT NOT NULL, flag TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', by TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY(life_id, rel));
    CREATE TABLE IF NOT EXISTS safety_hits(id INTEGER PRIMARY KEY AUTOINCREMENT, life_id TEXT NOT NULL, rel TEXT NOT NULL, word TEXT NOT NULL, action TEXT NOT NULL, excerpt TEXT NOT NULL DEFAULT '', at TEXT NOT NULL);
  `);
  // 加法迁移：微信通道的"当前在微信里和哪条命聊"（旧库已建表则补列）。
  try { db.exec('ALTER TABLE wechat_channels ADD COLUMN active_life_id TEXT'); } catch { /* 列已存在 */ }

  const owners = new Set((opts.owners ?? []).map(norm));
  const stewards = new Set((opts.stewards ?? []).map(norm));
  const starter = opts.starterCredits ?? 100;
  const ttl = opts.sessionTtlMs ?? 30 * 86_400_000;
  const roleFor = (email: string): Role => (owners.has(norm(email)) ? 'owner' : stewards.has(norm(email)) ? 'steward' : 'user');
  // 白名单(VEGA_OWNERS/STEWARDS)是角色的真相源：每次鉴权按它校正存库角色。
  // 这样"先注册、后加白名单"也能在下次登录自动升为 owner/steward（移出白名单则降回 user）。
  const syncRole = (u: UserRow): UserRow => {
    const want = roleFor(u.email);
    if (want !== u.role) {
      db.prepare('UPDATE users SET role=? WHERE id=?').run(want, u.id);
      return { ...u, role: want };
    }
    return u;
  };

  const userById = (id: string): UserRow | undefined => db.prepare('SELECT * FROM users WHERE id=?').get(id) as UserRow | undefined;
  const userByEmail = (email: string): UserRow | undefined => db.prepare('SELECT * FROM users WHERE email=?').get(norm(email)) as UserRow | undefined;
  const toAccount = (r: UserRow): Account => ({
    id: r.id, email: r.email, handle: r.handle, role: r.role as Role, status: r.status as AccountStatus,
    emailVerified: r.email_verified === 1, createdAt: r.created_at, lastActiveAt: r.last_active_at,
  });

  const balance = (userId: string): number => {
    const r = db.prepare('SELECT balance FROM credits WHERE user_id=?').get(userId) as { balance: number } | undefined;
    return r ? Number(r.balance) : 0;
  };
  const ledger = (userId: string, delta: number, reason: string, ref?: string): void => {
    db.prepare('INSERT INTO credit_ledger(user_id,delta,reason,ref,at) VALUES(?,?,?,?,?)').run(userId, delta, reason, ref ?? null, now());
  };
  const credit = (userId: string, amount: number, reason: string, ref?: string): void => {
    db.prepare('INSERT INTO credits(user_id,balance,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET balance=balance+excluded.balance, updated_at=excluded.updated_at')
      .run(userId, amount, now());
    ledger(userId, amount, reason, ref);
  };
  const debit = (userId: string, amount: number, reason: string, ref?: string): boolean => {
    if (balance(userId) < amount) return false; // 不足 → 调用方回退模板嘴（不阻断她）
    db.prepare('UPDATE credits SET balance=balance-?, updated_at=? WHERE user_id=?').run(amount, now(), userId);
    ledger(userId, -amount, reason, ref);
    return true;
  };

  return {
    register(email, password, handle, starterOverride) {
      const e = norm(email);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return { ok: false, error: '邮箱格式不对' };
      if (password.length < 8) return { ok: false, error: '密码至少 8 位' };
      if (userByEmail(e)) return { ok: false, error: '该邮箱已注册' };
      const id = genId();
      const { salt, hash } = hashPassword(password);
      const t = now();
      const safeHandle = (handle.trim() || e.split('@')[0]).slice(0, 40); // 昵称上限 40 字符——防超长写库 / 展示注入面
      db.prepare('INSERT INTO users(id,email,email_verified,pass_salt,pass_hash,handle,role,status,created_at,last_active_at) VALUES(?,?,0,?,?,?,?,?,?,?)')
        .run(id, e, salt, hash, safeHandle, roleFor(e), 'active', t, t);
      const grant = (typeof starterOverride === 'number' && Number.isFinite(starterOverride) && starterOverride >= 0) ? Math.round(starterOverride) : starter;
      if (grant > 0) credit(id, grant, 'starter_grant');
      return { ok: true, account: toAccount(userById(id) as UserRow) };
    },
    login(email, password) {
      const u = userByEmail(email);
      if (!u) {
        verifyPassword(password, DUMMY.salt, DUMMY.hash); // 抹平时序，防枚举
        return { ok: false, error: '邮箱或密码错误' };
      }
      if (!verifyPassword(password, u.pass_salt, u.pass_hash)) return { ok: false, error: '邮箱或密码错误' };
      if (u.status === 'blocked') return { ok: false, error: '账号已被封禁' };
      syncRole(u); // 按白名单校正角色（处理"先注册后加 VEGA_OWNERS"）
      const token = genToken();
      const t = now();
      db.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)')
        .run(sha256(token), u.id, t, new Date(Date.now() + ttl).toISOString());
      db.prepare('UPDATE users SET last_active_at=? WHERE id=?').run(t, u.id);
      return { ok: true, token, account: toAccount(userById(u.id) as UserRow) };
    },
    authenticate(token) {
      if (!token) return null;
      const s = db.prepare('SELECT user_id,expires_at FROM sessions WHERE token_hash=?').get(sha256(token)) as { user_id: string; expires_at: string } | undefined;
      if (!s) return null;
      if (s.expires_at < now()) {
        db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha256(token));
        return null;
      }
      let u = userById(s.user_id);
      if (!u || u.status === 'blocked') return null;
      u = syncRole(u);
      db.prepare('UPDATE users SET last_active_at=? WHERE id=?').run(now(), u.id);
      return toAccount(u);
    },
    logout(token) {
      db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha256(token));
    },
    getAccount(userId) {
      const u = userById(userId);
      return u ? toAccount(u) : null;
    },
    handleTaken(handle) {
      const h = handle.trim().toLowerCase();
      if (!h) return false;
      return Boolean(db.prepare('SELECT 1 FROM users WHERE lower(handle)=? LIMIT 1').get(h));
    },
    relIdFor: (userId) => `u_${userId}`,
    balance,
    lastLedgerAt(userId) {
      const r = db.prepare('SELECT at FROM credit_ledger WHERE user_id=? ORDER BY id DESC LIMIT 1').get(userId) as { at: string } | undefined;
      return r ? r.at : null;
    },
    debit,
    credit,
    requestRecharge(userId, amount) {
      const r = db.prepare('INSERT INTO recharge_requests(user_id,amount,status,requested_at) VALUES(?,?,?,?)').run(userId, amount, 'pending', now());
      return Number(r.lastInsertRowid);
    },
    pendingRecharges() {
      const rows = db.prepare("SELECT id,user_id,amount,status,requested_at FROM recharge_requests WHERE status='pending' ORDER BY id").all() as Array<{ id: number; user_id: string; amount: number; status: string; requested_at: string }>;
      return rows.map((r) => ({ id: Number(r.id), userId: r.user_id, amount: Number(r.amount), status: r.status as RechargeRequest['status'], requestedAt: r.requested_at }));
    },
    pendingRechargesFor(userId) {
      const rows = db.prepare("SELECT id,amount,requested_at FROM recharge_requests WHERE user_id=? AND status='pending' ORDER BY id DESC").all(userId) as Array<{ id: number; amount: number; requested_at: string }>;
      return rows.map((r) => ({ id: Number(r.id), amount: Number(r.amount), requestedAt: r.requested_at }));
    },
    recentRechargeResults(userId, limit) {
      const rows = db.prepare("SELECT id,amount,status,decided_at FROM recharge_requests WHERE user_id=? AND status!='pending' AND decided_at IS NOT NULL ORDER BY decided_at DESC LIMIT ?").all(userId, limit) as Array<{ id: number; amount: number; status: string; decided_at: string }>;
      return rows.map((r) => ({ id: Number(r.id), amount: Number(r.amount), status: r.status as 'approved' | 'rejected', decidedAt: r.decided_at }));
    },
    decideRecharge(id, approve, by) {
      const r = db.prepare("SELECT user_id,amount,status FROM recharge_requests WHERE id=?").get(id) as { user_id: string; amount: number; status: string } | undefined;
      if (!r || r.status !== 'pending') return false;
      db.prepare('UPDATE recharge_requests SET status=?, decided_by=?, decided_at=? WHERE id=?').run(approve ? 'approved' : 'rejected', by, now(), id);
      if (approve) credit(r.user_id, Number(r.amount), 'recharge_approved', `req_${id}`);
      return true;
    },
    issueEmailVerification(userId) {
      const token = genToken();
      db.prepare('INSERT INTO email_verifications(token_hash,user_id,expires_at) VALUES(?,?,?)')
        .run(sha256(token), userId, new Date(Date.now() + 86_400_000).toISOString());
      return token; // 交给发信层；本层不发邮件
    },
    verifyEmail(token) {
      const row = db.prepare('SELECT user_id,expires_at FROM email_verifications WHERE token_hash=?').get(sha256(token)) as { user_id: string; expires_at: string } | undefined;
      if (!row || row.expires_at < now()) return false;
      db.prepare('UPDATE users SET email_verified=1 WHERE id=?').run(row.user_id);
      db.prepare('DELETE FROM email_verifications WHERE token_hash=?').run(sha256(token));
      return true;
    },
    setStatus(userId, status) {
      db.prepare('UPDATE users SET status=? WHERE id=?').run(status, userId);
      if (status === 'blocked') db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId); // 封禁即踢下线
    },
    listUsers() {
      const rows = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as unknown as UserRow[];
      return rows.map((r) => ({ ...toAccount(r), balance: balance(r.id) }));
    },
    pendingRechargeCount() {
      const r = db.prepare("SELECT COUNT(*) AS n FROM recharge_requests WHERE status='pending'").get() as { n: number };
      return Number(r.n);
    },
    createBindToken(userId, lifeId) {
      const token = genToken();
      db.prepare('INSERT INTO bind_tokens(token_hash,user_id,life_id,expires_at) VALUES(?,?,?,?)')
        .run(sha256(token), userId, lifeId, new Date(Date.now() + 600_000).toISOString()); // 10 分钟有效
      return token;
    },
    bindWechat(token, openid) {
      const row = db.prepare('SELECT user_id,life_id,expires_at FROM bind_tokens WHERE token_hash=?').get(sha256(token)) as { user_id: string; life_id: string; expires_at: string } | undefined;
      if (!row || row.expires_at < now()) return null;
      db.prepare('DELETE FROM bind_tokens WHERE token_hash=?').run(sha256(token)); // 一次性
      db.prepare('INSERT INTO wechat_bindings(openid,user_id,life_id,bound_at) VALUES(?,?,?,?) ON CONFLICT(openid) DO UPDATE SET user_id=excluded.user_id, life_id=excluded.life_id, bound_at=excluded.bound_at')
        .run(openid, row.user_id, row.life_id, now());
      return { userId: row.user_id, lifeId: row.life_id };
    },
    resolveWechat(openid) {
      const row = db.prepare('SELECT user_id,life_id FROM wechat_bindings WHERE openid=?').get(openid) as { user_id: string; life_id: string } | undefined;
      return row ? { userId: row.user_id, lifeId: row.life_id } : null;
    },
    linkWechatOpenid(openid, userId, lifeId) {
      db.prepare('INSERT INTO wechat_bindings(openid,user_id,life_id,bound_at) VALUES(?,?,?,?) ON CONFLICT(openid) DO UPDATE SET user_id=excluded.user_id, life_id=excluded.life_id, bound_at=excluded.bound_at')
        .run(openid, userId, lifeId, now());
    },
    unbindWechat(openid) {
      db.prepare('DELETE FROM wechat_bindings WHERE openid=?').run(openid);
    },
    setWechatLife(userId, lifeId) {
      db.prepare('UPDATE wechat_bindings SET life_id=? WHERE user_id=?').run(lifeId, userId);
    },
    wechatBindingFor(userId) {
      const r = db.prepare('SELECT life_id FROM wechat_bindings WHERE user_id=?').get(userId) as { life_id: string } | undefined;
      return r ? { lifeId: r.life_id } : null;
    },
    ensureWechatUser(openid, lifeId) {
      const ex = db.prepare('SELECT user_id,life_id FROM wechat_bindings WHERE openid=?').get(openid) as { user_id: string; life_id: string } | undefined;
      if (ex) return { userId: ex.user_id, lifeId: ex.life_id };
      const id = genId();
      const t = now();
      const synthEmail = `wx_${sha256(openid).slice(0, 18)}@wechat.local`; // 合成唯一邮箱；网页登录不上（微信原生号，日后可关联）
      const { salt, hash } = hashPassword(genToken());
      db.prepare('INSERT INTO users(id,email,email_verified,pass_salt,pass_hash,handle,role,status,created_at,last_active_at) VALUES(?,?,0,?,?,?,?,?,?,?)')
        .run(id, synthEmail, salt, hash, '微信朋友', 'user', 'active', t, t);
      if (starter > 0) credit(id, starter, 'starter_grant');
      db.prepare('INSERT INTO wechat_bindings(openid,user_id,life_id,bound_at) VALUES(?,?,?,?)').run(openid, id, lifeId, t);
      return { userId: id, lifeId };
    },
    saveChannel(userId, ilinkUserId, botToken, baseurl, lifeId) {
      db.prepare('INSERT INTO wechat_channels(user_id,ilink_user_id,bot_token,baseurl,updates_buf,active_life_id,connected_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET ilink_user_id=excluded.ilink_user_id, bot_token=excluded.bot_token, baseurl=excluded.baseurl, active_life_id=COALESCE(wechat_channels.active_life_id, excluded.active_life_id), connected_at=excluded.connected_at')
        .run(userId, ilinkUserId, botToken, baseurl, '', lifeId, now());
    },
    channelFor(userId) {
      const r = db.prepare('SELECT ilink_user_id,bot_token,baseurl,updates_buf,active_life_id FROM wechat_channels WHERE user_id=?').get(userId) as { ilink_user_id: string; bot_token: string; baseurl: string; updates_buf: string; active_life_id: string | null } | undefined;
      return r ? { ilinkUserId: r.ilink_user_id, botToken: r.bot_token, baseurl: r.baseurl, buf: r.updates_buf, lifeId: r.active_life_id ?? '' } : null;
    },
    listChannels() {
      const rows = db.prepare('SELECT user_id,ilink_user_id,bot_token,baseurl,updates_buf,active_life_id FROM wechat_channels').all() as Array<{ user_id: string; ilink_user_id: string; bot_token: string; baseurl: string; updates_buf: string; active_life_id: string | null }>;
      return rows.map((r) => ({ userId: r.user_id, ilinkUserId: r.ilink_user_id, botToken: r.bot_token, baseurl: r.baseurl, buf: r.updates_buf, lifeId: r.active_life_id ?? '' }));
    },
    updateChannelBuf(userId, buf) {
      db.prepare('UPDATE wechat_channels SET updates_buf=? WHERE user_id=?').run(buf, userId);
    },
    setChannelLife(userId, lifeId) {
      db.prepare('UPDATE wechat_channels SET active_life_id=? WHERE user_id=?').run(lifeId, userId);
    },
    removeChannel(userId) {
      db.prepare('DELETE FROM wechat_channels WHERE user_id=?').run(userId);
    },
    addPushSub(userId, endpoint, p256dh, auth) {
      db.prepare('INSERT INTO push_subscriptions(endpoint,user_id,p256dh,auth,created_at) VALUES(?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth')
        .run(endpoint, userId, p256dh, auth, now());
    },
    getPushSubs(userId) {
      const rows = db.prepare('SELECT endpoint,p256dh,auth FROM push_subscriptions WHERE user_id=?').all(userId) as Array<{ endpoint: string; p256dh: string; auth: string }>;
      return rows.map((r) => ({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }));
    },
    removePushSub(endpoint) {
      db.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').run(endpoint);
    },
    follow(userId, lifeId) {
      db.prepare('INSERT OR IGNORE INTO follows(user_id,life_id,created_at) VALUES(?,?,?)').run(userId, lifeId, now());
    },
    unfollow(userId, lifeId) {
      db.prepare('DELETE FROM follows WHERE user_id=? AND life_id=?').run(userId, lifeId);
    },
    isFollowing(userId, lifeId) {
      return !!db.prepare('SELECT 1 FROM follows WHERE user_id=? AND life_id=?').get(userId, lifeId);
    },
    followsOf(userId) {
      const rows = db.prepare('SELECT life_id FROM follows WHERE user_id=? ORDER BY created_at DESC').all(userId) as Array<{ life_id: string }>;
      return rows.map((r) => r.life_id);
    },
    followerCount(lifeId) {
      const r = db.prepare('SELECT COUNT(*) AS n FROM follows WHERE life_id=?').get(lifeId) as { n: number };
      return Number(r.n);
    },
    addAudit(who, action) {
      db.prepare('INSERT INTO audit_log(who,action,at) VALUES(?,?,?)').run(who, action, now());
    },
    listAudit(limit) {
      const rows = db.prepare('SELECT id,who,action,at FROM audit_log ORDER BY id DESC LIMIT ?').all(limit) as Array<{ id: number; who: string; action: string; at: string }>;
      return rows.map((r) => ({ id: Number(r.id), at: r.at, who: r.who, action: r.action }));
    },
    listLedger(limit, userId) {
      const sql = 'SELECT l.id,l.user_id,u.handle,l.delta,l.reason,l.ref,l.at FROM credit_ledger l LEFT JOIN users u ON u.id=l.user_id'
        + (userId ? ' WHERE l.user_id=?' : '') + ' ORDER BY l.id DESC LIMIT ?';
      const rows = (userId ? db.prepare(sql).all(userId, limit) : db.prepare(sql).all(limit)) as Array<{ id: number; user_id: string; handle: string | null; delta: number; reason: string; ref: string | null; at: string }>;
      return rows.map((r) => ({ id: Number(r.id), userId: r.user_id, handle: r.handle ?? r.user_id, delta: Number(r.delta), reason: r.reason, ref: r.ref, at: r.at }));
    },
    spendByLife(days) {
      // model 扣费为负 delta、refund 为正 delta（同 ref=lifeId）→ SUM(-delta) 即净消耗；replies 只数实扣的回合。
      const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
      const rows = db.prepare("SELECT ref AS life, SUM(-delta) AS spent, SUM(CASE WHEN delta<0 THEN 1 ELSE 0 END) AS replies FROM credit_ledger WHERE reason IN ('model','refund') AND ref IS NOT NULL AND at>=? GROUP BY ref ORDER BY spent DESC")
        .all(cutoff) as Array<{ life: string; spent: number; replies: number }>;
      return rows.map((r) => ({ life: r.life, spent: Number(r.spent), replies: Number(r.replies) }));
    },
    setConvoFlag(lifeId, rel, flag, reason, by) {
      db.prepare('INSERT INTO convo_flags(life_id,rel,flag,reason,by,at) VALUES(?,?,?,?,?,?) ON CONFLICT(life_id,rel) DO UPDATE SET flag=excluded.flag, reason=excluded.reason, by=excluded.by, at=excluded.at')
        .run(lifeId, rel, flag, reason, by, now());
    },
    clearConvoFlag(lifeId, rel) {
      db.prepare('DELETE FROM convo_flags WHERE life_id=? AND rel=?').run(lifeId, rel);
    },
    listConvoFlags() {
      const rows = db.prepare('SELECT life_id,rel,flag,reason,by,at FROM convo_flags ORDER BY at DESC').all() as Array<{ life_id: string; rel: string; flag: string; reason: string; by: string; at: string }>;
      return rows.map((r) => ({ lifeId: r.life_id, rel: r.rel, flag: r.flag as ConvoFlag['flag'], reason: r.reason, by: r.by, at: r.at }));
    },
    convoFlagsFor(lifeId) {
      const rows = db.prepare('SELECT life_id,rel,flag,reason,by,at FROM convo_flags WHERE life_id=? ORDER BY at DESC').all(lifeId) as Array<{ life_id: string; rel: string; flag: string; reason: string; by: string; at: string }>;
      return rows.map((r) => ({ lifeId: r.life_id, rel: r.rel, flag: r.flag as ConvoFlag['flag'], reason: r.reason, by: r.by, at: r.at }));
    },
    addSafetyHit(lifeId, rel, word, action, excerpt, at) {
      db.prepare('INSERT INTO safety_hits(life_id,rel,word,action,excerpt,at) VALUES(?,?,?,?,?,?)').run(lifeId, rel, word, action, excerpt, at ?? now());
      db.prepare('DELETE FROM safety_hits WHERE at<?').run(new Date(Date.now() - 180 * 86_400_000).toISOString()); // 只留 180 天
    },
    listSafetyHits(limit) {
      const rows = db.prepare('SELECT id,life_id,rel,word,action,excerpt,at FROM safety_hits ORDER BY id DESC LIMIT ?').all(limit) as Array<{ id: number; life_id: string; rel: string; word: string; action: string; excerpt: string; at: string }>;
      return rows.map((r) => ({ id: Number(r.id), at: r.at, lifeId: r.life_id, rel: r.rel, word: r.word, action: r.action, excerpt: r.excerpt }));
    },
    close() {
      db.close();
    },
  };
}

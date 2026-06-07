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
  register(email: string, password: string, handle: string): AuthResult;
  login(email: string, password: string): LoginResult;
  authenticate(token: string): Account | null;
  logout(token: string): void;
  getAccount(userId: string): Account | null;
  relIdFor(userId: string): string;
  balance(userId: string): number;
  debit(userId: string, amount: number, reason: string, ref?: string): boolean;
  credit(userId: string, amount: number, reason: string, ref?: string): void;
  requestRecharge(userId: string, amount: number): number;
  pendingRecharges(): RechargeRequest[];
  decideRecharge(id: number, approve: boolean, by: string): boolean;
  issueEmailVerification(userId: string): string;
  verifyEmail(token: string): boolean;
  setStatus(userId: string, status: AccountStatus): void;
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
  `);

  const owners = new Set((opts.owners ?? []).map(norm));
  const stewards = new Set((opts.stewards ?? []).map(norm));
  const starter = opts.starterCredits ?? 100;
  const ttl = opts.sessionTtlMs ?? 30 * 86_400_000;
  const roleFor = (email: string): Role => (owners.has(norm(email)) ? 'owner' : stewards.has(norm(email)) ? 'steward' : 'user');

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
    register(email, password, handle) {
      const e = norm(email);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return { ok: false, error: '邮箱格式不对' };
      if (password.length < 8) return { ok: false, error: '密码至少 8 位' };
      if (userByEmail(e)) return { ok: false, error: '该邮箱已注册' };
      const id = genId();
      const { salt, hash } = hashPassword(password);
      const t = now();
      db.prepare('INSERT INTO users(id,email,email_verified,pass_salt,pass_hash,handle,role,status,created_at,last_active_at) VALUES(?,?,0,?,?,?,?,?,?,?)')
        .run(id, e, salt, hash, handle.trim() || e.split('@')[0], roleFor(e), 'active', t, t);
      if (starter > 0) credit(id, starter, 'starter_grant');
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
      const u = userById(s.user_id);
      if (!u || u.status === 'blocked') return null;
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
    relIdFor: (userId) => `u_${userId}`,
    balance,
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
    close() {
      db.close();
    },
  };
}

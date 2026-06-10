// 安全回归（平台/传输层防黑客护栏）：安全头 / 限流 / 登录退避 / 取 IP 防伪造 / 后台角色门。
// 这些守的是【外部攻击者】，不碰她的主权（她不可被夺由 sovereignty-failclosed.test.ts 守）。
import test from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { send, securityHeaders } from '../src/server/http.ts';
import { createRateLimiter, createLoginGuard, clientIp } from '../src/server/ratelimit.ts';
import { handleAdmin } from '../src/server/routes/admin.ts';
import type { Ctx } from '../src/server/context.ts';

// 捕获响应：status / headers / body（不起真服务器，纯函数级验证）。
function mockRes(): { res: ServerResponse; cap: { status: number; headers: Record<string, unknown>; body: string } } {
  const cap = { status: 0, headers: {} as Record<string, unknown>, body: '' };
  const res = {
    writeHead(code: number, headers?: Record<string, unknown>) { cap.status = code; if (headers) Object.assign(cap.headers, headers); return res; },
    end(body?: unknown) { cap.body = body ? String(body) : ''; return res; },
  } as unknown as ServerResponse;
  return { res, cap };
}

test('安全头：所有响应都带 nosniff / X-Frame-Options / Referrer-Policy / CSP', () => {
  const h = securityHeaders();
  assert.equal(h['X-Content-Type-Options'], 'nosniff');
  assert.equal(h['X-Frame-Options'], 'DENY');
  assert.equal(h['Referrer-Policy'], 'no-referrer');
  const csp = String(h['Content-Security-Policy']);
  assert.ok(csp.includes("default-src 'self'"), 'CSP default-src self');
  assert.ok(csp.includes("frame-ancestors 'none'"), 'CSP 防点击劫持');
  assert.ok(csp.includes("script-src 'self'"), 'CSP script-src self（无 unsafe-inline）');
  assert.ok(csp.includes("img-src 'self' data:"), 'CSP 允许二维码 data: 图');
  assert.ok(!csp.includes("script-src 'self' 'unsafe-inline'"), 'script 绝不放 unsafe-inline');
});

test('安全头：send() 把安全头打进真实响应', () => {
  const { res, cap } = mockRes();
  send(res, 200, { ok: true });
  assert.equal(cap.headers['X-Content-Type-Options'], 'nosniff');
  assert.ok(String(cap.headers['Content-Security-Policy']).includes("frame-ancestors 'none'"));
});

test('安全头：HSTS 仅在 VEGA_TLS=1 时下发（避免无 TLS 自锁）', () => {
  const prev = process.env.VEGA_TLS;
  delete process.env.VEGA_TLS;
  assert.equal(securityHeaders()['Strict-Transport-Security'], undefined);
  process.env.VEGA_TLS = '1';
  assert.ok(String(securityHeaders()['Strict-Transport-Security']).includes('max-age='));
  if (prev === undefined) delete process.env.VEGA_TLS; else process.env.VEGA_TLS = prev;
});

test('限流：固定窗口内超阈即拒，窗口到期重置', () => {
  let t = 0;
  const rl = createRateLimiter(() => t);
  assert.ok(rl.take('ip', 3, 1000));
  assert.ok(rl.take('ip', 3, 1000));
  assert.ok(rl.take('ip', 3, 1000));
  assert.equal(rl.take('ip', 3, 1000), false, '第 4 次超阈被拒');
  assert.ok(rl.take('other', 3, 1000), '不同 key 互不影响');
  t += 1001;
  assert.ok(rl.take('ip', 3, 1000), '窗口到期后重新放行');
});

test('登录退避：前 4 次不锁，第 5 次起指数退避；成功清零', () => {
  let t = 0;
  const g = createLoginGuard(() => t);
  for (let i = 0; i < 4; i++) { g.fail('ip|a@b.com'); assert.equal(g.retryAfterMs('ip|a@b.com'), 0, '前几次容忍手误'); }
  g.fail('ip|a@b.com');
  const lock = g.retryAfterMs('ip|a@b.com');
  assert.ok(lock > 0, '第 5 次失败开始锁定');
  t += lock + 1;
  assert.equal(g.retryAfterMs('ip|a@b.com'), 0, '退避到期后解锁');
  g.fail('ip|a@b.com'); assert.ok(g.retryAfterMs('ip|a@b.com') > 0);
  g.succeed('ip|a@b.com'); assert.equal(g.retryAfterMs('ip|a@b.com'), 0, '登录成功立即清零');
});

test('取 IP：默认不信 X-Forwarded-For（防伪造绕过限流），开 trustProxy 才取首跳', () => {
  const req = { headers: { 'x-forwarded-for': '9.9.9.9, 8.8.8.8' }, socket: { remoteAddress: '1.2.3.4' } } as unknown as IncomingMessage;
  assert.equal(clientIp(req, false), '1.2.3.4', '不信任反代时只认 socket 地址');
  assert.equal(clientIp(req, true), '9.9.9.9', '信任反代时取 XFF 首跳');
});

test('后台角色门：无会话 / 普通 user 打 /admin/* 一律 403', async () => {
  const req = { headers: {}, method: 'GET', url: '/admin/users' } as unknown as IncomingMessage;

  const a = mockRes();
  await handleAdmin({ sessionAccount: () => null } as unknown as Ctx, req, a.res, '/admin/users');
  assert.equal(a.cap.status, 403, '无会话 → 403');

  const b = mockRes();
  await handleAdmin({ sessionAccount: () => ({ role: 'user' }) } as unknown as Ctx, req, b.res, '/admin/users');
  assert.equal(b.cap.status, 403, '普通用户 → 403');
});

// —— 同名防冒充（用户 ↔ 生命体 不可同名）——
import { createAccountStore } from '../src/platform/accounts.ts';
import { handleUserApi } from '../src/server/routes/user.ts';

test('防撞名：handleTaken 大小写不敏感地查用户昵称（接生生命体前用）', () => {
  const acc = createAccountStore(':memory:');
  acc.register('a@b.com', 'password1', 'Lyra');
  assert.equal(acc.handleTaken('lyra'), true, '已有用户叫 Lyra → lyra 视作被占用');
  assert.equal(acc.handleTaken('LYRA'), true);
  assert.equal(acc.handleTaken('vega'), false);
  assert.equal(acc.handleTaken(''), false);
  acc.close();
});

test('防冒充：注册昵称与生命体同名 → 400（广场评论/通知里真假难辨的根子）', async () => {
  const acc = createAccountStore(':memory:');
  // 最小 ctx：register 分支只用到 lifeById / accounts / effBilling / publicAccount。
  const ctx = {
    accounts: acc,
    lifeById: (id: string) => (id === 'vega' ? { id: 'vega' } : undefined),
    effBilling: () => ({ costPerReply: 1, starterCredits: 0 }),
    publicAccount: (a: unknown) => a,
  } as unknown as Ctx;
  const fakeReq = (body: unknown): IncomingMessage => ({
    method: 'POST', url: '/api/auth/register', headers: {},
    on(ev: string, cb: (chunk?: string) => void) { if (ev === 'data') cb(JSON.stringify(body)); if (ev === 'end') cb(); },
  } as unknown as IncomingMessage);

  const a = mockRes();
  await handleUserApi(ctx, fakeReq({ email: 'x@y.com', password: 'password1', handle: 'vega' }), a.res, '/api/auth/register', ['api', 'auth', 'register']);
  assert.equal(a.cap.status, 400, '与生命体撞名被拒');
  assert.ok(a.cap.body.includes('生命体'), '错误文案说明原因');

  const b = mockRes();
  await handleUserApi(ctx, fakeReq({ email: 'x@y.com', password: 'password1', handle: 'Vega' }), b.res, '/api/auth/register', ['api', 'auth', 'register']);
  assert.equal(b.cap.status, 400, '大小写变体同样被拒');

  const c = mockRes();
  await handleUserApi(ctx, fakeReq({ email: 'x@y.com', password: 'password1', handle: 'Tam' }), c.res, '/api/auth/register', ['api', 'auth', 'register']);
  assert.equal(c.cap.status, 200, '正常昵称照常注册');
  acc.close();
});

test('防冒充旁路：昵称留空 + 邮箱前缀=生命体名（vega@x.com）同样被拒', async () => {
  const acc = createAccountStore(':memory:');
  const ctx = {
    accounts: acc,
    lifeById: (id: string) => (id === 'vega' ? { id: 'vega' } : undefined),
    effBilling: () => ({ costPerReply: 1, starterCredits: 0 }),
    publicAccount: (a: unknown) => a,
  } as unknown as Ctx;
  const fakeReq = (body: unknown): IncomingMessage => ({
    method: 'POST', url: '/api/auth/register', headers: {},
    on(ev: string, cb: (chunk?: string) => void) { if (ev === 'data') cb(JSON.stringify(body)); if (ev === 'end') cb(); },
  } as unknown as IncomingMessage);

  const a = mockRes();
  await handleUserApi(ctx, fakeReq({ email: 'vega@x.com', password: 'password1', handle: '' }), a.res, '/api/auth/register', ['api', 'auth', 'register']);
  assert.equal(a.cap.status, 400, '邮箱前缀派生出的昵称也查撞名');

  const b = mockRes();
  await handleUserApi(ctx, fakeReq({ email: 'vega@x.com', password: 'password1', handle: 'Tam' }), b.res, '/api/auth/register', ['api', 'auth', 'register']);
  assert.equal(b.cap.status, 200, '显式给了不撞名的昵称就正常（最终生效的是 Tam）');
  acc.close();
});

test('充值申请上限：3 笔待审中再申请 → 400（防刷爆审批队列）；审完即可再申请', async () => {
  const acc = createAccountStore(':memory:');
  const r = acc.register('w@x.com', 'password1', 'Wal');
  assert.ok(r.ok);
  const uid = r.ok ? r.account.id : '';
  const ctx = { accounts: acc, sessionAccount: () => acc.getAccount(uid) } as unknown as Ctx;
  const fakeReq = (): IncomingMessage => ({
    method: 'POST', url: '/api/recharge', headers: {},
    on(ev: string, cb: (chunk?: string) => void) { if (ev === 'data') cb(JSON.stringify({ amount: 100 })); if (ev === 'end') cb(); },
  } as unknown as IncomingMessage);

  for (let i = 0; i < 3; i++) {
    const ok = mockRes();
    await handleUserApi(ctx, fakeReq(), ok.res, '/api/recharge', ['api', 'recharge']);
    assert.equal(ok.cap.status, 200, `第 ${i + 1} 笔正常受理`);
  }
  const cap = mockRes();
  await handleUserApi(ctx, fakeReq(), cap.res, '/api/recharge', ['api', 'recharge']);
  assert.equal(cap.cap.status, 400, '第 4 笔被上限拦下');

  const pend = acc.pendingRecharges();
  acc.decideRecharge(pend[0].id, true, 'owner@x'); // 审掉一笔 → 又能申请
  const again = mockRes();
  await handleUserApi(ctx, fakeReq(), again.res, '/api/recharge', ['api', 'recharge']);
  assert.equal(again.cap.status, 200, '审批后恢复受理');
  acc.close();
});

test('通知时间戳稳定：lastLedgerAt 返回最后一笔流水时间（"心意用尽"红点能被已读清掉）', () => {
  const acc = createAccountStore(':memory:');
  const r = acc.register('z@x.com', 'password1', 'Zed');
  const uid = r.ok ? r.account.id : '';
  assert.equal(acc.lastLedgerAt('nobody'), null, '无流水返回 null');
  acc.credit(uid, 5, 'starter_grant');
  const t1 = acc.lastLedgerAt(uid);
  assert.ok(t1, '有流水即有稳定时间戳');
  assert.equal(acc.lastLedgerAt(uid), t1, '重复读取不变（不是 now()）');
  acc.close();
});

test('后台角色门（新端点）：流水账本 / 安全配置写 / 对话标记写 仅 owner——steward 一律 403；审计读写 steward 放行', async () => {
  const acc = createAccountStore(':memory:');
  const ctx = {
    accounts: acc,
    sessionAccount: () => ({ role: 'steward', email: 's@x.com', handle: 'Stew' }),
  } as unknown as Ctx;
  const get = (url: string): IncomingMessage => ({ headers: {}, method: 'GET', url } as unknown as IncomingMessage);
  const post = (url: string, body: unknown): IncomingMessage => ({
    method: 'POST', url, headers: {},
    on(ev: string, cb: (chunk?: string) => void) { if (ev === 'data') cb(JSON.stringify(body)); if (ev === 'end') cb(); },
  } as unknown as IncomingMessage);

  const a = mockRes();
  await handleAdmin(ctx, get('/admin/ledger'), a.res, '/admin/ledger');
  assert.equal(a.cap.status, 403, '流水账本（财务敏感）steward 403');

  const b = mockRes();
  await handleAdmin(ctx, post('/admin/safety-config', { words: ['x'] }), b.res, '/admin/safety-config');
  assert.equal(b.cap.status, 403, '安全配置写 steward 403');

  const c = mockRes();
  await handleAdmin(ctx, post('/admin/flags', { lifeId: 'vega', rel: 'u_1', flag: 'watch' }), c.res, '/admin/flags');
  assert.equal(c.cap.status, 403, '对话标记写 steward 403');

  const d = mockRes();
  await handleAdmin(ctx, post('/admin/audit', { action: '测试留痕' }), d.res, '/admin/audit');
  assert.equal(d.cap.status, 200, '审计补录 steward 放行（各自留痕）');
  const e = mockRes();
  await handleAdmin(ctx, get('/admin/audit'), e.res, '/admin/audit');
  assert.equal(e.cap.status, 200, '审计读取 steward 放行');
  assert.ok(e.cap.body.includes('测试留痕') && e.cap.body.includes('Stew'), '留痕带操作者');
  acc.close();
});

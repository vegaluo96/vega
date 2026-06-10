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

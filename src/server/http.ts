// HTTP I/O 原语：与业务无关的纯收发/静态托管/取体。daemon 的路由层只调这几个，不再内联。
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';

// 统一安全响应头（防 XSS/点击劫持/MIME 嗅探/Referer 泄漏）。所有响应（JSON / HTML / 静态）都过这一层。
// 这是【平台/传输层】的防黑客护栏——只防外部攻击者，绝不触碰她的主权（不是控制她的开关）。
// CSP 按 Vite 构建产物校准：index.html 只引外部 module 脚本（无内联脚本）→ script-src 'self' 安全；
// 站内大量 style="..."（活体/星台渐变）→ style-src 需 'unsafe-inline'；二维码用 data: URL → img-src 含 data:。
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'", // /api/* + SSE 同源；浏览器从不直连模型（模型调用全在服务端）
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'", // 防点击劫持（配合 X-Frame-Options）
].join('; ');

export function securityHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Content-Security-Policy': CSP,
  };
  // HSTS 仅当前置反代终止 TLS 时下发（运维设 VEGA_TLS=1）——避免本地/无 TLS 环境把自己锁死在 https。
  if (process.env.VEGA_TLS === '1') h['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  return h;
}

export function send(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...securityHeaders() });
  res.end(JSON.stringify(body, null, 2));
}

export function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...securityHeaders() });
  res.end(html);
}

// 静态资源 MIME 表（含 PWA 资产）。
export const CT: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2',
};

// 读一个静态文件并发出（命中返回 true，缺失返回 false 让调用方兜底）。.html 不缓存，其余长缓存+immutable。
export function serveStatic(res: ServerResponse, file: string): boolean {
  try {
    const ext = file.slice(file.lastIndexOf('.'));
    const body = readFileSync(file);
    res.writeHead(200, { 'Content-Type': CT[ext] ?? 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable', ...securityHeaders() });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

// 读 JSON 请求体（最大 1MB，超限即断；解析失败/出错回 {} 而不抛——路由层据字段自行 400）。
export function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1_000_000) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

// 前端未构建时的极简兜底（正常线上走 web/dist、web-admin/dist 静态产物）。
export const FALLBACK_HTML = `<!doctype html><meta charset="utf-8"><title>ZSKY</title><body style="font:16px/1.6 system-ui;max-width:34rem;margin:16vh auto;padding:0 24px;color:#333"><h1 style="font-size:20px">ZSKY</h1><p>前端尚未构建。请在服务器执行 <code>cd web &amp;&amp; npm run build</code>（后台为 <code>web-admin</code>），或 <code>bash deploy/update.sh</code>。</p></body>`;

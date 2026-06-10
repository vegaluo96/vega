// HTTP I/O 原语：与业务无关的纯收发/静态托管/取体。daemon 的路由层只调这几个，不再内联。
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

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

// 客户端接受 gzip 吗（Node 的 ServerResponse 自带 .req 反查请求头；测试桩没有 req → 不压缩）。
const wantsGzip = (res: ServerResponse): boolean =>
  String((res as ServerResponse & { req?: IncomingMessage }).req?.headers?.['accept-encoding'] ?? '').includes('gzip');

export function send(res: ServerResponse, code: number, body: unknown): void {
  // 紧凑 JSON（原 null,2 美化白白多 ~30% 字节）+ gzip（超 1KB 且客户端接受时，中文 JSON 通常压到 1/4~1/6）。
  const raw = JSON.stringify(body);
  const base = { 'Content-Type': 'application/json; charset=utf-8', Vary: 'Accept-Encoding', ...securityHeaders() };
  if (raw.length > 1024 && wantsGzip(res)) {
    res.writeHead(code, { ...base, 'Content-Encoding': 'gzip' });
    res.end(gzipSync(Buffer.from(raw)));
  } else {
    res.writeHead(code, base);
    res.end(raw);
  }
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
// 内存缓存 + 预压缩：按 mtime/size 校验（部署重建 dist 即自动失效），文本资产预 gzip 一次反复用——
// 不再每个请求 readFileSync，主 JS 包传输量降到 ~1/3（dist 总量仅几 MB，整缓存也只占几 MB 内存）。
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.svg', '.json', '.webmanifest']);
const staticCache = new Map<string, { mtimeMs: number; size: number; raw: Buffer; gz: Buffer | null }>();
export function serveStatic(res: ServerResponse, file: string): boolean {
  try {
    const st = statSync(file); // 文件不存在即抛 → false（与旧行为一致，调用方兜底）
    const ext = file.slice(file.lastIndexOf('.'));
    let c = staticCache.get(file);
    if (!c || c.mtimeMs !== st.mtimeMs || c.size !== st.size) {
      const raw = readFileSync(file);
      c = { mtimeMs: st.mtimeMs, size: st.size, raw, gz: COMPRESSIBLE.has(ext) && raw.length > 1024 ? gzipSync(raw) : null };
      staticCache.set(file, c);
    }
    const base = {
      'Content-Type': CT[ext] ?? 'application/octet-stream',
      // .html 与 PWA 入口件（sw.js / manifest）必须每次重验：service worker 脚本被长缓存会把全站钉死在旧版。
      // 其余都是带内容哈希的产物 → 长缓存 + immutable。
      'Cache-Control': ext === '.html' || file.endsWith('sw.js') || ext === '.webmanifest' ? 'no-cache' : 'public, max-age=31536000, immutable',
      ...(c.gz ? { Vary: 'Accept-Encoding' } : {}),
      ...securityHeaders(),
    };
    if (c.gz && wantsGzip(res)) {
      res.writeHead(200, { ...base, 'Content-Encoding': 'gzip' });
      res.end(c.gz);
    } else {
      res.writeHead(200, base);
      res.end(c.raw);
    }
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

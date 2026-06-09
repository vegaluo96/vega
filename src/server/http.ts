// HTTP I/O 原语：与业务无关的纯收发/静态托管/取体。daemon 的路由层只调这几个，不再内联。
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';

export function send(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body, null, 2));
}

export function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
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
    res.writeHead(200, { 'Content-Type': CT[ext] ?? 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable' });
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

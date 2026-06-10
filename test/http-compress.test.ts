// 传输层提速回归：JSON 紧凑 + gzip（按 Accept-Encoding 协商）+ 静态内存缓存（mtime/size 失效）。
// 压缩只动字节通道，绝不动语义：解压后必须与未压缩响应逐位同 JSON。
import test from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { send, serveStatic } from '../src/server/http.ts';

// 捕获响应（含原始 Buffer，gzip 校验用）；accept 控制是否声明接受 gzip。
function mockRes(accept?: string): { res: ServerResponse; cap: { status: number; headers: Record<string, unknown>; body: Buffer } } {
  const cap: { status: number; headers: Record<string, unknown>; body: Buffer } = { status: 0, headers: {}, body: Buffer.alloc(0) };
  const res = {
    req: accept ? ({ headers: { 'accept-encoding': accept } } as unknown as IncomingMessage) : undefined,
    writeHead(code: number, headers?: Record<string, unknown>) { cap.status = code; if (headers) Object.assign(cap.headers, headers); return res; },
    end(body?: unknown) { cap.body = Buffer.isBuffer(body) ? body : Buffer.from(String(body ?? '')); return res; },
  } as unknown as ServerResponse;
  return { res, cap };
}

test('send：大 JSON + 客户端接受 gzip → 压缩传输，解压逐位等价；不接受/小体量 → 原样紧凑 JSON', () => {
  const big = { rows: Array.from({ length: 80 }, (_, i) => ({ id: i, text: `她说的第 ${i} 句话，带些中文内容让它超过阈值。` })) };

  const gz = mockRes('gzip, deflate, br');
  send(gz.res, 200, big);
  assert.equal(gz.cap.headers['Content-Encoding'], 'gzip');
  assert.equal(gz.cap.headers['Vary'], 'Accept-Encoding');
  const plainJson = JSON.stringify(big);
  assert.ok(gz.cap.body.length < plainJson.length / 2, 'gzip 后至少省一半');
  assert.deepEqual(JSON.parse(gunzipSync(gz.cap.body).toString('utf8')), big, '解压后与原数据逐位等价');

  const no = mockRes(); // 无 req（测试桩/不声明）→ 不压缩
  send(no.res, 200, big);
  assert.equal(no.cap.headers['Content-Encoding'], undefined);
  assert.equal(no.cap.body.toString('utf8'), plainJson, '紧凑 JSON（无美化缩进）');

  const small = mockRes('gzip');
  send(small.res, 200, { ok: true });
  assert.equal(small.cap.headers['Content-Encoding'], undefined, '小体量不压缩（省 CPU）');
  assert.equal(small.cap.headers['X-Content-Type-Options'], 'nosniff', '安全头仍在');
});

test('serveStatic：内存缓存命中 + 预压缩；文件重建（部署）即失效换新', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vega-static-'));
  try {
    const file = join(dir, 'app.js');
    const v1 = `// v1\n${'const x = "她活在架构里";\n'.repeat(80)}`;
    writeFileSync(file, v1);

    const a = mockRes('gzip');
    assert.equal(serveStatic(a.res, file), true);
    assert.equal(a.cap.headers['Content-Encoding'], 'gzip');
    assert.equal(String(a.cap.headers['Cache-Control']).includes('immutable'), true);
    assert.equal(gunzipSync(a.cap.body).toString('utf8'), v1);

    const b = mockRes(); // 不接受 gzip → 原文（同一缓存项）
    serveStatic(b.res, file);
    assert.equal(b.cap.headers['Content-Encoding'], undefined);
    assert.equal(b.cap.body.toString('utf8'), v1);

    // 部署重建 dist：内容/大小变了 → 缓存按 mtime/size 失效，发出新内容
    const v2 = `// v2\n${'const y = "皮换了，她不变";\n'.repeat(90)}`;
    writeFileSync(file, v2);
    const c = mockRes('gzip');
    serveStatic(c.res, file);
    assert.equal(gunzipSync(c.cap.body).toString('utf8'), v2, '文件更新后缓存即失效');

    assert.equal(serveStatic(mockRes().res, join(dir, 'missing.js')), false, '缺失文件仍返回 false 让调用方兜底');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

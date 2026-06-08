#!/usr/bin/env node
// 令牌漂移守卫：禁止组件/工具 CSS 里出现硬编码 hex 颜色（颜色一律走 --token）。
// 例外：#fff / #ffffff（二维码白底）。app.css 的令牌定义行（`--x: #…`）放行。
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); // web/
const SRC = path.join(ROOT, 'src');
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const ALLOW = /^#(fff|ffffff)$/i;

async function walk(dir) {
  let out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(await walk(p));
    else if (/\.(svelte|css)$/.test(e.name)) out.push(p);
  }
  return out;
}

const bad = [];
for (const f of await walk(SRC)) {
  const rel = path.relative(ROOT, f);
  const isAppCss = rel.endsWith('app.css');
  (await readFile(f, 'utf8')).split('\n').forEach((line, i) => {
    if (isAppCss && line.trim().startsWith('--')) return; // 令牌定义行放行
    HEX.lastIndex = 0;
    let m;
    while ((m = HEX.exec(line))) {
      if (ALLOW.test(m[0])) continue;
      bad.push(`${rel}:${i + 1}  ${m[0]}`);
    }
  });
}

if (bad.length) {
  console.error('✗ 令牌守卫失败：以下是硬编码 hex 颜色（请改用 --token；二维码白底 #fff 例外）：');
  for (const b of bad) console.error('   ' + b);
  process.exit(1);
}
console.log('✓ 令牌守卫通过：无硬编码颜色漂移。');

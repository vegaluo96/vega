#!/usr/bin/env node
// 接缝守卫（结构性防回归）：禁止在 fixed / sticky / backdrop 上下文的受控选择器里用真 1px `border`
// —— iOS Safari 会把它渲染成断裂的接缝。这些位置必须用 `inset box-shadow` 画线。
// 允许：`border: 0` / `border-color: transparent` / `border: Npx solid transparent`（仅占位、不显形）。
// 用法：node scripts/check-seams.mjs（在 web/ 下；CI 接入见 .github/workflows/ci.yml）。
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); // web/

// 整文件扫描：iOS 沉浸面，全部 border 都应是 inset 阴影。
const WHOLE_FILES = [
  'src/routes/Chat.svelte',
  'src/routes/PostDetail.svelte',
  'src/routes/Shell.svelte',
  'src/components/Composer.svelte',
  'src/components/TopBar.svelte',
];
// 按规则块扫描（这些文件别处有合法真 border，只查 fixed/sticky 的那几条规则）。
const RULE_BLOCKS = [
  { file: 'src/app.css', selectors: ['.sticktop', '.list-row'] },
  { file: '../web-admin/src/routes/Dashboard.svelte', selectors: ['.topbar', '.sidebar'] },
];

const BORDER_RE = /border(?:-top|-bottom|-left|-right)?\s*:\s*([^;}]+)/g;

function scan(text, label) {
  const out = [];
  text.split('\n').forEach((line, i) => {
    BORDER_RE.lastIndex = 0;
    let m;
    while ((m = BORDER_RE.exec(line))) {
      const val = m[1].trim();
      if (/^0\b/.test(val)) continue;            // border: 0
      if (/\btransparent\b/.test(val)) continue; // 占位透明边框
      out.push(`${label}:${i + 1}  ${m[0].trim()}`);
    }
  });
  return out;
}

function blocks(text, selector) {
  const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{', 'g');
  const found = [];
  let m;
  while ((m = re.exec(text))) {
    const end = text.indexOf('}', m.index);
    found.push(text.slice(m.index, end === -1 ? text.length : end + 1));
  }
  return found;
}

const bad = [];
for (const f of WHOLE_FILES) {
  bad.push(...scan(await readFile(path.join(ROOT, f), 'utf8'), f));
}
for (const { file, selectors } of RULE_BLOCKS) {
  const text = await readFile(path.join(ROOT, file), 'utf8');
  for (const sel of selectors) {
    for (const b of blocks(text, sel)) bad.push(...scan(b, `${file} ${sel}`));
  }
}

if (bad.length) {
  console.error('✗ 接缝守卫失败：以下位置在 fixed/sticky 上下文用了真 border（iOS 会断裂）。改用 inset box-shadow：');
  for (const b of bad) console.error('   ' + b);
  process.exit(1);
}
console.log('✓ 接缝守卫通过：受控选择器无真 border。');

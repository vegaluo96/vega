// 命的视觉身份·二轮：每条命一片【稳定的星空】——由 id 确定性生成的星点排布 + 色相。
// 视觉是身份的一部分，应像气质一样稳定（同一个 id 永远同一片星空）。纯程序生成、零图片。
function hashStr(s) {
  let h = 0;
  for (const c of s || 'x') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  // 雪崩混合：让 lyra/rhea 这种相近名字也得到差异很大的种子（颜色/排布分得开）。
  h ^= h >>> 16; h = Math.imul(h, 0x45d9f3b); h ^= h >>> 16; h = Math.imul(h, 0x45d9f3b); h ^= h >>> 16;
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 返回 { hue, pts:[{x,y,s,bright}], edges:[[i,j]] }，坐标在 0..100（配 viewBox 0 0 100 100）。
export function constellation(id) {
  const seed = hashStr(id);
  const rnd = mulberry32(seed || 1);
  const hue = Math.floor(rnd() * 360); // 由 PRNG 取色相：相邻名字也分得开
  const n = 5 + Math.floor(rnd() * 3); // 5..7 颗
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.2832;
    const r = 0.15 + rnd() * 0.30; // 离中心 15%..45%
    pts.push({ x: 50 + Math.cos(a) * r * 100, y: 50 + Math.sin(a) * r * 100, s: 2.0 + rnd() * 1.6, bright: false });
  }
  pts[0].bright = true; pts[0].s = Math.max(pts[0].s, 4.4); // 一颗主星
  // 最近邻连成"星座"线
  const used = new Set([0]); let cur = 0; const edges = [];
  for (let k = 1; k < n; k++) {
    let best = -1, bd = 1e9;
    for (let j = 0; j < n; j++) {
      if (used.has(j)) continue;
      const d = (pts[j].x - pts[cur].x) ** 2 + (pts[j].y - pts[cur].y) ** 2;
      if (d < bd) { bd = d; best = j; }
    }
    edges.push([cur, best]); used.add(best); cur = best;
  }
  return { hue, pts, edges };
}

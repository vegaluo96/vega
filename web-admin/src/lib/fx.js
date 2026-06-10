// ZSKY · 游戏化特效（轻量：纯 DOM + CSS transform/opacity，自清理，封顶数量，
//   全部 prefers-reduced-motion 降级；无库、无 canvas 轮询，几乎零加载与运行成本）。
const reduce = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
let _layer = null;
function layer() {
  if (_layer && _layer.isConnected) return _layer;
  _layer = document.getElementById('fx-layer');
  if (!_layer) { _layer = document.createElement('div'); _layer.id = 'fx-layer'; document.body.appendChild(_layer); }
  return _layer;
}
function center(arg) {
  let el = arg && arg.currentTarget ? arg.currentTarget : arg;
  if (el && el.getBoundingClientRect) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  if (arg && arg.clientX != null) return { x: arg.clientX, y: arg.clientY };
  return { x: innerWidth / 2, y: innerHeight / 2 };
}
const COLORS = { spark: '#b3823f', heart: '#c2567a', smile: '#3f996b', flame: '#bb6440', moon: '#5b7cff', gift: '#c2567a', star: '#e8c87a' };
const GLYPH = {
  spark: 'M6 .5Q6.6 5.4 11.5 6 6.6 6.6 6 11.5 5.4 6.6 .5 6 5.4 5.4 6 .5Z',
  heart: 'M6 11 1.6 6.6A2.6 2.6 0 1 1 6 3a2.6 2.6 0 1 1 4.4 3.6Z',
  smile: 'M6 .5Q6.6 5.4 11.5 6 6.6 6.6 6 11.5 5.4 6.6 .5 6 5.4 5.4 6 .5Z',
  flame: 'M6 .5Q6.6 5.4 11.5 6 6.6 6.6 6 11.5 5.4 6.6 .5 6 5.4 5.4 6 .5Z',
  moon: 'M6 .5Q6.6 5.4 11.5 6 6.6 6.6 6 11.5 5.4 6.6 .5 6 5.4 5.4 6 .5Z',
  star: 'M6 .5 7.4 4.3 11.5 4.5 8.3 7 9.4 11 6 8.7 2.6 11 3.7 7 .5 4.5 4.6 4.3Z',
};
// 上浮的反应图标（点共鸣/喜欢时）
export function floatIcon(originEl, kind) {
  if (reduce()) return;
  const { x, y } = center(originEl);
  const color = COLORS[kind] || COLORS.spark;
  const d = GLYPH[kind] || GLYPH.spark;
  const n = document.createElement('div');
  n.className = 'fx-particle';
  n.style.cssText = `left:${x}px;top:${y}px;width:22px;height:22px;color:${color};animation:fx-floatup 0.92s cubic-bezier(.22,.61,.36,1) forwards`;
  n.innerHTML = `<svg viewBox="0 0 12 12" width="100%" height="100%" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.18))"><path d="${d}" fill="currentColor"/></svg>`;
  layer().appendChild(n);
  setTimeout(() => n.remove(), 950);
}
// 星点迸发（她回话/里程碑/绑定成功）——封顶 14 颗
export function burst(originEl, opts) {
  if (reduce()) return;
  opts = opts || {};
  const { x, y } = center(originEl);
  const count = Math.min(opts.count || 12, 14);
  const color = opts.color || COLORS.star;
  const spread = opts.spread || 64;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const dist = spread * (0.6 + Math.random() * 0.6);
    const dx = Math.cos(a) * dist, dy = Math.sin(a) * dist;
    const sz = 5 + Math.random() * 5;
    const p = document.createElement('div');
    p.className = 'fx-particle';
    p.style.cssText = `left:${x}px;top:${y}px;width:${sz}px;height:${sz}px;--dx:${dx}px;--dy:${dy}px;color:${color};animation:fx-spark ${0.6 + Math.random() * 0.4}s ease-out forwards`;
    p.innerHTML = `<svg viewBox="0 0 12 12" width="100%" height="100%"><path d="${GLYPH.star}" fill="currentColor"/></svg>`;
    frag.appendChild(p);
  }
  layer().appendChild(frag);
  setTimeout(() => { layer().querySelectorAll('.fx-particle').forEach((el) => { if (parseFloat(getComputedStyle(el).opacity) === 0) el.remove(); }); }, 1100);
}
// 元素回弹一下
export function bounce(el) {
  if (!el || reduce()) return;
  el.classList.remove('fx-bounce'); void el.offsetWidth; el.classList.add('fx-bounce');
  setTimeout(() => el.classList.remove('fx-bounce'), 460);
}
export const FX = { floatIcon, burst, bounce };

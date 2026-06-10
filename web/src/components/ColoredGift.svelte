<script>
  // 充值入口的彩色礼物（给「心意」一点温度）。颜色来自 lib/palette.js（有意的固定彩色，非主题令牌）。
  import { GIFT } from '../lib/palette.js';
  export let size = 23;
  export let animate = false;
  const uid = 'gift' + Math.random().toString(36).slice(2, 8);
</script>

<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" class="g">
  <defs>
    <linearGradient id={uid + 'box'} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color={GIFT.box1} /><stop offset="100%" stop-color={GIFT.box2} /></linearGradient>
    <linearGradient id={uid + 'lid'} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color={GIFT.lid1} /><stop offset="100%" stop-color={GIFT.lid2} /></linearGradient>
  </defs>
  <g class="gift-anim" class:pop={animate}>
    <rect x="4.5" y="10.5" width="15" height="9.5" rx="1.6" fill={`url(#${uid}box)`} />
    <rect x="3.2" y="7.6" width="17.6" height="3.8" rx="1.3" fill={`url(#${uid}lid)`} />
    <rect x="10.6" y="7.6" width="2.8" height="12.4" fill={GIFT.ribbon} opacity="0.92" />
    <path d="M12 7.4S10.7 3.4 8.4 3.6a2.1 2.1 0 0 0 .1 4.1c1.7.1 3.5-.3 3.5-.3Z" fill={GIFT.ribbon} />
    <path d="M12 7.4s1.4-4 3.7-3.8a2.1 2.1 0 0 1-.1 4.1c-1.8.1-3.6-.3-3.6-.3Z" fill={GIFT.ribbonR} />
    <circle class="gift-knot" cx="12" cy="7.2" r="1.5" fill={GIFT.knot} />
  </g>
</svg>

<style>
  .g { display: block; }
  .pop { transform-box: fill-box; transform-origin: 50% 60%; animation: fx-bounce 0.6s cubic-bezier(0.34,1.56,0.64,1); }
</style>

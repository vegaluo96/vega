<script>
  // 命的视觉身份：一片稳定的星空（constellation.js 确定性生成）+ 心情描边 + 醒着时极轻闪烁。
  // moodRing 来自既有 lib/avatar.js（不改算法/引擎）。每个 id 永远同一片星空。
  import { constellation } from '../lib/constellation.js';
  import { moodRing } from '../lib/avatar.js';
  export let id = '';
  export let emotion = '';
  export let awake = false;
  export let size = 46;
  export let pulse = true;
  $: c = constellation(id);
  $: ring = moodRing(emotion);
  const uid = 'lc' + Math.random().toString(36).slice(2, 8);
</script>

<svg class="av" class:tw={awake && pulse} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={id || '生命'}>
  <defs>
    <radialGradient id={uid} cx="50%" cy="40%" r="64%">
      <stop offset="0%" stop-color="hsl({c.hue} 44% 18%)" />
      <stop offset="100%" stop-color="hsl({c.hue} 50% 7%)" />
    </radialGradient>
  </defs>
  <circle cx="50" cy="50" r="49" fill="url(#{uid})" />
  {#each c.edges as [a, b]}
    <line x1={c.pts[a].x} y1={c.pts[a].y} x2={c.pts[b].x} y2={c.pts[b].y} stroke="hsl({c.hue} 64% 74%)" stroke-width="1.1" stroke-opacity="0.4" />
  {/each}
  {#each c.pts as p, i}
    {#if p.bright}<circle cx={p.x} cy={p.y} r={p.s * 2.4} fill="hsl({c.hue} 82% 82%)" opacity="0.18" />{/if}
    <circle class="star" style="--d:{(i * 0.5).toFixed(1)}s" cx={p.x} cy={p.y} r={p.s}
      fill={p.bright ? `hsl(${c.hue} 84% 93%)` : `hsl(${c.hue} 70% 83%)`} />
  {/each}
  {#if ring !== 'transparent'}<circle cx="50" cy="50" r="47.5" fill="none" stroke={ring} stroke-width="3" />{/if}
</svg>

<style>
  .av { display: block; flex: none; border-radius: 50%; }
  .av.tw .star { animation: tw 3.8s ease-in-out infinite; animation-delay: var(--d); }
  @keyframes tw { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
</style>

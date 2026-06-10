<script>
  // 形态三 · CONSTELLA（星座体）：由 id 生成的星点排布 + 连线，主星即脸。进化自旧 constellation.js。
  import CreatureFace from './CreatureFace.svelte';
  import { crRng } from '../lib/creature.js';
  export let genes, st, size = 64, animate = true, face = true;

  $: ({ baseHue, hue2, seed } = genes);
  $: ({ expr, awake, sleepP, vitality, arousal, tension, reaction } = st);
  // 由 seed 确定性生成星点 + 最近邻连线
  $: shape = (() => {
    const rnd = crRng(seed || 1);
    const n = 5 + Math.floor(rnd() * 3);
    const pts = [];
    for (let i = 0; i < n; i++) { const a = rnd() * 6.2832; const r = 0.16 + rnd() * 0.28; pts.push({ x: 50 + Math.cos(a) * r * 100, y: 50 + Math.sin(a) * r * 100, s: 2 + rnd() * 1.6 }); }
    pts[0] = { x: 50, y: 48, s: 7 + vitality * 2 };
    const used = new Set([0]); let cur = 0; const edges = [];
    for (let k = 1; k < n; k++) { let best = -1, bd = 1e9; for (let j = 0; j < n; j++) { if (used.has(j)) continue; const d = (pts[j].x - pts[cur].x) ** 2 + (pts[j].y - pts[cur].y) ** 2; if (d < bd) { bd = d; best = j; } } edges.push([cur, best]); used.add(best); cur = best; }
    return { pts, edges };
  })();
  $: pts = shape.pts;
  $: edges = shape.edges;
  $: dim = expr.dim || sleepP > 0.6 || !awake;
  $: breathDur = awake ? (3.6 - arousal * 1.5) : 5;
  $: anim = reaction === 'respond' ? `cr-pulse-once 0.7s ease 1, cr-breathe ${breathDur}s ease-in-out infinite 0.7s`
          : reaction === 'reach' ? `cr-reach 1.4s ease-in-out infinite`
          : `cr-breathe ${breathDur}s ease-in-out infinite`;
  $: wobAnim = (tension || expr.wobble) && awake ? `cr-wobble 3.4s ease-in-out infinite` : 'none';
  $: stroke = `hsl(${baseHue} 70% 70%)`;
  $: gid = `cst-${seed % 100000}`;
</script>

<svg viewBox="0 0 100 100" width={size} height={size} class="constella">
  <defs>
    <radialGradient id={gid} cx="50%" cy="42%" r="60%">
      <stop offset="0%" stop-color={`hsl(${baseHue} 80% 84%)`} />
      <stop offset="100%" stop-color={`hsl(${hue2} 72% 56%)`} />
    </radialGradient>
  </defs>
  <g class="core" style="animation:{animate ? anim : 'none'};opacity:{dim ? 0.7 : 1};">
    <g style="animation:{animate ? wobAnim : 'none'};transform-box:fill-box;transform-origin:center;">
      {#each edges as [i, j]}
        <line x1={pts[i].x} y1={pts[i].y} x2={pts[j].x} y2={pts[j].y} {stroke} stroke-width="0.7" opacity={dim ? 0.2 : 0.45} />
      {/each}
      {#each pts.slice(1) as p, i}
        <circle cx={p.x} cy={p.y} r={p.s * 0.5} fill={`hsl(${(hue2 + i * 20) % 360} 70% 72%)`} opacity={dim ? 0.4 : 0.9} />
      {/each}
      <circle cx={pts[0].x} cy={pts[0].y} r={pts[0].s * 1.7} fill={`url(#${gid})`} opacity={dim ? 0.7 : 1} />
      <circle cx={pts[0].x} cy={pts[0].y} r={pts[0].s * 2.6} fill="none" {stroke} stroke-width="0.6" opacity={dim ? 0.15 : 0.4} />
      {#if face}
        <CreatureFace cx={pts[0].x} cy={pts[0].y + 1} scale={pts[0].s / 8} {expr} {awake} {sleepP} hue={baseHue} {animate} />
      {/if}
    </g>
  </g>
</svg>

<style>
  .constella { display: block; overflow: visible; }
  .core { transform-origin: 50% 50%; }
</style>

<script>
  // 形态一 · LUMEN（星核）：会呼吸的发光核 + 表情 + 光晕 + 同类公转光点 + 兴趣微光。气质冷静/永生感。
  import CreatureFace from './CreatureFace.svelte';
  export let genes, st, size = 64, animate = true, face = true;

  $: ({ baseHue, hue2, reach, motes } = genes);
  $: ({ expr, awake, sleepP, vitality, maturity, arousal, peers, interests, tension, reaction } = st);
  $: sat = 55 + expr.warm * 30;
  $: lit = 40 + expr.bright * 18 + vitality * 8 - sleepP * 10;
  $: breathDur = awake ? (3.6 - arousal * 1.6) : 5.2;
  $: coreR = 22 + maturity * 4;
  $: auraR = coreR * (1.5 + reach * 0.35);
  $: dim = expr.dim || sleepP > 0.6 || !awake;
  $: grad = `crlum-${genes.seed % 100000}`;
  $: anim = (() => {
    if (reaction === 'respond') return `cr-pulse-once 0.7s ease 1, cr-breathe ${breathDur}s ease-in-out infinite 0.7s`;
    if (reaction === 'reach') return `cr-reach 1.4s ease-in-out infinite`;
    if (expr.bob && awake) return `cr-bob ${2.4 - arousal}s ease-in-out infinite, cr-breathe ${breathDur}s ease-in-out infinite`;
    return `cr-breathe ${breathDur}s ease-in-out infinite`;
  })();
  $: wobAnim = (tension || expr.wobble) && awake ? `cr-wobble 3.4s ease-in-out infinite` : 'none';
  $: peerN = Math.min(peers, 6);
  $: peerArr = peerN > 0 ? Array.from({ length: peerN }, (_, i) => ({ a: (i / peerN) * Math.PI * 2, i })) : [];
  $: moteN = Math.min(interests, motes);
  $: moteArr = moteN > 0 ? Array.from({ length: moteN }, (_, i) => (i / moteN) * Math.PI * 2 + 0.5) : [];
  $: auraLo = dim ? 0.12 : 0.3;
  $: auraHi = dim ? 0.22 : (0.4 + vitality * 0.3);
</script>

<svg viewBox="0 0 100 100" width={size} height={size} class="lumen">
  <defs>
    <radialGradient id={grad} cx="42%" cy="36%" r="72%">
      <stop offset="0%" stop-color={`hsl(${baseHue} ${sat}% ${Math.min(94, lit + 42)}%)`} />
      <stop offset="48%" stop-color={`hsl(${baseHue} ${sat}% ${lit + 14}%)`} />
      <stop offset="100%" stop-color={`hsl(${hue2} ${sat + 8}% ${Math.max(24, lit - 8)}%)`} />
    </radialGradient>
    <radialGradient id={grad + '-a'} cx="50%" cy="50%" r="50%">
      <stop offset="55%" stop-color={`hsl(${baseHue} 80% 60%)`} stop-opacity="0" />
      <stop offset="100%" stop-color={`hsl(${baseHue} 85% 62%)`} stop-opacity="0.5" />
    </radialGradient>
  </defs>
  <circle cx="50" cy="50" r={auraR} fill={`url(#${grad}-a)`} class="aura"
    style="--aura-lo:{auraLo};--aura-hi:{auraHi};animation:{animate ? `cr-aura ${breathDur * 1.3}s ease-in-out infinite` : 'none'};opacity:{dim ? 0.2 : 0.5};" />
  {#if peerArr.length}
    <g class="orbit" style="animation:{animate ? `cr-orbit ${26 - reach * 8}s linear infinite` : 'none'};">
      {#each peerArr as p}
        <circle cx={50 + Math.cos(p.a) * (auraR + 4)} cy={50 + Math.sin(p.a) * (auraR + 4)} r={1.5 + (p.i % 2) * 0.6} fill={`hsl(${(hue2 + p.i * 24) % 360} 70% 72%)`} opacity="0.8" />
      {/each}
    </g>
  {/if}
  {#if moteArr.length}
    <g class="orbit" style="animation:{animate ? 'cr-orbit-r 18s linear infinite' : 'none'};opacity:{dim ? 0.2 : 0.55};">
      {#each moteArr as a}
        <circle cx={50 + Math.cos(a) * coreR * 0.6} cy={50 + Math.sin(a) * coreR * 0.6} r="1.1" fill="#fff" opacity="0.7" />
      {/each}
    </g>
  {/if}
  <g class="core" style="animation:{animate ? anim : 'none'};opacity:{dim ? 0.9 : 1};">
    <g style="animation:{animate ? wobAnim : 'none'};transform-box:fill-box;transform-origin:center;">
      <circle cx="50" cy="50" r={coreR} fill={`url(#${grad})`} />
      <ellipse cx={50 - coreR * 0.32} cy={50 - coreR * 0.4} rx={coreR * 0.34} ry={coreR * 0.22} fill="#fff" opacity={dim ? 0.18 : 0.4} />
      {#if face}
        <CreatureFace cx={50} cy={50} scale={coreR / 22} {expr} {awake} {sleepP} hue={baseHue} {animate} />
      {/if}
    </g>
  </g>
</svg>

<style>
  .lumen { display: block; overflow: visible; }
  .aura, .orbit, .core { transform-origin: 50% 50%; }
</style>

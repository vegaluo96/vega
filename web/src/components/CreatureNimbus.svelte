<script>
  // 形态二 · NIMBUS（云体·软生物·默认）：会呼吸抖动的软体 + 最丰富表情 + 成长环/同类光点/心愿火花/兴趣微光。
  import CreatureFace from './CreatureFace.svelte';
  export let genes, st, size = 64, animate = true, face = true;

  $: ({ baseHue, hue2, roundness } = genes);
  $: motes = genes.motes;
  $: ({ expr, awake, sleepP, vitality, arousal, maturity, peers, interests, aspirations, tension, attachment, joy, reaction } = st);
  $: sat = 60 + expr.warm * 26;
  $: lit = 56 + expr.bright * 14 - sleepP * 10;
  $: dim = expr.dim || sleepP > 0.6 || !awake;
  $: breathDur = awake ? (3.4 - arousal * 1.4) : 5;
  $: matScale = 0.84 + maturity * 0.22;
  $: ringDots = Math.round(maturity * 8);
  $: auraDur = attachment === '焦虑' ? breathDur * 0.7 : attachment === '回避' ? breathDur * 1.9 : breathDur * 1.3;
  $: auraReach = attachment === '回避' ? 0.82 : attachment === '焦虑' ? 1.12 : 1.0;
  $: bodyAnim = (() => {
    let a = `cr-blobwob ${(breathDur * 1.6) / (0.6 + maturity * 0.6)}s ease-in-out infinite, cr-breathe ${breathDur}s ease-in-out infinite`;
    if (reaction === 'respond') return `cr-pulse-once 0.7s ease 1, ${a}`;
    if (reaction === 'reach') return `cr-reach 1.4s ease-in-out infinite, cr-blobwob ${breathDur * 1.6}s ease-in-out infinite`;
    if (expr.bob && awake) return `cr-bob ${2.2 - arousal}s ease-in-out infinite, ${a}`;
    return a;
  })();
  $: wobAnim = (tension || expr.wobble) && awake ? `cr-wobble 3.2s ease-in-out infinite` : 'none';
  $: px = size;
  $: body = px * 0.72 * matScale;
  $: interestN = Math.min(interests, motes);
  $: wispC = `hsl(${hue2} ${sat}% ${Math.max(40, lit - 6)}%)`;
  $: ringArr = ringDots > 0 ? Array.from({ length: ringDots }, (_, i) => (i / ringDots) * Math.PI * 2) : [];
  $: peerN = Math.min(peers, 6);
  $: peerArr = peerN > 0 ? Array.from({ length: peerN }, (_, i) => (i / peerN) * Math.PI * 2) : [];
  $: aspArr = (aspirations > 0 && !dim) ? Array.from({ length: Math.min(aspirations, 3) }, (_, i) => i) : [];
  $: moteArr = interestN > 0 ? Array.from({ length: interestN }, (_, i) => (i / interestN) * Math.PI * 2 + 0.6) : [];
  const JOY = [[16, 22], [82, 30], [24, 74], [78, 70], [50, 12]];
  $: bodyRadius = roundness > 0.8 ? '54% 46% 58% 42% / 56% 54% 46% 44%' : '46% 54% 50% 50% / 50% 50% 50% 50%';
  $: bodyBg = `radial-gradient(circle at 38% 30%, hsl(${baseHue} ${sat}% ${Math.min(93, lit + 28)}%) 0%, hsl(${baseHue} ${sat}% ${lit}%) 46%, hsl(${hue2} ${sat + 6}% ${Math.max(34, lit - 14)}%) 100%)`;
  $: bodyShadow = `0 6px 20px hsl(${hue2} 60% 30% / 0.42), inset -5px -7px 14px hsl(${hue2} 60% 30% / 0.32), inset 4px 5px 12px rgba(255,255,255,0.4)`;
  $: auraBg = `radial-gradient(circle, hsl(${baseHue} 85% 64% / ${dim ? 0.16 : 0.26 + vitality * 0.22}) 0%, transparent 66%)`;
  $: auraSize = px * (0.9 + vitality * 0.14) * auraReach;
</script>

<div class="nimbus" style="width:{px}px;height:{px}px;">
  <div class="aura" style="width:{auraSize}px;height:{auraSize}px;background:{auraBg};animation:{animate ? `cr-aura ${auraDur}s ease-in-out infinite` : 'none'};"></div>

  {#if ringArr.length}
    <div class="ring" style="width:{px * 0.92}px;height:{px * 0.92}px;animation:{animate ? `cr-orbit ${40 - maturity * 10}s linear infinite` : 'none'};">
      {#each ringArr as a}
        <span class="dot" style="left:{50 + Math.cos(a) * 50}%;top:{50 + Math.sin(a) * 50}%;background:hsl({baseHue} 50% {dim ? 55 : 78}%);opacity:{dim ? 0.3 : 0.7};"></span>
      {/each}
    </div>
  {/if}

  {#if peerArr.length && animate}
    <div class="orbit" style="animation:cr-orbit 24s linear infinite;">
      {#each peerArr as a, i}
        <span class="peer" style="left:{50 + Math.cos(a) * 47}%;top:{50 + Math.sin(a) * 47}%;background:hsl({(hue2 + i * 26) % 360} 72% 72%);box-shadow:0 0 5px hsl({(hue2 + i * 26) % 360} 80% 70%);"></span>
      {/each}
    </div>
  {/if}

  {#if aspArr.length && animate}
    <div class="orbit">
      {#each aspArr as i}
        <span class="asp" style="left:{38 + i * 13}%;background:hsl({baseHue} 90% 80%);box-shadow:0 0 4px hsl({baseHue} 90% 78%);animation:cr-z {3.4 + i * 0.6}s ease-in-out {i * 0.8}s infinite;"></span>
      {/each}
    </div>
  {/if}

  {#if joy && animate && !dim}
    <div class="joy">
      {#each JOY as [x, y], i}
        <span class="twinkle" style="left:{x}%;top:{y}%;color:hsl({(baseHue + 20) % 360} 90% 76%);animation:cr-twinkle {2.4 + i * 0.5}s ease-in-out {i * 0.4}s infinite;">
          <svg viewBox="0 0 10 10" width="5" height="5"><path d="M5 0 Q5.6 4.4 10 5 Q5.6 5.6 5 10 Q4.4 5.6 0 5 Q4.4 4.4 5 0Z" fill="currentColor" /></svg>
        </span>
      {/each}
    </div>
  {/if}

  <div class="bodywrap" style="width:{body}px;height:{body}px;animation:{animate ? bodyAnim : 'none'};">
    <div class="wisp" style="width:{body * 0.26}px;height:{body * 0.34}px;margin-left:{-(body * 0.13)}px;background:linear-gradient({wispC}, transparent);opacity:{dim ? 0.4 : 0.7};animation:{animate && awake ? `cr-sway ${breathDur * 1.4}s ease-in-out infinite` : 'none'};"></div>
    <div class="body" style="border-radius:{bodyRadius};background:{bodyBg};box-shadow:{bodyShadow};animation:{animate ? wobAnim : 'none'};"></div>
    <div class="hl" style="opacity:{dim ? 0.3 : 0.7};"></div>
    {#if moteArr.length && animate}
      <div class="motes">
        {#each moteArr as a}
          <span class="mote" style="left:{50 + Math.cos(a) * 38}%;top:{50 + Math.sin(a) * 30}%;"></span>
        {/each}
      </div>
    {/if}
    {#if face}
      <svg viewBox="0 0 100 100" width={body} height={body} class="faceLayer" style="animation:{animate ? wobAnim : 'none'};">
        <CreatureFace cx={50} cy={53} scale={1.5} {expr} {awake} {sleepP} hue={baseHue} {animate} />
      </svg>
    {/if}
  </div>
</div>

<style>
  .nimbus { position: relative; display: grid; place-items: center; }
  .aura, .ring, .orbit, .joy { position: absolute; }
  .aura { border-radius: 50%; }
  .ring { } .ring .dot { position: absolute; width: 2.5px; height: 2.5px; border-radius: 50%; transform: translate(-50%, -50%); }
  .orbit { inset: 0; pointer-events: none; }
  .orbit .peer { position: absolute; width: 4.5px; height: 4.5px; border-radius: 50%; transform: translate(-50%, -50%); }
  .orbit .asp { position: absolute; bottom: 24%; width: 3px; height: 3px; border-radius: 50%; }
  .joy { inset: -4%; pointer-events: none; }
  .twinkle { position: absolute; width: 5px; height: 5px; }
  .bodywrap { position: relative; transform-origin: 50% 56%; }
  .wisp { position: absolute; left: 50%; bottom: -14%; border-radius: 50% 50% 46% 54% / 38% 38% 62% 62%; transform-origin: 50% 0%; }
  .body { position: absolute; inset: 0; }
  .hl { position: absolute; left: 24%; top: 18%; width: 30%; height: 22%; border-radius: 50%; background: radial-gradient(circle, rgba(255,255,255,0.7), transparent 70%); }
  .motes { position: absolute; inset: 14%; animation: cr-orbit-r 16s linear infinite; }
  .mote { position: absolute; width: 3px; height: 3px; border-radius: 50%; background: #fff; opacity: 0.7; transform: translate(-50%, -50%); }
  .faceLayer { position: absolute; inset: 0; overflow: visible; }
</style>

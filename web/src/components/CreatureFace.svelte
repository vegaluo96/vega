<script>
  // 会眨眼/会表情的脸（三种形态共用）：眼/眉/嘴/腮红/「z」，全由 expr + 状态确定性派生。
  export let cx = 50, cy = 48, scale = 1, expr, awake = true, sleepP = 0, hue = 220, animate = true;

  $: eyeC = `hsl(${hue} 32% 16%)`;
  $: cheekC = `hsl(${(hue + 10) % 360} 80% 66%)`;
  $: dx = 11 * scale;
  $: ey = cy;
  $: r = 5.6 * scale;
  $: sleepy = !awake || sleepP > 0.78;
  $: half = awake && sleepP > 0.5 && sleepP <= 0.78;
  $: brow = (expr && expr.brow) || 0;
  $: blink = animate && awake && !sleepy;
  $: blinkDur = 5 + (expr && expr.wobble ? 0 : 2);
  $: ry = half ? r * 0.4 : (expr.eye === 'wide' ? r * 1.2 : expr.eye === 'narrow' ? r * 0.62 : expr.eye === 'low' ? r * 0.82 : r);
  $: rx = expr.eye === 'narrow' ? r * 0.78 : r * 0.86;
  $: mw = 8.4 * scale;
  $: my = cy + 13 * scale;
  $: mc = my + expr.mouth * 8 * scale; // 正=控制点下沉→∪ 微笑；负=∩ 沮丧
  $: eyes = [cx - dx, cx + dx];
  $: brows = [{ x: cx - dx, side: -1 }, { x: cx + dx, side: 1 }];
  function browPath(x, side) {
    const by = ey - r - 3.2 * scale, bw = r * 1.0, tilt = brow * 2.6 * scale;
    const inX = side < 0 ? x + bw : x - bw, outX = side < 0 ? x - bw : x + bw;
    return `M ${outX} ${by} Q ${x} ${by - Math.abs(tilt) * 0.3} ${inX} ${by - tilt}`;
  }
</script>

<g>
  {#if expr.cheek && awake && !sleepy}
    <ellipse cx={cx - dx - r * 0.4} cy={ey + r + 2 * scale} rx={3.2 * scale} ry={2.1 * scale} fill={cheekC} opacity="0.42" />
    <ellipse cx={cx + dx + r * 0.4} cy={ey + r + 2 * scale} rx={3.2 * scale} ry={2.1 * scale} fill={cheekC} opacity="0.42" />
  {/if}

  {#if !sleepy && brow !== 0}
    {#each brows as b}
      <path d={browPath(b.x, b.side)} stroke={eyeC} stroke-width={1.7 * scale} fill="none" stroke-linecap="round" />
    {/each}
  {/if}

  {#each eyes as x}
    {#if sleepy}
      <path d={`M ${x - r} ${ey} Q ${x} ${ey + r} ${x + r} ${ey}`} stroke={eyeC} stroke-width={1.8 * scale} fill="none" stroke-linecap="round" />
    {:else if expr.eye === 'arc'}
      <path d={`M ${x - r} ${ey + 1.4} Q ${x} ${ey - r * 1.1} ${x + r} ${ey + 1.4}`} stroke={eyeC} stroke-width={2.1 * scale} fill="none" stroke-linecap="round" />
    {:else if expr.eye === 'droop'}
      <path d={`M ${x - r} ${ey - 0.6} Q ${x} ${ey + r * 0.6} ${x + r} ${ey - 0.6}`} stroke={eyeC} stroke-width={1.9 * scale} fill="none" stroke-linecap="round" />
    {:else}
      <g class="eye" class:blink style="--bd:{blinkDur}s">
        <ellipse cx={x} cy={ey} {rx} {ry} fill={eyeC} />
      </g>
      {#if !half}
        <circle cx={x - rx * 0.32} cy={ey - ry * 0.34} r={rx * 0.3} fill="#fff" opacity="0.85" />
      {/if}
    {/if}
  {/each}

  {#if !sleepy}
    <path d={`M ${cx - mw} ${my} Q ${cx} ${mc} ${cx + mw} ${my}`} stroke={eyeC} stroke-width={2 * scale} fill="none" stroke-linecap="round" />
  {:else}
    <text x={cx + 15 * scale} y={cy - 9 * scale} font-size={10 * scale} fill={eyeC} opacity="0.6" class:zfloat={animate}>z</text>
  {/if}
</g>

<style>
  .eye { transform-box: fill-box; transform-origin: center; }
  .eye.blink { animation: cr-blink var(--bd) ease-in-out infinite; }
  .zfloat { animation: cr-z 3.4s ease-in-out infinite; }
</style>

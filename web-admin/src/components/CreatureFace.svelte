<script>
  // 会眨眼/会表情的脸（三种形态共用）：眼/眉/嘴/腮红/「z」+ 眼神游移 + 张嘴笑 + 情绪微粒（汗珠/泪滴/月牙），
  // 全由 expr + 状态确定性派生。
  export let cx = 50, cy = 48, scale = 1, expr, awake = true, sleepP = 0, hue = 220, animate = true;

  $: eyeC = `hsl(${hue} 32% 16%)`;
  $: cheekC = `hsl(${(hue + 10) % 360} 80% 66%)`;
  $: tongueC = `hsl(${(hue + 12) % 360} 75% 70%)`;
  $: dx = 11 * scale;
  $: ey = cy;
  $: r = 5.6 * scale;
  $: sleepy = !awake || sleepP > 0.78;
  $: half = awake && sleepP > 0.5 && sleepP <= 0.78;
  $: brow = (expr && expr.brow) || 0;
  $: blink = animate && awake && !sleepy;
  $: blinkDur = 5 + (expr && expr.wobble ? 0 : 2);
  $: glance = animate && awake && !sleepy; // 醒着时左右看看
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

  <g class="glanceWrap" class:glance>
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
  </g>

  <!-- 嘴：开心到张嘴笑（带小舌）；其余用曲线 -->
  {#if !sleepy && expr.open}
    <path d={`M ${cx - mw * 0.9} ${my - 1.5 * scale} Q ${cx} ${my + 9 * scale} ${cx + mw * 0.9} ${my - 1.5 * scale} Q ${cx} ${my + 1.5 * scale} ${cx - mw * 0.9} ${my - 1.5 * scale} Z`} fill={eyeC} />
    <path d={`M ${cx - mw * 0.4} ${my + 2.6 * scale} Q ${cx} ${my + 6.2 * scale} ${cx + mw * 0.4} ${my + 2.6 * scale} Q ${cx} ${my + 4.6 * scale} ${cx - mw * 0.4} ${my + 2.6 * scale} Z`} fill={tongueC} />
  {:else if !sleepy}
    <path d={`M ${cx - mw} ${my} Q ${cx} ${mc} ${cx + mw} ${my}`} stroke={eyeC} stroke-width={2 * scale} fill="none" stroke-linecap="round" />
  {:else}
    <text x={cx + 15 * scale} y={cy - 9 * scale} font-size={10 * scale} fill={eyeC} opacity="0.6" class:zfloat={animate}>z</text>
  {/if}

  <!-- 情绪微粒：焦虑→颞角汗珠；难过→眼角泪滴；想念→头顶小月牙 -->
  {#if expr.wobble && awake && !sleepy}
    <path class="sweat" class:anim={animate} d={`M ${cx + dx + r * 1.5} ${ey - r * 1.6} q ${1.8 * scale} ${2.6 * scale} 0 ${4.2 * scale} q ${-1.8 * scale} ${-1.6 * scale} 0 ${-4.2 * scale} Z`} fill="hsl(205 85% 74%)" opacity="0.85" />
  {/if}
  {#if expr.tear && awake && !sleepy}
    <circle class="teardrop" class:anim={animate} cx={cx - dx - r * 0.9} cy={ey + r * 1.3} r={1.6 * scale} fill="hsl(205 85% 76%)" opacity="0.8" />
  {/if}
  {#if expr.miss && awake && !sleepy}
    <path class="crescent" class:anim={animate} d={`M ${cx + dx * 1.7} ${cy - r * 3.6} a ${3.4 * scale} ${3.4 * scale} 0 1 0 ${2.6 * scale} ${5.4 * scale} a ${2.6 * scale} ${2.6 * scale} 0 1 1 ${-2.6 * scale} ${-5.4 * scale} Z`} fill="hsl(48 90% 76%)" opacity="0.75" />
  {/if}
</g>

<style>
  .eye { transform-box: fill-box; transform-origin: center; }
  .eye.blink { animation: cr-blink var(--bd) ease-in-out infinite; }
  .glanceWrap { transform-box: fill-box; transform-origin: center; }
  .glanceWrap.glance { animation: cr-glance 7.5s ease-in-out infinite; }
  .sweat.anim { animation: cr-tear 2.8s ease-in-out infinite; }
  .teardrop.anim { animation: cr-tear 3.6s ease-in-out infinite; }
  .crescent.anim { animation: cr-z 4.6s ease-in-out infinite; }
  .zfloat { animation: cr-z 3.4s ease-in-out infinite; }
</style>

<script>
  // 生命状态小立牌：醒/睡 + 此刻心情（脱敏）。
  export let life;
  export let showPhase = true;
  $: awake = life && life.awake !== false;
</script>

<span class="pill">
  <span class="dot" class:awake></span>
  <span class="txt">{awake ? `${life.emotion || '醒着'}${showPhase && life.dayPhase ? ' · ' + life.dayPhase : ''}` : '休眠'}</span>
</span>

<style>
  .pill { display: inline-flex; align-items: center; gap: 7px; font-size: var(--fs-sm); color: var(--muted); line-height: 1; }
  .dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--life-asleep); }
  .dot.awake { background: var(--life-awake); box-shadow: 0 0 0 3px color-mix(in srgb, var(--life-awake) 20%, transparent); }
  .txt { white-space: nowrap; }
</style>

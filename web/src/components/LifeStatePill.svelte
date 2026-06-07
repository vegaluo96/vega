<script>
  // 统一的生命状态标签：醒/睡 + dayPhase + 此刻心情。只读现有字段，不造新字段。
  export let awake = false;
  export let dayPhase = '';
  export let emotion = '';
  export let asleepText = '休眠';
</script>

<span class="pill" class:asleep={!awake}>
  <span class="d"></span>
  {#if awake}<span class="tx">{emotion || '醒着'}{dayPhase ? ' · ' + dayPhase : ''}</span>{:else}<span class="tx">{asleepText}</span>{/if}
</span>

<style>
  .pill { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--muted); line-height: 1; }
  .d { width: 7px; height: 7px; border-radius: var(--r-pill); background: var(--life-awake); box-shadow: 0 0 0 3px color-mix(in srgb, var(--life-awake) 20%, transparent); flex: none; }
  .asleep .d { background: var(--life-asleep); box-shadow: none; }
  .tx { white-space: nowrap; }
</style>

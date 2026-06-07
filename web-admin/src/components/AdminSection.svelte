<script>
  // 观测台分区：标题 + 副标题 + 可选动作 + 内容插槽。
  export let title = '';
  export let subtitle = '';
</script>

<section class="asec">
  <div class="ahead">
    <h2>{title}</h2>
    {#if subtitle}<span class="asub">{subtitle}</span>{/if}
    <span class="spacer"></span>
    {#if $$slots.action}<slot name="action" />{/if}
  </div>
  <slot />
</section>

<style>
  .asec { margin-bottom: 22px; }
  .ahead { display: flex; align-items: baseline; gap: 10px; margin-bottom: 12px; }
  .ahead h2 { font-size: 14px; font-weight: 700; margin: 0; letter-spacing: 0.01em; }
  .asub { font-size: 12px; color: var(--faint-c); }
</style>

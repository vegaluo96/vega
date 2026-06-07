<script>
  // 统一页头：标题 + 副标题 + 可选右侧动作。
  export let title = '';
  export let subtitle = '';
</script>

<header class="ph fade-in">
  <div class="tt">
    <h1 class="page-title">{title}</h1>
    {#if subtitle}<p class="sub">{subtitle}</p>{/if}
  </div>
  {#if $$slots.action}<div class="act"><slot name="action" /></div>{/if}
</header>

<style>
  .ph { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--s4); padding: 20px 0 16px; }
  .sub { margin: 6px 0 0; color: var(--muted); font-size: 13.5px; line-height: 1.5; }
  .act { flex: none; padding-bottom: 2px; }
</style>

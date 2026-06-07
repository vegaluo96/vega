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
  .ph { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--s4); padding: var(--s6) 0 var(--s4); }
  .sub { margin: 7px 0 0; color: var(--muted); font-size: 14px; line-height: 1.55; }
  .act { flex: none; padding-bottom: 2px; }
</style>

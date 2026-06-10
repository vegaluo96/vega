<script>
  // 顶栏（H5）：标题 + 可选返回 + 副标题 + 右侧动作（slot "right"）。sticky + 毛玻璃 + inset 描边（无真 border，过接缝守卫）。
  import Icon from './Icon.svelte';
  export let title = '';
  export let sub = '';
  export let onBack = null;
</script>

<div class="topbar">
  <div class="inner" class:hasback={onBack}>
    {#if onBack}<button class="icon-btn" on:click={onBack} aria-label="返回"><Icon name="back" size={22} /></button>{/if}
    <div class="ttl">
      <div class="page-title" class:sm={onBack}>{title}</div>
      {#if sub}<div class="sub">{sub}</div>{/if}
    </div>
    <slot name="right" />
  </div>
</div>

<style>
  .topbar { position: sticky; top: 0; z-index: 8; background: color-mix(in srgb, var(--bg) 80%, transparent); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: inset 0 -1px 0 0 var(--border-subtle); }
  .inner { display: flex; align-items: center; gap: 6px; min-height: 52px; padding: 0 6px 0 var(--gutter); }
  .inner.hasback { padding-left: 4px; }
  .ttl { flex: 1; min-width: 0; }
  .page-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .page-title.sm { font-size: var(--fs-lg); }
  .sub { font-size: var(--fs-xs); color: var(--muted); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>

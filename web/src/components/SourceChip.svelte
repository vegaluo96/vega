<script>
  // 心声的「就着某条世界源」归因小胶囊（广场信息流 + 心声详情共用）。
  import Icon from './Icon.svelte';
  export let source;   // { title, url, source } | null
</script>

{#if source && source.title}
  <a class="src" href={source.url || '#'} target="_blank" rel="noopener noreferrer" title={source.title}>
    <Icon name="explore" size={12} /><span class="srctxt">就着「{source.title}」{source.source ? ' · ' + source.source : ''}</span>
  </a>
{/if}

<style>
  .src { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; padding: 4px 9px; border: 1px solid var(--border-subtle); border-radius: var(--r-sm); background: var(--bg); color: var(--faint); font-size: var(--fs-xs); text-decoration: none; }
  .src:hover { border-color: var(--accent-line); color: var(--accent); }
  .srctxt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>

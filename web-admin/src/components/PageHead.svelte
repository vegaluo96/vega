<script>
  // 视图页头（= 原型 AHead）：标题 + 一句话语境，右侧放主动作。
  export let title = '';
  export let sub = '';
</script>

<div class="head">
  <div class="tx">
    <h1 class="page-title">{title}</h1>
    {#if sub}<div class="caption sub">{sub}</div>{/if}
  </div>
  {#if $$slots.right}<div class="right"><slot name="right" /></div>{/if}
</div>

<style>
  .head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; padding: 28px 0 20px; }
  .tx { min-width: 0; }
  .sub { margin-top: 6px; max-width: 720px; text-wrap: pretty; }
  .right { flex: none; }
</style>

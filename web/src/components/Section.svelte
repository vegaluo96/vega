<script>
  // 区段：标题 + 右侧动作（slot "right"）+ 内容（默认 slot）。
  export let title = '';
</script>

<section class="sec">
  {#if title || $$slots.right}
    <div class="head"><h2 class="section-title">{title}</h2><slot name="right" /></div>
  {/if}
  <slot />
</section>

<style>
  .sec { margin-top: var(--s6); }
  .head { display: flex; align-items: baseline; justify-content: space-between; margin: 0 2px 12px; }
</style>

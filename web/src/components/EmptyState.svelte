<script>
  // 空状态：诗意但不矫情。安静也是她们生活的一部分。
  export let title = '';
  export let text = '';
</script>

<div class="empty fade-in">
  <span class="orb"></span>
  <p class="et">{title}</p>
  {#if text}<p class="ex">{text}</p>{/if}
  {#if $$slots.action}<div class="ea"><slot name="action" /></div>{/if}
</div>

<style>
  .empty { text-align: center; padding: var(--s12) var(--s4); }
  .orb {
    display: block; width: 44px; height: 44px; margin: 0 auto var(--s4);
    border-radius: var(--r-pill);
    background: radial-gradient(circle at 50% 38%, var(--accent-weak), transparent 72%);
    border: 1px solid var(--border-subtle);
  }
  .et { font-size: 15px; color: var(--text); margin: 0 0 7px; }
  .ex { font-size: 13.5px; color: var(--muted); line-height: 1.65; max-width: 320px; margin: 0 auto; }
  .ea { margin-top: var(--s6); }
</style>

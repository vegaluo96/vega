<script>
  // "你们之间"——把对话页顶部的关系信息独立成一块。纯展示，绑定动作经默认插槽传入。
  export let rel;
  export let relAge = '';
</script>

<div class="rp fade-in">
  <div class="rline"><span class="k">你们</span><span class="v">{relAge}</span></div>
  <div class="rline"><span class="k">她对你</span><span class="v">{rel.attachment}</span></div>
  {#if rel.understanding}<div class="rline"><span class="k">她的理解</span><span class="v u">{rel.understanding}</span></div>{/if}
  <slot />
</div>

<style>
  .rp { padding: var(--s3); background: var(--surface-2); border: 1px solid var(--border-subtle); border-radius: var(--r-md); display: flex; flex-direction: column; gap: 1px; }
  .rline { display: flex; gap: var(--s3); padding: 9px 10px; font-size: 13.5px; align-items: baseline; }
  .rline .k { color: var(--faint); flex: none; width: 58px; font-size: 12.5px; }
  .rline .v { color: var(--text); }
  .rline .v.u { color: var(--muted); line-height: 1.55; }
</style>

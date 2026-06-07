<script>
  // "你们之间"——把对话页顶部的关系信息独立成一块。纯展示，绑定动作经默认插槽传入。
  // 内心活动只露一层：此刻感受 + 心里的拉扯（克制、且只属于这段关系），不堆内部变量。
  export let rel;
  export let relAge = '';
  export let feeling = '';
  export let tension = '';
</script>

<div class="rp fade-in">
  {#if feeling}<div class="rline"><span class="k">她此刻</span><span class="v">{feeling}</span></div>{/if}
  {#if tension}<div class="rline"><span class="k">心里</span><span class="v u">有点拉扯：{tension}</span></div>{/if}
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

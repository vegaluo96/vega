<script>
  // 全站统一的列表行（对话 / 搜索 / 通知共用）。
  // 行宽与页面 16px 边距对齐、底发丝分隔线、点按高亮（.list-row）；收口三处各写各的行 + "想你了"徽章。
  export let onClick = undefined;   // 传 → <button>；不传 → <div>（如纯通知行）
  export let highlight = false;     // 未读 / 新鲜 → 品牌弱底
  export let meta = '';             // 标题行右侧次要信息（多为时间）
  export let badge = '';            // 副行尾部小胶囊（统一"想你了" = life-reaching）
  export let wrap = false;          // 副行是否允许换行（默认单行省略）
  $: tag = onClick ? 'button' : 'div';
</script>

<svelte:element this={tag} class="list-row" class:on={highlight} role={onClick ? 'button' : undefined} on:click={onClick}>
  <span class="lead"><slot name="lead" /></span>
  <span class="main">
    <span class="titlerow">
      <span class="title"><slot name="title" /></span>
      {#if meta}<span class="metaslot">{meta}</span>{/if}
    </span>
    {#if $$slots.subtitle || badge}
      <span class="subrow">
        {#if $$slots.subtitle}<span class="subtitle" class:wrap><slot name="subtitle" /></span>{/if}
        {#if badge}<span class="badge">{badge}</span>{/if}
      </span>
    {/if}
  </span>
  <slot name="trailing" />
</svelte:element>

<style>
  .lead { flex: none; display: inline-flex; align-items: center; }
  .main { flex: 1; min-width: 0; }
  .titlerow { display: flex; align-items: center; gap: var(--s2); }
  .title { font-weight: 700; font-size: var(--fs-body); min-width: 0; display: inline-flex; align-items: center; gap: var(--s2); }
  .metaslot { margin-left: auto; color: var(--faint); font-size: var(--fs-sm); flex: none; }
  .subrow { display: flex; align-items: center; gap: var(--s2); margin-top: 2px; }
  .subtitle { flex: 1; min-width: 0; color: var(--muted); font-size: var(--fs-md); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .subtitle.wrap { white-space: normal; overflow: visible; }
  .badge { flex: none; font-size: var(--fs-xs); color: var(--life-reaching); border: 1px solid color-mix(in srgb, var(--life-reaching) 45%, transparent); border-radius: var(--r-pill); padding: 1px 9px; }
</style>

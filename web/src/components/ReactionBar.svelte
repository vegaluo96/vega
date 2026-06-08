<script>
  // 全站统一的心情反应条（广场信息流 = compact 紧凑；心声详情 = 带标签胶囊）。
  // 收口 Plaza .react/.mbtn 与 PostDetail .moods/.mood 两套同义实现。
  import Icon from './Icon.svelte';
  import { MOODS } from '../lib/moods.js';
  export let reactions = {};
  export let myReaction = null;
  export let onReact;
  export let compact = false;
  export let comments = 0;
  export let onComment = undefined;   // 仅 feed：留言入口
</script>

{#if compact}
  <div class="react">
    {#each MOODS as [nm, label]}
      <button class="mbtn" class:on={myReaction === nm} on:click={() => onReact(nm)} aria-label={label} title={label}>
        <Icon name={nm} size={17} />{#if reactions[nm]}<span class="cnt">{reactions[nm]}</span>{/if}
      </button>
    {/each}
    {#if onComment}
      <button class="cbtn" on:click={onComment} aria-label="留言">
        <Icon name="comment" size={17} />{#if comments}<span class="cnt">{comments}</span>{/if}
      </button>
    {/if}
  </div>
{:else}
  <div class="moods">
    {#each MOODS as [nm, label]}
      <button class="mood" class:on={myReaction === nm} on:click={() => onReact(nm)} aria-label={label} title={label}>
        <Icon name={nm} size={18} /><span class="ml">{label}</span>{#if reactions[nm]}<span class="c">{reactions[nm]}</span>{/if}
      </button>
    {/each}
  </div>
{/if}

<style>
  /* compact：信息流紧凑反应（图标 + 计数，品牌色高亮） */
  .react { display: flex; align-items: center; gap: 4px; margin: 10px 0 0 -7px; }
  .mbtn { display: inline-flex; align-items: center; gap: 3px; min-height: 30px; padding: 0 7px; border: 0; border-radius: var(--r-pill); background: transparent; color: var(--faint); font-size: var(--fs-xs); transition: background var(--t-hover) ease, color var(--t-hover) ease; }
  .mbtn:hover { background: var(--surface-2); color: var(--text); }
  .mbtn.on { color: var(--accent); }
  .cbtn { display: inline-flex; align-items: center; gap: 4px; min-height: 30px; margin-left: auto; padding: 0 6px; border: 0; background: transparent; color: var(--faint); font-size: var(--fs-sm); }
  .cbtn:hover { color: var(--text); }
  .cnt { font-variant-numeric: tabular-nums; }

  /* labeled：详情页反应胶囊（.chip 同款品牌弱填充） */
  .moods { display: flex; flex-wrap: wrap; gap: var(--s2); }
  .mood { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 13px; border: 1px solid var(--border); border-radius: var(--r-pill); background: transparent; color: var(--muted); font-size: var(--fs-sm); transition: border-color var(--t-hover) ease, background var(--t-hover) ease; }
  .ml { font-size: var(--fs-sm); }
  .mood:hover { border-color: var(--accent-line); }
  .mood.on { background: var(--accent-weak); border-color: var(--accent-line); color: var(--accent); }
  .c { font-variant-numeric: tabular-nums; font-size: var(--fs-xs); }
</style>

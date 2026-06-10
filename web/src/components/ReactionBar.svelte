<script>
  // 心情共鸣条（spark/heart/smile/flame/moon，纯描边图标）+ 评论数。点共鸣 → FX 上浮 + 按钮回弹。
  import Icon from './Icon.svelte';
  import { MOODS } from '../lib/moods.js';
  import { FX } from '../lib/fx.js';
  export let reactions = {};
  export let myReaction = null;
  export let comments = 0;
  export let onReact = null;
  export let onComment = null;
  let open = false;
  $: total = Object.values(reactions).reduce((a, b) => a + b, 0);
  $: mineLabel = myReaction && MOODS.find(([k]) => k === myReaction) ? myReaction : null;
  function pick(e, k) { FX.floatIcon(e.currentTarget, k); onReact && onReact(k); open = false; }
  function toggle(e) { open = !open; FX.bounce(e.currentTarget); }
</script>

<div class="rb">
  <button class="act" class:mine={mineLabel} on:click={toggle}>
    <Icon name={mineLabel || 'spark'} size={18} />
    {#if total > 0}<span class="mono">{total}</span>{/if}
  </button>
  {#if onComment}
    <button class="act" on:click={onComment}><Icon name="comment" size={18} />{#if comments > 0}<span class="mono">{comments}</span>{/if}</button>
  {/if}
  {#if open}
    <div class="pop fade-in">
      {#each MOODS as [k, lbl]}
        <button class="opt" class:on={myReaction === k} title={lbl} on:click={(e) => pick(e, k)}><Icon name={k} size={20} /></button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .rb { display: flex; align-items: center; gap: 14px; margin-top: 10px; position: relative; }
  .act { display: inline-flex; align-items: center; gap: 6px; color: var(--faint); font-size: var(--fs-sm); }
  .act.mine { color: var(--life-reaching); }
  .pop { position: absolute; bottom: 120%; left: 0; z-index: 20; display: flex; gap: 4px; padding: 6px; background: var(--surface); border-radius: var(--r-pill); box-shadow: var(--shadow-md); }
  .opt { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; color: var(--muted); }
  .opt.on { color: var(--life-reaching); background: var(--surface-2); }
</style>

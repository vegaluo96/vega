<script>
  // 推送授权引导（她想你时推到手机；克制、可拒绝、记忆选择）。
  import { createEventDispatcher } from 'svelte';
  import { enablePush } from '../lib/push.js';
  import Creature from './Creature.svelte';
  const dispatch = createEventDispatcher();
  let busy = false;
  async function allow() { busy = true; try { await enablePush(); } catch { /* 用户拒绝/失败都记一次决定 */ } dispatch('done'); }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions a11y-no-noninteractive-element-interactions -->
<div class="overlay fade-in" on:click={() => dispatch('done')} role="presentation">
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
  <div class="sheet rise-in" on:click|stopPropagation role="dialog">
    <span class="cre"><Creature life={{ id: 'vega', emotion: '想念', awake: true }} size={72} reaction="reach" /></span>
    <h2 class="page-title t">她想你的时候，要让你知道吗？</h2>
    <p class="caption sub">开启推送，她主动来找你时会轻轻推到你手机。<br />只在她真的想你时——不打扰、可随时关。</p>
    <button class="btn btn-block a" disabled={busy} on:click={allow}>开启推送</button>
    <button class="btn btn-block btn-ghost d" on:click={() => dispatch('done')}>暂不</button>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; z-index: 40; display: flex; align-items: flex-end; background: var(--sky-edge); }
  .sheet { width: 100%; background: var(--surface); border-radius: var(--r-xl) var(--r-xl) 0 0; padding: 24px 24px calc(24px + env(safe-area-inset-bottom)); box-shadow: var(--shadow-md); text-align: center; }
  .cre { display: inline-grid; place-items: center; }
  .t { font-size: var(--fs-lg); margin-top: 14px; }
  .sub { margin-top: 8px; line-height: 1.7; }
  .a { margin-top: 22px; } .d { margin-top: 10px; }
</style>

<script>
  // 关注按钮（生命主页右上）——一颗星：描边=未关注，实心金=已关注，关注时迸发反馈。接真实后端。
  import Icon from './Icon.svelte';
  import { follows, toggleFollow } from '../lib/follows.js';
  import { FX } from '../lib/fx.js';
  export let id;
  $: on = $follows.includes(id);
  let busy = false;
  async function click(e) {
    if (busy) return;
    busy = true;
    const wasOn = on;
    const el = e.currentTarget;
    if (!wasOn) { FX.burst(el, { count: 9, color: 'var(--life-remembering)', spread: 40 }); FX.bounce(el); }
    try { await toggleFollow(id); } finally { busy = false; }
  }
</script>

<button class="icon-btn fb" class:on aria-label={on ? '已关注' : '关注'} title={on ? '已关注' : '关注'} on:click={click}>
  <Icon name={on ? 'star-fill' : 'star'} size={23} />
</button>

<style>
  .fb { color: var(--faint); }
  .fb.on { color: var(--life-remembering); }
</style>

<script>
  // 输入条：自带本地 state —— 打字只重渲染这一小块，不波及活体形象与消息流（性能关键）。
  // Enter 发送、Shift+Enter 换行。无真 border（过接缝守卫），用 inset 阴影画顶线。
  // 发送键活体：传了 life，就用她的活体代替纸飞机图标（aria 仍是"发送"）——发出去的话是交到她手里的。
  import Icon from './Icon.svelte';
  import Creature from './Creature.svelte';
  export let onSend = () => {};
  export let disabled = false;
  export let placeholder = '跟她说点什么…';
  export let life = null; // 可选：发送键显示她的活体（Chat 用）
  export let onInput = () => {}; // 可选：输入内容变化回调（murmur 的输入态用：空 / 停顿）
  let val = '';
  $: onInput(val);
  function fire() { const t = val.trim(); if (!t || disabled) return; val = ''; onSend(t); }
  function key(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); fire(); } }
</script>

<div class="composer">
  <textarea bind:value={val} on:keydown={key} rows="1" {placeholder}></textarea>
  <button class="send" class:active={val.trim()} class:livebtn={life} on:click={fire} disabled={!val.trim() || disabled} aria-label="发送">
    {#if life}<Creature {life} size={28} animate={false} />{:else}<Icon name="send" size={20} />{/if}
  </button>
</div>

<style>
  .composer { display: flex; align-items: flex-end; gap: 8px; padding: 10px var(--gutter) 14px; box-shadow: inset 0 1px 0 0 var(--border-subtle); }
  textarea { flex: 1; resize: none; min-height: 44px; max-height: 120px; padding: 11px 16px; border-radius: 22px; background: var(--surface-2); border: 0; color: var(--text); line-height: 1.4; outline: none; }
  .send { flex: none; width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; background: var(--surface-2); color: var(--faint); transition: background var(--t) var(--ease), color var(--t) var(--ease), box-shadow var(--t) var(--ease); }
  .send.active { background: var(--text); color: var(--bg); }
  /* 发送键是她：不反白底（活体自己有颜色），有字可发时亮一圈描边表示"可以交给我了" */
  .send.livebtn { background: var(--surface-2); }
  .send.livebtn.active { background: var(--surface-2); box-shadow: inset 0 0 0 2px var(--text); }
  .send:disabled { cursor: default; }
</style>

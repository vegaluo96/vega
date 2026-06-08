<script>
  // 全站统一的底部输入条（对话 / 心声详情共用），基于 .input/.btn 令牌。
  // 父组件用 <Composer bind:value on:submit /> —— 提交后由父决定清空。
  import { createEventDispatcher } from 'svelte';
  import Icon from './Icon.svelte';
  export let value = '';
  export let placeholder = '';
  export let disabled = false;   // 额外禁用（如发送中）
  const dispatch = createEventDispatcher();
  function submit() { if (disabled || !value.trim()) return; dispatch('submit'); }
</script>

<footer class="composer">
  <input class="input input-pill ci" bind:value {placeholder}
    on:keydown={(e) => e.key === 'Enter' && !e.isComposing && submit()} />
  <button class="send" on:click={submit} disabled={disabled || !value.trim()} aria-label="发送"><Icon name="send" size={20} /></button>
</footer>

<style>
  .composer { flex: none; display: flex; gap: var(--s2); max-width: var(--maxw); width: 100%; margin: 0 auto; padding: 10px var(--gutter) calc(10px + env(safe-area-inset-bottom)); border-top: 1px solid var(--border); background: var(--bg); }
  .ci { flex: 1; min-width: 0; }
  .send { flex: none; width: 46px; height: 46px; border: 0; border-radius: 50%; background: var(--accent); color: var(--on-accent); display: inline-flex; align-items: center; justify-content: center; transition: background var(--t-hover) ease, opacity var(--t-hover) ease; }
  .send:hover:not(:disabled) { background: var(--brand-hover); }
  .send:disabled { opacity: 0.4; }
</style>

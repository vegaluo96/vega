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
  .composer { flex: none; display: flex; gap: var(--s2); max-width: var(--maxw); width: 100%; margin: 0 auto; padding: 10px var(--gutter) calc(10px + env(safe-area-inset-bottom)); box-shadow: inset 0 1px 0 0 var(--border); background: var(--bg); }
  /* iOS：fixed 容器内的 1px border 会渲染断裂——改用 inset box-shadow 画外框（合成干净、不断裂）。
     border 设透明只为保留 1px 占位，避免聚焦时尺寸跳动。聚焦态走中性墨色、去掉品牌紫光环。 */
  .ci { flex: 1; min-width: 0; border-color: transparent; box-shadow: inset 0 0 0 1px var(--border); }
  .ci:focus { border-color: transparent; box-shadow: inset 0 0 0 1.5px var(--text); }
  .send { flex: none; width: 46px; height: 46px; border: 0; border-radius: 50%; background: var(--primary); color: var(--on-primary); display: inline-flex; align-items: center; justify-content: center; transition: opacity var(--t-hover) ease; }
  .send:hover:not(:disabled) { opacity: 0.9; }
  .send:disabled { opacity: 0.4; }
</style>

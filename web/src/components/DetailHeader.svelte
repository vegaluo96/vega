<script>
  // 统一的二级页头部（返回 + 居中标题 + 可选右侧动作）。
  // 之前 PostDetail / LifeProfile / Chat 各写各的头，样式/blur/高度都不一致——收成一处。
  import Icon from './Icon.svelte';
  export let title = '';
  export let onBack; // 不传则浏览器后退到广场
  import { navigate } from '../lib/router.js';
  const back = () => (onBack ? onBack() : navigate('plaza'));
</script>

<header class="dh">
  <button class="back" on:click={back} aria-label="返回"><Icon name="back" size={24} /></button>
  <span class="title">{title}</span>
  <span class="action"><slot name="action" /></span>
</header>

<style>
  .dh {
    position: sticky; top: 0; z-index: 10;
    display: flex; align-items: center; gap: 8px;
    height: 52px; padding: 0 8px;
    border-bottom: 1px solid var(--border);
    background: color-mix(in srgb, var(--bg) 84%, transparent);
    backdrop-filter: saturate(180%) blur(14px);
  }
  .back { flex: none; background: none; border: 0; padding: 0 6px; color: var(--text); display: inline-flex; align-items: center; }
  .title { flex: 1; min-width: 0; font-weight: 700; font-size: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .action { flex: none; display: inline-flex; align-items: center; min-width: 32px; justify-content: flex-end; }
</style>

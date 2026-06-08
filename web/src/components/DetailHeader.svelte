<script>
  // 统一的二级页头部（返回 + 可选小头像 + 标题/副标题 + 可选右侧动作）。
  // PostDetail / LifeProfile / Chat 都收到这一处：高度(--header-h)/blur/边一致。
  import Icon from './Icon.svelte';
  export let title = '';
  export let subtitle = '';
  export let onBack;                 // 不传则后退到广场
  export let onTitle = undefined;    // 传 → 标题可点（如对话页点开关系面板）
  export let loading = false;        // 载入态占位（避免标题从空白跳成两行）
  import { navigate } from '../lib/router.js';
  const back = () => (onBack ? onBack() : navigate('plaza'));
</script>

<header class="dh">
  <button class="back" on:click={back} aria-label="返回"><Icon name="back" size={24} /></button>
  {#if $$slots.lead}<span class="lead"><slot name="lead" /></span>{/if}
  {#if loading}
    <span class="titlewrap"><span class="ph nm"></span><span class="ph sb"></span></span>
  {:else}
    <svelte:element this={onTitle ? 'button' : 'span'} class="titlewrap" class:tappable={!!onTitle} role={onTitle ? 'button' : undefined} on:click={onTitle}>
      <span class="title">{#if $$slots.title}<slot name="title" />{:else}{title}{/if}</span>
      {#if subtitle}<span class="subtitle">{subtitle}</span>{/if}
    </svelte:element>
  {/if}
  <span class="action"><slot name="action" /></span>
</header>

<style>
  .dh {
    position: sticky; top: 0; z-index: 10;
    display: flex; align-items: center; gap: var(--s2);
    height: var(--header-h); padding: 0 var(--s2);
    border-bottom: 1px solid var(--border);
    background: var(--bg);
  }
  .back { flex: none; background: none; border: 0; padding: 0 6px; color: var(--text); display: inline-flex; align-items: center; }
  .lead { flex: none; display: inline-flex; align-items: center; }
  .titlewrap { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 2px; text-align: left; background: none; border: 0; padding: 0; color: var(--text); border-radius: var(--r-sm); }
  .titlewrap.tappable { cursor: pointer; }
  .title { font-weight: 800; font-size: 16px; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-flex; align-items: center; gap: var(--s2); }
  .subtitle { color: var(--muted); font-size: 12px; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .action { flex: none; display: inline-flex; align-items: center; min-width: 32px; justify-content: flex-end; }
  .ph { display: block; border-radius: 6px; background: var(--surface-2); }
  .ph.nm { width: 90px; height: 15px; }
  .ph.sb { width: 140px; height: 11px; margin-top: 4px; }
</style>

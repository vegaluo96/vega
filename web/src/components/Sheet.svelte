<script>
  // 通用底部弹层（微信绑定 / 推送授权等）：遮罩点击关闭，内容上滑入场。
  import Icon from './Icon.svelte';
  export let title = '';
  export let onClose = () => {};
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions a11y-no-noninteractive-element-interactions -->
<div class="overlay fade-in" on:click={onClose} role="presentation">
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
  <div class="sheet rise-in" on:click|stopPropagation role="dialog" aria-label={title}>
    <div class="head">
      <h2 class="page-title sm">{title}</h2>
      <button class="icon-btn" on:click={onClose} aria-label="关闭"><Icon name="close" size={20} /></button>
    </div>
    <slot />
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; z-index: 40; display: flex; align-items: flex-end; background: var(--sky-edge); }
  .sheet { width: 100%; max-height: 86%; overflow-y: auto; background: var(--surface); border-radius: var(--r-xl) var(--r-xl) 0 0; padding: 20px 24px calc(24px + env(safe-area-inset-bottom)); box-shadow: var(--shadow-md); }
  .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
  .page-title.sm { font-size: var(--fs-lg); }
</style>

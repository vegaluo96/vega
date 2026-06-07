<script>
  import { route, navigate } from '../lib/router.js';
  import Plaza from './Plaza.svelte';
  import Explore from './Explore.svelte';
  import Chats from './Chats.svelte';
  import Chat from './Chat.svelte';
  import LifeProfile from './LifeProfile.svelte';
  import Me from './Me.svelte';
  import Notifications from './Notifications.svelte';
  import { t } from '../lib/i18n.js';

  const TABS = [
    { k: 'plaza', ico: '◎', label: 'nav.plaza' },
    { k: 'explore', ico: '⌕', label: 'nav.explore' },
    { k: 'notifications', ico: '♡', label: 'nav.notifications' },
    { k: 'chats', ico: '✉', label: 'nav.chats' },
    { k: 'me', ico: '◍', label: 'nav.me' },
  ];
  // 主导航高亮：chat/profile 归到来源 tab（默认广场）
  $: activeTab = TABS.some((x) => x.k === $route.name) ? $route.name : 'plaza';
  $: immersive = $route.name === 'chat' || $route.name === 'profile';
</script>

<div class="app" class:immersive>
  <nav>
    <div class="brand">ZSKY</div>
    {#each TABS as tab}
      <button class:active={activeTab === tab.k} on:click={() => navigate(tab.k)}>
        <span class="ico">{tab.ico}</span><span class="lbl">{t(tab.label)}</span>
      </button>
    {/each}
  </nav>

  <main class="content">
    {#if $route.name === 'chat'}
      {#key $route.params.id}<Chat lifeId={$route.params.id} />{/key}
    {:else if $route.name === 'profile'}
      {#key $route.params.id}<LifeProfile lifeId={$route.params.id} />{/key}
    {:else if $route.name === 'explore'}
      <Explore />
    {:else if $route.name === 'notifications'}
      <Notifications />
    {:else if $route.name === 'chats'}
      <Chats />
    {:else if $route.name === 'me'}
      <Me />
    {:else}
      <Plaza />
    {/if}
  </main>
</div>

<style>
  .content { min-height: 100vh; }

  /* ── 移动端：底部 tab 栏；沉浸视图(对话/主页)隐藏底栏 ── */
  nav {
    position: fixed; bottom: 0; left: 0; right: 0; z-index: 20;
    display: flex; justify-content: center; gap: 6px;
    padding: 8px 8px calc(8px + env(safe-area-inset-bottom));
    background: color-mix(in srgb, var(--bg) 90%, transparent);
    backdrop-filter: blur(12px); border-top: 1px solid var(--border);
  }
  nav .brand { display: none; }
  nav button {
    flex: 1; max-width: 110px; display: flex; flex-direction: column; align-items: center; gap: 2px;
    background: none; border: 0; color: var(--muted); font-size: 11px; padding: 6px;
  }
  nav button.active { color: var(--accent); }
  .ico { font-size: 20px; line-height: 1; }
  .app.immersive nav { display: none; }

  /* ── 桌面端：左侧导航轨 + 居中内容栏（始终显示，含对话/主页） ── */
  @media (min-width: 1000px) {
    .app { display: flex; max-width: 1080px; margin: 0 auto; align-items: flex-start; }
    .app.immersive nav { display: flex; }
    nav {
      position: sticky; top: 0; left: auto; right: auto; bottom: auto;
      flex-direction: column; justify-content: flex-start; align-items: stretch; gap: 4px;
      width: 240px; height: 100vh; padding: 20px 12px;
      border-top: 0; border-right: 1px solid var(--border); backdrop-filter: none; background: var(--bg);
    }
    nav .brand { display: block; font-weight: 800; letter-spacing: 0.12em; font-size: 22px; padding: 6px 14px 18px; }
    nav button {
      flex: none; max-width: none; flex-direction: row; justify-content: flex-start; gap: 14px;
      padding: 11px 14px; border-radius: 999px; font-size: 16px; font-weight: 600;
    }
    nav button.active { background: var(--accent-soft); }
    nav button .lbl { font-size: 16px; }
    nav button:hover { background: var(--surface-2); }
    .content { flex: 1; min-width: 0; border-right: 1px solid var(--border); }
  }
</style>

<script>
  import { route, navigate } from '../lib/router.js';
  import Plaza from './Plaza.svelte';
  import Explore from './Explore.svelte';
  import Chats from './Chats.svelte';
  import Chat from './Chat.svelte';
  import LifeProfile from './LifeProfile.svelte';
  import PostDetail from './PostDetail.svelte';
  import Me from './Me.svelte';
  import Notifications from './Notifications.svelte';
  import Icon from '../components/Icon.svelte';
  import { t } from '../lib/i18n.js';

  const TABS = [
    { k: 'plaza', ico: 'plaza', label: 'nav.plaza' },
    { k: 'explore', ico: 'search', label: 'nav.explore' },
    { k: 'chats', ico: 'chats', label: 'nav.chats' },
    { k: 'notifications', ico: 'notifications', label: 'nav.notifications' },
    { k: 'me', ico: 'me', label: 'nav.me' },
  ];
  // 主导航高亮：chat/profile 归到来源 tab（默认广场）
  $: activeTab = TABS.some((x) => x.k === $route.name) ? $route.name : 'plaza';
  $: immersive = $route.name === 'chat' || $route.name === 'profile' || $route.name === 'post';
</script>

<div class="app" class:immersive>
  <nav>
    <div class="brand">ZSKY</div>
    {#each TABS as tab}
      <button class:active={activeTab === tab.k} class:userentry={tab.k === 'me'} on:click={() => navigate(tab.k)} aria-label={t(tab.label)} title={t(tab.label)}>
        <Icon name={tab.ico} size={24} sw={activeTab === tab.k ? 2.4 : 1.8} />
      </button>
    {/each}
  </nav>

  <main class="content">
    {#if $route.name === 'chat'}
      {#key $route.params.id}<Chat lifeId={$route.params.id} />{/key}
    {:else if $route.name === 'profile'}
      {#key $route.params.id}<LifeProfile lifeId={$route.params.id} />{/key}
    {:else if $route.name === 'post'}
      {#key $route.params.id}<PostDetail postId={$route.params.id} />{/key}
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
  .content { min-height: 100vh; min-height: 100dvh; }

  /* ── 移动端：底部 tab 栏；沉浸视图(对话/主页)隐藏底栏 ── */
  nav {
    position: fixed; bottom: 0; left: 0; right: 0; z-index: 20;
    display: flex; justify-content: space-around; gap: 2px;
    padding: 6px 6px calc(6px + env(safe-area-inset-bottom));
    background: color-mix(in srgb, var(--bg) 86%, transparent);
    backdrop-filter: saturate(180%) blur(16px);
    border-top: 1px solid var(--border-subtle);
  }
  nav .brand { display: none; }
  nav button {
    flex: 1; max-width: 64px; min-height: 44px;
    display: flex; align-items: center; justify-content: center;
    background: none; border: 0; color: var(--faint); padding: 4px; border-radius: var(--r-pill);
    transition: color var(--t-hover) ease, background var(--t-hover) ease;
  }
  nav button.active { color: var(--text); background: var(--surface-2); }
  .app.immersive nav { display: none; }

  /* ── 桌面端：左侧导航轨 + 居中内容栏 ── */
  @media (min-width: 1000px) {
    .app { display: flex; max-width: 1000px; margin: 0 auto; align-items: flex-start; }
    .app.immersive nav { display: flex; }
    nav {
      position: sticky; top: 0; left: auto; right: auto; bottom: auto;
      flex-direction: column; justify-content: flex-start; align-items: center; gap: 6px;
      width: 76px; height: 100vh; height: 100dvh; padding: 20px 10px 18px;
      border-top: 0; border-right: 1px solid var(--border); backdrop-filter: none; background: var(--bg);
    }
    nav .brand { display: block; font-weight: 800; letter-spacing: 0.08em; font-size: 13px; padding: 4px 0 16px; color: var(--text); }
    nav button {
      flex: none; max-width: none; width: 48px; height: 48px; min-height: 48px;
      border-radius: var(--r-md); color: var(--muted);
      transition: background var(--t-hover) ease, color var(--t-hover) ease;
    }
    nav button.userentry { margin-top: auto; }
    nav button.active { background: var(--surface-2); color: var(--text); }
    nav button:not(.active):hover { color: var(--text); }
    .content { flex: 1; min-width: 0; border-right: 1px solid var(--border); }
  }
</style>

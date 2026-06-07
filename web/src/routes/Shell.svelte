<script>
  import { route, navigate } from '../lib/router.js';
  import Plaza from './Plaza.svelte';
  import Explore from './Explore.svelte';
  import Chats from './Chats.svelte';
  import Chat from './Chat.svelte';
  import LifeProfile from './LifeProfile.svelte';
  import Me from './Me.svelte';
  import Notifications from './Notifications.svelte';
  import Icon from '../components/Icon.svelte';
  import { t } from '../lib/i18n.js';

  const TABS = [
    { k: 'plaza', ico: 'plaza', label: 'nav.plaza' },
    { k: 'explore', ico: 'explore', label: 'nav.explore' },
    { k: 'notifications', ico: 'notifications', label: 'nav.notifications' },
    { k: 'chats', ico: 'chats', label: 'nav.chats' },
    { k: 'me', ico: 'me', label: 'nav.me' },
  ];
  // 主导航高亮：chat/profile 归到来源 tab（默认广场）
  $: activeTab = TABS.some((x) => x.k === $route.name) ? $route.name : 'plaza';
  $: immersive = $route.name === 'chat' || $route.name === 'profile';
</script>

<div class="app" class:immersive>
  <nav>
    <div class="brand">ZSKY</div>
    {#each TABS as tab}
      <button class:active={activeTab === tab.k} class:userentry={tab.k === 'me'} on:click={() => navigate(tab.k)}>
        <span class="ico"><Icon name={tab.ico} size={22} /></span><span class="lbl">{t(tab.label)}</span>
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
    display: flex; justify-content: space-around; gap: 2px;
    padding: 6px 6px calc(6px + env(safe-area-inset-bottom));
    background: color-mix(in srgb, var(--bg) 86%, transparent);
    backdrop-filter: saturate(180%) blur(16px);
    border-top: 1px solid var(--border-subtle);
  }
  nav .brand { display: none; }
  nav button {
    flex: 1; max-width: 96px; min-height: 44px;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
    background: none; border: 0; color: var(--faint); font-size: 10.5px; padding: 4px;
    transition: color var(--t-hover) ease;
  }
  nav button.active { color: var(--accent); }
  .ico { display: inline-flex; align-items: center; justify-content: center; transition: transform var(--t-hover) ease; }
  nav button.active .ico { transform: translateY(-1px); }
  .lbl { letter-spacing: 0.02em; }
  .app.immersive nav { display: none; }

  /* ── 桌面端：左侧导航轨 + 居中内容栏 ── */
  @media (min-width: 1000px) {
    .app { display: flex; max-width: 1120px; margin: 0 auto; align-items: flex-start; }
    .app.immersive nav { display: flex; }
    nav {
      position: sticky; top: 0; left: auto; right: auto; bottom: auto;
      flex-direction: column; justify-content: flex-start; align-items: stretch; gap: 3px;
      width: var(--rail); height: 100vh; padding: 22px 14px 18px;
      border-top: 0; border-right: 1px solid var(--border); backdrop-filter: none; background: var(--bg);
    }
    nav .brand { display: block; font-weight: 800; letter-spacing: 0.14em; font-size: 21px; padding: 6px 14px 22px; }
    nav button {
      flex: none; max-width: none; min-height: 46px;
      flex-direction: row; justify-content: flex-start; gap: 14px;
      padding: 0 16px; border-radius: var(--r-pill); font-size: 15px; font-weight: 600; color: var(--muted);
      transition: background var(--t-hover) ease, color var(--t-hover) ease;
    }
    nav button.userentry { margin-top: auto; }
    nav button.active { background: var(--accent-weak); color: var(--accent); }
    nav button.active .ico { transform: none; }
    nav button:not(.active):hover { background: var(--surface-2); color: var(--text); }
    nav button .lbl { font-size: 15px; }
    .content { flex: 1; min-width: 0; border-right: 1px solid var(--border); }
  }
</style>

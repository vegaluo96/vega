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
</script>

{#if $route.name === 'chat'}
  {#key $route.params.id}
    <Chat lifeId={$route.params.id} />
  {/key}
{:else if $route.name === 'profile'}
  {#key $route.params.id}
    <LifeProfile lifeId={$route.params.id} />
  {/key}
{:else}
  <div class="view">
    {#if $route.name === 'explore'}
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
  </div>
  <nav>
    {#each TABS as tab}
      <button class:active={$route.name === tab.k} on:click={() => navigate(tab.k)}>
        <span class="ico">{tab.ico}</span><span>{t(tab.label)}</span>
      </button>
    {/each}
  </nav>
{/if}

<style>
  nav {
    position: fixed; bottom: 0; left: 0; right: 0;
    display: flex; justify-content: center; gap: 8px;
    padding: 8px 8px calc(8px + env(safe-area-inset-bottom));
    background: color-mix(in srgb, var(--bg) 90%, transparent);
    backdrop-filter: blur(12px); border-top: 1px solid var(--border); z-index: 20;
  }
  nav button {
    flex: 1; max-width: 110px; display: flex; flex-direction: column; align-items: center; gap: 2px;
    background: none; border: 0; color: var(--muted); font-size: 11px; padding: 6px;
  }
  nav button.active { color: var(--accent); }
  .ico { font-size: 20px; line-height: 1; }
</style>

<script>
  import { route, navigate } from '../lib/router.js';
  import Plaza from './Plaza.svelte';
  import Chat from './Chat.svelte';
  import Me from './Me.svelte';
  import Notifications from './Notifications.svelte';
  import { t } from '../lib/i18n.js';
</script>

{#if $route.name === 'chat'}
  {#key $route.params.id}
    <Chat lifeId={$route.params.id} />
  {/key}
{:else}
  <div class="view">
    {#if $route.name === 'me'}
      <Me />
    {:else if $route.name === 'notifications'}
      <Notifications />
    {:else}
      <Plaza />
    {/if}
  </div>
  <nav>
    <button class:active={$route.name === 'plaza'} on:click={() => navigate('plaza')}>
      <span class="ico">◎</span><span>{t('nav.plaza')}</span>
    </button>
    <button class:active={$route.name === 'notifications'} on:click={() => navigate('notifications')}>
      <span class="ico">♡</span><span>{t('nav.notifications')}</span>
    </button>
    <button class:active={$route.name === 'me'} on:click={() => navigate('me')}>
      <span class="ico">◍</span><span>{t('nav.me')}</span>
    </button>
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
    flex: 1; max-width: 160px; display: flex; flex-direction: column; align-items: center; gap: 2px;
    background: none; border: 0; color: var(--muted); font-size: 11px; padding: 6px;
  }
  nav button.active { color: var(--accent); }
  .ico { font-size: 20px; line-height: 1; }
</style>

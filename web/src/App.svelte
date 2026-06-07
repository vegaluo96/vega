<script>
  import { session } from './lib/api.js';
  import Landing from './routes/Landing.svelte';
  import Auth from './routes/Auth.svelte';
  import Home from './routes/Home.svelte';

  let view = 'landing'; // landing | auth | home
  // 有会话即进首页；登出后回到 landing。
  $: if ($session) view = 'home';
  $: if (!$session && view === 'home') view = 'landing';
</script>

{#if view === 'home' && $session}
  <Home />
{:else if view === 'auth'}
  <Auth on:done={() => (view = 'home')} on:back={() => (view = 'landing')} />
{:else}
  <Landing on:enter={() => (view = $session ? 'home' : 'auth')} />
{/if}

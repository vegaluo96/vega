<script>
  import { session } from './lib/api.js';
  import Landing from './routes/Landing.svelte';
  import Auth from './routes/Auth.svelte';
  import Shell from './routes/Shell.svelte';

  let view = 'landing'; // landing | auth | app
  $: if ($session) view = 'app';
  $: if (!$session && view === 'app') view = 'landing';
</script>

{#if view === 'app' && $session}
  <Shell />
{:else if view === 'auth'}
  <Auth on:done={() => (view = 'app')} on:back={() => (view = 'landing')} />
{:else}
  <Landing on:enter={() => (view = $session ? 'app' : 'auth')} />
{/if}

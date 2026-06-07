<script>
  import { session } from './lib/api.js';
  import Landing from './routes/Landing.svelte';
  import Auth from './routes/Auth.svelte';
  import Shell from './routes/Shell.svelte';
  import Onboarding from './routes/Onboarding.svelte';

  let view = 'landing'; // landing | auth | app
  let onboarded = localStorage.getItem('zsky_onboarded') === '1';
  $: if ($session) view = 'app';
  $: if (!$session && view === 'app') view = 'landing';
  function finishOnboarding() {
    localStorage.setItem('zsky_onboarded', '1');
    onboarded = true;
  }
</script>

{#if view === 'app' && $session}
  {#if onboarded}
    <Shell />
  {:else}
    <Onboarding on:done={finishOnboarding} />
  {/if}
{:else if view === 'auth'}
  <Auth on:done={() => (view = 'app')} on:back={() => (view = 'landing')} />
{:else}
  <Landing on:enter={() => (view = $session ? 'app' : 'auth')} />
{/if}

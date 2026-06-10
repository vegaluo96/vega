<script>
  // 根状态机：landing → auth → onboarding → app（持久化）。进入 app 后一次性温柔询问推送。
  import { session } from './lib/api.js';
  import { hydrateFollows } from './lib/follows.js';
  import { pushSupported } from './lib/push.js';
  import Landing from './routes/Landing.svelte';
  import Auth from './routes/Auth.svelte';
  import Shell from './routes/Shell.svelte';
  import Onboarding from './routes/Onboarding.svelte';
  import PushPrompt from './components/PushPrompt.svelte';

  let view = 'landing'; // landing | auth | app
  let onboarded = localStorage.getItem('zsky_onboarded') === '1';
  let pushAsked = localStorage.getItem('zsky-push') != null;

  $: if ($session) { view = 'app'; hydrateFollows(); }
  $: if (!$session && view === 'app') view = 'landing';
  $: showPush = view === 'app' && $session && onboarded && !pushAsked && pushSupported();

  function finishOnboarding() { localStorage.setItem('zsky_onboarded', '1'); onboarded = true; }
  function pushDone() { try { localStorage.setItem('zsky-push', '1'); } catch { /* ignore */ } pushAsked = true; }
</script>

{#if view === 'app' && $session}
  {#if onboarded}
    <Shell />
    {#if showPush}<PushPrompt on:done={pushDone} />{/if}
  {:else}
    <Onboarding on:done={finishOnboarding} />
  {/if}
{:else if view === 'auth'}
  <Auth on:done={() => (view = 'app')} on:back={() => (view = 'landing')} />
{:else}
  <Landing on:enter={() => (view = $session ? 'app' : 'auth')} />
{/if}

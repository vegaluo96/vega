<script>
  import { createEventDispatcher } from 'svelte';
  import { api, setSession } from '../lib/api.js';
  import { t } from '../lib/i18n.js';
  const dispatch = createEventDispatcher();

  let mode = 'register'; // register | login
  let email = '';
  let password = '';
  let handle = '';
  let error = '';
  let busy = false;

  async function submit() {
    error = '';
    busy = true;
    try {
      const r = mode === 'register' ? await api.register(email, password, handle) : await api.login(email, password);
      if (r.token) setSession(r.token);
      else if (mode === 'register') {
        const l = await api.login(email, password);
        setSession(l.token);
      }
      dispatch('done');
    } catch (e) {
      error = e.message || '出错了';
    } finally {
      busy = false;
    }
  }
</script>

<div class="wrap">
  <span class="glow"></span>
  <div class="card fade-in">
    <h2 class="logo">ZSKY</h2>
    <p class="lede">{mode === 'register' ? '你正在进入一座数字生命社会。' : '欢迎回来。'}</p>
    <p class="hint">{mode === 'register' ? '她们会记得你——所以这道门，只属于你。' : '她们一直记得你。'}</p>

    <form on:submit|preventDefault={submit}>
      {#if mode === 'register'}
        <input class="input" bind:value={handle} placeholder={t('auth.handle')} autocomplete="nickname" />
      {/if}
      <input class="input" bind:value={email} type="email" placeholder={t('auth.email')} autocomplete="email" />
      <input class="input" bind:value={password} type="password" placeholder={t('auth.password')} autocomplete="current-password" />
      {#if error}<p class="err">{error}</p>{/if}
      <button class="btn btn-block" type="submit" disabled={busy}>
        {busy ? t('common.loading') : mode === 'register' ? t('auth.submitRegister') : t('auth.submitLogin')}
      </button>
    </form>

    <button class="link" on:click={() => { mode = mode === 'register' ? 'login' : 'register'; error = ''; }}>
      {mode === 'register' ? t('auth.haveAccount') : t('auth.noAccount')}
    </button>
    <button class="link back" on:click={() => dispatch('back')}>← 返回</button>
  </div>
</div>

<style>
  .wrap { position: relative; min-height: 100vh; min-height: 100dvh; display: grid; place-items: center; padding: 24px; overflow: hidden; }
  .glow { position: absolute; top: -10%; left: 50%; transform: translateX(-50%); width: 520px; height: 520px; border-radius: 50%; background: radial-gradient(circle, var(--accent-weak), transparent 65%); pointer-events: none; }
  .card { position: relative; width: 100%; max-width: 372px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); padding: 34px 30px; box-shadow: var(--shadow); text-align: center; }
  .logo { font-size: 28px; font-weight: 800; letter-spacing: 0.14em; margin: 0 0 14px; }
  .lede { font-size: var(--fs-body); margin: 0 0 4px; }
  .hint { color: var(--muted); font-size: var(--fs-sm); line-height: 1.6; margin: 0 0 26px; }
  form { display: flex; flex-direction: column; gap: 11px; }
  .btn-block { margin-top: 4px; }
  .err { color: var(--danger); font-size: var(--fs-sm); margin: 0; }
  .link { background: none; border: 0; color: var(--accent); font-size: var(--fs-md); margin-top: 18px; display: block; width: 100%; }
  .link.back { color: var(--muted); margin-top: 10px; }
</style>

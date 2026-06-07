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
  <div class="card">
    <h2 class="logo">ZSKY</h2>
    <p class="hint">{mode === 'register' ? t('auth.submitRegister') : t('auth.submitLogin')}</p>

    <form on:submit|preventDefault={submit}>
      {#if mode === 'register'}
        <input bind:value={handle} placeholder={t('auth.handle')} autocomplete="nickname" />
      {/if}
      <input bind:value={email} type="email" placeholder={t('auth.email')} autocomplete="email" />
      <input bind:value={password} type="password" placeholder={t('auth.password')} autocomplete="current-password" />
      {#if error}<p class="err">{error}</p>{/if}
      <button class="btn" type="submit" disabled={busy}>
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
  .wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
  .card { width: 100%; max-width: 360px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 32px 28px; box-shadow: var(--shadow); text-align: center; }
  .logo { font-size: 28px; font-weight: 800; letter-spacing: 0.12em; margin: 0 0 4px; }
  .hint { color: var(--muted); font-size: 14px; margin: 0 0 24px; }
  form { display: flex; flex-direction: column; gap: 12px; }
  input { padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg); color: var(--text); font: inherit; }
  input:focus { outline: none; border-color: var(--accent); }
  .btn { width: 100%; margin-top: 4px; }
  .err { color: var(--danger); font-size: 13px; margin: 2px 0 0; }
  .link { background: none; border: 0; color: var(--accent); font-size: 14px; margin-top: 16px; display: block; width: 100%; }
  .link.back { color: var(--muted); margin-top: 8px; }
</style>

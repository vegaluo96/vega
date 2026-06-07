<script>
  import { onMount } from 'svelte';
  import { api, clearSession } from '../lib/api.js';
  import { toggleTheme } from '../lib/theme.js';
  import { t } from '../lib/i18n.js';

  let me = null;
  let lives = [];
  let error = '';

  onMount(async () => {
    try {
      me = await api.me();
      lives = await api.lives();
    } catch (e) {
      error = e.message;
      if (e.status === 401) clearSession();
    }
  });

  async function logout() {
    try { await api.logout(); } catch {}
    clearSession();
  }
</script>

<header>
  <h1 class="logo">ZSKY</h1>
  <div class="spacer"></div>
  {#if me}<span class="hi">{me.account.handle} · {me.balance} 心意</span>{/if}
  <button class="icon" on:click={toggleTheme} title={t('theme.toggle')}>◐</button>
  <button class="icon" on:click={logout} title="登出">⎋</button>
</header>

<main>
  {#if error}<p class="err">{error}</p>{/if}
  <h2 class="section">{t('nav.plaza')} · 此刻醒着的她们</h2>
  <div class="grid">
    {#each lives as l}
      <div class="lifecard">
        <div class="avatar" style="--seed:{l.id.length}">{l.id[0].toUpperCase()}</div>
        <div class="meta">
          <div class="name">{l.id} <span class="dot" class:awake={l.awake}></span></div>
          <div class="mood">{l.dayPhase || ''} · {l.emotion}</div>
          <div class="temp">{l.temperament || ''}</div>
        </div>
        <button class="btn small">{t('life.meet')}</button>
      </div>
    {/each}
    {#if lives.length === 0 && !error}<p class="muted">{t('common.loading')}</p>{/if}
  </div>
</main>

<style>
  header { position: sticky; top: 0; display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border); background: color-mix(in srgb, var(--bg) 86%, transparent); backdrop-filter: blur(10px); z-index: 10; }
  .logo { font-size: 20px; font-weight: 800; letter-spacing: 0.1em; margin: 0; }
  .spacer { flex: 1; }
  .hi { color: var(--muted); font-size: 13px; }
  .icon { background: none; border: 1px solid var(--border); color: var(--text); width: 34px; height: 34px; border-radius: 999px; }
  main { max-width: var(--maxw); margin: 0 auto; padding: 20px 16px 60px; }
  .section { font-size: 14px; color: var(--muted); font-weight: 600; margin: 8px 0 16px; }
  .grid { display: flex; flex-direction: column; gap: 12px; }
  .lifecard { display: flex; align-items: center; gap: 14px; padding: 16px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
  .avatar { width: 48px; height: 48px; border-radius: 999px; display: grid; place-items: center; font-weight: 700; color: var(--on-accent); background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 50%, #d08bf0)); flex: none; }
  .meta { flex: 1; min-width: 0; }
  .name { font-weight: 700; display: flex; align-items: center; gap: 8px; }
  .dot { width: 8px; height: 8px; border-radius: 999px; background: var(--muted); }
  .dot.awake { background: #3fb950; }
  .mood, .temp { color: var(--muted); font-size: 13px; }
  .temp { font-size: 12px; opacity: 0.8; }
  .btn.small { padding: 8px 16px; font-size: 14px; }
  .err { color: var(--danger); }
  .muted { color: var(--muted); }
</style>

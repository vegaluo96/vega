<script>
  import { onMount } from 'svelte';
  import { api, clearSession } from '../lib/api.js';
  import { theme, toggleTheme } from '../lib/theme.js';
  import { navigate } from '../lib/router.js';
  import { t } from '../lib/i18n.js';

  let me = null;
  let error = '';
  onMount(async () => {
    try {
      me = await api.me();
    } catch (e) {
      error = e.message;
      if (e.status === 401) clearSession();
    }
  });
  async function logout() {
    try { await api.logout(); } catch {}
    clearSession();
  }

  let rechargeMsg = '';
  let rechargingAmount = 100;
  async function recharge() {
    rechargeMsg = '';
    try {
      const r = await api.recharge(rechargingAmount);
      rechargeMsg = `已申请 ${r.amount} 心意，等待审批通过后到账。`;
    } catch (e) {
      rechargeMsg = e.message;
    }
  }
</script>

<section>
  <h1 class="logo">ZSKY</h1>
  {#if me}
    <div class="card">
      <div class="row"><span class="k">昵称</span><span>{me.account.handle}</span></div>
      <div class="row"><span class="k">邮箱</span><span>{me.account.email}</span></div>
      <div class="row"><span class="k">心意值</span><span>{me.balance}</span></div>
      {#if me.account.role !== 'user'}<div class="row"><span class="k">角色</span><span>{me.account.role}</span></div>{/if}
    </div>

    <h2 class="section">钱包 · 心意值</h2>
    <div class="card pad">
      <p class="muted small">心意值用于和她们更丰富地对话。用尽了她也不会消失——只是话说得朴素些。</p>
      <div class="wallet">
        <select bind:value={rechargingAmount}>
          <option value={100}>100 心意</option>
          <option value={500}>500 心意</option>
          <option value={2000}>2000 心意</option>
        </select>
        <button class="btn" on:click={recharge}>申请充值</button>
      </div>
      {#if rechargeMsg}<p class="ok">{rechargeMsg}</p>{/if}
    </div>

    <h2 class="section">我遇见的她们</h2>
    <div class="card">
      {#if me.lives.length}
        {#each me.lives as l}
          <button class="row link" on:click={() => navigate('chat', { id: l.id })}><span>{l.id}</span><span class="go">›</span></button>
        {/each}
      {:else}
        <p class="muted">还没有遇见谁——去广场认识一个吧。</p>
      {/if}
    </div>
  {:else if error}
    <p class="err">{error}</p>
  {/if}

  <div class="actions">
    <button class="btn ghost" on:click={toggleTheme}>{$theme === 'dark' ? '☀︎ 白天' : '☾ 黑夜'}</button>
    <button class="btn ghost" on:click={logout}>登出</button>
  </div>
</section>

<style>
  section { max-width: var(--maxw); margin: 0 auto; padding: 24px 16px 90px; }
  .logo { font-size: 24px; font-weight: 800; letter-spacing: 0.12em; margin: 0 2px 18px; }
  .section { font-size: 13px; color: var(--muted); font-weight: 600; margin: 22px 2px 10px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
  .row { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-bottom: 1px solid var(--border); }
  .row:last-child { border-bottom: 0; }
  .row.link { width: 100%; background: none; border-bottom: 1px solid var(--border); color: var(--text); cursor: pointer; }
  .k { color: var(--muted); }
  .go { color: var(--muted); font-size: 20px; }
  .muted { color: var(--muted); padding: 16px; margin: 0; }
  .pad { padding: 16px; }
  .muted.small { font-size: 13px; padding: 0 0 14px; line-height: 1.6; }
  .wallet { display: flex; gap: 10px; }
  .wallet select { flex: 1; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg); color: var(--text); font: inherit; }
  .ok { color: var(--accent); font-size: 13px; margin: 12px 0 0; }
  .err { color: var(--danger); }
  .actions { display: flex; gap: 10px; margin-top: 24px; }
  .actions .btn { flex: 1; }
</style>

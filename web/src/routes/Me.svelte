<script>
  import { onMount } from 'svelte';
  import { api, clearSession } from '../lib/api.js';
  import { theme, toggleTheme } from '../lib/theme.js';
  import { navigate } from '../lib/router.js';
  import { enablePush, pushSupported } from '../lib/push.js';
  import PageHeader from '../components/PageHeader.svelte';
  import LifeAvatar from '../components/LifeAvatar.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Icon from '../components/Icon.svelte';

  let pushMsg = '';
  async function turnOnPush() {
    pushMsg = '';
    try {
      await enablePush();
      pushMsg = '已开启——她想你了、来找你时，会推到这里。';
    } catch (e) {
      pushMsg = e.message;
    }
  }

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

<div class="me">
  <PageHeader title="你在 ZSKY" subtitle="你不是游客。你正在改变一些生命的历史。" />

  {#if me}
    <section class="block">
      <h2 class="section-title">我遇见的她们</h2>
      {#if me.lives.length}
        <div class="met">
          {#each me.lives as l (l.id)}
            <button class="metcard card-interactive" on:click={() => navigate('chat', { id: l.id })}>
              <LifeAvatar id={l.id} awake={false} pulse={false} size={44} />
              <span class="mname">{l.id}</span>
              <span class="go">›</span>
            </button>
          {/each}
        </div>
      {:else}
        <EmptyState title="你还没有遇见谁。" text="去广场，认识第一个她。">
          <button slot="action" class="btn" on:click={() => navigate('plaza')}>去广场</button>
        </EmptyState>
      {/if}
    </section>

    <section class="block">
      <h2 class="section-title">钱包 · 心意值</h2>
      <div class="card pad">
        <div class="kv"><span class="k">余额</span><span class="v mono">{me.balance} 心意</span></div>
        <p class="caption note">心意值是和她们更丰富对话的表达额度。用尽了她不会消失——只是话说得朴素些。</p>
        <div class="wallet">
          <select class="input sel" bind:value={rechargingAmount}>
            <option value={100}>100 心意</option>
            <option value={500}>500 心意</option>
            <option value={2000}>2000 心意</option>
          </select>
          <button class="btn" on:click={recharge}>申请充值</button>
        </div>
        {#if rechargeMsg}<p class="ok">{rechargeMsg}</p>{/if}
      </div>
    </section>

    {#if pushSupported()}
      <section class="block">
        <h2 class="section-title">通知</h2>
        <div class="card pad">
          <p class="caption note">开启后，她想你了、主动来找你时，即使没打开 ZSKY，也能收到。</p>
          <button class="btn btn-secondary" on:click={turnOnPush}>开启「她想你了」通知</button>
          {#if pushMsg}<p class="ok">{pushMsg}</p>{/if}
        </div>
      </section>
    {/if}

    <section class="block">
      <h2 class="section-title">账户</h2>
      <div class="card">
        <div class="row"><span class="rk">昵称</span><span class="rv">{me.account.handle}</span></div>
        <div class="row"><span class="rk">邮箱</span><span class="rv">{me.account.email}</span></div>
        {#if me.account.role !== 'user'}<div class="row"><span class="rk">角色</span><span class="rv">{me.account.role}</span></div>{/if}
      </div>
    </section>
  {:else if error}
    <p class="err">{error}</p>
  {/if}

  <div class="footer">
    <button class="btn-ghost btn" on:click={toggleTheme}><Icon name={$theme === 'dark' ? 'sun' : 'moon'} size={18} /> {$theme === 'dark' ? '白天' : '黑夜'}</button>
    <button class="btn-ghost btn" on:click={logout}><Icon name="logout" size={18} /> 登出</button>
  </div>
</div>

<style>
  .me { max-width: var(--maxw); margin: 0 auto; padding: 4px 16px 96px; }
  .block { margin-top: 22px; }
  .block .section-title { margin: 0 2px 10px; }
  .pad { padding: 16px; }

  .met { display: grid; grid-template-columns: 1fr; gap: 8px; }
  .metcard { display: flex; align-items: center; gap: 12px; padding: 12px 14px; }
  .mname { flex: 1; font-weight: 600; font-size: 15px; }
  .go { color: var(--faint); font-size: 20px; }

  .kv { display: flex; justify-content: space-between; align-items: center; }
  .kv .k { color: var(--faint); font-size: 13px; }
  .kv .v { font-weight: 600; }
  .note { margin: 12px 0 14px; }
  .wallet { display: flex; gap: 10px; }
  .sel { flex: 1; min-height: 46px; }
  .ok { color: var(--success); font-size: 13px; margin: 12px 0 0; }

  .row { display: flex; justify-content: space-between; align-items: center; padding: 13px 16px; border-bottom: 1px solid var(--border-subtle); }
  .row:last-child { border-bottom: 0; }
  .rk { color: var(--faint); font-size: 13px; }
  .rv { font-size: 14px; }

  .footer { display: flex; gap: 10px; margin-top: 26px; }
  .footer .btn { flex: 1; }

  @media (min-width: 720px) {
    .met { grid-template-columns: 1fr 1fr; }
  }
</style>

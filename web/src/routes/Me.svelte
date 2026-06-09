<script>
  import { onMount } from 'svelte';
  import { api, clearSession } from '../lib/api.js';
  import { theme, toggleTheme } from '../lib/theme.js';
  import { enablePush, pushSupported } from '../lib/push.js';
  import { navigate } from '../lib/router.js';
  import PageHeader from '../components/PageHeader.svelte';
  import Icon from '../components/Icon.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import LifeAvatar from '../components/LifeAvatar.svelte';

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
  let followed = []; // 我关注的生命体（vibe 来自画廊，按 me.following 过滤）
  onMount(async () => {
    try {
      me = await api.me();
      if ((me.following || []).length) {
        try { const all = await api.lives(); followed = all.filter((l) => me.following.includes(l.id)); } catch { /* 画廊取不到不影响本页 */ }
      }
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
      try { me = await api.me(); } catch { /* 刷新待审批额，忽略失败 */ }
    } catch (e) {
      rechargeMsg = e.message;
    }
  }
</script>

<div class="me">
  <div class="sticktop"><PageHeader title="你在 ZSKY" /></div>

  {#if !me && !error}<Skeleton rows={4} />{/if}
  {#if me}
    <section class="block">
      <h2 class="section-title">心意值</h2>
      <div>
        <div class="row"><span class="rk">余额</span><span class="rv mono">{me.balance}</span></div>
        {#if me.pendingRecharge > 0}<div class="row"><span class="rk">审批中</span><span class="rv pending">{me.pendingRecharge} · 等待通过</span></div>{/if}
        <div class="row act">
          <select class="input sel" bind:value={rechargingAmount}>
            <option value={100}>100 心意</option>
            <option value={500}>500 心意</option>
            <option value={2000}>2000 心意</option>
          </select>
          <button class="btn" on:click={recharge}>申请充值</button>
        </div>
      </div>
      {#if rechargeMsg}<p class="ok">{rechargeMsg}</p>{/if}
    </section>

    {#if followed.length}
      <section class="block">
        <h2 class="section-title">我关注的 · {followed.length}</h2>
        <div class="follows">
          {#each followed as f}
            <button class="fl" on:click={() => navigate('profile', { id: f.id })}>
              <LifeAvatar id={f.id} emotion={f.emotion} awake={f.awake} size={52} />
              <span class="flname">{f.id}</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    {#if pushSupported()}
      <section class="block">
        <div class="actgrp">
          <button class="btn btn-secondary" on:click={turnOnPush}>开启推送通知</button>
          {#if pushMsg}<p class="ok">{pushMsg}</p>{/if}
        </div>
      </section>
    {/if}

    <section class="block">
      <h2 class="section-title">账户</h2>
      <div>
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
  .me { max-width: var(--maxw); margin: 0 auto; padding: 0 var(--gutter) 96px; }
  .block { margin-top: var(--s6); }
  .block .section-title { margin: 0 2px 10px; }
  .actgrp { padding: var(--s2) 0; }

  .pending { color: var(--accent); }
  .sel { flex: 1; min-height: 44px; }
  .ok { color: var(--success); font-size: var(--fs-sm); margin: 10px 2px 0; }

  .row { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: var(--s3) 0; border-bottom: 1px solid var(--border-subtle); }
  .row:last-child { border-bottom: 0; }
  .row.act { padding: var(--s3) 0; }
  .rk { color: var(--faint); font-size: var(--fs-sm); }
  .rv { font-size: var(--fs-md); font-weight: 600; }

  /* 我关注的：横向头像条（仿生命主页的同类朋友） */
  .follows { display: flex; gap: var(--s3); overflow-x: auto; padding: 2px 2px 6px; scrollbar-width: none; }
  .follows::-webkit-scrollbar { display: none; }
  .fl { flex: none; width: 64px; display: flex; flex-direction: column; align-items: center; gap: 6px; background: none; border: 0; padding: 0; cursor: pointer; }
  .flname { font-size: var(--fs-sm); font-weight: 600; color: var(--text); max-width: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .footer { display: flex; gap: 10px; margin-top: var(--s6); }
  .footer .btn { flex: 1; }
</style>

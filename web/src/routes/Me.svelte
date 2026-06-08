<script>
  import { onMount, onDestroy } from 'svelte';
  import { api, clearSession } from '../lib/api.js';
  import { theme, toggleTheme } from '../lib/theme.js';
  import { enablePush, pushSupported } from '../lib/push.js';
  import PageHeader from '../components/PageHeader.svelte';
  import Icon from '../components/Icon.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import { qrDataUrl } from '../lib/qr.js';

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

  // 微信：ZSKY 自己当机器人——网页把微信返回的授权网址生成成二维码，微信扫码即连接。
  let qrImg = '', qrPolling = false, wxMsg = '', wxAlive = true;
  onDestroy(() => { wxAlive = false; qrPolling = false; }); // 离开页面即停轮询，别在已销毁实例上拉取
  async function connectWx() {
    wxMsg = '';
    try {
      const r = await api.wxConnectStart();
      if (!r.qrcodeUrl) { wxMsg = '微信没返回授权网址，稍后再试一次。'; console.warn('[wx] connect/start 无 qrcodeUrl:', r); return; }
      qrImg = qrDataUrl(r.qrcodeUrl); // 把授权网址编码成二维码图（不是去加载它）
      pollWx(r.qrcode);
    } catch (e) {
      wxMsg = e.message || '连接失败，稍后再试。';
      console.warn('[wx] connect 失败:', e && e.data ? e.data : e);
    }
  }
  async function pollWx(qrcode) {
    qrPolling = true;
    for (let i = 0; i < 80 && qrPolling && wxAlive; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      if (!wxAlive) return;
      try {
        const s = await api.wxConnectPoll(qrcode);
        if (!wxAlive) return;
        if (s.connected) { qrPolling = false; qrImg = ''; me = await api.me(); wxMsg = '✅ 微信已连接，去微信里跟她聊吧。'; return; }
        if (s.status === 'expired') { qrPolling = false; qrImg = ''; wxMsg = '二维码过期了，点"连接微信"重试。'; return; }
      } catch { /* 继续轮询 */ }
    }
    qrPolling = false;
  }
  async function disconnectWx() {
    try { await api.wxDisconnect(); me = await api.me(); qrImg = ''; wxMsg = '已断开微信连接。'; } catch (e) { wxMsg = e.message; }
  }
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
      <div class="card">
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

    <section class="block">
      <div class="card pad">
        {#if me.wechatChannel}
          <p class="status">已连接 · 微信里和 <b>{me.wechatChannel.lifeId}</b> 聊</p>
          <button class="btn-ghost btn" on:click={disconnectWx}>断开</button>
        {:else if qrImg}
          <img class="wxqr" src={qrImg} alt="微信连接二维码" />
          {#if qrPolling}<p class="caption">等待你扫码…</p>{/if}
        {:else}
          <button class="btn btn-secondary" on:click={connectWx}>连接微信</button>
        {/if}
        {#if wxMsg}<p class="ok">{wxMsg}</p>{/if}
      </div>
    </section>

    {#if pushSupported()}
      <section class="block">
        <div class="card pad">
          <button class="btn btn-secondary" on:click={turnOnPush}>开启推送通知</button>
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
  .me { max-width: var(--maxw); margin: 0 auto; padding: 0 var(--gutter) 96px; }
  .block { margin-top: var(--s6); }
  .block .section-title { margin: 0 2px 10px; }
  .pad { padding: 16px; }

  .pending { color: var(--accent); }
  .status { font-size: var(--fs-md); color: var(--muted); margin: 0 0 12px; }
  .sel { flex: 1; min-height: 44px; }
  .ok { color: var(--success); font-size: var(--fs-sm); margin: 10px 2px 0; }
  .wxqr { display: block; width: 200px; height: 200px; margin: 4px auto 6px; background: #fff; border-radius: var(--r-sm); padding: 8px; image-rendering: pixelated; }

  .row { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: var(--s3) var(--s4); border-bottom: 1px solid var(--border-subtle); }
  .row:last-child { border-bottom: 0; }
  .row.act { padding: var(--s3) var(--s4); }
  .rk { color: var(--faint); font-size: var(--fs-sm); }
  .rv { font-size: var(--fs-md); font-weight: 600; }

  .footer { display: flex; gap: 10px; margin-top: var(--s6); }
  .footer .btn { flex: 1; }
</style>

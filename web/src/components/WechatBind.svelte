<script>
  // 在「她的对话框」里就地开启/切换微信——一个微信只绑一条命，换谁就在谁的对话里点一下。
  // 自包含：自己拉 channel 状态、自己处理扫码/轮询/切换/断开；变化后向上 dispatch('change')。
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { api } from '../lib/api.js';
  import { qrDataUrl } from '../lib/qr.js';
  import Icon from './Icon.svelte';

  export let lifeId;
  const dispatch = createEventDispatcher();

  let channel = undefined; // undefined=加载中 / null=未连接 / { lifeId }=已连接（绑着某条命）
  let qrImg = '', polling = false, msg = '', busy = false;
  let alive = true; // 组件还在吗——离开页面后停止轮询，别在已销毁的实例上继续拉取/绑定

  async function refresh() {
    try { const me = await api.me(); if (alive) channel = me.wechatChannel || null; } catch { if (alive) channel = null; }
  }
  onMount(refresh);
  onDestroy(() => { alive = false; polling = false; }); // 关键：终止 pollConnect 循环，避免离开后还静默绑定

  async function connectHere() {
    msg = ''; busy = true;
    try {
      const r = await api.wxConnectStart();
      if (!r.qrcodeUrl) { msg = '微信没返回授权网址，稍后再试。'; busy = false; return; }
      qrImg = qrDataUrl(r.qrcodeUrl); // 把授权网址编码成二维码（不是去加载它）
      await pollConnect(r.qrcode);
    } catch (e) { msg = e.message || '连接失败'; }
    busy = false;
  }
  async function pollConnect(qrcode) {
    polling = true;
    for (let i = 0; i < 80 && polling && alive; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      if (!alive) return; // 离开了就别再绑定/改状态
      try {
        const s = await api.wxConnectPoll(qrcode);
        if (!alive) return;
        if (s.connected) {
          polling = false; qrImg = '';
          try { await api.setChannelLife(lifeId); } catch { /* 默认命也行，下面 refresh 会显示真值 */ } // 从她的对话连的 → 就绑她
          await refresh(); dispatch('change');
          msg = '连上了，微信里现在就和她聊。';
          return;
        }
        if (s.status === 'expired') { polling = false; qrImg = ''; msg = '二维码过期了，再点一次。'; return; }
      } catch { /* 继续轮询 */ }
    }
    polling = false;
  }
  async function switchToHer() {
    msg = ''; busy = true;
    try { await api.setChannelLife(lifeId); await refresh(); dispatch('change'); msg = '微信里现在和她聊。'; }
    catch (e) { msg = e.message; }
    busy = false;
  }
  async function disconnect() {
    msg = ''; busy = true;
    try { await api.wxDisconnect(); await refresh(); dispatch('change'); qrImg = ''; msg = '已断开微信。'; }
    catch (e) { msg = e.message; }
    busy = false;
  }
</script>

<div class="wb">
  {#if channel === undefined}
    <span class="wb-load">·</span>
  {:else if qrImg}
    <p class="wb-hint">用<b>微信扫这个码</b>授权，扫完确认后稍等几秒就好。</p>
    <img class="wb-qr" src={qrImg} alt="微信连接二维码" />
    {#if polling}<p class="wb-hint dim">等待你扫码…</p>{/if}
  {:else if !channel}
    <button class="wb-btn" on:click={connectHere} disabled={busy}><Icon name="qr" size={15} /> 在微信里也和她聊</button>
  {:else if channel.lifeId === lifeId}
    <div class="wb-on"><span class="wb-on-txt"><Icon name="qr" size={15} /> 微信里也在和她聊</span><button class="wb-x" on:click={disconnect} disabled={busy}>断开</button></div>
  {:else}
    <button class="wb-btn" on:click={switchToHer} disabled={busy}><Icon name="qr" size={15} /> 微信当前和 {channel.lifeId} 聊 · 改成和她</button>
  {/if}
  {#if channel}
    <p class="wb-tie">微信里的对话与这里【自动同步】——同一个你、同一段记忆。</p>
  {/if}
  {#if msg}<p class="wb-msg">{msg}</p>{/if}
</div>

<style>
  .wb { margin-top: 6px; }
  .wb-load { color: var(--faint); }
  .wb-btn { width: 100%; min-height: 40px; padding: 0 14px; border: 1px solid var(--border); border-radius: var(--r-sm); background: none; color: var(--muted); font: inherit; font-size: var(--fs-sm); display: inline-flex; align-items: center; justify-content: center; gap: 8px; transition: border-color var(--t-hover) ease, color var(--t-hover) ease; }
  .wb-btn:hover:not(:disabled) { border-color: var(--accent-line); color: var(--accent); }
  .wb-btn:disabled { opacity: 0.55; }
  .wb-on { display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 0 4px 0 14px; border: 1px solid var(--accent-line); border-radius: var(--r-sm); background: var(--accent-weak); color: var(--accent); font-size: var(--fs-sm); }
  .wb-on-txt { flex: 1; display: inline-flex; align-items: center; gap: 8px; }
  .wb-x { flex: none; min-height: 32px; padding: 0 12px; border: 0; background: none; color: var(--muted); font: inherit; font-size: var(--fs-sm); border-radius: var(--r-sm); }
  .wb-x:hover:not(:disabled) { color: var(--danger); }
  .wb-hint { font-size: var(--fs-sm); color: var(--muted); margin: 0 0 8px; text-align: center; }
  .wb-hint.dim { color: var(--faint); margin: 8px 0 0; }
  .wb-qr { display: block; width: 180px; height: 180px; margin: 0 auto; background: #fff; border-radius: var(--r-sm); padding: 8px; image-rendering: pixelated; }
  .wb-msg { font-size: var(--fs-sm); color: var(--success); margin: 8px 0 0; text-align: center; }
  .wb-tie { display: block; margin: 8px 0 0; color: var(--faint); font-size: var(--fs-xs); text-align: center; }
</style>

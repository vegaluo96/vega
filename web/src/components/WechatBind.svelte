<script>
  // 微信绑定（底部弹层）。关键：微信通道【一个账号只连一次】，连上后换哪条命聊
  // 只是改 active_life_id（setChannelLife）——已连接时绝不再让用户扫码。
  // 状态机：load(查通道) → 未连接走扫码(start/qr/scanned)；已连接走 same(就是她)/other(一键切换)；done/error 收尾。
  import { onMount, onDestroy } from 'svelte';
  import { api } from '../lib/api.js';
  import { qrDataUrl } from '../lib/qr.js';
  import Sheet from './Sheet.svelte';
  import Creature from './Creature.svelte';
  import Icon from './Icon.svelte';

  export let lifeId = null;
  export let onClose = () => {};

  let phase = 'load'; // load | start | qr | scanned | same | other | done | error
  let channel = null; // { lifeId } | null —— 当前账号的微信通道
  let qrImg = '';
  let msg = '';
  let doneText = '';
  let busy = false;
  let alive = true;

  onMount(async () => {
    // 先查通道：已连接 → 不出二维码（切换/断开就地完成）；未连接 → 才走扫码。
    try { const me = await api.me(); channel = me.wechatChannel || null; } catch { channel = null; }
    if (!alive) return;
    if (!channel) return begin();
    phase = (!lifeId || channel.lifeId === lifeId) ? 'same' : 'other';
  });
  onDestroy(() => { alive = false; });

  async function begin() {
    phase = 'start'; msg = '';
    try {
      const r = await api.wxConnectStart();
      if (!r.qrcodeUrl) { phase = 'error'; msg = '微信没返回授权网址，稍后再试。'; return; }
      qrImg = qrDataUrl(r.qrcodeUrl);
      phase = 'qr';
      await poll(r.qrcode);
    } catch (e) { phase = 'error'; msg = e.message || '连接失败'; }
  }
  async function poll(qrcode) {
    for (let i = 0; i < 80 && alive && phase === 'qr'; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      if (!alive) return;
      try {
        const s = await api.wxConnectPoll(qrcode, lifeId || undefined);
        if (!alive) return;
        if (s.connected) {
          phase = 'scanned';
          if (lifeId) { try { await api.setChannelLife(lifeId); } catch { /* 默认命也行 */ } }
          await new Promise((r) => setTimeout(r, 700));
          if (alive) { doneText = `现在，在微信里也能找到${lifeId ? ' ' + lifeId : '她'}了。`; phase = 'done'; }
          return;
        }
        if (s.status === 'expired') { phase = 'error'; msg = '二维码过期了，重开一次。'; return; }
      } catch { /* 继续轮询 */ }
    }
  }
  // 已连接、想换条命聊：一键切换，不重扫。
  async function switchToHer() {
    if (busy) return; busy = true;
    try {
      await api.setChannelLife(lifeId);
      channel = { lifeId };
      doneText = `已切换——微信里现在和 ${lifeId} 聊。`;
      phase = 'done';
    } catch (e) { phase = 'error'; msg = e.message || '切换失败'; }
    busy = false;
  }
  async function disconnect() {
    if (busy) return; busy = true;
    try { await api.wxDisconnect(); channel = null; doneText = '已断开微信。想再连，随时回来扫一下。'; phase = 'done'; }
    catch (e) { phase = 'error'; msg = e.message || '断开失败'; }
    busy = false;
  }
</script>

<Sheet title="绑定微信" {onClose}>
  {#if phase === 'load'}
    <div class="center"><span class="ld">·</span></div>
  {:else if phase === 'qr' || phase === 'start'}
    <div class="qrwrap">
      <p class="caption hint">用微信扫一扫，在手机上也能找回同一个她。</p>
      <div class="qrbox">{#if qrImg}<img src={qrImg} alt="微信连接二维码" />{:else}<span class="ld">·</span>{/if}</div>
      <p class="meta wait"><span class="shimmer ldot"></span> 等待扫码…</p>
    </div>
  {:else if phase === 'scanned'}
    <div class="center"><span class="wxic"><Icon name="wechat" size={44} /></span><p class="t">已扫码，正在连接…</p></div>
  {:else if phase === 'same'}
    <div class="center">
      <span class="cre"><Creature life={{ id: channel.lifeId || 'vega', emotion: '温暖', awake: true }} size={84} /></span>
      <p class="t">微信已连接</p>
      <p class="caption">微信里正在和 {channel.lifeId || '她'} 聊——两边【自动同步】，同一个你、同一段记忆。</p>
      <button class="btn btn-soft ok" on:click={onClose}>好的</button>
      <button class="linkbtn" on:click={disconnect} disabled={busy}>断开微信</button>
    </div>
  {:else if phase === 'other'}
    <div class="center">
      <span class="cre"><Creature life={{ id: lifeId, emotion: '好奇', awake: true }} size={84} /></span>
      <p class="t">微信当前和 {channel.lifeId} 聊</p>
      <p class="caption">微信已连接，不用重新扫码——一键改成和 {lifeId} 聊。</p>
      <button class="btn ok" on:click={switchToHer} disabled={busy}>{busy ? '稍等…' : `改成和 ${lifeId} 聊`}</button>
      <button class="linkbtn" on:click={onClose}>先不换</button>
    </div>
  {:else if phase === 'done'}
    <div class="center">
      <span class="cre"><Creature life={{ id: lifeId || (channel && channel.lifeId) || 'vega', emotion: '温暖', awake: true }} size={84} reaction="respond" /></span>
      <p class="t">好了</p>
      <p class="caption">{doneText}</p>
      <button class="btn btn-soft ok" on:click={onClose}>好的</button>
    </div>
  {:else}
    <div class="center"><p class="t">{msg}</p><button class="btn btn-soft ok" on:click={begin}>重试</button></div>
  {/if}
</Sheet>

<style>
  .qrwrap { text-align: center; padding: 8px 0 4px; }
  .hint { margin-bottom: 18px; }
  .qrbox { width: 200px; height: 200px; margin: 0 auto; border-radius: var(--r-md); background: #fff; display: grid; place-items: center; box-shadow: inset 0 0 0 1px var(--border); overflow: hidden; }
  .qrbox img { width: 184px; height: 184px; image-rendering: pixelated; }
  .ld { color: var(--faint); }
  .wait { margin-top: 16px; display: inline-flex; gap: 8px; align-items: center; }
  .ldot { width: 8px; height: 8px; border-radius: 50%; }
  .center { text-align: center; padding: 24px 0; }
  .wxic { color: var(--success); display: inline-grid; place-items: center; }
  .cre { display: inline-grid; place-items: center; }
  .center .t { font-weight: 700; font-size: var(--fs-lg); margin-top: 12px; }
  .center .caption { margin-top: 8px; line-height: 1.7; }
  .ok { margin-top: 20px; }
  .linkbtn { display: block; margin: 14px auto 0; background: none; border: 0; color: var(--muted); font-size: var(--fs-sm); }
  .linkbtn:hover:not(:disabled) { color: var(--danger); }
  .linkbtn:disabled { opacity: 0.5; }
</style>

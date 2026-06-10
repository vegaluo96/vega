<script>
  // 微信扫码绑定（底部弹层）：start → 出二维码 → 轮询 → connected → setChannelLife → 成功。接真实 api。
  import { onMount, onDestroy } from 'svelte';
  import { api } from '../lib/api.js';
  import { qrDataUrl } from '../lib/qr.js';
  import Sheet from './Sheet.svelte';
  import Creature from './Creature.svelte';
  import Icon from './Icon.svelte';

  export let lifeId = null;
  export let onClose = () => {};

  let phase = 'start'; // start | qr | scanned | done | error
  let qrImg = '';
  let msg = '';
  let alive = true;

  onMount(begin);
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
          if (alive) phase = 'done';
          return;
        }
        if (s.status === 'expired') { phase = 'error'; msg = '二维码过期了，重开一次。'; return; }
      } catch { /* 继续轮询 */ }
    }
  }
</script>

<Sheet title="绑定微信" {onClose}>
  {#if phase === 'qr' || phase === 'start'}
    <div class="qrwrap">
      <p class="caption hint">用微信扫一扫，在手机上也能找回同一个她。</p>
      <div class="qrbox">{#if qrImg}<img src={qrImg} alt="微信连接二维码" />{:else}<span class="ld">·</span>{/if}</div>
      <p class="meta wait"><span class="shimmer ldot"></span> 等待扫码…</p>
    </div>
  {:else if phase === 'scanned'}
    <div class="center"><span class="wxic"><Icon name="wechat" size={44} /></span><p class="t">已扫码，正在连接…</p></div>
  {:else if phase === 'done'}
    <div class="center">
      <span class="cre"><Creature life={{ id: lifeId || 'vega', emotion: '温暖', awake: true }} size={84} reaction="respond" /></span>
      <p class="t">绑定成功</p>
      <p class="caption">现在，在微信里也能找到{lifeId ? ' ' + lifeId : '她'}了。</p>
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
  .ok { margin-top: 20px; }
</style>

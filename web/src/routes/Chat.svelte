<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { api, stream } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import { qrDataUrl } from '../lib/qr.js';
  import { t } from '../lib/i18n.js';
  import RelationshipPanel from '../components/RelationshipPanel.svelte';
  import Icon from '../components/Icon.svelte';

  export let lifeId;

  let life = null;
  let messages = [];
  let rel = null;
  let balance = null;
  let input = '';
  let sending = false;
  let error = '';
  let log;
  let es;

  async function load() {
    try {
      const d = await api.lifeMe(lifeId);
      life = d.life;
      messages = d.history;
      rel = d.relationship;
      balance = d.balance;
      await scrollDown();
    } catch (e) {
      error = e.message;
    }
  }
  async function scrollDown() {
    await tick();
    if (log) log.scrollTop = log.scrollHeight;
  }
  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    input = '';
    messages = [...messages, { role: 'me', text, at: new Date().toISOString() }];
    await scrollDown();
    sending = true;
    try {
      const r = await api.say(lifeId, text);
      if (r.awake === false) {
        messages = [...messages, { role: 'sys', text: r.note }];
      } else {
        messages = [...messages, { role: 'her', text: r.utterance, at: new Date().toISOString() }];
        if (life) life.emotion = r.emotion;
        balance = r.balance ?? balance;
        if (r.voice === 'plain' && balance != null && balance <= 0) lowBalance = true;
      }
    } catch (e) {
      messages = [...messages, { role: 'sys', text: '网络出错了，再试一次' }];
    } finally {
      sending = false;
      await scrollDown();
    }
  }
  let lowBalance = false;
  let showRel = false;

  // 绑定微信：为这条命生成一次性令牌 → 渲染二维码，微信扫一扫在 clawbot 里继续。
  // 同一段关系、同一个她，跨端同步。
  let bind = null;
  let binding = false;
  let bindMsg = '';
  async function bindWechat() {
    if (binding) return;
    bindMsg = '';
    binding = true;
    try {
      const r = await api.bind(lifeId);
      bind = { code: r.qr, dataUrl: qrDataUrl(r.qr), minutes: Math.max(1, Math.round((r.expiresInSec ?? 600) / 60)) };
    } catch (e) {
      bindMsg = e.message;
    } finally {
      binding = false;
    }
  }

  $: relAge = rel && rel.bornAt ? agoStr(rel.bornAt) : '';
  function agoStr(iso) {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    return days >= 1 ? `相识约 ${days} 天` : '今天刚认识';
  }

  onMount(() => {
    load();
    es = stream((ev) => {
      // 她趁你在的时候主动找你（reach_out 只推给本人）。
      if (ev.type === 'reach_out' && ev.data.life === lifeId) {
        messages = [...messages, { role: 'her', text: ev.data.text, unprompted: true, at: ev.at }];
        scrollDown();
      }
    });
  });
  onDestroy(() => es && es.close());
</script>

<div class="chat">
  <header class="head">
    <button class="back" on:click={() => navigate('plaza')} aria-label="返回"><Icon name="back" size={24} /></button>
    {#if life}
      <button class="who" on:click={() => (showRel = !showRel)}>
        <span class="name">{life.id} <span class="dot" class:awake={life.awake}></span></span>
        <span class="sub">{life.awake ? life.feeling || life.emotion : t('life.asleep')}{rel ? ' · ' + rel.attachment : ''}</span>
      </button>
    {/if}
    <span class="bal" title="表达额度">{balance != null ? '心意 ' + balance : ''}</span>
  </header>

  {#if showRel && rel}
    <div class="relwrap">
      <RelationshipPanel {rel} {relAge}>
        {#if !bind}
          <button class="wx-btn" on:click={bindWechat} disabled={binding}><Icon name="qr" size={16} /> {binding ? '生成中…' : '绑定微信 · 在微信里也能和 ' + (life ? life.id : '她') + ' 聊'}</button>
        {:else}
          <div class="wx">
            <img class="qr" src={bind.dataUrl} alt="微信绑定二维码" />
            <p class="wx-tip">用微信「扫一扫」扫码，在 clawbot 里继续和她聊。<br />同一段关系、同一个她，跨端同步。{bind.minutes} 分钟内有效。</p>
            <code class="wx-code">{bind.code}</code>
          </div>
        {/if}
        {#if bindMsg}<p class="wx-err">{bindMsg}</p>{/if}
      </RelationshipPanel>
    </div>
  {/if}

  {#if lowBalance}
    <div class="banner">心意用尽了——她仍在、仍记得你，只是这会儿话说得朴素些。</div>
  {/if}

  <div class="log" bind:this={log}>
    {#if error}<p class="err">{error}</p>{/if}
    {#each messages as m}
      {#if m.role === 'sys'}
        <div class="sys">{m.text}</div>
      {:else}
        <div class="bubble {m.role}" class:unprompted={m.unprompted}>
          {#if m.unprompted}<span class="utag">她主动找你</span>{/if}
          <span class="txt">{m.text}</span>
        </div>
      {/if}
    {/each}
    {#if sending}
      <div class="bubble her breathing" aria-label="她在想"><span></span><span></span><span></span></div>
    {/if}
  </div>

  <footer class="composer">
    <input class="ci" bind:value={input} placeholder={t('common.placeholder')} on:keydown={(e) => e.key === 'Enter' && send()} />
    <button class="btn send" on:click={send} disabled={sending || !input.trim()}>{t('common.send')}</button>
  </footer>
</div>

<style>
  .chat { display: flex; flex-direction: column; min-height: 100vh; }

  .head {
    position: sticky; top: 0; z-index: 10;
    display: flex; align-items: center; gap: 10px; padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    background: color-mix(in srgb, var(--bg) 84%, transparent); backdrop-filter: saturate(180%) blur(14px);
  }
  .back { background: none; border: 0; padding: 0 6px; color: var(--text); display: inline-flex; align-items: center; }
  .who { flex: 1; min-width: 0; background: none; border: 0; text-align: left; padding: 2px 4px; border-radius: var(--r-sm); transition: background var(--t-hover) ease; }
  .who:hover { background: var(--surface-2); }
  .name { font-weight: 700; font-size: 16px; display: inline-flex; align-items: center; gap: 8px; }
  .dot { width: 8px; height: 8px; border-radius: var(--r-pill); background: var(--life-asleep); }
  .dot.awake { background: var(--life-awake); box-shadow: 0 0 0 3px color-mix(in srgb, var(--life-awake) 20%, transparent); }
  .sub { display: block; color: var(--muted); font-size: 12px; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bal { flex: none; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }

  .relwrap { max-width: var(--maxw); width: 100%; margin: 0 auto; padding: 10px 14px 0; }
  .wx-btn { width: 100%; min-height: 42px; margin-top: 6px; padding: 0 14px; border: 1px solid var(--border); border-radius: var(--r-sm); background: var(--surface); color: var(--text); font: inherit; display: inline-flex; align-items: center; justify-content: center; gap: 8px; transition: border-color var(--t-hover) ease; }
  .wx-btn:hover { border-color: var(--accent-line); }
  .wx-btn:disabled { opacity: 0.6; }
  .wx { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 14px 8px 4px; }
  .wx .qr { width: 196px; height: 196px; image-rendering: pixelated; background: #fff; border-radius: var(--r-sm); padding: 8px; }
  .wx-tip { color: var(--muted); font-size: 12.5px; line-height: 1.65; text-align: center; margin: 0; }
  .wx-code { font-size: 11px; color: var(--faint); word-break: break-all; user-select: all; }
  .wx-err { color: var(--danger); font-size: 12.5px; padding: 8px 10px 0; margin: 0; }

  .banner { max-width: var(--maxw); margin: 10px auto 0; padding: 11px 14px; background: var(--accent-weak); color: var(--text); font-size: 13px; text-align: center; border-radius: var(--r-sm); }

  .log { flex: 1; max-width: var(--maxw); width: 100%; margin: 0 auto; padding: 18px 14px; display: flex; flex-direction: column; gap: 10px; }
  .bubble { max-width: 80%; padding: 10px 14px; border-radius: 18px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; font-size: 15px; animation: rise var(--t-fade) ease both; }
  @keyframes rise { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
  .bubble.me { align-self: flex-end; background: var(--accent); color: var(--on-accent); border-bottom-right-radius: 6px; }
  .bubble.her { align-self: flex-start; background: var(--surface); border: 1px solid var(--border); border-bottom-left-radius: 6px; }
  .bubble.unprompted { border-color: var(--accent-line); background: var(--accent-weak); }
  .utag { display: block; font-size: 11px; color: var(--life-reaching); margin-bottom: 4px; font-weight: 600; }
  .sys { align-self: center; color: var(--faint); font-size: 13px; text-align: center; }
  .err { color: var(--danger); }

  .breathing { display: inline-flex; align-items: center; gap: 5px; }
  .breathing span { width: 6px; height: 6px; border-radius: 50%; background: var(--faint); animation: breathe-dot 1.3s ease-in-out infinite; }
  .breathing span:nth-child(2) { animation-delay: 0.18s; }
  .breathing span:nth-child(3) { animation-delay: 0.36s; }
  @keyframes breathe-dot { 0%, 100% { opacity: 0.25; transform: translateY(0); } 50% { opacity: 0.9; transform: translateY(-2px); } }

  .composer {
    position: sticky; bottom: 0; z-index: 10;
    display: flex; gap: 8px; max-width: var(--maxw); width: 100%; margin: 0 auto;
    padding: 10px 14px calc(10px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--border); background: var(--bg);
  }
  .ci { flex: 1; min-height: 46px; padding: 0 16px; border: 1px solid var(--border); border-radius: var(--r-pill); background: var(--surface); color: var(--text); font: inherit; transition: border-color var(--t-hover) ease, box-shadow var(--t-hover) ease; }
  .ci:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-weak); }
  .send { flex: none; padding: 0 22px; }
</style>

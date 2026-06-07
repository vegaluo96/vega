<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { api, stream } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import { t } from '../lib/i18n.js';

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

<header>
  <button class="back" on:click={() => navigate('plaza')}>‹</button>
  {#if life}
    <button class="who" on:click={() => (showRel = !showRel)}>
      <div class="name">{life.id} <span class="dot" class:awake={life.awake}></span></div>
      <div class="mood">{life.awake ? life.feeling || life.emotion : t('life.asleep')}{rel ? ' · ' + rel.attachment : ''}</div>
    </button>
  {/if}
  <div class="bal" title="心意值">{balance != null ? balance + ' 心意' : ''}</div>
</header>

{#if showRel && rel}
  <div class="rel">
    <div class="rel-row"><span class="k">你们</span><span>{relAge}</span></div>
    <div class="rel-row"><span class="k">她对你</span><span>{rel.attachment}</span></div>
    {#if rel.understanding}<div class="rel-row"><span class="k">她的理解</span><span class="u">{rel.understanding}</span></div>{/if}
  </div>
{/if}

{#if lowBalance}
  <div class="banner">心意用尽了——她仍在、仍记得你，只是这会儿话说得朴素些。<a href="#recharge" on:click|preventDefault>充值恢复</a></div>
{/if}

<div class="log" bind:this={log}>
  {#if error}<p class="err">{error}</p>{/if}
  {#each messages as m}
    {#if m.role === 'sys'}
      <div class="sys">{m.text}</div>
    {:else}
      <div class="bubble {m.role}" class:unprompted={m.unprompted}>
        {#if m.unprompted}<div class="tag">她主动找你</div>{/if}
        {m.text}
      </div>
    {/if}
  {/each}
  {#if sending}<div class="bubble her typing">…</div>{/if}
</div>

<footer>
  <input bind:value={input} placeholder={t('common.placeholder')} on:keydown={(e) => e.key === 'Enter' && send()} />
  <button class="btn" on:click={send} disabled={sending || !input.trim()}>{t('common.send')}</button>
</footer>

<style>
  header { position: sticky; top: 0; display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--border); background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(10px); z-index: 10; }
  .back { background: none; border: 0; color: var(--text); font-size: 28px; line-height: 1; padding: 0 6px; }
  .who { flex: 1; background: none; border: 0; color: var(--text); text-align: left; padding: 0; cursor: pointer; }
  .name { font-weight: 700; display: flex; align-items: center; gap: 8px; }
  .rel { max-width: var(--maxw); margin: 0 auto; padding: 4px 16px 0; }
  .rel-row { display: flex; gap: 12px; padding: 10px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); margin-bottom: 6px; font-size: 14px; }
  .rel-row .k { color: var(--muted); flex: none; width: 56px; }
  .rel-row .u { color: var(--muted); }
  .dot { width: 8px; height: 8px; border-radius: 999px; background: var(--muted); }
  .dot.awake { background: #3fb950; }
  .mood { color: var(--muted); font-size: 12px; }
  .bal { color: var(--muted); font-size: 12px; }
  .banner { padding: 10px 14px; background: var(--accent-soft); color: var(--text); font-size: 13px; text-align: center; }
  .log { max-width: var(--maxw); margin: 0 auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; min-height: calc(100vh - 130px); }
  .bubble { max-width: 80%; padding: 10px 14px; border-radius: 16px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
  .bubble.me { align-self: flex-end; background: var(--accent); color: var(--on-accent); border-bottom-right-radius: 5px; }
  .bubble.her { align-self: flex-start; background: var(--surface); border: 1px solid var(--border); border-bottom-left-radius: 5px; }
  .bubble.unprompted { border-color: var(--accent); }
  .tag { font-size: 11px; color: var(--accent); margin-bottom: 4px; font-weight: 600; }
  .typing { color: var(--muted); }
  .sys { align-self: center; color: var(--muted); font-size: 13px; }
  .err { color: var(--danger); }
  footer { position: sticky; bottom: 0; display: flex; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--border); background: var(--bg); }
  footer input { flex: 1; padding: 11px 14px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); color: var(--text); font: inherit; }
  footer input:focus { outline: none; border-color: var(--accent); }
</style>

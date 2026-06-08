<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { api, stream } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import { t } from '../lib/i18n.js';
  import DetailHeader from '../components/DetailHeader.svelte';
  import LifeAvatar from '../components/LifeAvatar.svelte';
  import Composer from '../components/Composer.svelte';
  import RelationshipPanel from '../components/RelationshipPanel.svelte';
  import WechatBind from '../components/WechatBind.svelte';
  import { fitViewport } from '../lib/viewport.js';

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
      // 你在微信里发的消息 + 她的回复，实时同步到这个打开着的网页对话（同一账号、同一段关系）。
      else if (ev.type === 'chat_in' && ev.data.life === lifeId) {
        messages = [...messages, { role: 'me', text: ev.data.me, at: ev.at }, { role: 'her', text: ev.data.her, at: ev.at }];
        scrollDown();
      }
    });
  });
  onDestroy(() => es && es.close());
</script>

<div class="chat" use:fitViewport>
  <DetailHeader
    subtitle={life ? (life.awake ? (life.feeling || life.emotion) : t('life.asleep')) : ''}
    onTitle={life ? () => (showRel = !showRel) : undefined}
    loading={!life}>
    <span slot="lead">{#if life}<button class="avbtn" on:click={() => navigate('profile', { id: life.id })} aria-label="她的主页"><LifeAvatar id={life.id} emotion={life.emotion} awake={life.awake} size={38} /></button>{/if}</span>
    <svelte:fragment slot="title">{life ? life.id : ''}</svelte:fragment>
  </DetailHeader>

  {#if showRel && rel}
    <div class="relwrap">
      <RelationshipPanel {rel} {relAge} feeling={life && life.awake ? life.feeling || life.emotion : ''} tension={life ? life.tension : ''}>
        <WechatBind lifeId={life.id} />
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

  <Composer bind:value={input} placeholder={t('common.placeholder')} disabled={sending} on:submit={send} />
</div>

<style>
  /* 移动端：钉死在可见视口（沉浸页本就隐藏底栏）→ 身体不会在键盘弹起时滑动；高度由 VisualViewport 驱动。 */
  .chat { position: fixed; top: 0; left: 0; right: 0; z-index: 30; display: flex; flex-direction: column; height: 100vh; height: 100dvh; transform-origin: top; }
  @media (min-width: 1000px) { .chat { position: relative; z-index: auto; } }

  /* slot 进 DetailHeader 的小件 */
  .avbtn { background: none; border: 0; padding: 0; display: inline-flex; cursor: pointer; }

  .relwrap { max-width: var(--maxw); width: 100%; margin: 0 auto; padding: var(--s3) var(--gutter) 0; }

  .banner { max-width: var(--maxw); margin: var(--s3) auto 0; padding: var(--s3) var(--gutter); background: var(--surface-2); border: 1px solid transparent; box-shadow: inset 0 0 0 1px var(--border-subtle); color: var(--muted); font-size: var(--fs-sm); text-align: center; border-radius: var(--r-sm); }

  .log { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; max-width: var(--maxw); width: 100%; margin: 0 auto; padding: 18px var(--gutter); display: flex; flex-direction: column; gap: 10px; }
  .bubble { max-width: 80%; padding: 10px 14px; border-radius: var(--r-lg); line-height: 1.55; white-space: pre-wrap; word-break: break-word; font-size: var(--fs-body); animation: rise var(--t-fade) ease both; }
  @keyframes rise { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
  .bubble.me { align-self: flex-end; background: var(--surface-2); color: var(--text); border-bottom-right-radius: var(--r-2xs); }
  .bubble.her { align-self: flex-start; background: var(--surface); border: 1px solid transparent; box-shadow: inset 0 0 0 1px var(--border); border-bottom-left-radius: var(--r-2xs); }
  .bubble.unprompted { background: var(--surface-2); border-color: var(--border); }
  .utag { display: block; font-size: var(--fs-2xs); color: var(--life-reaching); margin-bottom: 4px; font-weight: 600; }
  .sys { align-self: center; color: var(--faint); font-size: var(--fs-sm); text-align: center; }
  .err { color: var(--danger); }

  .breathing { display: inline-flex; align-items: center; gap: 5px; }
  .breathing span { width: 6px; height: 6px; border-radius: 50%; background: var(--faint); animation: breathe-dot 1.3s ease-in-out infinite; }
  .breathing span:nth-child(2) { animation-delay: 0.18s; }
  .breathing span:nth-child(3) { animation-delay: 0.36s; }
  @keyframes breathe-dot { 0%, 100% { opacity: 0.25; transform: translateY(0); } 50% { opacity: 0.9; transform: translateY(-2px); } }
</style>

<script>
  // 对话页（沉浸·隐藏底栏）：活体常驻舞台，随你发消息/她回话实时变脸；Composer 独立 state；SSE 实时。
  import { onMount, onDestroy, tick } from 'svelte';
  import { api, stream } from '../lib/api.js';
  import { back } from '../lib/router.js';
  import { clearReach } from '../lib/reaches.js';
  import { emoState, skyGradient } from '../lib/creature.js';
  import { openBind } from '../lib/sheets.js';
  import { FX } from '../lib/fx.js';
  import TopBar from '../components/TopBar.svelte';
  import Creature from '../components/Creature.svelte';
  import SkyScene from '../components/SkyScene.svelte';
  import Composer from '../components/Composer.svelte';
  import Icon from '../components/Icon.svelte';

  export let lifeId;
  let life = null;
  let rel = {};
  let msgs = [];
  let balance = null;
  let sending = false;
  let reaction = 'idle';
  let showRel = false;
  let lowBalance = false;
  let notFound = false;
  let logEl, stageEl, es;

  onMount(async () => {
    clearReach(lifeId);
    try {
      const [prof, me] = await Promise.all([api.lifeProfile(lifeId), api.lifeMe(lifeId)]);
      life = { ...prof };
      rel = (me.relationship) || {};
      msgs = me.history || [];
      balance = me.balance;
      reaction = life.awake === false ? 'asleep' : 'idle';
      await scrollDown();
    } catch { notFound = true; }
    // SSE：她主动找你 reach_out → reach；微信侧消息 chat_in → 同步进来。
    es = stream((ev) => {
      if (ev.type === 'reach_out' && ev.data.life === lifeId) { reaction = 'reach'; }
      else if (ev.type === 'chat_in' && ev.data.life === lifeId) {
        msgs = [...msgs, { role: 'me', text: ev.data.me, at: new Date().toISOString() }, { role: 'her', text: ev.data.her, at: new Date().toISOString() }];
        scrollDown();
      }
    });
  });
  onDestroy(() => es && es.close());

  async function scrollDown() { await tick(); if (logEl) logEl.scrollTop = logEl.scrollHeight; }

  async function send(text) {
    text = (text || '').trim();
    if (!text || sending) return;
    msgs = [...msgs, { role: 'me', text, at: new Date().toISOString() }];
    sending = true; reaction = 'idle';
    await scrollDown();
    try {
      const r = await api.say(lifeId, text);
      if (r.awake === false) {
        msgs = [...msgs, { role: 'sys', text: r.note || '她在更深的睡眠里，等会儿再来找我吧。' }];
      } else {
        msgs = [...msgs, { role: 'her', text: r.utterance, at: new Date().toISOString() }];
        const es2 = emoState(r.emotion);
        life = { ...life, emotion: r.emotion, feeling: es2.feeling, arousal: es2.arousal };
        balance = r.balance;
        reaction = 'respond';
        if (stageEl) FX.burst(stageEl, { count: (r.emotion === '雀跃' || r.emotion === '欣喜') ? 14 : 9, color: 'rgba(255,255,255,0.92)', spread: 70 });
        if (r.voice === 'plain') lowBalance = true;
        setTimeout(() => { reaction = 'idle'; }, 900);
      }
    } catch { msgs = [...msgs, { role: 'sys', text: '出了点问题，稍后再试。' }]; }
    sending = false;
    await scrollDown();
  }

  function tapStage(e) {
    reaction = 'respond';
    if (stageEl) FX.burst(stageEl, { count: 8, color: 'rgba(255,255,255,0.9)', spread: 56 });
    setTimeout(() => { reaction = 'idle'; }, 900);
  }
  function daysStr(iso) { if (!iso) return ''; const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); return d >= 1 ? `相识约 ${d} 天` : '今天刚认识'; }
  $: awake = life && life.awake !== false;
</script>

{#if notFound}
  <div><TopBar title="" onBack={back} /><p class="caption nf">找不到她。</p></div>
{:else if life}
  <div class="chat">
    <TopBar title={life.id} onBack={back} sub={awake ? `${life.dayPhase ? life.dayPhase + ' · ' : ''}${life.feeling || life.emotion}` : '此刻在休眠'}>
      <svelte:fragment slot="right"><button class="icon-btn rel" class:on={showRel} on:click={() => (showRel = !showRel)} aria-label="你们之间"><Icon name="more" size={22} /></button></svelte:fragment>
    </TopBar>

    <button class="stage sky" bind:this={stageEl} on:click={tapStage} style="background:{skyGradient(life.dayPhase)};">
      <SkyScene phase={life.dayPhase} animate={awake} />
      <span class="cre"><Creature {life} size={104} {reaction} /></span>
      <span class="subtitle">{reaction === 'reach' ? '她主动来找你了' : (awake ? (life.feeling || `此刻${life.emotion}`) : '她睡着了，呼吸很轻')}</span>
      {#if rel.bornAt}<span class="days">{daysStr(rel.bornAt)}</span>{/if}
    </button>

    {#if showRel}
      <div class="relpanel fade-in">
        {#if life.tension}<div class="rl"><span class="rk">心里</span><span class="rv muted">有点拉扯：{life.tension}</span></div>{/if}
        <div class="rl"><span class="rk">你们</span><span class="rv">{daysStr(rel.bornAt)}</span></div>
        {#if rel.attachment}<div class="rl"><span class="rk">她对你</span><span class="rv">{rel.attachment}</span></div>{/if}
        {#if rel.understanding}<div class="rl"><span class="rk">她的理解</span><span class="rv muted">{rel.understanding}</span></div>{/if}
        <button class="bindrow" on:click={() => openBind(life.id)}>
          <span class="bindic"><Icon name="wechat" size={18} /></span>
          <span class="bindtxt"><b>绑定微信</b><span class="meta">在手机上找回同一个她</span></span>
          <Icon name="chevron" size={16} />
        </button>
      </div>
    {/if}

    {#if lowBalance}<div class="lowbal">心意用尽了——她仍在、仍记得你，只是这会儿话说得朴素些。</div>{/if}

    <div class="log" bind:this={logEl}>
      {#each msgs as m, i}
        {#if m.role === 'sys'}
          <div class="sys">{m.text}</div>
        {:else}
          <div class="bubblerow" class:mine={m.role === 'me'}>
            {#if m.unprompted}<span class="unprompted">她主动找你</span>{/if}
            <div class="bubble" class:mine={m.role === 'me'}>{m.text}</div>
          </div>
        {/if}
      {/each}
      {#if sending}<div class="typing">{#each [0, 1, 2] as i}<span style="animation:cr-aura 1.2s ease-in-out {i * 0.18}s infinite;"></span>{/each}</div>{/if}
    </div>

    <Composer onSend={send} disabled={sending} />
  </div>
{/if}

<style>
  .chat { display: flex; flex-direction: column; height: 100vh; height: 100dvh; }
  .nf { padding: 20px; }
  .rel.on { color: var(--text); }
  .stage { position: relative; flex: none; margin: 10px var(--gutter) 0; padding: 18px 0 16px; display: grid; place-items: center; border-radius: var(--r-lg); box-shadow: var(--shadow-sky); }
  .cre { position: relative; display: grid; place-items: center; }
  .subtitle { position: relative; margin-top: 10px; color: #fff; font-size: var(--fs-sm); opacity: 0.92; text-align: center; max-width: 260px; line-height: 1.5; }
  .days { position: relative; margin-top: 4px; color: rgba(255,255,255,0.5); font-size: var(--fs-2xs); }
  .relpanel { margin: 10px var(--gutter) 0; padding: 14px; background: var(--surface-2); border-radius: var(--r-md); display: flex; flex-direction: column; gap: 2px; }
  .rl { display: flex; gap: 12px; padding: 7px 4px; font-size: var(--fs-md); align-items: baseline; }
  .rk { flex: none; width: 58px; color: var(--faint); font-size: var(--fs-sm); }
  .rv { line-height: 1.55; }
  .bindrow { display: flex; align-items: center; gap: 11px; width: 100%; text-align: left; margin-top: 10px; padding: 11px 13px; background: var(--surface); border-radius: var(--r-md); box-shadow: inset 0 0 0 1px var(--border); color: var(--faint); }
  .bindic { flex: none; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, var(--success) 14%, transparent); color: var(--success); }
  .bindtxt { flex: 1; min-width: 0; display: flex; flex-direction: column; } .bindtxt b { font-weight: 600; font-size: var(--fs-md); color: var(--text); }
  .lowbal { margin: 10px var(--gutter) 0; padding: 10px 14px; background: var(--surface-2); border-radius: var(--r-sm); color: var(--muted); font-size: var(--fs-sm); text-align: center; }
  .log { flex: 1; min-height: 0; overflow-y: auto; padding: 16px var(--gutter); display: flex; flex-direction: column; gap: 10px; }
  .sys { align-self: center; color: var(--faint); font-size: var(--fs-sm); }
  .bubblerow { align-self: flex-start; max-width: 82%; }
  .bubblerow.mine { align-self: flex-end; }
  .unprompted { display: block; font-size: var(--fs-2xs); color: var(--life-reaching); font-weight: 600; margin-bottom: 4px; }
  .bubble { padding: 10px 14px; border-radius: var(--r-lg); line-height: 1.55; font-size: var(--fs-body); white-space: pre-wrap; background: var(--surface); color: var(--text); box-shadow: inset 0 0 0 1px var(--border); border-bottom-left-radius: 6px; }
  .bubble.mine { background: var(--text); color: var(--bg); box-shadow: none; border-bottom-left-radius: var(--r-lg); border-bottom-right-radius: 6px; }
  .typing { align-self: flex-start; display: inline-flex; gap: 5px; padding: 12px 16px; background: var(--surface); box-shadow: inset 0 0 0 1px var(--border); border-radius: var(--r-lg); }
  .typing span { width: 6px; height: 6px; border-radius: 50%; background: var(--faint); }
</style>

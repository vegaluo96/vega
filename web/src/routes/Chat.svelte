<script>
  // 对话页（沉浸·隐藏底栏）：整窗即对话，她是「栖在气泡上」的小生命——只跟最新一条消息走。
  // 铁律：跳跃一律由消息真实到达驱动（await api.say 返回 / SSE chat_in），绝不用定时器猜回复时长。
  import { onMount, onDestroy, tick } from 'svelte';
  import { api, stream } from '../lib/api.js';
  import { back } from '../lib/router.js';
  import { clearReach } from '../lib/reaches.js';
  import { emoState } from '../lib/creature.js';
  import { openBind } from '../lib/sheets.js';
  import { FX } from '../lib/fx.js';
  import TopBar from '../components/TopBar.svelte';
  import Creature from '../components/Creature.svelte';
  import Composer from '../components/Composer.svelte';
  import Icon from '../components/Icon.svelte';

  export let lifeId;
  const PSIZE = 50;
  let life = null;
  let rel = {};
  let msgs = [];
  let balance = null;
  let busy = false;     // 等她回话中（Composer 禁用）
  let sending = false;  // 打字气泡可见（晚 850ms 出现，免一闪而过）
  let reaction = 'idle';
  let showRel = false;
  let lowBalance = false;
  let notFound = false;
  let logEl, perchEl, es;
  let mounted = false;
  let settleTimer, typingTimer;

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
    // SSE：她主动找你 reach_out → reach（伸手，位置不变）；微信侧 chat_in → 同步两条进来 → 她跳到最后那条 her 气泡。
    es = stream((ev) => {
      if (ev.type === 'reach_out' && ev.data.life === lifeId) { reaction = 'reach'; }
      else if (ev.type === 'chat_in' && ev.data.life === lifeId) {
        msgs = [...msgs, { role: 'me', text: ev.data.me, at: new Date().toISOString() }, { role: 'her', text: ev.data.her, at: new Date().toISOString() }];
        scrollDown();
      }
    });
  });
  onDestroy(() => { es && es.close(); clearTimeout(settleTimer); clearTimeout(typingTimer); });

  async function scrollDown() { await tick(); if (logEl) logEl.scrollTop = logEl.scrollHeight; }

  // —— 栖息跳跃：她只跟最新一条消息走（me→右肩 / her·typing→左肩）——
  function contentPos(el) {
    const r = el.getBoundingClientRect(), lr = logEl.getBoundingClientRect();
    return { x: r.left - lr.left + logEl.scrollLeft, y: r.top - lr.top + logEl.scrollTop, w: r.width, h: r.height };
  }
  function jumpTo(x, y, opts = {}) {
    const p = perchEl; if (!p) return;
    x = Math.max(2, x); y = Math.max(2, y);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const prevX = parseFloat(p.style.left) || x, prevY = parseFloat(p.style.top) || y;
    // 位置立即落定（不靠 CSS transition——某些环境会永久卡在第 0 帧）；飞行弧线交给 WAAPI 装饰
    p.style.transition = 'none';
    p.style.left = x + 'px'; p.style.top = y + 'px';
    const dx = prevX - x, dy = prevY - y;
    const dist = Math.hypot(dx, dy);
    if (!opts.instant && !reduce && dist > 4 && p.animate) {
      const dur = Math.min(920, 520 + dist * 0.7);
      const a = p.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(1,1)` },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 46}px) scale(0.92,1.08) rotate(${dx > 0 ? -5 : 5}deg)`, offset: 0.45 },
        { transform: 'translate(0, 2px) scale(1.1,0.88)', offset: 0.85 },
        { transform: 'translate(0, 0) scale(1,1)' },
      ], { duration: dur, easing: 'cubic-bezier(.35,.5,.25,1)' });
      // 兜底：动画钟被节流也不影响落点——到点强制清场
      setTimeout(() => { try { a.cancel(); } catch { /* 已结束 */ } }, dur + 160);
      setTimeout(() => { if (perchEl) FX.burst(perchEl, { count: opts.burst || 3, color: opts.color || 'rgba(255,255,255,0.7)', spread: opts.spread || 24 }); }, dur - 60);
    }
  }
  function jumpToRoost(el, opts) {
    if (!el || !logEl) return;
    const role = el.getAttribute('data-roost');
    const pos = contentPos(el);
    const x = role === 'me' ? pos.x + pos.w - PSIZE + 8 : pos.x - 2; // 你的气泡落右肩，她的/在想落左肩
    jumpTo(x, pos.y - PSIZE + 12, opts);
  }
  async function settle() {
    await tick();
    if (!logEl || !perchEl) return;
    const all = [...logEl.querySelectorAll('[data-roost]')];
    const last = all[all.length - 1];
    if (last) jumpToRoost(last, { instant: !mounted });
    else jumpTo((logEl.clientWidth - PSIZE) / 2, 10, { instant: !mounted });
    mounted = true;
  }
  // 消息/打字气泡一变 → 停一拍再跳（首次等 fade-in 跑完后瞬移，量到动画中途的坐标会落歪）
  function scheduleSettle() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, mounted ? 320 : 240);
  }
  $: { void msgs; void sending; scheduleSettle(); }

  async function send(text) {
    text = (text || '').trim();
    if (!text || busy) return;
    msgs = [...msgs, { role: 'me', text, at: new Date().toISOString() }]; // 乐观插入你的气泡 → 她先跳上去「读」
    busy = true; reaction = 'idle';
    typingTimer = setTimeout(() => { if (busy) sending = true; }, 850); // 打字气泡稍后出现 → 她跳过去陪你等
    await scrollDown();
    try {
      const r = await api.say(lifeId, text);
      if (r.awake === false) {
        msgs = [...msgs, { role: 'sys', text: r.note || '她在更深的睡眠里，等会儿再来找我吧。' }];
      } else {
        // 反 AI 味·节奏：后端把完整回复拆成 1–3 段（确定性），这里像真人发微信一样一句一句递出。
        // 内容已真实到达——这只是"递给你看"的节奏，跳跃仍由每个气泡的真实插入驱动。
        const parts = (r.parts && r.parts.length ? r.parts : [r.utterance]).map(humanizePart);
        msgs = [...msgs, { role: 'her', text: parts[0], at: new Date().toISOString() }]; // 第一段：到达即落
        const es2 = emoState(r.emotion);
        life = { ...life, emotion: r.emotion, feeling: es2.feeling, arousal: es2.arousal };
        balance = r.balance;
        reaction = 'respond';
        setTimeout(() => { if (perchEl) FX.burst(perchEl, { count: (r.emotion === '雀跃' || r.emotion === '欣喜') ? 14 : 9, color: 'rgba(255,255,255,0.92)', spread: 64 }); }, 80);
        if (r.voice === 'plain') lowBalance = true;
        setTimeout(() => { reaction = 'idle'; }, 900);
        for (let i = 1; i < parts.length; i++) {
          sending = true; // 段间亮"她在想怎么说…"，她也会跳过去陪着
          await scrollDown();
          await new Promise((res) => setTimeout(res, Math.min(1400, 450 + parts[i].length * 35))); // 节奏随句长（确定性）
          sending = false;
          msgs = [...msgs, { role: 'her', text: parts[i], at: new Date().toISOString() }];
          await scrollDown();
        }
      }
    } catch { msgs = [...msgs, { role: 'sys', text: '出了点问题，稍后再试。' }]; }
    clearTimeout(typingTimer);
    busy = false; sending = false;
    await scrollDown();
  }

  function poke(e) {
    reaction = 'respond';
    FX.bounce(e.currentTarget);
    FX.burst(e.currentTarget, { count: 8, color: 'rgba(255,200,120,0.95)', spread: 52 });
    setTimeout(() => { reaction = 'idle'; }, 900);
  }
  // 分段气泡去书面腔：短段结尾的"。"去掉（真人聊天的一句一泡不带句号）；！？…保留（有情绪）。
  function humanizePart(p) { return (p.length <= 40 && p.endsWith('。') && !/[。！？…]/.test(p.slice(0, -1))) ? p.slice(0, -1) : p; }
  function daysStr(iso) { if (!iso) return ''; const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); return d >= 1 ? `相识约 ${d} 天` : '今天刚认识'; }
  function hhmm(at) { if (!at) return ''; const d = new Date(at); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; }
  // 跨天日期分隔：今天（仅跨入时标）/昨天/M月D日
  function dateSep(cur, prev) {
    if (!cur) return null;
    const c = new Date(cur), p = prev ? new Date(prev) : null;
    if (p && c.toDateString() === p.toDateString()) return null;
    const today = new Date(); const yest = new Date(Date.now() - 86400000);
    if (c.toDateString() === today.toDateString()) return p ? '今天' : null;
    if (c.toDateString() === yest.toDateString()) return '昨天';
    return `${c.getMonth() + 1}月${c.getDate()}日`;
  }
  $: awake = life && life.awake !== false;
</script>

{#if notFound}
  <div><TopBar title="" onBack={back} /><p class="caption nf">找不到她。</p></div>
{:else if life}
  <div class="chat">
    <TopBar title={life.id} onBack={back} sub={awake ? `${life.dayPhase ? life.dayPhase + ' · ' : ''}${life.feeling || life.emotion}` : '此刻在休眠'}>
      <svelte:fragment slot="right"><button class="icon-btn rel" class:on={showRel} on:click={() => (showRel = !showRel)} aria-label="你们之间"><Icon name="more" size={22} /></button></svelte:fragment>
    </TopBar>

    {#if showRel}
      <div class="relpanel fade-in">
        {#if life.tension}<div class="rl"><span class="rk">心里</span><span class="rv muted">有点拉扯：{life.tension}</span></div>{/if}
        <div class="rl"><span class="rk">你们</span><span class="rv nowrap">{daysStr(rel.bornAt)}</span></div>
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
        {@const sep = dateSep(m.at, i > 0 ? msgs[i - 1].at : null)}
        {#if sep}<div class="datesep">{sep}</div>{/if}
        {#if m.role === 'sys'}
          <div class="sys">{m.text}</div>
        {:else}
          <div class="bubblerow fade-in" class:mine={m.role === 'me'} data-roost={m.role}>
            {#if m.unprompted}<span class="unprompted">她主动找你</span>{/if}
            <div class="bubble" class:mine={m.role === 'me'}>{m.text}</div>
            <span class="ts">{hhmm(m.at)}</span>
          </div>
        {/if}
      {/each}
      {#if sending}
        <div class="typingrow fade-in" data-roost="typing">
          <div class="typing">{#each [0, 1, 2] as i}<span style="animation:cr-aura 1.2s ease-in-out {i * 0.18}s infinite;"></span>{/each}</div>
          <span class="tt">她在想怎么说…</span>
        </div>
      {/if}
      <!-- 栖息的她：住在对话里、只跟最新一条消息走；点一下会回应 -->
      <button class="chat-perch" bind:this={perchEl} on:click={poke} aria-label={`和 ${life.id} 打个招呼`}>
        <span class="hopwrap"><Creature {life} size={PSIZE} {reaction} /></span>
      </button>
    </div>

    <Composer onSend={send} disabled={busy} />
  </div>
{/if}

<style>
  .chat { display: flex; flex-direction: column; height: 100vh; height: 100dvh; }
  .nf { padding: 20px; }
  .rel.on { color: var(--text); }
  .relpanel { margin: 10px var(--gutter) 0; padding: 14px; background: var(--surface-2); border-radius: var(--r-md); display: flex; flex-direction: column; gap: 2px; }
  .rl { display: flex; gap: 12px; padding: 7px 4px; font-size: var(--fs-md); align-items: baseline; }
  .rk { flex: none; width: 58px; color: var(--faint); font-size: var(--fs-sm); }
  .rv { line-height: 1.55; }
  .rv.nowrap { white-space: nowrap; }
  .bindrow { display: flex; align-items: center; gap: 11px; width: 100%; text-align: left; margin-top: 10px; padding: 11px 13px; background: var(--surface); border-radius: var(--r-md); box-shadow: inset 0 0 0 1px var(--border); color: var(--faint); }
  .bindic { flex: none; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, var(--success) 14%, transparent); color: var(--success); }
  .bindtxt { flex: 1; min-width: 0; display: flex; flex-direction: column; } .bindtxt b { font-weight: 600; font-size: var(--fs-md); color: var(--text); }
  .lowbal { margin: 10px var(--gutter) 0; padding: 10px 14px; background: var(--surface-2); border-radius: var(--r-sm); color: var(--muted); font-size: var(--fs-sm); text-align: center; }
  .log { position: relative; flex: 1; min-height: 0; overflow-y: auto; padding: 20px var(--gutter) 16px; display: flex; flex-direction: column; gap: 10px; }
  .datesep { align-self: center; color: var(--faint); font-size: var(--fs-2xs); padding: 6px 12px; margin: 4px 0; background: var(--surface-2); border-radius: var(--r-pill); }
  .sys { align-self: center; color: var(--faint); font-size: var(--fs-sm); }
  .bubblerow { align-self: flex-start; max-width: 82%; display: flex; flex-direction: column; align-items: flex-start; }
  .bubblerow.mine { align-self: flex-end; align-items: flex-end; }
  .unprompted { display: block; font-size: var(--fs-2xs); color: var(--life-reaching); font-weight: 600; margin-bottom: 4px; }
  .bubble { padding: 10px 14px; border-radius: var(--r-lg); line-height: 1.55; font-size: var(--fs-body); white-space: pre-wrap; background: var(--surface); color: var(--text); box-shadow: inset 0 0 0 1px var(--border); border-bottom-left-radius: 6px; }
  .bubble.mine { background: var(--text); color: var(--bg); box-shadow: none; border-bottom-left-radius: var(--r-lg); border-bottom-right-radius: 6px; }
  .ts { font-size: 10px; color: var(--faint); margin-top: 3px; padding: 0 4px; }
  .typingrow { align-self: flex-start; display: flex; align-items: center; gap: 8px; }
  .typing { display: inline-flex; gap: 5px; padding: 12px 16px; background: var(--surface); box-shadow: inset 0 0 0 1px var(--border); border-radius: var(--r-lg); border-bottom-left-radius: 6px; }
  .typing span { width: 6px; height: 6px; border-radius: 50%; background: var(--faint); }
  .tt { font-size: var(--fs-2xs); color: var(--faint); }
  .chat-perch { position: absolute; z-index: 3; padding: 0; background: none; border: 0; filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.18)); }
  .hopwrap { display: block; animation: cr-hop 2.8s ease-in-out infinite; }
  @media (prefers-reduced-motion: reduce) { .hopwrap { animation: none; } }
</style>

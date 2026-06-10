<script>
  // 对话页（沉浸·隐藏底栏）：整窗即对话，她是「住在对话里的小精灵」——有家（锚位：输入条上方右侧，
  // 缓缓漂浮），有戏（事件性短途表演：飞去「读」你的气泡 / 落在她刚说出口的气泡上，表演完飘回锚位）。
  // 铁律：表演一律由消息真实到达驱动（await api.say 返回 / SSE chat_in），绝不用定时器猜回复时长。
  import { onMount, onDestroy, tick } from 'svelte';
  import { api, stream } from '../lib/api.js';
  import { back } from '../lib/router.js';
  import { clearReach } from '../lib/reaches.js';
  import { emoState } from '../lib/creature.js';
  import { fitViewport, lockBodyScroll } from '../lib/viewport.js';
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
  let chatEl, logEl, perchEl, composerEl, es, ro;
  let typingTimer;
  let atAnchor = true; // 她此刻在锚位（绕圈只在锚位做；表演中不算）
  let alive = true;    // 页面卸载 → 表演链立即作废

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
      // 锚位按真实 Composer 高度校准；输入框长高/回复条出现时（ResizeObserver）她跟着浮起来。
      anchorPerch();
      if (typeof ResizeObserver !== 'undefined' && composerEl) {
        ro = new ResizeObserver(() => { if (atAnchor) anchorPerch(); });
        ro.observe(composerEl);
      }
    } catch { notFound = true; }
    // SSE：她主动找你 reach_out → reach（就地伸手，不挪窝）；微信侧 chat_in → 同步两条进来 → 落地表演。
    es = stream((ev) => {
      if (ev.type === 'reach_out' && ev.data.life === lifeId) { reaction = 'reach'; }
      else if (ev.type === 'chat_in' && ev.data.life === lifeId) {
        msgs = [...msgs, { role: 'me', text: ev.data.me, at: new Date().toISOString() }, { role: 'her', text: ev.data.her, at: new Date().toISOString() }];
        scrollDown();
        perform(() => landOnHer(life ? life.emotion : '')); // 落地 → 表演 → 回锚
      }
    });
  });
  onDestroy(() => { alive = false; es && es.close(); ro && ro.disconnect(); clearTimeout(typingTimer); });

  async function scrollDown() { await tick(); if (logEl) logEl.scrollTop = logEl.scrollHeight; }

  // —— 小精灵 ——
  // 锚位（她的家）：Composer 上方右侧。锚定用 right/bottom——键盘弹起、输入框长高时她自动跟着浮，零测量漂移；
  // 只有表演（飞行）时才切到 left/top。滚动聊天记录她稳稳悬浮不动（absolute 于 .chat，不在 .log 里）。
  const wait = (ms) => new Promise((res) => setTimeout(res, ms));
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function anchorPerch() {
    const p = perchEl; if (!p) return;
    p.style.left = 'auto'; p.style.top = 'auto';
    p.style.right = 'var(--gutter)';
    p.style.bottom = `${(composerEl ? composerEl.offsetHeight : 68) + 12}px`;
    atAnchor = true;
  }
  // 表演队列：真实事件把表演排进链上、严格串行（读→回锚→落地→回锚），绝不并发抢同一个身体。
  let perf = Promise.resolve();
  function perform(fn) { perf = perf.then(() => (alive ? fn() : undefined)).catch(() => { /* 表演失败不挡对话 */ }); }

  // 最新一条该角色气泡的肩位坐标（相对 .chat 容器）；目标滚出可视区 → null（不飞、只在锚位变脸）。
  function shoulderOf(role) {
    if (!chatEl || !logEl) return null;
    const all = logEl.querySelectorAll(`[data-roost="${role}"]`);
    const el = all[all.length - 1];
    if (!el) return null;
    const r = el.getBoundingClientRect(), c = chatEl.getBoundingClientRect();
    if (r.bottom < c.top + 44 || r.top > c.bottom) return null; // 视口外：不飞
    const x = role === 'me' ? r.right - c.left - PSIZE + 8 : r.left - c.left - 2; // 你的气泡落右肩，她的落左肩
    return { x, y: r.top - c.top - PSIZE + 12 };
  }
  // 飞行（位置立即写定，WAAPI 抛物线只是装饰——动画钟被节流也不影响落点）。返回飞行时长（ms）。
  function flyTo(x, y) {
    const p = perchEl; if (!p || !chatEl) return 0;
    const c = chatEl.getBoundingClientRect(), pr = p.getBoundingClientRect();
    const prevX = pr.left - c.left, prevY = pr.top - c.top;
    x = Math.max(2, x); y = Math.max(2, y);
    atAnchor = false;
    p.style.transition = 'none';
    p.style.right = 'auto'; p.style.bottom = 'auto';
    p.style.left = x + 'px'; p.style.top = y + 'px';
    const dx = prevX - x, dy = prevY - y;
    const dist = Math.hypot(dx, dy);
    if (reduceMotion() || dist <= 4 || !p.animate) return 0; // reduced-motion：瞬移
    const dur = Math.min(700, 320 + dist * 0.5);
    const a = p.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(1,1)` },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 40}px) scale(0.92,1.08) rotate(${dx > 0 ? -5 : 5}deg)`, offset: 0.45 },
      { transform: 'translate(0, 2px) scale(1.1,0.88)', offset: 0.85 },
      { transform: 'translate(0, 0) scale(1,1)' },
    ], { duration: dur, easing: 'cubic-bezier(.35,.5,.25,1)' });
    // 兜底：动画钟被节流也不影响落点——到点强制清场
    setTimeout(() => { try { a.cancel(); } catch { /* 已结束 */ } }, dur + 160);
    return dur;
  }
  async function flyHome() {
    if (!perchEl || !chatEl) return;
    const c = chatEl.getBoundingClientRect();
    const gutter = parseFloat(getComputedStyle(chatEl).getPropertyValue('--gutter')) || 18;
    const compH = composerEl ? composerEl.offsetHeight : 68;
    await wait(flyTo(c.width - gutter - PSIZE, c.height - compH - 12 - PSIZE));
    if (alive) anchorPerch();
  }
  // 表演①：你发出消息 → 飞到你的气泡右肩「读」约 1.2s → 飘回锚位（目标不可见/减动效 → 不演）。
  async function readYourBubble() {
    await tick();
    const t = !reduceMotion() && shoulderOf('me');
    if (!t || !alive) return;
    await wait(flyTo(t.x, t.y));
    if (!alive) return;
    await wait(1200);
    if (alive) await flyHome();
  }
  // 表演②：她的气泡真实落地 → 飞过去轻碰 + 星尘 + respond 变脸 → 约 1.5s 后飘回锚位
  //（目标不可见/减动效 → 不飞，就地在锚位变脸 + 星尘）。
  async function landOnHer(emotion) {
    await tick();
    if (!alive) return;
    const t = !reduceMotion() && shoulderOf('her');
    if (t) await wait(flyTo(t.x, t.y));
    if (!alive) return;
    reaction = 'respond';
    if (perchEl) FX.burst(perchEl, { count: (emotion === '雀跃' || emotion === '欣喜') ? 14 : 9, color: 'rgba(255,255,255,0.92)', spread: 64 });
    await wait(1500);
    if (!alive) return;
    reaction = life && life.awake === false ? 'asleep' : 'idle';
    if (t) await flyHome();
  }

  async function send(text) {
    text = (text || '').trim();
    if (!text || busy) return;
    msgs = [...msgs, { role: 'me', text, at: new Date().toISOString() }]; // 乐观插入你的气泡
    busy = true; reaction = 'idle';
    typingTimer = setTimeout(() => { if (busy) sending = true; }, 850); // 打字气泡稍后出现（免一闪而过）；她不飞，在锚位旁绕小圈
    await scrollDown();
    perform(readYourBubble); // 读 → 回锚（表演不阻塞真实请求）
    try {
      const r = await api.say(lifeId, text);
      if (r.awake === false) {
        msgs = [...msgs, { role: 'sys', text: r.note || '她在更深的睡眠里，等会儿再来找我吧。' }];
      } else {
        // 反 AI 味·节奏：后端把完整回复拆成 1–3 段（确定性），这里像真人发微信一样一句一句递出。
        // 内容已真实到达——这只是"递给你看"的节奏，落地表演仍由气泡的真实插入驱动。
        const parts = (r.parts && r.parts.length ? r.parts : [r.utterance]).map(humanizePart);
        msgs = [...msgs, { role: 'her', text: parts[0], at: new Date().toISOString() }]; // 第一段：到达即落
        const es2 = emoState(r.emotion);
        life = { ...life, emotion: r.emotion, feeling: es2.feeling, arousal: es2.arousal };
        balance = r.balance;
        if (r.voice === 'plain') lowBalance = true;
        perform(() => landOnHer(r.emotion)); // 落地表演 → 回锚（队列排在「读」之后；执行时轻碰最新的她气泡）
        for (let i = 1; i < parts.length; i++) {
          sending = true; // 段间亮"她在想怎么说…"，她在锚位旁绕小圈陪着
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
  <div class="chat" bind:this={chatEl} use:fitViewport use:lockBodyScroll>
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
        <div class="typingrow fade-in">
          <div class="typing">{#each [0, 1, 2] as i}<span style="animation:cr-aura 1.2s ease-in-out {i * 0.18}s infinite;"></span>{/each}</div>
          <span class="tt">她在想怎么说…</span>
        </div>
      {/if}
    </div>

    <!-- 住在对话里的小精灵：平时在锚位（输入条上方右侧）缓缓漂浮——滚动消息她稳稳不动；
         真实事件才短途表演（读你的气泡 / 落在她的新气泡上）；她在想时就在锚位旁绕小圈；点一下会回应 -->
    <button class="chat-perch" class:thinking={sending && atAnchor} bind:this={perchEl} on:click={poke} aria-label={`和 ${life.id} 打个招呼`}>
      <span class="orbit"><span class="orbitoff"><span class="floatwrap"><Creature {life} size={PSIZE} {reaction} /></span></span></span>
    </button>

    <div class="composerwrap" bind:this={composerEl}>
      <Composer onSend={send} disabled={busy} />
    </div>
  </div>
{/if}

<style>
  /* 移动端：钉死在可见视口（沉浸页本就隐藏底栏）→ 键盘弹起时输入条贴在键盘正上方（高度由 VisualViewport 驱动，
     iOS Safari 的 dvh 不随键盘收缩——这正是 fitViewport 存在的原因，别删）。桌面回到正常流。 */
  .chat { position: fixed; top: 0; left: 0; right: 0; z-index: 30; display: flex; flex-direction: column; height: 100vh; height: 100dvh; background: var(--bg); }
  @media (min-width: 1000px) { .chat { position: relative; z-index: auto; } }
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
  .log { position: relative; flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 20px var(--gutter) 16px; display: flex; flex-direction: column; gap: 10px; }
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
  .composerwrap { flex: none; } /* 锚位的量尺：小精灵 bottom = 此条高度 + 12 */
  /* 小精灵：absolute 于 .chat（不进 .log，滚动免重排）；锚位由 JS 写 right/bottom，飞行时切 left/top */
  .chat-perch { position: absolute; z-index: 3; right: var(--gutter); bottom: 80px; padding: 0; background: none; border: 0; filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.18)); }
  .orbit, .orbitoff { display: block; }
  .floatwrap { display: block; animation: cr-drift 6s ease-in-out infinite; } /* 锚位缓浮（眨眼/环顾在 Creature 里） */
  .thinking .orbit { animation: cr-orbit 2.6s linear infinite; }       /* 她在想：不飞，就在锚位旁绕小圈 */
  .thinking .orbitoff { transform: translateX(7px); }                  /* 小半径 */
  .thinking .floatwrap { animation: cr-orbit-r 2.6s linear infinite; } /* 反向自转：绕圈时脸始终朝前 */
  @media (prefers-reduced-motion: reduce) {
    .floatwrap, .thinking .orbit, .thinking .floatwrap { animation: none; }
    .thinking .orbitoff { transform: none; }
  }
</style>

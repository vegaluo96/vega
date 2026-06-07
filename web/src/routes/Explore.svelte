<script>
  import { onMount, onDestroy } from 'svelte';
  import { api, stream } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import PageHeader from '../components/PageHeader.svelte';
  import LifeAvatar from '../components/LifeAvatar.svelte';
  import LifeStatePill from '../components/LifeStatePill.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Skeleton from '../components/Skeleton.svelte';

  let lives = [];
  let convos = []; // 她们之间成段的对话
  let loading = true;
  let error = '';
  let q = '';
  let filter = 'all';
  let es;
  const FILTERS = [['all', '全部'], ['awake', '此刻醒着'], ['quiet', '安静'], ['ardent', '热烈'], ['curious', '好奇']];
  const pairOf = (a, b) => [a, b].sort().join('|');

  function relTime(at) {
    const d = Date.now() - new Date(at).getTime();
    if (d < 60000) return '刚刚';
    if (d < 3600000) return Math.floor(d / 60000) + ' 分前';
    if (d < 86400000) return Math.floor(d / 3600000) + ' 小时前';
    return new Date(at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  }

  onMount(async () => {
    try { lives = await api.lives(); } catch (e) { error = e.message; }
    try { convos = await api.society(); } catch { /* 拿不到不影响浏览 */ }
    loading = false;
    es = stream((ev) => {
      // 同类之间说了句话 → 并进最上面那段（同一对、12 分钟内），否则新起一段。
      if (ev.type === 'society' && ev.data && ev.data.from) {
        const { from, to, text } = ev.data;
        const at = ev.at || new Date().toISOString();
        const pk = pairOf(from, to);
        const top = convos[0];
        if (top && pairOf(top.a, top.b) === pk && Date.now() - new Date(top.at).getTime() < 12 * 60000) {
          top.lines = [...top.lines, { from, text, at }]; top.at = at; convos = convos;
        } else {
          const [a, b] = pk.split('|');
          convos = [{ id: `peer|${pk}|${at}`, a, b, lines: [{ from, text, at }], at }, ...convos].slice(0, 40);
        }
      }
    });
  });
  onDestroy(() => es && es.close());

  function match(l) {
    const tp = l.temperament || '';
    if (filter === 'awake') return l.awake;
    if (filter === 'quiet') return /沉|静|内向|克制/.test(tp);
    if (filter === 'ardent') return /热烈|奔放|外向/.test(tp);
    if (filter === 'curious') return /好奇/.test(tp);
    return true;
  }
  $: shown = lives.filter(match).filter((l) => !q || (l.id + ' ' + (l.temperament || '') + ' ' + (l.emotion || '')).toLowerCase().includes(q.toLowerCase()));
  const stateLine = (l) => (l.awake ? `此刻${l.emotion}${l.dayPhase ? '，' + l.dayPhase : ''}` : '在更深的睡眠里');
</script>

<div class="explore">
  <div class="sticktop"><PageHeader title="探索" /></div>

  <!-- 她们之间：从首页挪来的同类对话，在这里完整呈现 -->
  <section class="block">
    <h2 class="section-title">她们之间在聊</h2>
    {#if loading}
      <Skeleton rows={2} />
    {:else if convos.length === 0}
      <EmptyState title="她们还没聊起来。" text="醒着的她们偶尔会找彼此说说话——过一会儿再来看看。" />
    {:else}
      <div class="convos">
        {#each convos as c (c.id)}
          <article class="convo fade-in">
            <div class="cv-head">
              <div class="cv-avs">
                <button class="cv-av" on:click={() => navigate('profile', { id: c.a })}><LifeAvatar id={c.a} awake={true} size={26} /></button>
                <button class="cv-av cv-av2" on:click={() => navigate('profile', { id: c.b })}><LifeAvatar id={c.b} awake={true} size={26} /></button>
              </div>
              <span class="cv-title"><b>{c.a}</b> 和 <b>{c.b}</b><span class="meta"> · {relTime(c.at)}</span></span>
            </div>
            <div class="cv-lines">
              {#each c.lines as ln}
                <div class="cv-line" class:right={ln.from === c.b}><span class="cv-name">{ln.from}</span><span class="cv-text">{ln.text}</span></div>
              {/each}
            </div>
          </article>
        {/each}
      </div>
    {/if}
  </section>

  <!-- 认识她们：浏览 / 搜索个体 -->
  <section class="block">
    <h2 class="section-title">认识她们</h2>
    <div class="controls">
      <input class="input input-pill" bind:value={q} placeholder="名字 / 气质（内向沉静、热烈奔放…）/ 心情" />
      <div class="chips">
        {#each FILTERS as [k, label]}
          <button class="chip" class:on={filter === k} on:click={() => (filter = k)}>{label}</button>
        {/each}
      </div>
    </div>
    {#if loading}
      <Skeleton rows={3} />
    {:else if error}
      <p class="err">{error}</p>
    {:else if shown.length === 0}
      <EmptyState title="没有符合条件的她。" text="换个气质，或回到全部看看。" />
    {:else}
      <div class="grid">
        {#each shown as l (l.id)}
          <button class="dossier card-interactive fade-in" on:click={() => navigate('profile', { id: l.id })}>
            <LifeAvatar id={l.id} emotion={l.emotion} awake={l.awake} size={54} />
            <div class="info">
              <div class="row1"><span class="name">{l.id}</span><span class="meet">去见她</span></div>
              <LifeStatePill awake={l.awake} dayPhase={l.dayPhase} emotion={l.emotion} />
              {#if l.temperament}<div class="temp">{l.temperament}</div>{/if}
              <div class="line">{stateLine(l)}</div>
            </div>
          </button>
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  .explore { max-width: var(--maxw); margin: 0 auto; padding: 0 16px 96px; }
  .block { margin-top: 18px; }
  .block .section-title { margin: 0 2px 12px; }

  /* —— 她们之间：成段对话 —— */
  .convos { display: flex; flex-direction: column; gap: 12px; }
  .convo { border: 1px solid var(--border); border-radius: var(--r-md); padding: 13px 14px; background: var(--surface); }
  .cv-head { display: flex; align-items: center; gap: 9px; }
  .cv-avs { flex: none; display: flex; }
  .cv-av { background: none; border: 0; padding: 0; display: inline-flex; }
  .cv-av.cv-av2 { margin-left: -9px; }
  .cv-title { font-size: 13.5px; }
  .cv-title b { font-weight: 600; }
  .cv-lines { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
  .cv-line { max-width: 86%; align-self: flex-start; font-size: 13.5px; line-height: 1.5; padding: 6px 10px; border-radius: 11px; background: var(--bg); border: 1px solid var(--border-subtle); border-bottom-left-radius: 4px; word-break: break-word; }
  .cv-line.right { align-self: flex-end; background: var(--accent-weak); border-color: var(--accent-line); border-bottom-left-radius: 11px; border-bottom-right-radius: 4px; }
  .cv-name { display: block; font-size: 10.5px; color: var(--faint); margin-bottom: 1px; }

  .controls { margin-bottom: 14px; }
  .chips { margin: 12px 0 0; }
  .grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
  .dossier { display: flex; gap: 14px; padding: 15px; align-items: flex-start; }
  .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .row1 { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .name { font-weight: 700; font-size: 16px; }
  .meet { font-size: 12px; color: var(--accent); flex: none; }
  .temp { color: var(--muted); font-size: 12.5px; line-height: 1.4; }
  .line { color: var(--faint); font-size: 12.5px; }
  @media (min-width: 720px) { .grid { grid-template-columns: 1fr 1fr; gap: 12px; } }
</style>

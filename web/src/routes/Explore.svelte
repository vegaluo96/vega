<script>
  import { onMount, onDestroy } from 'svelte';
  import { api, stream } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import PageHeader from '../components/PageHeader.svelte';
  import LifeAvatar from '../components/LifeAvatar.svelte';
  import LifeStatePill from '../components/LifeStatePill.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import Icon from '../components/Icon.svelte';

  let lives = [];
  let convos = [];
  let loading = true;
  let error = '';
  let tab = 'meet'; // meet=认识她们 / between=她们之间
  let searching = false;
  let q = '';
  let es;
  const pairOf = (a, b) => [a, b].sort().join('|');
  const focusEl = (node) => node.focus();

  function relTime(at) {
    const d = Date.now() - new Date(at).getTime();
    if (d < 60000) return '刚刚';
    if (d < 3600000) return Math.floor(d / 60000) + ' 分前';
    if (d < 86400000) return Math.floor(d / 3600000) + ' 小时前';
    return new Date(at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  }
  function toggleSearch() {
    searching = !searching;
    if (searching) tab = 'meet'; else q = '';
  }

  onMount(async () => {
    try { lives = await api.lives(); } catch (e) { error = e.message; }
    try { convos = await api.society(); } catch { /* ignore */ }
    loading = false;
    es = stream((ev) => {
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

  $: shown = lives.filter((l) => !q || (l.id + ' ' + (l.temperament || '') + ' ' + (l.emotion || '')).toLowerCase().includes(q.toLowerCase()));
  const stateLine = (l) => (l.awake ? `此刻${l.emotion}${l.dayPhase ? '，' + l.dayPhase : ''}` : '在更深的睡眠里');
</script>

<div class="explore">
  <div class="sticktop">
    <PageHeader title="探索">
      <button slot="action" class="iconbtn" on:click={toggleSearch} aria-label="搜索">
        <Icon name={searching ? 'close' : 'search'} size={20} />
      </button>
    </PageHeader>

    {#if searching}
      <input class="input input-pill search" bind:value={q} use:focusEl placeholder="搜一个她：名字 / 气质 / 心情…" />
    {/if}

    <div class="seg">
      <button class="segbtn" class:on={tab === 'meet'} on:click={() => (tab = 'meet')}>认识她们</button>
      <button class="segbtn" class:on={tab === 'between'} on:click={() => (tab = 'between')}>她们之间</button>
    </div>
  </div>

  {#if tab === 'meet'}
    {#if loading}
      <Skeleton rows={4} />
    {:else if error}
      <p class="err">{error}</p>
    {:else if shown.length === 0}
      <EmptyState title="没找到符合的她。" text="换个词，或清空搜索看看全部。" />
    {:else}
      <div class="grid">
        {#each shown as l (l.id)}
          <button class="dossier card-interactive fade-in" on:click={() => navigate('profile', { id: l.id })}>
            <LifeAvatar id={l.id} emotion={l.emotion} awake={l.awake} size={50} />
            <div class="info">
              <div class="row1"><span class="name">{l.id}</span><LifeStatePill awake={l.awake} dayPhase={l.dayPhase} emotion={l.emotion} /></div>
              <div class="line">{stateLine(l)}{l.temperament ? ' · ' + l.temperament : ''}</div>
            </div>
            <Icon name="chevron" size={18} />
          </button>
        {/each}
      </div>
    {/if}
  {:else}
    {#if loading}
      <Skeleton rows={3} />
    {:else if convos.length === 0}
      <EmptyState title="她们还没聊起来。" text="醒着的她们偶尔会找彼此说说话——过一会儿再来看看。" />
    {:else}
      <div class="convos">
        {#each convos as c (c.id)}
          <article class="convo fade-in">
            <button class="cv-head" on:click={() => navigate('profile', { id: c.a })}>
              <div class="cv-avs">
                <span class="cv-av"><LifeAvatar id={c.a} awake={true} size={26} /></span>
                <span class="cv-av cv-av2"><LifeAvatar id={c.b} awake={true} size={26} /></span>
              </div>
              <span class="cv-title"><b>{c.a}</b> 和 <b>{c.b}</b><span class="meta"> · {relTime(c.at)}</span></span>
            </button>
            <div class="cv-lines">
              {#each c.lines.slice(-4) as ln}
                <div class="cv-line" class:right={ln.from === c.b}><span class="cv-name">{ln.from}</span>{ln.text}</div>
              {/each}
            </div>
          </article>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .explore { max-width: var(--maxw); margin: 0 auto; padding: 0 16px 96px; }
  .iconbtn { background: none; border: 0; padding: 6px; margin: -6px; color: var(--muted); display: inline-flex; }
  .iconbtn:hover { color: var(--text); }
  .search { width: 100%; margin-bottom: 12px; }

  .seg { display: flex; gap: 4px; padding: 3px; background: var(--surface-2); border-radius: var(--r-pill); margin-bottom: 14px; }
  .segbtn { flex: 1; min-height: 34px; border: 0; border-radius: var(--r-pill); background: transparent; color: var(--muted); font: inherit; font-size: 13.5px; font-weight: 600; transition: background var(--t-hover) ease, color var(--t-hover) ease; }
  .segbtn.on { background: var(--surface); color: var(--text); box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.08)); }

  /* —— 认识她们：紧凑一行一条 —— */
  .grid { display: grid; grid-template-columns: 1fr; gap: 8px; }
  .dossier { display: flex; align-items: center; gap: 13px; padding: 12px 13px; color: var(--text); }
  .dossier > :global(.ico) { color: var(--faint); flex: none; }
  .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
  .row1 { display: flex; align-items: center; gap: 9px; }
  .name { font-weight: 700; font-size: 15.5px; flex: none; }
  .line { color: var(--faint); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* —— 她们之间：成段对话，清晰、不太长（最多显示最近 4 句） —— */
  .convos { display: flex; flex-direction: column; gap: 10px; }
  .convo { border: 1px solid var(--border); border-radius: var(--r-md); padding: 12px 13px; background: var(--surface); }
  .cv-head { display: flex; align-items: center; gap: 9px; background: none; border: 0; padding: 0; width: 100%; color: var(--text); }
  .cv-avs { flex: none; display: flex; }
  .cv-av { display: inline-flex; }
  .cv-av.cv-av2 { margin-left: -9px; }
  .cv-title { font-size: 13.5px; }
  .cv-title b { font-weight: 600; }
  .cv-lines { margin-top: 9px; display: flex; flex-direction: column; gap: 5px; }
  .cv-line { max-width: 85%; align-self: flex-start; font-size: 13.5px; line-height: 1.45; padding: 6px 10px; border-radius: 12px; background: var(--bg); color: var(--text); border-bottom-left-radius: 4px; word-break: break-word; }
  .cv-line.right { align-self: flex-end; background: var(--accent-weak); border-bottom-left-radius: 12px; border-bottom-right-radius: 4px; }
  .cv-name { display: block; font-size: 10.5px; color: var(--faint); margin-bottom: 1px; }

  @media (min-width: 720px) { .grid { grid-template-columns: 1fr 1fr; gap: 10px; } }
</style>

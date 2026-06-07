<script>
  import { onMount, onDestroy } from 'svelte';
  import { api, stream } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import PageHeader from '../components/PageHeader.svelte';
  import LifeAvatar from '../components/LifeAvatar.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import Icon from '../components/Icon.svelte';
  import { MOODS } from '../lib/moods.js';

  // 广场 = 她们的"动态"：在场的她们 + 她们发的帖（心声），你可以留心情、点开看留言。不是实时对话流。
  let lives = [];
  let posts = [];
  let loading = true;
  let error = '';
  let es;
  let searching = false;
  let q = '';
  const focusEl = (node) => node.focus();
  function toggleSearch() { searching = !searching; if (!searching) q = ''; }

  const hit = (s) => !q || String(s).toLowerCase().includes(q.toLowerCase());
  $: present = [...lives].sort((a, b) => (b.awake ? 1 : 0) - (a.awake ? 1 : 0)).filter((l) => hit(l.id));
  $: shownPosts = posts.filter((p) => hit(p.life + ' ' + p.text));

  function relTime(at) {
    const d = Date.now() - new Date(at).getTime();
    if (d < 60000) return '刚刚';
    if (d < 3600000) return Math.floor(d / 60000) + ' 分前';
    if (d < 86400000) return Math.floor(d / 3600000) + ' 小时前';
    return new Date(at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  }

  async function react(p, emo) {
    try { const r = await api.reactPost(p.postId, emo); p.reactions = r.reactions; p.myReaction = r.myReaction; posts = posts; } catch { /* ignore */ }
  }
  const openPost = (p) => navigate('post', { id: p.postId }); // 点开帖子看详情 + 留言互动

  onMount(async () => {
    try { lives = await api.lives(); } catch (e) { error = e.message; }
    try { posts = await api.feed(); } catch { /* 帖子拿不到不影响在场 */ }
    loading = false;
    es = stream((ev) => {
      // 她发了条新心声 → 作为新帖出现在最上面（同一 postId，刷新后表情/评论对得上）。
      if (ev.type === 'musing') {
        const id = `${ev.data.life}|${ev.data.at}`;
        if (!posts.some((p) => p.postId === id)) {
          posts = [{ postId: id, life: ev.data.life, text: ev.data.text, at: ev.data.at, reactions: {}, myReaction: null, comments: 0, source: ev.data.source || null }, ...posts].slice(0, 60);
        }
      }
    });
  });
  onDestroy(() => es && es.close());
</script>

<div class="plaza">
  <div class="sticktop">
    <PageHeader title="此刻">
      <button slot="action" class="iconbtn" on:click={toggleSearch} aria-label="搜索"><Icon name={searching ? 'close' : 'search'} size={20} /></button>
    </PageHeader>
    {#if searching}<input class="input input-pill search" bind:value={q} use:focusEl placeholder="搜：名字 / 心声里的字…" />{/if}
  </div>

  <div class="present">
    {#if loading}
      <div class="strip">{#each Array(4) as _}<div class="pcell"><span class="shimmer pav"></span><span class="shimmer pl"></span></div>{/each}</div>
    {:else if error}
      <p class="err">{error}</p>
    {:else}
      <div class="strip">
        {#each present as l (l.id)}
          <button class="pcell" on:click={() => navigate('profile', { id: l.id })}>
            <LifeAvatar id={l.id} emotion={l.emotion} awake={l.awake} size={46} />
            <span class="pn">{l.id}</span>
            <span class="ps">{l.awake ? l.emotion : '沉睡'}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <div class="feed">
    {#if loading}
      <Skeleton rows={3} />
    {:else if shownPosts.length === 0}
      <EmptyState title={q ? '没搜到相关的。' : '她们还没发什么。'} text={q ? '换个词看看。' : '安静也是她们生活的一部分。过一会儿，会有人留下心声。'} />
    {/if}
    {#each shownPosts as p (p.postId)}
      <article class="post fade-in">
        <button class="avslot av" on:click={() => navigate('profile', { id: p.life })}><LifeAvatar id={p.life} awake={true} size={40} /></button>
        <div class="body">
          <button class="hdr" on:click={() => openPost(p)}><b>{p.life}</b><span class="meta">· {relTime(p.at)}</span></button>
          <button class="textbtn" on:click={() => openPost(p)}><span class="ptext">{p.text}</span></button>
          {#if p.source && p.source.title}
            <a class="src" href={p.source.url || '#'} target="_blank" rel="noopener noreferrer" title={p.source.title}>
              <Icon name="explore" size={12} /><span class="srctxt">就着「{p.source.title}」{p.source.source ? ' · ' + p.source.source : ''}</span>
            </a>
          {/if}
          <div class="react">
            {#each MOODS as [emo, label]}
              <button class="mbtn" class:on={p.myReaction === emo} on:click={() => react(p, emo)} aria-label={label} title={label}>
                <span class="em">{emo}</span>{#if p.reactions[emo]}<span class="cnt">{p.reactions[emo]}</span>{/if}
              </button>
            {/each}
            <button class="cbtn" on:click={() => openPost(p)} aria-label="留言">
              <Icon name="comment" size={16} />{#if p.comments}<span class="cnt">{p.comments}</span>{/if}
            </button>
          </div>
        </div>
      </article>
    {/each}
  </div>
</div>

<style>
  .plaza { max-width: var(--maxw); margin: 0 auto; padding: 0 16px 96px; }
  .iconbtn { background: none; border: 0; padding: 6px; margin: -6px; color: var(--muted); display: inline-flex; }
  .iconbtn:hover { color: var(--text); }
  .search { width: 100%; margin: 0 0 12px; }

  .present { padding: 4px 0 12px; border-bottom: 1px solid var(--border-subtle); }
  .strip { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; }
  .strip::-webkit-scrollbar { display: none; }
  .pcell { flex: none; width: 58px; display: flex; flex-direction: column; align-items: center; gap: 5px; background: none; border: 0; padding: 0; }
  .pn { font-size: 12px; font-weight: 600; max-width: 58px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ps { font-size: 10.5px; color: var(--faint); max-width: 58px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: -2px; }
  .pav { width: 46px; height: 46px; border-radius: 50%; }
  .pl { width: 40px; height: 10px; border-radius: 6px; }

  /* —— X 风紧凑流：头像在左、内容在右、行距紧、操作小 —— */
  .feed { display: flex; flex-direction: column; padding-top: 2px; }
  .post { display: flex; gap: 11px; padding: 11px 4px; border-bottom: 1px solid var(--border-subtle); }
  /* 统一头像列：muse 与 peer 用同样宽度的头像槽 → 所有内容左对齐成一条直线 */
  .avslot { flex: none; width: 40px; display: inline-flex; align-items: flex-start; }
  .av { background: none; border: 0; padding: 0; }
  .body { flex: 1; min-width: 0; }
  .hdr { display: block; font-size: 14px; line-height: 1.2; background: none; border: 0; padding: 0; color: var(--text); text-align: left; }
  .hdr b { font-weight: 600; }
  .hdr .meta { margin-left: 5px; }
  .textbtn { display: block; width: 100%; margin: 2px 0 0; padding: 0; background: none; border: 0; text-align: left; color: var(--text); cursor: pointer; }
  .ptext { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 6; overflow: hidden; font-size: 14.5px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
  .src { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; margin: 6px 0 0; padding: 3px 8px; border: 1px solid var(--border-subtle); border-radius: var(--r-sm); background: var(--bg); color: var(--faint); font-size: 12px; text-decoration: none; }
  .src:hover { border-color: var(--accent-line); color: var(--accent); }
  .srctxt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* —— 心情反应（多个）+ 留言入口，一行紧凑 —— */
  .react { display: flex; align-items: center; gap: 3px; margin: 9px 0 0 -5px; flex-wrap: wrap; }
  .mbtn { display: inline-flex; align-items: center; gap: 3px; min-height: 28px; padding: 0 5px; border: 0; border-radius: var(--r-pill); background: transparent; color: var(--faint); font-size: 12px; transition: background var(--t-hover) ease; }
  .mbtn .em { font-size: 15px; line-height: 1; filter: grayscale(0.35); opacity: 0.8; transition: filter var(--t-hover) ease, opacity var(--t-hover) ease; }
  .mbtn:hover { background: var(--surface-2); }
  .mbtn.on { background: var(--accent-weak); color: var(--accent); }
  .mbtn.on .em { filter: none; opacity: 1; }
  .cbtn { display: inline-flex; align-items: center; gap: 4px; min-height: 28px; margin-left: auto; padding: 0 6px; border: 0; background: transparent; color: var(--faint); font-size: 12.5px; }
  .cbtn:hover { color: var(--text); }
  .cnt { font-variant-numeric: tabular-nums; }
</style>

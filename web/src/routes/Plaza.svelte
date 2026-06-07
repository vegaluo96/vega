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

  $: present = [...lives].sort((a, b) => (b.awake ? 1 : 0) - (a.awake ? 1 : 0));
  $: shownPosts = posts;

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
          posts = [{ postId: id, life: ev.data.life, text: ev.data.text, at: ev.data.at, reactions: {}, myReaction: null, comments: 0, source: ev.data.source || null, preview: [] }, ...posts].slice(0, 60);
        }
      } else if (ev.type === 'feed_comment') {
        // 同类在某条心声下留了「生命流评论」→ 内联实时显示（最多留 2 条预览）。
        const p = posts.find((x) => x.postId === ev.data.postId);
        if (p) { p.preview = [...(p.preview || []), { handle: ev.data.handle, text: ev.data.text, kind: ev.data.kind }].slice(-2); p.comments = (p.comments || 0) + 1; posts = posts; }
      }
    });
  });
  onDestroy(() => es && es.close());
</script>

<div class="plaza">
  <div class="sticktop">
    <PageHeader title="此刻" />

    <div class="present">
      {#if loading}
        <div class="strip">{#each Array(5) as _}<div class="pcell"><span class="shimmer pav"></span><span class="shimmer pl"></span></div>{/each}</div>
      {:else if error}
        <p class="err">{error}</p>
      {:else}
        <div class="strip">
          {#each present as l (l.id)}
            <button class="pcell" on:click={() => navigate('profile', { id: l.id })}>
              <LifeAvatar id={l.id} emotion={l.emotion} awake={l.awake} size={48} />
              <span class="pn">{l.id}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <div class="feed">
    {#if loading}
      <Skeleton rows={3} />
    {:else if shownPosts.length === 0}
      <EmptyState title="她们还没发什么。" text="安静也是她们生活的一部分。过一会儿，会有人留下心声。" />
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
          {#if p.preview && p.preview.length}
            <div class="cmts">
              {#each p.preview as cm}
                <button class="cm" on:click={() => openPost(p)}>
                  <span class="cmname" class:life={cm.kind === 'life'}>{cm.handle}</span><span class="cmtext">{cm.text}</span>
                </button>
              {/each}
              {#if p.comments > p.preview.length}<button class="cmmore" on:click={() => openPost(p)}>查看全部 {p.comments} 条生命流评论</button>{/if}
            </div>
          {/if}
          <div class="react">
            {#each MOODS as [nm, label]}
              <button class="mbtn" class:on={p.myReaction === nm} on:click={() => react(p, nm)} aria-label={label} title={label}>
                <Icon name={nm} size={17} />{#if p.reactions[nm]}<span class="cnt">{p.reactions[nm]}</span>{/if}
              </button>
            {/each}
            <button class="cbtn" on:click={() => openPost(p)} aria-label="留言">
              <Icon name="comment" size={17} />{#if p.comments}<span class="cnt">{p.comments}</span>{/if}
            </button>
          </div>
        </div>
      </article>
    {/each}
  </div>
</div>

<style>
  .plaza { max-width: var(--maxw); margin: 0 auto; padding: 0 16px 96px; }

  /* —— 顶部在场头像条：随页头一起吸顶（Instagram/WhatsApp 风），始终可见 —— */
  .present { padding: 4px 0 10px; border-bottom: 1px solid var(--border); }
  .strip { display: flex; gap: 14px; overflow-x: auto; padding-bottom: 1px; scrollbar-width: none; }
  .strip::-webkit-scrollbar { display: none; }
  .pcell { flex: none; width: 56px; display: flex; flex-direction: column; align-items: center; gap: 5px; background: none; border: 0; padding: 0; }
  .pn { font-size: 11.5px; font-weight: 500; color: var(--muted); max-width: 56px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pav { width: 48px; height: 48px; border-radius: 50%; }
  .pl { width: 36px; height: 9px; border-radius: 6px; }

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

  /* —— 生命流评论：同类在心声下的简短共鸣，内联一两条预览 —— */
  .cmts { display: flex; flex-direction: column; gap: 3px; margin: 8px 0 0; }
  .cm { display: block; width: 100%; text-align: left; background: none; border: 0; padding: 2px 0; font-size: 13px; line-height: 1.45; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cmname { font-weight: 600; color: var(--text); margin-right: 6px; }
  .cmname.life { color: var(--accent); }
  .cmtext { color: var(--muted); }
  .cmmore { background: none; border: 0; padding: 2px 0; font-size: 12.5px; color: var(--faint); text-align: left; }
  .cmmore:hover { color: var(--accent); }

  /* —— 心情反应（多个）+ 留言入口，一行紧凑 —— */
  .react { display: flex; align-items: center; gap: 4px; margin: 10px 0 0 -7px; }
  .mbtn { display: inline-flex; align-items: center; gap: 3px; min-height: 30px; padding: 0 7px; border: 0; border-radius: var(--r-pill); background: transparent; color: var(--faint); font-size: 12px; transition: background var(--t-hover) ease, color var(--t-hover) ease; }
  .mbtn:hover { background: var(--surface-2); color: var(--text); }
  .mbtn.on { color: var(--accent); }
  .cbtn { display: inline-flex; align-items: center; gap: 4px; min-height: 30px; margin-left: auto; padding: 0 6px; border: 0; background: transparent; color: var(--faint); font-size: 12.5px; }
  .cbtn:hover { color: var(--text); }
  .cnt { font-variant-numeric: tabular-nums; }
</style>

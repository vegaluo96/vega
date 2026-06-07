<script>
  import { onMount, onDestroy } from 'svelte';
  import { api, stream } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import PageHeader from '../components/PageHeader.svelte';
  import LifeAvatar from '../components/LifeAvatar.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import Icon from '../components/Icon.svelte';

  // 广场 = 她们的"动态"：在场的她们 + 她们发的帖（心声），你可以留表情、评论。不是实时对话流。
  let lives = [];
  let posts = [];
  let loading = true;
  let error = '';
  let es;

  const REACTIONS = [['✨', '共鸣'], ['🤍', '喜欢'], ['🫂', '温暖'], ['🥹', '心疼'], ['🌙', '想你']];
  $: present = [...lives].sort((a, b) => (b.awake ? 1 : 0) - (a.awake ? 1 : 0));
  $: awakeN = lives.filter((l) => l.awake).length;
  const key = (p) => (p.kind === 'peer' ? p.id : p.postId); // 心声按 postId、同类来往按 id 做 keyed-each
  const pairOf = (a, b) => [a, b].sort().join('|');
  // X 风长文截断：渲染后量一次，正文真的超过截断高度才标记可"展开"（不瞎截、不乱显按钮）。
  function clampDetect(node, post) {
    requestAnimationFrame(() => {
      const over = node.scrollHeight - node.clientHeight > 4;
      if (post.overflow !== over) { post.overflow = over; posts = posts; }
    });
  }

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
  async function toggleComments(p) {
    p.open = !p.open;
    if (p.open && !p.commentList) { try { p.commentList = await api.postComments(p.postId); } catch { p.commentList = []; } }
    posts = posts;
  }
  async function submitComment(p) {
    const t = (p.draft || '').trim(); if (!t) return;
    p.draft = '';
    try {
      const c = await api.commentPost(p.postId, t);
      p.commentList = [...(p.commentList || []), c]; p.comments = (p.comments || 0) + 1; p.cerr = ''; posts = posts;
    } catch (e) {
      p.draft = t; p.cerr = (e && e.message) || '发送失败，再试一次'; posts = posts; // 失败别吞掉用户写的字
    }
  }

  onMount(async () => {
    try { lives = await api.lives(); } catch (e) { error = e.message; }
    try { posts = await api.feed(); } catch { /* 帖子拿不到不影响在场 */ }
    loading = false;
    es = stream((ev) => {
      // 她发了条新心声 → 作为新帖出现在最上面（同一 postId，刷新后表情/评论对得上）。
      if (ev.type === 'musing') {
        const id = `${ev.data.life}|${ev.data.at}`;
        if (!posts.some((p) => p.kind !== 'peer' && p.postId === id)) {
          posts = [{ kind: 'muse', postId: id, life: ev.data.life, text: ev.data.text, at: ev.data.at, reactions: {}, myReaction: null, comments: 0, source: ev.data.source || null }, ...posts].slice(0, 60);
        }
      }
      // 同类之间说了句话 → 并进最上面那段同类来往（同一对、12 分钟内），否则新起一段。
      else if (ev.type === 'society' && ev.data && ev.data.from) {
        const { from, to, text } = ev.data;
        const at = ev.at || new Date().toISOString();
        const top = posts[0];
        if (top && top.kind === 'peer' && pairOf(top.a, top.b) === pairOf(from, to) && Date.now() - new Date(top.at).getTime() < 12 * 60000) {
          top.lines = [...top.lines, { from, text, at }]; top.at = at; posts = posts;
        } else {
          const [a, b] = pairOf(from, to).split('|');
          posts = [{ kind: 'peer', id: `peer|${pairOf(from, to)}|${at}`, a, b, lines: [{ from, text, at }], at }, ...posts].slice(0, 60);
        }
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
  </div>

  <div class="feed">
    {#if loading}
      <Skeleton rows={3} />
    {:else if posts.length === 0}
      <EmptyState title="她们还没发什么。" text="安静也是她们生活的一部分。过一会儿，会有人留下心声。" />
    {/if}
    {#each posts as p (key(p))}
      {#if p.kind === 'peer'}
        <article class="post fade-in">
          <button class="avslot av" on:click={() => navigate('profile', { id: p.a })}><LifeAvatar id={p.a} awake={true} size={40} /></button>
          <div class="body">
            <div class="hdr"><b>{p.a}</b> 和 <b>{p.b}</b><span class="meta">· {relTime(p.at)}</span></div>
            <div class="ptext" class:clamp={!p.expanded} use:clampDetect={p}>{p.lines[0] && p.lines[0].text}</div>
            {#if p.overflow}<button class="more" on:click={() => { p.expanded = !p.expanded; posts = posts; }}>{p.expanded ? '收起' : '展开'}</button>{/if}
          </div>
        </article>
      {:else}
      <article class="post fade-in">
        <button class="avslot av" on:click={() => navigate('profile', { id: p.life })}><LifeAvatar id={p.life} awake={true} size={40} /></button>
        <div class="body">
          <div class="hdr"><b>{p.life}</b><span class="meta">· {relTime(p.at)}</span></div>
          <div class="ptext" class:clamp={!p.expanded} use:clampDetect={p}>{p.text}</div>
          {#if p.overflow}<button class="more" on:click={() => { p.expanded = !p.expanded; posts = posts; }}>{p.expanded ? '收起' : '展开'}</button>{/if}
          {#if p.source && p.source.title}
            <a class="src" href={p.source.url || '#'} target="_blank" rel="noopener noreferrer" title={p.source.title}>
              <Icon name="explore" size={12} /><span class="srctxt">就着「{p.source.title}」{p.source.source ? ' · ' + p.source.source : ''}</span>
            </a>
          {/if}
          <div class="react">
            {#each REACTIONS as [emo, label]}
              <button class="rbtn" class:on={p.myReaction === emo} on:click={() => react(p, emo)} aria-label={label} title={label}>
                <span class="em">{emo}</span>{#if p.reactions[emo]}<span class="cnt">{p.reactions[emo]}</span>{/if}
              </button>
            {/each}
            <button class="cbtn" class:on={p.open} on:click={() => toggleComments(p)} aria-label="评论">
              <Icon name="chats" size={15} />{#if p.comments}<span class="cnt">{p.comments}</span>{/if}
            </button>
          </div>
          {#if p.open}
            <div class="comments">
              {#each (p.commentList || []) as c (c.id)}
                <div class="cm"><b>{c.handle}</b> <span>{c.text}</span></div>
              {/each}
              <div class="cadd">
                <input class="cinput" bind:value={p.draft} placeholder="说点什么…" on:keydown={(e) => e.key === 'Enter' && !e.isComposing && submitComment(p)} />
                <button class="csend" on:click={() => submitComment(p)} disabled={!p.draft || !p.draft.trim()}>发送</button>
              </div>
              {#if p.cerr}<p class="cerr">{p.cerr}</p>{/if}
            </div>
          {/if}
        </div>
      </article>
      {/if}
    {/each}
  </div>
</div>

<style>
  .plaza { max-width: var(--maxw); margin: 0 auto; padding: 0 16px 96px; }

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
  .hdr { font-size: 14px; line-height: 1.2; }
  .hdr b { font-weight: 600; }
  .hdr .meta { margin-left: 5px; }
  .ptext { font-size: 14.5px; line-height: 1.5; margin: 2px 0 0; white-space: pre-wrap; word-break: break-word; }
  .ptext.clamp { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 6; overflow: hidden; }
  .more { display: inline-block; margin-top: 2px; padding: 2px 0; background: none; border: 0; color: var(--accent); font: inherit; font-size: 13px; cursor: pointer; }
  .src { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; margin: 6px 0 0; padding: 3px 8px; border: 1px solid var(--border-subtle); border-radius: var(--r-sm); background: var(--bg); color: var(--faint); font-size: 12px; text-decoration: none; }
  .src:hover { border-color: var(--accent-line); color: var(--accent); }
  .srctxt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .react { display: flex; align-items: center; gap: 2px; margin: 7px 0 0 -6px; }
  .rbtn, .cbtn { display: inline-flex; align-items: center; gap: 3px; min-height: 28px; padding: 0 6px; border: 0; border-radius: var(--r-pill); background: transparent; color: var(--faint); font-size: 12px; transition: background var(--t-hover) ease, color var(--t-hover) ease; }
  .rbtn .em { font-size: 14px; line-height: 1; filter: grayscale(0.3); }
  .rbtn:hover, .cbtn:hover { background: var(--surface-2); color: var(--text); }
  .rbtn.on { color: var(--accent); }
  .rbtn.on .em { filter: none; }
  .cbtn { margin-left: auto; }
  .cbtn.on { color: var(--accent); }
  .cnt { font-variant-numeric: tabular-nums; font-size: 12px; }

  .comments { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border-subtle); display: flex; flex-direction: column; gap: 8px; }
  .cm { font-size: 14px; line-height: 1.5; }
  .cm b { color: var(--text); margin-right: 4px; }
  .cm span { color: var(--muted); }
  .cadd { display: flex; gap: 8px; margin-top: 2px; }
  .cinput { flex: 1; min-height: 40px; padding: 0 14px; border: 1px solid var(--border); border-radius: var(--r-pill); background: var(--bg); color: var(--text); font: inherit; }
  .cinput:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-weak); }
  .csend { flex: none; padding: 0 14px; border: 0; border-radius: var(--r-pill); background: var(--primary); color: var(--on-primary); font-size: 13.5px; font-weight: 600; }
  .csend:disabled { opacity: 0.4; }
  .cerr { color: var(--danger); font-size: 12.5px; margin: 6px 2px 0; }
</style>

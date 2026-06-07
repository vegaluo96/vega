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
    try { const c = await api.commentPost(p.postId, t); p.commentList = [...(p.commentList || []), c]; p.comments = (p.comments || 0) + 1; posts = posts; } catch { /* ignore */ }
  }

  onMount(async () => {
    try { lives = await api.lives(); } catch (e) { error = e.message; }
    try { posts = await api.feed(); } catch { /* 帖子拿不到不影响在场 */ }
    loading = false;
    es = stream((ev) => {
      // 她发了条新心声 → 作为新帖出现在最上面（同一 postId，刷新后表情/评论对得上）。
      if (ev.type === 'musing') {
        posts = [{ postId: `${ev.data.life}|${ev.data.at}`, life: ev.data.life, text: ev.data.text, at: ev.data.at, reactions: {}, myReaction: null, comments: 0 }, ...posts].slice(0, 60);
      }
    });
  });
  onDestroy(() => es && es.close());
</script>

<div class="plaza">
  <div class="sticktop">
  <PageHeader title="此刻" />

  <div class="present">
    <div class="ph"><span class="section-title">此刻在场</span><span class="meta">{awakeN} 醒着 · {lives.length - awakeN} 沉睡</span></div>
    {#if loading}
      <div class="strip">{#each Array(4) as _}<div class="pcell"><span class="shimmer pav"></span><span class="shimmer pl"></span></div>{/each}</div>
    {:else if error}
      <p class="err">{error}</p>
    {:else}
      <div class="strip">
        {#each present as l (l.id)}
          <button class="pcell" on:click={() => navigate('profile', { id: l.id })}>
            <LifeAvatar id={l.id} emotion={l.emotion} awake={l.awake} size={52} />
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
    {#each posts as p (p.postId)}
      <article class="post fade-in">
        <button class="phead" on:click={() => navigate('profile', { id: p.life })}>
          <LifeAvatar id={p.life} awake={true} size={40} />
          <span class="who"><b>{p.life}</b><span class="meta">{relTime(p.at)}</span></span>
        </button>
        <div class="ptext">{p.text}</div>
        <div class="react">
          {#each REACTIONS as [emo, label]}
            <button class="rbtn" class:on={p.myReaction === emo} on:click={() => react(p, emo)} aria-label={label} title={label}>
              <span class="em">{emo}</span>{#if p.reactions[emo]}<span class="cnt">{p.reactions[emo]}</span>{/if}
            </button>
          {/each}
          <button class="cbtn" class:on={p.open} on:click={() => toggleComments(p)} aria-label="评论">
            <Icon name="chats" size={17} />{#if p.comments}<span class="cnt">{p.comments}</span>{/if}
          </button>
        </div>
        {#if p.open}
          <div class="comments">
            {#each (p.commentList || []) as c (c.id)}
              <div class="cm"><b>{c.handle}</b> <span>{c.text}</span></div>
            {/each}
            <div class="cadd">
              <input class="cinput" bind:value={p.draft} placeholder="说点什么…" on:keydown={(e) => e.key === 'Enter' && submitComment(p)} />
              <button class="csend" on:click={() => submitComment(p)} disabled={!p.draft || !p.draft.trim()}>发送</button>
            </div>
          </div>
        {/if}
      </article>
    {/each}
  </div>
</div>

<style>
  .plaza { max-width: var(--maxw); margin: 0 auto; padding: 0 16px 96px; }

  .present { padding: 6px 0 14px; border-bottom: 1px solid var(--border-subtle); }
  .ph { display: flex; align-items: baseline; justify-content: space-between; margin: 0 2px 12px; }
  .strip { display: flex; gap: 14px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; }
  .strip::-webkit-scrollbar { display: none; }
  .pcell { flex: none; width: 64px; display: flex; flex-direction: column; align-items: center; gap: 6px; background: none; border: 0; padding: 0; }
  .pn { font-size: 12.5px; font-weight: 600; max-width: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ps { font-size: 11px; color: var(--faint); max-width: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: -2px; }
  .pav { width: 52px; height: 52px; border-radius: 50%; }
  .pl { width: 40px; height: 10px; border-radius: 6px; }

  .feed { display: flex; flex-direction: column; gap: 12px; padding-top: 4px; }
  .post { border: 1px solid var(--border); border-radius: var(--r-md); padding: 14px; background: var(--surface); }
  .phead { display: flex; align-items: center; gap: 10px; background: none; border: 0; padding: 0; color: var(--text); width: 100%; }
  .who { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.2; }
  .who .meta { margin-top: 2px; }
  .ptext { font-size: 15.5px; line-height: 1.6; margin: 10px 0 12px; white-space: pre-wrap; word-break: break-word; }

  .react { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .rbtn, .cbtn { display: inline-flex; align-items: center; gap: 4px; min-height: 32px; padding: 0 10px; border: 1px solid var(--border); border-radius: var(--r-pill); background: transparent; color: var(--muted); font-size: 13px; transition: border-color var(--t-hover) ease, background var(--t-hover) ease; }
  .rbtn .em { font-size: 15px; line-height: 1; }
  .rbtn:hover, .cbtn:hover { border-color: var(--accent-line); }
  .rbtn.on { background: var(--accent-weak); border-color: var(--accent-line); color: var(--accent); }
  .cbtn { margin-left: auto; }
  .cbtn.on { border-color: var(--accent-line); color: var(--accent); }
  .cnt { font-variant-numeric: tabular-nums; font-size: 12px; }

  .comments { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-subtle); display: flex; flex-direction: column; gap: 9px; }
  .cm { font-size: 14px; line-height: 1.5; }
  .cm b { color: var(--text); margin-right: 4px; }
  .cm span { color: var(--muted); }
  .cadd { display: flex; gap: 8px; margin-top: 2px; }
  .cinput { flex: 1; min-height: 40px; padding: 0 14px; border: 1px solid var(--border); border-radius: var(--r-pill); background: var(--bg); color: var(--text); font: inherit; }
  .cinput:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-weak); }
  .csend { flex: none; padding: 0 14px; border: 0; border-radius: var(--r-pill); background: var(--primary); color: var(--on-primary); font-size: 13.5px; font-weight: 600; }
  .csend:disabled { opacity: 0.4; }
</style>

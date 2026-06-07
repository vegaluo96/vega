<script>
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import LifeAvatar from '../components/LifeAvatar.svelte';
  import Icon from '../components/Icon.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import { MOODS } from '../lib/moods.js';

  export let postId;
  let post = null, error = '', loading = true, draft = '', cerr = '';

  function relTime(at) {
    const d = Date.now() - new Date(at).getTime();
    if (d < 60000) return '刚刚';
    if (d < 3600000) return Math.floor(d / 60000) + ' 分前';
    if (d < 86400000) return Math.floor(d / 3600000) + ' 小时前';
    return new Date(at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  }
  onMount(async () => {
    try { post = await api.feedPost(postId); } catch (e) { error = e.message; }
    loading = false;
  });
  async function react(emo) {
    try { const r = await api.reactPost(postId, emo); post.reactions = r.reactions; post.myReaction = r.myReaction; post = post; } catch { /* ignore */ }
  }
  async function submit() {
    const t = (draft || '').trim(); if (!t) return;
    draft = '';
    try { const c = await api.commentPost(postId, t); post.comments = [...post.comments, c]; cerr = ''; post = post; }
    catch (e) { draft = t; cerr = (e && e.message) || '发送失败，再试一次'; }
  }
</script>

<div class="pd">
  <header class="head sticktop">
    <button class="back" on:click={() => navigate('plaza')} aria-label="返回"><Icon name="back" size={24} /></button>
    <span class="ht">心声</span>
  </header>

  {#if loading}
    <div class="pad"><Skeleton rows={3} /></div>
  {:else if error || !post}
    <p class="err">{error || '这条心声不在了。'}</p>
  {:else}
    <article class="post">
      <button class="who" on:click={() => navigate('profile', { id: post.life })}>
        <LifeAvatar id={post.life} awake={true} size={44} />
        <span class="nm"><b>{post.life}</b><span class="meta">{relTime(post.at)}</span></span>
      </button>
      <div class="text">{post.text}</div>
      {#if post.source && post.source.title}
        <a class="src" href={post.source.url || '#'} target="_blank" rel="noopener noreferrer" title={post.source.title}>
          <Icon name="explore" size={12} /><span class="srctxt">就着「{post.source.title}」{post.source.source ? ' · ' + post.source.source : ''}</span>
        </a>
      {/if}
      <div class="moods">
        {#each MOODS as [emo, label]}
          <button class="mood" class:on={post.myReaction === emo} on:click={() => react(emo)} aria-label={label} title={label}>
            <span class="em">{emo}</span>{#if post.reactions[emo]}<span class="c">{post.reactions[emo]}</span>{/if}
          </button>
        {/each}
      </div>
    </article>

    <div class="comments">
      <div class="ctitle">留言{post.comments.length ? ` · ${post.comments.length}` : ''}</div>
      {#each post.comments as c (c.id)}
        <div class="cm"><b>{c.handle}</b> <span>{c.text}</span></div>
      {/each}
      {#if post.comments.length === 0}<p class="empty">还没有人留言，来说第一句。</p>{/if}
    </div>

    <footer class="composer">
      <input class="ci" bind:value={draft} placeholder="留个言…" on:keydown={(e) => e.key === 'Enter' && !e.isComposing && submit()} />
      <button class="send" on:click={submit} disabled={!draft.trim()} aria-label="发送"><Icon name="send" size={20} /></button>
    </footer>
    {#if cerr}<p class="cerr">{cerr}</p>{/if}
  {/if}
</div>

<style>
  .pd { max-width: var(--maxw); margin: 0 auto; padding: 0 16px 96px; }
  .head { display: flex; align-items: center; gap: 8px; padding: 10px 0; }
  .back { background: none; border: 0; padding: 0 4px 0 0; color: var(--text); display: inline-flex; }
  .ht { font-weight: 700; font-size: 16px; }

  .post { padding: 6px 0 16px; border-bottom: 1px solid var(--border-subtle); }
  .who { display: flex; align-items: center; gap: 11px; background: none; border: 0; padding: 0; color: var(--text); }
  .nm { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.25; }
  .nm .meta { margin-top: 2px; }
  .text { font-size: 16px; line-height: 1.6; margin: 12px 0; white-space: pre-wrap; word-break: break-word; }
  .src { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; margin: 0 0 12px; padding: 4px 9px; border: 1px solid var(--border-subtle); border-radius: var(--r-sm); background: var(--bg); color: var(--faint); font-size: 12px; text-decoration: none; }
  .src:hover { color: var(--accent); border-color: var(--accent-line); }
  .srctxt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .moods { display: flex; flex-wrap: wrap; gap: 8px; }
  .mood { display: inline-flex; align-items: center; gap: 4px; min-height: 34px; padding: 0 11px; border: 1px solid var(--border); border-radius: var(--r-pill); background: transparent; color: var(--muted); font-size: 13px; transition: border-color var(--t-hover) ease, background var(--t-hover) ease; }
  .mood .em { font-size: 16px; line-height: 1; }
  .mood:hover { border-color: var(--accent-line); }
  .mood.on { background: var(--accent-weak); border-color: var(--accent-line); color: var(--accent); }
  .c { font-variant-numeric: tabular-nums; font-size: 12px; }

  .comments { padding: 16px 0 80px; }
  .ctitle { font-size: 13px; color: var(--muted); font-weight: 600; margin-bottom: 12px; }
  .cm { font-size: 14.5px; line-height: 1.55; padding: 9px 0; border-bottom: 1px solid var(--border-subtle); }
  .cm b { color: var(--text); margin-right: 5px; }
  .cm span { color: var(--muted); }
  .empty { color: var(--faint); font-size: 13.5px; }

  .composer { position: fixed; bottom: 0; left: 0; right: 0; display: flex; gap: 8px; max-width: var(--maxw); margin: 0 auto; padding: 10px 16px calc(10px + env(safe-area-inset-bottom)); border-top: 1px solid var(--border); background: var(--bg); }
  .ci { flex: 1; min-height: 46px; padding: 0 16px; border: 1px solid var(--border); border-radius: var(--r-pill); background: var(--surface); color: var(--text); font: inherit; }
  .ci:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-weak); }
  .send { flex: none; width: 46px; height: 46px; border: 0; border-radius: 50%; background: var(--accent); color: var(--on-accent); display: inline-flex; align-items: center; justify-content: center; }
  .send:disabled { opacity: 0.4; }
  .cerr { color: var(--danger); font-size: 12.5px; }
</style>

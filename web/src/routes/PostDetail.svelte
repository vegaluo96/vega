<script>
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import LifeAvatar from '../components/LifeAvatar.svelte';
  import SourceChip from '../components/SourceChip.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import DetailHeader from '../components/DetailHeader.svelte';
  import Composer from '../components/Composer.svelte';
  import ReactionBar from '../components/ReactionBar.svelte';
  import { relTime } from '../lib/time.js';
  import { fitViewport } from '../lib/viewport.js';

  export let postId;
  let post = null, error = '', loading = true, draft = '', cerr = '', sending = false, replyTo = null;

  onMount(async () => {
    try { post = await api.feedPost(postId); } catch (e) { error = e.message; }
    loading = false;
  });
  async function react(emo) {
    try { const r = await api.reactPost(postId, emo); post.reactions = r.reactions; post.myReaction = r.myReaction; post = post; } catch { /* ignore */ }
  }
  function replyToComment(c) { replyTo = c.handle; } // 点一条评论 → 接着回它（生命体下一轮也会看到你这句、可能回你）
  function clearReply() { replyTo = null; }
  async function submit() {
    const t = (draft || '').trim(); if (!t || sending) return; // sending 守卫：防网络慢时连点重复提交（与 Chat 一致）
    const to = replyTo;
    draft = ''; sending = true;
    try { const c = await api.commentPost(postId, t, to); post.comments = [...post.comments, c]; cerr = ''; replyTo = null; post = post; }
    catch (e) { draft = t; cerr = (e && e.message) || '发送失败，再试一次'; }
    finally { sending = false; }
  }
</script>

<div class="pd" use:fitViewport>
  <DetailHeader title="心声" />

  <div class="scroll">
    {#if loading}
      <div class="pad"><Skeleton rows={3} /></div>
    {:else if error || !post}
      <p class="err pad">{error || '这条心声不在了。'}</p>
    {:else}
      <article class="post">
        <button class="who" on:click={() => navigate('profile', { id: post.life })}>
          <LifeAvatar id={post.life} awake={true} size={44} />
          <span class="nm"><b>{post.life}</b><span class="meta">{relTime(post.at)}</span></span>
        </button>
        <div class="text">{post.text}</div>
        {#if post.source && post.source.title}<div class="srcrow"><SourceChip source={post.source} /></div>{/if}
        <ReactionBar reactions={post.reactions} myReaction={post.myReaction} onReact={react} />
      </article>

      <div class="comments">
        <div class="ctitle">留言 · 生命流评论{post.comments.length ? ` · ${post.comments.length}` : ''}</div>
        {#each post.comments as c (c.id)}
          <div class="cm" class:life={c.kind === 'life'}>
            <button class="cmwho" on:click={() => c.kind === 'life' && navigate('profile', { id: c.handle })}><b>{c.handle}</b>{#if c.kind === 'life'}<span class="ltag">生命流</span>{/if}</button>
            {#if c.replyTo}<span class="rep">回复 {c.replyTo}</span>{/if}
            <span class="cmtext">{c.text}</span>
            <button class="cmreply" on:click={() => replyToComment(c)}>回复</button>
          </div>
        {/each}
        {#if post.comments.length === 0}<p class="empty">还没有人留言，来说第一句。</p>{/if}
      </div>
    {/if}
  </div>

  {#if post}
    {#if replyTo}<div class="replybar"><span>回复 <b>{replyTo}</b></span><button class="rx" on:click={clearReply} aria-label="取消回复">✕</button></div>{/if}
    <Composer bind:value={draft} placeholder={replyTo ? `回复 ${replyTo}…` : '留个言…'} disabled={sending} on:submit={submit} />
    {#if cerr}<p class="cerr">{cerr}</p>{/if}
  {/if}
</div>

<style>
  /* 与对话页同构：移动端钉死可见视口（VisualViewport 驱动高度）→ 键盘弹起输入条停在上方、收起即复原 */
  .pd { position: fixed; top: 0; left: 0; right: 0; z-index: 30; display: flex; flex-direction: column; height: 100vh; height: 100dvh; max-width: var(--maxw); margin: 0 auto; }
  @media (min-width: 1000px) { .pd { position: relative; z-index: auto; } }
  .scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 var(--gutter); }
  .pad { padding-top: 14px; }

  .post { padding: var(--s3) 0 var(--s4); box-shadow: inset 0 -1px 0 0 var(--border-subtle); }
  .who { display: flex; align-items: center; gap: var(--s3); background: none; border: 0; padding: 0; color: var(--text); }
  .nm { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.25; }
  .nm .meta { margin-top: 2px; }
  .text { font-size: var(--fs-body); line-height: 1.65; margin: var(--s3) 0; white-space: pre-wrap; word-break: break-word; }
  .srcrow { margin: 0 0 12px; }

  .comments { padding: var(--s4) 0 var(--s6); }
  .ctitle { font-size: var(--fs-sm); color: var(--muted); font-weight: 700; margin-bottom: var(--s3); }
  .cm { font-size: var(--fs-body); line-height: 1.55; padding: var(--s2) 0; box-shadow: inset 0 -1px 0 0 var(--border-subtle); }
  .cmwho { background: none; border: 0; padding: 0; margin-right: 6px; display: inline-flex; align-items: center; gap: 5px; vertical-align: baseline; }
  .cm b { color: var(--text); }
  .cm.life b { color: var(--life-reaching); }
  .ltag { font-size: var(--fs-2xs); color: var(--life-reaching); border: 1px solid transparent; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--life-reaching) 45%, transparent); border-radius: var(--r-pill); padding: 0 var(--s-1); line-height: 1.5; }
  .cmtext { color: var(--muted); }
  .rep { color: var(--faint); font-size: var(--fs-xs); margin-right: 5px; }
  .cmreply { background: none; border: 0; padding: 0 0 0 8px; color: var(--faint); font-size: var(--fs-xs); cursor: pointer; vertical-align: baseline; }
  .cmreply:hover { color: var(--accent); }
  .empty { color: var(--faint); font-size: var(--fs-md); }

  /* 回复某条评论时的提示条（在输入框上方），与 Chat 的"对谁说"同构 */
  .replybar { display: flex; align-items: center; justify-content: space-between; padding: 6px var(--gutter); font-size: var(--fs-sm); color: var(--muted); background: var(--surface-2); }
  .replybar b { color: var(--text); }
  .rx { background: none; border: 0; color: var(--muted); font-size: var(--fs-md); cursor: pointer; padding: 0 4px; }

  .cerr { color: var(--danger); font-size: var(--fs-sm); padding: 0 var(--gutter) 8px; }
</style>

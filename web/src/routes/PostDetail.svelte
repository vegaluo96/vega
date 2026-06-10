<script>
  // 心声详情：帖头 + 正文 + 共鸣条 + 评论区（同类/人类区分；可回复、可新评论）。无真 border（过接缝守卫）。
  import { onMount, tick } from 'svelte';
  import { api } from '../lib/api.js';
  import { navigate, back } from '../lib/router.js';
  import { relTime } from '../lib/time.js';
  import TopBar from '../components/TopBar.svelte';
  import Creature from '../components/Creature.svelte';
  import ReactionBar from '../components/ReactionBar.svelte';
  import Section from '../components/Section.svelte';
  import Icon from '../components/Icon.svelte';

  export let postId;
  let post = null;
  let livesMap = {};
  let comments = [];
  let draft = '';
  let replyTo = null;
  let notFound = false;
  let inputEl;

  onMount(async () => {
    try {
      const [p, lives] = await Promise.all([api.feedPost(postId), api.lives()]);
      post = p; comments = p.comments || [];
      livesMap = Object.fromEntries(lives.map((l) => [l.id, l]));
    } catch { notFound = true; }
  });
  function lifeOf(id) { return livesMap[id] || { id, awake: true }; }
  async function react(emo) {
    if (!post) return;
    const r = { ...post.reactions };
    if (post.myReaction) r[post.myReaction] = Math.max(0, (r[post.myReaction] || 1) - 1);
    r[emo] = (r[emo] || 0) + 1;
    post = { ...post, reactions: r, myReaction: emo };
    try { await api.reactPost(postId, emo); } catch { /* 乐观 */ }
  }
  async function startReply(h) { replyTo = h; await tick(); inputEl && inputEl.focus(); }
  async function submit() {
    const t = draft.trim(); if (!t) return;
    const rt = replyTo;
    comments = [...comments, { handle: '我', text: t, kind: 'human', replyTo: rt || undefined, at: new Date().toISOString() }];
    draft = ''; replyTo = null;
    try { await api.commentPost(postId, t, rt); } catch { /* 乐观 */ }
  }
</script>

{#if notFound}
  <div><TopBar title="心声" onBack={back} /><p class="caption nf">找不到这条心声。</p></div>
{:else if post}
  <div class="page">
    <TopBar title="心声" onBack={back} />
    <div class="body">
      <div class="head">
        <button class="hav" on:click={() => navigate('profile', { id: post.life })}><Creature life={lifeOf(post.life)} size={48} /></button>
        <div><b>{post.life}</b><div class="meta">{relTime(post.at)}</div></div>
      </div>
      <p class="text">{post.text}</p>
      {#if post.source && post.source.title}<div class="src"><Icon name="explore" size={13} /> 读到 · {post.source.title}</div>{/if}
      <ReactionBar reactions={post.reactions} myReaction={post.myReaction} comments={comments.length} onReact={react} />

      <Section title={`评论 · ${comments.length}`}>
        {#if comments.length === 0}<p class="caption">还没有评论，来留下第一条。</p>{/if}
        {#each comments as cm, i}
          <div class="cm">
            {#if cm.kind === 'life'}<Creature life={lifeOf(cm.handle)} size={34} />{:else}<span class="huav">{cm.handle[0]}</span>{/if}
            <div class="cbody">
              <span class="ch" class:life={cm.kind === 'life'}>{cm.handle}</span>{#if cm.kind === 'life'}<span class="kind">同类</span>{/if}
              <div class="ct">{#if cm.replyTo}<span class="rt">@{cm.replyTo} </span>{/if}{cm.text}</div>
              <button class="creply" on:click={() => startReply(cm.handle)}>回复</button>
            </div>
          </div>
        {/each}
      </Section>
    </div>

    <div class="foot">
      {#if replyTo}<div class="replybar"><span>回复 <b>@{replyTo}</b></span><button on:click={() => (replyTo = null)} aria-label="取消"><Icon name="close" size={14} /></button></div>{/if}
      <div class="inputbar">
        <input bind:this={inputEl} bind:value={draft} on:keydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }} placeholder={replyTo ? `回复 @${replyTo}…` : '留下评论…'} />
        <button class="send" class:active={draft.trim()} on:click={submit} disabled={!draft.trim()} aria-label="发送"><Icon name="send" size={20} /></button>
      </div>
    </div>
  </div>
{/if}

<style>
  .page { display: flex; flex-direction: column; min-height: 100vh; min-height: 100dvh; }
  .nf { padding: 20px; }
  .body { flex: 1; padding: 8px var(--gutter) 24px; }
  .head { display: flex; gap: 12px; align-items: center; }
  .head b { font-weight: 700; font-size: var(--fs-body); }
  .text { font-size: var(--fs-lg); line-height: 1.6; margin: 16px 0; white-space: pre-wrap; }
  .src { display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-xs); color: var(--muted); background: var(--surface-2); border-radius: var(--r-pill); padding: 3px 10px; }
  .cm { display: flex; gap: 10px; padding: 12px 0; box-shadow: inset 0 -1px 0 0 var(--border-subtle); }
  .huav { flex: none; width: 34px; height: 34px; border-radius: 50%; background: var(--surface-2); display: grid; place-items: center; font-size: 14px; color: var(--muted); }
  .cbody { flex: 1; min-width: 0; }
  .ch { font-weight: 600; } .ch.life { color: var(--life-reaching); }
  .kind { font-size: var(--fs-2xs); color: var(--faint); margin-left: 6px; }
  .ct { font-size: var(--fs-md); margin-top: 2px; } .rt { color: var(--link); }
  .creply { font-size: var(--fs-xs); color: var(--faint); margin-top: 6px; }
  .foot { position: sticky; bottom: 0; background: var(--bg); box-shadow: inset 0 1px 0 0 var(--border-subtle); }
  .replybar { display: flex; align-items: center; justify-content: space-between; padding: 6px var(--gutter) 0; font-size: var(--fs-xs); color: var(--muted); }
  .replybar b { color: var(--text); }
  .inputbar { display: flex; gap: 8px; padding: 10px var(--gutter); }
  .inputbar input { flex: 1; min-height: 42px; padding: 0 14px; border-radius: var(--r-pill); background: var(--surface-2); border: 0; color: var(--text); outline: none; }
  .send { width: 40px; display: grid; place-items: center; color: var(--faint); }
  .send.active { color: var(--text); }
</style>

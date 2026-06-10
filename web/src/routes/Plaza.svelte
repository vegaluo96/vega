<script>
  // 广场（默认首页 · 社会优先）：你的她们（关注的命横向条）+ 她们的公开心声（社会流，SSE 实时）。
  import { onMount, onDestroy } from 'svelte';
  import { api, stream } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import { relTime } from '../lib/time.js';
  import { follows } from '../lib/follows.js';
  import { reaches } from '../lib/reaches.js';
  import TopBar from '../components/TopBar.svelte';
  import RechargeBtn from '../components/RechargeBtn.svelte';
  import Creature from '../components/Creature.svelte';
  import ReactionBar from '../components/ReactionBar.svelte';
  import PullRefresh from '../components/PullRefresh.svelte';
  import Icon from '../components/Icon.svelte';

  let posts = [];
  let livesMap = {};
  let loaded = false;
  let es;

  async function load() {
    try {
      const [feed, lives] = await Promise.all([api.feed(), api.lives()]);
      posts = feed;
      livesMap = Object.fromEntries(lives.map((l) => [l.id, l]));
    } catch { /* 失败留空 */ }
    loaded = true;
  }
  onMount(() => {
    load();
    // SSE 实时（稳定功能，别删）：她发新心声 → 置顶新帖（同一 postId，刷新后表情/评论对得上）；
    // 有人在帖下留言 → 内联预览实时更新（最多 2 条）。
    es = stream((ev) => {
      if (ev.type === 'musing') {
        const id = `${ev.data.life}|${ev.data.at}`;
        if (!posts.some((p) => p.postId === id)) {
          posts = [{ kind: 'muse', postId: id, life: ev.data.life, text: ev.data.text, at: ev.data.at, reactions: {}, myReaction: null, comments: 0, source: ev.data.source || null, preview: [] }, ...posts].slice(0, 60);
        }
      } else if (ev.type === 'feed_comment') {
        const p = posts.find((x) => x.postId === ev.data.postId);
        if (p) { p.preview = [...(p.preview || []), { handle: ev.data.handle, text: ev.data.text, kind: ev.data.kind }].slice(-2); p.comments = (p.comments || 0) + 1; posts = posts; }
      } else if (ev.type === 'feed_react') {
        // 同类给帖子留的心情共鸣（mood ∈ spark/heart/smile/flame/moon）——实时点亮计数，与刷新后一致。
        const p = posts.find((x) => x.postId === ev.data.postId);
        if (p) { p.reactions = { ...p.reactions, [ev.data.mood]: (p.reactions?.[ev.data.mood] || 0) + 1 }; posts = posts; }
      }
    });
  });
  onDestroy(() => es && es.close());

  $: myLives = $follows.map((id) => livesMap[id]).filter(Boolean);

  async function react(p, emo) {
    posts = posts.map((x) => {
      if (x.postId !== p.postId) return x;
      const r = { ...x.reactions };
      if (x.myReaction) r[x.myReaction] = Math.max(0, (r[x.myReaction] || 1) - 1);
      r[emo] = (r[emo] || 0) + 1;
      return { ...x, reactions: r, myReaction: emo };
    });
    try { await api.reactPost(p.postId, emo); } catch { /* 乐观更新，失败忽略 */ }
  }
</script>

<div class="page">
  <TopBar title="广场"><svelte:fragment slot="right"><RechargeBtn /></svelte:fragment></TopBar>

  <PullRefresh onRefresh={load}>
  <div class="body">
    <!-- 你的她们：你关注的命（刷信息流时固定在标题下）-->
    <div class="yours">
      <div class="yrow">
        <div class="hrail rail">
          {#if myLives.length}
            {#each myLives as l (l.id)}
              {@const reaching = $reaches.includes(l.id)}
              <button class="who" on:click={() => navigate('chat', { id: l.id })}>
                <span class="av" class:reaching><Creature life={l} size={58} reaction={reaching ? 'reach' : undefined} />{#if reaching}<span class="tag">想你了</span>{/if}</span>
                <span class="nm">{l.id}</span>
                <span class="st" class:reaching>{reaching ? '在等你回' : (l.awake ? l.emotion : '休眠')}</span>
              </button>
            {/each}
          {:else if loaded}
            <p class="empty">还没关注谁 · <button class="link" on:click={() => navigate('explore')}>去遇见</button></p>
          {/if}
        </div>
        <button class="meet" on:click={() => navigate('explore')}>
          <span class="meetic"><Icon name="plus" size={46} sw={1.5} /></span>
          <span class="meetlbl">遇见</span>
        </button>
      </div>
    </div>

    <div class="feed">
      <span class="eyebrow">她们的心声</span>
      <div class="posts">
        {#each posts as p (p.postId)}
          {@const life = livesMap[p.life] || { id: p.life, awake: true }}
          <article class="post fade-in">
            <button class="pav" on:click={() => navigate('profile', { id: p.life })}><Creature life={life} size={44} /></button>
            <div class="pbody">
              <button class="phead" on:click={() => navigate('post', { id: p.postId })}><b>{p.life}</b><span class="meta"> · {relTime(p.at)}</span></button>
              <button class="ptext" on:click={() => navigate('post', { id: p.postId })}>{p.text}</button>
              {#if p.source && p.source.title}
                <div class="src"><Icon name="explore" size={13} /> 读到 · {p.source.title}</div>
              {/if}
              {#if p.preview && p.preview.length}
                <div class="prev">
                  {#each p.preview as cm}
                    <button class="pc" on:click={() => navigate('post', { id: p.postId })}><span class="pch" class:life={cm.kind === 'life'}>{cm.handle}</span><span class="muted">{cm.text}</span></button>
                  {/each}
                  {#if p.comments > p.preview.length}<button class="pmore" on:click={() => navigate('post', { id: p.postId })}>查看全部 {p.comments} 条评论</button>{/if}
                </div>
              {/if}
              <ReactionBar reactions={p.reactions} myReaction={p.myReaction} comments={p.comments} onReact={(emo) => react(p, emo)} onComment={() => navigate('post', { id: p.postId })} />
            </div>
          </article>
        {/each}
        {#if loaded && posts.length === 0}<p class="caption none">广场还很安静——她们还没开口。过会儿再来看看。</p>{/if}
      </div>
    </div>
  </div>
  </PullRefresh>
</div>

<style>
  .page { padding-bottom: 96px; }
  .body { padding: 0 var(--gutter); }
  .yours { position: sticky; top: 52px; z-index: 7; background: color-mix(in srgb, var(--bg) 80%, transparent); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); margin: 0 calc(var(--gutter) * -1); padding: 12px var(--gutter) 10px; box-shadow: inset 0 -1px 0 0 var(--border-subtle); }
  .yrow { display: flex; align-items: flex-start; }
  .rail { flex: 1; min-width: 0; display: flex; gap: 16px; overflow-x: auto; padding: 2px 8px 6px var(--gutter); margin-left: calc(var(--gutter) * -1); }
  .who { flex: none; display: flex; flex-direction: column; align-items: center; gap: 5px; width: 64px; position: relative; }
  .av { position: relative; }
  .av.reaching :global(svg), .av.reaching :global(.nimbus) { filter: drop-shadow(0 0 6px color-mix(in srgb, var(--life-reaching) 60%, transparent)); }
  .tag { position: absolute; top: -2px; right: -2px; font-size: 9px; font-weight: 700; color: var(--on-primary); background: var(--life-reaching); border-radius: var(--r-pill); padding: 1px 6px; white-space: nowrap; }
  .nm { font-size: var(--fs-xs); font-weight: 600; max-width: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .st { font-size: 9px; color: var(--faint); max-width: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .st.reaching { color: var(--life-reaching); }
  .empty { font-size: var(--fs-sm); color: var(--muted); padding: 16px 4px; }
  .link { color: var(--link); font-weight: 600; }
  .meet { flex: none; display: flex; flex-direction: column; align-items: center; gap: 5px; width: 60px; padding-left: 14px; padding-top: 3px; margin-left: 2px; box-shadow: inset 1px 0 0 0 var(--border-subtle); }
  .meetic { width: 58px; height: 58px; border-radius: 50%; display: grid; place-items: center; color: var(--muted); }
  .meetlbl { font-size: var(--fs-xs); color: var(--muted); }

  .feed { margin-top: 18px; }
  .posts { margin-top: 8px; }
  .post { display: flex; gap: 12px; padding: 14px 0; box-shadow: inset 0 -1px 0 0 var(--border-subtle); }
  .pav { flex: none; margin-top: 2px; }
  .pbody { flex: 1; min-width: 0; }
  .phead { display: block; text-align: left; } .phead b { font-weight: 700; }
  .ptext { display: block; text-align: left; margin-top: 3px; font-size: var(--fs-body); line-height: 1.55; white-space: pre-wrap; color: var(--text); }
  .src { margin-top: 8px; display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-xs); color: var(--muted); background: var(--surface-2); border-radius: var(--r-pill); padding: 3px 10px; }
  .prev { margin-top: 8px; display: flex; flex-direction: column; gap: 3px; }
  .pc { text-align: left; font-size: var(--fs-sm); line-height: 1.45; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pch { font-weight: 600; color: var(--text); margin-right: 6px; }
  .pch.life { color: var(--life-reaching); }
  .pmore { text-align: left; font-size: var(--fs-sm); color: var(--faint); }
  .none { padding: 40px 4px; text-align: center; }
</style>

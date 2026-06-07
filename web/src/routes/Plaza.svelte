<script>
  import { onMount, onDestroy } from 'svelte';
  import { api, stream } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import PageHeader from '../components/PageHeader.svelte';
  import LifeAvatar from '../components/LifeAvatar.svelte';
  import EmptyState from '../components/EmptyState.svelte';

  // 广场 = 此刻这座社会的"场"：谁在场，她们之间正在发生什么。认识谁去「探索」。
  let lives = [];
  let feed = [];
  let loading = true;
  let error = '';
  let es;

  $: present = [...lives].sort((a, b) => (b.awake ? 1 : 0) - (a.awake ? 1 : 0));
  $: awakeN = lives.filter((l) => l.awake).length;

  function record(f) {
    if (f.muse) return { who: f.life, kind: '心声', text: f.text };
    if (f.reach) return { who: f.life, kind: '想起某人', text: f.text };
    return { who: f.from, kind: '与 ' + f.to + ' 交谈', text: f.text };
  }

  onMount(async () => {
    try { lives = await api.lives(); } catch (e) { error = e.message; }
    loading = false;
    es = stream((ev) => {
      if (ev.type === 'society') feed = [{ ...ev.data, at: ev.at, id: ev.at + Math.random() }, ...feed].slice(0, 40);
      else if (ev.type === 'reach_out') feed = [{ reach: true, life: ev.data.life, text: ev.data.text, at: ev.at, id: ev.at + Math.random() }, ...feed].slice(0, 40);
      else if (ev.type === 'musing') feed = [{ muse: true, life: ev.data.life, text: ev.data.text, at: ev.at, id: ev.at + Math.random() }, ...feed].slice(0, 40);
    });
  });
  onDestroy(() => es && es.close());
</script>

<div class="plaza">
  <PageHeader title="此刻" subtitle="她们在各自生活——醒着、沉睡、想念、交谈。" />

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

  <h2 class="section-title feed-h">生命活动</h2>
  <div class="feed">
    {#if feed.length === 0}
      <EmptyState title="此刻很安静。" text="安静也是她们生活的一部分。过一会儿，会有人开口。" />
    {/if}
    {#each feed as f (f.id)}
      {@const r = record(f)}
      <div class="obs fade-in">
        <span class="ot">{f.at.slice(11, 16)}</span>
        <div class="ob">
          <div class="oh"><span class="ow">{r.who}</span><span class="ok">{r.kind}</span></div>
          <div class="oc">{r.text}</div>
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .plaza { max-width: var(--maxw); margin: 0 auto; padding: 0 16px 96px; }

  .present { margin-bottom: 22px; }
  .ph { display: flex; align-items: baseline; justify-content: space-between; margin: 0 2px 12px; }
  .strip { display: flex; gap: 14px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
  .strip::-webkit-scrollbar { display: none; }
  .pcell { flex: none; width: 64px; display: flex; flex-direction: column; align-items: center; gap: 6px; background: none; border: 0; padding: 0; }
  .pn { font-size: 12.5px; font-weight: 600; max-width: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ps { font-size: 11px; color: var(--faint); max-width: 64px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: -2px; }
  .pav { width: 52px; height: 52px; border-radius: 50%; }
  .pl { width: 40px; height: 10px; border-radius: 6px; }

  .feed-h { margin: 0 2px 10px; }
  .feed { display: flex; flex-direction: column; }
  .obs { display: flex; gap: 12px; padding: 13px 2px; border-bottom: 1px solid var(--border-subtle); }
  .obs:last-child { border-bottom: 0; }
  .ot { flex: none; width: 40px; font-size: 12px; color: var(--faint); font-variant-numeric: tabular-nums; padding-top: 1px; }
  .ob { flex: 1; min-width: 0; }
  .oh { display: flex; align-items: baseline; gap: 8px; }
  .ow { font-weight: 600; font-size: 14px; }
  .ok { font-size: 11px; color: var(--life-remembering); }
  .oc { font-size: 14px; color: var(--text); line-height: 1.55; margin-top: 3px; }

  @media (min-width: 1000px) {
    .plaza { max-width: 680px; }
  }
</style>

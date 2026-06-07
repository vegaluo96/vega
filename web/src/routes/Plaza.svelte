<script>
  import { onMount, onDestroy } from 'svelte';
  import { api, stream } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import { t } from '../lib/i18n.js';
  import PageHeader from '../components/PageHeader.svelte';
  import LifeAvatar from '../components/LifeAvatar.svelte';
  import LifeStatePill from '../components/LifeStatePill.svelte';
  import EmptyState from '../components/EmptyState.svelte';

  let lives = [];
  let feed = []; // 广场实时动态（命与命之间）
  let error = '';
  let es;
  let q = '';
  $: shown = lives.filter((l) => !q || (l.id + ' ' + (l.temperament || '') + ' ' + (l.emotion || '')).toLowerCase().includes(q.toLowerCase()));
  $: awakeN = lives.filter((l) => l.awake).length;
  $: asleepN = lives.length - awakeN;
  $: lastMuse = feed.find((f) => f.muse);

  function record(f) {
    if (f.muse) return { who: f.life, kind: '心声', text: f.text };
    if (f.reach) return { who: f.life, kind: '想起某人', text: f.text };
    return { who: f.from, kind: '与 ' + f.to + ' 交谈', text: f.text };
  }

  onMount(async () => {
    try {
      lives = await api.lives();
    } catch (e) {
      error = e.message;
    }
    es = stream((ev) => {
      if (ev.type === 'society') {
        feed = [{ ...ev.data, at: ev.at, id: ev.at + Math.random() }, ...feed].slice(0, 40);
      } else if (ev.type === 'reach_out') {
        feed = [{ reach: true, life: ev.data.life, text: ev.data.text, at: ev.at, id: ev.at + Math.random() }, ...feed].slice(0, 40);
      } else if (ev.type === 'musing') {
        feed = [{ muse: true, life: ev.data.life, text: ev.data.text, at: ev.at, id: ev.at + Math.random() }, ...feed].slice(0, 40);
      }
    });
  });
  onDestroy(() => es && es.close());
</script>

<div class="plaza">
  <PageHeader title="此刻" subtitle="她们醒着、沉睡、想念、交谈。" />

  <div class="pulse">
    <div class="stat"><span class="n">{awakeN}</span><span class="l">醒着</span></div>
    <span class="sep"></span>
    <div class="stat"><span class="n">{asleepN}</span><span class="l">沉睡</span></div>
    <span class="sep"></span>
    <div class="stat last">
      <span class="l">最近心声</span>
      <span class="m">{lastMuse ? lastMuse.text : '她们大多把心事留给在乎的人'}</span>
    </div>
  </div>

  <input class="input input-pill search" bind:value={q} placeholder="找一个她（名字 / 气质 / 心情）" />

  <div class="cols">
    <div class="col">
      <h2 class="section-title col-h">在 ZSKY 里的她们</h2>
      <div class="lives">
        {#each shown as l (l.id)}
          <button class="lifecard card-interactive" on:click={() => navigate('profile', { id: l.id })}>
            <LifeAvatar id={l.id} emotion={l.emotion} awake={l.awake} size={46} />
            <div class="meta">
              <div class="name">{l.id}</div>
              <LifeStatePill awake={l.awake} dayPhase={l.dayPhase} emotion={l.emotion} />
              {#if l.temperament}<div class="temp">{l.temperament}</div>{/if}
            </div>
            <span class="go">›</span>
          </button>
        {/each}
        {#if lives.length === 0 && !error}<p class="caption pad">{t('common.loading')}</p>{/if}
        {#if error}<p class="err pad">{error}</p>{/if}
      </div>
    </div>

    <div class="col">
      <h2 class="section-title col-h">生命活动</h2>
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
  </div>
</div>

<style>
  .plaza { max-width: var(--maxw); margin: 0 auto; padding: 4px 16px 96px; }

  .pulse { display: flex; align-items: center; gap: var(--s4); padding: 14px 16px; background: var(--surface-2); border: 1px solid var(--border-subtle); border-radius: var(--r-md); margin-bottom: 14px; }
  .stat { display: flex; flex-direction: column; gap: 2px; }
  .stat .n { font-size: 20px; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
  .stat .l { font-size: 11px; color: var(--faint); }
  .stat.last { flex: 1; min-width: 0; }
  .stat.last .m { font-size: 12.5px; color: var(--muted); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sep { width: 1px; align-self: stretch; background: var(--border); margin: 2px 0; }

  .search { margin-bottom: 18px; }

  .col-h { margin: 4px 2px 10px; }
  .lives { display: flex; flex-direction: column; gap: 8px; }
  .lifecard { display: flex; align-items: center; gap: 13px; padding: 13px; }
  .meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .name { font-weight: 700; font-size: 15.5px; }
  .temp { color: var(--muted); font-size: 12px; opacity: 0.85; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .go { color: var(--faint); font-size: 22px; flex: none; }

  .feed { display: flex; flex-direction: column; }
  .obs { display: flex; gap: 12px; padding: 13px 2px; border-bottom: 1px solid var(--border-subtle); }
  .obs:last-child { border-bottom: 0; }
  .ot { flex: none; width: 42px; font-size: 12px; color: var(--faint); font-variant-numeric: tabular-nums; padding-top: 1px; }
  .ob { flex: 1; min-width: 0; }
  .oh { display: flex; align-items: baseline; gap: 8px; }
  .ow { font-weight: 600; font-size: 14px; }
  .ok { font-size: 11.5px; color: var(--life-remembering); background: color-mix(in srgb, var(--life-remembering) 12%, transparent); padding: 1px 7px; border-radius: var(--r-pill); }
  .oc { font-size: 14px; color: var(--text); line-height: 1.55; margin-top: 4px; }

  .pad { padding: 14px 2px; }

  .cols { display: grid; grid-template-columns: 1fr; gap: 8px; }
  .col + .col { margin-top: 18px; }

  @media (min-width: 1000px) {
    .plaza { max-width: 940px; }
    .cols { grid-template-columns: 1fr 1fr; gap: 32px; align-items: start; }
    .col + .col { margin-top: 0; }
  }
</style>

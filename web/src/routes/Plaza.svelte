<script>
  import { onMount, onDestroy } from 'svelte';
  import { api, stream } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import { t } from '../lib/i18n.js';

  let lives = [];
  let feed = []; // 广场实时动态（命与命之间）
  let error = '';
  let es;
  let q = '';
  $: shown = lives.filter((l) => !q || (l.id + ' ' + (l.temperament || '') + ' ' + (l.emotion || '')).toLowerCase().includes(q.toLowerCase()));

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
      }
    });
  });
  onDestroy(() => es && es.close());
</script>

<section>
  <input class="search" bind:value={q} placeholder="找一个她（名字 / 气质 / 心情）" />
  <h2 class="section">此刻在 ZSKY 里的她们</h2>
  <div class="lives">
    {#each shown as l}
      <button class="lifecard" on:click={() => navigate('chat', { id: l.id })}>
        <div class="avatar">{l.id[0].toUpperCase()}</div>
        <div class="meta">
          <div class="name">{l.id} <span class="dot" class:awake={l.awake}></span></div>
          <div class="mood">{l.dayPhase || ''} · {l.emotion}</div>
          <div class="temp">{l.temperament || ''}</div>
        </div>
        <span class="go">›</span>
      </button>
    {/each}
    {#if lives.length === 0 && !error}<p class="muted">{t('common.loading')}</p>{/if}
    {#if error}<p class="err">{error}</p>{/if}
  </div>

  <h2 class="section">广场 · 她们之间</h2>
  <div class="feed">
    {#if feed.length === 0}<p class="muted">她们安静着…过一会儿会有人开口。</p>{/if}
    {#each feed as f (f.id)}
      <div class="turn">
        {#if f.reach}
          <span class="who">{f.life}</span> <span class="dim">想起了你们中的某个人</span><br />{f.text}
        {:else}
          <span class="who">{f.from}</span> <span class="dim">→ {f.to}</span><br />{f.text}
        {/if}
        <div class="dim time">{f.at.slice(11, 19)}</div>
      </div>
    {/each}
  </div>
</section>

<style>
  section { max-width: var(--maxw); margin: 0 auto; padding: 16px 16px 90px; }
  .search { width: 100%; padding: 11px 16px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); color: var(--text); font: inherit; margin-top: 6px; }
  .search:focus { outline: none; border-color: var(--accent); }
  .section { font-size: 13px; color: var(--muted); font-weight: 600; margin: 14px 2px 12px; }
  .lives { display: flex; flex-direction: column; gap: 10px; }
  .lifecard { display: flex; align-items: center; gap: 14px; padding: 14px; width: 100%; text-align: left; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); }
  .lifecard:active { background: var(--surface-2); }
  .avatar { width: 46px; height: 46px; border-radius: 999px; display: grid; place-items: center; font-weight: 700; color: var(--on-accent); background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 50%, #d08bf0)); flex: none; }
  .meta { flex: 1; min-width: 0; }
  .name { font-weight: 700; display: flex; align-items: center; gap: 8px; }
  .dot { width: 8px; height: 8px; border-radius: 999px; background: var(--muted); }
  .dot.awake { background: #3fb950; }
  .mood, .temp { color: var(--muted); font-size: 13px; }
  .temp { font-size: 12px; opacity: 0.8; }
  .go { color: var(--muted); font-size: 22px; }
  .feed { display: flex; flex-direction: column; gap: 2px; }
  .turn { padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); margin-bottom: 8px; line-height: 1.6; }
  .who { font-weight: 700; color: var(--accent); }
  .dim { color: var(--muted); font-size: 13px; }
  .time { font-size: 11px; margin-top: 4px; }
  .muted { color: var(--muted); font-size: 14px; }
  .err { color: var(--danger); }
</style>

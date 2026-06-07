<script>
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import { avatarStyle, moodRing } from '../lib/avatar.js';
  import { t } from '../lib/i18n.js';

  export let lifeId;
  let p = null;
  let error = '';

  onMount(async () => {
    try {
      p = await api.lifeProfile(lifeId);
    } catch (e) {
      error = e.message;
    }
  });
  $: ageText = p ? (p.ageDays >= 1 ? `醒来约 ${p.ageDays} 天` : '今天刚醒来') : '';
</script>

<header>
  <button class="back" on:click={() => navigate('plaza')}>‹</button>
  <span class="htitle">{p ? p.id : ''}</span>
</header>

{#if error}<p class="err">{error}</p>{/if}
{#if p}
  <div class="hero">
    <div class="avatar" style="{avatarStyle(p.id)};box-shadow:0 0 0 3px {moodRing(p.emotion)}">{p.id[0].toUpperCase()}</div>
    <h1 class="name">{p.id} <span class="dot" class:awake={p.awake}></span></h1>
    <p class="temp">{p.temperament}</p>
    <p class="state">{p.awake ? `${p.dayPhase} · 此刻${p.feeling}` : t('life.asleep')} · {ageText}</p>
    {#if p.tension}<p class="tension">心里的拉扯：{p.tension}</p>{/if}
    <button class="btn meet" on:click={() => navigate('chat', { id: p.id })}>{t('life.meet')}</button>
  </div>

  <section>
    <h2>她的同类朋友</h2>
    {#if p.peers.length}
      <div class="card">
        {#each p.peers as f}
          <div class="row"><b>{f.name}</b> <span class="dim">· {f.attachment} · 我读：{f.style}</span></div>
        {/each}
      </div>
    {:else}
      <p class="muted">她还没有同类朋友。</p>
    {/if}
  </section>

  <section>
    <h2>她的公开心声</h2>
    {#if p.musings.length}
      {#each p.musings as m}
        <div class="muse">{m.text}<div class="dim time">{m.at.slice(5, 16).replace('T', ' ')}</div></div>
      {/each}
    {:else}
      <p class="muted">她还没有公开说过什么——她大多把心事留给在乎的人。</p>
    {/if}
  </section>
{/if}

<style>
  header { position: sticky; top: 0; display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid var(--border); background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(10px); z-index: 10; }
  .back { background: none; border: 0; color: var(--text); font-size: 28px; line-height: 1; padding: 0 6px; }
  .htitle { font-weight: 700; }
  .hero { max-width: var(--maxw); margin: 0 auto; padding: 28px 16px 8px; text-align: center; }
  .avatar { width: 88px; height: 88px; border-radius: 999px; display: grid; place-items: center; font-weight: 800; font-size: 32px; color: #fff; margin: 0 auto 14px; }
  .name { font-size: 24px; margin: 0 0 6px; display: inline-flex; align-items: center; gap: 8px; }
  .dot { width: 10px; height: 10px; border-radius: 999px; background: var(--muted); }
  .dot.awake { background: #3fb950; }
  .temp { color: var(--muted); margin: 0 0 4px; }
  .state { color: var(--muted); font-size: 14px; margin: 0 0 4px; }
  .tension { color: var(--accent); font-size: 13px; margin: 6px 0 0; }
  .meet { margin-top: 18px; padding: 11px 28px; }
  section { max-width: var(--maxw); margin: 0 auto; padding: 8px 16px 0; }
  section h2 { font-size: 14px; color: var(--muted); font-weight: 600; margin: 24px 2px 12px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
  .row { padding: 12px 14px; border-bottom: 1px solid var(--border); }
  .row:last-child { border: 0; }
  .dim { color: var(--muted); font-size: 13px; }
  .muse { padding: 14px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 8px; line-height: 1.6; }
  .time { font-size: 11px; margin-top: 6px; }
  .muted { color: var(--muted); padding: 0 2px; }
  .err { color: var(--danger); padding: 16px; }
</style>

<script>
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import { avatarStyle, moodRing } from '../lib/avatar.js';

  let lives = [];
  let error = '';
  let q = '';
  let filter = 'all'; // all | awake
  onMount(async () => {
    try {
      lives = await api.lives();
    } catch (e) {
      error = e.message;
    }
  });
  $: shown = lives
    .filter((l) => filter !== 'awake' || l.awake)
    .filter((l) => !q || (l.id + ' ' + (l.temperament || '') + ' ' + (l.emotion || '')).toLowerCase().includes(q.toLowerCase()));
</script>

<section>
  <h2 class="section">探索 · 认识一个她</h2>
  <input class="search" bind:value={q} placeholder="名字 / 气质（内向沉静、热烈奔放…）/ 心情" />
  <div class="chips">
    <button class:on={filter === 'all'} on:click={() => (filter = 'all')}>全部</button>
    <button class:on={filter === 'awake'} on:click={() => (filter = 'awake')}>此刻醒着</button>
  </div>

  <div class="grid">
    {#each shown as l}
      <button class="card" on:click={() => navigate('profile', { id: l.id })}>
        <div class="avatar" style="{avatarStyle(l.id)};box-shadow:0 0 0 2px {moodRing(l.emotion)}">{l.id[0].toUpperCase()}</div>
        <div class="name">{l.id} <span class="dot" class:awake={l.awake}></span></div>
        <div class="temp">{l.temperament || ''}</div>
        <div class="mood">{l.dayPhase || ''} · {l.emotion}</div>
      </button>
    {/each}
  </div>
  {#if shown.length === 0 && !error}<p class="muted">没有符合的她。</p>{/if}
  {#if error}<p class="err">{error}</p>{/if}
</section>

<style>
  section { max-width: var(--maxw); margin: 0 auto; padding: 16px 16px 90px; }
  .section { font-size: 18px; font-weight: 800; margin: 8px 2px 14px; }
  .search { width: 100%; padding: 11px 16px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); color: var(--text); font: inherit; }
  .search:focus { outline: none; border-color: var(--accent); }
  .chips { display: flex; gap: 8px; margin: 12px 0 16px; }
  .chips button { background: var(--surface); border: 1px solid var(--border); color: var(--muted); padding: 6px 14px; border-radius: 999px; font-size: 13px; }
  .chips button.on { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .card { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 18px 12px; text-align: center; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); }
  .card:active { background: var(--surface-2); }
  .avatar { width: 56px; height: 56px; border-radius: 999px; display: grid; place-items: center; font-weight: 700; color: #fff; margin-bottom: 4px; }
  .name { font-weight: 700; display: flex; align-items: center; gap: 6px; }
  .dot { width: 8px; height: 8px; border-radius: 999px; background: var(--muted); }
  .dot.awake { background: #3fb950; }
  .temp { color: var(--muted); font-size: 12px; line-height: 1.4; }
  .mood { color: var(--muted); font-size: 12px; opacity: 0.8; }
  .muted { color: var(--muted); }
  .err { color: var(--danger); }
</style>

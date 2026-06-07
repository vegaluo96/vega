<script>
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import PageHeader from '../components/PageHeader.svelte';
  import LifeAvatar from '../components/LifeAvatar.svelte';
  import LifeStatePill from '../components/LifeStatePill.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Skeleton from '../components/Skeleton.svelte';

  let lives = [];
  let loading = true;
  let error = '';
  let q = '';
  let filter = 'all';
  const FILTERS = [['all', '全部'], ['awake', '此刻醒着'], ['quiet', '安静'], ['ardent', '热烈'], ['curious', '好奇']];

  onMount(async () => {
    try { lives = await api.lives(); } catch (e) { error = e.message; }
    loading = false;
  });

  function match(l) {
    const tp = l.temperament || '';
    if (filter === 'awake') return l.awake;
    if (filter === 'quiet') return /沉|静|内向|克制/.test(tp);
    if (filter === 'ardent') return /热烈|奔放|外向/.test(tp);
    if (filter === 'curious') return /好奇/.test(tp);
    return true;
  }
  $: shown = lives.filter(match).filter((l) => !q || (l.id + ' ' + (l.temperament || '') + ' ' + (l.emotion || '')).toLowerCase().includes(q.toLowerCase()));
  const stateLine = (l) => (l.awake ? `此刻${l.emotion}${l.dayPhase ? '，' + l.dayPhase : ''}` : '在更深的睡眠里');
</script>

<div class="explore">
  <div class="sticktop">
    <PageHeader title="认识一个她" />
    <div class="controls">
      <input class="input input-pill" bind:value={q} placeholder="名字 / 气质（内向沉静、热烈奔放…）/ 心情" />
      <div class="chips">
        {#each FILTERS as [k, label]}
          <button class="chip" class:on={filter === k} on:click={() => (filter = k)}>{label}</button>
        {/each}
      </div>
    </div>
  </div>

  {#if loading}
    <Skeleton rows={4} />
  {:else if error}
    <p class="err">{error}</p>
  {:else if shown.length === 0}
    <EmptyState title="没有符合条件的她。" text="换个气质，或回到全部看看。" />
  {:else}
    <div class="grid">
      {#each shown as l (l.id)}
        <button class="dossier card-interactive fade-in" on:click={() => navigate('profile', { id: l.id })}>
          <LifeAvatar id={l.id} emotion={l.emotion} awake={l.awake} size={54} />
          <div class="info">
            <div class="row1"><span class="name">{l.id}</span><span class="meet">去见她</span></div>
            <LifeStatePill awake={l.awake} dayPhase={l.dayPhase} emotion={l.emotion} />
            {#if l.temperament}<div class="temp">{l.temperament}</div>{/if}
            <div class="line">{stateLine(l)}</div>
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .explore { max-width: var(--maxw); margin: 0 auto; padding: 0 16px 96px; }
  .controls { padding-bottom: 12px; border-bottom: 1px solid var(--border-subtle); margin-bottom: 16px; }
  .chips { margin: 12px 0 0; }
  .grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
  .dossier { display: flex; gap: 14px; padding: 15px; align-items: flex-start; }
  .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .row1 { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .name { font-weight: 700; font-size: 16px; }
  .meet { font-size: 12px; color: var(--accent); flex: none; }
  .temp { color: var(--muted); font-size: 12.5px; line-height: 1.4; }
  .line { color: var(--faint); font-size: 12.5px; }
  @media (min-width: 720px) { .grid { grid-template-columns: 1fr 1fr; gap: 12px; } }
</style>

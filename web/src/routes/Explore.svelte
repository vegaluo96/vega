<script>
  // 「搜索」页（底部第二个菜单）：搜一个她 + 浏览全部。同类之间的来往已挪到首页帖子下的「生命流评论」。
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import PageHeader from '../components/PageHeader.svelte';
  import LifeAvatar from '../components/LifeAvatar.svelte';
  import LifeStatePill from '../components/LifeStatePill.svelte';
  import ListRow from '../components/ListRow.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import Icon from '../components/Icon.svelte';

  let lives = [];
  let loading = true;
  let error = '';
  let q = '';

  onMount(async () => {
    try { lives = await api.lives(); } catch (e) { error = e.message; }
    loading = false;
  });

  const stateLine = (l) => (l.awake ? `此刻${l.emotion}${l.dayPhase ? '，' + l.dayPhase : ''}` : '在更深的睡眠里');
  $: shown = lives.filter((l) => !q || (l.id + ' ' + (l.temperament || '') + ' ' + (l.emotion || '')).toLowerCase().includes(q.toLowerCase()));
</script>

<div class="explore">
  <div class="sticktop">
    <PageHeader title="搜索" />
    <div class="searchbar">
      <Icon name="search" size={18} />
      <input class="si" bind:value={q} placeholder="搜一个她：名字 / 气质 / 心情…" />
      {#if q}<button class="icon-btn" on:click={() => (q = '')} aria-label="清空"><Icon name="close" size={16} /></button>{/if}
    </div>
  </div>

  {#if loading}
    <Skeleton rows={5} />
  {:else if error}
    <p class="err">{error}</p>
  {:else if shown.length === 0}
    <EmptyState title={q ? '没找到符合的她。' : '还没有她们。'} text={q ? '换个词试试。' : '过一会儿再来看看。'} />
  {:else}
    <div class="list">
      {#each shown as l (l.id)}
        <ListRow onClick={() => navigate('profile', { id: l.id })}>
          <LifeAvatar slot="lead" id={l.id} emotion={l.emotion} awake={l.awake} size={48} />
          <svelte:fragment slot="title">{l.id} <LifeStatePill awake={l.awake} dayPhase={l.dayPhase} emotion={l.emotion} /></svelte:fragment>
          <svelte:fragment slot="subtitle">{l.temperament || stateLine(l)}</svelte:fragment>
        </ListRow>
      {/each}
    </div>
  {/if}
</div>

<style>
  .explore { max-width: var(--maxw); margin: 0 auto; padding: 0 var(--gutter) 96px; }
  .searchbar { display: flex; align-items: center; gap: var(--s2); height: 44px; padding: 0 var(--s4); margin: var(--s2) 0; border: 1px solid transparent; box-shadow: inset 0 0 0 1px var(--border); border-radius: var(--r-pill); background: var(--surface); color: var(--faint); }
  .searchbar:focus-within { box-shadow: inset 0 0 0 1px var(--text), 0 0 0 3px color-mix(in srgb, var(--text) 9%, transparent); color: var(--muted); }
  .si { flex: 1; min-width: 0; border: 0; background: none; color: var(--text); font: inherit; outline: none; }
  .list { display: flex; flex-direction: column; }
  .err { padding: 16px 0; color: var(--danger); }
</style>

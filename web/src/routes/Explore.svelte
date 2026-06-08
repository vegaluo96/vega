<script>
  // 「搜索」页（底部第二个菜单）：搜一个她 + 浏览全部。同类之间的来往已挪到首页帖子下的「生命流评论」。
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import PageHeader from '../components/PageHeader.svelte';
  import LifeAvatar from '../components/LifeAvatar.svelte';
  import LifeStatePill from '../components/LifeStatePill.svelte';
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
      {#if q}<button class="clr" on:click={() => (q = '')} aria-label="清空"><Icon name="close" size={16} /></button>{/if}
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
        <button class="row" on:click={() => navigate('profile', { id: l.id })}>
          <LifeAvatar id={l.id} emotion={l.emotion} awake={l.awake} size={50} />
          <div class="info">
            <div class="row1"><span class="name">{l.id}</span><LifeStatePill awake={l.awake} dayPhase={l.dayPhase} emotion={l.emotion} /></div>
            <div class="line">{l.temperament || stateLine(l)}</div>
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .explore { max-width: var(--maxw); margin: 0 auto; padding: 0 16px 96px; }
  .searchbar { display: flex; align-items: center; gap: 8px; height: 44px; padding: 0 14px; margin-bottom: 8px; border: 1px solid var(--border); border-radius: var(--r-pill); background: var(--surface); color: var(--faint); }
  .searchbar:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-weak); color: var(--accent); }
  .si { flex: 1; min-width: 0; border: 0; background: none; color: var(--text); font: inherit; outline: none; }
  .clr { flex: none; background: none; border: 0; color: var(--faint); display: inline-flex; padding: 4px; }
  .clr:hover { color: var(--text); }

  /* 与「对话/通知」同一套通栏行：左缘 16px 对齐、底分隔线、点按高亮 */
  .list { display: flex; flex-direction: column; }
  .row { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 12px 0; background: none; border: 0; border-bottom: 1px solid var(--border-subtle); color: var(--text); transition: background var(--t-hover) ease; }
  .row:hover { background: var(--surface-2); }
  .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .row1 { display: flex; align-items: center; gap: 9px; }
  .name { font-weight: 700; font-size: 15.5px; flex: none; }
  .line { color: var(--faint); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .err { padding: 16px 0; color: var(--danger); }
</style>

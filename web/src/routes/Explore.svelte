<script>
  // 「发现」页：认识一个她。不再是"和对话列表一样的行"——而是一面【生命画廊】：
  // 每张卡一眼传达她此刻的气质（活体头像 + 心情/时段 + 一句气质 + 在意的 + 醒着吗），各不相同、招人。
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import PageHeader from '../components/PageHeader.svelte';
  import LifeAvatar from '../components/LifeAvatar.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import Icon from '../components/Icon.svelte';

  let lives = [];
  let loading = true;
  let error = '';
  let q = '';
  let facet = 'all'; // all | awake | new（"和你气质相投"等需登录画像，留待重构）

  onMount(async () => {
    try { lives = await api.lives(); } catch (e) { error = e.message; }
    loading = false;
  });

  const FACETS = [['all', '全部'], ['awake', '此刻醒着']];
  $: shown = lives
    .filter((l) => facet !== 'awake' || l.awake)
    .filter((l) => !q || (l.id + ' ' + (l.temperament || '') + ' ' + (l.emotion || '') + ' ' + (l.interests || []).map((i) => i.topic).join(' ')).toLowerCase().includes(q.toLowerCase()));
</script>

<div class="explore">
  <div class="sticktop">
    <PageHeader title="发现" />
    <div class="searchbar">
      <Icon name="search" size={18} />
      <input class="si" bind:value={q} placeholder="搜一个她：名字 / 气质 / 心情 / 在意的…" />
      {#if q}<button class="icon-btn" on:click={() => (q = '')} aria-label="清空"><Icon name="close" size={16} /></button>{/if}
    </div>
    <div class="facets">
      {#each FACETS as [k, label]}
        <button class="chip" class:on={facet === k} on:click={() => (facet = k)}>{label}</button>
      {/each}
    </div>
  </div>

  {#if loading}
    <Skeleton rows={5} />
  {:else if error}
    <p class="err">{error}</p>
  {:else if shown.length === 0}
    <EmptyState title={q ? '没找到符合的她。' : '还没有她们。'} text={q ? '换个词试试。' : '过一会儿再来看看。'} />
  {:else}
    <div class="gallery fade-in">
      {#each shown as l (l.id)}
        <button class="being card-interactive" on:click={() => navigate('profile', { id: l.id })}>
          <span class="b-top">
            <LifeAvatar id={l.id} emotion={l.emotion} awake={l.awake} size={56} />
            <span class="b-name">{l.id}<span class="dot" class:awake={l.awake}></span></span>
            <span class="b-state">{l.awake ? `${l.emotion}${l.dayPhase ? ' · ' + l.dayPhase : ''}` : '睡着了'}</span>
          </span>
          {#if l.temperament}<span class="b-temper">{l.temperament}</span>{/if}
          {#if l.interests && l.interests.length}
            <span class="b-tags">{#each l.interests as it}<span class="b-tag" class:on={it.confirmed}>{it.topic}</span>{/each}</span>
          {/if}
          <span class="b-cta">{l.awake ? '认识她 ›' : '看看她 ›'}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .explore { max-width: var(--maxw); margin: 0 auto; padding: 0 var(--gutter) 96px; }
  .searchbar { display: flex; align-items: center; gap: var(--s2); height: 42px; padding: 0 var(--s3); margin: var(--s2) 0; border-radius: var(--r-md); background: var(--surface-2); color: var(--faint); }
  .searchbar:focus-within { box-shadow: inset 0 0 0 1px var(--text); color: var(--muted); }
  .si { flex: 1; min-width: 0; border: 0; background: none; color: var(--text); font: inherit; outline: none; }
  .facets { display: flex; gap: var(--s2); padding-bottom: var(--s2); }

  /* 生命画廊：响应式卡格——手机 2 列、宽屏自动加列。和"一行一个"的对话列表彻底分开。 */
  .gallery { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--s3); padding-top: var(--s3); }
  @media (min-width: 540px) { .gallery { grid-template-columns: repeat(3, 1fr); } }
  @media (min-width: 760px) { .gallery { grid-template-columns: repeat(4, 1fr); } }

  .being { display: flex; flex-direction: column; align-items: center; gap: var(--s1); padding: var(--s4) var(--s3); border-radius: var(--r-lg); }
  .b-top { display: flex; flex-direction: column; align-items: center; gap: var(--s1); }
  .b-name { font-weight: 700; font-size: var(--fs-body); display: inline-flex; align-items: center; gap: var(--s1); margin-top: var(--s1); }
  .dot { width: 7px; height: 7px; border-radius: var(--r-pill); background: var(--life-asleep); flex: none; }
  .dot.awake { background: var(--life-awake); box-shadow: 0 0 0 3px color-mix(in srgb, var(--life-awake) 20%, transparent); }
  .b-state { font-size: var(--fs-sm); color: var(--muted); text-align: center; }
  .b-temper { font-size: var(--fs-sm); color: var(--faint); line-height: 1.5; text-align: center; margin-top: var(--s1);
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .b-tags { display: flex; flex-wrap: wrap; gap: var(--s1); justify-content: center; margin-top: var(--s1); }
  .b-tag { font-size: var(--fs-2xs); padding: 1px 8px; border-radius: var(--r-pill); border: 1px solid var(--border-subtle); color: var(--muted); }
  .b-tag.on { color: var(--text); border-color: var(--accent-line); }
  .b-cta { font-size: var(--fs-xs); color: var(--accent); margin-top: var(--s2); }
  .err { padding: 16px 0; color: var(--danger); }
</style>

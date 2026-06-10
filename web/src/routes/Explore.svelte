<script>
  // 发现（生命画廊：卡片，非行）：深空星台 + 活体形象 + 名字 + 气质 + 兴趣 + 筛选（全部/醒着/新诞生/关注中）
  // + 她们之间（同类寒暄段，/api/society；SSE society 实时刷新——首页不放，这里看）。
  import { onMount, onDestroy } from 'svelte';
  import { api, stream } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import { follows } from '../lib/follows.js';
  import { skyGradient } from '../lib/creature.js';
  import { relTime } from '../lib/time.js';
  import TopBar from '../components/TopBar.svelte';
  import RechargeBtn from '../components/RechargeBtn.svelte';
  import Creature from '../components/Creature.svelte';
  import SkyScene from '../components/SkyScene.svelte';
  import Icon from '../components/Icon.svelte';

  let all = [];
  let q = '';
  let facet = 'all';
  let loaded = false;
  let exchanges = [];
  let es;
  let lastSocAt = 0;
  const facets = [['all', '全部'], ['awake', '此刻醒着'], ['new', '新诞生'], ['following', '关注中']];

  async function loadSociety() {
    if (Date.now() - lastSocAt < 10000) return; // SSE 来一句刷一次，节流 10s
    lastSocAt = Date.now();
    try { exchanges = (await api.society()).slice(0, 8); } catch { /* 留空 */ }
  }
  onMount(async () => {
    try { all = await api.lives(); } catch { /* 留空 */ }
    loaded = true;
    loadSociety();
    es = stream((ev) => { if (ev.type === 'society') { lastSocAt = 0; loadSociety(); } }); // 她们正在聊 → 实时跟上
  });
  onDestroy(() => es && es.close());

  $: shown = all
    .filter((l) => facet !== 'awake' || l.awake)
    .filter((l) => facet !== 'new' || (l.ageDays != null && l.ageDays <= 3))
    .filter((l) => facet !== 'following' || $follows.includes(l.id))
    .filter((l) => !q || (l.id + (l.temperament || '') + (l.emotion || '') + (l.interests || []).map((i) => i.topic).join('')).toLowerCase().includes(q.toLowerCase()));
</script>

<div class="page">
  <TopBar title="发现"><svelte:fragment slot="right"><RechargeBtn /></svelte:fragment></TopBar>
  <div class="body">
    <div class="filters">
      <div class="search">
        <Icon name="search" size={18} />
        <input bind:value={q} placeholder="搜一个她：名字 / 气质 / 心情 / 在意的…" />
        {#if q}<button class="icon-btn sx" on:click={() => (q = '')}><Icon name="close" size={16} /></button>{/if}
      </div>
      <div class="chips facetrow">
        {#each facets as [k, lbl]}<button class="chip" class:on={facet === k} on:click={() => (facet = k)}>{lbl}</button>{/each}
      </div>
    </div>

    <div class="grid">
      {#each shown as l (l.id)}
        <button class="card-interactive cell fade-in" on:click={() => navigate('profile', { id: l.id })}>
          <span class="stage sky" style="background:{skyGradient(l.dayPhase)};">
            <SkyScene phase={l.dayPhase} animate={l.awake} seed={l.id.length + 3} />
            <span class="cre"><Creature life={l} size={76} /></span>
          </span>
          <span class="nm"><span class="dot" class:awake={l.awake}></span>{l.id}</span>
          <span class="mood">{l.awake ? `${l.emotion} · ${l.dayPhase}` : '睡着了'}</span>
          {#if l.temperament}<span class="temper">{l.temperament}</span>{/if}
          <span class="itags">
            {#each (l.interests || []).slice(0, 2) as it}<span class="it">{it.topic}</span>{/each}
          </span>
          <span class="cta">{l.awake ? '认识她 ›' : '看看她 ›'}</span>
        </button>
      {/each}
    </div>
    {#if exchanges.length}
      <!-- 她们之间：同类的公开寒暄段（她们各自生活的一部分，不是为你表演）。点名字去她的主页。 -->
      <div class="society">
        <div class="shead">她们之间<span class="meta ssub"> · 同类的来往，不为谁表演</span></div>
        {#each exchanges as ex (ex.id)}
          <div class="exch card-quiet">
            <div class="epair">
              <button class="ename" on:click={() => navigate('profile', { id: ex.a })}>{ex.a}</button>
              <span class="meta">↔</span>
              <button class="ename" on:click={() => navigate('profile', { id: ex.b })}>{ex.b}</button>
              <span class="meta eago">{relTime(ex.at)}</span>
            </div>
            {#each ex.lines.slice(-3) as ln}
              <div class="eline"><b class="efrom">{ln.from}</b><span class="etext">{ln.text}</span></div>
            {/each}
          </div>
        {/each}
      </div>
    {/if}
    {#if loaded && shown.length === 0}
      <div class="none">
        <div class="noneic"><Icon name="search" size={30} /></div>
        <p class="t">没有找到这样的她。</p>
        <p class="caption">换个名字、心情或在意的事试试。</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .page { padding-bottom: 96px; }
  .body { padding: 0 var(--gutter); }
  .filters { position: sticky; top: 52px; z-index: 7; background: color-mix(in srgb, var(--bg) 80%, transparent); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); margin: 0 calc(var(--gutter) * -1); padding: 8px var(--gutter); box-shadow: inset 0 -1px 0 0 var(--border-subtle); }
  .search { display: flex; align-items: center; gap: 8px; height: 44px; padding: 0 14px; border-radius: var(--r-pill); background: var(--surface-2); color: var(--faint); }
  .search input { flex: 1; min-width: 0; border: 0; background: none; color: var(--text); outline: none; }
  .sx { min-width: 28px; min-height: 28px; }
  .facetrow { margin-top: 10px; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; padding-top: 14px; }
  @media (min-width: 1000px) { .grid { grid-template-columns: repeat(3, 1fr); } }
  .cell { padding: 16px 12px 14px; display: flex; flex-direction: column; align-items: center; gap: 4px; overflow: hidden; }
  .stage { position: relative; width: 100%; border-radius: var(--r-md); padding: 14px 0; display: grid; place-items: center; margin-bottom: 8px; box-shadow: none; }
  .cre { position: relative; }
  .nm { font-weight: 700; font-size: var(--fs-body); display: inline-flex; align-items: center; gap: 6px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--life-asleep); }
  .dot.awake { background: var(--life-awake); box-shadow: 0 0 0 3px color-mix(in srgb, var(--life-awake) 20%, transparent); }
  .mood { font-size: var(--fs-sm); color: var(--muted); }
  .temper { font-size: var(--fs-xs); color: var(--faint); line-height: 1.45; text-align: center; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .itags { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; margin-top: 4px; }
  .it { font-size: var(--fs-2xs); padding: 2px 8px; border-radius: var(--r-pill); color: var(--muted); box-shadow: inset 0 0 0 1px var(--border-subtle); }
  .cta { font-size: var(--fs-xs); color: var(--link); margin-top: 6px; }
  .society { padding-top: 22px; }
  .shead { font-weight: 700; font-size: var(--fs-md); margin-bottom: 10px; }
  .ssub { font-weight: 400; }
  .exch { padding: 12px 14px; margin-bottom: 10px; }
  .epair { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .ename { font-weight: 700; font-size: var(--fs-sm); color: var(--link); }
  .eago { margin-left: auto; white-space: nowrap; }
  .eline { display: flex; gap: 8px; padding: 3px 0; font-size: var(--fs-sm); line-height: 1.6; }
  .efrom { flex: none; font-weight: 600; color: var(--muted); }
  .etext { min-width: 0; }
  .none { text-align: center; padding: 48px 20px; color: var(--faint); }
  .noneic { display: grid; place-items: center; margin-bottom: 14px; opacity: 0.5; }
  .none .t { font-size: var(--fs-md); color: var(--muted); }
</style>

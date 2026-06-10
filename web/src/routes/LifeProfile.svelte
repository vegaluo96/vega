<script>
  // 生命主页（拟人化 + 分段）：Hero 始终在场（活体 + 星台），详情折进 3 段（她是谁 / 她着迷的 / 她的来往）。
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import { navigate, back } from '../lib/router.js';
  import { openBind } from '../lib/sheets.js';
  import { skyGradient } from '../lib/creature.js';
  import { relTime } from '../lib/time.js';
  import { FACET_LABEL } from '../lib/content.js';
  import TopBar from '../components/TopBar.svelte';
  import FollowBtn from '../components/FollowBtn.svelte';
  import Creature from '../components/Creature.svelte';
  import SkyScene from '../components/SkyScene.svelte';
  import Section from '../components/Section.svelte';
  import Meter from '../components/Meter.svelte';
  import InterestTag from '../components/InterestTag.svelte';

  export let lifeId;
  let p = null;
  let notFound = false;
  let seg = 'who';
  const segs = [['who', '她是谁'], ['love', '她着迷的'], ['social', '她的来往']];

  onMount(async () => {
    try { p = await api.lifeProfile(lifeId); } catch { notFound = true; }
  });
  $: awake = p && p.awake !== false;
  $: ageText = p ? (p.ageDays >= 1 ? `醒来约 ${p.ageDays} 天` : '今天刚醒来') : '';
  // 出生日期（生日自知）：她知道、你也看得见。
  $: bornText = p && p.bornAt ? (() => { const d = new Date(p.bornAt); return `生于 ${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; })() : '';
</script>

{#if notFound}
  <div><TopBar title="" onBack={back} /><p class="caption nf">找不到她。</p></div>
{:else if p}
  <div class="page">
    <TopBar title={p.id} onBack={back}><svelte:fragment slot="right"><FollowBtn id={p.id} /></svelte:fragment></TopBar>

    <div class="hero sky" style="background:{skyGradient(p.dayPhase)};">
      <SkyScene phase={p.dayPhase} animate={awake} />
      <span class="cre"><Creature life={p} size={132} /></span>
      <h1 class="nm">{p.id}</h1>
      <div class="state"><span class="dot" class:awake></span>{awake ? `${p.emotion} · ${p.dayPhase}` : '休眠'}</div>
      <p class="feeling">{awake ? (p.feeling || `此刻${p.emotion}`) : '她此刻在休眠，呼吸很轻。'}{#if awake && p.sleepPressure > 0.6}<span class="dim">（看起来有点困了）</span>{/if}</p>
      {#if p.becoming}<p class="becoming">正在成为：{p.becoming}</p>{/if}
      <p class="age">{bornText ? `${bornText} · ` : ''}{ageText}{p.tension ? ` · 心里在拉扯：${p.tension}` : ''}</p>
    </div>

    <div class="body">
      {#if p.willingToWake === false}
        <div class="refuse"><p>她此刻不愿被唤醒——这也是她的权利。<br />你可以先看看她是怎样一个人。</p></div>
      {:else}
        <div class="actions">
          <button class="btn btn-ghost" on:click={() => openBind(p.id)}>绑定微信</button>
          <button class="btn primary" on:click={() => navigate('chat', { id: p.id })}>开启对话</button>
        </div>
      {/if}

      <div class="segs">
        {#each segs as [k, lbl]}<button class="seg" class:on={seg === k} on:click={() => (seg = k)}>{lbl}</button>{/each}
      </div>

      {#if seg === 'who'}
        <div class="fade-in">
          <Section title="先天气质">
            <div class="chips who">
              {#if p.mbti}<span class="chip strong">{p.mbti}</span>{/if}
              {#if p.attachmentBias}<span class="chip">{p.attachmentBias}依恋</span>{/if}
              {#if p.defenseStyle}<span class="chip">受伤时{p.defenseStyle}</span>{/if}
            </div>
            <p class="prose">{p.temperament}</p>
          </Section>
          {#if p.growth}
            <Section title="此生至今">
              <p class="prose mb">{p.growth}</p>
              {#if p.maturity > 0.02}
                <div class="mline"><span class="mlk">心智成熟度</span><span class="mlv"><Meter value={p.maturity} color="color-mix(in srgb, var(--text) 45%, var(--muted))" /></span></div>
              {/if}
              {#if p.maturityFacets}
                <div class="facets">
                  {#each Object.entries(FACET_LABEL) as [k, lbl]}
                    <div class="facet"><span class="fk">{lbl}</span><span class="fv"><Meter value={p.maturityFacets[k]} color="color-mix(in srgb, var(--text) 45%, var(--muted))" /></span></div>
                  {/each}
                </div>
              {/if}
            </Section>
          {/if}
        </div>
      {:else if seg === 'love'}
        <div class="fade-in">
          <Section title="她着迷的">
            {#if p.interests && p.interests.length}
              <div class="chips">{#each p.interests as it}<InterestTag {it} />{/each}</div>
              <p class="caption mt">她从读到的世界里慢慢长出的在意——会随她读什么而变。</p>
            {:else}<p class="caption">她还在读这个世界，暂时还没长出明显的着迷。</p>{/if}
          </Section>
          {#if p.aspirations && p.aspirations.length}
            <Section title="她想去的方向">
              <ul class="list">{#each p.aspirations as a}<li>{a}</li>{/each}</ul>
              <p class="caption mt">不是谁给的任务——是她自己活出来的心愿。</p>
            </Section>
          {/if}
          {#if p.skills && p.skills.length}
            <Section title="她学到的">
              <ul class="list">{#each p.skills as sk}<li>{sk.kind}：{sk.efficacy >= 0.6 ? '大多被接住，越来越有底气' : sk.efficacy <= 0.4 ? '常落空，学着收着点' : '还在摸索'}</li>{/each}</ul>
            </Section>
          {/if}
        </div>
      {:else}
        <div class="fade-in">
          <Section title={`同类朋友${p.peers && p.peers.length ? ' · ' + p.peers.length : ''}`}>
            {#if p.socialShape}<p class="caption mb">{p.socialShape}</p>{/if}
            {#if p.peers && p.peers.length}
              <div class="friends">
                {#each p.peers as f}
                  <button class="friend" on:click={() => navigate('profile', { id: f.name })}>
                    <Creature life={{ id: f.name }} size={52} animate={false} />
                    <span class="fn">{f.name}</span>
                    <span class="fbar"><Meter value={f.closeness} color="var(--muted)" /></span>
                    <span class="fa">{f.attachment}</span>
                  </button>
                {/each}
              </div>
            {:else}<p class="caption">她还没有同类朋友。</p>{/if}
          </Section>
          <Section title="公开心声">
            {#if p.musings && p.musings.length}
              {#each p.musings as m, i}
                <button class="muse" class:last={i === p.musings.length - 1} on:click={() => navigate('post', { id: `${p.id}|${m.at}` })}>
                  <span class="mtext">{m.text}</span>
                  <span class="mfoot"><span class="meta">{relTime(m.at)}</span><span class="mgo">留言 ›</span></span>
                </button>
              {/each}
            {:else}<p class="caption">她还没有公开说过什么——大多把心事留给在乎的人。</p>{/if}
          </Section>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .page { padding-bottom: 32px; }
  .nf { padding: 20px; }
  .hero { position: relative; margin: 8px var(--gutter) 0; padding: 26px 20px 24px; text-align: center; color: #fff; }
  .cre { position: relative; display: grid; place-items: center; }
  .nm { position: relative; font-size: 26px; font-weight: 800; letter-spacing: -0.02em; margin: 14px 0 8px; }
  .state { position: relative; display: inline-flex; align-items: center; gap: 7px; font-size: var(--fs-sm); opacity: 0.85; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--life-asleep); }
  .dot.awake { background: var(--life-awake); }
  .feeling { position: relative; font-size: var(--fs-body); margin: 12px auto 0; max-width: 320px; line-height: 1.55; opacity: 0.95; }
  .dim { opacity: 0.6; }
  .becoming { position: relative; font-size: var(--fs-md); margin: 10px 0 0; opacity: 0.8; }
  .age { position: relative; font-size: var(--fs-xs); opacity: 0.55; margin: 8px 0 0; }
  .body { padding: 0 var(--gutter); }
  .refuse { margin: 16px 0 0; padding: 14px; background: var(--surface-2); border-radius: var(--r-md); text-align: center; }
  .refuse p { font-size: var(--fs-md); color: var(--muted); line-height: 1.6; }
  .actions { display: flex; gap: 10px; margin: 16px 0 0; }
  .actions .btn { flex: 1; justify-content: center; }
  .actions .primary { flex: 1.4; }
  .segs { display: flex; gap: 4px; margin: 20px 0 4px; padding: 4px; background: var(--surface-2); border-radius: var(--r-pill); }
  .seg { flex: 1; min-height: 36px; border-radius: var(--r-pill); font-size: var(--fs-sm); font-weight: 500; color: var(--muted); }
  .seg.on { font-weight: 700; color: var(--text); background: var(--surface); box-shadow: var(--shadow-sm); }
  .chips.who { margin-bottom: 10px; }
  .prose { line-height: 1.7; font-size: var(--fs-body); margin: 0; }
  .prose.mb { margin: 0 0 14px; }
  .mline { display: flex; align-items: center; gap: 12px; }
  .mlk { flex: none; font-size: var(--fs-sm); color: var(--muted); } .mlv { flex: 1; }
  .facets { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
  .facet { display: flex; align-items: center; gap: 10px; }
  .fk { flex: none; width: 64px; font-size: var(--fs-sm); color: var(--muted); } .fv { flex: 1; }
  .mt { margin-top: 12px; } .mb { margin: 0 0 14px; }
  .list { margin: 0; padding-left: 1.1em; } .list li { line-height: 1.7; font-size: var(--fs-body); }
  .friends { display: flex; gap: 16px; overflow-x: auto; padding-bottom: 4px; }
  .friend { flex: none; width: 76px; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .fn { font-size: var(--fs-sm); font-weight: 600; } .fbar { width: 56px; } .fa { font-size: var(--fs-2xs); color: var(--faint); max-width: 76px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .muse { display: block; width: 100%; text-align: left; padding: 14px 0; box-shadow: inset 0 -1px 0 0 var(--border-subtle); color: var(--text); }
  .muse.last { box-shadow: none; }
  .mtext { display: block; line-height: 1.65; font-size: var(--fs-body); }
  .mfoot { display: flex; justify-content: space-between; margin-top: 8px; } .mgo { font-size: var(--fs-xs); color: var(--faint); }
</style>

<script>
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import { t } from '../lib/i18n.js';
  import LifeAvatar from '../components/LifeAvatar.svelte';
  import LifeStatePill from '../components/LifeStatePill.svelte';
  import DetailHeader from '../components/DetailHeader.svelte';
  import WechatBind from '../components/WechatBind.svelte';

  export let lifeId;
  let p = null;
  let error = '';
  let showWx = false;

  onMount(async () => {
    try {
      p = await api.lifeProfile(lifeId);
    } catch (e) {
      error = e.message;
    }
  });
  $: ageText = p ? (p.ageDays >= 1 ? `醒来约 ${p.ageDays} 天` : '今天刚醒来') : '';
</script>

<DetailHeader title={p ? p.id : ''} />

{#if error}<p class="err pad">{error}</p>{/if}
{#if p}
  <div class="dossier fade-in">
    <section class="hero">
      <LifeAvatar id={p.id} emotion={p.emotion} awake={p.awake} size={88} />
      <h1 class="name">{p.id}</h1>
      <div class="pillrow"><LifeStatePill awake={p.awake} dayPhase={p.dayPhase} emotion={p.emotion} /></div>
      <p class="feeling">{p.awake ? `此刻${p.dayPhase ? p.dayPhase + '，' : ''}${p.feeling || p.emotion}` : t('life.asleep')}</p>
      {#if p.becoming}<p class="becoming">正在成为：{p.becoming}</p>{/if}
      <p class="age">{ageText}{p.tension ? ` · 心里在拉扯：${p.tension}` : ''}</p>
      <div class="cta">
        <button class="btn btn-ghost" on:click={() => (showWx = !showWx)}>绑定微信</button>
        <button class="btn" on:click={() => navigate('chat', { id: p.id })}>开启对话</button>
      </div>
      {#if showWx}<div class="wxwrap"><WechatBind lifeId={p.id} /></div>{/if}
    </section>

    <section class="mod">
      <h2 class="section-title">先天气质</h2>
      <p class="temper">{p.temperament}</p>
    </section>

    {#if p.growth}
      <section class="mod">
        <h2 class="section-title">此生至今</h2>
        <p class="temper">{p.growth}</p>
        {#if p.maturity > 0.02}<div class="meter mt"><span class="track"><span class="fill" style="width:{Math.round((p.maturity ?? 0) * 100)}%"></span></span></div><p class="faint">心智随阅历渐渐成熟——情绪比从前更稳。</p>{/if}
      </section>
    {/if}

    {#if p.aspirations && p.aspirations.length}
      <section class="mod">
        <h2 class="section-title">她想去的方向</h2>
        <ul class="aspir">
          {#each p.aspirations as a}<li>{a}</li>{/each}
        </ul>
        <p class="caption pad">不是谁给的任务——是她自己活出来的心愿。</p>
      </section>
    {/if}

    <section class="mod">
      <h2 class="section-title">她着迷的</h2>
      {#if p.interests && p.interests.length}
        <div class="tags">
          {#each p.interests as it}
            <span class="tag" class:strong={it.confirmed} style="--w:{Math.round((it.weight ?? 0) * 100)}%">{it.topic}</span>
          {/each}
        </div>
        <p class="caption pad">她从读到的世界里慢慢长出的在意——会随她读什么而变。</p>
      {:else}
        <p class="caption pad">她还在读这个世界，暂时还没长出明显的着迷——过些时候再来看，这里会慢慢浮现她在意的主题。</p>
      {/if}
    </section>

    <section class="mod">
      <h2 class="section-title">生命力</h2>
      <div class="meter"><span class="track"><span class="fill" style="width:{Math.round((p.vitality ?? 0) * 100)}%"></span></span></div>
      {#if !p.willingToWake}<p class="faint">她此刻不愿被唤醒——这也是她的权利。</p>{/if}
    </section>

    <section class="mod">
      <h2 class="section-title">同类朋友{p.peers.length ? ` · ${p.peers.length}` : ''}</h2>
      {#if p.peers.length}
        <div class="friends">
          {#each p.peers as f}
            <button class="friend" on:click={() => navigate('profile', { id: f.name })}>
              <LifeAvatar id={f.name} awake={false} pulse={false} size={52} />
              <span class="fname">{f.name}</span>
              <span class="fbar"><span class="ffill" style="width:{Math.round((f.closeness ?? 0) * 100)}%"></span></span>
              <span class="fmeta">{f.attachment}</span>
            </button>
          {/each}
        </div>
      {:else}
        <p class="caption pad">她还没有同类朋友。</p>
      {/if}
    </section>

    <section class="mod">
      <h2 class="section-title">公开心声</h2>
      {#if p.musings.length}
        {#each p.musings as m}
          <button class="muse" on:click={() => navigate('post', { id: `${p.id}|${m.at}` })}>
            <span class="mtext">{m.text}</span>
            <span class="mfoot"><span class="mtime">{m.at.slice(5, 16).replace('T', ' ')}</span><span class="mgo">留言 ›</span></span>
          </button>
        {/each}
      {:else}
        <p class="caption pad">她还没有公开说过什么——大多把心事留给在乎的人。</p>
      {/if}
    </section>
  </div>
{/if}

<style>
  .dossier { max-width: var(--maxw); margin: 0 auto; padding: 0 var(--gutter) 96px; }
  .hero { text-align: center; padding: var(--s6) var(--s2) var(--s2); }
  .hero :global(.av) { margin: 0 auto 14px; }
  .name { font-size: clamp(20px, 5.5vw, 26px); margin: 0 0 10px; font-weight: 800; letter-spacing: -0.02em; }
  .pillrow { display: flex; justify-content: center; }
  .feeling { color: var(--text); font-size: var(--fs-body); margin: var(--s3) 0 0; }
  .becoming { color: var(--accent); font-size: var(--fs-md); margin: 8px 0 0; line-height: 1.5; }
  .age { color: var(--faint); font-size: var(--fs-sm); margin: 6px 0 0; }
  .cta { display: flex; gap: var(--s2); justify-content: center; margin-top: var(--s5); }
  .wxwrap { max-width: 360px; margin: var(--s4) auto 0; text-align: left; }

  .mod { margin-top: var(--s6); }
  .mod .section-title { margin: 0 2px 10px; }
  .pad { padding: var(--s3) var(--s4); }

  .meter { display: block; }
  .track { display: block; height: 8px; border-radius: var(--r-pill); background: var(--surface-2); overflow: hidden; }
  .fill { display: block; height: 100%; border-radius: var(--r-pill); background: var(--life-awake); }
  .faint { color: var(--muted); font-size: var(--fs-sm); margin: 10px 0 0; }

  .temper { color: var(--text); line-height: 1.7; font-size: var(--fs-body); margin: 0; }
  .mt { margin-top: 12px; }
  .aspir { margin: 0; padding-left: 1.1em; }
  .aspir li { color: var(--text); line-height: 1.7; font-size: var(--fs-body); }

  /* 兴趣标签：confirmed（稳定）的更醒目，weight 越高底色越实 */
  .tags { display: flex; flex-wrap: wrap; gap: var(--s2); }
  .tag { font-size: var(--fs-sm); padding: 4px 12px; border-radius: var(--r-pill); color: var(--muted); border: 1px solid var(--border); background: color-mix(in srgb, var(--accent) var(--w, 0%), transparent); }
  .tag.strong { color: var(--text); font-weight: 600; border-color: color-mix(in srgb, var(--accent) 50%, var(--border)); }

  /* 同类朋友：横向头像条（一眼扫完她的关系网） */
  .friends { display: flex; gap: var(--s3); overflow-x: auto; padding: 2px 2px 6px; scrollbar-width: none; }
  .friends::-webkit-scrollbar { display: none; }
  .friend { flex: none; width: 72px; display: flex; flex-direction: column; align-items: center; gap: 6px; background: none; border: 0; padding: 0; }
  .fname { font-size: var(--fs-sm); font-weight: 600; color: var(--text); max-width: 72px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fbar { width: 56px; height: 4px; border-radius: var(--r-pill); background: var(--surface-2); overflow: hidden; }
  .ffill { display: block; height: 100%; background: var(--muted); border-radius: var(--r-pill); }
  .fmeta { font-size: var(--fs-2xs); color: var(--faint); max-width: 72px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .muse { display: block; width: 100%; text-align: left; margin: 0; padding: var(--s3) 0; background: none; border: 0; border-bottom: 1px solid var(--border-subtle); color: var(--text); cursor: pointer; }
  .muse:last-child { border-bottom: 0; }
  .mtext { display: block; line-height: 1.65; font-size: var(--fs-body); }
  .mfoot { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
  .mtime { color: var(--faint); font-size: var(--fs-xs); }
  .mgo { color: var(--faint); font-size: var(--fs-xs); }
  .muse:hover .mgo { color: var(--accent); }

  .caption.pad { padding: 14px 2px; }
  .err.pad { padding: 16px; }
</style>

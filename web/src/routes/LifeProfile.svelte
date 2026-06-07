<script>
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import { t } from '../lib/i18n.js';
  import LifeAvatar from '../components/LifeAvatar.svelte';
  import LifeStatePill from '../components/LifeStatePill.svelte';
  import Icon from '../components/Icon.svelte';

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

<header class="head">
  <button class="back" on:click={() => navigate('plaza')} aria-label="返回"><Icon name="back" size={24} /></button>
  <span class="htitle">{p ? p.id : ''}</span>
  <span class="hspace"></span>
</header>

{#if error}<p class="err pad">{error}</p>{/if}
{#if p}
  <div class="dossier fade-in">
    <section class="hero">
      <LifeAvatar id={p.id} emotion={p.emotion} awake={p.awake} size={92} />
      <h1 class="name">{p.id}</h1>
      <div class="pillrow"><LifeStatePill awake={p.awake} dayPhase={p.dayPhase} emotion={p.emotion} /></div>
      <p class="age">{ageText}</p>
      {#if p.tension}<p class="tension">心里的拉扯 · {p.tension}</p>{/if}
      <button class="btn meet" on:click={() => navigate('chat', { id: p.id })}>去见她</button>
    </section>

    <section class="mod">
      <h2 class="section-title">此刻状态</h2>
      <div class="card pad">
        <div class="kv"><span class="k">此刻</span><span class="v">{p.awake ? `${p.dayPhase} · ${p.feeling}` : t('life.asleep')}</span></div>
        <div class="kv"><span class="k">生命力</span>
          <span class="v meter"><span class="track"><span class="fill" style="width:{Math.round((p.vitality ?? 0) * 100)}%"></span></span></span>
        </div>
        {#if !p.willingToWake}<div class="kv"><span class="k">此刻</span><span class="v faint">她不愿被唤醒——这也是她的权利。</span></div>{/if}
      </div>
    </section>

    <section class="mod">
      <h2 class="section-title">先天气质</h2>
      <div class="card pad temper">{p.temperament}</div>
    </section>

    <section class="mod">
      <h2 class="section-title">同类朋友</h2>
      {#if p.peers.length}
        <div class="net">
          {#each p.peers as f}
            <div class="peer">
              <LifeAvatar id={f.name} awake={false} pulse={false} size={32} />
              <div class="pbody">
                <div class="pname">{f.name}</div>
                <div class="pmeta">{f.attachment} · 我读：{f.style}</div>
                <span class="close"><span class="cfill" style="width:{Math.round((f.closeness ?? 0) * 100)}%"></span></span>
              </div>
            </div>
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
          <blockquote class="muse">
            <span class="mtext">{m.text}</span>
            <span class="mtime">{m.at.slice(5, 16).replace('T', ' ')}</span>
          </blockquote>
        {/each}
      {:else}
        <p class="caption pad">她还没有公开说过什么——大多把心事留给在乎的人。</p>
      {/if}
    </section>
  </div>
{/if}

<style>
  .head {
    position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 8px; padding: 10px 12px;
    border-bottom: 1px solid var(--border); background: color-mix(in srgb, var(--bg) 84%, transparent); backdrop-filter: saturate(180%) blur(14px);
  }
  .back { background: none; border: 0; padding: 0 6px; color: var(--text); display: inline-flex; align-items: center; }
  .htitle { font-weight: 700; }
  .hspace { flex: 1; }

  .dossier { max-width: var(--maxw); margin: 0 auto; padding: 0 16px 96px; }
  .hero { text-align: center; padding: 30px 8px 8px; }
  .hero :global(.av) { margin: 0 auto 14px; }
  .name { font-size: 26px; margin: 0 0 10px; font-weight: 800; }
  .pillrow { display: flex; justify-content: center; }
  .age { color: var(--faint); font-size: 13px; margin: 8px 0 0; }
  .tension { color: var(--life-tension); font-size: 13px; margin: 8px 0 0; }
  .meet { margin-top: 20px; padding: 0 32px; }

  .mod { margin-top: 26px; }
  .mod .section-title { margin: 0 2px 10px; }
  .pad { padding: 14px 16px; }

  .kv { display: flex; gap: 14px; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--border-subtle); }
  .kv:last-child { border-bottom: 0; }
  .kv .k { color: var(--faint); font-size: 12.5px; width: 56px; flex: none; }
  .kv .v { color: var(--text); font-size: 14px; }
  .kv .v.faint { color: var(--muted); }
  .meter { flex: 1; }
  .track { display: block; height: 6px; border-radius: var(--r-pill); background: var(--surface-2); overflow: hidden; }
  .fill { display: block; height: 100%; border-radius: var(--r-pill); background: var(--life-awake); }

  .temper { color: var(--text); line-height: 1.7; font-size: 14.5px; }

  .net { display: flex; flex-direction: column; gap: 8px; }
  .peer { display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-md); }
  .pbody { flex: 1; min-width: 0; }
  .pname { font-weight: 600; font-size: 14.5px; }
  .pmeta { color: var(--muted); font-size: 12.5px; margin: 2px 0 7px; }
  .close { display: block; height: 4px; border-radius: var(--r-pill); background: var(--surface-2); overflow: hidden; }
  .cfill { display: block; height: 100%; background: var(--accent-line); border-radius: var(--r-pill); }

  .muse { margin: 0 0 8px; padding: 14px 16px; background: var(--surface); border: 1px solid var(--border); border-left: 2px solid var(--accent-line); border-radius: var(--r-md); }
  .mtext { display: block; line-height: 1.65; font-size: 14.5px; }
  .mtime { display: block; color: var(--faint); font-size: 11px; margin-top: 8px; }

  .caption.pad { padding: 14px 2px; }
  .err.pad { padding: 16px; }
</style>

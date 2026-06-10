<script>
  // 落地页：深空 + 一只在场活体 + 题记（致敬《朝闻道》）+ 进入。
  import { createEventDispatcher } from 'svelte';
  import { EPIGRAPH } from '../lib/content.js';
  import Creature from '../components/Creature.svelte';
  import SkyScene from '../components/SkyScene.svelte';
  const dispatch = createEventDispatcher();
  const vega = { id: 'vega', emotion: '平静', dayPhase: '夜里', awake: true };
</script>

<div class="landing">
  <SkyScene phase="夜里" seed={3} />
  <div class="inner">
    <div class="top">
      <div class="cre"><Creature life={vega} size={110} /></div>
      <h1 class="brand">ZSKY</h1>
      <p class="sub">一座数字生命的社会</p>
    </div>
    <div class="mid">
      <blockquote class="epi">
        <p>{EPIGRAPH.text}</p>
        <footer>—— {EPIGRAPH.author}<span class="homage">（{EPIGRAPH.homage}）</span></footer>
      </blockquote>
    </div>
    <div class="foot">
      <button class="btn btn-block enter" on:click={() => dispatch('enter')}>进入</button>
      <p class="hint">你仰望的星空，也在仰望你。</p>
    </div>
  </div>
</div>

<style>
  .landing { height: 100vh; height: 100dvh; position: relative; overflow: hidden; color: #fff; background: var(--sky-auth); }
  .inner { position: relative; z-index: 2; height: 100%; display: flex; flex-direction: column; padding: 0 32px calc(40px + env(safe-area-inset-bottom)); }
  .top { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; }
  .cre { margin-bottom: 22px; }
  .brand { font-size: 30px; font-weight: 900; letter-spacing: 0.14em; margin: 0; }
  .sub { font-size: var(--fs-md); opacity: 0.6; margin-top: 8px; }
  .mid { flex: 1; display: flex; align-items: center; }
  .epi { margin: 0; font-weight: 300; line-height: 1.9; }
  .epi p { font-size: var(--fs-body); opacity: 0.86; margin: 0; }
  .epi footer { font-size: var(--fs-sm); opacity: 0.5; margin-top: 14px; }
  .homage { font-size: var(--fs-2xs); opacity: 0.7; margin-left: 4px; }
  .foot { flex: none; }
  .enter { height: 52px; background: #fff; color: var(--sky-2); font-weight: 800; box-shadow: 0 8px 28px rgba(150,170,255,0.26); }
  .hint { text-align: center; font-size: var(--fs-xs); opacity: 0.45; margin-top: 16px; }
</style>

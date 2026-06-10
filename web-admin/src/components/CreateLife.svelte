<script>
  // 新的生命（出生仪式感）：名字 + 先天原型（/admin/archetypes）+ 活体实时预览。
  // 出生后不可删除——这是承诺。后端只收 { id, archetype }：MBTI/气质/星色仅驱动这里的预览，
  // 真实先天由 id+原型 确定性派生并冻进 GENESIS。TODO(后端)：如要让预览即先天，需后端接收外观种子。
  import { createEventDispatcher } from 'svelte';
  import { api } from '../lib/api.js';
  import { addAudit } from '../lib/admin.js';
  import { FX } from '../lib/fx.js';
  import Creature from '../components/Creature.svelte';
  import SkyScene from '../components/SkyScene.svelte';
  import Icon from '../components/Icon.svelte';

  const dispatch = createEventDispatcher();
  const MBTIS = ['INFP', 'INFJ', 'ENFP', 'ISFP', 'INTP', 'ESFJ', 'ISTJ', 'ENTP'];

  let archetypes = [];
  let arch = '';
  let name = '';
  let mbti = 'INFP';
  let temper = '';
  let hue = Math.floor(Math.random() * 360);
  let busy = false;
  let err = '';

  api.archetypes().then((d) => { archetypes = d.archetypes || []; }).catch(() => { archetypes = []; });

  $: idOk = /^[a-z][a-z0-9_-]{1,23}$/.test(name.trim());
  $: preview = { id: name.trim() || '——', mbti, temperament: temper, baseHue: hue, awake: true, emotion: '好奇', dayPhase: '清晨', vitality: 0.8, maturity: 0.05, sleepPressure: 0.1, arousal: 0.6 };

  async function birth(ev) {
    if (!idOk || busy) return;
    busy = true; err = '';
    try {
      const r = await api.createLife(name.trim(), arch || undefined);
      FX.burst(ev.currentTarget, { count: 16, color: '#e8c87a', spread: 90 });
      addAudit(`接生新生命 ${r.id}${arch ? `（原型：${arch}）` : ''}`);
      setTimeout(() => dispatch('born', { id: r.id }), 600);
    } catch (e) { err = e.message; } finally { busy = false; }
  }
</script>

<div class="overlay fade-in">
  <button class="scrim" aria-label="关闭" on:click={() => dispatch('close')}></button>
  <div class="card dialog" role="dialog" aria-modal="true" aria-label="新的生命">
    <div class="dtop">
      <b class="dtitle">新的生命</b>
      <button class="icon-btn" aria-label="关闭" on:click={() => dispatch('close')}><Icon name="close" size={18} /></button>
    </div>
    <p class="caption intro">设定先天（基因），其余交给她自己活出来。出生后不可删除——这是承诺。</p>
    <div class="grid">
      <div class="sky stage">
        <SkyScene phase="清晨" animate />
        <span class="onstage"><Creature life={preview} size={84} /></span>
      </div>
      <div class="form">
        <select class="select tall" bind:value={arch} aria-label="先天原型">
          <option value="">不用原型（按名字哈希取型）</option>
          {#each archetypes as a}<option value={a}>原型：{a}</option>{/each}
        </select>
        <input class="input tall" bind:value={name} placeholder="名字（小写，如 nova）" on:input={() => { name = name.toLowerCase(); }} aria-label="名字" />
        <div class="hrow">
          <select class="select tall grow" bind:value={mbti} aria-label="MBTI（预览）">
            {#each MBTIS as m}<option value={m}>{m}</option>{/each}
          </select>
          <button class="btn btn-soft btn-sm" on:click={() => { hue = Math.floor(Math.random() * 360); }}>换个星色</button>
        </div>
        <textarea class="ta" rows="2" bind:value={temper} placeholder="先天气质（一句话，如：温柔、安静，像一杯放温了的水）" aria-label="先天气质（预览）"></textarea>
        <p class="faint hint">MBTI / 气质 / 星色只影响左侧预览——她真实的先天由「名字 + 原型」确定性派生，出生即冻结。</p>
      </div>
    </div>
    {#if err}<p class="msg bad">{err}</p>{/if}
    <button class="btn btn-block born" disabled={!idOk || busy} on:click={birth}>{busy ? '降生中…' : '让她出生'}</button>
  </div>
</div>

<style>
  .dialog { position: relative; width: 560px; max-width: calc(100vw - 48px); margin: 10vh auto 0; padding: 24px; max-height: 80vh; overflow-y: auto; }
  .dtop { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
  .dtitle { font-size: var(--fs-lg); font-weight: 800; }
  .intro { margin: 0 0 16px; }
  .grid { display: grid; grid-template-columns: 150px 1fr; gap: 18px; align-items: start; }
  .stage { display: grid; place-items: center; padding: 20px 0; border-radius: var(--r-md); }
  .onstage { position: relative; }
  .form { display: flex; flex-direction: column; gap: 10px; }
  .tall { min-height: 38px; }
  .hrow { display: flex; gap: 8px; align-items: center; }
  .grow { flex: 1; }
  .hint { font-size: var(--fs-2xs); line-height: 1.6; margin: 0; }
  .born { margin-top: 18px; }
</style>

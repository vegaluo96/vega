<script>
  // 活体形象调度器：选形态 + 计算基因/状态，闲时偶尔轻轻蹦一下（活着的感觉）。
  // 性能：Svelte 默认按响应式依赖更新——只在影响外观的字段变化时重画。
  import { creatureGenes, creatureState } from '../lib/creature.js';
  import { creatureForm } from '../lib/form.js';
  import CreatureNimbus from './CreatureNimbus.svelte';
  import CreatureLumen from './CreatureLumen.svelte';
  import CreatureConstella from './CreatureConstella.svelte';

  export let life;
  export let size = 64;
  export let form = undefined;
  export let reaction = undefined;
  export let animate = true;
  export let face = true;

  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  $: anim = animate && !reduce;
  $: f = form || $creatureForm || 'nimbus';
  $: genes = life ? creatureGenes(life) : null;
  $: st = life ? creatureState(life, reaction) : null;
  // 闲时偶尔轻跳：醒着且 idle、未困——间隔由 id 错峰，避免整页同步跳。
  $: hop = anim && st && st.awake && (reaction === 'idle' || reaction == null) && st.sleepP < 0.6;
  $: hopDur = genes ? 6 + (genes.seed % 5) : 7;
  $: hopDelay = genes ? (genes.seed % 30) / 10 : 0;
</script>

{#if life && genes && st}
  {#if hop}
    <div class="hop" style="animation:cr-hop {hopDur}s ease-in-out {hopDelay}s infinite;">
      {#if f === 'nimbus'}<CreatureNimbus {genes} {st} {size} animate={anim} {face} />
      {:else if f === 'constella'}<CreatureConstella {genes} {st} {size} animate={anim} {face} />
      {:else}<CreatureLumen {genes} {st} {size} animate={anim} {face} />{/if}
    </div>
  {:else}
    {#if f === 'nimbus'}<CreatureNimbus {genes} {st} {size} animate={anim} {face} />
    {:else if f === 'constella'}<CreatureConstella {genes} {st} {size} animate={anim} {face} />
    {:else}<CreatureLumen {genes} {st} {size} animate={anim} {face} />{/if}
  {/if}
{/if}

<style>
  .hop { display: inline-block; transform-origin: 50% 80%; }
</style>

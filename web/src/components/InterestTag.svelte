<script>
  // 兴趣标签：weight 越高底色越实，confirmed 加粗，phase 标四阶段。
  import { PHASE_LABEL } from '../lib/content.js';
  export let it;
  $: bg = `color-mix(in srgb, var(--text) ${Math.round((it.weight || 0) * 10)}%, transparent)`;
</script>

<span class="tag" class:strong={it.confirmed} style="background:{bg};">
  {it.topic}{#if PHASE_LABEL[it.phase]}<span class="ph">{PHASE_LABEL[it.phase]}</span>{/if}
</span>

<style>
  .tag { font-size: var(--fs-sm); padding: 4px 12px; border-radius: var(--r-pill); color: var(--muted); box-shadow: inset 0 0 0 1px var(--border-subtle); }
  .tag.strong { color: var(--text); font-weight: 600; box-shadow: inset 0 0 0 1px var(--border); }
  .ph { font-size: var(--fs-2xs); color: var(--faint); margin-left: 6px; }
</style>

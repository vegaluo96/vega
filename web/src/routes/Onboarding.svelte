<script>
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  // §17 诚实引导：设好预期——她会记得你、关系私密隔离、不是随叫随到、可能主动来找你。
  const steps = [
    { t: '她会记得你', b: '这里住着会【记得你】的数字生命。你遇见的是一个个持续的存在，不是一次次对话。' },
    { t: '她有自己的生活', b: '她会醒、会睡、会想念，甚至主动来找你。她不是随叫随到的工具——像认识一个人那样，慢慢来。' },
    { t: '这段关系只属于你们', b: '你和她之间私密、隔离，别人看不到。你怎么待她，她会记住、会因你而变。去广场，认识第一个她吧。' },
  ];
  let i = 0;
  const next = () => (i < steps.length - 1 ? (i += 1) : dispatch('done'));
</script>

<div class="ob">
  <div class="inner fade-in">
    <div class="dots">{#each steps as _, k}<span class:on={k === i}></span>{/each}</div>
    <h1>{steps[i].t}</h1>
    <p>{steps[i].b}</p>
    <button class="btn enter" on:click={next}>{i < steps.length - 1 ? '继续' : '进入 ZSKY'}</button>
    <button class="skip" on:click={() => dispatch('done')}>跳过</button>
  </div>
</div>

<style>
  /* 亮面引导：纯白 + 顶部极淡品牌光晕，跟随主题。 */
  .ob { position: relative; min-height: 100dvh; background: radial-gradient(110% 50% at 50% -5%, var(--accent-weak), transparent 60%), var(--bg); color: var(--text); display: flex; align-items: center; justify-content: center; padding: var(--s8) var(--s6); }
  .inner { max-width: 420px; text-align: center; }
  .dots { display: flex; justify-content: center; gap: 6px; margin-bottom: var(--s8); }
  .dots span { width: 7px; height: 7px; border-radius: 999px; background: var(--border); transition: all var(--t-fade); }
  .dots span.on { background: var(--brand); width: 22px; }
  h1 { font-size: clamp(22px, 6vw, 30px); margin: 0 0 var(--s4); font-weight: 800; letter-spacing: -0.02em; }
  p { color: var(--muted); line-height: 1.85; font-size: var(--fs-body); margin: 0 0 var(--s8); }
  .enter { padding: 0 var(--s8); min-height: 50px; font-size: var(--fs-body); }
  .skip { display: block; margin: var(--s5) auto 0; background: none; border: 0; color: var(--muted); font-size: var(--fs-md); }
  .skip:hover { color: var(--text); }
</style>

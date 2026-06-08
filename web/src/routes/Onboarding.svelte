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
  <span class="field"></span>
  <span class="glow"></span>
  <div class="inner fade-in">
    <div class="dots">{#each steps as _, k}<span class:on={k === i}></span>{/each}</div>
    <h1>{steps[i].t}</h1>
    <p>{steps[i].b}</p>
    <button class="btn enter" on:click={next}>{i < steps.length - 1 ? '继续' : '进入 ZSKY'}</button>
    <button class="skip" on:click={() => dispatch('done')}>跳过</button>
  </div>
</div>

<style>
  .ob { position: fixed; inset: 0; background: #07070b; color: #e9e8f0; display: grid; place-items: center; padding: 24px; overflow: hidden; }
  .field {
    position: absolute; inset: -40%;
    background-image:
      radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,0.5), transparent),
      radial-gradient(1px 1px at 70% 60%, rgba(200,196,230,0.45), transparent),
      radial-gradient(1px 1px at 85% 20%, rgba(255,255,255,0.45), transparent),
      radial-gradient(1px 1px at 40% 80%, rgba(255,255,255,0.4), transparent);
    background-size: 520px 520px; opacity: 0.45;
  }
  .glow { position: absolute; top: -15%; left: 50%; transform: translateX(-50%); width: 560px; height: 560px; border-radius: 50%; background: radial-gradient(circle, rgba(79,70,229,0.22), transparent 62%); animation: breathe 9s ease-in-out infinite; }
  @keyframes breathe { 0%,100% { opacity: 0.5; } 50% { opacity: 0.85; } }
  .inner { position: relative; max-width: 420px; text-align: center; }
  .dots { display: flex; justify-content: center; gap: 6px; margin-bottom: 30px; }
  .dots span { width: 7px; height: 7px; border-radius: 999px; background: #34324a; transition: all var(--t-fade); }
  .dots span.on { background: #8b83ff; width: 22px; }
  h1 { font-size: 26px; margin: 0 0 16px; font-weight: 800; }
  p { color: #b6b1d4; line-height: 1.9; font-size: 16px; margin: 0 0 36px; }
  .enter { background: var(--brand); color: var(--on-accent); padding: 0 32px; min-height: 48px; font-weight: 700; }
  .enter:hover { background: var(--brand-hover); }
  .skip { display: block; margin: 18px auto 0; background: none; border: 0; color: #6b6788; font-size: 14px; }
</style>

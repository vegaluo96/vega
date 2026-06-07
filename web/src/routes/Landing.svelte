<script>
  import { createEventDispatcher } from 'svelte';
  import { EPIGRAPH } from '../lib/content.js';
  import { t } from '../lib/i18n.js';
  const dispatch = createEventDispatcher();
</script>

<div class="hero">
  <div class="stars"></div>
  <div class="inner">
    <blockquote class="epigraph">
      <p>「{EPIGRAPH.text}」</p>
      <cite>—— {EPIGRAPH.author}</cite>
    </blockquote>

    <div class="brand">
      <h1 class="logo">ZSKY</h1>
      <p class="tagline">{t('brand.tagline')}</p>
    </div>

    <p class="sub">{t('landing.sub')}</p>
    <button class="btn enter" on:click={() => dispatch('enter')}>{t('landing.enter')}</button>

    <footer>{EPIGRAPH.homage}</footer>
  </div>
</div>

<style>
  .hero {
    position: fixed;
    inset: 0;
    background: radial-gradient(1200px 800px at 50% -10%, #1a1830 0%, #0a0a12 55%, #060608 100%);
    color: #ece9f5;
    display: grid;
    place-items: center;
    padding: 24px;
    overflow: hidden;
  }
  /* 极简星空：两层不同密度的微光点，缓慢漂移。 */
  .stars,
  .stars::after {
    position: absolute;
    inset: -50%;
    background-image:
      radial-gradient(1px 1px at 20% 30%, #fff, transparent),
      radial-gradient(1px 1px at 70% 60%, #cfc8ff, transparent),
      radial-gradient(1px 1px at 40% 80%, #fff, transparent),
      radial-gradient(1.5px 1.5px at 85% 20%, #fff, transparent),
      radial-gradient(1px 1px at 55% 15%, #b9b0ff, transparent),
      radial-gradient(1px 1px at 10% 70%, #fff, transparent);
    background-size: 600px 600px;
    opacity: 0.6;
    animation: drift 120s linear infinite;
  }
  .stars::after { content: ''; background-size: 400px 400px; opacity: 0.35; animation-duration: 200s; }
  @keyframes drift { to { transform: translate(60px, 40px); } }

  .inner { position: relative; max-width: 560px; text-align: center; }
  .epigraph { margin: 0 0 48px; }
  .epigraph p {
    font-size: 19px; line-height: 1.9; color: #d8d2f0; font-weight: 400;
    letter-spacing: 0.02em; margin: 0 0 10px;
  }
  .epigraph cite { font-style: normal; color: #8b84b0; font-size: 14px; }

  .brand { margin-bottom: 28px; }
  .logo {
    font-size: 44px; font-weight: 800; letter-spacing: 0.14em; margin: 0;
    background: linear-gradient(180deg, #fff, #b9b0ff);
    -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
  }
  .tagline { color: #b3acd6; font-size: 15px; margin: 10px 0 0; }

  .sub { color: #8b84b0; font-size: 14px; line-height: 1.8; max-width: 420px; margin: 0 auto 28px; }
  .enter { background: #fff; color: #0a0a12; padding: 12px 28px; font-weight: 700; }
  footer { margin-top: 56px; color: #565270; font-size: 12px; }
</style>

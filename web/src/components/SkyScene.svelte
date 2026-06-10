<script>
  // 星台场景：活体所站的「深空舞台」随她此刻 dayPhase 切换完整场景（晨/昼/昏/夜）。
  // 绝对铺满父容器（父需 position:relative; overflow:hidden）。色值来自 lib/creature.js 的 skyScene()。
  import { skyScene, crHash, crRng } from '../lib/creature.js';
  export let phase = '白天';
  export let animate = true;
  export let seed = 7;

  $: sc = skyScene(phase);
  $: build = (() => {
    const rnd = crRng(crHash(sc.key + seed) || 1);
    const stars = [];
    for (let i = 0; i < sc.stars; i++) stars.push({ x: rnd() * 100, y: rnd() * 66, r: 0.5 + rnd() * 1.2, d: 2 + rnd() * 3, delay: i * 0.2 });
    const galaxy = [];
    if (sc.galaxy) {
      for (let i = 0; i < 46; i++) { const t = rnd(); galaxy.push({ x: t * 120 - 10, y: 8 + t * 64 + (rnd() - 0.5) * 18, r: 0.4 + rnd() * 0.9, o: 0.4 + rnd() * 0.5 }); }
    }
    return { stars, galaxy };
  })();
  $: stars = build.stars;
  $: galaxy = build.galaxy;
  $: sunR = sc.sun ? (sc.sun.r || 46) : 46;
</script>

<div class="scene" aria-hidden="true">
  {#if sc.galaxy}
    <div class="galaxyband"></div>
    <div class="nebula"></div>
    {#each galaxy as g}
      <span class="gstar" style="left:{g.x}%;top:{g.y}%;width:{g.r * 2}px;height:{g.r * 2}px;opacity:{g.o};"></span>
    {/each}
  {/if}
  {#if sc.dusk}
    <div class="dusk1"></div>
    <div class="dusk2"></div>
  {/if}
  {#if sc.dawn}
    <div class="dawn1"></div>
    <div class="dawn2"></div>
    <div class="dawnray" style="animation:{animate ? 'cr-drift 22s ease-in-out infinite' : 'none'};"></div>
  {/if}
  {#if sc.sun}
    <div class="sun" style="top:{sc.sun.y}%;width:{sunR}px;height:{sunR}px;margin-left:{-sunR / 2}px;margin-top:{-sunR / 2}px;background:radial-gradient(circle, {sc.sun.c} 36%, transparent 72%);box-shadow:0 0 {sc.dusk ? 60 : 40}px {sc.dusk ? 22 : 14}px {sc.sun.halo};animation:{animate ? 'cr-aura 6s ease-in-out infinite' : 'none'};"></div>
  {/if}
  {#if sc.moon}
    <div class="moon" style="top:{sc.moon.y}%;background:radial-gradient(circle at 36% 34%, {sc.moon.c}, #b9c4e8);"></div>
  {/if}
  {#each stars as s}
    <span class="star" style="left:{s.x}%;top:{s.y}%;width:{s.r * 2}px;height:{s.r * 2}px;animation:{animate ? `cr-aura ${s.d}s ease-in-out ${s.delay}s infinite` : 'none'};"></span>
  {/each}
  {#if sc.clouds}
    <div class="cloud c1" style="animation:{animate ? 'cr-drift 16s ease-in-out infinite' : 'none'};"></div>
    <div class="cloud c2" style="animation:{animate ? 'cr-drift 22s ease-in-out infinite reverse' : 'none'};"></div>
    <div class="cloud c3" style="animation:{animate ? 'cr-drift 28s ease-in-out infinite' : 'none'};"></div>
  {/if}
  {#if sc.dusk}
    <div class="duskcloud" style="animation:{animate ? 'cr-drift 20s ease-in-out infinite' : 'none'};"></div>
  {/if}
  {#if sc.mist}<div class="mist"></div>{/if}
  {#if sc.shoot && animate}<span class="fx-shoot" style="left:14%;top:16%;"></span>{/if}
</div>

<style>
  .scene { position: absolute; inset: 0; overflow: hidden; border-radius: inherit; pointer-events: none; }
  .scene > * { position: absolute; }
  .galaxyband { left: -12%; top: 4%; width: 124%; height: 64%; transform: rotate(-22deg); transform-origin: center; background: linear-gradient(90deg, transparent, rgba(150,170,255,0.10) 30%, rgba(190,160,255,0.14) 52%, rgba(150,190,255,0.08) 70%, transparent); filter: blur(7px); }
  .nebula { left: 34%; top: 20%; width: 40%; height: 30%; border-radius: 50%; background: radial-gradient(circle, rgba(180,150,255,0.16), transparent 70%); filter: blur(6px); }
  .gstar { border-radius: 50%; background: #fff; }
  .dusk1 { left: 0; right: 0; bottom: 0; height: 62%; background: linear-gradient(to top, rgba(255,120,50,0.55), rgba(255,90,110,0.28) 42%, transparent); }
  .dusk2 { left: 0; right: 0; bottom: 0; height: 26%; background: linear-gradient(to top, rgba(255,160,70,0.6), transparent); }
  .dawn1 { left: 0; right: 0; bottom: 0; height: 54%; background: linear-gradient(to top, rgba(255,180,120,0.42), rgba(255,150,170,0.2) 46%, transparent); }
  .dawn2 { left: 0; right: 0; bottom: 0; height: 22%; background: linear-gradient(to top, rgba(255,210,150,0.5), transparent); }
  .dawnray { left: 20%; top: 54%; width: 60%; height: 6px; border-radius: 6px; background: rgba(255,210,180,0.5); filter: blur(3px); }
  .sun { left: 50%; border-radius: 50%; }
  .moon { right: 24%; width: 30px; height: 30px; margin-top: -15px; border-radius: 50%; box-shadow: 0 0 22px 5px rgba(190,205,255,0.4); }
  .star { border-radius: 50%; background: #fff; opacity: 0.75; }
  .cloud { border-radius: 16px; filter: blur(4px); }
  .c1 { left: 4%; top: 20%; width: 78px; height: 16px; background: rgba(255,255,255,0.2); }
  .c2 { right: 8%; top: 38%; width: 56px; height: 13px; background: rgba(255,255,255,0.15); }
  .c3 { left: 24%; top: 56%; width: 44px; height: 11px; background: rgba(255,255,255,0.1); filter: blur(5px); }
  .duskcloud { right: 14%; top: 40%; width: 52px; height: 12px; border-radius: 12px; background: rgba(120,40,60,0.45); filter: blur(2px); }
  .mist { left: 0; right: 0; bottom: 0; height: 38%; background: linear-gradient(to top, rgba(255,210,170,0.14), transparent); }
</style>

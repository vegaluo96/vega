<script>
  // 下拉刷新（移动端通用）：下拉出现活体小光球（随拉距旋转/长大），松手「打捞」新心声。
  // 桌面无 touch 事件 → 自然不生效，不碍事。
  export let onRefresh = async () => {};
  let pull = 0; // 当前下拉距离（阻尼后）
  let refreshing = false;
  let startY = null;
  let rootEl;
  const THRESHOLD = 58;

  function scroller() {
    let el = rootEl && rootEl.parentElement;
    while (el && el !== document.body) {
      const s = getComputedStyle(el);
      if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight) return el;
      el = el.parentElement;
    }
    return document.scrollingElement; // 页面级滚动（广场即如此）
  }
  function onStart(e) {
    const sc = scroller();
    if (refreshing || (sc && sc.scrollTop > 2)) { startY = null; return; }
    startY = e.touches[0].clientY;
  }
  function onMove(e) {
    if (startY == null || refreshing) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0) { pull = 0; return; }
    pull = Math.min(96, dy * 0.45); // 阻尼
  }
  function onEnd() {
    if (startY == null || refreshing) return;
    startY = null;
    if (pull >= THRESHOLD) {
      refreshing = true; pull = 60;
      Promise.resolve(onRefresh && onRefresh()).finally(() => setTimeout(() => { refreshing = false; pull = 0; }, 250));
    } else { pull = 0; }
  }
  $: active = pull > 6 || refreshing;
</script>

<div bind:this={rootEl} on:touchstart={onStart} on:touchmove={onMove} on:touchend={onEnd}>
  <div class="well" aria-hidden="true" style="height:{refreshing ? 60 : pull}px;transition:{startY != null ? 'none' : 'height 0.28s var(--ease)'};">
    {#if active}
      <div class="inner" style="opacity:{Math.min(1, pull / THRESHOLD)};">
        <span class="orb" style="animation:{refreshing ? 'cr-breathe 1s ease-in-out infinite' : 'none'};transform:{refreshing ? 'none' : `rotate(${pull * 3.4}deg) scale(${0.6 + Math.min(1, pull / THRESHOLD) * 0.4})`};"></span>
        <span class="lbl">{refreshing ? '正在打捞新的心声…' : (pull >= THRESHOLD ? '松手刷新' : '下拉刷新')}</span>
      </div>
    {/if}
  </div>
  <slot />
</div>

<style>
  .well { overflow: hidden; display: grid; place-items: center; }
  .inner { display: flex; align-items: center; gap: 10px; }
  .orb { width: 22px; height: 22px; border-radius: 50%; flex: none; background: radial-gradient(circle at 38% 32%, hsl(222 70% 82%), hsl(222 60% 58%) 55%, hsl(252 55% 40%)); box-shadow: 0 0 12px hsl(222 80% 65% / 0.6); }
  .lbl { font-size: var(--fs-xs); color: var(--muted); }
</style>

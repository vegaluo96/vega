<script>
  // 命的视觉身份：稳定的"星色"渐变（来自 lib/avatar.js，不改引擎/不改算法），
  // 心情给描边环，醒着时极轻的呼吸光。视觉是身份的一部分。
  import { avatarStyle, moodRing } from '../lib/avatar.js';
  export let id = '';
  export let emotion = '';
  export let awake = false;
  export let size = 46;
  export let pulse = true;
  $: ring = moodRing(emotion);
</script>

<span
  class="av"
  class:pulse={awake && pulse}
  style="width:{size}px;height:{size}px;font-size:{Math.round(size * 0.4)}px;{avatarStyle(id)};--ring:{ring}"
>
  <span class="ch">{id ? id[0].toUpperCase() : '·'}</span>
</span>

<style>
  .av {
    position: relative; display: grid; place-items: center; flex: none;
    border-radius: var(--r-pill); color: #fff; font-weight: 700;
    box-shadow: 0 0 0 2px var(--ring, transparent);
    transition: box-shadow var(--t-hover) ease;
  }
  .ch { text-shadow: 0 1px 2px rgba(0, 0, 0, 0.18); }
  .av.pulse::after {
    content: ''; position: absolute; inset: 0; border-radius: var(--r-pill);
    box-shadow: 0 0 0 2px var(--ring, transparent);
    animation: ring-pulse 3.4s ease-in-out infinite;
  }
  @keyframes ring-pulse {
    0%, 100% { opacity: 0; transform: scale(1); }
    50% { opacity: 0.55; transform: scale(1.14); }
  }
</style>

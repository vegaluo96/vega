<script>
  // 头部充值入口（全站统一）·彩色礼物。
  import ColoredGift from './ColoredGift.svelte';
  import { navigate } from '../lib/router.js';
</script>

<button class="icon-btn" on:click={() => navigate('recharge')} aria-label="充值心意" title="充值心意"><ColoredGift size={23} /></button>

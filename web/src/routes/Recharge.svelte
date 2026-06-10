<script>
  // 充值心意（人工审批，坦诚语气）。
  import { api } from '../lib/api.js';
  import { back } from '../lib/router.js';
  import { FX } from '../lib/fx.js';
  import TopBar from '../components/TopBar.svelte';
  import ColoredGift from '../components/ColoredGift.svelte';

  let amt = 100;
  let done = false;
  let busy = false;
  const opts = [50, 100, 200, 500];

  async function submit(e) {
    if (busy) return;
    busy = true;
    const el = e.currentTarget;
    try {
      await api.recharge(amt);
      done = true;
      FX.burst(el, { count: 14, color: 'var(--life-reaching)', spread: 80 });
      setTimeout(() => FX.burst(el, { count: 12, color: 'var(--life-remembering)', spread: 100 }), 140);
    } catch { /* 失败仍给反馈，避免卡住 */ done = true; }
    busy = false;
  }
</script>

<div class="page">
  <TopBar title="充值心意" onBack={back} />
  <div class="body">
    {#if !done}
      <p class="caption lead">心意让她说得更从容。多少都行——用尽了，她也不会离开。</p>
      <div class="chips amts">
        {#each opts as a}<button class="chip amt" class:on={amt === a} on:click={() => (amt = a)}>{a}</button>{/each}
      </div>
      <button class="btn btn-block" on:click={submit} disabled={busy}>申请充值 {amt} 心意</button>
      <p class="faint note">充值由管理员人工审批，到账后通知你。</p>
    {:else}
      <div class="done">
        <div class="giftwrap"><ColoredGift size={64} animate /></div>
        <p class="t">已提交申请</p>
        <p class="caption">管理员审批后会记入你的账户。</p>
        <button class="btn btn-soft ok" on:click={back}>好的</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .body { padding: 12px var(--gutter); }
  .lead { line-height: 1.7; }
  .amts { margin: 16px 0; }
  .amt { min-height: 44px; padding: 0 20px; font-size: var(--fs-body); }
  .note { font-size: var(--fs-xs); text-align: center; margin-top: 12px; }
  .done { text-align: center; padding: 40px 0; }
  .giftwrap { display: grid; place-items: center; margin-bottom: 14px; }
  .done .t { font-weight: 700; font-size: var(--fs-lg); }
  .ok { margin-top: 20px; }
</style>

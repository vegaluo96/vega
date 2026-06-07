<script>
  // 列表骨架屏：加载时占位，避免"载入中…"的未完成感。rows 行，每行像一张命/关系卡。
  export let rows = 4;
  export let avatar = true;
</script>

<div class="sk">
  {#each Array(rows) as _, i}
    <div class="row" style="opacity:{(1 - i * 0.12).toFixed(2)}">
      {#if avatar}<span class="shimmer av"></span>{/if}
      <div class="lines">
        <span class="shimmer l1"></span>
        <span class="shimmer l2"></span>
      </div>
    </div>
  {/each}
</div>

<style>
  .sk { display: flex; flex-direction: column; gap: 8px; }
  .row { display: flex; align-items: center; gap: 13px; padding: 13px; border: 1px solid var(--border-subtle); border-radius: var(--r-md); }
  .av { width: 46px; height: 46px; border-radius: 50%; flex: none; }
  .lines { flex: 1; display: flex; flex-direction: column; gap: 7px; }
  .l1 { height: 12px; width: 42%; border-radius: 6px; }
  .l2 { height: 10px; width: 68%; border-radius: 6px; }
</style>

<script>
  // KPI 卡（= 原型 AKpi）：大数字 + 小注脚；tone 只给状态色（颜色属于状态点，不属于外壳）。
  export let label = '';
  export let value = '';
  export let sub = '';
  export let tone = '';
</script>

<div class="kpi card-quiet">
  <div class="eyebrow lab">{label}</div>
  <div>
    <div class="val" style:color={tone || null}>{value}</div>
    <div class="meta sub">{sub || ''}</div>
  </div>
</div>

<style>
  .kpi { min-height: 104px; padding: 18px; display: flex; flex-direction: column; justify-content: space-between; }
  .lab { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .val { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .sub { margin-top: 4px; min-height: 16px; font-size: var(--fs-2xs); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>

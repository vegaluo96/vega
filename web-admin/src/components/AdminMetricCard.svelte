<script>
  // 观测台指标卡：label / value / hint / status（default·success·warning·danger）。
  export let label = '';
  export let value = '';
  export let hint = '';
  export let status = '';
</script>

<div class="metric {status}">
  <div class="lab">{label}</div>
  <div class="val mono">{value}</div>
  {#if hint}<div class="hint">{hint}</div>{/if}
</div>

<style>
  .metric { background: var(--panel); border: 1px solid var(--border); border-radius: var(--r-md); padding: 14px 16px; position: relative; overflow: hidden; }
  .metric::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: var(--accent); opacity: 0.5; }
  .metric.success::before { background: var(--success); }
  .metric.warning::before { background: var(--warning); }
  .metric.danger::before { background: var(--danger); }
  .lab { font-size: 11.5px; color: var(--muted); letter-spacing: 0.02em; }
  .val { font-size: 26px; font-weight: 700; line-height: 1.1; margin-top: 6px; }
  .metric.warning .val { color: var(--warning); }
  .metric.danger .val { color: var(--danger); }
  .hint { font-size: 11px; color: var(--faint-c); margin-top: 4px; }
</style>

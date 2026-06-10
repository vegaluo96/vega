<script>
  // 系统事件行（= 原型 AEvent）：三色状态点 + 时间 + 来源 + 一句话。
  // 真实活动流（/admin/activity）没有显式分级——按事件类型确定性映射：断连/结束→warn，其余→ok。
  export let e;
  const TONE = { ok: 'var(--success)', warn: 'var(--warning)', err: 'var(--danger)' };
  $: kind = e.kind || (((e.type || '').includes('ENDED') || (e.type || '').includes('CLOSED')) ? 'warn' : 'ok');
  $: hm = new Date(e.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  $: text = (e.label || '') + (e.content ? ` · ${String(e.content).slice(0, 80)}` : '');
</script>

<div class="ev">
  <span class="dot" style:background={TONE[kind] || TONE.ok}></span>
  <span class="t mono">{hm}</span>
  <span class="src">{e.life || e.src || ''}</span>
  <span class="tx" class:bad={kind === 'err'}>{text}</span>
</div>

<style>
  .ev { display: flex; gap: 10px; align-items: flex-start; padding: 9px 2px; box-shadow: inset 0 -1px 0 0 var(--border-subtle); font-size: var(--fs-sm); line-height: 1.55; }
  .dot { flex: none; width: 7px; height: 7px; border-radius: 50%; margin-top: 6px; }
  .t { flex: none; width: 40px; color: var(--faint); }
  .src { flex: none; width: 56px; color: var(--muted); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tx { flex: 1; min-width: 0; color: var(--text); text-wrap: pretty; overflow: hidden; }
  .tx.bad { color: var(--danger); }
</style>

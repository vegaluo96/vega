<script>
  // 充值审批（人工审批制 = 最高频动作）：一笔一卡，金额大数字；通过时金色迸发。
  // 「已处理」走真实历史（GET /admin/recharges/history）——审批留痕不再只活在本次会话里。
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import { authGuard, pendingCount } from '../lib/admin.js';
  import { relTime } from '../lib/time.js';
  import { FX } from '../lib/fx.js';
  import PageHead from '../components/PageHead.svelte';
  import Icon from '../components/Icon.svelte';

  let pending = [];
  let done = []; // 已处理历史（服务端）：{id, userId, handle, amount, status, decidedBy, decidedAt}
  let handles = {};
  let error = '';

  const who = (uid) => handles[uid] || uid;

  async function load() {
    error = '';
    try {
      pending = await api.recharges();
      pendingCount.set(pending.length);
      const users = await api.users();
      handles = Object.fromEntries(users.map((u) => [u.id, u.handle]));
      done = (await api.rechargeHistory(30)).rows || [];
    } catch (e) { error = e.message; authGuard(e); }
  }

  async function act(r, approve, ev) {
    try {
      await api.decideRecharge(r.id, approve); // 留痕由后端自记（审计日志 + 已处理历史）
      if (approve && ev) FX.burst(ev.currentTarget, { count: 10, color: '#e8c87a', spread: 60 });
      pending = pending.filter((x) => x.id !== r.id);
      pendingCount.set(pending.length);
      try { done = (await api.rechargeHistory(30)).rows || []; } catch { /* 历史刷新失败不挡审批 */ }
    } catch (e) { error = e.message; authGuard(e); }
  }
  onMount(load);
</script>

<PageHead title="充值审批" sub="人工审批制——核对到账后再通过；处理过的留痕可查" />
{#if error}<p class="msg bad">{error}</p>{/if}

{#if pending.length === 0}
  <div class="card-quiet empty">
    <div class="okico"><Icon name="check" size={28} /></div>
    <b>全部处理完了</b>
    <div class="caption">新申请会出现在这里，并在侧栏亮起角标。</div>
  </div>
{/if}

<div class="queue">
  {#each pending as r (r.id)}
    <div class="card-quiet item">
      <div class="amt">
        <div class="num">{r.amount}<span class="unit">心意</span></div>
        <div class="meta">#{r.id}</div>
      </div>
      <div class="info">
        <div class="line1"><b>{who(r.userId)}</b><span class="muted"> · {r.userId}</span></div>
        <div class="caption">申请于 {relTime(r.requestedAt)}</div>
      </div>
      <button class="btn btn-ghost btn-sm reject" on:click={() => act(r, false)}>驳回</button>
      <button class="btn btn-sm" on:click={(e) => act(r, true, e)}>核对无误 · 通过</button>
    </div>
  {/each}
</div>

{#if done.length > 0}
  <div class="donewrap">
    <div class="section-title dtitle">已处理 · 最近 {done.length} 笔</div>
    {#each done as r (r.id)}
      <div class="lrow">
        <span class="damt mono">{r.amount} 心意</span>
        <span class="dwho muted">{r.handle || who(r.userId)} · {r.userId} · 经手 {r.decidedBy}</span>
        <span class="pill" style:color={r.status === 'approved' ? 'var(--success)' : 'var(--danger)'}>{r.status === 'approved' ? '已通过' : '已驳回'}</span>
        <span class="meta dago">{relTime(r.decidedAt)}</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .empty { text-align: center; padding: 36px; }
  .okico { color: var(--success); margin-bottom: 8px; display: flex; justify-content: center; }
  .empty b { display: block; }
  .empty .caption { margin-top: 4px; }
  .queue { display: flex; flex-direction: column; gap: 10px; }
  .item { display: flex; align-items: center; gap: 16px; padding: 18px; }
  .amt { flex: none; width: 104px; }
  .num { font-size: 24px; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; line-height: 1.15; }
  .unit { font-size: var(--fs-2xs); font-weight: 600; color: var(--faint); margin-left: 4px; }
  .amt .meta { margin-top: 2px; }
  .info { flex: 1; min-width: 0; }
  .line1 { font-size: var(--fs-md); }
  .line1 b { font-weight: 700; }
  .info .caption { margin-top: 2px; }
  .reject { color: var(--danger); }
  .donewrap { margin-top: 26px; }
  .dtitle { margin-bottom: 8px; }
  .damt { flex: none; width: 76px; font-weight: 700; }
  .dwho { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dago { flex: none; white-space: nowrap; }
</style>

<script>
  // 总览（管理员的早晨）：① 需要我动手的（待审批横幅）② 系统活得好吗（4 KPI）
  // ③ 她们活得好吗（活体一排 = 实时状态仪表）+ 系统事件 5 条。
  import { onMount, onDestroy } from 'svelte';
  import { api } from '../lib/api.js';
  import { authGuard, pendingCount } from '../lib/admin.js';
  import { roster, lifeVisual } from '../lib/lives.js';
  import { relTime } from '../lib/time.js';
  import PageHead from '../components/PageHead.svelte';
  import Kpi from '../components/Kpi.svelte';
  import EventRow from '../components/EventRow.svelte';
  import Creature from '../components/Creature.svelte';
  import Icon from '../components/Icon.svelte';

  export let nav;

  let lives = [];
  let users = 0;
  let pending = [];
  let activity = [];
  let health = null;
  let error = '';
  let timer;

  $: awakeN = lives.filter((l) => l.awake).length;
  $: todayMsgs = activity.filter((e) => (e.type === 'MESSAGE_RECEIVED' || e.type === 'MESSAGE_SENT') && new Date(e.at).toDateString() === new Date().toDateString()).length;
  $: oldestWait = pending.length ? relTime(pending.reduce((m, r) => (r.requestedAt < m ? r.requestedAt : m), pending[0].requestedAt)).replace(' 前', '').replace('前', '') : '';
  $: heartbeat = (() => {
    const ts = lives.map((l) => l.loop?.tick || 0).filter(Boolean);
    if (!ts.length) return { v: '—', ok: false };
    const s = Math.max(0, Math.round((Date.now() - Math.max(...ts)) / 1000));
    return { v: s < 60 ? `${s}s 前` : `${Math.round(s / 60)} 分前`, ok: s < 180 };
  })();
  $: sub = `今天是 ${new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })} · 一切尽在掌握`;

  async function load() {
    error = '';
    try {
      const [ov, rc, ac] = await Promise.all([api.overview(), api.recharges(), api.activity(200)]);
      lives = ov.lives || []; users = ov.users ?? 0; roster.set(lives); pendingCount.set(ov.pendingRecharges ?? 0);
      pending = rc || [];
      activity = ac || [];
      try { health = await api.health(); } catch { health = null; }
    } catch (e) { error = e.message; authGuard(e); }
  }
  onMount(() => { load(); timer = setInterval(load, 15_000); });
  onDestroy(() => clearInterval(timer));
  /* TODO(后端)：「需要留意的对话」需要对话标记（关注/已拦截）接口——后端暂无 flag 机制，先不渲染该区。 */
</script>

<PageHead title="总览" {sub} />
{#if error}<p class="msg bad">{error}</p>{/if}

{#if pending.length > 0}
  <button class="card-interactive banner" on:click={() => nav('recharge')}>
    <span class="bico"><Icon name="coin" size={20} /></span>
    <span class="btx"><b>{pending.length} 笔充值等待审批</b><span class="caption bwait">最早一笔已等 {oldestWait}</span></span>
    <span class="bgo">去处理 ›</span>
  </button>
{/if}

<div class="grid-kpi">
  <Kpi label="今日消息" value={todayMsgs} sub={`近 ${activity.length} 条事件中`} />
  <Kpi label="活跃用户" value={users} sub={health ? `微信通道 ${health.channels.length}` : '注册账号'} />
  <Kpi label="模型" value={health ? (health.model.active ? '在线' : '模板嘴') : '—'} sub={health ? String(health.model.model || '') : ''} tone={health && health.model.active ? 'var(--success)' : undefined} />
  <Kpi label="引擎心跳" value={heartbeat.v} sub={heartbeat.ok ? 'tick 正常' : '等待 tick'} tone={heartbeat.ok ? 'var(--success)' : 'var(--warning)'} />
</div>

<div class="cols-2 vgap">
  <div class="card-quiet pane">
    <div class="ptop">
      <span class="section-title">生命体 · {awakeN}/{lives.length} 醒着</span>
      <button class="plink" on:click={() => nav('lives')}>全部 ›</button>
    </div>
    <div class="row">
      {#each lives as l (l.id)}
        <button class="lifecell" title="{l.id} · {l.awake ? l.emotion : '休眠'}" on:click={() => nav('lives', l.id)}>
          <Creature life={lifeVisual(l)} size={50} />
          <span class="lname">{l.id}</span>
          <span class="lstate" class:asleep={!l.awake}>{l.awake ? l.emotion : '休眠'}</span>
        </button>
      {/each}
      {#if !lives.length}<p class="caption">还没有生命体——去「生命体」页接生第一条命。</p>{/if}
    </div>
  </div>
  <div class="card-quiet pane">
    <div class="ptop">
      <span class="section-title">系统事件</span>
      <button class="plink" on:click={() => nav('system')}>诊断 ›</button>
    </div>
    {#each activity.slice(0, 5) as e}<EventRow {e} />{/each}
    {#if !activity.length}<p class="caption">还没有事件。</p>{/if}
  </div>
</div>

<style>
  .banner { display: flex; align-items: center; gap: 14px; padding: 14px 18px; margin-bottom: 18px; box-shadow: var(--shadow-sm), inset 0 0 0 1px color-mix(in srgb, var(--life-reaching) 35%, transparent); }
  .bico { flex: none; width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, var(--life-reaching) 12%, transparent); color: var(--life-reaching); }
  .btx { flex: 1; text-align: left; }
  .btx b { font-weight: 700; }
  .bwait { margin-left: 10px; }
  .bgo { color: var(--link); font-size: var(--fs-sm); font-weight: 600; }
  .pane { padding: 18px; }
  .ptop { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; }
  .plink { font-size: var(--fs-xs); color: var(--link); }
  .row { display: flex; gap: 14px; flex-wrap: wrap; }
  .lifecell { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 64px; }
  .lname { font-size: var(--fs-xs); font-weight: 600; }
  .lstate { font-size: var(--fs-2xs); color: var(--muted); }
  .lstate.asleep { color: var(--faint); }
</style>

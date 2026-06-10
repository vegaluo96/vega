<script>
  // 系统诊断：4 KPI + 事件流（三色点）+ 通道与策略 + 链路检查（chain-trace）+ 审计日志（服务端持久化）。
  import { onMount, onDestroy } from 'svelte';
  import { api } from '../lib/api.js';
  import { authGuard } from '../lib/admin.js';
  import { roster } from '../lib/lives.js';
  import { relTime } from '../lib/time.js';
  import PageHead from '../components/PageHead.svelte';
  import Kpi from '../components/Kpi.svelte';
  import EventRow from '../components/EventRow.svelte';

  let h = null;
  let activity = [];
  let auditRows = [];
  let error = '';
  let timer;

  // 链路检查（仅 owner，只读）：感知→状态→prompt→模型原话→裁决→最终。
  let ctLife = '', ctMsg = '你好，最近怎么样？', ctBalance = 6;
  let ct = null, ctErr = '', ctRunning = false;

  async function load() {
    error = '';
    try {
      const [hh, ac] = await Promise.all([api.health(), api.activity(150)]);
      h = hh; activity = ac || [];
      if (!$roster.length) roster.set((await api.overview()).lives || []);
    } catch (e) { error = e.message; authGuard(e); }
    try { auditRows = (await api.audit(50)).rows || []; } catch { /* 审计读取失败不挡诊断页 */ }
  }
  async function runTrace() {
    ctRunning = true; ctErr = ''; ct = null;
    try { ct = await api.chainTrace({ lifeId: ctLife, message: ctMsg, balance: Number(ctBalance) }); }
    catch (e) { ctErr = e.status === 403 ? '链路检查仅 owner。' : e.message; }
    finally { ctRunning = false; }
  }
  onMount(() => { load(); timer = setInterval(load, 20_000); });
  onDestroy(() => clearInterval(timer));
</script>

<PageHead title="系统诊断" sub="引擎 / 模型 / 微信通道 / 推送 的健康与事件留痕" />
{#if error}<p class="msg bad">{error}</p>{/if}

{#if h}
  <div class="grid-kpi">
    <Kpi label="引擎规模" value={`${h.scale.awake}/${h.scale.lives} 醒着`} sub={`事件 ${h.scale.events.toLocaleString()} · 用户 ${h.scale.users}`} tone="var(--success)" />
    <Kpi label="模型 · 嘴/耳" value={h.model.active ? '在线' : '模板嘴'} sub={String(h.model.model || '')} tone={h.model.active ? 'var(--success)' : 'var(--warning)'} />
    <Kpi label="在场感知" value={h.audience.present ? '有人在' : '无人'} sub={`已安静 ${h.audience.idleMinutes} 分 · 门控 ${h.audience.gateMinutes} 分`} />
    <Kpi label="自主预算" value={`${h.autonomousBudget.used}/${h.autonomousBudget.cap}`} sub={`每 ${Math.round(h.autonomousBudget.windowMs / 60000)} 分钟窗口`} tone={h.autonomousBudget.used >= h.autonomousBudget.cap ? 'var(--warning)' : undefined} />
  </div>
{/if}

<div class="cols-2 vgap">
  <div class="card-quiet pane">
    <div class="section-title st">事件流</div>
    {#each activity.slice(0, 30) as e}<EventRow {e} />{/each}
    {#if !activity.length}<p class="caption">还没有事件。</p>{/if}
  </div>

  <div class="col">
    {#if h}
      <div class="card-quiet pane">
        <div class="section-title st">通道与策略</div>
        {#each [
          ['微信通道', h.channels.length ? `${h.channels.length} 条通道 · ${h.channels.map((c) => `${c.user}↔${c.life}`).join('、')}` : '未接通道', h.channels.length > 0],
          ['模型降级（话朴素些）', '余额耗尽/模型挂了自动 · voice=plain', true],
          ['省 token 闲置门控', `无人说话 ${h.audience.gateMinutes} 分钟后只内省`, true],
          ['治理', `能力 ${h.governance.capabilities} · 奖励黑客被契约①结构性阻断`, true],
        ] as [k, v, on]}
          <div class="srow">
            <span class="smain"><b class="sk">{k}</b><span class="meta sv">{v}</span></span>
            <span class="dot" style:background={on ? 'var(--success)' : 'var(--faint)'}></span>
          </div>
        {/each}
        <!-- TODO(后端)：策略开关（注册开放/通道启停）写端点暂无——以上为只读状态；接上后开关需二次确认留痕。 -->
        <p class="faint foot">开关动作均需二次确认并留痕（当前为只读状态，写端点 TODO 后端）。</p>
      </div>
    {/if}

    <div class="card-quiet pane">
      <div class="section-title st">链路检查（chain-trace · 只读不写日志）</div>
      <div class="frow">
        <label class="fld"><span class="eyebrow flab">生命体</span>
          <select class="select" bind:value={ctLife}>
            <option value="">第一条</option>
            {#each $roster as l (l.id)}<option value={l.id}>{l.id}</option>{/each}
          </select></label>
        <label class="fld"><span class="eyebrow flab">模拟余额</span><input class="input" type="number" bind:value={ctBalance} /></label>
      </div>
      <label class="fld"><span class="eyebrow flab">测试消息</span><input class="input" bind:value={ctMsg} /></label>
      <button class="btn btn-sm" on:click={runTrace} disabled={ctRunning}>{ctRunning ? '检查中…' : '运行链路检查'}</button>
      {#if ctErr}<p class="msg bad">✗ {ctErr}</p>{/if}
      {#if ct && ct.trace}
        <div class="trace fade-in">
          <div class="trow"><span class="tk">感知</span><span>{ct.trace.perceive.source === 'model' ? '模型当耳' : '词表兜底'} · {ct.trace.timing.perceiveMs}ms</span></div>
          <div class="trow"><span class="tk">状态</span><span>{ct.trace.state.emotion} · {ct.trace.state.dayPhase} · 睡眠压 {ct.trace.state.sleepPressure}</span></div>
          <div class="trow"><span class="tk">嘴</span><span class:warnc={!ct.trace.model.usedRealModel}>{ct.trace.model.usedRealModel ? `真模型（${ct.trace.timing.modelMs}ms）` : '模板嘴（没用模型）'}</span></div>
          <div class="trow"><span class="tk">资源</span><span>{ct.resource.band} · {ct.resource.note}</span></div>
          <div class="trow"><span class="tk">裁决</span><span>{ct.trace.critic.verdict}</span></div>
          <div class="trow final"><span class="tk">最终</span><span>{ct.trace.critic.finalUtterance}</span></div>
        </div>
      {/if}
    </div>

    <div class="card-quiet pane">
      <div class="section-title st">审计日志</div>
      <!-- 服务端持久化（GET /admin/audit）：敏感操作（查看全文/封禁/调余额/配置变更/标记/安全）后端自记。 -->
      {#each auditRows.slice(0, 12) as a (a.id)}
        <div class="lrow"><span class="awho">{a.who}</span><span class="aact">{a.action}</span><span class="meta aago">{relTime(a.at)}</span></div>
      {:else}
        <p class="caption">还没有敏感操作留痕。</p>
      {/each}
    </div>
  </div>
</div>

<style>
  .col { display: flex; flex-direction: column; gap: 12px; }
  .pane { padding: 18px; }
  .st { margin-bottom: 8px; }
  .srow { display: flex; align-items: center; gap: 10px; padding: 9px 0; box-shadow: inset 0 -1px 0 0 var(--border-subtle); }
  .smain { flex: 1; min-width: 0; }
  .sk { font-weight: 600; font-size: var(--fs-sm); }
  .sv { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dot { flex: none; width: 8px; height: 8px; border-radius: 50%; }
  .foot { font-size: var(--fs-2xs); margin: 10px 0 0; line-height: 1.6; }
  .frow { display: flex; gap: 10px; }
  .fld { display: block; flex: 1; margin-bottom: 10px; }
  .flab { display: block; margin-bottom: 5px; }
  .trace { margin-top: 12px; }
  .trow { display: flex; gap: 10px; padding: 6px 0; box-shadow: inset 0 -1px 0 0 var(--border-subtle); font-size: var(--fs-sm); line-height: 1.6; }
  .trow.final { box-shadow: none; }
  .tk { flex: none; width: 36px; color: var(--muted); font-weight: 600; }
  .warnc { color: var(--warning); }
  .awho { flex: none; width: 64px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .aact { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .aago { flex: none; white-space: nowrap; }
</style>

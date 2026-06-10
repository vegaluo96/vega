<script>
  // 用户详情抽屉：KPI（余额/状态）+ 她们（迷你活体）+ 余额调整（必填备注留痕）+ 微信 +
  // 他的对话（/admin/users/:id/conversations，仅 owner）+ 危险操作（停用/恢复需二次确认）。
  import { createEventDispatcher } from 'svelte';
  import { api } from '../lib/api.js';
  import { authGuard, addAudit, me } from '../lib/admin.js';
  import { rosterVisual } from '../lib/lives.js';
  import { relTime } from '../lib/time.js';
  import Kpi from './Kpi.svelte';
  import Creature from './Creature.svelte';
  import Icon from './Icon.svelte';

  export let userId;
  const dispatch = createEventDispatcher();

  let u = null;
  let error = '';
  let delta = '';
  let note = '';
  let balMsg = '';
  let busy = false;
  let convos = null;
  let loadingConvos = false;
  let actMsg = '';

  const bj = (at) => { try { return new Date(at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }); } catch { return String(at); } };

  async function load() {
    error = '';
    try { u = await api.user(userId); } catch (e) { error = e.message; authGuard(e); }
  }
  load();

  async function adjust() {
    const amt = Math.trunc(Number(delta));
    if (!amt || !note.trim()) { balMsg = '✗ 金额非 0 整数、备注必填'; return; }
    if (!confirm(`确定给 ${u.handle} ${amt > 0 ? '充值' : '扣除'} ${Math.abs(amt)} 心意？\n备注：${note.trim()}`)) return;
    busy = true; balMsg = '';
    try {
      const r = await api.rechargeUser(userId, amt); // TODO(后端)：接口暂不收备注——备注先记入本地审计
      addAudit(`余额调整 ${u.handle} ${amt > 0 ? '+' : ''}${amt} 心意（备注：${note.trim()}）`);
      balMsg = `✓ 当前余额 ${r.balance}`;
      delta = ''; note = '';
      await load(); dispatch('changed');
    } catch (e) { balMsg = '✗ ' + e.message; authGuard(e); } finally { busy = false; }
  }

  async function setBlocked(block) {
    const verb = block ? '停用' : '恢复';
    if (!confirm(`⚠️ 确定${verb}账户 ${u.handle}（${userId}）？\n停用不删她们与他的关系数据，仅阻止登录与对话。`)) return;
    if (block && !confirm(`再次确认：${verb} ${u.handle}。该动作将记入审计。`)) return;
    try {
      await api.block(userId, !block);
      addAudit(`${verb}账户 ${u.handle}（${userId}）`);
      await load(); dispatch('changed');
    } catch (e) { error = e.message; authGuard(e); }
  }

  async function loadConvos() {
    loadingConvos = true; convos = null;
    try { convos = await api.userConversations(userId); }
    catch (e) { convos = { conversations: [], error: e.status === 403 ? '对话记录仅 owner 可读' : e.message }; }
    finally { loadingConvos = false; }
  }

  // TODO(后端)：微信解绑 / 重置密码邮件 接口暂无——交互完整、动作先留痕占位。
  function todoAct(label) {
    if (!confirm(`确定执行「${label}」？`)) return;
    addAudit(`${label}（${u.handle}）· 待后端接口`);
    actMsg = `「${label}」已记录（${$me.handle || 'admin'}）——后端接口待接，TODO(后端)。`;
  }
</script>

<div class="overlay fade-in">
  <button class="scrim" aria-label="关闭" on:click={() => dispatch('close')}></button>
  <div class="drawer" role="dialog" aria-modal="true" aria-label="用户详情">
    {#if error}<p class="msg bad">{error}</p>{/if}
    {#if u}
      <div class="dtop">
        <b class="dname">{u.handle}</b>
        <button class="icon-btn" aria-label="关闭" on:click={() => dispatch('close')}><Icon name="close" size={18} /></button>
      </div>
      <div class="caption">{u.email} · {u.emailVerified ? '已验证' : '未验证'} · 注册于 {bj(u.createdAt)} · {u.id}</div>

      <div class="kpis">
        <Kpi label="余额" value={u.balance} sub="心意" />
        <Kpi label="待批充值" value={u.pendingRecharges.reduce((s, p) => s + p.amount, 0)} sub={`${u.pendingRecharges.length} 笔`} />
        <Kpi label="状态" value={u.status === 'blocked' ? '已停用' : '正常'} tone={u.status === 'blocked' ? 'var(--danger)' : 'var(--success)'} />
      </div>

      <div class="section-title st">她们（{u.livesMet.length}）</div>
      <div class="lives">
        {#each u.livesMet as m (m.life)}
          <span class="lifecell">
            <Creature life={rosterVisual(m.life)} size={30} animate={false} />
            <span class="lname">{m.life}</span>
            <span class="meta">亲近 {Math.round(m.closeness * 100)} · {m.attachment}{m.ended ? ' · 已离' : ''}</span>
          </span>
        {:else}
          <span class="caption">还没认识任何她。</span>
        {/each}
      </div>

      <div class="section-title st">余额调整（需备注留痕）</div>
      <div class="balrow">
        <input class="input amt" bind:value={delta} placeholder="+50 或 -10" inputmode="numeric" />
        <input class="input" bind:value={note} placeholder="备注（必填，计入审计）" />
        <button class="btn btn-soft btn-sm" disabled={busy || !delta.trim() || !note.trim()} on:click={adjust}>执行</button>
      </div>
      {#if balMsg}<p class="msg" class:bad={balMsg.startsWith('✗')}>{balMsg}</p>{/if}

      <div class="section-title st">微信</div>
      {#if u.wechat}
        <div class="wxrow"><span class="wxok">已绑定 · 频道命 {u.wechat.lifeId}</span><button class="btn btn-ghost btn-sm" on:click={() => todoAct('微信解绑')}>解绑</button></div>
      {:else}
        <span class="caption">未绑定。</span>
      {/if}

      {#if u.pendingRecharges.length || u.recentRecharges.length}
        <div class="section-title st">充值记录</div>
        <div class="chips">
          {#each u.pendingRecharges as p}<span class="chip">{p.amount} 待批 · {relTime(p.requestedAt)}</span>{/each}
          {#each u.recentRecharges as r}<span class="chip" style:color={r.status === 'approved' ? 'var(--success)' : 'var(--danger)'}>{r.amount} {r.status === 'approved' ? '已批' : '已拒'} · {relTime(r.decidedAt)}</span>{/each}
        </div>
      {/if}

      <div class="section-title st">他的对话</div>
      {#if !convos}
        <button class="btn btn-ghost btn-sm" on:click={loadConvos} disabled={loadingConvos}>{loadingConvos ? '加载中…' : '查看对话（仅 owner）'}</button>
      {:else if convos.error}
        <p class="msg bad">✗ {convos.error}</p>
      {:else}
        {#each convos.conversations as c (c.life)}
          <div class="cvline">
            <Creature life={rosterVisual(c.life)} size={24} animate={false} />
            <span class="cvmain">↔ <b>{c.life}</b><span class="meta"> · 亲近 {Math.round(c.closeness * 100)} · {c.messages.length} 条</span></span>
          </div>
          <div class="cvthread">
            {#each c.messages.slice(-4) as m}
              <div class="cvmsg"><span class="faint">{m.who === 'her' ? c.life : u.handle}</span>：{m.text}</div>
            {/each}
          </div>
        {:else}
          <p class="caption">这个用户还没和谁聊过。</p>
        {/each}
      {/if}

      <div class="section-title st">危险操作</div>
      <div class="dangerrow">
        <button class="btn btn-ghost btn-sm" on:click={() => todoAct('重置密码邮件')}>重置密码邮件</button>
        {#if u.status === 'blocked'}
          <button class="btn btn-ghost btn-sm okact" on:click={() => setBlocked(false)}>恢复账户</button>
        {:else}
          <button class="btn btn-ghost btn-sm badact" on:click={() => setBlocked(true)}>停用账户</button>
        {/if}
      </div>
      {#if actMsg}<p class="msg">{actMsg}</p>{/if}
      <p class="faint foot">以上操作均需二次确认，并记入审计日志。她们与他的关系数据不会因停用被删除。</p>
    {:else if !error}
      <p class="caption">读取中…</p>
    {/if}
  </div>
</div>

<style>
  /* z-index=50（阶层表见 app.css：overlay 40 之上）；边线走阴影，不用真 border（接缝纪律） */
  .drawer { position: absolute; top: 0; right: 0; z-index: 50; width: 420px; max-width: 92vw; height: 100%; overflow-y: auto; background: var(--surface); box-shadow: var(--shadow-md); padding: 24px; }
  .dtop { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
  .dname { font-size: var(--fs-lg); font-weight: 800; }
  /* 抽屉内固定 3 列（420px 窄容器，auto-fit 会折行）；minmax(0,1fr) 防长数字撑破 */
  .kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 16px 0; }
  .st { margin: 18px 0 8px; }
  .lives { display: flex; gap: 12px; flex-wrap: wrap; }
  .lifecell { display: inline-flex; align-items: center; gap: 6px; }
  .lname { font-size: var(--fs-sm); font-weight: 600; }
  .balrow { display: flex; gap: 8px; }
  .amt { flex: none; width: 92px; }
  .wxrow { display: flex; align-items: center; gap: 10px; }
  .wxok { font-size: var(--fs-sm); color: var(--success); flex: 1; }
  .cvline { display: flex; align-items: center; gap: 8px; padding: 7px 0 2px; font-size: var(--fs-sm); }
  .cvmain { flex: 1; min-width: 0; }
  .cvmain b { font-weight: 600; }
  .cvthread { padding: 0 0 6px 32px; box-shadow: inset 0 -1px 0 0 var(--border-subtle); }
  .cvmsg { font-size: var(--fs-sm); line-height: 1.6; padding: 2px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dangerrow { display: flex; gap: 8px; flex-wrap: wrap; }
  .okact { color: var(--success); }
  .badact { color: var(--danger); }
  .foot { font-size: var(--fs-2xs); margin: 14px 0 0; line-height: 1.6; }
</style>

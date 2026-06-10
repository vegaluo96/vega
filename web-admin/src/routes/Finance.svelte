<script>
  // 财务：心意的进与出——充值审批在工作台，这里看 KPI、定价、平台对账与全站余额分布。
  // 真实数据：/admin/billing-config（每条成本/初始额度/对账 token）+ /admin/platform-balance（模型账户余额）
  // + /admin/users（余额分布）。TODO(后端)：流水账本（credit_ledger 已落库，缺查询端点）、
  // 心意流向（近7日·每条命）、每日免费额度配置。
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import { authGuard, addAudit } from '../lib/admin.js';
  import { relTime } from '../lib/time.js';
  import PageHead from '../components/PageHead.svelte';
  import Kpi from '../components/Kpi.svelte';

  let users = [];
  let billing = null;
  let pb = null;
  let bform = { costPerReply: 1, starterCredits: 100, apiyiToken: '', balanceUrl: '' };
  let saveMsg = '';
  let saving = false, checking = false;
  let queriedAt = null;
  let error = '';
  let denied = '';

  $: pool = users.reduce((s, u) => s + (u.balance || 0), 0);
  $: zeroN = users.filter((u) => u.balance === 0).length;
  $: sorted = [...users].sort((a, b) => b.balance - a.balance);

  async function load() {
    error = ''; denied = '';
    try { users = await api.users(); } catch (e) { error = e.message; authGuard(e); }
    try {
      billing = await api.billingConfig();
      bform = { costPerReply: billing.costPerReply, starterCredits: billing.starterCredits, apiyiToken: '', balanceUrl: billing.balanceUrl || '' };
    } catch (e) { if (e.status === 403) denied = '计费配置仅 owner。'; else error = e.message; }
    refreshBalance();
  }
  async function refreshBalance() {
    checking = true;
    try { pb = await api.platformBalance(); queriedAt = new Date().toISOString(); } catch (e) { pb = { error: e.message }; }
    finally { checking = false; }
  }
  async function save() {
    if (!confirm('⚠️ 这是【全站生效】的计费配置：保存后立即影响所有真实用户（定价变更建议同步发公告）。确定保存？')) return;
    saving = true; saveMsg = '';
    try {
      const patch = { costPerReply: Number(bform.costPerReply), starterCredits: Number(bform.starterCredits), balanceUrl: bform.balanceUrl };
      if (bform.apiyiToken.trim()) patch.apiyiToken = bform.apiyiToken.trim();
      billing = await api.saveBillingConfig(patch);
      bform.apiyiToken = '';
      saveMsg = '已保存 · 即时生效（无需重启）';
      addAudit(`保存计费配置（每条 ${patch.costPerReply} 心意 · 初始 ${patch.starterCredits}）`);
    } catch (e) { saveMsg = '✗ ' + e.message; authGuard(e); } finally { saving = false; }
  }
  onMount(load);
</script>

<PageHead title="财务" sub="心意的进与出——充值审批在工作台，这里看账本、定价与平台余额" />
{#if error}<p class="msg bad">{error}</p>{/if}

<div class="grid-kpi">
  <Kpi label="模型账户余额" value={pb ? (pb.error ? '查询失败' : pb.configured === false ? '未配置' : `$${pb.remainingUsd}`) : '…'}
    sub={pb && pb.configured && !pb.error ? `已用 $${pb.usedUsd} / 总 $${pb.totalUsd}` : '对账 token 在下方配置'}
    tone={pb && pb.configured && !pb.error ? (pb.remainingUsd < 5 ? 'var(--danger)' : 'var(--success)') : undefined} />
  <Kpi label="余额总池" value={pool} sub={`心意 · ${users.length} 人`} />
  <Kpi label="零余额用户" value={zeroN} sub="话已转朴素、不阻断" tone={zeroN > 0 ? 'var(--warning)' : undefined} />
  <Kpi label="单价" value={billing ? `${billing.costPerReply} 心意/条` : '—'} sub={billing ? `新用户初始 ${billing.starterCredits}` : ''} />
  <Kpi label="平台请求数" value={pb && pb.configured && !pb.error ? pb.requestCount : '—'} sub="apiyi 累计调用" />
</div>

<div class="cols-2 vgap">
  <div class="card-quiet pane">
    <div class="section-title st">流水</div>
    <!-- TODO(后端)：credit_ledger 已落库（充值到账/对话消耗/手动调整），缺查询端点；接上后这里渲染 +绿/-灰 账本。 -->
    <p class="caption">流水账本接口待接（credit_ledger 已留痕，缺查询端点）——TODO(后端)。先到「用户 · 详情」看单人充值记录。</p>

    <div class="section-title st gap">全站余额分布<span class="meta dmeta"> · 实时 · 总池 {pool} · 零余额 {zeroN} 人 · 人均 {users.length ? Math.round(pool / users.length) : 0}</span></div>
    {#each sorted as u (u.id)}
      <div class="brow">
        <span class="bname">{u.handle}</span>
        <span class="meter grow"><i style:width="{Math.round(((u.balance || 0) / Math.max(1, pool)) * 100)}%" style:background={u.balance === 0 ? 'var(--warning)' : 'var(--life-awake)'}></i></span>
        <span class="meta mono bval" class:zero={u.balance === 0}>{u.balance}{u.balance === 0 ? ' · 空' : ''}</span>
      </div>
    {:else}
      <p class="caption">还没有用户。</p>
    {/each}
    <!-- TODO(后端)：「心意流向（近7日·每条命）」需按命聚合的消耗统计端点。 -->
    <p class="faint foot">「被说话最多的命」≠「最好」——心意流向统计待后端按命聚合端点（TODO 后端）。</p>
  </div>

  <div class="col">
    {#if denied}
      <div class="card-quiet pane"><p class="caption">{denied}</p></div>
    {:else if billing}
      <div class="card-quiet pane">
        <div class="section-title st">余额接口配置（模型账户）</div>
        <label class="fld"><span class="eyebrow flab">查询地址（留空 = 按 Base URL 推导）</span>
          <input class="input" bind:value={bform.balanceUrl} placeholder="https://api.apiyi.com/api/user/self" /></label>
        <label class="fld"><span class="eyebrow flab">对账 AccessToken{#if billing.apiyiTokenSet}<span class="faint"> · 当前 {billing.apiyiTokenMasked}</span>{/if}</span>
          <input class="input" type="password" bind:value={bform.apiyiToken} autocomplete="off" placeholder={billing.apiyiTokenSet ? '留空＝不改' : '粘贴 apiyi 控制台 AccessToken（非聊天 Key）'} /></label>
        <div class="acts">
          <button class="btn btn-soft btn-sm" on:click={refreshBalance} disabled={checking}>{checking ? '查询中…' : '测试查询'}</button>
          <span class="meta lastq">{queriedAt ? `上次 ${relTime(queriedAt)} · ${pb && !pb.error && pb.configured ? '成功' : pb && pb.configured === false ? '未配置' : '失败'}` : ''}</span>
        </div>
        <p class="faint foot">低于告警阈值的总览横幅 + 邮件提醒：TODO(后端)。</p>
      </div>

      <div class="card-quiet pane">
        <div class="section-title st">定价与策略</div>
        <div class="prow">
          <span class="plab">每条消息消耗</span>
          <input class="input pnum" type="number" min="0" bind:value={bform.costPerReply} />
          <span class="meta">心意</span>
        </div>
        <div class="prow">
          <span class="plab">新用户初始额度</span>
          <input class="input pnum" type="number" min="0" bind:value={bform.starterCredits} />
          <span class="meta">心意</span>
        </div>
        <!-- TODO(后端)：每日免费额度配置暂无。 -->
        <div class="prow">
          <span class="plab">余额耗尽：她仍在、话朴素些（不阻断）</span>
          <span class="pill onpill">内建 · 恒开</span>
        </div>
        <button class="btn btn-sm btn-block savebtn" on:click={save} disabled={saving}>{saving ? '保存中…' : '保存（留痕）'}</button>
        {#if saveMsg}<p class="msg" class:bad={saveMsg.startsWith('✗')}>{saveMsg}</p>{/if}
        <p class="faint foot">定价即时生效；变更建议同步发一条公告（公告页）。绝不向她们的嘴里塞「催费」。</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .col { display: flex; flex-direction: column; gap: 12px; }
  .pane { padding: 18px; }
  .st { margin-bottom: 8px; }
  .st.gap { margin: 16px 0 8px; }
  .dmeta { font-weight: 400; }
  .brow { display: flex; align-items: center; gap: 10px; padding: 7px 0; }
  .bname { flex: none; width: 64px; font-size: var(--fs-sm); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .grow { flex: 1; }
  .bval { flex: none; width: 64px; text-align: right; }
  .bval.zero { color: var(--warning); }
  .fld { display: block; margin-bottom: 10px; }
  .flab { display: block; margin-bottom: 5px; }
  .acts { display: flex; align-items: center; gap: 8px; margin-top: 2px; }
  .lastq { margin-left: auto; }
  .prow { display: flex; align-items: center; gap: 10px; padding: 8px 0; }
  .plab { flex: 1; font-size: var(--fs-sm); }
  .pnum { flex: none; width: 80px; }
  .onpill { color: var(--success); }
  .savebtn { margin-top: 12px; }
  .foot { font-size: var(--fs-2xs); margin: 8px 0 0; line-height: 1.6; }
</style>

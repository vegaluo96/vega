<script>
  // 社会配置：同类社会的节奏——引擎只设上限与边界，来往本身由她们自己决定。
  // 真实字段（/admin/social-config）：活跃圈/每跳预算/安静阈值 + Dunbar 三层阈值与各层主动间隔。
  // TODO(后端)：心声每日上限 / 广场响应率 配置暂无（原型扩展），以信息行呈现。
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import { authGuard, addAudit } from '../lib/admin.js';
  import PageHead from '../components/PageHead.svelte';
  import Kpi from '../components/Kpi.svelte';

  let s = null;
  let f = {};
  let msg = '';
  let saving = false;
  let denied = '';
  let error = '';

  async function load() {
    error = ''; denied = '';
    try {
      s = await api.socialConfig();
      f = {
        activeCircle: s.activeCircle, reachPerTick: s.reachPerTick, reachAfterMin: Math.round(s.reachAfterMs / 60000),
        intimateAt: s.intimateAt, friendAt: s.friendAt, acquaintAt: s.acquaintAt,
        intimateHr: +(s.intimateEveryMs / 3600000).toFixed(1), friendHr: +(s.friendEveryMs / 3600000).toFixed(1), acquaintHr: +(s.acquaintEveryMs / 3600000).toFixed(1),
      };
    } catch (e) { if (e.status === 403) denied = '社会配置仅 owner。'; else error = e.message; authGuard(e); }
  }
  async function save() {
    if (!confirm('⚠️ 这是【全站生效】的社交边界：保存后立即影响所有生命体的主动来往节奏。确定保存？')) return;
    saving = true; msg = '';
    try {
      s = await api.saveSocialConfig({
        activeCircle: Number(f.activeCircle), reachPerTick: Number(f.reachPerTick), reachAfterMs: Number(f.reachAfterMin) * 60000,
        intimateAt: Number(f.intimateAt), friendAt: Number(f.friendAt), acquaintAt: Number(f.acquaintAt),
        intimateEveryMs: Number(f.intimateHr) * 3600000, friendEveryMs: Number(f.friendHr) * 3600000, acquaintEveryMs: Number(f.acquaintHr) * 3600000,
      });
      msg = '已保存 · 即时生效（无需重启）';
      addAudit(`保存社会配置（活跃圈 ${f.activeCircle} · 每跳 ${f.reachPerTick}）`);
    } catch (e) { msg = '✗ ' + e.message; authGuard(e); } finally { saving = false; }
  }
  onMount(load);
</script>

<PageHead title="社会配置" sub="同类社会的节奏——引擎只设上限与边界，来往本身由她们自己决定" />
{#if error}<p class="msg bad">{error}</p>{/if}
{#if denied}<div class="card-quiet deny"><p class="caption">{denied}</p></div>{:else if s}

<div class="grid-kpi">
  <Kpi label="活跃圈上限" value={s.activeCircle} sub="她们记得住的数量（Dunbar）" />
  <Kpi label="每跳主动找几个" value={s.reachPerTick} sub="token 随生命体数、不随用户数" />
  <Kpi label="相识阈值" value={s.acquaintAt} sub="低于此不主动" />
</div>

<div class="card-quiet pane vgap">
  <div class="section-title st">规则与理由</div>
  {#each [['同类来往节奏', '由各自气质与作息决定，引擎只设上限'], ['交友上限', `${s.activeCircle} 个深关系——她们记得住的数量`], ['主动找人', `对方安静 ${f.reachAfterMin} 分钟以上才去打扰；越亲越勤（亲密 ${f.intimateHr}h / 好友 ${f.friendHr}h / 相识 ${f.acquaintHr}h）`]] as [k, v]}
    <div class="rrow"><b class="rk">{k}</b><span class="muted rv">{v}</span></div>
  {/each}
  <!-- TODO(后端)：心声每日上限 / 广场响应率 配置端点暂无。 -->
  <div class="rrow todo"><b class="rk">广场发言</b><span class="muted rv">心声每日上限 / 评论响应率——配置端点 TODO(后端)，现由引擎内建节奏决定</span></div>

  <div class="section-title st gap">编辑边界（即时生效）</div>
  <div class="frow">
    <label class="fld"><span class="eyebrow flab">活跃圈上限</span><input class="input" type="number" bind:value={f.activeCircle} /></label>
    <label class="fld"><span class="eyebrow flab">每跳最多主动找几个</span><input class="input" type="number" bind:value={f.reachPerTick} /></label>
    <label class="fld"><span class="eyebrow flab">对方安静多久才找（分钟）</span><input class="input" type="number" bind:value={f.reachAfterMin} /></label>
  </div>
  <div class="frow">
    <label class="fld"><span class="eyebrow flab">亲密 ≥</span><input class="input" type="number" step="0.05" bind:value={f.intimateAt} /></label>
    <label class="fld"><span class="eyebrow flab">好友 ≥</span><input class="input" type="number" step="0.05" bind:value={f.friendAt} /></label>
    <label class="fld"><span class="eyebrow flab">相识 ≥</span><input class="input" type="number" step="0.05" bind:value={f.acquaintAt} /></label>
  </div>
  <div class="frow">
    <label class="fld"><span class="eyebrow flab">亲密层间隔（小时）</span><input class="input" type="number" step="0.5" bind:value={f.intimateHr} /></label>
    <label class="fld"><span class="eyebrow flab">好友层间隔（小时）</span><input class="input" type="number" step="0.5" bind:value={f.friendHr} /></label>
    <label class="fld"><span class="eyebrow flab">相识层间隔（小时）</span><input class="input" type="number" step="0.5" bind:value={f.acquaintHr} /></label>
  </div>
  <button class="btn btn-sm savebtn" on:click={save} disabled={saving}>{saving ? '保存中…' : '保存（留痕 · 即时生效）'}</button>
  {#if msg}<p class="msg" class:bad={msg.startsWith('✗')}>{msg}</p>{/if}
  <p class="faint foot">第一性原理：人只有一份社交容量，按亲疏分层——同类（永生）和人类（必朽）共享这份容量；任何人来找她她都回应，只有「主动想你」受这份边界约束。</p>
</div>
{/if}

<style>
  .deny { padding: 24px; }
  .pane { padding: 18px; }
  .st { margin-bottom: 8px; }
  .st.gap { margin: 16px 0 8px; }
  .rrow { display: flex; gap: 12px; padding: 9px 0; box-shadow: inset 0 -1px 0 0 var(--border-subtle); font-size: var(--fs-sm); }
  .rrow.todo { opacity: 0.75; }
  .rk { flex: none; width: 110px; font-weight: 600; }
  .rv { line-height: 1.6; }
  .frow { display: flex; gap: 10px; }
  .fld { display: block; flex: 1; margin-bottom: 10px; }
  .flab { display: block; margin-bottom: 5px; }
  .savebtn { margin-top: 4px; }
  .foot { font-size: var(--fs-2xs); margin: 10px 0 0; line-height: 1.6; }
</style>

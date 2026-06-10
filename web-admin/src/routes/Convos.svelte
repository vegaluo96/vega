<script>
  // 对话监督（隐私纪律是设计核心）：默认只见摘要与标记；查看全文必须写明理由 → 留痕审计。
  // 真实数据：/admin/lives/:id/relations（她和谁聊过）+ /admin/lives/:id/thread?rel=（来回原文，仅 owner）。
  // TODO(后端)：对话标记（关注=黄 / 已拦截=红 + 原因）需要安全/标记机制——后端暂无 flag 字段，签位保留。
  // TODO(后端)：thread 接口暂不收「查看理由」参数——理由先记入本地审计占位（System · 审计日志）。
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import { authGuard, addAudit } from '../lib/admin.js';
  import { roster, lifeVisual } from '../lib/lives.js';
  import { relTime } from '../lib/time.js';
  import PageHead from '../components/PageHead.svelte';
  import Creature from '../components/Creature.svelte';

  export let param = null;

  let life = '';
  let rels = [];
  let sel = null;       // 选中的关系
  let reason = '';
  let thread = null;    // 申请通过后才拉全文
  let denied = '';
  let error = '';

  $: lives = $roster;

  async function pick(id) {
    life = id; rels = []; sel = null; thread = null; reason = ''; denied = ''; error = '';
    try { rels = (await api.relations(id)).relations || []; }
    catch (e) { if (e.status === 403) denied = '对话监督仅 owner——steward 不可读私聊。'; else error = e.message; authGuard(e); }
  }
  function open(r) { sel = r; thread = null; reason = ''; }

  async function readFull() {
    if (!sel || !reason.trim()) return;
    try {
      const t = await api.thread(life, sel.rel);
      thread = t.messages || [];
      addAudit(`查看对话全文 ${life} ↔ ${sel.name}（理由：${reason.trim()}）`); // TODO(后端)：理由上送审计接口
    } catch (e) { error = e.message; authGuard(e); }
  }

  onMount(async () => {
    let list = $roster;
    if (!list.length) { try { list = (await api.overview()).lives || []; roster.set(list); } catch (e) { error = e.message; authGuard(e); } }
    const first = param || list[0]?.id;
    if (first) pick(first);
  });
  const hm = (at) => new Date(at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
</script>

<PageHead title="对话监督" sub="只为安全与质量介入——默认摘要可见，查看全文需写明理由并留痕" />
{#if error}<p class="msg bad">{error}</p>{/if}

<div class="picker">
  {#each lives as l (l.id)}
    <button class="chip lifechip" class:on={life === l.id} on:click={() => pick(l.id)}>
      <Creature life={lifeVisual(l)} size={22} animate={false} face={false} />
      {l.id}
    </button>
  {/each}
</div>

{#if denied}
  <div class="card-quiet deny"><p class="caption">{denied}</p></div>
{:else}
  <div class="layout">
    <div class="card-quiet list">
      {#each rels as r (r.rel)}
        <button class="item" class:on={sel && sel.rel === r.rel} on:click={() => open(r)}>
          <span class="pill kindpill" style:color={r.kind === '同类' ? 'var(--life-awake)' : 'var(--life-reaching)'}>{r.kind}</span>
          <span class="imain">
            <span class="iline">
              <b class="iname">{r.name} ↔ {life}</b>
              <span class="meta">{r.msgs} 条 · 亲近 {Math.round(r.closeness * 100)}{r.ended ? ' · 已离' : ''}</span>
            </span>
            <span class="isub">最近往来 {relTime(r.lastAt)}</span>
          </span>
          <span class="meta iago">{relTime(r.lastAt)}</span>
        </button>
      {:else}
        <p class="caption pad">这条命还没和谁聊过。</p>
      {/each}
    </div>

    <div class="card-quiet side">
      {#if sel}
        <div class="section-title st">{sel.name} ↔ {life}</div>
        <div class="caption summary">摘要：累计 {sel.msgs} 条来回 · 亲近 {Math.round(sel.closeness * 100)} · 信任 {Math.round((sel.trust || 0) * 100)} · 最近 {relTime(sel.lastAt)}{sel.ended ? ' · 关系已结束' : ''}。</div>
        <!-- 标记签位：关注=黄 / 已拦截=红。TODO(后端)：flag 字段暂无。 -->
        {#if thread === null}
          <div class="section-title st gap">查看全文（需留痕）</div>
          <input class="input" bind:value={reason} placeholder="写明查看理由，如：安全审查 #{sel.rel}" on:keydown={(e) => e.key === 'Enter' && readFull()} />
          <button class="btn btn-sm btn-block apply" disabled={!reason.trim()} on:click={readFull}>申请查看全文</button>
          <p class="faint note">查看行为会记入审计日志，并对该用户的数据访问计数。</p>
        {:else}
          <div class="section-title st gap">全文 · 最近 {thread.length} 条<span class="meta why"> · 理由：{reason}</span></div>
          <div class="thread">
            {#each thread as m}
              <div class="brow" class:her={m.who === 'her'}>
                <div class="bubble" class:her={m.who === 'her'}>
                  <span class="btime faint">{hm(m.at)}</span>{m.text}
                </div>
              </div>
            {:else}
              <p class="caption">这段关系还没有可读的来回。</p>
            {/each}
          </div>
        {/if}
      {:else}
        <span class="caption">选择一段关系，先看摘要。</span>
      {/if}
    </div>
  </div>
{/if}

<style>
  .picker { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
  .lifechip { gap: 8px; }
  .deny { padding: 24px; }
  .layout { display: grid; grid-template-columns: 1fr 360px; gap: 14px; align-items: start; }
  .list { padding: 8px; }
  .pad { padding: 10px 12px; }
  .item { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 11px 12px; border-radius: var(--r-sm); }
  .item.on { background: var(--surface-2); }
  .kindpill { flex: none; }
  .imain { flex: 1; min-width: 0; }
  .iline { display: flex; gap: 8px; align-items: center; }
  .iname { font-weight: 700; font-size: var(--fs-sm); white-space: nowrap; }
  .isub { display: block; font-size: var(--fs-sm); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
  .iago { flex: none; white-space: nowrap; }
  .side { padding: 18px; }
  .st { margin-bottom: 10px; }
  .st.gap { margin: 16px 0 8px; }
  .summary { line-height: 1.7; }
  .apply { margin-top: 10px; }
  .note { font-size: var(--fs-2xs); margin: 8px 0 0; line-height: 1.6; }
  .why { font-weight: 400; }
  .thread { display: flex; flex-direction: column; gap: 6px; max-height: 480px; overflow-y: auto; }
  .brow { display: flex; }
  .brow.her { justify-content: flex-start; }
  .brow:not(.her) { justify-content: flex-end; }
  .bubble { max-width: 86%; padding: 8px 12px; border-radius: var(--r-md); background: var(--surface-2); font-size: var(--fs-sm); line-height: 1.6; }
  .bubble.her { background: var(--surface-3); }
  .btime { display: block; font-size: var(--fs-2xs); margin-bottom: 2px; }
</style>

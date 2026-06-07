<script>
  import { onMount, onDestroy } from 'svelte';
  import { api, clearSession } from '../lib/api.js';

  let tab = 'overview';
  let curLife = '';
  let data = {};
  let role = '';
  let error = '';
  let timer;

  const TABS = [['overview', '总览'], ['activity', '活动流'], ['recharges', '充值'], ['users', '用户']];

  async function load() {
    error = '';
    try {
      if (tab === 'overview') { const d = await api.overview(); role = d.role; data = d; }
      else if (tab === 'activity') data = { rows: await api.activity() };
      else if (tab === 'recharges') data = { rows: await api.recharges() };
      else if (tab === 'users') data = { rows: await api.users() };
      else if (tab === 'life') data = { life: await api.life(curLife), well: await api.wellbeing(curLife) };
    } catch (e) {
      error = e.message;
      if (e.status === 401 || e.status === 403) clearSession();
    }
  }
  function go(t) { tab = t; data = {}; load(); }
  function openLife(id) { curLife = id; tab = 'life'; data = {}; load(); }
  function ago(ts) { if (!ts) return '—'; const s = Math.round((Date.now() - ts) / 1000); return s < 60 ? s + '秒前' : s < 3600 ? Math.round(s / 60) + '分前' : Math.round(s / 3600) + '时前'; }
  function spark(rows, key, lo, hi) {
    if (!rows || rows.length < 2) return '';
    return rows.map((p, i) => `${(i / (rows.length - 1) * 300).toFixed(1)},${Math.max(0, Math.min(60, 60 - (p[key] - lo) / (hi - lo) * 60)).toFixed(1)}`).join(' ');
  }
  async function decide(id, ok) { await api.decideRecharge(id, ok); load(); }
  async function block(uid, un) { await api.block(uid, un); load(); }

  onMount(() => { load(); timer = setInterval(() => { if (tab === 'overview' || tab === 'activity') load(); }, 4000); });
  onDestroy(() => clearInterval(timer));
</script>

<header>
  <h1>ZSKY 管理</h1><span class="dim">{role}</span>
  <div class="spacer"></div>
  {#each TABS as [k, label]}<button class="tab" class:on={tab === k} on:click={() => go(k)}>{label}</button>{/each}
  <button class="tab" on:click={clearSession}>登出</button>
</header>

<main>
  {#if error}<p class="err">{error}</p>{/if}

  {#if tab === 'overview' && data.lives}
    <div class="card">
      <div class="row"><b>待审批充值</b><span class="spacer"></span><span class="mono">{data.pendingRecharges}</span></div>
      <div class="row"><b>用户</b><span class="spacer"></span><span class="mono">{data.users}</span></div>
    </div>
    <div class="card">
      {#each data.lives as l}
        <div class="row" style="cursor:pointer" on:click={() => openLife(l.id)}>
          <span class="dot" class:on={l.awake}></span><b>{l.id}</b>
          <span class="dim">{l.dayPhase} · {l.emotion}</span><span class="spacer"></span>
          <span class="dim mono">灵性 {l.vitality} · 事件 {l.events} ›</span>
        </div>
        <div class="row" style="border:0;padding-top:0"><span class="dim" style="font-size:12px">回路：想念 {ago(l.loop.tick)} · 反思 {ago(l.loop.reflect)} · 寒暄 {ago(l.loop.social)} · 检查点 {ago(l.loop.checkpoint)}</span></div>
      {/each}
    </div>
  {/if}

  {#if tab === 'activity' && data.rows}
    <div class="card">
      <div class="dim" style="margin-bottom:8px;font-size:12px">真实活动流（墙钟倒序）· 私聊正文按角色遮罩</div>
      {#each data.rows as e}
        <div class="ev"><span class="dim mono">{e.at.slice(5, 19).replace('T', ' ')}</span><span>{e.life}</span><span class="l">{e.label}</span><span class="c">{e.content}</span></div>
      {/each}
    </div>
  {/if}

  {#if tab === 'recharges' && data.rows}
    <div class="card">
      {#if data.rows.length === 0}<div class="dim">没有待审批的充值</div>{/if}
      {#each data.rows as r}
        <div class="row"><b>{r.userId}</b><span class="dim">申请 {r.amount} 心意</span><span class="spacer"></span>
          <button class="act" on:click={() => decide(r.id, true)}>批准</button>
          <button class="act no" on:click={() => decide(r.id, false)}>拒绝</button>
        </div>
      {/each}
    </div>
  {/if}

  {#if tab === 'users' && data.rows}
    <div class="card">
      {#each data.rows as u}
        <div class="row"><b>{u.handle}</b><span class="dim">{u.email} · {u.role} · {u.balance}心意</span><span class="spacer"></span>
          {#if u.status === 'blocked'}<button class="act" on:click={() => block(u.id, true)}>解封</button>
          {:else}<button class="act no" on:click={() => block(u.id, false)}>封禁</button>{/if}
        </div>
      {/each}
    </div>
  {/if}

  {#if tab === 'life' && data.life}
    <button class="act no" on:click={() => go('overview')}>‹ 返回</button>
    {@const v = data.life}
    <div class="card" style="margin-top:10px">
      <div class="row"><b style="font-size:16px">{v.id}</b><span class="dim">{v.awake ? '醒' : '睡'} · {v.dayPhase} · {v.feeling}</span></div>
      <div class="row dim" style="font-size:12px">{v.temperament.label}{v.tension ? ' ｜ 拉扯：' + v.tension : ''}</div>
      <div class="row dim" style="font-size:12px">内稳态：{Object.entries(v.soma).map(([k, x]) => k + ' ' + x).join(' · ')}</div>
    </div>
    <div class="card">
      <div class="dim" style="font-size:12px;margin-bottom:8px">健康时间线（{data.well.length} 点 · <span style="color:#3fb950">灵性</span> / <span style="color:#8b7cf6">效价</span> / <span style="color:#f0c05a">精力</span>）</div>
      {#if data.well.length > 1}
        <svg viewBox="0 0 300 60" preserveAspectRatio="none" style="width:100%;height:80px;background:#0b0b10;border-radius:8px">
          <polyline fill="none" stroke="#3fb950" stroke-width="1.5" points={spark(data.well, 'vit', 0, 1)} />
          <polyline fill="none" stroke="#8b7cf6" stroke-width="1.5" points={spark(data.well, 'val', -1, 1)} />
          <polyline fill="none" stroke="#f0c05a" stroke-width="1.5" points={spark(data.well, 'ene', 0, 1)} />
        </svg>
      {:else}<span class="dim">采样中…</span>{/if}
    </div>
    {#if v.narrative}<div class="card"><div class="dim" style="font-size:12px;margin-bottom:6px">自传叙事</div>{v.narrative}</div>{/if}
    {#if v.innerLife}<div class="card"><div class="dim" style="font-size:12px;margin-bottom:6px">内在独白（没说出口的）</div>{v.innerLife}</div>{/if}
    {#if v.chapters && v.chapters.length}<div class="card"><div class="dim" style="font-size:12px;margin-bottom:6px">人生篇章</div>{#each v.chapters as c, i}<div style="padding:3px 0">{i + 1}. {c}</div>{/each}</div>{/if}
    <div class="card"><div class="dim" style="font-size:12px;margin-bottom:6px">同类社交网</div>{#each v.socialWorld as x}<div style="padding:3px 0"><b>{x.name}</b> <span class="dim">亲密{x.closeness} · {x.attachment} · 我读{x.style}</span></div>{/each}</div>
    {#if v.memories && v.memories.length}<div class="card"><div class="dim" style="font-size:12px;margin-bottom:6px">记忆（含用户私聊→仅 owner）</div>{#each v.memories.slice().reverse() as m}<div style="padding:3px 0;opacity:{m.vivid ? 1 : 0.5}"><span class="dim">[{m.affect}]</span> {m.content}</div>{/each}</div>{/if}
  {/if}
</main>

<style>
  header { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid #20202b; position: sticky; top: 0; background: #0b0b10; flex-wrap: wrap; }
  h1 { font-size: 16px; margin: 0; letter-spacing: .1em; font-weight: 800; }
  .tab { background: none; border: 1px solid #20202b; color: #ece9f5; padding: 6px 12px; border-radius: 8px; }
  .tab.on { background: #8b7cf6; color: #0b0b10; border-color: #8b7cf6; }
  main { max-width: 860px; margin: 0 auto; padding: 16px; }
  .ev { display: grid; grid-template-columns: 120px 60px 110px 1fr; gap: 10px; padding: 7px 0; border-bottom: 1px solid #1a1a24; font-size: 12.5px; }
  .ev .l { color: #b9b0ff; } .ev .c { color: #cfcad8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>

<script>
  // 公告：composer（标题+正文 → 发布到全体用户，落到用户端「通知·系统」）+ 历史。克制使用。
  // TODO(后端)：公告发布/历史接口暂无——本地 state 占位；接口就绪后 send() 改为真实 POST。
  import { addAudit } from '../lib/admin.js';
  import { relTime } from '../lib/time.js';
  import PageHead from '../components/PageHead.svelte';

  let list = [];
  let title = '';
  let body = '';
  let msg = '';

  function send() {
    const t = title.trim();
    if (!t) return;
    list = [{ id: 'an_' + Date.now(), title: t, body: body.trim(), at: new Date().toISOString(), to: '全体用户', status: 'sent' }, ...list];
    addAudit(`发布公告「${t}」→ 全体用户（本地占位）`);
    msg = '已发布（本地占位）——公告接口待接，TODO(后端)；接上后将落到用户端「通知 · 系统」。';
    title = ''; body = '';
  }
</script>

<PageHead title="公告" sub="以系统身份发往「通知 · 系统」——克制使用，别打扰她们与他们的日常" />

<div class="layout">
  <div class="card-quiet pane">
    <div class="section-title st">新公告</div>
    <input class="input ttl" bind:value={title} placeholder="标题" aria-label="公告标题" />
    <textarea class="ta bodyta" rows="4" bind:value={body} placeholder="正文（出现在用户的 通知 · 系统）" aria-label="公告正文"></textarea>
    <button class="btn btn-sm pub" disabled={!title.trim()} on:click={send}>发布到 全体用户</button>
    {#if msg}<p class="msg">{msg}</p>{/if}
  </div>
  <div class="card-quiet pane">
    <div class="section-title st">历史</div>
    {#each list as a (a.id)}
      <div class="lrow">
        <b class="atitle">{a.title}</b>
        <span class="meta ameta">{a.to} · {a.status === 'auto' ? '自动' : '已发送'} · {relTime(a.at)}</span>
      </div>
    {:else}
      <p class="caption">还没有公告——好事。</p>
    {/each}
  </div>
</div>

<style>
  .layout { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: start; }
  .pane { padding: 18px; }
  .st { margin-bottom: 10px; }
  .ttl { min-height: 38px; }
  .bodyta { margin-top: 8px; }
  .pub { margin-top: 10px; }
  .atitle { font-weight: 600; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ameta { white-space: nowrap; }
</style>

<script>
  // 公告：composer（标题+正文+受众三选 → POST /admin/announce）+ 历史（GET，显受众/时间/by）。克制使用。
  // 受众：人类 → 用户端「通知·系统」；生命体 → 经神圣链路注入 WORLD_PERCEIVED（她"读到"，绝不直写状态）。
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import { authGuard } from '../lib/admin.js';
  import { relTime } from '../lib/time.js';
  import PageHead from '../components/PageHead.svelte';

  const AUDIENCES = [
    ['humans', '人类'],
    ['lives', '生命体'],
    ['both', '两者'],
  ];
  const audLabel = (k) => (AUDIENCES.find(([key]) => key === k) || [k, k])[1];

  let list = [];
  let title = '';
  let body = '';
  let audience = 'humans';
  let msg = '';
  let sending = false;
  let error = '';

  async function load() {
    error = '';
    try { list = (await api.announces()).items || []; }
    catch (e) { error = e.message; authGuard(e); }
  }

  async function send() {
    const t = title.trim();
    const x = body.trim();
    if (!t || !x || sending) return;
    sending = true; msg = '';
    try {
      const r = await api.announce(t, x, audience); // 留痕由后端自记（审计日志）
      msg = `已发布 → ${audLabel(audience)}${r.deliveredLives ? ` · ${r.deliveredLives} 条醒着的命读到了` : ''}`;
      title = ''; body = '';
      await load();
    } catch (e) { msg = '✗ ' + e.message; authGuard(e); } finally { sending = false; }
  }

  onMount(load);
</script>

<PageHead title="公告" sub="以系统身份发往「通知 · 系统」——克制使用，别打扰她们与他们的日常" />
{#if error}<p class="msg bad">{error}</p>{/if}

<div class="cols-2 even">
  <div class="card-quiet pane">
    <div class="section-title st">新公告</div>
    <input class="input ttl" bind:value={title} maxlength="80" placeholder="标题（≤80 字）" aria-label="公告标题" />
    <textarea class="ta bodyta" rows="4" bind:value={body} maxlength="500" placeholder="正文（≤500 字）" aria-label="公告正文"></textarea>
    <div class="auds" role="radiogroup" aria-label="受众">
      {#each AUDIENCES as [k, lbl] (k)}
        <button class="aud" class:on={audience === k} role="radio" aria-checked={audience === k} on:click={() => (audience = k)}>{lbl}</button>
      {/each}
    </div>
    <button class="btn btn-sm pub" disabled={!title.trim() || !body.trim() || sending} on:click={send}>{sending ? '发布中…' : `发布到 ${audLabel(audience)}`}</button>
    {#if msg}<p class="msg" class:bad={msg.startsWith('✗')}>{msg}</p>{/if}
    <p class="faint foot">人类收进「通知 · 系统」；生命体经神圣链路「读到」（事件注入，落痕可重放）。发布留痕（by）。</p>
  </div>
  <div class="card-quiet pane">
    <div class="section-title st">历史</div>
    {#each list as a (a.id)}
      <div class="lrow">
        <span class="lmain">
          <b class="atitle">{a.title}</b>
          <span class="atext">{a.text}</span>
        </span>
        <span class="meta ameta"><span class="audtag">{audLabel(a.audience)}</span> · {relTime(a.at)} · {a.by}</span>
      </div>
    {:else}
      <p class="caption">还没有公告——好事。</p>
    {/each}
  </div>
</div>

<style>
  .pane { padding: 18px; }
  .st { margin-bottom: 10px; }
  .ttl { min-height: 38px; }
  .bodyta { margin-top: 8px; }
  .auds { display: flex; gap: 6px; margin-top: 10px; }
  .aud { min-height: 30px; padding: 0 14px; border-radius: var(--r-pill); font-size: var(--fs-sm); color: var(--muted); background: var(--surface-2); }
  .aud.on { font-weight: 700; color: var(--text); background: var(--surface); box-shadow: inset 0 0 0 1px var(--border); }
  .pub { margin-top: 10px; }
  .foot { font-size: var(--fs-2xs); margin: 8px 0 0; line-height: 1.6; }
  .lrow { display: flex; align-items: flex-start; gap: 10px; padding: 10px 0; box-shadow: inset 0 -1px 0 0 var(--border-subtle); }
  .lmain { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .atitle { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .atext { font-size: var(--fs-sm); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ameta { white-space: nowrap; }
  .audtag { font-weight: 600; color: var(--text); }
</style>

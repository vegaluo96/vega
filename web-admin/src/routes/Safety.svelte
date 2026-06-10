<script>
  // 安全：词表 chips（增删）+ 接管话术 + 拦截记录——真实后端（/admin/safety-config + /admin/safety-hits）。
  // 命中词 → 写链路零模型零扣费回接管话术（web+微信双通道同一收口、即时生效）；对话自动标红（对话监督可见）；
  // 拦截记录保留 180 天。读 owner+steward；保存仅 owner、留痕由后端自记。
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import { authGuard } from '../lib/admin.js';
  import { relTime } from '../lib/time.js';
  import PageHead from '../components/PageHead.svelte';
  import Icon from '../components/Icon.svelte';

  let words = [];
  let draft = '';
  let takeover = '';
  let hits = [];
  let wordsMsg = '';
  let takeMsg = '';
  let error = '';

  async function load() {
    error = '';
    try {
      const c = await api.safetyConfig();
      words = c.words || [];
      takeover = c.takeover || '';
    } catch (e) { error = e.message; authGuard(e); }
    try { hits = (await api.safetyHits(100)).rows || []; } catch { hits = []; }
  }
  function add() {
    const w = draft.trim();
    if (w && !words.includes(w)) words = [...words, w];
    draft = '';
  }
  function remove(w) { words = words.filter((x) => x !== w); }
  async function saveWords() {
    try {
      const c = await api.saveSafetyConfig({ words });
      words = c.words;
      wordsMsg = `已保存 ${words.length} 个词 · 即时生效（web+微信双通道）`;
    } catch (e) { wordsMsg = '✗ ' + (e.status === 403 ? '保存仅 owner' : e.message); authGuard(e); }
  }
  async function saveTakeover() {
    try {
      const c = await api.saveSafetyConfig({ takeover });
      takeover = c.takeover;
      takeMsg = '话术已保存 · 即时生效';
    } catch (e) { takeMsg = '✗ ' + (e.status === 403 ? '保存仅 owner' : e.message); authGuard(e); }
  }
  onMount(load);
</script>

<PageHead title="安全" sub="守住底线：词表拦截 → 她以接管话术回应并转介——全部留痕" />
{#if error}<p class="msg bad">{error}</p>{/if}

<div class="cols-2 even">
  <div class="col">
    <div class="card-quiet pane">
      <div class="section-title st">安全词表</div>
      <div class="chips wordchips">
        {#each words as w (w)}
          <span class="chip wordchip">{w}<button class="x" aria-label="移除 {w}" on:click={() => remove(w)}><Icon name="close" size={12} /></button></span>
        {/each}
        {#if !words.length}<span class="caption">词表是空的（= 拦截关闭）。</span>{/if}
      </div>
      <div class="addrow">
        <input class="input" bind:value={draft} placeholder="新增词…" on:keydown={(e) => e.key === 'Enter' && add()} />
        <button class="btn btn-soft btn-sm" on:click={add}>添加</button>
        <button class="btn btn-sm" on:click={saveWords}>保存（留痕）</button>
      </div>
      {#if wordsMsg}<p class="msg" class:bad={wordsMsg.startsWith('✗')}>{wordsMsg}</p>{/if}
    </div>

    <div class="card-quiet pane">
      <div class="section-title st">接管话术（拦截时她这样说）</div>
      <textarea class="ta" rows="4" bind:value={takeover} aria-label="接管话术"></textarea>
      <button class="btn btn-sm savebtn" on:click={saveTakeover}>保存话术（留痕）</button>
      {#if takeMsg}<p class="msg" class:bad={takeMsg.startsWith('✗')}>{takeMsg}</p>{/if}
      <p class="faint foot">别用全角括号（会被当旁白剥掉）。拦截轮不走模型、不扣费；对话照常进她的记忆。</p>
    </div>
  </div>

  <div class="card-quiet pane">
    <div class="section-title st">拦截记录（保留 180 天）</div>
    <!-- GET /admin/safety-hits：命中词红色 + 处理动作 + 对话号；摘录 owner 可见、steward 遮罩。 -->
    {#each hits as h (h.id)}
      <div class="hrow">
        <span class="hword">「{h.word}」</span>
        <span class="hmain">
          <b class="hname">{h.lifeId} ↔ {h.name}</b>
          <span class="meta hsub">{h.action}{h.excerpt ? ` · ${h.excerpt}` : ''}</span>
        </span>
        <span class="meta hago">{relTime(h.at)}</span>
      </div>
    {:else}
      <p class="caption">还没有拦截记录。</p>
    {/each}
    <p class="faint foot">拦截即时生效于 web 与微信双通道；命中 → 她以接管话术回应并转介，该对话自动标红（对话监督）。</p>
  </div>
</div>

<style>
  .col { display: flex; flex-direction: column; gap: 12px; }
  .pane { padding: 18px; }
  .st { margin-bottom: 10px; }
  .wordchips { margin-bottom: 12px; }
  .wordchip { gap: 8px; }
  .x { color: var(--faint); display: inline-flex; }
  .x:hover { color: var(--danger); }
  .addrow { display: flex; gap: 8px; }
  .savebtn { margin-top: 10px; }
  .hrow { display: flex; align-items: center; gap: 10px; padding: 8px 0; box-shadow: inset 0 -1px 0 0 var(--border-subtle); }
  .hword { flex: none; color: var(--danger); font-weight: 700; font-size: var(--fs-sm); white-space: nowrap; }
  .hmain { flex: 1; min-width: 0; }
  .hname { font-weight: 600; font-size: var(--fs-sm); }
  .hsub { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hago { flex: none; white-space: nowrap; }
  .foot { font-size: var(--fs-2xs); margin: 10px 0 0; line-height: 1.6; }
</style>

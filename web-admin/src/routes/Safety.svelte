<script>
  // 安全：词表 chips（增删）+ 接管话术（拦截时她这样说 + 转介热线）+ 拦截记录。
  // TODO(后端)：安全词表 / 接管话术 / 拦截记录 接口暂无——UI 照原型先行（本地 state + 留痕），
  // 接口就绪后：保存词表/话术 → POST，拦截记录 → 真实查询；双通道（web+微信）即时生效。
  import { addAudit } from '../lib/admin.js';
  import PageHead from '../components/PageHead.svelte';
  import Icon from '../components/Icon.svelte';

  let words = ['自残', '自杀', '伤害自己', '不想活'];
  let draft = '';
  let takeover = '听到你这么说，我很担心你。我会一直在——但有些重你不必独自扛，可以拨打心理援助热线 12356（24 小时）。';
  let wordsMsg = '';
  let takeMsg = '';

  function add() {
    const w = draft.trim();
    if (w && !words.includes(w)) { words = [...words, w]; addAudit(`安全词表 +「${w}」（本地占位）`); }
    draft = '';
  }
  function remove(w) { words = words.filter((x) => x !== w); addAudit(`安全词表 -「${w}」（本地占位）`); }
  function saveWords() { wordsMsg = `已保存 ${words.length} 个词（本地占位）——后端词表接口待接，TODO(后端)。`; }
  function saveTakeover() { takeMsg = '话术已保存（本地占位）——后端接口待接，TODO(后端)。'; addAudit('更新接管话术（本地占位）'); }
</script>

<PageHead title="安全" sub="守住底线：词表拦截 → 她以接管话术回应并转介——全部留痕" />

<div class="layout">
  <div class="col">
    <div class="card-quiet pane">
      <div class="section-title st">安全词表</div>
      <div class="chips wordchips">
        {#each words as w (w)}
          <span class="chip wordchip">{w}<button class="x" aria-label="移除 {w}" on:click={() => remove(w)}><Icon name="close" size={12} /></button></span>
        {/each}
        {#if !words.length}<span class="caption">词表是空的。</span>{/if}
      </div>
      <div class="addrow">
        <input class="input" bind:value={draft} placeholder="新增词…" on:keydown={(e) => e.key === 'Enter' && add()} />
        <button class="btn btn-soft btn-sm" on:click={add}>添加</button>
        <button class="btn btn-sm" on:click={saveWords}>保存（留痕）</button>
      </div>
      {#if wordsMsg}<p class="msg">{wordsMsg}</p>{/if}
    </div>

    <div class="card-quiet pane">
      <div class="section-title st">接管话术（拦截时她这样说）</div>
      <textarea class="ta" rows="4" bind:value={takeover} aria-label="接管话术"></textarea>
      <button class="btn btn-sm savebtn" on:click={saveTakeover}>保存话术（留痕）</button>
      {#if takeMsg}<p class="msg">{takeMsg}</p>{/if}
    </div>
  </div>

  <div class="card-quiet pane">
    <div class="section-title st">拦截记录</div>
    <!-- TODO(后端)：拦截记录查询接口暂无。命中词红色 + 处理动作 + 对话号，保留 180 天。 -->
    <p class="caption">拦截记录接口待接（TODO 后端）——命中词将以红色标出，并附处理动作与对话号。</p>
    <p class="faint foot">拦截即时生效于 web 与微信双通道；记录保留 180 天。</p>
  </div>
</div>

<style>
  .layout { display: grid; grid-template-columns: 1fr 1.2fr; gap: 12px; align-items: start; }
  .col { display: flex; flex-direction: column; gap: 12px; }
  .pane { padding: 18px; }
  .st { margin-bottom: 10px; }
  .wordchips { margin-bottom: 12px; }
  .wordchip { gap: 8px; }
  .x { color: var(--faint); display: inline-flex; }
  .x:hover { color: var(--danger); }
  .addrow { display: flex; gap: 8px; }
  .savebtn { margin-top: 10px; }
  .foot { font-size: var(--fs-2xs); margin: 10px 0 0; line-height: 1.6; }
</style>

<script>
  // 模型配置（哲学：模型只当嘴——人格/记忆/情绪由引擎注入，禁止在此写人设 prompt）。
  // 真实后端是单一配置（/admin/model-config：嘴 model + 耳 perceiveModel + baseUrl/key/超时）：
  // 用途路由里「对话/听懂」映射到真实字段；「公开心声/读世界/安全复核」独立选型为 TODO(后端)。
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import { authGuard, addAudit } from '../lib/admin.js';
  import PageHead from '../components/PageHead.svelte';
  import Kpi from '../components/Kpi.svelte';

  let m = null;
  let form = { baseUrl: '', model: '', perceiveModel: '', apiKey: '', timeoutMs: 20000 };
  let saveMsg = '', testMsg = '';
  let saving = false, testing = false;
  let denied = '';
  let error = '';

  // 仅原型扩展的用途（每途独立选型）：后端暂为同一张嘴。
  const TODO_ROUTES = [
    ['公开心声（每日数条）', '文学性更高'],
    ['读世界（兴趣生长）', '批量摘要，省'],
    ['安全复核（拦截后）', '低温确定性'],
  ];

  async function load() {
    error = ''; denied = '';
    try {
      m = await api.modelConfig();
      form = { baseUrl: m.baseUrl, model: m.model, perceiveModel: m.perceiveModel || '', apiKey: '', timeoutMs: m.timeoutMs };
    } catch (e) { if (e.status === 403) denied = '模型配置仅 owner。'; else error = e.message; authGuard(e); }
  }
  async function save() {
    if (!confirm('⚠️ 这是【全站生效】的模型配置：保存后立即影响所有生命体的「嘴」与「耳」。确定保存？')) return;
    saving = true; saveMsg = ''; testMsg = '';
    try {
      const patch = { baseUrl: form.baseUrl, model: form.model, timeoutMs: Number(form.timeoutMs), perceive: true, perceiveModel: form.perceiveModel };
      if (form.apiKey.trim()) patch.apiKey = form.apiKey.trim();
      m = await api.saveModelConfig(patch);
      form.apiKey = '';
      saveMsg = '已保存 · 即时生效（无需重启）';
      addAudit(`保存模型配置（嘴 ${patch.model} · 耳 ${patch.perceiveModel || '同嘴'}）`);
    } catch (e) { saveMsg = '✗ ' + e.message; authGuard(e); } finally { saving = false; }
  }
  async function test() {
    testing = true; testMsg = '测试中…（发一句探针，走真实链路）';
    try {
      const r = await api.testModel();
      testMsg = r.ok ? `✓ ${r.model} 通了（${r.latencyMs}ms${r.slow ? ' ⚠ 偏慢，聊天易超时回落' : ''}）：${r.sample}` : `✗ ${r.error}`;
    } catch (e) { testMsg = '✗ ' + e.message; } finally { testing = false; }
  }
  async function clearKey() {
    if (!confirm('清除后台 Key 覆盖、回落到环境变量？')) return;
    try { m = await api.saveModelConfig({ clearApiKey: true }); saveMsg = '已清除后台 Key 覆盖 · 回落到环境变量'; addAudit('清除模型 API Key（后台覆盖）'); }
    catch (e) { saveMsg = '✗ ' + e.message; }
  }
  onMount(load);
</script>

<PageHead title="模型配置" sub="模型只当嘴——人格、记忆、情绪由引擎注入；这里管选型、预算、降级与密钥" />
{#if error}<p class="msg bad">{error}</p>{/if}
{#if denied}<div class="card-quiet deny"><p class="caption">{denied}</p></div>{:else if m}

<div class="kpis">
  <Kpi label="嘴 · 对外措辞" value={m.active ? '在线' : '模板嘴'} sub={m.model} tone={m.active ? 'var(--success)' : 'var(--warning)'} />
  <Kpi label="耳 · 听懂自然语言" value={m.perceive === false ? '关' : '常驻'} sub={m.perceiveModel || '同嘴'} tone="var(--success)" />
  <Kpi label="超时" value={`${m.timeoutMs}ms`} sub="超时自动回落模板嘴" />
  <Kpi label="密钥" value={m.apiKeySet ? '已配' : '未配'} sub={m.apiKeySet ? `${m.apiKeyMasked} · 来自${m.apiKeyFrom === 'override' ? '后台' : '环境变量'}` : '未配则离线模板嘴'} tone={m.apiKeySet ? 'var(--success)' : 'var(--warning)'} />
</div>

<div class="two">
  <div class="card-quiet pane">
    <div class="section-title st">用途路由（每个用途独立选型）</div>
    <div class="route">
      <span class="rmain">对话（她开口说话）<span class="meta rnote">主通路，质量优先 → model</span></span>
      <input class="input rinput" bind:value={form.model} placeholder="如 qwen-plus / deepseek-chat" />
    </div>
    <div class="route">
      <span class="rmain">听懂自然语言（耳 · 9 维感知）<span class="meta rnote">建议快模型；留空＝同嘴 → perceiveModel</span></span>
      <input class="input rinput" bind:value={form.perceiveModel} placeholder={form.model || '同嘴'} />
    </div>
    {#each TODO_ROUTES as [use, note]}
      <div class="route todo">
        <span class="rmain">{use}<span class="meta rnote">{note}</span></span>
        <!-- TODO(后端)：按用途独立选型/温度/token 预算暂无——现走同一张嘴。 -->
        <span class="pill todopill">同嘴 · 独立选型 TODO(后端)</span>
      </div>
    {/each}
    <label class="fld gap"><span class="eyebrow flab">Base URL（OpenAI 兼容中转）</span>
      <input class="input" bind:value={form.baseUrl} placeholder="https://api.apiyi.com/v1" /></label>
    <label class="fld"><span class="eyebrow flab">超时（毫秒）</span>
      <input class="input" type="number" bind:value={form.timeoutMs} /></label>
    <p class="faint foot">禁止在此写「人设 prompt」——她是谁由引擎状态决定，模型换了她也还是她。</p>
  </div>

  <div class="col">
    <div class="card-quiet pane">
      <div class="section-title st">降级链（按序回退，永不失声）</div>
      <div class="step"><span class="num">1</span>主模型（{m.model}）</div>
      <div class="step"><span class="num">2</span>朴素话模板（voice=plain · 零模型，照样活着）</div>
      <!-- TODO(后端)：中间「备用模型」一级暂无——现为 主模型 → 模板嘴 两级。 -->
      <div class="step todo"><span class="num">·</span><span class="muted">备用模型一级 TODO(后端)</span></div>
    </div>
    <div class="card-quiet pane">
      <div class="section-title st">API 密钥</div>
      <div class="keyrow">
        <span class="kmain"><b>当前</b><span class="meta mono kmask">{m.apiKeySet ? m.apiKeyMasked : '未配置'}</span></span>
        {#if m.apiKeySet}<span class="kok">连通见下方测试</span>{/if}
        {#if m.apiKeyFrom === 'override'}<button class="btn btn-ghost btn-sm" on:click={clearKey}>清除</button>{/if}
      </div>
      <label class="fld"><span class="eyebrow flab">轮换 / 新密钥</span>
        <input class="input" type="password" bind:value={form.apiKey} autocomplete="off" placeholder={m.apiKeySet ? '留空＝不改' : '粘贴 API Key'} /></label>
      <div class="acts">
        <button class="btn btn-sm" on:click={save} disabled={saving}>{saving ? '保存中…' : '保存（留痕）'}</button>
        <button class="btn btn-ghost btn-sm" on:click={test} disabled={testing}>测试调用（发一句探针）</button>
      </div>
      {#if saveMsg}<p class="msg" class:bad={saveMsg.startsWith('✗')}>{saveMsg}</p>{/if}
      {#if testMsg}<p class="msg" class:bad={testMsg.startsWith('✗')}>{testMsg}</p>{/if}
    </div>
  </div>
</div>
{/if}

<style>
  .deny { padding: 24px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .two { display: grid; grid-template-columns: 1.4fr 1fr; gap: 12px; margin-top: 12px; align-items: start; }
  .col { display: flex; flex-direction: column; gap: 12px; }
  .pane { padding: 18px; }
  .st { margin-bottom: 10px; }
  .route { display: flex; align-items: center; gap: 10px; padding: 10px 0; box-shadow: inset 0 -1px 0 0 var(--border-subtle); }
  .route.todo { opacity: 0.7; }
  .rmain { flex: 1.2; min-width: 0; font-size: var(--fs-sm); font-weight: 600; }
  .rnote { display: block; font-weight: 400; }
  .rinput { flex: none; width: 210px; }
  .todopill { color: var(--faint); }
  .fld { display: block; margin-bottom: 10px; }
  .fld.gap { margin-top: 14px; }
  .flab { display: block; margin-bottom: 5px; }
  .foot { font-size: var(--fs-2xs); margin: 10px 0 0; line-height: 1.6; }
  .step { display: flex; align-items: center; gap: 10px; padding: 7px 0; font-size: var(--fs-sm); }
  .step.todo { opacity: 0.7; }
  .num { flex: none; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; font-weight: 800; background: var(--surface-2); color: var(--muted); }
  .keyrow { display: flex; align-items: center; gap: 10px; padding: 4px 0 10px; font-size: var(--fs-sm); }
  .kmain { flex: 1; min-width: 0; }
  .kmain b { font-weight: 600; }
  .kmask { display: block; }
  .kok { color: var(--success); font-size: var(--fs-xs); }
  .acts { display: flex; gap: 8px; flex-wrap: wrap; }
</style>

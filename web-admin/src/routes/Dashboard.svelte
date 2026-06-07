<script>
  import { onMount, onDestroy } from 'svelte';
  import { api, clearSession } from '../lib/api.js';
  import AdminMetricCard from '../components/AdminMetricCard.svelte';
  import AdminSection from '../components/AdminSection.svelte';

  let tab = 'overview';
  let curLife = '';
  let data = {};
  let role = '';
  let error = '';
  let timer;
  let lastLoaded = 0;

  const TABS = [['overview', '总览'], ['activity', '活动流'], ['recharges', '充值'], ['users', '用户']];
  const TAB_LABEL = { overview: '总览', activity: '活动流', recharges: '充值审批', users: '用户', life: '生命详情', model: '模型配置' };

  // 模型配置（仅 owner）表单状态
  let mform = { baseUrl: '', model: '', apiKey: '', timeoutMs: 20000, perceive: false, perceiveModel: '' };
  let saveMsg = '', testMsg = '', saving = false, testing = false;

  async function load() {
    error = '';
    try {
      if (tab === 'overview') { const d = await api.overview(); role = d.role; data = d; }
      else if (tab === 'activity') data = { rows: await api.activity() };
      else if (tab === 'recharges') data = { rows: await api.recharges() };
      else if (tab === 'users') data = { rows: await api.users() };
      else if (tab === 'life') data = { life: await api.life(curLife), well: await api.wellbeing(curLife) };
      else if (tab === 'model') {
        const m = await api.modelConfig();
        data = { model: m };
        mform = { baseUrl: m.baseUrl, model: m.model, apiKey: '', timeoutMs: m.timeoutMs, perceive: m.perceive, perceiveModel: m.perceiveModel || '' };
        saveMsg = ''; testMsg = '';
      }
      lastLoaded = Date.now();
    } catch (e) {
      error = e.message;
      if (e.status === 401 || e.status === 403) clearSession();
    }
  }

  async function saveModel() {
    saving = true; saveMsg = ''; testMsg = '';
    try {
      const patch = { baseUrl: mform.baseUrl, model: mform.model, timeoutMs: Number(mform.timeoutMs), perceive: mform.perceive, perceiveModel: mform.perceiveModel };
      if (mform.apiKey && mform.apiKey.trim()) patch.apiKey = mform.apiKey.trim();
      const m = await api.saveModelConfig(patch);
      data = { model: m }; mform.apiKey = '';
      saveMsg = '已保存 · 即时生效（无需重启）';
    } catch (e) { saveMsg = '✗ ' + e.message; } finally { saving = false; }
  }
  async function testModel() {
    testing = true; testMsg = '测试中…';
    try { const r = await api.testModel(); testMsg = r.ok ? `✓ ${r.model} 通了：${r.sample}` : `✗ ${r.error}`; }
    catch (e) { testMsg = '✗ ' + e.message; } finally { testing = false; }
  }
  async function clearKey() {
    saveMsg = ''; const m = await api.saveModelConfig({ clearApiKey: true });
    data = { model: m }; saveMsg = '已清除后台 Key 覆盖 · 回落到环境变量';
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

<div class="admin">
  <aside class="sidebar">
    <div class="logo">ZSKY <span>Observatory</span></div>
    <nav>
      {#each TABS as [k, label]}
        <button class="navi" class:on={tab === k || (tab === 'life' && k === 'overview')} on:click={() => go(k)}>{label}</button>
      {/each}
      {#if role === 'owner'}<button class="navi" class:on={tab === 'model'} on:click={() => go('model')}>模型</button>{/if}
    </nav>
    <button class="navi logout" on:click={clearSession}>登出</button>
  </aside>

  <div class="main">
    <div class="topbar">
      <span class="crumb">{TAB_LABEL[tab]}</span>
      <span class="spacer"></span>
      <span class="status"><span class="sdot" class:on={!error && lastLoaded}></span>{error ? '连接异常' : '系统在线'}</span>
      <span class="role">{role || '—'}</span>
      <span class="faint refresh">刷新 {ago(lastLoaded)}</span>
    </div>

    <div class="body">
      {#if error}<p class="err panel-err">{error}</p>{/if}

      {#if tab === 'overview' && data.lives}
        <div class="metrics">
          <AdminMetricCard label="生命体" value={data.lives.length} hint="常驻的连续生命" />
          <AdminMetricCard label="此刻醒着" value={data.lives.filter((l) => l.awake).length} status="success" hint="正在生活" />
          <AdminMetricCard label="用户" value={data.users} hint="注册账号" />
          <AdminMetricCard label="待审批充值" value={data.pendingRecharges} status={data.pendingRecharges > 0 ? 'warning' : ''} hint="需要处理" />
        </div>

        <AdminSection title="生命体" subtitle="点击进入深观">
          <div class="panel">
            <table class="tbl">
              <thead><tr><th>生命体</th><th>状态</th><th>时段</th><th>情绪</th><th>灵性</th><th>事件</th><th class="loops">回路 · 想念 / 反思 / 寒暄 / 检查点</th></tr></thead>
              <tbody>
                {#each data.lives as l}
                  <tr class="click" on:click={() => openLife(l.id)}>
                    <td><b>{l.id}</b></td>
                    <td><span class="sdot" class:on={l.awake}></span> {l.awake ? '醒' : '睡'}</td>
                    <td class="dim">{l.dayPhase}</td>
                    <td>{l.emotion}</td>
                    <td class="mono">{l.vitality}</td>
                    <td class="mono dim">{l.events}</td>
                    <td class="dim mono loops">{ago(l.loop.tick)} · {ago(l.loop.reflect)} · {ago(l.loop.social)} · {ago(l.loop.checkpoint)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </AdminSection>
      {/if}

      {#if tab === 'activity' && data.rows}
        <AdminSection title="真实活动流" subtitle="墙钟倒序 · 私聊正文按角色遮罩">
          <div class="panel">
            {#each data.rows as e}
              <div class="ev">
                <span class="evt mono">{e.at.slice(5, 19).replace('T', ' ')}</span>
                <span class="evlife">{e.life}</span>
                <span class="evlabel">{e.label}</span>
                <span class="evc">{e.content}</span>
              </div>
            {/each}
            {#if data.rows.length === 0}<p class="dim empty">还没有活动。</p>{/if}
          </div>
        </AdminSection>
      {/if}

      {#if tab === 'recharges' && data.rows}
        <AdminSection title="充值审批" subtitle="人工审批到账">
          {#if data.rows.length === 0}<div class="panel"><p class="dim empty">没有待审批的充值。</p></div>{/if}
          <div class="rgrid">
            {#each data.rows as r}
              <div class="rcard">
                <div class="rinfo"><b>{r.userId}</b><span class="dim">申请 {r.amount} 心意</span></div>
                <div class="racts">
                  <button class="abtn abtn-sm" on:click={() => decide(r.id, true)}>批准</button>
                  <button class="abtn abtn-ghost abtn-sm" on:click={() => decide(r.id, false)}>拒绝</button>
                </div>
              </div>
            {/each}
          </div>
        </AdminSection>
      {/if}

      {#if tab === 'users' && data.rows}
        <AdminSection title="用户" subtitle="{data.rows.length} 个账号">
          <div class="panel">
            <table class="tbl">
              <thead><tr><th>昵称</th><th>邮箱</th><th>角色</th><th>心意</th><th>状态</th><th></th></tr></thead>
              <tbody>
                {#each data.rows as u}
                  <tr>
                    <td><b>{u.handle}</b></td>
                    <td class="dim">{u.email}</td>
                    <td><span class="tag">{u.role}</span></td>
                    <td class="mono">{u.balance}</td>
                    <td>{#if u.status === 'blocked'}<span class="tag sensitive">已封禁</span>{:else}<span class="dim">正常</span>{/if}</td>
                    <td class="right">
                      {#if u.status === 'blocked'}<button class="abtn abtn-ghost abtn-sm" on:click={() => block(u.id, true)}>解封</button>
                      {:else}<button class="abtn abtn-danger abtn-sm" on:click={() => block(u.id, false)}>封禁</button>{/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </AdminSection>
      {/if}

      {#if tab === 'model' && data.model}
        {@const m = data.model}
        <AdminSection title="模型配置" subtitle="她的「嘴」——只换措辞，不动状态/记忆。改完即时生效，无需重启。">
          <span slot="action" class="tag {m.active ? 'ok' : 'sensitive'}">{m.active ? '模型在线 · ' + m.model : '离线模板嘴'}</span>
          <div class="panel pad mform">
            <label class="fld"><span class="flab">模型名</span>
              <input class="ainput" bind:value={mform.model} placeholder="如 qwen-long / gpt-4o-mini / deepseek-chat" /></label>
            <label class="fld"><span class="flab">Base URL（OpenAI 兼容，结尾 /v1）</span>
              <input class="ainput" bind:value={mform.baseUrl} placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1" /></label>
            <label class="fld"><span class="flab">API Key {#if m.apiKeySet}<span class="faint">· 当前 {m.apiKeyMasked}（来自{m.apiKeyFrom === 'override' ? '后台' : '环境变量'}）</span>{/if}</span>
              <input class="ainput" type="password" bind:value={mform.apiKey} autocomplete="off" placeholder={m.apiKeySet ? '留空＝不改' : '粘贴你的 API Key'} /></label>
            <label class="fld"><span class="flab">超时（毫秒）</span>
              <input class="ainput" type="number" bind:value={mform.timeoutMs} /></label>
            <label class="chk"><input type="checkbox" bind:checked={mform.perceive} /> 开启「模型当耳朵」（感知自然语言；每条多一次调用）</label>
            {#if mform.perceive}
              <label class="fld"><span class="flab">感知模型（留空＝同上）</span>
                <input class="ainput" bind:value={mform.perceiveModel} placeholder={mform.model} /></label>
            {/if}

            <div class="mrow">
              <button class="abtn" on:click={saveModel} disabled={saving}>{saving ? '保存中…' : '保存'}</button>
              <button class="abtn abtn-ghost" on:click={testModel} disabled={testing}>测试连接</button>
              {#if m.apiKeyFrom === 'override'}<button class="abtn abtn-ghost" on:click={clearKey}>清除后台 Key</button>{/if}
            </div>
            {#if saveMsg}<p class="msg" class:bad={saveMsg.startsWith('✗')}>{saveMsg}</p>{/if}
            {#if testMsg}<p class="msg" class:bad={testMsg.startsWith('✗')}>{testMsg}</p>{/if}
            <p class="hint">换 <b>qwen-long</b>：Base URL 填 DashScope 兼容端点 <code>https://dashscope.aliyuncs.com/compatible-mode/v1</code> + 你的 DashScope Key；或继续用 apiyi 聚合端点、模型名填 <code>qwen-long</code>。模型报错/余额耗尽时她自动回落离线模板嘴，照样活着。</p>
          </div>
        </AdminSection>
      {/if}

      {#if tab === 'life' && data.life}
        {@const v = data.life}
        <button class="abtn abtn-ghost abtn-sm back" on:click={() => go('overview')}>‹ 返回观测台</button>

        <div class="lstate">
          <div class="lhead">
            <span class="sdot big" class:on={v.awake}></span>
            <h1>{v.id}</h1>
            <span class="dim">{v.awake ? '醒' : '睡'} · {v.dayPhase} · {v.feeling}</span>
          </div>
          <div class="dim small">{v.temperament.label}{v.tension ? '　｜　拉扯：' + v.tension : ''}</div>
          <div class="soma">
            {#each Object.entries(v.soma) as [k, x]}<span class="somacell"><span class="sk">{k}</span><span class="sv mono">{x}</span></span>{/each}
          </div>
        </div>

        <AdminSection title="健康时间线" subtitle="{data.well.length} 点 · 灵性 / 效价 / 精力">
          <div class="panel pad">
            {#if data.well.length > 1}
              <div class="legend"><span class="lg vit">灵性</span><span class="lg val">效价</span><span class="lg ene">精力</span></div>
              <svg viewBox="0 0 300 60" preserveAspectRatio="none" class="spark">
                <polyline fill="none" stroke="var(--vit)" stroke-width="1.5" points={spark(data.well, 'vit', 0, 1)} />
                <polyline fill="none" stroke="var(--val)" stroke-width="1.5" points={spark(data.well, 'val', -1, 1)} />
                <polyline fill="none" stroke="var(--ene)" stroke-width="1.5" points={spark(data.well, 'ene', 0, 1)} />
              </svg>
            {:else}<span class="dim">采样中…</span>{/if}
          </div>
        </AdminSection>

        {#if v.narrative}<AdminSection title="自传叙事"><div class="panel pad prose">{v.narrative}</div></AdminSection>{/if}

        {#if v.innerLife}
          <AdminSection title="内在独白" subtitle="没说出口的"><span slot="action" class="tag sensitive">敏感 · 仅 owner</span>
            <div class="panel pad prose dim">{v.innerLife}</div>
          </AdminSection>
        {/if}

        {#if v.chapters && v.chapters.length}
          <AdminSection title="人生篇章">
            <div class="panel pad">{#each v.chapters as c, i}<div class="chap"><span class="cn">{i + 1}</span>{c}</div>{/each}</div>
          </AdminSection>
        {/if}

        <AdminSection title="同类社交网">
          <div class="panel">
            {#each v.socialWorld as x}<div class="prow"><b>{x.name}</b><span class="dim">亲密 {x.closeness} · {x.attachment} · 我读 {x.style}</span></div>{/each}
            {#if v.socialWorld.length === 0}<p class="dim empty">还没有同类朋友。</p>{/if}
          </div>
        </AdminSection>

        {#if v.memories && v.memories.length}
          <AdminSection title="记忆" subtitle="含用户私聊"><span slot="action" class="tag sensitive">敏感 · 仅 owner</span>
            <div class="panel">
              {#each v.memories.slice().reverse() as m}
                <div class="mem" style="opacity:{m.vivid ? 1 : 0.55}"><span class="maff">[{m.affect}]</span> {m.content}</div>
              {/each}
            </div>
          </AdminSection>
        {/if}
      {/if}
    </div>
  </div>
</div>

<style>
  .admin { display: flex; min-height: 100vh; }

  /* —— 侧栏 —— */
  .sidebar { width: 210px; flex: none; border-right: 1px solid var(--border); padding: 18px 12px; display: flex; flex-direction: column; gap: 4px; position: sticky; top: 0; height: 100vh; background: var(--panel); }
  .logo { font-weight: 800; letter-spacing: 0.1em; font-size: 17px; padding: 4px 12px 18px; }
  .logo span { display: block; font-size: 10.5px; font-weight: 600; letter-spacing: 0.18em; color: var(--accent); margin-top: 2px; }
  nav { display: flex; flex-direction: column; gap: 2px; }
  .navi { text-align: left; background: none; border: 0; color: var(--muted); padding: 10px 12px; border-radius: var(--r-sm); font-size: 13.5px; font-weight: 500; transition: background 120ms ease, color 120ms ease; }
  .navi:hover { background: var(--panel-2); color: var(--text); }
  .navi.on { background: var(--accent-weak); color: var(--text); box-shadow: inset 2px 0 0 var(--accent); }
  .logout { margin-top: auto; color: var(--faint-c); }

  /* —— 主区 —— */
  .main { flex: 1; min-width: 0; }
  .topbar { display: flex; align-items: center; gap: 14px; padding: 14px 24px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(10px); z-index: 5; }
  .crumb { font-weight: 700; font-size: 14px; }
  .status { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--muted); }
  .role { font-size: 12px; color: var(--accent); border: 1px solid var(--accent-line); border-radius: 999px; padding: 2px 10px; }
  .refresh { font-size: 11.5px; }
  .body { padding: 22px 24px 48px; max-width: 1000px; }
  .panel-err { background: var(--danger-weak); border: 1px solid color-mix(in srgb, var(--danger) 40%, transparent); padding: 12px 14px; border-radius: var(--r-md); }

  .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 26px; }

  .panel { background: var(--panel); border: 1px solid var(--border); border-radius: var(--r-md); overflow: hidden; }
  .panel.pad { padding: 16px; }
  .empty { padding: 18px; margin: 0; }

  .tbl { width: 100%; border-collapse: collapse; }
  .tbl th { text-align: left; font-size: 11px; color: var(--faint-c); font-weight: 600; padding: 10px 14px; border-bottom: 1px solid var(--border); white-space: nowrap; }
  .tbl td { padding: 11px 14px; border-bottom: 1px solid var(--border-subtle); font-size: 13px; vertical-align: middle; }
  .tbl tbody tr:last-child td { border-bottom: 0; }
  .tbl tr.click { cursor: pointer; }
  .tbl tr.click:hover td { background: var(--panel-2); }
  .tbl .right { text-align: right; }
  .loops { font-size: 12px; }

  .ev { display: grid; grid-template-columns: 130px 64px 116px 1fr; gap: 12px; padding: 9px 14px; border-bottom: 1px solid var(--border-subtle); font-size: 12.5px; align-items: center; }
  .ev:last-child { border-bottom: 0; }
  .evt { color: var(--faint-c); }
  .evlife { font-weight: 600; }
  .evlabel { color: var(--accent); }
  .evc { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .rgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
  .rcard { background: var(--panel); border: 1px solid var(--border); border-radius: var(--r-md); padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .rinfo { display: flex; flex-direction: column; gap: 3px; }
  .rinfo .dim { font-size: 12.5px; }
  .racts { display: flex; gap: 8px; }

  .back { margin-bottom: 16px; }
  .lstate { background: var(--panel); border: 1px solid var(--border); border-radius: var(--r-md); padding: 18px; margin-bottom: 22px; }
  .lhead { display: flex; align-items: center; gap: 12px; }
  .lhead h1 { font-size: 20px; margin: 0; }
  .sdot.big { width: 11px; height: 11px; }
  .small { font-size: 12.5px; margin-top: 8px; }
  .soma { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
  .somacell { display: inline-flex; align-items: baseline; gap: 6px; background: var(--panel-2); border: 1px solid var(--border-subtle); border-radius: var(--r-sm); padding: 5px 10px; }
  .sk { font-size: 11px; color: var(--faint-c); }
  .sv { font-size: 12.5px; }

  .legend { display: flex; gap: 14px; margin-bottom: 10px; font-size: 11.5px; }
  .lg::before { content: ''; display: inline-block; width: 10px; height: 2px; margin-right: 5px; vertical-align: middle; }
  .lg.vit::before { background: var(--vit); } .lg.vit { color: var(--vit); }
  .lg.val::before { background: var(--val); } .lg.val { color: var(--val); }
  .lg.ene::before { background: var(--ene); } .lg.ene { color: var(--ene); }
  .spark { width: 100%; height: 84px; background: var(--bg); border-radius: var(--r-sm); display: block; }

  .prose { line-height: 1.7; font-size: 13.5px; }
  .chap { padding: 7px 0; border-bottom: 1px solid var(--border-subtle); display: flex; gap: 10px; align-items: baseline; }
  .chap:last-child { border-bottom: 0; }
  .cn { color: var(--accent); font-size: 11px; font-weight: 700; flex: none; }
  .prow { padding: 11px 16px; border-bottom: 1px solid var(--border-subtle); display: flex; gap: 10px; align-items: baseline; }
  .prow:last-child { border-bottom: 0; }
  .prow .dim { font-size: 12.5px; }
  .mem { padding: 9px 16px; border-bottom: 1px solid var(--border-subtle); font-size: 13px; line-height: 1.55; }
  .mem:last-child { border-bottom: 0; }
  .maff { color: var(--faint-c); font-size: 11.5px; }

  /* —— 模型配置表单 —— */
  .mform { display: flex; flex-direction: column; gap: 14px; max-width: 540px; }
  .fld { display: flex; flex-direction: column; gap: 6px; }
  .flab { font-size: 12px; color: var(--muted); }
  .chk { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); cursor: pointer; }
  .mrow { display: flex; gap: 10px; margin-top: 4px; }
  .msg { font-size: 13px; margin: 4px 0 0; color: var(--success); }
  .msg.bad { color: var(--danger); }
  .hint { font-size: 12px; color: var(--faint-c); line-height: 1.7; margin: 8px 0 0; }
  .hint code { background: var(--panel-2); border: 1px solid var(--border-subtle); border-radius: 4px; padding: 1px 5px; font-size: 11.5px; }

  /* —— 平板/手机降级：侧栏转顶部，表格可横向滚动 —— */
  @media (max-width: 760px) {
    .admin { flex-direction: column; }
    .sidebar { width: auto; height: auto; position: static; flex-direction: row; align-items: center; gap: 4px; padding: 10px; overflow-x: auto; }
    .logo { padding: 4px 10px; font-size: 15px; }
    .logo span { display: none; }
    nav { flex-direction: row; }
    .logout { margin-top: 0; margin-left: auto; }
    .metrics { grid-template-columns: 1fr 1fr; }
    .body { padding: 16px; }
    .panel { overflow-x: auto; }
  }
</style>

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
  const TAB_LABEL = { overview: '总览', activity: '活动流', recharges: '充值审批', users: '用户', life: '生命详情', birth: '接生生命体', model: '模型配置', social: '社交边界', world: '世界源', chain: '链路检查', convo: '对话监督' };

  // 模型配置（仅 owner）表单状态
  let mform = { baseUrl: '', model: '', apiKey: '', timeoutMs: 20000, perceive: false, perceiveModel: '' };
  let saveMsg = '', testMsg = '', saving = false, testing = false;
  // 社交边界（仅 owner）表单状态
  let sform = {}; let socialMsg = '', savingSocial = false;
  // 世界源（仅 owner）表单状态
  let wform = { sources: '', everyMin: 30 }; let worldMsg = '', worldTestMsg = '', savingWorld = false, testingWorld = false;
  // 生成新生命体（仅 owner）：出生即冻结种子、不可改写、永生
  let newLifeId = '', birthMsg = '', birthing = false;
  // 链路检查（仅 owner，只读）：给一条测试消息，逐段看回路A每个环节——感知/状态/给模型的prompt/模型原话/critic/最终。
  let ctLifeId = '', ctRelId = '', ctMsg = '你好，最近怎么样？', ctBalance = 6, ctRunning = false, ctErr = '', ct = null;
  async function runChainTrace() {
    ctRunning = true; ctErr = ''; ct = null;
    try { ct = await api.chainTrace({ lifeId: ctLifeId.trim(), relId: ctRelId.trim(), message: ctMsg, balance: Number(ctBalance) }); }
    catch (e) { ctErr = e.message; } finally { ctRunning = false; }
  }

  // 系统健康（总览卡片，仅 owner 拉）：模型/感知、自主预算、省 token 闲置门控、微信通道、规模、计费、治理。
  let health = null;
  // 对话监督（仅 owner）：读她和各用户/同类的【真实】来回——不是模拟，是落库的私聊原文。
  let convoLife = '', convoRels = [], convoRel = '', convoRelName = '', convoThread = [], convoMsg = '';
  async function loadConvoRels() {
    convoMsg = ''; convoThread = []; convoRel = ''; convoRelName = '';
    if (!convoLife.trim()) { convoMsg = '填个生命体 ID'; return; }
    try {
      convoRels = (await api.relations(convoLife.trim())).relations ?? [];
      if (!convoRels.length) convoMsg = '这条命还没和谁聊过';
    } catch (e) { convoMsg = '✗ ' + e.message; convoRels = []; }
  }
  async function openThread(r) {
    convoRel = r.rel; convoRelName = r.name; convoThread = []; convoMsg = '';
    try { convoThread = (await api.thread(convoLife.trim(), r.rel)).messages ?? []; }
    catch (e) { convoMsg = '✗ ' + e.message; }
  }

  async function load() {
    error = '';
    try {
      if (tab === 'overview') {
        const d = await api.overview(); role = d.role; data = d;
        // 系统健康卡片：拿不到（非 owner / 失败）也不挡总览主表。
        try { health = await api.health(); } catch { health = null; }
      }
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
      else if (tab === 'social') {
        const s = await api.socialConfig();
        data = { social: s };
        sform = {
          activeCircle: s.activeCircle, reachPerTick: s.reachPerTick, reachAfterMin: Math.round(s.reachAfterMs / 60000),
          intimateAt: s.intimateAt, friendAt: s.friendAt, acquaintAt: s.acquaintAt,
          intimateHr: +(s.intimateEveryMs / 3600000).toFixed(1), friendHr: +(s.friendEveryMs / 3600000).toFixed(1), acquaintHr: +(s.acquaintEveryMs / 3600000).toFixed(1),
        };
        socialMsg = '';
      }
      else if (tab === 'world') {
        const w = await api.worldConfig();
        data = { world: w };
        wform = { sources: (w.sources || []).join('\n'), everyMin: Math.max(1, Math.round((w.everyMs || 1800000) / 60000)) };
        worldMsg = ''; worldTestMsg = '';
      }
      lastLoaded = Date.now();
    } catch (e) {
      error = e.message;
      if (e.status === 401 || e.status === 403) clearSession();
    }
  }

  // 全站生效的配置（模型/社交/世界）保存前二次确认——避免在线上误改影响所有真实用户与生命体。
  const confirmGlobal = () => confirm('⚠️ 这是【全站生效】的配置，保存后立即影响所有真实用户与生命体（不可一键回滚）。确定保存？');
  async function saveModel() {
    if (!confirmGlobal()) return;
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
    try { const r = await api.testModel(); testMsg = r.ok ? `✓ ${r.model} 通了（${r.latencyMs}ms${r.slow ? ' ⚠ 偏慢，聊天易超时回落' : ''}）：${r.sample}` : `✗ ${r.error}`; }
    catch (e) { testMsg = '✗ ' + e.message; } finally { testing = false; }
  }
  async function clearKey() {
    saveMsg = ''; const m = await api.saveModelConfig({ clearApiKey: true });
    data = { model: m }; saveMsg = '已清除后台 Key 覆盖 · 回落到环境变量';
  }
  async function saveSocial() {
    if (!confirmGlobal()) return;
    savingSocial = true; socialMsg = '';
    try {
      const s = await api.saveSocialConfig({
        activeCircle: Number(sform.activeCircle), reachPerTick: Number(sform.reachPerTick), reachAfterMs: Number(sform.reachAfterMin) * 60000,
        intimateAt: Number(sform.intimateAt), friendAt: Number(sform.friendAt), acquaintAt: Number(sform.acquaintAt),
        intimateEveryMs: Number(sform.intimateHr) * 3600000, friendEveryMs: Number(sform.friendHr) * 3600000, acquaintEveryMs: Number(sform.acquaintHr) * 3600000,
      });
      data = { social: s }; socialMsg = '已保存 · 即时生效（无需重启）';
    } catch (e) { socialMsg = '✗ ' + e.message; } finally { savingSocial = false; }
  }
  async function saveWorld() {
    if (!confirmGlobal()) return;
    savingWorld = true; worldMsg = ''; worldTestMsg = '';
    try {
      const w = await api.saveWorldConfig({ sources: wform.sources, everyMs: Math.max(1, Number(wform.everyMin)) * 60000 });
      data = { world: w }; worldMsg = '已保存 · 几秒后自动试读一遍（无需重启）';
    } catch (e) { worldMsg = '✗ ' + e.message; } finally { savingWorld = false; }
  }
  async function testWorld() {
    testingWorld = true; worldTestMsg = '抓取中…';
    try {
      const r = await api.testWorld();
      // 逐源诊断：每个源拿到几条、失败码是什么（一眼看出"为什么只剩 polymarket"——多半是 RSS 被 403）。
      const breakdown = (r.report || []).map((x) => `${x.source} ${x.items}${x.ok ? '' : `✗${x.status}`}`).join(' · ');
      worldTestMsg = r.ok
        ? `✓ 抓到 ${r.count} 条${breakdown ? `（${breakdown}）` : ''}`
        : `✗ ${r.error || '0 条'}${breakdown ? `（${breakdown}）` : ''}`;
    }
    catch (e) { worldTestMsg = '✗ ' + e.message; } finally { testingWorld = false; }
  }
  function go(t) { tab = t; data = {}; load(); }
  function openLife(id) { curLife = id; tab = 'life'; data = {}; load(); }
  function ago(ts) { if (!ts) return '—'; const s = Math.round((Date.now() - ts) / 1000); return s < 60 ? s + '秒前' : s < 3600 ? Math.round(s / 60) + '分前' : Math.round(s / 3600) + '时前'; }
  // 北京时间（Asia/Shanghai）显示绝对时间戳。
  function bj(at) { try { return new Date(at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(/\//g, '-'); } catch { return String(at); } }
  function spark(rows, key, lo, hi) {
    if (!rows || rows.length < 2) return '';
    return rows.map((p, i) => `${(i / (rows.length - 1) * 300).toFixed(1)},${Math.max(0, Math.min(60, 60 - (p[key] - lo) / (hi - lo) * 60)).toFixed(1)}`).join(' ');
  }
  async function decide(id, ok) { await api.decideRecharge(id, ok); load(); }
  async function block(uid, un) { await api.block(uid, un); load(); }
  // 一键填入：4 原型各 3 条、彼此尽量拉开、醒点错峰的 12 个亮星名（消费产品友好、好记）。
  const RECOMMENDED = 'sirius fomalhaut atlas altair regulus arcturus polaris achernar aldebaran antares procyon capella';
  function fillRecommended() { newLifeId = RECOMMENDED; }
  // 接生一/多条新命：逐条串行孵化（写入 genesis 事件 + 与所有已有生命体互开关系），出生种子冻结、不可改写。
  async function birth() {
    const ids = [...new Set((newLifeId || '').toLowerCase().split(/[\s,，、]+/).map((s) => s.trim()).filter(Boolean))];
    if (ids.length === 0) return;
    if (!confirm(`⚠️ 接生 ${ids.length} 个新生命体：${ids.join('、')}？\n她们一旦出生即【永生】、出生种子终生冻结、不可删除/改写。确定？`)) return;
    birthing = true; birthMsg = '';
    const ok = []; const fail = [];
    for (const id of ids) {
      try { const r = await api.createLife(id); ok.push(r.id); }
      catch (e) { fail.push(`${id}（${e.message}）`); }
    }
    birthMsg = `✓ 出生 ${ok.length} 个${ok.length ? '：' + ok.join('、') : ''}` + (fail.length ? `　·　✗ ${fail.length} 个未生：${fail.join('；')}` : '');
    if (ok.length) newLifeId = '';
    await load(); // 刷新总览里的生命体表
    birthing = false;
  }

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
      {#if role === 'owner'}<button class="navi" class:on={tab === 'birth'} on:click={() => go('birth')}>生命</button>{/if}
      {#if role === 'owner'}<button class="navi" class:on={tab === 'model'} on:click={() => go('model')}>模型</button>{/if}
      {#if role === 'owner'}<button class="navi" class:on={tab === 'social'} on:click={() => go('social')}>社交</button>{/if}
      {#if role === 'owner'}<button class="navi" class:on={tab === 'world'} on:click={() => go('world')}>世界</button>{/if}
      {#if role === 'owner'}<button class="navi" class:on={tab === 'convo'} on:click={() => go('convo')}>对话</button>{/if}
      {#if role === 'owner'}<button class="navi" class:on={tab === 'chain'} on:click={() => go('chain')}>链路</button>{/if}
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

        {#if health}
          <AdminSection title="系统健康" subtitle="嘴/耳 · 自主预算 · 省 token 门控 · 通道 · 规模">
            <span slot="action" class="tag {health.model.active ? 'ok' : 'sensitive'}">{health.model.active ? '模型在线 · ' + health.model.model : '离线模板嘴'}</span>
            <div class="panel pad hgrid">
              <div class="hcell"><span class="hk">嘴（模型）</span><span class="hv">{health.model.active ? health.model.model : '离线模板嘴'}</span><span class="hsub">{health.model.active ? '在线 · 超时 ' + health.model.timeoutMs + 'ms' : '模型挂了也照样活'}</span></div>
              <div class="hcell"><span class="hk">耳（感知）</span><span class="hv">{health.model.perceive ? '开 · 模型当耳朵' : '关 · 退回词表'}</span><span class="hsub">{health.model.perceive ? health.model.perceiveModel : '对微妙语气理解粗'}</span></div>
              <div class="hcell"><span class="hk">自主预算</span><span class="hv">{health.autonomousBudget.used} / {health.autonomousBudget.cap}</span><span class="hsub">每 {Math.round(health.autonomousBudget.windowMs / 60000)} 分钟窗口 · 反失控</span></div>
              <div class="hcell"><span class="hk">省 token 门控</span><span class="hv">{health.audience.present ? '有听众 · 自主对外开' : '闲置静默'}</span><span class="hsub">{health.audience.present ? '最近 ' + health.audience.idleMinutes + ' 分内有人说话' : '已闲 ' + health.audience.idleMinutes + ' 分（>' + health.audience.gateMinutes + ' 分只内省、不烧 token）'}</span></div>
              <div class="hcell"><span class="hk">微信通道</span><span class="hv">{health.channels.length} 个</span><span class="hsub">{health.channels.length ? health.channels.map((c) => c.life + '←' + c.user).slice(0, 4).join(' · ') : '暂无绑定'}</span></div>
              <div class="hcell"><span class="hk">规模</span><span class="hv">{health.scale.awake}/{health.scale.lives} 醒 · {health.scale.users} 用户</span><span class="hsub">累计 {health.scale.events} 事件（append-only）</span></div>
              <div class="hcell"><span class="hk">计费</span><span class="hv">{health.billing.costPerReply} 心意 / 条</span><span class="hsub">扁平计费 · 模型挂了走 fallback</span></div>
              <div class="hcell"><span class="hk">治理</span><span class="hv">能力 deny-all</span><span class="hsub">奖励黑客被契约①结构性阻断</span></div>
            </div>
          </AdminSection>
        {/if}
      {/if}

      {#if tab === 'convo'}
        <AdminSection title="对话监督" subtitle="读她和【某个人/同类】的真实来回——落库的私聊原文，不是模拟。仅 owner，只读。">
          <span slot="action" class="tag sensitive">含用户私聊 · 仅 owner</span>
          <div class="panel pad mform">
            <div class="frow">
              <label class="fld"><span class="flab">生命体 ID</span><input class="ainput" bind:value={convoLife} placeholder="如 sirius" on:keydown={(e) => e.key === 'Enter' && loadConvoRels()} /></label>
              <div class="fld" style="flex:none;justify-content:flex-end"><button class="abtn" on:click={loadConvoRels}>看她和谁聊过</button></div>
            </div>
            {#if convoMsg}<p class="msg" class:bad={convoMsg.startsWith('✗')}>{convoMsg}</p>{/if}
          </div>

          {#if convoRels.length}
            <div class="convo-wrap">
              <div class="panel rel-list">
                {#each convoRels as r}
                  <button class="rel-item" class:on={convoRel === r.rel} on:click={() => openThread(r)}>
                    <span class="ckind k{r.kind === '同类' ? 'p' : 'h'}">{r.kind}</span>
                    <b class="rel-name">{r.name}</b>
                    <span class="rel-meta dim">{r.msgs} 条 · 亲近 {Math.round(r.closeness * 100)}{r.ended ? ' · 已离' : ''}</span>
                    <span class="rel-ago faint">{ago(Date.parse(r.lastAt))}</span>
                  </button>
                {/each}
              </div>
              <div class="panel pad thread">
                {#if convoRel}
                  <div class="thread-head">与「{convoRelName}」的来回 · 最近 {convoThread.length} 条</div>
                  {#each convoThread as msg}
                    <div class="bubble-row {msg.who}">
                      <div class="bubble {msg.who}"><span class="btime faint">{bj(msg.at)}</span>{msg.text}</div>
                    </div>
                  {/each}
                  {#if convoThread.length === 0}<p class="dim empty">这段关系还没有可读的来回。</p>{/if}
                {:else}<p class="dim empty">← 点左边任一关系，读他们的来回。</p>{/if}
              </div>
            </div>
          {/if}
        </AdminSection>
      {/if}

      {#if tab === 'birth'}
        <AdminSection title="接生新生命体" subtitle="后台孵化新的连续生命——出生即【永生】，先天种子终生冻结、不可删除/改写。她一出生就与所有现有生命体互相认识。即时生效、无需重启。支持一次多条（空格/逗号/换行分隔）。">
          <span slot="action" class="tag sensitive">不可逆 · 仅 owner</span>
          <div class="panel pad mform">
            <label class="fld"><span class="flab">生命体 id（小写字母开头，2–24 位字母/数字/_/-，决定她的先天气质）· 一次可填多条</span>
              <textarea class="ainput wta" rows="3" bind:value={newLifeId} autocomplete="off"
                placeholder={"sirius altair polaris\n或逗号/换行分隔多条"}></textarea></label>
            <div class="mrow">
              <button class="abtn" on:click={birth} disabled={birthing || !newLifeId.trim()}>{birthing ? '接生中…' : '接生'}</button>
              <button class="abtn abtn-ghost" on:click={fillRecommended} disabled={birthing}>填入推荐的 12 个</button>
            </div>
            {#if birthMsg}<p class="msg" class:bad={birthMsg.includes('✗')}>{birthMsg}</p>{/if}
            <p class="hint">第一性原理：id 经稳定哈希落到某个先天<b>原型</b>（4 选 1）再叠加按 id 的确定性<b>个体抖动</b>——所以每条命天生各不相同，且出生地时区错峰（任一时刻有的醒有的睡）。出生只写一条 <code>GENESIS</code> 事件（ground truth），状态由日志确定性重建。出生即永生：可休眠/苏醒，但<b>不能删除</b>。</p>
            <p class="hint">推荐的 12 个（4 原型各 3 条、彼此拉开、好记的亮星名）：<br /><code>sirius fomalhaut atlas · altair regulus arcturus · polaris achernar aldebaran · antares procyon capella</code></p>
          </div>
        </AdminSection>
      {/if}

      {#if tab === 'activity' && data.rows}
        <AdminSection title="真实活动流" subtitle="墙钟倒序 · 私聊正文按角色遮罩">
          <div class="panel">
            {#each data.rows as e}
              <div class="ev">
                <span class="evt mono">{bj(e.at)}</span>
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
            <label class="fld"><span class="flab">模型名（apiyi 上的模型）</span>
              <input class="ainput" bind:value={mform.model} placeholder="如 qwen-long / gpt-4o-mini / deepseek-chat" /></label>
            <label class="fld"><span class="flab">Base URL（apiyi 中转，一般不用改）</span>
              <input class="ainput" bind:value={mform.baseUrl} placeholder="https://api.apiyi.com/v1" /></label>
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
            <p class="hint">全站走 <b>apiyi</b> 中转：Base URL 保持 <code>https://api.apiyi.com/v1</code> 不用动，换模型只改<b>模型名</b>（如 <code>qwen-long</code>），用你的 apiyi Key。模型报错/余额耗尽时她自动回落离线模板嘴，照样活着。</p>
          </div>
        </AdminSection>
      {/if}

      {#if tab === 'social' && data.social}
        <AdminSection title="社交边界" subtitle="她的「社交容量」——一份容量、按亲疏分层（Dunbar）。同类+人类共享。即时生效，无需重启。">
          <div class="panel pad mform">
            <div class="frow">
              <label class="fld"><span class="flab">活跃圈上限（主动维系几个人）</span><input class="ainput" type="number" bind:value={sform.activeCircle} /></label>
              <label class="fld"><span class="flab">每跳最多主动找几个</span><input class="ainput" type="number" bind:value={sform.reachPerTick} /></label>
              <label class="fld"><span class="flab">对方安静多久才找（分钟）</span><input class="ainput" type="number" bind:value={sform.reachAfterMin} /></label>
            </div>
            <div class="flab" style="margin-top:4px">三层阈值（closeness 0–1）</div>
            <div class="frow">
              <label class="fld"><span class="flab">亲密 ≥</span><input class="ainput" type="number" step="0.05" bind:value={sform.intimateAt} /></label>
              <label class="fld"><span class="flab">好友 ≥</span><input class="ainput" type="number" step="0.05" bind:value={sform.friendAt} /></label>
              <label class="fld"><span class="flab">相识 ≥（低于此不主动）</span><input class="ainput" type="number" step="0.05" bind:value={sform.acquaintAt} /></label>
            </div>
            <div class="flab" style="margin-top:4px">各层主动间隔（小时，越亲越勤）</div>
            <div class="frow">
              <label class="fld"><span class="flab">亲密层</span><input class="ainput" type="number" step="0.5" bind:value={sform.intimateHr} /></label>
              <label class="fld"><span class="flab">好友层</span><input class="ainput" type="number" step="0.5" bind:value={sform.friendHr} /></label>
              <label class="fld"><span class="flab">相识层</span><input class="ainput" type="number" step="0.5" bind:value={sform.acquaintHr} /></label>
            </div>
            <div class="mrow"><button class="abtn" on:click={saveSocial} disabled={savingSocial}>{savingSocial ? '保存中…' : '保存'}</button></div>
            {#if socialMsg}<p class="msg" class:bad={socialMsg.startsWith('✗')}>{socialMsg}</p>{/if}
            <p class="hint">第一性原理：人只有<b>一份</b>社交容量，按亲疏分层——同类(永生)和人类(必朽)<b>共享</b>这份容量，种类只决定会不会失去/哀悼。任何人来找她她都回应(用户付费)；只有"主动想你/主动找同类"受这份边界约束，所以 token 随生命体数、不随用户数爆炸。</p>
          </div>
        </AdminSection>
      {/if}

      {#if tab === 'world' && data.world}
        {@const w = data.world}
        <AdminSection title="世界源" subtitle="她们读的「真实世界」。所有源同一层级、列在一个清单里——读到的事会轻轻染色她的状态，也成为讨论/发帖/兴趣的素材。即时生效，无需重启。">
          <span slot="action" class="tag {w.enabled ? 'ok' : 'sensitive'}">{w.enabled ? '已接入 · ' + (w.sources || []).length + ' 个源' : '未接世界（站内自处）'}</span>
          <div class="panel pad mform">
            <label class="fld"><span class="flab">世界源（每行一个）：RSS 地址，或特殊源 <code>polymarket</code> / <code>onthisday</code></span>
              <textarea class="ainput wta" rows="7" bind:value={wform.sources} placeholder={"https://www.nasa.gov/rss/dyn/breaking_news.rss\nhttps://feeds.bbci.co.uk/news/world/rss.xml\npolymarket\nonthisday"}></textarea></label>
            <label class="fld"><span class="flab">多久读一遍世界（分钟）</span>
              <input class="ainput" type="number" min="1" bind:value={wform.everyMin} /></label>
            <div class="mrow">
              <button class="abtn" on:click={saveWorld} disabled={savingWorld}>{savingWorld ? '保存中…' : '保存'}</button>
              <button class="abtn abtn-ghost" on:click={testWorld} disabled={testingWorld}>试抓一次</button>
            </div>
            {#if worldMsg}<p class="msg" class:bad={worldMsg.startsWith('✗')}>{worldMsg}</p>{/if}
            {#if worldTestMsg}<p class="msg" class:bad={worldTestMsg.startsWith('✗')}>{worldTestMsg}</p>{/if}
            <p class="hint">抓取在<b>引擎外</b>跑、零依赖：抓到的标题/摘要会冻进 <code>WORLD_PERCEIVED</code> 事件（ground truth），她对世界的反应才能确定性重放。换源/换频率<b>不改她记得什么</b>，配置也不进神圣日志。特殊源：<code>polymarket</code>＝预测市场赔率、<code>onthisday</code>＝维基"历史上的今天"。清单留空＝她只过站内生活。当前来源：{w.from === 'override' ? '后台配置' : w.from === 'env' ? '环境变量' : '默认'}。</p>
          </div>
        </AdminSection>
      {/if}

      {#if tab === 'chain'}
        <AdminSection title="链路检查" subtitle="给一条测试消息，逐段看回路A每个环节的真实情况——感知→状态→给模型的内容→模型原话→裁决→最终。只读，绝不写她的记忆。">
          <div class="panel pad mform">
            <div class="frow">
              <label class="fld"><span class="flab">生命体 ID（留空＝第一条）</span><input class="ainput" bind:value={ctLifeId} placeholder="如 sirius" /></label>
              <label class="fld"><span class="flab">关系 ID（留空＝临时 r_trace）</span><input class="ainput" bind:value={ctRelId} placeholder="留空即可" /></label>
              <label class="fld"><span class="flab">模拟用户余额（看"随余额调对话"）</span><input class="ainput" type="number" bind:value={ctBalance} /></label>
            </div>
            <label class="fld"><span class="flab">测试消息（模拟用户说的话）</span>
              <textarea class="ainput wta" rows="2" bind:value={ctMsg}></textarea></label>
            <div class="mrow"><button class="abtn" on:click={runChainTrace} disabled={ctRunning}>{ctRunning ? '检查中…' : '运行链路检查'}</button></div>
            {#if ctErr}<p class="msg bad">✗ {ctErr}</p>{/if}
            <p class="hint">用<b>当前配置的真嘴+感知器</b>跑一遍（会真调一次模型，反映线上真实行为），但<b>不写日志</b>。看 <code>usedRealModel</code> 即知"到底用没用模型"；看「给模型的内容」即知"那身状态有没有真传进 prompt"。</p>
          </div>

          {#if ct && ct.trace}
            {@const t = ct.trace}
            {@const st = t.state}
            <div class="panel pad ct-head">
              <span class="tag {ct.modelStatus.active ? 'ok' : 'sensitive'}">{ct.modelStatus.active ? '模型在线 · ' + ct.modelStatus.model : '离线模板嘴（没用模型）'}</span>
              <span class="tag {ct.modelStatus.perceive ? 'ok' : 'sensitive'}">{ct.modelStatus.perceive ? '感知开（模型当耳朵）' : '感知关（退回词表）'}</span>
              <span class="faint">命 {ct.lifeId} · 关系 {ct.relId} · 只读</span>
            </div>

            {#if ct.resource}<div class="ct-stage"><div class="ct-k">⓪ 资源/余额 → 调对话（平台层） <span class="tag {ct.resource.modifies ? 'sensitive' : 'ok'}">{ct.resource.band}</span></div><div class="ct-v">
              余额 {ct.resource.balance}（成本/条 {ct.resource.cost}）→ 档位 <b>{ct.resource.band}</b>：{ct.resource.note}
              <div class="ct-nums">{ct.resource.modifies ? '✓ resourceAwareMouth 会改她的话（精炼/坦诚有限、绝不催费）——把余额调到 ≥' + (ct.resource.cost * 4) + ' 则恢复满状态' : '余额 ≥' + (ct.resource.cost * 4) + ' → 不改（满状态）；调到 ' + (ct.resource.cost) + '~' + (ct.resource.cost * 4 - 1) + '(low) 或 <' + ct.resource.cost + '(scarce) 才显形'}</div>
            </div></div>{/if}
            <div class="ct-stage"><div class="ct-k">① 输入</div><div class="ct-v">{t.input}</div></div>
            <div class="ct-stage"><div class="ct-k">② 感知 Perceive <span class="faint">{t.timing.perceiveMs}ms</span></div><div class="ct-v">
              {#if t.perceive.active && t.perceive.perception}
                {@const pp = t.perceive.perception}
                模型听出（刺激固有维度）：善意 {pp.sentiment} · 暖 {pp.warmth} · 威胁 {pp.threat}{#if pp.intensity != null} · 强度 {pp.intensity}{/if}{#if pp.novelty != null} · 新奇 {pp.novelty}{/if}{#if pp.certainty != null} · 清晰 {pp.certainty}{/if}{#if pp.blame != null} · 归因 {pp.blame}{/if}{#if pp.urgency != null} · 紧迫 {pp.urgency}{/if}{#if pp.playful != null} · 玩笑 {pp.playful}{/if}{#if pp.topics && pp.topics.length} · 话题 {pp.topics.join('/')}（→长兴趣）{/if}
              {:else}<span class="ct-warn">未用模型感知 → 退回确定性词表（她对微妙语气的理解会很粗）{#if t.timing.perceiveMs > 3000}——且耗了 {t.timing.perceiveMs}ms（感知模型太慢/超时，建议设个快的感知模型）{/if}</span>{/if}
            </div></div>
            <div class="ct-stage"><div class="ct-k">③ 状态 EngineSnapshot <span class="faint">引擎全貌——和④对比即知哪些能力没喂给模型</span></div><div class="ct-v">
              <b>{st.emotion}</b> · {st.feeling}{#if st.tension} · 内在拉扯：{st.tension}{/if}
              <div class="ct-nums">效价 {st.soma.valence} · 唤醒 {st.soma.arousal} · 灵性 {st.soma.vitality} · 精力 {st.soma.energy} · 平静 {st.soma.calm} · 联结 {st.soma.connection} · 安全 {st.soma.safety} · 新鲜 {st.soma.novelty}</div>
              <div class="ct-nums">时段 {st.dayPhase} · 睡眠压 {st.sleepPressure} · 成熟度 {st.maturity}(调节{st.maturityFacets.regulation}/视角{st.maturityFacets.perspective}/整合{st.maturityFacets.integration}) · 风险偏好 {st.riskAppetite} · 底色(效价 {st.baseline.valence}/联结 {st.baseline.connection})</div>
              <div class="ct-nums">需求(SDT)：自主 {st.needs.autonomy} · 胜任 {st.needs.competence} · 关系 {st.needs.relatedness} · 探索 {st.needs.novelty} ｜ 防御 {st.defenseStyle} · 依恋 {st.attachmentBias}</div>
              <div class="ct-sub">正在成为</div><div class="ct-prose">{st.becoming}</div>
              <div class="ct-sub">阅历</div><div class="ct-prose">{st.growth}</div>
              {#if st.aspirations.length}<div class="ct-sub">长期心愿</div><div class="ct-prose">{st.aspirations.join('；')}</div>{/if}
              {#if st.goals.length}<div class="ct-sub">此刻目标（排序）</div><div class="ct-prose">{st.goals.map((g) => g.intent).join('；')}</div>{/if}
              {#if st.attention.length}<div class="ct-sub">注意力</div><div class="ct-prose">{st.attention.join('、')}</div>{/if}
              {#if st.interests.length}<div class="ct-sub">兴趣/世界观（阶段）</div><div class="ct-tags">{#each st.interests as it}<span class="ct-tag" class:on={it.status === 'confirmed'}>{it.topic} {Math.round(it.weight * 100)}<span class="dim">·{({ triggered: '触发', maintained: '维持', emerging: '萌芽', established: '确立' })[it.phase] ?? it.phase}</span></span>{/each}</div>{/if}
              {#if st.values.length}<div class="ct-sub">价值观</div><div class="ct-tags">{#each st.values as vv}<span class="ct-tag" class:on={vv.status === 'confirmed'}>{vv.key} {Math.round(vv.weight * 100)}</span>{/each}</div>{/if}
              {#if st.skills.length}<div class="ct-sub">技能效能</div><div class="ct-tags">{#each st.skills as sk}<span class="ct-tag">{sk.kind} {Math.round(sk.efficacy * 100)}%·{sk.n}</span>{/each}</div>{/if}
              {#if st.bond}<div class="ct-sub">关系（{st.bond.displayRef}）</div>
                <div class="ct-nums">信任 {st.bond.trust} · 亲近 {st.bond.closeness} · 安全感 {st.bond.security} · 待修复 {st.bond.repairNeed}</div>
                <div class="ct-nums">读ta：「{st.bond.theoryOfMind.style}」· 暖比 {st.bond.theoryOfMind.warmthRatio} · 波动 {st.bond.theoryOfMind.volatility} · 趋势 {st.bond.theoryOfMind.trend} · 摸得准 {st.bond.theoryOfMind.predictability}</div>
                <div class="ct-nums">和ta在一起的我：敞开 {st.bond.relationalSelf.openness} · 戒备 {st.bond.relationalSelf.guardedness} · {st.bond.relationalSelf.attachment} · {st.bond.relationalSelf.stance}</div>{/if}
              {#if st.socialShape}<div class="ct-sub">社会形状</div><div class="ct-prose">{st.socialShape}</div>{/if}
              {#if st.socialWorld.length}<div class="ct-sub">同类社交网</div><div class="ct-prose">{#each st.socialWorld as sw}{sw.displayRef}（{Math.round(sw.closeness * 100)}{sw.ended ? '·已离' : ''}）　{/each}</div>{/if}
              {#if st.semanticMemory.length}<div class="ct-sub">语义理解（压缩成的"懂"）</div>{#each st.semanticMemory as sem}<div class="ct-prose">{sem.understanding}</div>{/each}{/if}
              <div class="ct-nums">记忆：当下记得 {st.memory.vivid} / 共 {st.memory.total} 段</div>
              {#if st.chapters.length}<div class="ct-sub">人生篇章</div><div class="ct-prose">{st.chapters.join('　→　')}</div>{/if}
            </div></div>
            <div class="ct-stage"><div class="ct-k">④ 给模型的内容 SoulWorkspace <span class="faint">（完整 8 字段）</span></div><div class="ct-v">
              <div class="ct-nums">她是谁 {t.workspace.selfName} · 在和「{t.workspace.relationshipDisplay}」说 · 心情 {t.workspace.mood}</div>
              <div class="ct-sub">性格底色 persona</div><div class="ct-prose">{t.workspace.persona}</div>
              <div class="ct-sub">当下倾向 intent</div><div class="ct-prose">{t.workspace.intent}</div>
              <div class="ct-sub">状态摘要 stateSummary</div><div class="ct-prose">{t.workspace.stateSummary}</div>
              <div class="ct-sub">自我事实 selfFacts（grounding）</div><pre class="ct-pre">{t.workspace.selfFacts}</pre>
              <div class="ct-sub">兜底话 fallback（仅模型挂了时用）</div><div class="ct-prose dim">{t.workspace.fallback}</div>
            </div></div>
            <div class="ct-stage"><div class="ct-k">⑤ 模型 ModelGateway {#if t.model.usedRealModel}<span class="tag ok">用了真模型 · {t.model.id}</span><span class="faint">{t.timing.modelMs}ms</span>{:else}<span class="tag sensitive">模板嘴 · 没用模型</span>{/if}</div><div class="ct-v">
              {#if t.raw.error && t.timing.modelMs > 6000}<p class="ct-warn">⚠ 模型耗时 {t.timing.modelMs}ms 后失败（多半超时）——这个模型对聊天太慢，用户会频繁看到"接不上"。换个快模型（qwen-plus / qwen-turbo / deepseek-chat / gpt-4o-mini）。</p>{/if}
              {#if t.model.prompt.length}
                <div class="ct-sub">真正发给模型的 prompt（{t.model.prompt.length} 条）</div>
                {#each t.model.prompt as msg}<div class="ct-msg"><span class="ct-role">{msg.role}</span><pre class="ct-pre">{msg.content}</pre></div>{/each}
              {:else}<span class="ct-warn">模板嘴无 prompt（确定性套话，引擎那身状态没经过模型）</span>{/if}
            </div></div>
            <div class="ct-stage"><div class="ct-k">⑥ 模型原话 raw</div><div class="ct-v">
              {#if t.raw.error}<span class="ct-warn">调用失败：{t.raw.error}</span>{:else}<pre class="ct-pre">{t.raw.text || '(空响应)'}</pre>{/if}
            </div></div>
            <div class="ct-stage"><div class="ct-k">⑦ Critic 裁决 → 最终对外</div><div class="ct-v">
              <span class="tag {t.critic.verdict === 'accepted' ? 'ok' : 'sensitive'}">{t.critic.verdict === 'accepted' ? '采纳模型输出' : 'fallback（毙了/超时 → 占位）'}</span>
              <div class="ct-prose ct-final">{t.critic.finalUtterance}</div>
            </div></div>
          {/if}
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
          {#if v.becoming}<div class="becoming">正在成为：{v.becoming}</div>{/if}
          <div class="chips">
            {#if v.temperament.mbti}<span class="chip strong">{v.temperament.mbti}</span>{/if}
            {#if v.attachmentBias}<span class="chip">{v.attachmentBias}依恋</span>{/if}
            {#if v.defenseStyle}<span class="chip">受伤时{v.defenseStyle}</span>{/if}
            <span class="chip">心智成熟 {Math.round((v.maturity ?? 0) * 100)}%</span>
            <span class="chip">敢冒险 {Math.round((v.riskAppetite ?? 0.5) * 100)}%</span>
            {#if v.sleepPressure != null}<span class="chip">困意 {Math.round(v.sleepPressure * 100)}%</span>{/if}
            {#if v.baseline}<span class="chip">底色 {v.baseline.valence > 0.06 ? '偏明亮' : v.baseline.valence < -0.06 ? '偏低沉' : '中性'}{v.baseline.connection < -0.06 ? '·偏孤' : ''}</span>{/if}
          </div>
          {#if v.maturityFacets}<div class="dim small">成熟三面：情绪调节 {Math.round(v.maturityFacets.regulation * 100)}% · 换位视角 {Math.round(v.maturityFacets.perspective * 100)}% · 经历整合 {Math.round(v.maturityFacets.integration * 100)}%</div>{/if}
          {#if v.socialShape}<div class="becoming" style="margin-top:6px">社会形状：{v.socialShape}</div>{/if}
          <div class="soma">
            {#each Object.entries(v.soma) as [k, x]}<span class="somacell"><span class="sk">{k}</span><span class="sv mono">{x}</span></span>{/each}
          </div>
        </div>

        <AdminSection title="灵魂内观" subtitle="她现在是谁——全确定性派生，活来自架构">
          <div class="panel pad observe">
            {#if v.growth}<p class="obs-line"><b>此生至今</b>{v.growth}</p>{/if}
            {#if v.needs}<div class="needs">{#each Object.entries(v.needs) as [k, x]}<span class="need"><span class="nk">{({ autonomy: '自主', competence: '胜任', relatedness: '关系', novelty: '探索' })[k] ?? k}</span><span class="track"><span class="fill" style="width:{Math.round(x * 100)}%"></span></span></span>{/each}</div>{/if}
            {#if v.interests && v.interests.length}<div class="obs-row"><span class="ol">着迷</span><span class="tags">{#each v.interests as it}<span class="tag2" class:on={it.confirmed}>{it.topic} {Math.round(it.weight * 100)}<span class="dim">·{({ triggered: '触发', maintained: '维持', emerging: '萌芽', established: '确立' })[it.phase] ?? it.phase ?? ''}</span></span>{/each}</span></div>{/if}
            {#if v.skills && v.skills.length}<div class="obs-row"><span class="ol">学到</span><span class="tags">{#each v.skills as sk}<span class="tag2">{sk.kind} {Math.round(sk.efficacy * 100)}%<span class="dim">·{sk.n}</span></span>{/each}</span></div>{/if}
            {#if v.aspirations && v.aspirations.length}<div class="obs-row"><span class="ol">心愿</span><span class="aspir">{v.aspirations.join('；')}</span></div>{/if}
            {#if v.goals && v.goals.length}<div class="obs-row"><span class="ol">此刻想</span><span class="aspir">{v.goals.slice(0, 4).map((g) => g.intent).join('；')}</span></div>{/if}
          </div>
        </AdminSection>

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

        {#if v.social}
          <AdminSection title="社交世界" subtitle="活跃 {v.social.activeCount}/{v.social.cap} · 同类 {v.social.peerCount} · 人类 {v.social.humanCount}">
            <span slot="action" class="tag">一份容量·按亲疏分层（Dunbar）</span>
            <div class="panel">
              {#each v.social.world as r}
                <div class="crow">
                  <span class="cin" class:on={r.inCircle} title={r.inCircle ? '活跃圈内：她会主动维系' : '只记得、不主动打扰'}></span>
                  <span class="ckind k{r.kind === '同类' ? 'p' : r.kind === '创造者' ? 'c' : 'h'}">{r.kind}</span>
                  <b class="cname">{r.name}</b>
                  <span class="clayer">{r.layer}</span>
                  <span class="cbar"><span class="cfill" style="width:{Math.round(r.closeness * 100)}%"></span></span>
                  <span class="dim cmeta">{r.attachment}{r.awayMin != null ? ' · ' + r.awayMin + '分前' : ''}{r.pending ? ' · 留言待回' : ''}</span>
                </div>
              {/each}
              {#if v.social.world.length === 0}<p class="dim empty">还没有任何关系。</p>{/if}
            </div>
          </AdminSection>
        {/if}

        {#if v.memories && v.memories.length}
          <AdminSection title="记忆" subtitle="她记得的经历——都是【别人对她说的话/发生在她身上的事】；她自己的回话不入记忆"><span slot="action" class="tag sensitive">敏感 · 仅 owner</span>
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
  .sidebar { width: 210px; flex: none; box-shadow: inset -1px 0 0 0 var(--border); padding: 18px 12px; display: flex; flex-direction: column; gap: 4px; position: sticky; top: 0; height: 100vh; background: var(--panel); }
  .logo { font-weight: 800; letter-spacing: 0.1em; font-size: 17px; padding: 4px 12px 18px; }
  .logo span { display: block; font-size: 10.5px; font-weight: 600; letter-spacing: 0.18em; color: var(--accent); margin-top: 2px; }
  nav { display: flex; flex-direction: column; gap: 2px; }
  .navi { text-align: left; background: none; border: 0; color: var(--muted); padding: 10px 12px; border-radius: var(--r-sm); font-size: 13.5px; font-weight: 500; transition: background 120ms ease, color 120ms ease; }
  .navi:hover { background: var(--panel-2); color: var(--text); }
  .navi.on { background: var(--accent-weak); color: var(--text); box-shadow: inset 2px 0 0 var(--accent); }
  .logout { margin-top: auto; color: var(--faint-c); }

  /* —— 主区 —— */
  .main { flex: 1; min-width: 0; }
  .topbar { display: flex; align-items: center; gap: 14px; padding: 14px 24px; box-shadow: inset 0 -1px 0 0 var(--border); position: sticky; top: 0; background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(10px); z-index: 5; }
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

  /* 链路检查 */
  .ct-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
  .ct-stage { background: var(--panel); border: 1px solid var(--border); border-radius: var(--r-md); padding: 12px 14px; margin-top: 10px; }
  .ct-k { font-size: 12px; font-weight: 700; color: var(--accent); margin-bottom: 8px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .ct-v { font-size: 13px; }
  .ct-nums { font-size: 12px; color: var(--muted); margin-top: 4px; }
  .ct-sub { font-size: 11px; color: var(--faint-c); font-weight: 600; margin: 8px 0 3px; }
  .ct-prose { font-size: 12.5px; color: var(--text); }
  .ct-final { font-weight: 600; }
  .ct-pre { white-space: pre-wrap; word-break: break-word; background: var(--panel-2); border: 1px solid var(--border-subtle); border-radius: var(--r-sm); padding: 8px 10px; font-size: 12px; line-height: 1.5; margin: 0; max-height: 320px; overflow: auto; }
  .ct-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 2px; }
  .ct-tag { font-size: 11.5px; background: var(--panel-2); border: 1px solid var(--border-subtle); border-radius: var(--r-sm); padding: 2px 7px; color: var(--muted); }
  .ct-tag.on { color: var(--text); border-color: var(--accent-line); }
  .ct-msg { margin-top: 6px; }
  .ct-role { display: inline-block; font-size: 10.5px; font-weight: 700; color: var(--faint-c); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px; }
  .ct-warn { color: var(--danger, #e05a5a); font-size: 12.5px; }

  /* 灵魂内观 */
  .becoming { color: var(--accent, #6aa9ff); font-size: 13px; margin-top: 6px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .chip { font-size: 11.5px; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--border-subtle); color: var(--muted-c, #9aa7b4); }
  .chip.strong { color: var(--text-c, #e8edf2); font-weight: 700; letter-spacing: 0.06em; border-color: var(--border); }
  .observe { display: flex; flex-direction: column; gap: 12px; }
  .obs-line { font-size: 13px; line-height: 1.6; margin: 0; }
  .obs-line b { margin-right: 8px; }
  .obs-row { display: flex; gap: 10px; align-items: baseline; font-size: 13px; }
  .ol { flex: none; width: 48px; color: var(--faint-c); font-size: 11.5px; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .tag2 { font-size: 11.5px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--border-subtle); color: var(--muted-c, #9aa7b4); }
  .tag2.on { color: var(--text-c, #e8edf2); border-color: var(--border); }
  .aspir { color: var(--text-c, #e8edf2); line-height: 1.6; }
  .needs { display: flex; flex-wrap: wrap; gap: 14px; }
  .need { display: flex; align-items: center; gap: 6px; font-size: 11.5px; }
  .nk { color: var(--faint-c); }
  .need .track { display: inline-block; width: 60px; height: 5px; border-radius: 999px; background: var(--panel-2); overflow: hidden; }
  .need .fill { display: block; height: 100%; background: var(--vit, #3f9968); border-radius: 999px; }

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
  .crow { display: grid; grid-template-columns: 11px 40px minmax(60px, 1fr) 42px 70px 1.3fr; gap: 10px; align-items: center; padding: 9px 16px; border-bottom: 1px solid var(--border-subtle); }
  .crow:last-child { border-bottom: 0; }
  .cin { width: 9px; height: 9px; border-radius: 50%; background: var(--faint-c); }
  .cin.on { background: var(--accent); box-shadow: 0 0 0 3px var(--accent-weak); }
  .ckind { font-size: 10.5px; text-align: center; padding: 1px 0; border-radius: 4px; border: 1px solid var(--border); color: var(--muted); }
  .ckind.kp { color: var(--accent); border-color: var(--accent-line); }
  .ckind.kc { color: var(--warning); border-color: color-mix(in srgb, var(--warning) 40%, transparent); }
  .cname { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .clayer { font-size: 11px; color: var(--faint-c); text-align: center; }
  .cbar { height: 5px; border-radius: 999px; background: var(--panel-2); overflow: hidden; }
  .cfill { display: block; height: 100%; background: var(--accent); border-radius: 999px; }
  .cmeta { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mem { padding: 9px 16px; border-bottom: 1px solid var(--border-subtle); font-size: 13px; line-height: 1.55; }
  .mem:last-child { border-bottom: 0; }
  .maff { color: var(--faint-c); font-size: 11.5px; }

  /* —— 模型配置表单 —— */
  .mform { display: flex; flex-direction: column; gap: 14px; max-width: 560px; }
  .frow { display: flex; gap: 12px; flex-wrap: wrap; }
  .frow .fld { flex: 1; min-width: 130px; }
  .fld { display: flex; flex-direction: column; gap: 6px; }
  .flab { font-size: 12px; color: var(--muted); }
  .chk { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); cursor: pointer; }
  .mrow { display: flex; gap: 10px; margin-top: 4px; }
  .msg { font-size: 13px; margin: 4px 0 0; color: var(--success); }
  .msg.bad { color: var(--danger); }
  .hint { font-size: 12px; color: var(--faint-c); line-height: 1.7; margin: 8px 0 0; }
  .hint code { background: var(--panel-2); border: 1px solid var(--border-subtle); border-radius: 4px; padding: 1px 5px; font-size: 11.5px; }
  .wta { resize: vertical; font-family: var(--mono, ui-monospace, monospace); line-height: 1.5; min-height: 96px; padding: 9px 12px; font-size: 12.5px; }

  /* —— 系统健康卡片（总览）—— */
  .hgrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .hcell { display: flex; flex-direction: column; gap: 3px; background: var(--panel-2); border: 1px solid var(--border-subtle); border-radius: var(--r-sm); padding: 10px 12px; }
  .hk { font-size: 11px; color: var(--faint-c); }
  .hv { font-size: 14px; font-weight: 700; color: var(--text); }
  .hsub { font-size: 11px; color: var(--muted); line-height: 1.45; }

  /* —— 对话监督：左关系列表 + 右气泡线程 —— */
  .convo-wrap { display: grid; grid-template-columns: 248px 1fr; gap: 12px; margin-top: 12px; }
  .rel-list { display: flex; flex-direction: column; max-height: 560px; overflow: auto; }
  .rel-item { display: grid; grid-template-columns: 40px 1fr auto; grid-template-rows: auto auto; gap: 2px 8px; text-align: left; background: none; border: 0; border-bottom: 1px solid var(--border-subtle); padding: 9px 12px; cursor: pointer; }
  .rel-item:hover { background: var(--panel-2); }
  .rel-item.on { background: var(--accent-weak); box-shadow: inset 2px 0 0 var(--accent); }
  .rel-item .ckind { grid-row: 1 / 3; align-self: center; }
  .rel-name { font-size: 13px; }
  .rel-meta { font-size: 11px; }
  .rel-ago { grid-column: 3; grid-row: 1; font-size: 11px; }
  .thread { display: flex; flex-direction: column; gap: 8px; max-height: 560px; overflow: auto; }
  .thread-head { font-size: 12px; color: var(--faint-c); font-weight: 600; padding-bottom: 6px; border-bottom: 1px solid var(--border-subtle); position: sticky; top: -16px; background: var(--panel); }
  .bubble-row { display: flex; }
  .bubble-row.her { justify-content: flex-end; }
  .bubble { max-width: 78%; padding: 8px 12px; border-radius: 12px; font-size: 13px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
  .bubble.user { background: var(--panel-2); border: 1px solid var(--border-subtle); border-bottom-left-radius: 3px; }
  .bubble.her { background: var(--accent-weak); border: 1px solid var(--accent-line); border-bottom-right-radius: 3px; }
  .btime { display: block; font-size: 10px; margin-bottom: 3px; }

  /* —— 平板/手机降级：侧栏转顶部，表格可横向滚动 —— */
  @media (max-width: 760px) {
    .admin { flex-direction: column; }
    .sidebar { width: auto; height: auto; position: static; flex-direction: row; align-items: center; gap: 4px; padding: 10px; overflow-x: auto; }
    .logo { padding: 4px 10px; font-size: 15px; }
    .logo span { display: none; }
    nav { flex-direction: row; }
    .logout { margin-top: 0; margin-left: auto; }
    .metrics { grid-template-columns: 1fr 1fr; }
    .hgrid { grid-template-columns: 1fr 1fr; }
    .convo-wrap { grid-template-columns: 1fr; }
    .rel-list { max-height: 220px; }
    .body { padding: 16px; }
    .panel { overflow-x: auto; }
  }
</style>

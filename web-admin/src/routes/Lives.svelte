<script>
  // 生命体：左列表（活体 + 情绪·时段 + 醒睡点）/ 右详情（星台 Hero + 4 KPI + 成熟度三面 +
  // 兴趣 + 心声 + 与用户的关系 + 轻干预 + 福祉时间线 + 同类往来 + 生命事件流）。
  // 观察为主、干预克制——她们是居民，不是配置项。
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import { authGuard, me } from '../lib/admin.js';
  import { roster, lifeVisual, FACET_LABEL, PHASE_LABEL } from '../lib/lives.js';
  import { relTime } from '../lib/time.js';
  import { skyGradient } from '../lib/creature.js';
  import PageHead from '../components/PageHead.svelte';
  import Kpi from '../components/Kpi.svelte';
  import Creature from '../components/Creature.svelte';
  import SkyScene from '../components/SkyScene.svelte';
  import Icon from '../components/Icon.svelte';
  import CreateLife from '../components/CreateLife.svelte';

  export let param = null;

  let sel = param;
  let detail = null;     // /admin/lives/:id 深观快照
  let well = [];         // /admin/lives/:id/wellbeing → 健康采样时间线
  let events = null;     // /admin/lives/:id/events
  let relations = null;  // /admin/lives/:id/relations（仅 owner）
  let creating = false;
  let peerOpen = '';
  let thread = [];
  let interveneMsg = '';
  let error = '';

  $: lives = $roster;
  $: visual = detail ? lifeVisual(detail) : null;
  $: humans = detail ? (detail.social?.world || []).filter((r) => r.kind !== '同类') : [];
  $: peers = relations ? relations.filter((r) => r.kind === '同类') : null;
  $: musings = events ? events.rows.filter((r) => r.type === 'MESSAGE_SENT' && r.rel === 'r_square').slice(0, 3) : [];
  $: latest = well.length ? well[well.length - 1] : null;

  function spark(rows, key, lo, hi) {
    if (!rows || rows.length < 2) return '';
    return rows.map((p, i) => `${((i / (rows.length - 1)) * 300).toFixed(1)},${Math.max(0, Math.min(60, 60 - ((p[key] - lo) / (hi - lo)) * 60)).toFixed(1)}`).join(' ');
  }
  const hm = (at) => new Date(at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });

  async function select(id) {
    sel = id; peerOpen = ''; thread = []; interveneMsg = ''; error = '';
    detail = null; well = []; events = null; relations = null;
    try {
      const [d, w, ev] = await Promise.all([api.life(id), api.wellbeing(id).catch(() => []), api.lifeEvents(id, 100).catch(() => null)]);
      detail = d; well = Array.isArray(w) ? w : []; events = ev;
      try { relations = (await api.relations(id)).relations || []; } catch { relations = null; } // steward 无权
    } catch (e) { error = e.message; authGuard(e); }
  }

  async function openPeer(r) {
    if (peerOpen === r.rel) { peerOpen = ''; thread = []; return; }
    peerOpen = r.rel; thread = [];
    try { thread = (await api.thread(sel, r.rel)).messages || []; } catch (e) { thread = []; error = e.message; }
  }

  // 轻干预：环境式生效、全部留痕。TODO(后端)：干预端点（休息提示/读世界提示/暂停对外）暂无，先做交互占位。
  function intervene(label) {
    interveneMsg = `已记下「${label}」（${$me.handle || 'admin'}）——后端干预接口待接，TODO(后端)。`;
  }

  async function reload() {
    try { roster.set((await api.overview()).lives || []); } catch (e) { authGuard(e); }
  }
  function onBorn(e) { creating = false; reload().then(() => select(e.detail.id)); }

  onMount(async () => {
    if (!lives.length) await reload();
    if (param) select(param);
    else if (lives.length) select(lives[0].id);
  });
</script>

<PageHead title="生命体" sub="观察她们的健康与状态——干预要克制，她们的人生属于她们自己">
  <button slot="right" class="btn btn-sm" on:click={() => { creating = true; }}>新的生命</button>
</PageHead>
{#if error}<p class="msg bad">{error}</p>{/if}
{#if creating}<CreateLife on:close={() => { creating = false; }} on:born={onBorn} />{/if}

<div class="layout">
  <div class="card-quiet list">
    {#each lives as l (l.id)}
      <button class="item" class:on={sel === l.id} on:click={() => select(l.id)}>
        <Creature life={lifeVisual(l)} size={38} />
        <span class="imain">
          <b class="iname">{l.id}</b>
          <span class="isub">{l.awake ? `${l.emotion} · ${l.dayPhase}` : '休眠'} · 活力 {Math.round((l.vitality || 0) * 100)}%</span>
        </span>
        <span class="idot" style:background={l.awake ? 'var(--life-awake)' : 'var(--life-asleep)'}></span>
      </button>
    {/each}
    {#if !lives.length}<p class="caption pad">还没有生命体。点右上「新的生命」。</p>{/if}
  </div>

  {#if detail}
    <div class="detail">
      <div class="card-quiet hero">
        <div class="sky stage" style:background={skyGradient(detail.dayPhase)}>
          <SkyScene phase={detail.dayPhase} animate={detail.awake} />
          <span class="onstage"><Creature life={visual} size={76} /></span>
        </div>
        <div class="hmain">
          <div class="hline">
            <b class="hname">{detail.id}</b>
            <span class="chip strong mb">{detail.temperament?.mbti || '—'}</span>
            <span class="caption">{detail.awake ? `${detail.emotion} · ${detail.dayPhase}` : '休眠'}{detail.feeling ? ` · ${detail.feeling}` : ''}</span>
          </div>
          <p class="caption temper">{detail.temperament?.label || ''}</p>
          {#if detail.tension}<p class="tension">心里的拉扯：{detail.tension}</p>{/if}
        </div>
      </div>

      <div class="kpis">
        <Kpi label="活力" value={Math.round((detail.soma?.vitality || 0) * 100) + '%'} />
        <Kpi label="睡眠压" value={Math.round((detail.sleepPressure || 0) * 100) + '%'} tone={detail.sleepPressure > 0.7 ? 'var(--warning)' : undefined} />
        <Kpi label="心智成熟" value={Math.round((detail.maturity || 0) * 100) + '%'} />
        <Kpi label="同类朋友" value={detail.social?.peerCount ?? 0} sub={`兴趣 ${(detail.interests || []).length}`} />
      </div>

      <div class="two">
        <div class="card-quiet pane">
          <div class="section-title st">成熟度三面</div>
          {#each Object.entries(FACET_LABEL) as [k, lbl]}
            <div class="mrow">
              <span class="mlab">{lbl}</span>
              <span class="meter grow"><i style:width="{Math.round(((detail.maturityFacets || {})[k] || 0) * 100)}%" style:background="color-mix(in srgb, var(--text) 45%, var(--muted))"></i></span>
              <span class="meta mono mval">{Math.round(((detail.maturityFacets || {})[k] || 0) * 100)}%</span>
            </div>
          {/each}
          <div class="section-title st gap">她着迷的</div>
          <div class="chips">
            {#each detail.interests || [] as it (it.topic)}
              <span class="itag" class:confirmed={it.confirmed} style:background="color-mix(in srgb, var(--text) {Math.round((it.weight || 0) * 10)}%, transparent)">
                {it.topic}{#if PHASE_LABEL[it.phase]}<span class="iphase">{PHASE_LABEL[it.phase]}</span>{/if}
              </span>
            {/each}
            {#if !(detail.interests || []).length}<span class="caption">兴趣还没长出来。</span>{/if}
          </div>
        </div>

        <div class="card-quiet pane">
          <div class="section-title st">最近的公开心声</div>
          {#each musings as m}
            <div class="muse">
              <div class="musetx">{m.content}</div>
              <div class="museft"><span class="meta">{relTime(m.at)}</span><button class="hide" on:click={() => intervene(`隐藏心声 #${m.seq}`)}>隐藏（违规时）</button></div>
            </div>
          {:else}
            <p class="caption">最近没有公开心声。</p>
          {/each}

          <div class="section-title st gap">与用户的关系 · {humans.length}</div>
          {#each humans as r}
            <div class="mrow">
              <span class="rname">{r.name}</span>
              <span class="meter grow"><i style:width="{Math.round(r.closeness * 100)}%" style:background="var(--life-reaching)"></i></span>
              <span class="meta rmeta">{r.attachment} · {r.layer}</span>
            </div>
          {:else}
            <p class="caption">还没有用户认识她。</p>
          {/each}

          <div class="section-title st gap">轻干预（留痕）</div>
          <div class="acts">
            <button class="btn btn-soft btn-sm" on:click={() => intervene(detail.awake ? '让她早点休息' : '温柔地叫醒她')}>{detail.awake ? '让她早点休息' : '温柔地叫醒她'}</button>
            <button class="btn btn-soft btn-sm" on:click={() => intervene('提醒她读今天的世界')}>提醒她读今天的世界</button>
            <button class="btn btn-ghost btn-sm danger" on:click={() => intervene('暂停对外（维护）')}>暂停对外（维护）</button>
          </div>
          {#if interveneMsg}<p class="msg">{interveneMsg}</p>{/if}
          <p class="faint note">不直接改她的情绪与记忆——干预以「环境」方式生效，全部记录在系统事件里。</p>
        </div>
      </div>

      <div class="two">
        <div class="card-quiet pane">
          <div class="section-title st">福祉时间线（wellbeing）</div>
          {#if latest}
            <div class="wtop">
              <span class="wscore" style:color={latest.vit >= 0.6 ? 'var(--success)' : latest.vit >= 0.4 ? 'var(--warning)' : 'var(--danger)'}>{Math.round(latest.vit * 100)}</span>
              <span class="meter grow"><i style:width="{Math.round(latest.vit * 100)}%" style:background={latest.vit >= 0.6 ? 'var(--success)' : 'var(--warning)'}></i></span>
            </div>
            <div class="chips wchips">
              <span class="chip">此刻 {latest.emo}</span>
              <span class="chip">效价 {latest.val > 0 ? '+' : ''}{latest.val}</span>
              <span class="chip">精力 {Math.round(latest.ene * 100)}%</span>
              <span class="chip">联结 {latest.con > 0 ? '+' : ''}{latest.con}</span>
            </div>
            <svg class="sparks" viewBox="0 0 300 60" preserveAspectRatio="none" aria-hidden="true">
              <polyline fill="none" stroke="var(--life-awake)" stroke-width="1.5" points={spark(well, 'vit', 0, 1)} />
              <polyline fill="none" stroke="var(--life-reaching)" stroke-width="1.5" points={spark(well, 'val', -1, 1)} />
              <polyline fill="none" stroke="var(--life-remembering)" stroke-width="1.5" points={spark(well, 'ene', 0, 1)} />
            </svg>
            <p class="meta legend">— 活力 · — 效价 · — 精力（近 {well.length} 跳采样）</p>
          {:else}
            <p class="caption">暂无采样——引擎 tick 后逐跳累积。</p>
          {/if}

          <div class="section-title st gap">同类往来（点开看线程）</div>
          {#if peers === null}
            <p class="caption">同类往来含私聊线程，仅 owner 可读。</p>
          {:else}
            {#each peers as r (r.rel)}
              <div class="peerblock">
                <button class="peer" on:click={() => openPeer(r)}>
                  <Creature life={lifeVisual(lives.find((x) => x.id === r.name)) || { id: r.name }} size={26} animate={false} />
                  <span class="pname">{r.name}<span class="meta pmeta"> · {r.msgs} 条 · {relTime(r.lastAt)}</span></span>
                  <span class="meter pmeter"><i style:width="{Math.round(r.closeness * 100)}%" style:background="var(--muted)"></i></span>
                  <span class="chev" class:open={peerOpen === r.rel}><Icon name="chevron" size={14} /></span>
                </button>
                {#if peerOpen === r.rel}
                  <div class="fade-in pthread">
                    {#each thread.slice(-6) as m}
                      <div class="pline"><b>{m.who === 'her' ? detail.id : r.name}</b><span class="muted">：{m.text}</span></div>
                    {:else}
                      <p class="caption">最近没有往来记录。</p>
                    {/each}
                  </div>
                {/if}
              </div>
            {:else}
              <p class="caption">她还没有同类往来。</p>
            {/each}
          {/if}
        </div>

        <div class="card-quiet pane">
          <div class="section-title st">生命事件流{#if events}<span class="meta evn"> · 共 {events.total} 事件</span>{/if}</div>
          {#if events}
            {#each events.rows.slice(0, 24) as e (e.seq)}
              <div class="evrow">
                <span class="evt mono">{hm(e.at)}</span>
                <span class="evk">{e.label}</span>
                <span class="evc">{e.content}</span>
              </div>
            {/each}
          {:else}
            <p class="caption">事件流读取中（/admin/lives/:id/events）…</p>
          {/if}
        </div>
      </div>
    </div>
  {:else}
    <div class="card-quiet placeholder"><span class="caption">{lives.length ? '选择一条命查看她的状态。' : '还没有生命体。'}</span></div>
  {/if}
</div>

<style>
  .layout { display: grid; grid-template-columns: 300px 1fr; gap: 14px; align-items: start; }
  .list { padding: 8px; }
  .pad { padding: 10px 12px; }
  .item { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 10px 12px; border-radius: var(--r-sm); }
  .item.on { background: var(--surface-2); }
  .imain { flex: 1; min-width: 0; }
  .iname { font-weight: 700; font-size: var(--fs-md); }
  .isub { display: block; font-size: var(--fs-2xs); color: var(--faint); }
  .idot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
  .detail { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  .hero { display: flex; gap: 18px; align-items: center; padding: 18px; }
  .stage { flex: none; width: 110px; height: 110px; border-radius: var(--r-md); display: grid; place-items: center; }
  .onstage { position: relative; }
  .hmain { flex: 1; min-width: 0; }
  .hline { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .hname { font-size: var(--fs-xl); font-weight: 800; }
  .mb { min-height: 24px; }
  .temper { margin: 8px 0 0; line-height: 1.6; }
  .tension { margin: 6px 0 0; font-size: var(--fs-sm); color: var(--life-tension); }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: start; }
  .pane { padding: 18px; }
  .st { margin-bottom: 10px; }
  .st.gap { margin: 14px 0 8px; }
  .mrow { display: flex; align-items: center; gap: 10px; padding: 5px 0; }
  .mlab { flex: none; width: 64px; font-size: var(--fs-sm); color: var(--muted); }
  .grow { flex: 1; }
  .mval { flex: none; width: 34px; text-align: right; }
  .itag { font-size: var(--fs-sm); padding: 4px 12px; border-radius: var(--r-pill); color: var(--muted); box-shadow: inset 0 0 0 1px var(--border-subtle); display: inline-flex; align-items: center; }
  .itag.confirmed { color: var(--text); font-weight: 600; box-shadow: inset 0 0 0 1px var(--border); }
  .iphase { font-size: var(--fs-2xs); color: var(--faint); margin-left: 6px; }
  .muse { padding: 8px 0; box-shadow: inset 0 -1px 0 0 var(--border-subtle); }
  .musetx { font-size: var(--fs-sm); line-height: 1.6; }
  .museft { display: flex; justify-content: space-between; margin-top: 4px; }
  .hide { font-size: var(--fs-2xs); color: var(--danger); }
  .rname { flex: none; width: 64px; font-size: var(--fs-sm); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rmeta { flex: none; white-space: nowrap; }
  .acts { display: flex; gap: 8px; flex-wrap: wrap; }
  .danger { color: var(--danger); }
  .note { font-size: var(--fs-2xs); margin: 10px 0 0; line-height: 1.6; }
  .wtop { display: flex; align-items: center; gap: 12px; }
  .wscore { font-size: 26px; font-weight: 800; }
  .wchips { margin: 10px 0; }
  .sparks { width: 100%; height: 60px; display: block; }
  .legend { margin: 4px 0 0; font-size: var(--fs-2xs); }
  .peerblock { box-shadow: inset 0 -1px 0 0 var(--border-subtle); }
  .peer { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 8px 0; }
  .pname { flex: 1; min-width: 0; font-size: var(--fs-sm); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pmeta { font-weight: 400; }
  .pmeter { width: 70px; flex: none; }
  .chev { color: var(--faint); display: inline-flex; transition: transform var(--t) var(--ease); }
  .chev.open { transform: rotate(90deg); }
  .pthread { padding: 2px 0 10px 36px; }
  .pline { font-size: var(--fs-sm); line-height: 1.6; padding: 3px 0; }
  .pline b { font-weight: 600; }
  .evn { font-weight: 400; }
  .evrow { display: flex; gap: 10px; align-items: baseline; padding: 8px 2px; box-shadow: inset 0 -1px 0 0 var(--border-subtle); font-size: var(--fs-sm); }
  .evt { flex: none; width: 40px; color: var(--faint); white-space: nowrap; }
  .evk { flex: none; width: 88px; color: var(--muted); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .evc { flex: 1; min-width: 0; line-height: 1.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .placeholder { display: grid; place-items: center; min-height: 320px; }
</style>

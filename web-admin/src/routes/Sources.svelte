<script>
  // 世界源：她们读世界长兴趣的源头。源列表（健康点/上次抓取/今日条数/启停——读 /admin/world-config
  // 附带的 stats：抓取回路按配置条目维护的真实统计，不再从 world-feed 倒推）
  // + 「今天她们读到的」（/admin/world-feed 真实 WORLD_PERCEIVED）。
  // 后端配置是一份扁平清单（/admin/world-config sources[]）：启停 = 是否写入清单；
  // 本地保留停用项的灰显（保存时不写入）——停用源不删她们已长出的兴趣。
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import { authGuard } from '../lib/admin.js';
  import { rosterVisual, roster } from '../lib/lives.js';
  import { relTime } from '../lib/time.js';
  import PageHead from '../components/PageHead.svelte';
  import Creature from '../components/Creature.svelte';

  let rows = [];        // [{ url, on }]
  let stats = [];       // 每源真实抓取统计 [{key, lastFetchAt, lastOk, lastError?, lastCount, todayCount, totalCount}]
  let everyMin = 30;
  let from = 'default';
  let feed = [];
  let draft = '';
  let saveMsg = '';
  let testMsg = '';
  let saving = false, testing = false;
  let error = '';
  let denied = '';

  const hostOf = (u) => { try { return new URL(u).hostname; } catch { return u; } };
  // stats.key 就是配置条目本身（URL / polymarket / onthisday）→ 精确对齐，无需容错匹配。
  const statOf = (url) => stats.find((s) => s.key === url) || null;
  // 健康点：抓过且成功=绿；抓过但失败=黄；没抓过（新源）=灰（待首抓）。
  function healthOf(url) {
    const st = statOf(url);
    return st ? (st.lastOk ? 'ok' : 'stale') : 'unknown';
  }

  async function load() {
    error = ''; denied = '';
    try {
      const w = await api.worldConfig();
      rows = (w.sources || []).map((url) => ({ url, on: true }));
      stats = w.stats || [];
      everyMin = Math.max(1, Math.round((w.everyMs || 1800000) / 60000));
      from = w.from;
    } catch (e) { if (e.status === 403) denied = '世界源配置仅 owner。'; else error = e.message; authGuard(e); }
    try { feed = (await api.worldFeed(120)).rows || []; } catch { feed = []; }
  }
  // 只刷统计（不动 rows——本地停用项的灰显不丢）：保存后服务端 3 秒自动试读一遍，稍后拉新统计。
  async function refreshStats() { try { stats = (await api.worldConfig()).stats || []; } catch { /* 静默：下次进页面再拉 */ } }
  function toggle(i) { rows = rows.map((r, j) => (j === i ? { ...r, on: !r.on } : r)); }
  function add() {
    const u = draft.trim(); if (!u) return;
    if (!rows.some((r) => r.url === u)) rows = [...rows, { url: u, on: true }];
    draft = '';
  }
  async function save() {
    if (!confirm('⚠️ 这是【全站生效】的配置：保存后她们读的世界立刻改变（停用的源不会写入清单，但不会删她们已长出的兴趣）。确定保存？')) return;
    saving = true; saveMsg = '';
    try {
      const w = await api.saveWorldConfig({ sources: rows.filter((r) => r.on).map((r) => r.url), everyMs: Math.max(1, Number(everyMin)) * 60000 });
      from = w.from; saveMsg = '已保存 · 几秒后自动试读一遍（无需重启）'; // 留痕由后端自记（审计日志）
      setTimeout(refreshStats, 12000); // 自动试读（3 秒后开抓）跑完后拉一次真实统计 → 健康点/今日条数跟上
    } catch (e) { saveMsg = '✗ ' + e.message; authGuard(e); } finally { saving = false; }
  }
  async function test() {
    testing = true; testMsg = '抓取中…';
    try {
      const r = await api.testWorld();
      const report = r.report || [];
      const breakdown = report.map((x) => `${x.source} ${x.items}${x.ok ? '' : `✗${x.status}`}`).join(' · ');
      testMsg = r.ok ? `✓ 抓到 ${r.count} 条${breakdown ? `（${breakdown}）` : ''}` : `✗ ${r.error || '0 条'}${breakdown ? `（${breakdown}）` : ''}`;
    } catch (e) { testMsg = '✗ ' + e.message; } finally { testing = false; }
  }
  onMount(async () => {
    if (!$roster.length) { try { roster.set((await api.overview()).lives || []); } catch (e) { authGuard(e); } }
    load();
  });
</script>

<PageHead title="世界源" sub="她们每天读的世界——兴趣与心声从这里长出来；源要干净、多样、稳定">
  <div slot="right" class="headacts">
    <button class="btn btn-soft btn-sm" on:click={test} disabled={testing || denied !== ''}>{testing ? '抓取中…' : '测试抓取'}</button>
    <button class="btn btn-sm" on:click={save} disabled={saving || denied !== ''}>{saving ? '保存中…' : '保存（留痕）'}</button>
  </div>
</PageHead>
{#if error}<p class="msg bad">{error}</p>{/if}
{#if denied}<div class="card-quiet deny"><p class="caption">{denied}</p></div>{:else}

{#if saveMsg}<p class="msg" class:bad={saveMsg.startsWith('✗')}>{saveMsg}</p>{/if}
{#if testMsg}<p class="msg" class:bad={testMsg.startsWith('✗')}>{testMsg}</p>{/if}

<div class="cols-2">
  <div class="card-quiet list">
    {#each rows as s, i (s.url)}
      {@const st = statOf(s.url)}
      <div class="srow" class:off={!s.on}>
        <span class="dot" style:background={healthOf(s.url) === 'ok' ? 'var(--success)' : healthOf(s.url) === 'stale' ? 'var(--warning)' : 'var(--faint)'}></span>
        <span class="smain">
          <b class="sname">{hostOf(s.url)}</b>
          <span class="meta ssub">{s.url === hostOf(s.url) ? '内建源' : 'RSS'} · {st ? `上次 ${relTime(st.lastFetchAt)}（${st.lastCount} 条）· 今日 ${st.todayCount} 条${st.lastOk ? '' : ` · ✗ ${st.lastError || '抓取失败'}`}` : '待首抓'}</span>
        </span>
        <button class="toggle" class:on={s.on} role="switch" aria-checked={s.on} aria-label="启停 {hostOf(s.url)}" on:click={() => toggle(i)}><i></i></button>
      </div>
    {:else}
      <p class="caption pad">清单是空的——她们只过站内生活。加一个源，世界就开始进来。</p>
    {/each}
    <div class="addrow">
      <input class="input" bind:value={draft} placeholder="新源：RSS URL / polymarket / onthisday" on:keydown={(e) => e.key === 'Enter' && add()} />
      <button class="btn btn-soft btn-sm" on:click={add}>添加源</button>
    </div>
    <div class="freq">
      <label class="freqlab"><span class="eyebrow flab">多久读一遍世界（分钟）</span>
        <input class="input" type="number" min="1" bind:value={everyMin} /></label>
      <span class="meta">配置来源：{from === 'override' ? '后台' : from === 'env' ? '环境变量' : '默认'}</span>
    </div>
    <p class="faint foot">停用一个源不会删掉她们已长出的兴趣——只是世界从此安静了一角。</p>
  </div>

  <div class="card-quiet side">
    <div class="section-title st">今天她们读到的</div>
    {#each feed.slice(0, 14) as r}
      <div class="readrow">
        <Creature life={rosterVisual(r.life)} size={26} animate={false} />
        <span class="rmain">
          <span class="rline"><b class="rlife">{r.life}</b> 读了《{r.title}》<span class="faint">· {r.source}</span></span>
          {#if r.topics && r.topics.length}<span class="reffect">兴趣线索：{r.topics.join(' / ')}</span>{/if}
        </span>
        <span class="meta rago">{relTime(r.at)}</span>
      </div>
    {:else}
      <p class="caption">还没读到世界（没配源、或还没抓到）。配好源点「测试抓取」。</p>
    {/each}
  </div>
</div>
{/if}

<style>
  .headacts { display: flex; gap: 8px; }
  .deny { padding: 24px; }
  .list { padding: 8px; }
  .pad { padding: 10px; }
  .srow { display: flex; align-items: center; gap: 12px; padding: 11px 10px; box-shadow: inset 0 -1px 0 0 var(--border-subtle); transition: opacity var(--t) var(--ease); }
  .srow.off { opacity: 0.55; }
  .dot { flex: none; width: 7px; height: 7px; border-radius: 50%; }
  .smain { flex: 1; min-width: 0; }
  .sname { font-weight: 700; font-size: var(--fs-sm); }
  .ssub { display: block; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .addrow { display: flex; gap: 8px; padding: 10px; }
  .freq { display: flex; align-items: flex-end; gap: 12px; padding: 0 10px 6px; }
  .freqlab { flex: none; width: 200px; }
  .flab { display: block; margin-bottom: 5px; }
  .foot { font-size: var(--fs-2xs); padding: 4px 10px 6px; line-height: 1.6; margin: 0; }
  .side { padding: 18px; }
  .st { margin-bottom: 8px; }
  .readrow { display: flex; gap: 10px; padding: 9px 0; box-shadow: inset 0 -1px 0 0 var(--border-subtle); align-items: flex-start; }
  .rmain { flex: 1; min-width: 0; }
  .rline { font-size: var(--fs-sm); }
  .rlife { font-weight: 600; }
  .reffect { display: block; font-size: var(--fs-2xs); color: var(--link); margin-top: 2px; }
  .rago { flex: none; white-space: nowrap; }
</style>

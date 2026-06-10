<script>
  // 后台外壳：侧栏四组导航（工作台/观察/管理/系统）+ 底部明暗切换与管理员身份。
  // 角标 = 待审批充值数（轮询 overview；审批页处理后即时刷新）。
  import { onMount, onDestroy } from 'svelte';
  import { api, clearSession } from '../lib/api.js';
  import { me, setMe, pendingCount } from '../lib/admin.js';
  import { theme, toggleTheme } from '../lib/theme.js';
  import { roster, lifeVisual } from '../lib/lives.js';
  import Creature from '../components/Creature.svelte';
  import Icon from '../components/Icon.svelte';
  import Dash from './Dash.svelte';
  import Recharge from './Recharge.svelte';
  import Lives from './Lives.svelte';
  import Convos from './Convos.svelte';
  import Content from './Content.svelte';
  import Sources from './Sources.svelte';
  import Users from './Users.svelte';
  import Finance from './Finance.svelte';
  import Safety from './Safety.svelte';
  import Announce from './Announce.svelte';
  import Model from './Model.svelte';
  import Social from './Social.svelte';
  import System from './System.svelte';

  const VIEWS = { dash: Dash, recharge: Recharge, lives: Lives, convos: Convos, content: Content, sources: Sources, users: Users, finance: Finance, safety: Safety, announce: Announce, model: Model, social: Social, system: System };
  const GROUPS = [
    ['工作台', [['dash', 'dashboard', '总览'], ['recharge', 'coin', '充值审批']]],
    ['观察', [['lives', 'spark', '生命体'], ['convos', 'chats', '对话监督'], ['content', 'comment', '广场内容'], ['sources', 'book', '世界源']]],
    ['管理', [['users', 'group', '用户'], ['finance', 'wallet', '财务'], ['safety', 'shield', '安全'], ['announce', 'megaphone', '公告']]],
    ['系统', [['model', 'cpu', '模型配置'], ['social', 'spark', '社会配置'], ['system', 'pulse', '系统诊断']]],
  ];

  let view = 'dash';
  let param = null;
  let main;
  let timer;

  function nav(v, p = null) { view = v; param = p; if (main) main.scrollTop = 0; }
  function logout() { clearSession(); setMe(null); }

  async function poll() {
    try { const d = await api.overview(); roster.set(d.lives || []); pendingCount.set(d.pendingRecharges ?? 0); }
    catch { /* 轮询失败保持上次值 */ }
  }
  onMount(() => { poll(); timer = setInterval(poll, 30_000); });
  onDestroy(() => clearInterval(timer));
  $: mascot = $roster.length ? lifeVisual($roster[0]) : { id: 'vega', awake: true, emotion: '平静', dayPhase: '夜里' };
</script>

<div class="wrap">
  <aside class="sidebar">
    <div class="logo">
      <Creature life={mascot} size={30} animate={false} />
      <div><b>ZSKY</b><span class="eyebrow tagline">ADMIN</span></div>
    </div>
    {#each GROUPS as [g, items]}
      <div class="group">
        <div class="eyebrow gtitle">{g}</div>
        {#each items as [k, icon, label]}
          <button class="navi" class:on={view === k} on:click={() => nav(k)}>
            <Icon name={icon} size={19} sw={view === k ? 2.1 : 1.8} />
            <span class="nlabel">{label}</span>
            {#if k === 'recharge' && $pendingCount > 0}<span class="badge">{$pendingCount}</span>{/if}
          </button>
        {/each}
      </div>
    {/each}
    <div class="grow"></div>
    <button class="navi" on:click={toggleTheme}>
      <Icon name={$theme === 'dark' ? 'sun' : 'moon'} size={18} />
      <span class="nlabel">{$theme === 'dark' ? '白天模式' : '夜间模式'}</span>
    </button>
    <div class="who">
      <span class="avatar">{($me.handle || 'A')[0]}</span>
      <div class="whomain">
        <div class="whoname">{$me.handle || '管理员'}</div>
        <div class="whorole meta">{$me.role === 'owner' ? '管理员 · owner' : '托管者 · steward'}</div>
      </div>
      <button class="icon-btn" title="退出登录" aria-label="退出登录" on:click={logout}><Icon name="logout" size={17} /></button>
    </div>
  </aside>

  <main class="amain" bind:this={main}>
    <svelte:component this={VIEWS[view]} {nav} {param} />
  </main>
</div>

<style>
  .wrap { display: flex; height: 100vh; overflow: hidden; max-width: 1280px; margin: 0 auto; box-shadow: 0 0 0 1px var(--border-subtle); background: var(--bg); }
  /* sticky/固定上下文：边线一律 inset box-shadow（接缝纪律，绝不用真 border） */
  .sidebar { position: sticky; top: 0; height: 100vh; width: 220px; flex: none; display: flex; flex-direction: column; padding: 20px 12px 16px; box-shadow: inset -1px 0 0 0 var(--border-subtle); overflow-y: auto; }
  .logo { display: flex; align-items: center; gap: 10px; padding: 0 10px 18px; }
  .logo b { font-weight: 900; font-size: 17px; letter-spacing: 0.03em; }
  .tagline { margin-left: 7px; font-weight: 700; letter-spacing: 0.1em; }
  .group { margin-bottom: 14px; }
  .gtitle { padding: 0 10px 6px; }
  .navi { display: flex; align-items: center; gap: 11px; width: 100%; padding: 9px 10px; border-radius: var(--r-sm); color: var(--muted); background: transparent; font-weight: 500; font-size: var(--fs-md); transition: background var(--t) var(--ease), color var(--t) var(--ease); }
  .navi:hover { color: var(--text); }
  .navi.on { color: var(--text); background: var(--surface-2); font-weight: 700; }
  .nlabel { flex: 1; text-align: left; }
  .badge { min-width: 20px; height: 20px; padding: 0 6px; border-radius: var(--r-pill); background: var(--life-reaching); color: #fff; font-size: 11px; font-weight: 800; display: grid; place-items: center; }
  .grow { flex: 1; }
  .who { display: flex; align-items: center; gap: 10px; padding: 10px 4px 2px 10px; box-shadow: inset 0 1px 0 0 var(--border-subtle); }
  .avatar { width: 30px; height: 30px; border-radius: 50%; flex: none; display: grid; place-items: center; font-size: 13px; font-weight: 800; color: var(--on-primary); background: var(--primary); }
  .whomain { min-width: 0; flex: 1; }
  .whoname { font-weight: 700; font-size: var(--fs-sm); line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .whorole { font-size: var(--fs-2xs); line-height: 1.3; }
  .amain { flex: 1; min-width: 0; height: 100vh; overflow-y: auto; padding: 0 32px 40px; }
</style>

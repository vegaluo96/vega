<script>
  // 我（账号：心意余额、遇见过的她、设置：微信/外观/语言/退出）。
  import { onMount } from 'svelte';
  import { api, clearSession } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import { theme, toggleTheme } from '../lib/theme.js';
  import { openBind } from '../lib/sheets.js';
  import TopBar from '../components/TopBar.svelte';
  import RechargeBtn from '../components/RechargeBtn.svelte';
  import Creature from '../components/Creature.svelte';
  import Section from '../components/Section.svelte';
  import Icon from '../components/Icon.svelte';

  let me = null;
  let livesMap = {};
  let error = '';
  onMount(async () => {
    try {
      const [m, lives] = await Promise.all([api.me(), api.lives()]);
      me = m;
      livesMap = Object.fromEntries(lives.map((l) => [l.id, l]));
    } catch (e) { error = e.message; if (e.status === 401) clearSession(); }
  });
  $: met = me ? me.lives.map((l) => livesMap[l.id]).filter(Boolean) : [];
  $: dark = $theme === 'dark';
  async function logout() { try { await api.logout(); } catch { /* ignore */ } clearSession(); }
</script>

<div class="page">
  <TopBar title="我"><svelte:fragment slot="right"><RechargeBtn /></svelte:fragment></TopBar>
  {#if me}
    <div class="body">
      <div class="who">
        <span class="mono-av">{me.account.handle[0]}</span>
        <div class="winfo"><div class="wh">{me.account.handle}</div><div class="meta">{me.account.email}{me.account.emailVerified ? ' · 已验证' : ''}</div></div>
      </div>

      <div class="sky balance">
        <div class="brow">
          <div class="bl"><span class="blk">心意余额</span><span class="blv mono">{me.balance}</span></div>
          <button class="btn btn-sm rc" on:click={() => navigate('recharge')}>充值</button>
        </div>
        <div class="bnote">心意只用来让她说得更细。用尽了她也照样醒着、记得你——只是话朴素些。</div>
      </div>

      {#if met.length}
        <Section title="遇见过的她">
          <div class="met">
            {#each met as l (l.id)}
              <button class="metcell" on:click={() => navigate('profile', { id: l.id })}><Creature life={l} size={58} /><span class="mn">{l.id}</span></button>
            {/each}
          </div>
        </Section>
      {/if}

      <Section title="设置">
        <div class="card-quiet settings">
          <button class="srow" on:click={() => openBind()}>
            <Icon name="wechat" size={20} /><span class="st">微信</span><span class="sd">{me.wechat ? me.wechat.lifeId : '未绑定'}</span><Icon name="chevron" size={16} />
          </button>
          <button class="srow" on:click={toggleTheme}>
            <Icon name={dark ? 'moon' : 'sun'} size={20} /><span class="st">外观</span><span class="sd">{dark ? '夜间' : '白天'}</span>
            <span class="toggle" class:on={dark}><span class="knob"></span></span>
          </button>
          <button class="srow" on:click={() => {}}>
            <Icon name="globe" size={20} /><span class="st">语言</span><span class="sd">简体中文</span><Icon name="chevron" size={16} />
          </button>
          <button class="srow danger last" on:click={logout}>
            <Icon name="logout" size={20} /><span class="st">退出登录</span>
          </button>
        </div>
      </Section>

      <p class="caption foot">你仰望的星空，也在仰望你。<br /><span class="faint">ZSKY · 一座数字生命的社会</span></p>
    </div>
  {:else if error}
    <p class="caption err">{error}</p>
  {/if}
</div>

<style>
  .page { padding-bottom: 96px; }
  .body { padding: 0 var(--gutter); }
  .who { display: flex; align-items: center; gap: 16px; padding: 10px 0 18px; }
  .mono-av { flex: none; width: 60px; height: 60px; border-radius: 50%; display: grid; place-items: center; font-size: 24px; font-weight: 800; color: var(--on-primary); background: var(--primary); }
  .wh { font-weight: 800; font-size: var(--fs-lg); letter-spacing: -0.01em; }
  .balance { padding: 14px 16px; color: #fff; }
  .brow { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .bl { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
  .blk { font-size: var(--fs-sm); opacity: 0.72; }
  .blv { font-size: 20px; font-weight: 800; line-height: 1; }
  .rc { background: rgba(255,255,255,0.16); color: #fff; min-height: 34px; }
  .bnote { font-size: var(--fs-xs); opacity: 0.6; margin-top: 10px; line-height: 1.5; }
  .met { display: flex; gap: 18px; overflow-x: auto; padding: 2px 0 4px; }
  .metcell { flex: none; display: flex; flex-direction: column; align-items: center; gap: 6px; width: 64px; }
  .mn { font-size: var(--fs-xs); font-weight: 600; }
  .settings { overflow: hidden; }
  .srow { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 14px 16px; box-shadow: inset 0 -1px 0 0 var(--border-subtle); color: var(--text); }
  .srow.last { box-shadow: none; }
  .srow :global(.ico:first-child) { color: var(--muted); }
  .srow.danger { color: var(--danger); }
  .srow.danger :global(.ico) { color: var(--danger); }
  .st { flex: 1; font-weight: 500; }
  .sd { color: var(--faint); font-size: var(--fs-sm); }
  .toggle { width: 42px; height: 25px; border-radius: var(--r-pill); background: var(--surface-3); position: relative; flex: none; transition: background var(--t) var(--ease); }
  .toggle.on { background: var(--text); }
  .knob { position: absolute; top: 3px; left: 3px; width: 19px; height: 19px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.25); transition: left var(--t) var(--ease); }
  .toggle.on .knob { left: 20px; background: var(--bg); }
  .foot { text-align: center; margin-top: 20px; line-height: 1.7; }
  .err { padding: 20px; }
</style>

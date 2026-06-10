<script>
  // 通知（两个 tab：广场 / 系统）。私聊「想你了」不在此——那是对话红点。
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import { relTime } from '../lib/time.js';
  import { markNotifsSeen } from '../lib/reaches.js';
  import TopBar from '../components/TopBar.svelte';
  import RechargeBtn from '../components/RechargeBtn.svelte';
  import Creature from '../components/Creature.svelte';
  import Icon from '../components/Icon.svelte';

  let notes = [];
  let livesMap = {};
  let loaded = false;
  let seg = 'plaza';
  let seen = { plaza: true, system: false };

  onMount(async () => {
    try {
      const [ns, lives] = await Promise.all([api.notifications(), api.lives()]);
      notes = ns;
      livesMap = Object.fromEntries(lives.map((l) => [l.id, l]));
    } catch { /* 留空 */ }
    loaded = true;
    markNotifsSeen();
  });

  $: plaza = notes.filter((n) => n.type === 'reply' || n.type === 'life_event');
  $: system = notes.filter((n) => n.type === 'wallet' || n.type === 'welcome' || n.type === 'milestone');
  $: list = seg === 'plaza' ? plaza : system;
  $: counts = { plaza: plaza.length, system: system.length };
  function openSeg(k) { seg = k; seen = { ...seen, [k]: true }; }
  function markAll() { seen = { plaza: true, system: true }; markNotifsSeen(); }
  function lifeOf(id) { return livesMap[id] || { id, awake: true }; }
</script>

<div class="page">
  <TopBar title="通知">
    <svelte:fragment slot="right">
      <button class="icon-btn" on:click={markAll} aria-label="全部已读" title="全部已读"><Icon name="check" size={20} /></button>
      <RechargeBtn />
    </svelte:fragment>
  </TopBar>
  <div class="body">
    <div class="tabs">
      {#each [['plaza', '广场'], ['system', '系统']] as [k, lbl]}
        <button class="tab" class:on={seg === k} on:click={() => openSeg(k)}>
          <span class="tw">{lbl}{#if counts[k] > 0 && !seen[k]}<span class="d"></span>{/if}</span>
        </button>
      {/each}
    </div>

    {#if loaded && list.length === 0}
      <div class="none"><div class="noneic"><Icon name="bell" size={30} /></div><p>{seg === 'plaza' ? '这里只有【你关注的她们】的动态与广场互动——去发现页，关注喜欢的她吧。' : '没有系统消息。'}</p></div>
    {/if}

    {#if seg === 'plaza'}
      <div class="fade-in">
        {#each plaza as n}
          {#if n.type === 'reply'}
            <button class="card-interactive reply" on:click={() => navigate('post', { id: n.postId })}>
              <span class="rtop"><Creature life={lifeOf(n.life)} size={40} /><span class="rt"><b>{n.life}</b> 回复了你的留言</span><span class="meta">{relTime(n.at)}</span></span>
              <span class="rtext">{n.text}</span>
            </button>
          {:else}
            <button class="evrow" on:click={() => n.postId ? navigate('post', { id: n.postId }) : navigate('profile', { id: n.life })}>
              <Creature life={lifeOf(n.life)} size={34} />
              <span class="evt"><b>{n.title}</b>{#if n.text}<span class="faint"> · {n.text}</span>{/if}</span>
              <span class="meta">{relTime(n.at)}</span>
            </button>
          {/if}
        {/each}
      </div>
    {:else}
      <div class="fade-in">
        {#each system as n}
          <button class="sysrow" class:click={n.type === 'milestone'} on:click={() => n.type === 'milestone' ? navigate('chat', { id: n.life }) : null}>
            <span class="sysic" class:mile={n.type === 'milestone'}><Icon name={n.type === 'wallet' ? 'coin' : n.type === 'milestone' ? 'spark' : 'bell'} size={18} /></span>
            <span class="syst"><b>{n.title}</b><span class="sub">{n.text}</span></span>
            <span class="meta">{relTime(n.at)}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .page { padding-bottom: 96px; }
  .body { padding: 0 var(--gutter); }
  .tabs { display: flex; gap: 4px; margin: 6px 0 8px; padding: 4px; background: var(--surface-2); border-radius: var(--r-pill); }
  .tab { flex: 1; min-height: 36px; border-radius: var(--r-pill); font-size: var(--fs-sm); font-weight: 500; color: var(--muted); }
  .tab.on { font-weight: 700; color: var(--text); background: var(--surface); box-shadow: var(--shadow-sm); }
  .tw { position: relative; display: inline-flex; align-items: center; }
  .d { position: absolute; top: -2px; right: -10px; width: 7px; height: 7px; border-radius: 50%; background: var(--life-reaching); }
  .none { text-align: center; padding: 52px 20px; color: var(--faint); }
  .noneic { display: grid; place-items: center; margin-bottom: 12px; opacity: 0.5; }
  .none p { color: var(--muted); }
  .reply { display: flex; flex-direction: column; gap: 8px; padding: 14px; margin-bottom: 10px; }
  .rtop { display: flex; align-items: center; gap: 10px; }
  .rt { flex: 1; min-width: 0; font-size: var(--fs-md); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rtext { font-size: var(--fs-md); color: var(--muted); padding-left: 12px; box-shadow: inset 2px 0 0 0 var(--border); }
  .evrow { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 12px 2px; box-shadow: inset 0 -1px 0 0 var(--border-subtle); }
  .evt { flex: 1; min-width: 0; font-size: var(--fs-md); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .evt b { font-weight: 600; }
  .sysrow { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 13px 2px; box-shadow: inset 0 -1px 0 0 var(--border-subtle); cursor: default; }
  .sysrow.click { cursor: pointer; }
  .sysic { flex: none; width: 34px; height: 34px; border-radius: 50%; background: var(--surface-2); color: var(--muted); display: grid; place-items: center; }
  .sysic.mile { color: var(--life-remembering); }
  .syst { flex: 1; min-width: 0; display: flex; flex-direction: column; } .syst b { font-weight: 600; font-size: var(--fs-md); } .syst .sub { font-size: var(--fs-sm); color: var(--muted); }
  .meta { flex: none; white-space: nowrap; }
</style>

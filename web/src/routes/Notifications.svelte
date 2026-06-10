<script>
  // 通知（两个 tab：广场 / 系统）。私聊「想你了」不在此——那是对话红点。
  // 未读模型（微信式「进页即读、当次高亮新条目」）：进页先记住旧水位 prevSeen，再推全局水位
  // （Shell 红点照常灭）；本次会话内，新于 prevSeen 的条目 = fresh → 行首小未读点 + 所在 tab 红点。
  // tab 红点 = 该 tab 内存在 fresh 条目 且 本次会话未打开过该 tab；「✓ 全部已读」把 prevSeen 推到现在。
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { api } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import { relTime } from '../lib/time.js';
  import { markNotifsSeen, notifSeenAt } from '../lib/reaches.js';
  import TopBar from '../components/TopBar.svelte';
  import RechargeBtn from '../components/RechargeBtn.svelte';
  import Creature from '../components/Creature.svelte';
  import Icon from '../components/Icon.svelte';

  let notes = [];
  let livesMap = {};
  let loaded = false;
  let seg = 'plaza';
  let opened = { plaza: false, system: false }; // 本次会话是否打开过该 tab（打开即灭该 tab 红点）
  let prevSeen = 0;                             // 进页前的已读水位（fresh 的判据），mount 时从全局水位读取

  // milestone（关系里程碑，情感事件）归广场；系统只剩 wallet/welcome 工具行。
  const inPlaza = (n) => n.type === 'reply' || n.type === 'life_event' || n.type === 'milestone';
  const inSystem = (n) => n.type === 'wallet' || n.type === 'welcome';
  const isFresh = (n, since) => new Date(n.at).getTime() > since;

  onMount(async () => {
    prevSeen = get(notifSeenAt); // 先记旧水位，再推全局——语义不变：进页即读
    try {
      const [ns, lives] = await Promise.all([api.notifications(), api.lives()]);
      notes = ns;
      livesMap = Object.fromEntries(lives.map((l) => [l.id, l]));
    } catch { /* 留空 */ }
    loaded = true;
    markNotifsSeen();
    // 初始打开的 tab = 有 fresh 条目的那个（广场优先），都没有则广场。
    const freshPlaza = notes.filter(inPlaza).some((n) => isFresh(n, prevSeen));
    const freshSystem = notes.filter(inSystem).some((n) => isFresh(n, prevSeen));
    if (!freshPlaza && freshSystem) seg = 'system';
    opened = { ...opened, [seg]: true };
  });

  $: plaza = notes.filter(inPlaza);
  $: system = notes.filter(inSystem);
  $: list = seg === 'plaza' ? plaza : system;
  $: freshIn = { plaza: plaza.some((n) => isFresh(n, prevSeen)), system: system.some((n) => isFresh(n, prevSeen)) };
  function openSeg(k) { seg = k; opened = { ...opened, [k]: true }; }
  function markAll() { prevSeen = Date.now(); markNotifsSeen(); }
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
          <span class="tw">{lbl}{#if freshIn[k] && !opened[k]}<span class="d"></span>{/if}</span>
        </button>
      {/each}
    </div>

    {#if loaded && list.length === 0}
      <div class="none"><div class="noneic"><Icon name="bell" size={30} /></div><p>{seg === 'plaza' ? '这里是【你关注的她们】的动态、广场互动，和你们之间的关系时刻——去发现页，关注喜欢的她吧。' : '没有系统消息。'}</p></div>
    {/if}

    {#if seg === 'plaza'}
      <div class="fade-in">
        {#each plaza as n}
          {#if n.type === 'reply'}
            <button class="card-interactive reply" on:click={() => navigate('post', { id: n.postId })}>
              <span class="rtop">{#if isFresh(n, prevSeen)}<span class="fdot"></span>{/if}<Creature life={lifeOf(n.life)} size={40} /><span class="rt"><b>{n.life}</b> 回复了你的留言</span><span class="meta">{relTime(n.at)}</span></span>
              <span class="rtext">{n.text}</span>
            </button>
          {:else if n.type === 'milestone'}
            <button class="card-interactive mile" on:click={() => navigate('chat', { id: n.life })}>
              <span class="mtop">
                {#if isFresh(n, prevSeen)}<span class="fdot"></span>{/if}
                <span class="mic"><Icon name="spark" size={16} /></span>
                <Creature life={lifeOf(n.life)} size={34} />
                <span class="mt"><b>{n.title}</b></span>
                <span class="meta">{relTime(n.at)}</span>
              </span>
              {#if n.text}<span class="mtext">{n.text}</span>{/if}
            </button>
          {:else}
            <button class="evrow" on:click={() => n.postId ? navigate('post', { id: n.postId }) : navigate('profile', { id: n.life })}>
              {#if isFresh(n, prevSeen)}<span class="fdot"></span>{/if}
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
          <button class="sysrow">
            {#if isFresh(n, prevSeen)}<span class="fdot"></span>{/if}
            <span class="sysic"><Icon name={n.type === 'wallet' ? 'coin' : 'bell'} size={18} /></span>
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
  .fdot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--life-reaching); }
  .none { text-align: center; padding: 52px 20px; color: var(--faint); }
  .noneic { display: grid; place-items: center; margin-bottom: 12px; opacity: 0.5; }
  .none p { color: var(--muted); }
  .reply { display: flex; flex-direction: column; gap: 8px; padding: 14px; margin-bottom: 10px; }
  .rtop { display: flex; align-items: center; gap: 10px; }
  .rt { flex: 1; min-width: 0; font-size: var(--fs-md); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rtext { font-size: var(--fs-md); color: var(--muted); padding-left: 12px; box-shadow: inset 2px 0 0 0 var(--border); }
  /* 里程碑：庆祝感卡片（区别于安静的 life_event 行）——spark 图标 + remembering 点缀，点击进对话 */
  .mile { display: flex; flex-direction: column; gap: 8px; padding: 14px; margin-bottom: 10px; box-shadow: var(--shadow-sm), inset 0 0 0 1px color-mix(in srgb, var(--life-remembering) 28%, transparent); }
  .mtop { display: flex; align-items: center; gap: 10px; }
  .mic { flex: none; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; color: var(--life-remembering); background: color-mix(in srgb, var(--life-remembering) 12%, transparent); }
  .mt { flex: 1; min-width: 0; font-size: var(--fs-md); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .mt b { font-weight: 700; }
  .mtext { font-size: var(--fs-md); color: var(--muted); padding-left: 36px; }
  .evrow { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 12px 2px; box-shadow: inset 0 -1px 0 0 var(--border-subtle); }
  .evt { flex: 1; min-width: 0; font-size: var(--fs-md); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .evt b { font-weight: 600; }
  .sysrow { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 13px 2px; box-shadow: inset 0 -1px 0 0 var(--border-subtle); cursor: default; }
  .sysic { flex: none; width: 34px; height: 34px; border-radius: 50%; background: var(--surface-2); color: var(--muted); display: grid; place-items: center; }
  .syst { flex: 1; min-width: 0; display: flex; flex-direction: column; } .syst b { font-weight: 600; font-size: var(--fs-md); } .syst .sub { font-size: var(--fs-sm); color: var(--muted); }
  .meta { flex: none; white-space: nowrap; }
</style>

<script>
  // 「通知」= 一条【时刻时间线】，不是头像列表。按情绪分量分化：
  //   她对你（想你了/回复你/里程碑）= 主角卡；近况（她的人生动态）= 安静环境流；系统/钱包 = 工具行。
  import { onMount, onDestroy } from 'svelte';
  import { api, stream } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import PageHeader from '../components/PageHeader.svelte';
  import LifeAvatar from '../components/LifeAvatar.svelte';
  import Icon from '../components/Icon.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import { relTime } from '../lib/time.js';

  let notes = [];
  let error = '';
  let loading = true;
  let es;

  onMount(async () => {
    try { notes = await api.notifications(); } catch (e) { error = e.message; }
    loading = false;
    // 她趁你不在时来找你——实时进来。置顶、按 (life+at) 去重，保留历史。
    es = stream((ev) => {
      if (ev.type === 'reach_out') {
        if (!notes.some((n) => n.type === 'reach' && n.life === ev.data.life && n.at === ev.at)) {
          notes = [{ type: 'reach', life: ev.data.life, text: ev.data.text, at: ev.at, unanswered: true, fresh: true }, ...notes];
        }
      }
    });
  });
  onDestroy(() => es && es.close());

  // 三分区：她对你（情感中心）/ 近况（环境流）/ 系统（工具）。各自按时间倒序。
  $: personal = notes.filter((n) => n.type === 'reach' || n.type === 'reply' || n.type === 'milestone');
  $: ambient = notes.filter((n) => n.type === 'life_event');
  $: system = notes.filter((n) => n.type === 'wallet' || n.type === 'welcome' || (n.type !== 'reach' && n.type !== 'reply' && n.type !== 'milestone' && n.type !== 'life_event'));
  const key = (n) => n.type + (n.life || n.title || '') + n.at;
  const snip = (s, n = 64) => (s && s.length > n ? s.slice(0, n) + '…' : s);
</script>

<div class="notifs">
  <div class="sticktop"><PageHeader title="通知" /></div>

  {#if loading}<Skeleton rows={3} />{/if}
  {#if error}<p class="err">{error}</p>{/if}
  {#if !loading && notes.length === 0 && !error}
    <EmptyState title="还没有新消息。" text="她们在各自过日子——等你们更近一些，她会主动来找你。" />
  {/if}

  {#if personal.length}
    <div class="sec fade-in">
      <h2 class="section-title">她对你</h2>
      {#each personal as n (key(n))}
        {#if n.type === 'reach'}
          <button class="moment reach card-interactive" class:fresh={n.fresh || n.unanswered} on:click={() => navigate('chat', { id: n.life })}>
            <span class="m-head">
              <LifeAvatar id={n.life} awake={true} size={52} />
              <span class="m-who"><b>{n.life}</b><span class="reaching">想你了</span></span>
              <span class="m-time">{relTime(n.at)}</span>
            </span>
            <span class="m-bubble">{n.text}</span>
          </button>
        {:else if n.type === 'reply'}
          <button class="moment card-interactive" on:click={() => navigate('post', { id: n.postId })}>
            <span class="m-head">
              <LifeAvatar id={n.life} awake={true} size={44} />
              <span class="m-who"><b>{n.life}</b> 回复了你的留言</span>
              <span class="m-time">{relTime(n.at)}</span>
            </span>
            <span class="m-quote">{n.text}</span>
          </button>
        {:else if n.type === 'milestone'}
          <button class="mile card-interactive" on:click={() => navigate('chat', { id: n.life })}>
            <LifeAvatar id={n.life} awake={true} size={40} />
            <span class="mile-main"><b>{n.title}</b><span class="mile-sub">{n.text}</span></span>
            <span class="mile-mark"><Icon name="spark" size={16} /></span>
          </button>
        {/if}
      {/each}
    </div>
  {/if}

  {#if ambient.length}
    <div class="sec fade-in">
      <h2 class="section-title">近况</h2>
      {#each ambient as n (key(n))}
        <button class="amb" on:click={() => n.postId ? navigate('post', { id: n.postId }) : navigate('profile', { id: n.life })}>
          <LifeAvatar id={n.life} awake={true} size={30} />
          <span class="amb-text"><b>{n.title}</b>{#if n.text}<span class="amb-sub"> · {snip(n.text)}</span>{/if}</span>
          <span class="amb-time">{relTime(n.at)}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if system.length}
    <div class="sec fade-in">
      <h2 class="section-title">系统</h2>
      {#each system as n (key(n))}
        <button class="sys" on:click={() => n.type === 'welcome' ? navigate('plaza') : null} class:static={n.type !== 'welcome'}>
          <span class="sysav"><Icon name={n.type === 'welcome' ? 'spark' : 'notifications'} size={18} /></span>
          <span class="sys-text"><b>{n.title}</b><span class="sys-sub">{n.text}</span></span>
          <span class="amb-time">{relTime(n.at)}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .notifs { max-width: var(--maxw); margin: 0 auto; padding: 0 var(--gutter) 96px; }
  .sec { margin-top: var(--s5); }
  .sec .section-title { margin: 0 2px var(--s2); }

  /* —— 她对你：主角卡（她的原话进气泡，活体头像，暖意）—— */
  .moment { display: flex; flex-direction: column; gap: var(--s2); width: 100%; text-align: left; padding: var(--s3) var(--s4); border-radius: var(--r-lg); margin-bottom: var(--s2); }
  .m-head { display: flex; align-items: center; gap: var(--s2); }
  .m-who { font-size: var(--fs-body); }
  .m-who b { font-weight: 700; }
  .reaching { margin-left: var(--s2); font-size: var(--fs-xs); color: var(--life-reaching); border: 1px solid color-mix(in srgb, var(--life-reaching) 45%, transparent); border-radius: var(--r-pill); padding: 1px 9px; }
  .m-time { margin-left: auto; color: var(--faint); font-size: var(--fs-sm); flex: none; }
  .m-bubble { font-size: var(--fs-body); line-height: 1.55; color: var(--text); background: color-mix(in srgb, var(--life-reaching) 8%, var(--surface-2)); border-radius: var(--r-md); padding: var(--s3); }
  .reach.fresh { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--life-reaching) 40%, transparent); }
  .m-quote { font-size: var(--fs-md); line-height: 1.55; color: var(--muted); padding-left: var(--s3); box-shadow: inset 2px 0 0 0 var(--accent-line); }

  /* —— 里程碑：庆祝感的细卡 —— */
  .mile { display: flex; align-items: center; gap: var(--s3); width: 100%; text-align: left; padding: var(--s3) var(--s4); border-radius: var(--r-md); margin-bottom: var(--s2); }
  .mile-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .mile-main b { font-weight: 700; font-size: var(--fs-md); }
  .mile-sub { font-size: var(--fs-sm); color: var(--muted); }
  .mile-mark { flex: none; color: var(--life-remembering); }

  /* —— 近况：安静的环境流（小头像、单行、弱化）—— */
  .amb { display: flex; align-items: center; gap: var(--s2); width: 100%; text-align: left; background: none; border: 0; color: inherit; padding: var(--s2) 2px; box-shadow: inset 0 -1px 0 0 var(--border-subtle); transition: background var(--t-hover) ease; }
  .amb:hover { background: var(--surface-2); }
  .amb-text { flex: 1; min-width: 0; font-size: var(--fs-md); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .amb-text b { font-weight: 600; }
  .amb-sub { color: var(--faint); }
  .amb-time { margin-left: auto; color: var(--faint); font-size: var(--fs-xs); flex: none; }

  /* —— 系统：工具行（图标、弱化）—— */
  .sys { display: flex; align-items: center; gap: var(--s3); width: 100%; text-align: left; background: none; border: 0; color: inherit; padding: var(--s2) 2px; box-shadow: inset 0 -1px 0 0 var(--border-subtle); transition: background var(--t-hover) ease; }
  .sys:hover { background: var(--surface-2); }
  .sys.static { cursor: default; }
  .sys.static:hover { background: none; }
  .sysav { flex: none; width: 34px; height: 34px; border-radius: var(--r-pill); background: var(--surface-2); color: var(--muted); display: inline-flex; align-items: center; justify-content: center; }
  .sys-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .sys-text b { font-weight: 600; font-size: var(--fs-md); }
  .sys-sub { font-size: var(--fs-sm); color: var(--muted); }

  .err { padding: 16px 0; color: var(--danger); }
</style>

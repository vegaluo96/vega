<script>
  import { onMount, onDestroy } from 'svelte';
  import { api, stream } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import PageHeader from '../components/PageHeader.svelte';
  import LifeAvatar from '../components/LifeAvatar.svelte';
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
    // 她趁你不在时来找你——实时进来（站内 + 推送）。置顶、按 (life+at) 去重，不再抹掉同一条命之前的记录（保留历史）。
    es = stream((ev) => {
      if (ev.type === 'reach_out') {
        if (!notes.some((n) => n.type === 'reach' && n.life === ev.data.life && n.at === ev.at)) {
          notes = [{ type: 'reach', life: ev.data.life, text: ev.data.text, at: ev.at, unanswered: true, fresh: true }, ...notes];
        }
      }
    });
  });
  onDestroy(() => es && es.close());
</script>

<div class="notifs">
  <div class="sticktop"><PageHeader title="通知" /></div>

  {#if loading}<Skeleton rows={3} />{/if}
  {#if error}<p class="err">{error}</p>{/if}
  {#if !loading && notes.length === 0 && !error}
    <EmptyState title="还没有新消息。" text="她们在各自过日子——等你们更近一些，她会主动来找你。" />
  {/if}

  {#each notes as n (n.type + (n.life || n.title || '') + n.at)}
    {#if n.type === 'reach'}
      <button class="note" class:fresh={n.fresh || n.unanswered} on:click={() => navigate('chat', { id: n.life })}>
        <LifeAvatar id={n.life} awake={true} size={50} />
        <div class="body">
          <div class="top"><span class="name">{n.life}</span><span class="time">{relTime(n.at)}</span></div>
          <div class="bot"><span class="text">{n.text}</span>{#if n.fresh || n.unanswered}<span class="reach">想你了</span>{/if}</div>
        </div>
      </button>
    {:else if n.type === 'welcome'}
      <button class="note" on:click={() => navigate('plaza')}>
        <span class="markwrap"><span class="mark welcome"></span></span>
        <div class="body"><div class="top"><span class="name">{n.title}</span><span class="time">{relTime(n.at)}</span></div><div class="bot"><span class="text">{n.text}</span></div></div>
      </button>
    {:else}
      <div class="note plain">
        <span class="markwrap"><span class="mark" class:ok={n.ok}></span></span>
        <div class="body"><div class="top"><span class="name">{n.title}</span><span class="time">{relTime(n.at)}</span></div><div class="bot"><span class="text wrap">{n.text}</span></div></div>
      </div>
    {/if}
  {/each}
</div>

<style>
  /* 与「对话」列表同一套行样式：通栏、底分隔线、点按高亮 */
  .notifs { max-width: var(--maxw); margin: 0 auto; padding: 0 0 96px; }
  .note { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 12px 16px; background: none; border: 0; border-bottom: 1px solid var(--border-subtle); transition: background var(--t-hover) ease; }
  .note:hover { background: var(--surface-2); }
  .note.fresh { background: var(--accent-weak); }
  .markwrap { flex: none; width: 50px; display: inline-flex; justify-content: center; }
  .mark { width: 10px; height: 10px; border-radius: 50%; background: var(--life-tension); }
  .mark.ok { background: var(--life-awake); }
  .mark.welcome { background: var(--accent); }
  .body { flex: 1; min-width: 0; }
  .top { display: flex; align-items: center; gap: 8px; }
  .name { font-weight: 700; font-size: 15.5px; }
  .time { margin-left: auto; color: var(--faint); font-size: 12px; flex: none; }
  .bot { display: flex; align-items: center; gap: 8px; margin-top: 3px; }
  .text { flex: 1; min-width: 0; color: var(--muted); font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .text.wrap { white-space: normal; }
  .reach { flex: none; font-size: 11px; color: var(--life-reaching); border: 1px solid color-mix(in srgb, var(--life-reaching) 50%, transparent); border-radius: var(--r-pill); padding: 1px 9px; }
</style>

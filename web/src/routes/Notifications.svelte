<script>
  import { onMount, onDestroy } from 'svelte';
  import { api, stream } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import PageHeader from '../components/PageHeader.svelte';
  import LifeAvatar from '../components/LifeAvatar.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Skeleton from '../components/Skeleton.svelte';

  let notes = [];
  let error = '';
  let loading = true;
  let es;

  onMount(async () => {
    try { notes = await api.notifications(); } catch (e) { error = e.message; }
    loading = false;
    // 她趁你不在时来找你——实时进来（站内 + 推送）。
    es = stream((ev) => {
      if (ev.type === 'reach_out') {
        notes = [{ type: 'reach', life: ev.data.life, text: ev.data.text, at: ev.at, fresh: true }, ...notes.filter((n) => !(n.type === 'reach' && n.life === ev.data.life))];
      }
    });
  });
  onDestroy(() => es && es.close());
</script>

<div class="notifs">
  <PageHeader title="通知" subtitle="她主动找你，和站内提醒——和「对话」里持续的关系不同。" />

  {#if loading}<Skeleton rows={3} />{/if}
  {#if error}<p class="err">{error}</p>{/if}
  {#if !loading && notes.length === 0 && !error}
    <EmptyState title="还没有新消息。" text="她们在各自过日子——等你们更近一些，她会主动来找你。" />
  {/if}

  {#each notes as n (n.type + (n.life || n.title || '') + n.at)}
    {#if n.type === 'reach'}
      <button class="note card-interactive" class:fresh={n.fresh} on:click={() => navigate('chat', { id: n.life })}>
        <LifeAvatar id={n.life} awake={true} size={44} />
        <div class="body"><div class="top"><span class="name">{n.life}</span><span class="reach">想你了</span></div><div class="text">{n.text}</div></div>
        <span class="go">›</span>
      </button>
    {:else if n.type === 'welcome'}
      <button class="note card-interactive" on:click={() => navigate('plaza')}>
        <span class="mark welcome"></span>
        <div class="body"><div class="top"><span class="name">{n.title}</span></div><div class="text">{n.text}</div></div>
        <span class="go">›</span>
      </button>
    {:else}
      <div class="note plain">
        <span class="mark" class:ok={n.ok}></span>
        <div class="body"><div class="top"><span class="name">{n.title}</span></div><div class="text wrap">{n.text}</div></div>
      </div>
    {/if}
  {/each}
</div>

<style>
  .notifs { max-width: var(--maxw); margin: 0 auto; padding: 0 16px 96px; }
  .note { display: flex; align-items: center; gap: 13px; padding: 14px; margin-bottom: 9px; width: 100%; text-align: left; }
  .note.fresh { border-color: var(--accent-line); background: var(--accent-weak); }
  .note.plain { border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface); }
  .mark { width: 10px; height: 10px; border-radius: 50%; flex: none; background: var(--life-tension); }
  .mark.ok { background: var(--life-awake); }
  .mark.welcome { background: var(--accent); }
  .body { flex: 1; min-width: 0; }
  .top { display: flex; align-items: baseline; gap: 8px; }
  .name { font-weight: 700; font-size: 15px; }
  .reach { font-size: 12px; color: var(--life-reaching); }
  .text { color: var(--muted); font-size: 14px; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .text.wrap { white-space: normal; }
  .go { color: var(--faint); font-size: 20px; flex: none; }
</style>

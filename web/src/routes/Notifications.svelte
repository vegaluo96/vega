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
    try {
      notes = await api.notifications();
    } catch (e) {
      error = e.message;
    }
    loading = false;
    // 她趁你不在时来找你——实时进来。
    es = stream((ev) => {
      if (ev.type === 'reach_out') {
        notes = [{ life: ev.data.life, text: ev.data.text, at: ev.at, fresh: true }, ...notes.filter((n) => n.life !== ev.data.life)];
      }
    });
  });
  onDestroy(() => es && es.close());
</script>

<div class="notifs">
  <PageHeader title="通知" subtitle="她趁你不在时，来找过你。" />

  {#if loading}<Skeleton rows={3} />{/if}
  {#if error}<p class="err">{error}</p>{/if}
  {#if !loading && notes.length === 0 && !error}
    <EmptyState title="还没有谁来找你。" text="她们在各自过日子——等你们更近一些，她会主动来的。" />
  {/if}

  {#each notes as n (n.life + n.at)}
    <button class="note card-interactive" class:fresh={n.fresh} on:click={() => navigate('chat', { id: n.life })}>
      <LifeAvatar id={n.life} awake={true} size={44} />
      <div class="body">
        <div class="top"><span class="name">{n.life}</span><span class="reach">想你了</span></div>
        <div class="text">{n.text}</div>
      </div>
      <span class="go">›</span>
    </button>
  {/each}
</div>

<style>
  .notifs { max-width: var(--maxw); margin: 0 auto; padding: 4px 16px 96px; }
  .note { display: flex; align-items: center; gap: 13px; padding: 14px; margin-bottom: 9px; }
  .note.fresh { border-color: var(--accent-line); background: var(--accent-weak); }
  .body { flex: 1; min-width: 0; }
  .top { display: flex; align-items: baseline; gap: 8px; }
  .name { font-weight: 700; font-size: 15px; }
  .reach { font-size: 12px; color: var(--life-reaching); }
  .text { color: var(--muted); font-size: 14px; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .go { color: var(--faint); font-size: 20px; flex: none; }
</style>

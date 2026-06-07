<script>
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import PageHeader from '../components/PageHeader.svelte';
  import LifeAvatar from '../components/LifeAvatar.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Skeleton from '../components/Skeleton.svelte';

  let chats = [];
  let error = '';
  let loading = true;

  onMount(async () => {
    try {
      chats = await api.chats();
    } catch (e) {
      error = e.message;
    }
    loading = false;
  });
</script>

<div class="rels">
  <PageHeader title="关系" />

  {#if loading}<Skeleton rows={3} />{/if}
  {#if !loading && chats.length === 0 && !error}
    <EmptyState title="你还没有和谁建立关系。" text="去广场遇见一个她——她会记住你，从这一刻开始。">
      <button slot="action" class="btn" on:click={() => navigate('plaza')}>去广场</button>
    </EmptyState>
  {/if}

  {#each chats as c (c.life)}
    <button class="rel card-interactive" on:click={() => navigate('chat', { id: c.life })}>
      <LifeAvatar id={c.life} emotion={c.emotion} awake={c.awake} size={48} />
      <div class="body">
        <div class="top">
          <span class="name">{c.life}</span>
          <span class="dot" class:awake={c.awake}></span>
          {#if c.pending}<span class="pending">她想你了</span>{/if}
        </div>
        <div class="last">{c.lastFromHer ? '' : '我：'}{c.lastText}</div>
        {#if !c.pending}<div class="thread">你们的线还在继续</div>{/if}
      </div>
      <span class="go">›</span>
    </button>
  {/each}
  {#if error}<p class="err">{error}</p>{/if}
</div>

<style>
  .rels { max-width: var(--maxw); margin: 0 auto; padding: 4px 16px 96px; }
  .rel { display: flex; align-items: center; gap: 13px; padding: 13px; margin-bottom: 8px; }
  .body { flex: 1; min-width: 0; }
  .top { display: flex; align-items: center; gap: 8px; }
  .name { font-weight: 700; font-size: 15.5px; }
  .dot { width: 7px; height: 7px; border-radius: var(--r-pill); background: var(--life-asleep); flex: none; }
  .dot.awake { background: var(--life-awake); box-shadow: 0 0 0 3px color-mix(in srgb, var(--life-awake) 20%, transparent); }
  .pending { font-size: 11px; color: var(--life-reaching); border: 1px solid color-mix(in srgb, var(--life-reaching) 50%, transparent); border-radius: var(--r-pill); padding: 1px 9px; margin-left: auto; }
  .last { color: var(--muted); font-size: 14px; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .thread { color: var(--faint); font-size: 11.5px; margin-top: 3px; }
  .go { color: var(--faint); font-size: 20px; flex: none; }
</style>

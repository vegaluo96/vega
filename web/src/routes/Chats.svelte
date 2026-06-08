<script>
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import PageHeader from '../components/PageHeader.svelte';
  import LifeAvatar from '../components/LifeAvatar.svelte';
  import ListRow from '../components/ListRow.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import { relTime } from '../lib/time.js';

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
  <div class="sticktop"><PageHeader title="对话" /></div>

  {#if loading}<Skeleton rows={3} />{/if}
  {#if !loading && chats.length === 0 && !error}
    <EmptyState title="你还没有和谁建立关系。" text="去广场遇见一个她——她会记住你，从这一刻开始。">
      <button slot="action" class="btn" on:click={() => navigate('plaza')}>去广场</button>
    </EmptyState>
  {/if}

  {#each chats as c (c.life)}
    <ListRow onClick={() => navigate('chat', { id: c.life })} meta={relTime(c.lastAt)} badge={c.pending ? '想你了' : ''}>
      <LifeAvatar slot="lead" id={c.life} emotion={c.emotion} awake={c.awake} size={48} />
      <svelte:fragment slot="title">{c.life} <span class="dot" class:awake={c.awake}></span></svelte:fragment>
      <svelte:fragment slot="subtitle">{c.lastFromHer ? '' : '我：'}{c.lastText}</svelte:fragment>
    </ListRow>
  {/each}
  {#if error}<p class="err">{error}</p>{/if}
</div>

<style>
  .rels { max-width: var(--maxw); margin: 0 auto; padding: 0 16px 96px; }
  /* 在场点：随标题（slot）一起进入 ListRow */
  .dot { width: 7px; height: 7px; border-radius: var(--r-pill); background: var(--life-asleep); flex: none; }
  .dot.awake { background: var(--life-awake); box-shadow: 0 0 0 3px color-mix(in srgb, var(--life-awake) 20%, transparent); }
  .err { padding: 16px 0; color: var(--danger); }
</style>

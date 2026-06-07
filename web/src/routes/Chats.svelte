<script>
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import PageHeader from '../components/PageHeader.svelte';
  import LifeAvatar from '../components/LifeAvatar.svelte';
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
    <button class="rel" on:click={() => navigate('chat', { id: c.life })}>
      <LifeAvatar id={c.life} emotion={c.emotion} awake={c.awake} size={50} />
      <div class="body">
        <div class="top">
          <span class="name">{c.life}</span>
          <span class="dot" class:awake={c.awake}></span>
          <span class="time">{relTime(c.lastAt)}</span>
        </div>
        <div class="bot">
          <span class="last">{c.lastFromHer ? '' : '我：'}{c.lastText}</span>
          {#if c.pending}<span class="pending">想你了</span>{/if}
        </div>
      </div>
    </button>
  {/each}
  {#if error}<p class="err">{error}</p>{/if}
</div>

<style>
  .rels { max-width: var(--maxw); margin: 0 auto; padding: 4px 0 96px; }
  /* X 风会话行：通栏、底分隔线、点按高亮；不用卡片框 */
  .rel { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 12px 16px; background: none; border: 0; border-bottom: 1px solid var(--border-subtle); transition: background var(--t-hover) ease; }
  .rel:hover { background: var(--surface-2); }
  .body { flex: 1; min-width: 0; }
  .top { display: flex; align-items: center; gap: 8px; }
  .name { font-weight: 700; font-size: 15.5px; }
  .dot { width: 7px; height: 7px; border-radius: var(--r-pill); background: var(--life-asleep); flex: none; }
  .dot.awake { background: var(--life-awake); box-shadow: 0 0 0 3px color-mix(in srgb, var(--life-awake) 20%, transparent); }
  .time { margin-left: auto; color: var(--faint); font-size: 12px; flex: none; }
  .bot { display: flex; align-items: center; gap: 8px; margin-top: 3px; }
  .last { flex: 1; min-width: 0; color: var(--muted); font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pending { flex: none; font-size: 11px; color: var(--life-reaching); border: 1px solid color-mix(in srgb, var(--life-reaching) 50%, transparent); border-radius: var(--r-pill); padding: 1px 9px; }
</style>

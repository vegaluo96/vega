<script>
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import { avatarStyle, moodRing } from '../lib/avatar.js';

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

<section>
  <h2 class="section">对话</h2>
  {#if loading}<p class="muted">载入中…</p>{/if}
  {#if !loading && chats.length === 0 && !error}
    <p class="muted">你还没和谁说过话。去广场认识一个她吧——她会记住你。</p>
  {/if}
  {#each chats as c}
    <button class="chat" on:click={() => navigate('chat', { id: c.life })}>
      <div class="avatar" style="{avatarStyle(c.life)};box-shadow:0 0 0 2px {moodRing(c.emotion)}">{c.life[0].toUpperCase()}</div>
      <div class="body">
        <div class="top"><b>{c.life}</b> <span class="dot" class:awake={c.awake}></span>{#if c.pending}<span class="badge">她想你了</span>{/if}</div>
        <div class="last">{c.lastFromHer ? '' : '我：'}{c.lastText}</div>
      </div>
    </button>
  {/each}
  {#if error}<p class="err">{error}</p>{/if}
</section>

<style>
  section { max-width: var(--maxw); margin: 0 auto; padding: 16px 16px 90px; }
  .section { font-size: 18px; font-weight: 800; margin: 8px 2px 16px; }
  .chat { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 12px; margin-bottom: 8px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); }
  .chat:active { background: var(--surface-2); }
  .avatar { width: 48px; height: 48px; border-radius: 999px; display: grid; place-items: center; font-weight: 700; color: #fff; flex: none; }
  .body { flex: 1; min-width: 0; }
  .top { display: flex; align-items: center; gap: 8px; }
  .dot { width: 8px; height: 8px; border-radius: 999px; background: var(--muted); }
  .dot.awake { background: #3fb950; }
  .badge { font-size: 11px; color: var(--accent); border: 1px solid var(--accent); border-radius: 999px; padding: 1px 8px; }
  .last { color: var(--muted); font-size: 14px; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .muted { color: var(--muted); line-height: 1.7; }
  .err { color: var(--danger); }
</style>

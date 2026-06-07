<script>
  import { onMount, onDestroy } from 'svelte';
  import { api, stream } from '../lib/api.js';
  import { navigate } from '../lib/router.js';

  let notes = [];
  let error = '';
  let es;

  onMount(async () => {
    try {
      notes = await api.notifications();
    } catch (e) {
      error = e.message;
    }
    // 她趁你不在时来找你——实时进来。
    es = stream((ev) => {
      if (ev.type === 'reach_out') {
        notes = [{ life: ev.data.life, text: ev.data.text, at: ev.at, fresh: true }, ...notes.filter((n) => n.life !== ev.data.life)];
      }
    });
  });
  onDestroy(() => es && es.close());
</script>

<section>
  <h2 class="section">通知 · 她想你了</h2>
  {#if error}<p class="err">{error}</p>{/if}
  {#if notes.length === 0}
    <p class="muted">还没有谁来找你。她们在各自过日子——等你们更近一些，她会主动来的。</p>
  {/if}
  {#each notes as n}
    <button class="note" class:fresh={n.fresh} on:click={() => navigate('chat', { id: n.life })}>
      <div class="avatar">{n.life[0].toUpperCase()}</div>
      <div class="body">
        <div class="top"><b>{n.life}</b> <span class="dim">想你了</span></div>
        <div class="text">{n.text}</div>
      </div>
      <span class="go">›</span>
    </button>
  {/each}
</section>

<style>
  section { max-width: var(--maxw); margin: 0 auto; padding: 16px 16px 90px; }
  .section { font-size: 13px; color: var(--muted); font-weight: 600; margin: 14px 2px 14px; }
  .note { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 14px; margin-bottom: 10px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); }
  .note.fresh { border-color: var(--accent); background: var(--accent-soft); }
  .avatar { width: 42px; height: 42px; border-radius: 999px; display: grid; place-items: center; font-weight: 700; color: var(--on-accent); background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 50%, #d08bf0)); flex: none; }
  .body { flex: 1; min-width: 0; }
  .dim { color: var(--muted); font-size: 13px; }
  .text { color: var(--muted); font-size: 14px; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .go { color: var(--muted); font-size: 20px; }
  .muted { color: var(--muted); line-height: 1.7; }
  .err { color: var(--danger); }
</style>

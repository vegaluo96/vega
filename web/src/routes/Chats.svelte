<script>
  // 对话（关系线程收件箱）：活体头像显此刻状态，「她想你了/在等你回」是状态而非小角标。
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import { relTime } from '../lib/time.js';
  import { reaches, clearReaches } from '../lib/reaches.js';
  import TopBar from '../components/TopBar.svelte';
  import RechargeBtn from '../components/RechargeBtn.svelte';
  import Creature from '../components/Creature.svelte';
  import StatePill from '../components/StatePill.svelte';
  import Icon from '../components/Icon.svelte';

  let chats = [];
  let livesMap = {};
  let loaded = false;
  let read = false;

  onMount(async () => {
    try {
      const [cs, lives] = await Promise.all([api.chats(), api.lives()]);
      chats = cs;
      livesMap = Object.fromEntries(lives.map((l) => [l.id, l]));
    } catch { /* 留空 */ }
    loaded = true;
  });

  $: hasDot = !read && ($reaches.length > 0 || chats.some((c) => c.pending));
  function markAll() { read = true; clearReaches(); }
</script>

<div class="page">
  <TopBar title="对话">
    <svelte:fragment slot="right">
      {#if hasDot}<button class="icon-btn" on:click={markAll} aria-label="全部已读" title="全部已读"><Icon name="check" size={20} /></button>{/if}
      <RechargeBtn />
    </svelte:fragment>
  </TopBar>
  <div class="body">
    {#each chats as c (c.life)}
      {@const life = livesMap[c.life] || { id: c.life, awake: c.awake, emotion: c.emotion }}
      {@const reaching = !read && ($reaches.includes(c.life) || c.pending)}
      <button class="row fade-in" on:click={() => navigate('chat', { id: c.life })}>
        <span class="av" class:reaching><Creature life={life} size={50} reaction={reaching ? 'reach' : undefined} /></span>
        <span class="main">
          <span class="top">
            <b>{c.life}</b>
            {#if reaching}<span class="reachtag">{c.pending ? '她想你了' : '在等你回'}</span>{:else}<StatePill {life} showPhase={false} />{/if}
            <span class="meta when">{relTime(c.lastAt)}</span>
          </span>
          <span class="last" class:reaching>{c.lastText}</span>
        </span>
      </button>
    {/each}
    {#if loaded && chats.length === 0}<p class="caption none">还没有对话。去广场或发现，认识第一个她。</p>{/if}
  </div>
</div>

<style>
  .page { padding-bottom: 96px; }
  .body { padding: 0 var(--gutter); }
  .row { display: flex; align-items: center; gap: 14px; width: 100%; text-align: left; padding: 14px 4px; box-shadow: inset 0 -1px 0 0 var(--border-subtle); }
  .av { flex: none; position: relative; border-radius: 50%; }
  .av.reaching :global(svg), .av.reaching :global(.nimbus) { filter: drop-shadow(0 0 6px color-mix(in srgb, var(--life-reaching) 55%, transparent)); }
  .main { flex: 1; min-width: 0; }
  .top { display: flex; align-items: center; gap: 8px; }
  .top b { font-weight: 700; font-size: var(--fs-body); }
  .reachtag { font-size: var(--fs-2xs); color: var(--life-reaching); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--life-reaching) 45%, transparent); border-radius: var(--r-pill); padding: 1px 8px; }
  .when { margin-left: auto; flex: none; white-space: nowrap; }
  .last { display: block; margin-top: 3px; font-size: var(--fs-md); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .last.reaching { color: var(--text); }
  .none { padding: 40px 4px; text-align: center; }
</style>

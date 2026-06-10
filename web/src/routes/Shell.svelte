<script>
  // 应用外壳：底部 5 tab（纯图标，红点模型）+ 路由 + SSE + 微信绑定弹层。沉浸页（对话/资料/心声/充值）隐藏底栏。
  import { onMount, onDestroy } from 'svelte';
  import { route, navigate } from '../lib/router.js';
  import { api, stream } from '../lib/api.js';
  import { reaches, addReach, notifSeenAt } from '../lib/reaches.js';
  import { bindSheet, closeBind } from '../lib/sheets.js';
  import { hydrateFollows } from '../lib/follows.js';
  import Icon from '../components/Icon.svelte';
  import WechatBind from '../components/WechatBind.svelte';
  import Plaza from './Plaza.svelte';
  import Explore from './Explore.svelte';
  import Chats from './Chats.svelte';
  import Chat from './Chat.svelte';
  import LifeProfile from './LifeProfile.svelte';
  import PostDetail from './PostDetail.svelte';
  import Me from './Me.svelte';
  import Notifications from './Notifications.svelte';
  import Recharge from './Recharge.svelte';

  // [路由键, 图标, 可读标签]——标签同时用于 aria-label / title（无障碍：屏幕阅读器读得出"广场"而非"plaza"）。
  const TABS = [['plaza', 'plaza', '广场'], ['explore', 'explore', '发现'], ['chats', 'chats', '对话'], ['notifications', 'notifications', '通知'], ['me', 'me', '我']];
  let notes = [];
  let es;
  let lastNotesAt = 0;
  // 通知红点实时化：广场/系统类通知在 app 开着时也即时点亮（不必重进才刷新）。节流 12s，避免频繁 musing 刷爆。
  async function refreshNotes() {
    if (Date.now() - lastNotesAt < 12000) return;
    lastNotesAt = Date.now();
    try { notes = await api.notifications(); } catch { /* ignore */ }
  }

  onMount(async () => {
    hydrateFollows();
    // 种红点：把"她趁你不在时来找你"（未回）填进对话红点；拉通知算系统红点。
    try { const chats = await api.chats(); chats.forEach((c) => { if (c.pending) addReach(c.life); }); } catch { /* ignore */ }
    lastNotesAt = Date.now();
    try { notes = await api.notifications(); } catch { /* ignore */ }
    es = stream((ev) => {
      if (ev.type === 'reach_out') addReach(ev.data.life);            // 私聊：对话红点（绝不进通知）
      else if (ev.type === 'musing' || ev.type === 'feed_comment') refreshNotes(); // 广场动态/留言回应 → 刷新通知红点
    });
  });
  onDestroy(() => es && es.close());

  $: activeTab = TABS.some(([k]) => k === $route.name) ? $route.name : 'plaza';
  $: immersive = ['chat', 'profile', 'post', 'recharge'].includes($route.name);
  $: chatsDot = $reaches.length > 0;
  $: notifDot = notes.some((n) => n.type !== 'reach' && new Date(n.at).getTime() > $notifSeenAt);
  $: dots = { chats: chatsDot, notifications: notifDot };
</script>

<div class="app" class:immersive>
  <nav>
    <div class="brand">ZSKY</div>
    {#each TABS as [k, ico, label]}
      <button class:active={activeTab === k} class:userentry={k === 'me'} on:click={() => navigate(k)} aria-label={label} title={label}>
        <span class="ic">
          <Icon name={ico} size={25} sw={activeTab === k ? 2.3 : 1.8} />
          {#if dots[k]}<span class="reddot"></span>{/if}
        </span>
      </button>
    {/each}
  </nav>

  <main class="content">
    {#if $route.name === 'chat'}{#key $route.params.id}<Chat lifeId={$route.params.id} />{/key}
    {:else if $route.name === 'profile'}{#key $route.params.id}<LifeProfile lifeId={$route.params.id} />{/key}
    {:else if $route.name === 'post'}{#key $route.params.id}<PostDetail postId={$route.params.id} />{/key}
    {:else if $route.name === 'recharge'}<Recharge />
    {:else if $route.name === 'explore'}<Explore />
    {:else if $route.name === 'notifications'}<Notifications />
    {:else if $route.name === 'chats'}<Chats />
    {:else if $route.name === 'me'}<Me />
    {:else}<Plaza />{/if}
  </main>

  {#if $bindSheet}<WechatBind lifeId={$bindSheet.lifeId} onClose={closeBind} />{/if}
</div>

<style>
  .content { min-height: 100vh; min-height: 100dvh; }
  nav { position: fixed; bottom: 0; left: 0; right: 0; z-index: 20; display: flex; align-items: stretch; background: color-mix(in srgb, var(--bg) 80%, transparent); backdrop-filter: saturate(160%) blur(12px); -webkit-backdrop-filter: saturate(160%) blur(12px); box-shadow: inset 0 1px 0 0 var(--border-subtle); padding-bottom: env(safe-area-inset-bottom); }
  nav .brand { display: none; }
  nav button { flex: 1; display: flex; align-items: center; justify-content: center; padding: 14px 0; color: var(--faint); }
  nav button.active { color: var(--text); }
  .ic { position: relative; display: inline-flex; }
  .reddot { position: absolute; top: -1px; right: -3px; width: 8px; height: 8px; border-radius: 50%; background: var(--life-reaching); box-shadow: 0 0 0 2px var(--bg); }
  .app.immersive nav { display: none; }

  @media (min-width: 1000px) {
    .app { display: flex; max-width: 1000px; margin: 0 auto; align-items: flex-start; }
    .app.immersive nav { display: flex; }
    nav { position: sticky; top: 0; left: auto; right: auto; bottom: auto; flex-direction: column; justify-content: flex-start; align-items: center; gap: 6px; width: 76px; height: 100vh; height: 100dvh; padding: 20px 10px 18px; box-shadow: inset -1px 0 0 0 var(--border); backdrop-filter: none; background: var(--bg); }
    nav .brand { display: block; font-weight: 800; letter-spacing: 0.08em; font-size: var(--fs-sm); padding: 4px 0 16px; color: var(--text); }
    nav button { flex: none; width: 48px; height: 48px; border-radius: var(--r-md); color: var(--muted); }
    nav button.userentry { margin-top: auto; }
    nav button.active { background: var(--surface-2); color: var(--text); }
    .content { flex: 1; min-width: 0; box-shadow: inset -1px 0 0 0 var(--border); }
  }
</style>

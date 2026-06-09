<script>
  import { onMount, onDestroy } from 'svelte';
  import { api, stream } from '../lib/api.js';
  import { navigate } from '../lib/router.js';
  import PageHeader from '../components/PageHeader.svelte';
  import LifeAvatar from '../components/LifeAvatar.svelte';
  import ListRow from '../components/ListRow.svelte';
  import Icon from '../components/Icon.svelte';
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
      <ListRow onClick={() => navigate('chat', { id: n.life })} highlight={n.fresh || n.unanswered} meta={relTime(n.at)} badge={(n.fresh || n.unanswered) ? '想你了' : ''}>
        <LifeAvatar slot="lead" id={n.life} awake={true} size={48} />
        <svelte:fragment slot="title">{n.life}</svelte:fragment>
        <svelte:fragment slot="subtitle">{n.text}</svelte:fragment>
      </ListRow>
    {:else if n.type === 'reply'}
      <ListRow onClick={() => navigate('post', { id: n.postId })} meta={relTime(n.at)} badge="回复你" wrap>
        <LifeAvatar slot="lead" id={n.life} awake={true} size={48} />
        <svelte:fragment slot="title">{n.title}</svelte:fragment>
        <svelte:fragment slot="subtitle">{n.text}</svelte:fragment>
      </ListRow>
    {:else if n.type === 'milestone'}
      <ListRow onClick={() => navigate('chat', { id: n.life })} meta={relTime(n.at)}>
        <LifeAvatar slot="lead" id={n.life} awake={true} size={48} />
        <svelte:fragment slot="title">{n.title}</svelte:fragment>
        <svelte:fragment slot="subtitle">{n.text}</svelte:fragment>
      </ListRow>
    {:else if n.type === 'life_event'}
      <ListRow onClick={() => n.postId ? navigate('post', { id: n.postId }) : navigate('profile', { id: n.life })} meta={relTime(n.at)} wrap>
        <LifeAvatar slot="lead" id={n.life} awake={true} size={48} />
        <svelte:fragment slot="title">{n.title}</svelte:fragment>
        <svelte:fragment slot="subtitle">{n.text}</svelte:fragment>
      </ListRow>
    {:else if n.type === 'welcome'}
      <ListRow onClick={() => navigate('plaza')} meta={relTime(n.at)}>
        <span slot="lead" class="sysav"><Icon name="spark" size={22} /></span>
        <svelte:fragment slot="title">{n.title}</svelte:fragment>
        <svelte:fragment slot="subtitle">{n.text}</svelte:fragment>
      </ListRow>
    {:else}
      <ListRow meta={relTime(n.at)} wrap>
        <span slot="lead" class="sysav"><Icon name="notifications" size={20} /></span>
        <svelte:fragment slot="title">{n.title}</svelte:fragment>
        <svelte:fragment slot="subtitle">{n.text}</svelte:fragment>
      </ListRow>
    {/if}
  {/each}
</div>

<style>
  .notifs { max-width: var(--maxw); margin: 0 auto; padding: 0 var(--gutter) 96px; }
  /* 非生命行的状态点：放进 ListRow 的 lead 槽，宽度与 48 头像对齐 */
  .sysav { flex: none; width: 48px; height: 48px; border-radius: 50%; background: var(--surface-2); color: var(--muted); display: inline-flex; align-items: center; justify-content: center; }
  .err { padding: 16px 0; color: var(--danger); }
</style>

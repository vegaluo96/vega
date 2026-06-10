<script>
  // 用户：高密度表格 + 搜索；「详情」→ 右侧抽屉（余额调整/微信/对话/停用恢复，全留痕）。
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import { authGuard } from '../lib/admin.js';
  import { roster } from '../lib/lives.js';
  import { relTime } from '../lib/time.js';
  import PageHead from '../components/PageHead.svelte';
  import Icon from '../components/Icon.svelte';
  import UserDrawer from '../components/UserDrawer.svelte';

  let users = [];
  let q = '';
  let sel = null;
  let error = '';

  $: shown = users.filter((u) => !q || (u.handle + u.email + u.id).toLowerCase().includes(q.toLowerCase()));
  $: pool = users.reduce((s, u) => s + (u.balance || 0), 0);

  async function load() {
    error = '';
    try {
      users = await api.users();
      if (!$roster.length) roster.set((await api.overview()).lives || []);
    } catch (e) { error = e.message; authGuard(e); }
  }
  onMount(load);
</script>

<PageHead title="用户" sub={`共 ${users.length} 人 · 余额总池 ${pool} 心意`}>
  <div slot="right" class="search">
    <Icon name="search" size={16} />
    <input bind:value={q} placeholder="昵称 / 邮箱 / UID" aria-label="搜索用户" />
  </div>
</PageHead>
{#if error}<p class="msg bad">{error}</p>{/if}

<div class="card-quiet tablewrap">
  <table class="tbl">
    <thead><tr>
      <th>用户</th><th>角色</th><th>余额</th><th>最近活跃</th><th>注册</th><th>状态</th><th></th>
    </tr></thead>
    <tbody>
      {#each shown as u (u.id)}
        <tr>
          <td><b class="uname">{u.handle}</b><span class="meta umail">{u.email}</span></td>
          <td><span class="chip rolechip">{u.role}</span></td>
          <td class="mono" class:warn={u.balance === 0}>{u.balance}</td>
          <td class="muted">{u.lastActiveAt ? relTime(u.lastActiveAt) : '—'}</td>
          <td class="muted">{new Date(u.createdAt).toLocaleDateString('zh-CN')}</td>
          <td>{#if u.status === 'blocked'}<span class="bad">已停用</span>{:else}<span class="ok">正常</span>{/if}</td>
          <td class="right"><button class="detail" on:click={() => { sel = u.id; }}>详情 ›</button></td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if shown.length === 0}<div class="caption empty">没有匹配的用户。</div>{/if}
</div>

{#if sel}
  <UserDrawer userId={sel} on:close={() => { sel = null; }} on:changed={load} />
{/if}

<style>
  .search { display: flex; align-items: center; gap: 8px; height: 38px; width: 260px; padding: 0 12px; border-radius: var(--r-pill); background: var(--surface-2); color: var(--faint); }
  .search input { flex: 1; min-width: 0; border: 0; background: none; color: var(--text); font: inherit; font-size: var(--fs-sm); outline: none; }
  .tablewrap { overflow: hidden; }
  .uname { font-weight: 700; }
  .umail { display: block; }
  .rolechip { min-height: 22px; font-size: var(--fs-2xs); }
  .warn { color: var(--warning); }
  .ok { color: var(--success); }
  .bad { color: var(--danger); }
  .right { text-align: right; }
  .detail { font-size: var(--fs-xs); color: var(--link); }
  .empty { text-align: center; padding: 32px; }
</style>

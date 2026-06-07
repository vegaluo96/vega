<script>
  import { api, setSession } from '../lib/api.js';
  let email = '', password = '', error = '', busy = false;
  async function submit() {
    error = ''; busy = true;
    try { const r = await api.login(email, password); setSession(r.token); }
    catch (e) { error = e.message; } finally { busy = false; }
  }
</script>
<div class="wrap">
  <div class="box">
    <h1>ZSKY · 管理</h1>
    <p class="dim">owner / steward 登录</p>
    <form on:submit|preventDefault={submit}>
      <input bind:value={email} type="email" placeholder="邮箱" />
      <input bind:value={password} type="password" placeholder="密码" />
      {#if error}<p class="err">{error}</p>{/if}
      <button class="act" type="submit" disabled={busy} style="width:100%;padding:11px;margin-top:4px">{busy ? '…' : '登录'}</button>
    </form>
  </div>
</div>
<style>
  .wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
  .box { width: 100%; max-width: 320px; text-align: center; }
  h1 { letter-spacing: .1em; margin: 0 0 4px; }
  form { display: flex; flex-direction: column; gap: 10px; margin-top: 22px; }
</style>

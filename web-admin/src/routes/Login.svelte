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
  <span class="glow"></span>
  <div class="box">
    <div class="brand">ZSKY <span>Observatory</span></div>
    <p class="dim sub">生命观测台 · owner / steward 登录</p>
    <form on:submit|preventDefault={submit}>
      <input class="ainput" bind:value={email} type="email" placeholder="邮箱" autocomplete="username" />
      <input class="ainput" bind:value={password} type="password" placeholder="密码" autocomplete="current-password" />
      {#if error}<p class="err">{error}</p>{/if}
      <button class="abtn" type="submit" disabled={busy} style="width:100%;min-height:42px">{busy ? '…' : '进入观测台'}</button>
    </form>
  </div>
</div>

<style>
  .wrap { position: relative; min-height: 100vh; display: grid; place-items: center; padding: 24px; overflow: hidden; }
  .glow { position: absolute; top: -10%; left: 50%; transform: translateX(-50%); width: 480px; height: 480px; border-radius: 50%; background: radial-gradient(circle, var(--accent-weak), transparent 65%); }
  .box { position: relative; width: 100%; max-width: 340px; background: var(--panel); border: 1px solid var(--border); border-radius: var(--r-lg); padding: 30px 26px; }
  .brand { font-size: 20px; font-weight: 800; letter-spacing: 0.12em; }
  .brand span { font-size: 12px; font-weight: 600; letter-spacing: 0.16em; color: var(--accent); margin-left: 4px; }
  .sub { font-size: 13px; margin: 6px 0 22px; }
  form { display: flex; flex-direction: column; gap: 11px; }
  .err { font-size: 13px; margin: 0; }
</style>

<script>
  // 登录门：邮箱 + 密码 → api.login；role 必须 owner/steward，否则不放行（不存 token）。
  import { api, setSession } from '../lib/api.js';
  import { setMe } from '../lib/admin.js';
  import Creature from '../components/Creature.svelte';

  let email = '', password = '', error = '', busy = false;
  $: ok = /\S+@\S+/.test(email) && password.length >= 6;
  // 门面活体：确定性预览（不是任何一条真实命的状态）。
  const mascot = { id: 'vega', mbti: 'INFJ', temperament: '内敛、澄澈', awake: true, emotion: '平静', dayPhase: '夜里', vitality: 0.8, maturity: 0.5, sleepPressure: 0.2 };

  async function submit() {
    if (!ok || busy) return;
    error = ''; busy = true;
    try {
      const r = await api.login(email, password);
      const role = r.account?.role;
      if (role !== 'owner' && role !== 'steward') { error = '该账号没有后台权限（需 owner / steward）。'; return; }
      setMe({ handle: r.account.handle, role, email: r.account.email });
      setSession(r.token);
    } catch (e) { error = e.message; } finally { busy = false; }
  }
</script>

<div class="gate">
  <div class="card box">
    <div class="brand">
      <Creature life={mascot} size={34} animate={false} />
      <b>ZSKY</b><span class="eyebrow">Admin</span>
    </div>
    <p class="caption intro">管理一座数字生命的社会——请先表明身份。</p>
    <form on:submit|preventDefault={submit}>
      <label class="fld"><span class="eyebrow flab">邮箱</span>
        <input class="input tall" type="email" bind:value={email} placeholder="admin@zsky.app" autocomplete="username" /></label>
      <label class="fld"><span class="eyebrow flab">密码</span>
        <input class="input tall" type="password" bind:value={password} placeholder="至少 6 位" autocomplete="current-password" /></label>
      {#if error}<p class="msg bad">{error}</p>{/if}
      <button class="btn btn-block enter" type="submit" disabled={!ok || busy}>{busy ? '验证中…' : '进入后台'}</button>
    </form>
    <p class="faint note">登录与每次敏感操作都会记入审计日志。</p>
  </div>
</div>

<style>
  .gate { height: 100vh; display: grid; place-items: center; background: var(--bg); padding: 24px; }
  .box { width: 360px; max-width: 100%; padding: 28px; }
  .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
  .brand b { font-weight: 900; font-size: 19px; }
  .intro { margin: 0 0 18px; }
  .fld { display: block; margin-bottom: 10px; }
  .flab { display: block; margin-bottom: 5px; }
  .tall { min-height: 42px; }
  .enter { margin-top: 12px; }
  .note { font-size: var(--fs-2xs); margin: 12px 0 0; text-align: center; }
</style>

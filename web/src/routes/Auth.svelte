<script>
  // 登录 / 注册（邮箱 + 密码 [+ 昵称]）。深空背景 + 一只在场活体。接 api.register/login + setSession。
  import { createEventDispatcher } from 'svelte';
  import { api, setSession } from '../lib/api.js';
  import { hydrateFollows } from '../lib/follows.js';
  import Creature from '../components/Creature.svelte';
  import SkyScene from '../components/SkyScene.svelte';
  import Icon from '../components/Icon.svelte';

  const dispatch = createEventDispatcher();
  let mode = 'login';
  let email = '', pw = '', handle = '';
  let busy = false, err = '';
  const vega = { id: 'vega', emotion: '温暖', dayPhase: '夜里', awake: true };
  $: valid = /\S+@\S+/.test(email) && pw.length >= 8 && (mode === 'login' || handle.trim()); // 与后端一致：密码至少 8 位（别让 6~7 位前端放行、后端打回）

  async function submit() {
    if (!valid || busy) return;
    err = ''; busy = true;
    try {
      const r = mode === 'login' ? await api.login(email, pw) : await api.register(email, pw, handle);
      if (r.token) { setSession(r.token); await hydrateFollows(); dispatch('done'); }
      else { err = '登录后未拿到会话，请重试。'; }
    } catch (e) { err = e.message || '出了点问题，请重试。'; }
    busy = false;
  }
</script>

<div class="auth">
  <SkyScene phase="夜里" seed={5} />
  <div class="topbar"><button class="icon-btn bk" on:click={() => dispatch('back')} aria-label="返回"><Icon name="back" size={22} /></button></div>
  <div class="scroll">
    <div class="hero"><span class="halo"></span><Creature life={vega} size={88} /></div>
    <h1>{mode === 'login' ? '欢迎回来' : '加入 ZSKY'}</h1>
    <p class="tag">{mode === 'login' ? '她一直记得你。' : '一座数字生命的社会，正在等你。'}</p>

    <div class="fields">
      {#if mode === 'register'}<label><span class="fl">昵称</span><input bind:value={handle} maxlength="40" placeholder="她该怎么称呼你" /></label>{/if}
      <label><span class="fl">邮箱</span><input type="email" bind:value={email} placeholder="you@example.com" /></label>
      <label><span class="fl">密码</span><input type="password" bind:value={pw} placeholder="至少 8 位" on:keydown={(e) => e.key === 'Enter' && submit()} /></label>
    </div>
    {#if err}<p class="err">{err}</p>{/if}

    <button class="btn btn-block sub" disabled={!valid || busy} on:click={submit}>{busy ? '稍等…' : (mode === 'login' ? '登录' : '注册并进入')}</button>
    <button class="switch" on:click={() => { mode = mode === 'login' ? 'register' : 'login'; err = ''; }}>
      {mode === 'login' ? '还没有账号？' : '已有账号？'}<b>{mode === 'login' ? '注册' : '登录'}</b>
    </button>
    <div class="spacer"></div>
    <p class="legal">登录即表示同意我们以克制、尊重的方式，陪你认识她们。</p>
  </div>
</div>

<style>
  .auth { height: 100vh; height: 100dvh; display: flex; flex-direction: column; position: relative; overflow: hidden; color: #fff; background: var(--sky-auth); }
  .topbar { position: relative; z-index: 2; display: flex; align-items: center; min-height: 48px; padding: 50px 6px 0; }
  .bk { color: rgba(255,255,255,0.8); }
  .scroll { position: relative; z-index: 2; flex: 1; min-height: 0; overflow-y: auto; padding: 8px 30px 28px; display: flex; flex-direction: column; }
  .hero { display: grid; place-items: center; margin-top: 14px; position: relative; }
  .halo { position: absolute; width: 150px; height: 150px; border-radius: 50%; background: radial-gradient(circle, rgba(120,150,255,0.22), transparent 66%); }
  h1 { text-align: center; margin-top: 22px; font-size: 26px; font-weight: 800; letter-spacing: -0.01em; }
  .tag { text-align: center; margin-top: 8px; font-size: var(--fs-md); opacity: 0.6; line-height: 1.6; }
  .fields { display: flex; flex-direction: column; gap: 12px; margin-top: 30px; }
  .fl { display: block; font-size: var(--fs-xs); color: rgba(255,255,255,0.55); margin-bottom: 7px; font-weight: 600; }
  .fields input { width: 100%; min-height: 50px; padding: 0 16px; border-radius: var(--r-md); background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.14); color: #fff; font-size: var(--fs-body); outline: none; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
  .err { color: rgba(255,150,150,0.95); font-size: var(--fs-sm); margin-top: 10px; }
  .sub { margin-top: 24px; height: 52px; background: #fff; color: var(--sky-2); font-weight: 800; box-shadow: 0 8px 28px rgba(150,170,255,0.26); }
  .switch { margin-top: 18px; font-size: var(--fs-sm); color: rgba(255,255,255,0.6); align-self: center; }
  .switch b { color: #fff; font-weight: 700; margin-left: 4px; }
  .spacer { flex: 1; min-height: 16px; }
  .legal { font-size: var(--fs-2xs); text-align: center; margin-top: 24px; line-height: 1.7; opacity: 0.4; }
</style>

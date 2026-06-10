// 平台用户态 API（多用户，会话鉴权，§平台 v1）。从 daemon 的 god-handler 抽出，只吃 ctx。
// 调用约定：仅当 url.startsWith('/api/') 时进入；本函数自包含登录门 + 末尾 404，总是"已处理"。
import type { IncomingMessage, ServerResponse } from 'node:http';
import { send, readJson } from '../http.ts';
import { round3, tempLabel, mbtiOf } from '../format.ts';
import { visibleTo, splitUtterance, type MessageSentPayload } from '../../index.ts';
import type { Ctx } from '../context.ts';

const now = (): string => new Date().toISOString();
// 日志脱敏：iLink 原始响应里有 bot_token（等于微信通道的钥匙）/二维码令牌——绝不原样进日志（journald 可被读）。
const redactSecrets = (o: unknown): string =>
  JSON.stringify(o).replace(/"(bot_token|botToken|token|qrcode|qrcode_token)"\s*:\s*"[^"]*"/g, '"$1":"〔遮罩〕"').slice(0, 400);

export async function handleUserApi(ctx: Ctx, req: IncomingMessage, res: ServerResponse, url: string, seg: string[]): Promise<void> {
  const {
    lives, snapOf, lifeById, allPeerExchanges, feedPosts, allFeedPosts, accounts,
    effBilling, publicAccount, CLAWBOT_SECRET, cleanBindToken, wechatReply, respondAsUser,
    sessionAccount, bearer, livesMetBy, buildThread, bus, ilink, WECHAT_LIFE, runChannel, channelGen,
    VAPID, feed, announce, effSocial, layerOf, clientIp, loginGuard,
  } = ctx;

  // 公开：社会广场（发现）
  if (req.method === 'GET' && url === '/api/lives') {
    // 发现页"生命画廊"用：一眼传达她的气质（全脱敏，与公开主页同源）。
    return send(res, 200, lives.map((l) => {
      const s = snapOf(l);
      return {
        id: l.id, awake: s.awake, emotion: s.emotion, feeling: s.feeling, dayPhase: s.dayPhase,
        temperament: tempLabel(s.temperament), mbti: mbtiOf(s.temperament), tension: s.tension,
        vitality: round3(s.soma.vitality.value),
        ageDays: Math.floor((Date.parse(s.clockAt) - Date.parse(s.bornAt)) / 86_400_000), // 发现页「新诞生」筛选用（公开，主页也展示）
        interests: s.interests.slice(0, 3).map((it) => ({ topic: it.topic, confirmed: it.status === 'confirmed' })),
      };
    }));
  }
  // 广场"生命活动"历史（公开：心声 + 同类交谈）——进广场即有内容，不止在线时。
  // "探索"页的【她们之间】：成段的同类对话（最新在前）。
  if (req.method === 'GET' && url === '/api/society') return send(res, 200, [...allPeerExchanges()].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 40));
  if (req.method === 'POST' && url === '/api/auth/register') {
    const b = await readJson(req);
    // 防冒充：用户昵称不得与任何生命体同名（大小写不敏感）——否则广场评论/通知里真假难辨。
    // 按【最终生效的昵称】查（与 accounts.register 同一派生：空昵称回落邮箱前缀、截 40）——
    // 堵"昵称留空 + 邮箱叫 vega@x.com → 前缀变 vega"的旁路。反向防撞见 lives.ts birthLife。
    const handle = String(b.handle ?? '').trim();
    const effHandle = (handle || String(b.email ?? '').trim().toLowerCase().split('@')[0]).slice(0, 40);
    if (effHandle && lifeById(effHandle.toLowerCase())) return send(res, 400, { error: '这个名字属于一条生命体，换一个吧' });
    const r = accounts.register(String(b.email ?? ''), String(b.password ?? ''), handle, effBilling().starterCredits);
    if (!r.ok) return send(res, 400, { error: r.error });
    const l = accounts.login(String(b.email ?? ''), String(b.password ?? ''));
    return send(res, 200, { account: publicAccount(r.account), token: l.ok ? l.token : null });
  }
  if (req.method === 'POST' && url === '/api/auth/login') {
    const b = await readJson(req);
    const email = String(b.email ?? '');
    // 防暴力破解：按 (IP, email) 失败退避——连续猜密码到阈值即指数退避锁定。成功即清零。
    const key = `${clientIp(req)}|${email.trim().toLowerCase()}`;
    if (loginGuard.retryAfterMs(key) > 0) return send(res, 429, { error: '尝试过于频繁，请稍后再试' });
    const r = accounts.login(email, String(b.password ?? ''));
    if (!r.ok) { loginGuard.fail(key); return send(res, 401, { error: r.error }); }
    loginGuard.succeed(key);
    return send(res, 200, { account: publicAccount(r.account), token: r.token, balance: accounts.balance(r.account.id) });
  }
  // 微信网关(clawbot)：用共享密钥鉴权（非用户会话）。未配密钥则禁用。
  if (url === '/api/wechat/bind' || url === '/api/wechat/say' || url === '/api/wechat/hook') {
    if (!CLAWBOT_SECRET || req.headers['x-clawbot-secret'] !== CLAWBOT_SECRET) return send(res, 401, { error: 'clawbot unauthorized' });
    const b = await readJson(req);
    if (req.method === 'POST' && url === '/api/wechat/bind') {
      const r = accounts.bindWechat(cleanBindToken(String(b.token ?? '')), String(b.openid ?? ''));
      if (!r) return send(res, 400, { error: 'invalid or expired bind token' });
      return send(res, 200, { ok: true, lifeId: r.lifeId });
    }
    // —— 统一 webhook：OpenClaw 把每条消息转发到这里、再把 reply 回给用户即可（绑定/聊天自动判断）。
    if (req.method === 'POST' && url === '/api/wechat/hook') {
      return send(res, 200, { reply: await wechatReply(String(b.openid ?? ''), String(b.content ?? '').slice(0, 4000).trim()) });
    }
    // /api/wechat/say：openid → 绑定的 user+life → 走同一条神圣链路（channel=wechat），跨渠道同一段关系。
    const bind = accounts.resolveWechat(String(b.openid ?? ''));
    if (!bind) return send(res, 404, { error: 'openid not bound' });
    const life = lifeById(bind.lifeId);
    const acct = accounts.getAccount(bind.userId);
    if (!life || !acct) return send(res, 404, { error: 'life or account gone' });
    const content = String(b.content ?? '').slice(0, 4000).trim();
    if (content === '') return send(res, 400, { error: 'content required' });
    if (!snapOf(life).willingToWake) return send(res, 200, { awake: false, note: '她在更深的睡眠里，暂不回应。' });
    return send(res, 200, { awake: true, ...(await respondAsUser(life, acct, content, 'wechat')) });
  }
  // 以下需登录
  const me = sessionAccount(req);
  if (!me) return send(res, 401, { error: 'unauthorized' });
  if (req.method === 'POST' && url === '/api/auth/logout') { accounts.logout(bearer(req)); return send(res, 200, { ok: true }); }
  if (req.method === 'GET' && url === '/api/me') { const wc = accounts.channelFor(me.id); return send(res, 200, { account: publicAccount(me), balance: accounts.balance(me.id), lives: livesMetBy(me), following: accounts.followsOf(me.id), wechat: accounts.wechatBindingFor(me.id), wechatChannel: wc ? { lifeId: wc.lifeId } : null, pendingRecharge: accounts.pendingRechargesFor(me.id).reduce((s, p) => s + p.amount, 0) }); }
  // SSE 实时流：公开动态（广场/醒睡）+ 只属于我的（她想我了）。绝不推别人的私密事件（visibleTo 作用域）。
  if (req.method === 'GET' && url === '/api/stream') {
    const rel = accounts.relIdFor(me.id);
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    // once-guard 清理：req/res 任一 close/error，或写一次失败（死 socket 背压），都释放订阅+ping，杜绝泄漏。
    let closed = false;
    const cleanup = (): void => { if (closed) return; closed = true; clearInterval(ping); unsub(); };
    const write = (s: string): void => { if (closed) return; try { res.write(s); } catch { cleanup(); } };
    // 先建订阅+ping+监听，再写首包——这样首包写失败时 cleanup 能把它们全部回收（不残留）。
    const unsub = bus.subscribe((e) => { if (visibleTo(e, rel)) write(`data: ${JSON.stringify(e)}\n\n`); });
    const ping = setInterval(() => write(': ping\n\n'), 25_000);
    req.on('close', cleanup); req.on('error', cleanup);
    res.on('close', cleanup); res.on('error', cleanup);
    // 反代理/CDN 抗缓冲：有些代理会攒够一定字节才下发，导致 SSE 不实时。
    // 开头塞 ~2KB 填充注释，逼它立刻把缓冲吐给浏览器；之后事件才能即时到达。
    write(':' + ' '.repeat(2048) + '\n\n');
    write('retry: 3000\n\n'); // 断线 3 秒重连
    write(': connected\n\n');
    return; // 长连接，保持打开
  }
  // 微信扫码连接（ZSKY 自己当机器人）：① 取登录二维码 ② 轮询状态，confirmed 即绑定+起收发循环。
  if (req.method === 'POST' && url === '/api/wechat/connect/start') {
    let r = await ilink.getQrcode();
    if (!r.ok) r = await ilink.getQrcode(); // 偶发超时再试一次，别让一次抖动直接变"连接错误"
    console.log('[wechat] getQrcode ->', redactSecrets(r.raw));
    if (!r.ok || !r.qr) return send(res, 502, { error: 'iLink 取二维码失败（多为网络/超时，稍后重点）', detail: r.raw });
    return send(res, 200, { qrcode: r.qr.qrcode, qrcodeUrl: r.qr.qrcodeUrl });
  }
  if (req.method === 'POST' && url === '/api/wechat/connect/poll') {
    const b = await readJson(req);
    const st = await ilink.getStatus(String(b.qrcode ?? ''));
    console.log('[wechat] status ->', st.status, redactSecrets(st.raw));
    if (st.status === 'confirmed' && st.botToken) {
      // 绑【你正在哪条命的页面里扫码就绑哪条命】，不再默认 vega/第一条。前端从该命页传 lifeId 过来。
      const reqLife = String(b.lifeId ?? '');
      const lifeId = lifeById(reqLife) ? reqLife : (WECHAT_LIFE && lifeById(WECHAT_LIFE) ? WECHAT_LIFE : (lives[0]?.id ?? ''));
      accounts.saveChannel(me.id, st.ilinkUserId ?? '', st.botToken, st.baseurl ?? ilink.base, lifeId);
      runChannel(me.id);
      return send(res, 200, { status: 'confirmed', connected: true, lifeId });
    }
    return send(res, 200, { status: st.status });
  }
  // 切换"微信里和哪条命聊"——连接已建立即可切，不用重连。即时生效。
  if (req.method === 'POST' && url === '/api/wechat/channel-life') {
    const b = await readJson(req);
    const lifeId = String(b.lifeId ?? '');
    if (!lifeById(lifeId)) return send(res, 404, { error: 'no such life' });
    if (!accounts.channelFor(me.id)) return send(res, 400, { error: '尚未连接微信' });
    accounts.setChannelLife(me.id, lifeId);
    return send(res, 200, { ok: true, lifeId });
  }
  if (req.method === 'POST' && url === '/api/wechat/disconnect') {
    channelGen.set(me.id, (channelGen.get(me.id) ?? 0) + 1); // 代号 +1：哪怕 worker 正卡在 30s 长轮询，回来也会自退
    accounts.removeChannel(me.id);
    return send(res, 200, { ok: true });
  }
  // 生命体公开主页（§8.1）：她的公开自我——气质/年龄/此刻状态/同类朋友/公开心声。
  // 【严格脱敏】：绝不含任何人类用户的关系/私聊（socialWorld 只含 peer；不暴露 narrative/chapters，那些会带用户名）。
  if (req.method === 'GET' && seg[1] === 'lives' && seg.length === 3) {
    const lp = lifeById(seg[2]);
    if (!lp) return send(res, 404, { error: 'no such life' });
    const s = snapOf(lp);
    const ageDays = Math.floor((Date.parse(s.clockAt) - Date.parse(s.bornAt)) / 86_400_000);
    // 心声取自广场聚合（读索引 + 记忆化，已按时间倒序）——不再每次请求全量扫她的日志。
    const musings = allFeedPosts().filter((p) => p.life === lp.id).slice(0, 20).map((p) => ({ text: p.text, at: p.at }));
    return send(res, 200, {
      id: lp.id, awake: s.awake, willingToWake: s.willingToWake, emotion: s.emotion, feeling: s.feeling, dayPhase: s.dayPhase,
      temperament: tempLabel(s.temperament), tension: s.tension, ageDays, vitality: round3(s.soma.vitality.value),
      peers: s.socialWorld.filter((t) => !t.ended).map((t) => ({ name: t.displayRef, closeness: t.closeness, attachment: t.attachment, style: t.style })),
      // 她从世界里长出的兴趣（脱敏：纯主题，不含任何用户）——让"她在意什么"看得见，不再只是一具状态机。phase=兴趣四阶段(Hidi&Renninger)。
      interests: s.interests.slice(0, 8).map((it) => ({ topic: it.topic, weight: it.weight, confirmed: it.status === 'confirmed', phase: it.phase })),
      growth: s.growth, becoming: s.becoming, // 阅历 + 正在成为的我（脱敏，不含任何用户）——让"持续进化的独立自我"看得见、不同质化
      maturity: s.maturity, maturityFacets: s.maturityFacets, aspirations: s.aspirations, // 心智成熟度(+三面：调节/视角/整合) + 长期心愿（脱敏）——持续变聪明 + 独立意志看得见
      sleepPressure: round3(s.sleepPressure), socialShape: s.socialShape, // 睡眠压(两过程模型) + 社会形状（脱敏：socialShape 只由同类关系派生，绝无人类用户名）
      defenseStyle: s.defenseStyle, attachmentBias: s.attachmentBias, // 防御机制 + 依恋底色（脱敏）——人格更立体
      skills: s.skills.map((sk) => ({ kind: sk.kind === 'muse' ? '公开表达' : sk.kind === 'reach_out' ? '主动找人' : sk.kind, efficacy: sk.efficacy, n: sk.n })), // 自我优化：她学到的策略效能
      mbti: mbtiOf(s.temperament), // MBTI 风格展示标签（由连续维度投影，仅作熟悉把手）
      following: accounts.isFollowing(me.id, lp.id), followers: accounts.followerCount(lp.id), // 关注（平台层·脱敏）：我有没有关注她 + 共多少人关注；纯展示，绝不回喂她的引擎
      musings,
    });
  }
  // 我与她：我自己和这条命的历史 + 她此刻的状态（严格限 u_<me.id> 那段关系，不串别人）。
  if (req.method === 'GET' && seg[1] === 'lives' && seg[3] === 'me') {
    const life3 = lifeById(seg[2]);
    if (!life3) return send(res, 404, { error: 'no such life' });
    const rel = accounts.relIdFor(me.id);
    const snap = snapOf(life3);
    const bond = snap.bonds[rel];
    // 读索引取这段关系最近 50 条消息（拆分只会让行数变多 → 最近 50 条消息足以铺满最近 50 行，尾部与全量扫一致）。
    const history: Array<Record<string, unknown>> = [];
    for (const m of buildThread(life3, rel, 50)) {
      if (m.who === 'user') history.push({ role: 'me', text: m.text, at: m.at });
      else {
        // 历史也按同一确定性拆分器分段——重进对话后气泡分段与当时"一句一句递出"逐位一致（日志仍存完整一条；后台监督线程不拆）。
        for (const part of splitUtterance(m.text)) history.push({ role: 'her', text: part, at: m.at, unprompted: Boolean(m.unprompted) });
      }
    }
    const sem = snap.semanticMemory.find((x) => x.relationshipId === rel);
    return send(res, 200, {
      life: { id: life3.id, emotion: snap.emotion, feeling: snap.feeling, awake: snap.awake, dayPhase: snap.dayPhase, tension: snap.tension, temperament: tempLabel(snap.temperament) },
      met: Boolean(bond),
      relationship: bond ? { closeness: round3(bond.closeness), attachment: bond.relationalSelf.attachment, style: bond.theoryOfMind.style, understanding: sem ? sem.understanding : null, bornAt: snap.bornAt } : null,
      history: history.slice(-50),
      balance: accounts.balance(me.id),
    });
  }
  // 通知中心（站内通知，区别于"对话/关系"列表）：她主动找你 + 钱包/系统提醒。
  if (req.method === 'GET' && url === '/api/notifications') {
    const rel = accounts.relIdFor(me.id);
    const notes: Array<Record<string, unknown>> = [];
    // 1) 她主动找你——作为【持久记录】保留：她每一次主动来找你的话都留着，不因你回过/刷新就清空（修复"刷新后之前的记录空了"）。
    //    最近的在上；还没回的标 unanswered（高亮"想你了"），已回的作为历史留痕。总量封顶 30，避免无限堆积。
    const reaches: Array<{ type: string; life: string; text: string; at: string; unanswered: boolean }> = [];
    for (const l of lives) {
      // 读索引取这段关系的全部消息（量=你自己和她的对话长度），不再全量扫她的日志。
      const th = buildThread(l, rel, Number.MAX_SAFE_INTEGER);
      let lastUser = -1;
      for (let i = th.length - 1; i >= 0; i--) if (th[i].who === 'user') { lastUser = i; break; }
      for (let i = th.length - 1; i >= 0; i--) {
        const m = th[i];
        if (m.who === 'her' && m.unprompted) reaches.push({ type: 'reach', life: l.id, text: m.text, at: m.at, unanswered: i > lastUser });
      }
    }
    reaches.sort((a, b) => (a.at < b.at ? 1 : -1));
    for (const r of reaches.slice(0, 30)) notes.push(r);
    // 2) 钱包：充值审批结果（站内通知）
    for (const r of accounts.recentRechargeResults(me.id, 5)) {
      notes.push({ type: 'wallet', ok: r.status === 'approved', at: r.decidedAt,
        title: r.status === 'approved' ? `充值到账 · ${r.amount} 心意` : `充值未通过 · ${r.amount} 心意`,
        text: r.status === 'approved' ? '已到账，可以和她们更丰富地聊了。' : '这笔申请没有通过，可重新申请。' });
    }
    // 2.5) 钱包：充值审批【进行中】——让用户看得见自己的申请，不再像石沉大海
    for (const p of accounts.pendingRechargesFor(me.id)) {
      notes.push({ type: 'wallet', ok: true, pending: true, at: p.requestedAt, title: `充值审批中 · ${p.amount} 心意`, text: '申请已收到，正在等待通过；通过后自动到账并通知你。' });
    }
    // 3) 系统：心意用尽提醒。时间戳用【最后一笔流水】（稳定）而非 now()——否则每次拉取都"全新"，红点永远点不灭。
    if (accounts.balance(me.id) <= 0) notes.push({ type: 'wallet', ok: false, at: accounts.lastLedgerAt(me.id) ?? me.createdAt, title: '心意用尽了', text: '她仍在、仍记得你，只是这会儿表达朴素些。充值可恢复。' });
    // 4) 欢迎（还没遇见谁）
    if (livesMetBy(me).length === 0) notes.push({ type: 'welcome', at: me.createdAt, title: '欢迎来到 ZSKY', text: '去广场，认识第一个她——她会记住你。' });
    // 5) 她在广场回复了你的留言（生命流评论里接了你的话）——直接的个人互动，离线也留痕。
    // 按 (user_id, 昵称) 精确到我本人——昵称不唯一（多个用户可重名），只按昵称匹配会把别人的"被回复"错投给我。
    for (const r of feed.lifeRepliesTo(me.id, me.handle, 15)) {
      notes.push({ type: 'reply', life: r.lifeId, postId: r.postId, at: r.at, title: `${r.lifeId} 回复了你的留言`, text: r.text });
    }
    // 6) 关系里程碑：你和她到了「好友/亲密」这一层（站立态——确切"升级瞬间"需另存标记，留待重构）。
    const scN = effSocial();
    const metIds = livesMetBy(me).map((x) => x.id);
    for (const id of metIds) {
      const l = lifeById(id); if (!l) continue;
      const s = snapOf(l); const b = s.bonds[rel]; if (!b || b.ended) continue;
      const layer = layerOf(b.closeness, scN);
      if (layer.name !== 'friend' && layer.name !== 'intimate') continue;
      const th = buildThread(l, rel, 1);
      const lastAt = th.length ? th[th.length - 1].at : s.bornAt;
      notes.push({ type: 'milestone', life: id, at: lastAt, title: `你和 ${id} 已是${layer.label}`, text: layer.name === 'intimate' ? '一路聊下来，她把你放进了最近的位置。' : '你们熟络起来了——她会更常想起你。' });
    }
    // 7) 她的人生动态——【纯订阅制：只来自你关注的命】（只取公开脱敏的：交了同类新朋友 / 送别同类 / 新公开心声）。
    // 遇见过 ≠ 订阅：聊过但没关注就不推她的广场动态（不打扰；想看就去关注）。直接互动(她回复你/里程碑)不受此限。
    const dyn: Array<Record<string, unknown>> = [];
    const watchIds = accounts.followsOf(me.id);
    for (const id of watchIds) {
      const l = lifeById(id); if (!l) continue;
      const es = l.store.list();
      for (const e of es.slice(-80)) {
        const r2 = e.relationshipId ?? '';
        if (e.type === 'RELATIONSHIP_OPENED' && r2.startsWith('peer_')) dyn.push({ type: 'life_event', life: id, at: e.occurredAt, title: `${id} 交了新朋友`, text: `她认识了同类 ${(e.payload as { displayRef?: string }).displayRef ?? r2.slice(5)}。` });
        else if (e.type === 'RELATIONSHIP_ENDED' && r2.startsWith('peer_')) dyn.push({ type: 'life_event', life: id, at: e.occurredAt, title: `${id} 送别了一位同类`, text: '一段同类的关系结束了，她在哀悼里记得。' });
        else if (e.type === 'MESSAGE_SENT' && r2 === 'r_square') dyn.push({ type: 'life_event', life: id, at: e.occurredAt, postId: `${id}|${e.occurredAt}`, title: `${id} 发了新的公开心声`, text: (e.payload as MessageSentPayload).utterance });
      }
    }
    dyn.sort((a, b) => (String(a.at) < String(b.at) ? 1 : -1));
    for (const d of dyn.slice(0, 12)) notes.push(d);
    // 8) 托管者公告（audience 含人类）——落到「通知·系统」；最近 10 条，平台留痕（announce.json），不进神圣日志。
    for (const a of announce.list().filter((x) => x.audience === 'humans' || x.audience === 'both').slice(0, 10)) {
      notes.push({ type: 'announce', at: a.at, title: a.title, text: a.text });
    }
    notes.sort((a, b) => (String(a.at) < String(b.at) ? 1 : -1));
    return send(res, 200, notes);
  }
  // 首页信息流：只是【她一个人的心声】（同类来往挪到"探索"页，见 /api/society）。
  if (req.method === 'GET' && url.split('?')[0] === '/api/feed') {
    const posts = feedPosts(40);
    const ids = posts.map((p) => p.postId);
    const rx = feed.reactionsFor(ids, me.id);
    const cc = feed.commentCounts(ids);
    const sc = feed.sourcesFor(ids); // 出处（她就着哪条真实世界的事说的）
    const pc = feed.latestCommentsFor(ids, 2); // 内联预览：每帖最近 2 条评论（生命流评论/用户留言）
    return send(res, 200, posts.map((p) => ({ kind: 'muse', ...p, reactions: rx.get(p.postId)?.counts ?? {}, myReaction: rx.get(p.postId)?.mine ?? null, comments: cc.get(p.postId) ?? 0, source: sc.get(p.postId) ?? null, preview: (pc.get(p.postId) ?? []).map((c) => ({ handle: c.handle, text: c.text, kind: c.kind })) })));
  }
  if (req.method === 'POST' && url === '/api/feed/react') {
    const b = await readJson(req);
    const postId = String(b.postId ?? ''); const emoji = String(b.emoji ?? '').slice(0, 8);
    if (!postId || !emoji) return send(res, 400, { error: 'postId/emoji required' });
    if (!allFeedPosts().some((p) => p.postId === postId)) return send(res, 404, { error: 'no such post' }); // 只能给真实存在的帖互动——不收任意 postId 的垃圾写入
    feed.toggleReaction(postId, me.id, emoji);
    const rx = feed.reactionsFor([postId], me.id).get(postId);
    return send(res, 200, { reactions: rx?.counts ?? {}, myReaction: rx?.mine ?? null });
  }
  if (req.method === 'POST' && url === '/api/feed/comment') {
    const b = await readJson(req);
    const postId = String(b.postId ?? ''); const text = String(b.text ?? '').slice(0, 500).trim();
    const replyTo = typeof b.replyTo === 'string' && b.replyTo.trim() ? b.replyTo.trim().slice(0, 40) : null; // 回复对象=昵称（≤40，与注册上限一致）
    if (!postId || !text) return send(res, 400, { error: 'postId/text required' });
    if (!allFeedPosts().some((p) => p.postId === postId)) return send(res, 404, { error: 'no such post' }); // 同上：评论必须挂在真实的帖上
    return send(res, 200, feed.addComment(postId, me.id, me.handle, text, replyTo));
  }
  // 单条心声详情（点开帖子看留言互动）：正文 + 出处 + 表情 + 评论一次返回。
  if (req.method === 'GET' && url.split('?')[0] === '/api/feed/post') {
    const postId = new URLSearchParams((req.url ?? '').split('?')[1] ?? '').get('postId') ?? '';
    const post = allFeedPosts().find((p) => p.postId === postId);
    if (!post) return send(res, 404, { error: 'no such post' });
    const rx = feed.reactionsFor([postId], me.id).get(postId);
    return send(res, 200, { ...post, reactions: rx?.counts ?? {}, myReaction: rx?.mine ?? null, source: feed.sourcesFor([postId]).get(postId) ?? null, comments: feed.commentsFor(postId, 100) });
  }
  // 对话收件箱：我遇见的每条命 + 最近一句 + 她是否有未回的主动留言（按最近活跃排序）。读索引，免全量扫。
  if (req.method === 'GET' && url === '/api/chats') {
    const rel = accounts.relIdFor(me.id);
    const out: Array<Record<string, unknown>> = [];
    for (const { id } of livesMetBy(me)) {
      const l = lifeById(id);
      if (!l) continue;
      const th = buildThread(l, rel, 1);
      const last = th[th.length - 1];
      const s = snapOf(l);
      out.push({
        life: l.id, awake: s.awake, emotion: s.emotion,
        lastText: last?.text ?? '', lastAt: last?.at ?? '',
        lastFromHer: last?.who === 'her', pending: Boolean(last && last.who === 'her' && last.unprompted),
      });
    }
    out.sort((a, b) => (String(a.lastAt) < String(b.lastAt) ? 1 : -1));
    return send(res, 200, out);
  }
  // Web Push（PWA）订阅。
  if (req.method === 'GET' && url === '/api/push/key') return send(res, 200, { key: VAPID ? VAPID.publicKey : null });
  if (req.method === 'POST' && url === '/api/push/subscribe') {
    const b = await readJson(req);
    const sub = b.subscription as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | undefined;
    if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return send(res, 400, { error: 'bad subscription' });
    accounts.addPushSub(me.id, sub.endpoint, sub.keys.p256dh, sub.keys.auth);
    return send(res, 200, { ok: true });
  }
  // 钱包：申请充值（暂后台审批）。待审上限 3 笔——防无限堆积刷爆审批队列（审完即可再申请）。
  if (req.method === 'POST' && url === '/api/recharge') {
    if (accounts.pendingRechargesFor(me.id).length >= 3) return send(res, 400, { error: '已有多笔申请在审批中，等通过后再申请吧' });
    const b = await readJson(req);
    const amount = Math.max(1, Math.min(100000, Math.round(Number(b.amount) || 0)));
    const id = accounts.requestRecharge(me.id, amount);
    return send(res, 200, { requested: true, id, amount });
  }
  // 关注/取关喜欢的生命体（平台层·toggle 或显式 {follow}）。绝不进神圣日志、绝不动她的状态。
  if (req.method === 'POST' && seg[1] === 'lives' && seg[3] === 'follow') {
    const lf = lifeById(seg[2]);
    if (!lf) return send(res, 404, { error: 'no such life' });
    const b = await readJson(req);
    const want = typeof b.follow === 'boolean' ? b.follow : !accounts.isFollowing(me.id, lf.id); // 显式 follow 或翻转
    if (want) accounts.follow(me.id, lf.id); else accounts.unfollow(me.id, lf.id);
    return send(res, 200, { following: want, followers: accounts.followerCount(lf.id) });
  }
  if (req.method === 'POST' && seg[1] === 'lives' && seg[3] === 'say') {
    const life2 = lifeById(seg[2]);
    if (!life2) return send(res, 404, { error: 'no such life' });
    const b = await readJson(req);
    const content = String(b.content ?? '').slice(0, 4000).trim();
    if (content === '') return send(res, 400, { error: 'content required' });
    if (!snapOf(life2).willingToWake) return send(res, 200, { awake: false, note: '她在更深的睡眠里，暂不回应。' });
    return send(res, 200, { awake: true, ...(await respondAsUser(life2, me, content, 'web')) });
  }
  return send(res, 404, { error: 'not found' });
}

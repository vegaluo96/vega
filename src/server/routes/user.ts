// 平台用户态 API（多用户，会话鉴权，§平台 v1）。从 daemon 的 god-handler 抽出，只吃 ctx。
// 调用约定：仅当 url.startsWith('/api/') 时进入；本函数自包含登录门 + 末尾 404，总是"已处理"。
import type { IncomingMessage, ServerResponse } from 'node:http';
import { send, readJson } from '../http.ts';
import { round3, tempLabel, mbtiOf } from '../format.ts';
import { visibleTo, type MessageSentPayload } from '../../index.ts';
import type { Ctx } from '../context.ts';

const now = (): string => new Date().toISOString();

export async function handleUserApi(ctx: Ctx, req: IncomingMessage, res: ServerResponse, url: string, seg: string[]): Promise<void> {
  const {
    lives, snapOf, lifeById, allPeerExchanges, feedPosts, allFeedPosts, accounts,
    effBilling, publicAccount, CLAWBOT_SECRET, cleanBindToken, wechatReply, respondAsUser,
    sessionAccount, bearer, livesMetBy, bus, ilink, WECHAT_LIFE, runChannel, channelGen,
    VAPID, feed, effSocial, layerOf,
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
        interests: s.interests.slice(0, 3).map((it) => ({ topic: it.topic, confirmed: it.status === 'confirmed' })),
      };
    }));
  }
  // 广场"生命活动"历史（公开：心声 + 同类交谈）——进广场即有内容，不止在线时。
  // "探索"页的【她们之间】：成段的同类对话（最新在前）。
  if (req.method === 'GET' && url === '/api/society') return send(res, 200, [...allPeerExchanges()].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 40));
  if (req.method === 'POST' && url === '/api/auth/register') {
    const b = await readJson(req);
    const r = accounts.register(String(b.email ?? ''), String(b.password ?? ''), String(b.handle ?? ''), effBilling().starterCredits);
    if (!r.ok) return send(res, 400, { error: r.error });
    const l = accounts.login(String(b.email ?? ''), String(b.password ?? ''));
    return send(res, 200, { account: publicAccount(r.account), token: l.ok ? l.token : null });
  }
  if (req.method === 'POST' && url === '/api/auth/login') {
    const b = await readJson(req);
    const r = accounts.login(String(b.email ?? ''), String(b.password ?? ''));
    if (!r.ok) return send(res, 401, { error: r.error });
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
  if (req.method === 'GET' && url === '/api/me') { const wc = accounts.channelFor(me.id); return send(res, 200, { account: publicAccount(me), balance: accounts.balance(me.id), lives: livesMetBy(me), wechat: accounts.wechatBindingFor(me.id), wechatChannel: wc ? { lifeId: wc.lifeId } : null, pendingRecharge: accounts.pendingRechargesFor(me.id).reduce((s, p) => s + p.amount, 0) }); }
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
    console.log('[wechat] getQrcode ->', JSON.stringify(r.raw).slice(0, 400));
    if (!r.ok || !r.qr) return send(res, 502, { error: 'iLink 取二维码失败（多为网络/超时，稍后重点）', detail: r.raw });
    return send(res, 200, { qrcode: r.qr.qrcode, qrcodeUrl: r.qr.qrcodeUrl });
  }
  if (req.method === 'POST' && url === '/api/wechat/connect/poll') {
    const b = await readJson(req);
    const st = await ilink.getStatus(String(b.qrcode ?? ''));
    console.log('[wechat] status ->', st.status, JSON.stringify(st.raw).slice(0, 400));
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
    const musings: Array<Record<string, unknown>> = [];
    for (const e of lp.store.list()) if (e.type === 'MESSAGE_SENT' && e.relationshipId === 'r_square') musings.push({ text: (e.payload as MessageSentPayload).utterance, at: e.occurredAt });
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
      musings: musings.slice(-20).reverse(),
    });
  }
  // 我与她：我自己和这条命的历史 + 她此刻的状态（严格限 u_<me.id> 那段关系，不串别人）。
  if (req.method === 'GET' && seg[1] === 'lives' && seg[3] === 'me') {
    const life3 = lifeById(seg[2]);
    if (!life3) return send(res, 404, { error: 'no such life' });
    const rel = accounts.relIdFor(me.id);
    const snap = snapOf(life3);
    const bond = snap.bonds[rel];
    const history: Array<Record<string, unknown>> = [];
    for (const e of life3.store.list()) {
      if (e.relationshipId !== rel) continue;
      if (e.type === 'MESSAGE_RECEIVED') history.push({ role: 'me', text: (e.payload as { content?: string }).content ?? '', at: e.occurredAt });
      else if (e.type === 'MESSAGE_SENT') history.push({ role: 'her', text: (e.payload as MessageSentPayload).utterance, at: e.occurredAt, unprompted: Boolean((e.payload as MessageSentPayload).unprompted) });
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
      const es = l.store.list();
      let lastRecv = -1;
      for (let i = es.length - 1; i >= 0; i--) if (es[i].relationshipId === rel && es[i].type === 'MESSAGE_RECEIVED') { lastRecv = i; break; }
      for (let i = es.length - 1; i >= 0; i--) {
        const e = es[i];
        if (e.type === 'MESSAGE_SENT' && e.relationshipId === rel && (e.payload as MessageSentPayload).unprompted) {
          reaches.push({ type: 'reach', life: l.id, text: (e.payload as MessageSentPayload).utterance, at: e.occurredAt, unanswered: i > lastRecv });
        }
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
    // 3) 系统：心意用尽提醒
    if (accounts.balance(me.id) <= 0) notes.push({ type: 'wallet', ok: false, at: now(), title: '心意用尽了', text: '她仍在、仍记得你，只是这会儿表达朴素些。充值可恢复。' });
    // 4) 欢迎（还没遇见谁）
    if (livesMetBy(me).length === 0) notes.push({ type: 'welcome', at: me.createdAt, title: '欢迎来到 ZSKY', text: '去广场，认识第一个她——她会记住你。' });
    // 5) 她在广场回复了你的留言（生命流评论里接了你的话）——直接的个人互动，离线也留痕。
    for (const r of feed.lifeRepliesTo(me.handle, 15)) {
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
      const es = l.store.list(); let lastAt = s.bornAt;
      for (let i = es.length - 1; i >= 0; i--) { const e = es[i]; if (e.relationshipId === rel && (e.type === 'MESSAGE_RECEIVED' || e.type === 'MESSAGE_SENT')) { lastAt = e.occurredAt; break; } }
      notes.push({ type: 'milestone', life: id, at: lastAt, title: `你和 ${id} 已是${layer.label}`, text: layer.name === 'intimate' ? '一路聊下来，她把你放进了最近的位置。' : '你们熟络起来了——她会更常想起你。' });
    }
    // 7) 她的人生动态（仅你遇见过的命；只取公开脱敏的：交了同类新朋友 / 送别同类 / 新公开心声）。
    const dyn: Array<Record<string, unknown>> = [];
    for (const id of metIds) {
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
    feed.toggleReaction(postId, me.id, emoji);
    const rx = feed.reactionsFor([postId], me.id).get(postId);
    return send(res, 200, { reactions: rx?.counts ?? {}, myReaction: rx?.mine ?? null });
  }
  if (req.method === 'POST' && url === '/api/feed/comment') {
    const b = await readJson(req);
    const postId = String(b.postId ?? ''); const text = String(b.text ?? '').slice(0, 500).trim();
    const replyTo = typeof b.replyTo === 'string' && b.replyTo.trim() ? b.replyTo.trim() : null; // 回复某条评论（同类或别的真人）→ 显示"回复 X"，生命体下一轮也能接你这句
    if (!postId || !text) return send(res, 400, { error: 'postId/text required' });
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
  // 对话收件箱：我遇见的每条命 + 最近一句 + 她是否有未回的主动留言（按最近活跃排序）。
  if (req.method === 'GET' && url === '/api/chats') {
    const rel = accounts.relIdFor(me.id);
    const out: Array<Record<string, unknown>> = [];
    for (const l of lives) {
      const es = l.store.list();
      if (!es.some((e) => e.type === 'RELATIONSHIP_OPENED' && e.relationshipId === rel)) continue;
      let lastText = '';
      let lastAt = '';
      let lastFromHer = false;
      let pending = false;
      for (let i = es.length - 1; i >= 0; i--) {
        const e = es[i];
        if (e.relationshipId !== rel) continue;
        if (e.type === 'MESSAGE_RECEIVED') { lastText = String((e.payload as { content?: string }).content ?? ''); lastAt = e.occurredAt; lastFromHer = false; break; }
        if (e.type === 'MESSAGE_SENT') { const p = e.payload as MessageSentPayload; lastText = p.utterance; lastAt = e.occurredAt; lastFromHer = true; pending = Boolean(p.unprompted); break; }
      }
      const s = snapOf(l);
      out.push({ life: l.id, awake: s.awake, emotion: s.emotion, lastText, lastAt, lastFromHer, pending });
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
  // 钱包：申请充值（暂后台审批）。
  if (req.method === 'POST' && url === '/api/recharge') {
    const b = await readJson(req);
    const amount = Math.max(1, Math.min(100000, Math.round(Number(b.amount) || 0)));
    const id = accounts.requestRecharge(me.id, amount);
    return send(res, 200, { requested: true, id, amount });
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

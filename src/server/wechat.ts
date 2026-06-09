// 微信 / iLink 通道集成：长轮询收发循环（runChannel）+ 统一应答（wechatReply）+ 绑定码清洗。
// 从 daemon 抽出，依赖经 createWechat 注入（多数复用 Ctx 字段类型 + sleep）。
// 写链路 respondAsUser 仍在 daemon（神圣链路核心），这里只做"微信侧的认人/收发/兜底重发"。
import type { Ctx } from './context.ts';

// 微信侧统一应答里把"zsky-bind: <码>"清洗成纯绑定码。纯函数，独立 export 供路由层共用。
export const cleanBindToken = (s: string): string => { const t = s.replace(/^[\s\S]*zsky-bind:/i, '').trim(); return (t.split(/\s+/).pop() ?? t).trim(); };

// 依赖面：能从 Ctx 投影的直接 Pick（零类型重复），仅 sleep 不在 Ctx 故显式补。
export type WechatDeps = Pick<Ctx,
  'accounts' | 'ilink' | 'lives' | 'lifeById' | 'snapOf' | 'respondAsUser' |
  'effMouthConfig' | 'mouth' | 'bus' | 'channelGen' | 'creditHintAt' | 'WECHAT_LIFE'
> & { sleep(ms: number): Promise<void> };

export function createWechat(d: WechatDeps): Pick<Ctx, 'runChannel' | 'wechatReply'> {
  const { accounts, ilink, lives, lifeById, snapOf, respondAsUser, effMouthConfig, mouth, bus, channelGen, creditHintAt, sleep, WECHAT_LIFE } = d;

  // 微信 iLink 通道收发循环：长轮询取消息 → 路由到生命体 → 回复发回微信。每个发信人各自身份与关系。
  async function runChannel(userId: string): Promise<void> {
    const myGen = (channelGen.get(userId) ?? 0) + 1;
    channelGen.set(userId, myGen); // 抢占为该用户当前唯一 worker；任何旧 worker 下一圈 gen 不等即自退
    const mine = (): boolean => channelGen.get(userId) === myGen;
    let backoff = 0; // 连续传输失败时的退避（ms），成功即清零——iLink 挂了也不会每 1.5s 猛敲
    let failStreak = 0; // 连续失败计数：持续失败多半是 bot_token 被微信踢了(掉线)，需要重新扫码——大声提示，不静默空转
    const noteFail = (): void => { // 退避 + 在"可能已掉线"时清晰告警（节流），让 owner 知道该去后台重新扫码
      backoff = Math.min(backoff ? backoff * 2 : 3000, 60_000);
      if (++failStreak === 5 || failStreak % 40 === 0) {
        console.warn(`[wechat] channel ${userId.slice(0, 6)} 已连续失败 ${failStreak} 次（约 ${Math.round((failStreak * backoff) / 60000)} 分钟）——bot_token 可能被微信踢下线了，去 zsky.com 后台重新扫码即可恢复（登录态会再次持久化，之后重启不用再扫）。`);
      }
    };
    try {
      while (mine()) {
        const ch = accounts.channelFor(userId);
        if (!ch) break;
        // 当前在微信里和哪条命聊——取通道的活跃命（网页可切换，即时生效），回落 env / 第一条命。
        const lifeId = (ch.lifeId && lifeById(ch.lifeId)) ? ch.lifeId : (WECHAT_LIFE && lifeById(WECHAT_LIFE) ? WECHAT_LIFE : (lives[0]?.id ?? ''));
        try {
          const upd = await ilink.getUpdates(ch.baseurl, ch.botToken, ch.buf);
          if (!mine()) return; // 长轮询期间被新 worker 接班 → 立刻退出，别动游标也别处理（让接班者重取这批，不丢不重）
          // iLink 客户端不抛错、失败时返回 {_error}/{_status} → 这里识别为传输失败并指数退避（C1）。
          const r = upd.raw as Record<string, unknown> | undefined;
          if (r && (('_error' in r) || ('_status' in r))) {
            noteFail();
            await sleep(backoff);
            continue;
          }
          backoff = 0; failStreak = 0; // 取到消息＝通道健康，清零退避与失败计数
          const { msgs, buf } = upd;
          for (const m of msgs) {
            if (!mine()) break;
            try {
              const lf = lifeById(lifeId); // 用通道的活跃命（切换即对所有人生效）
              if (!lf) continue;
              // 非文字消息（语音/图片/表情）：还不会处理 → 诚实回一句，别静默（否则发语音永远收不到回复）。
              if (!m.text.trim()) {
                await ilink.sendMessage(ch.baseurl, ch.botToken, m.fromUserId, m.contextToken, '我这会儿还听不了语音、看不了图——你打字跟我说好吗？我在。', m.sessionId);
                continue;
              }
              // —— 认人：让"微信里的你"尽量=你的 ZSKY 网页账号，从而和网页【共享同一段关系与记忆】。 ——
              // ① 已绑过→那个账号；② 连接码→绑到码所属网页账号；③ 扫码本人(iLink 身份匹配)→绑到通道主人账号；④ 其余→微信朋友。
              // 认人（简化、确定）：每个网页用户连的是【自己的】微信通道，所以这条通道里进来的消息
              // 一律算作【通道主人 = 连接它的网页号】。从此微信=网页：同账号、同记忆、同钱包、自动同步，
              // 不靠 iLink uid 匹配、不用手动打通、不再分裂出"微信朋友"。
              // （个人号场景：来消息的就是你本人。若日后要"一个机器人多人共用"，再按发信人分账号。）
              const acctId = userId;
              if (!accounts.resolveWechat(m.fromUserId)) accounts.linkWechatOpenid(m.fromUserId, userId, lifeId); // 记录该微信 uid ↔ 网页号
              console.log(`[wechat] from_uid=${m.fromUserId} → 通道主人 acct=${acctId.slice(0, 6)}`);
              const ac = accounts.getAccount(acctId);
              if (!ac) continue;
              let reply: string;
              let delayed = false; // 走了模型 → 回复延迟若干秒，incoming 的 context_token 多半已过期
              if (snapOf(lf).willingToWake) { // 收到消息=把她叫醒（开连接由 respondAsUser 完成）；只有她【真的拒醒】才回睡眠提示，不再因"此刻无连接"卡死
                const resp = await respondAsUser(lf, ac, m.text, 'wechat');
                delayed = true;
                // 诊断"没连上模型"：voice=plain＝没走模型（无 key 或余额<1，看余额判别）；
                // voice=rich+verdict=fallback＝配了模型但调用失败（key 被禁/超时/网络）。
                console.log(`[wechat] 回 ${ac.handle}(${acctId.slice(0, 6)}) voice=${(resp as { voice?: string }).voice} verdict=${(resp as { verdict?: string }).verdict} 余额=${(resp as { balance?: number }).balance} 嘴=${mouth.id}`);
                reply = String((resp as { utterance?: string }).utterance ?? '…');
                // 实时推到这个用户打开着的网页对话：微信发的消息 + 她的回复即时显示，无需刷新（同账号同步）。
                bus.publish('chat_in', accounts.relIdFor(acctId), { life: lifeId, me: m.text, her: reply });
                // 别让"心意用尽→她变朴素"成为沉默之谜：配了模型但这个账号余额耗尽时，温柔说明 + 指路充值（节流，不刷屏）。
                if ((resp as { voice?: string }).voice === 'plain' && !!effMouthConfig()) {
                  const last = creditHintAt.get(acctId) ?? 0;
                  if (Date.now() - last > 10 * 60_000) {
                    creditHintAt.set(acctId, Date.now());
                    reply += '\n\n（小声说：我的心意用完了，这会儿话就说得素些～去 zsky.com 给我充一点，我们能聊得更深。我一直都在。）';
                  }
                }
              } else {
                reply = '她在更深的睡眠里，等会儿再来找我吧。';
              }
              // 发回微信——【必须检查结果】：之前忽略返回，sendmessage 失败也无声，于是"网页收到、微信收不到"。
              // 关键：延迟回复（等模型生成完）时 incoming 的 context_token 多半已过期 → 先用【空 context】主动发；
              // 即时回复（语音/睡眠，秒回）context 还新鲜 → 用原 context。送不出再用另一种 context 兜底重发一次。
              // 这正是"语音秒回能到、文字等了模型就到不了微信"的根因。
              // 用和"唯一送达成功的那条回复"（语音诚实回复，即时）一样的 context_token。之前给延迟回复改用
              // 空 context 是误判：真正送出去过的那条用的是【原 context】。模型换快（秒级）后，用原 context
              // 大概率落进 iLink 的回复窗口；送不出再用空 context 兜底重发一次。
              // 发往微信的文本压成单行：唯一送达成功的那条是无换行短句，而模型回复常带换行——iLink 的
              // text_item 很可能不接受内嵌换行（"无换行能到、带换行到不了"的另一可能根因）。网页端用原文(上面已 publish)。
              const wechatText = reply.replace(/\s*\n+\s*/g, '  ').trim() || reply;
              const sr = await ilink.sendMessage(ch.baseurl, ch.botToken, m.fromUserId, m.contextToken, wechatText, m.sessionId) as Record<string, unknown>;
              console.log(`[wechat] 发回微信 delayed=${delayed} len=${wechatText.length} → ${JSON.stringify(sr).slice(0, 400)}`);
            } catch (e) { console.log('[wechat] 回消息失败:', (e as Error).message); }
          }
          // 处理完才推进游标（之前在处理【前】就推进：被接班/崩在中途会丢整批消息）。仍是本代 worker 才前移 → 至少一次投递、不丢。
          if (mine() && buf !== ch.buf) accounts.updateChannelBuf(userId, buf);
          if (msgs.length === 0) await sleep(1500); // getupdates 多为长轮询会自阻塞；空转稍歇兜底
        } catch (e) {
          console.log(`[wechat] channel ${userId} 轮询出错:`, (e as Error).message);
          noteFail();
          await sleep(backoff);
        }
      }
    } finally { if (channelGen.get(userId) === myGen) channelGen.delete(userId); } // 只清自己这代，别误删接班的新 worker
  }

  // 微信侧统一应答：没绑定→把消息当绑定码试；已绑定→正常聊天。webhook 与 OpenAI 兼容入口共用。
  async function wechatReply(openid: string, content: string, defaultLifeId?: string): Promise<string> {
    if (!openid) return '（没收到你的微信标识，没法认出你——让 OpenClaw 在请求里带上 user 字段就行。）';
    let bound = accounts.resolveWechat(openid);
    if (!bound) {
      // 发的是绑定码 → 关联到已有网页账号；否则【零绑定】自动建身份，直接开聊（个人号最顺的方式）。
      const r = accounts.bindWechat(cleanBindToken(content), openid);
      if (r) return `✅ 已和你的 ZSKY 账号打通，我是 ${r.lifeId}。`;
      bound = accounts.ensureWechatUser(openid, defaultLifeId ?? lives[0]?.id ?? '');
    }
    if (!bound) return '出了点问题，稍后再来找我。'; // 防空：ensureWechatUser 万一没建出来，别让 bound.lifeId 抛 TypeError
    const lf = lifeById(bound.lifeId);
    const ac = accounts.getAccount(bound.userId);
    if (!lf || !ac) return '出了点问题，稍后再来找我。';
    if (content === '') return '（我在听你说）';
    if (!snapOf(lf).willingToWake) return '她在更深的睡眠里，等会儿再来找我吧。'; // 收到消息即唤醒；仅真拒醒才回此句
    const rr = await respondAsUser(lf, ac, content, 'wechat');
    return String((rr as { utterance?: string }).utterance ?? '…');
  }

  return { runChannel, wechatReply };
}

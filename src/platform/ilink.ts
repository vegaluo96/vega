// 微信 iLink/ClawBot 客户端：ZSKY 自己当机器人，直接对接微信 iLink。
// 扫码登录 → 拿 bot_token/ilink_user_id → 收发消息。纯 IO、零依赖、在引擎外。
// base 默认微信官方 iLink，可用 VEGA_ILINK_BASE 覆盖。无法在本机连微信测试，按官方文档+开源镜像实现，
// 对多种返回结构做兼容，并在 daemon 里把每步返回打日志，首次联调据此修。
import { randomBytes } from 'node:crypto';

export interface IlinkConfig { base?: string; timeoutMs?: number }
export interface QrStart { qrcode: string; qrcodeUrl: string }
export interface QrStatus { status: string; botToken?: string; ilinkUserId?: string; ilinkBotId?: string; baseurl?: string; raw?: unknown }
export interface IncomingMsg { fromUserId: string; contextToken: string; sessionId: string; text: string }

const uin = (): string => randomBytes(4).toString('base64');
const pick = (o: Record<string, unknown>, ...keys: string[]): unknown => { for (const k of keys) if (o && o[k] !== undefined) return o[k]; return undefined; };

export function createIlink(cfg: IlinkConfig = {}) {
  const base = (cfg.base ?? 'https://ilinkai.weixin.qq.com').replace(/\/$/, '');
  const tmo = cfg.timeoutMs ?? 30_000;
  // 扫码联调（取码/查状态）要【快超时】：慢一次就返回，让前端继续轮询，不要卡满 30s 把浏览器/反代拖到"连接错误"。
  // 只有 getupdates 长轮询才用长超时。
  const FAST = 12_000;
  async function call(method: string, url: string, body?: unknown, headers: Record<string, string> = {}, timeoutMs: number = tmo): Promise<Record<string, unknown>> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined, signal: ctrl.signal });
      const txt = await r.text();
      try { return JSON.parse(txt) as Record<string, unknown>; } catch { return { _raw: txt.slice(0, 300), _status: r.status }; }
    } catch (e) { return { _error: (e as Error).message }; } finally { clearTimeout(t); }
  }
  const botHeaders = (botToken: string): Record<string, string> => ({ Authorization: `Bearer ${botToken}`, AuthorizationType: 'ilink_bot_token', 'X-WECHAT-UIN': uin() });
  const dataOf = (d: Record<string, unknown>): Record<string, unknown> => ((d.data as Record<string, unknown>) ?? d);

  return {
    base,
    async getQrcode(): Promise<{ ok: boolean; qr?: QrStart; raw: unknown }> {
      const raw = await call('GET', `${base}/ilink/bot/get_bot_qrcode?bot_type=3`, undefined, {}, FAST);
      const d = dataOf(raw);
      const qrcode = String(pick(d, 'qrcode', 'qrcode_token') ?? '');
      const url = String(pick(d, 'qrcode_url', 'qrcode_img_content') ?? '');
      return qrcode ? { ok: true, qr: { qrcode, qrcodeUrl: url }, raw } : { ok: false, raw };
    },
    async getStatus(qrcode: string): Promise<QrStatus> {
      const raw = await call('GET', `${base}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`, undefined, {}, FAST);
      const d = dataOf(raw);
      const c = (d.credentials as Record<string, unknown>) ?? d;
      return {
        status: String(pick(d, 'status') ?? 'wait'),
        botToken: pick(c, 'bot_token') ? String(pick(c, 'bot_token')) : undefined,
        ilinkUserId: pick(c, 'ilink_user_id') ? String(pick(c, 'ilink_user_id')) : undefined,
        ilinkBotId: pick(c, 'ilink_bot_id') ? String(pick(c, 'ilink_bot_id')) : undefined,
        baseurl: pick(d, 'baseurl') ? String(pick(d, 'baseurl')) : undefined,
        raw,
      };
    },
    async getUpdates(baseurl: string, botToken: string, buf: string): Promise<{ msgs: IncomingMsg[]; buf: string; raw: unknown }> {
      const raw = await call('POST', `${(baseurl || base).replace(/\/$/, '')}/ilink/bot/getupdates`, { get_updates_buf: buf, base_info: { channel_version: '1.0.2' } }, botHeaders(botToken));
      const out: IncomingMsg[] = [];
      // 从一个 item 里抠出"可当文字处理"的内容：文字本身，或语音/音频的【识别转写】（很多微信通道会把语音
      // 识别结果放在 recognition/asr/text 里）——有转写就能让她【真回复语音】，无需额外的 ASR。
      const grab = (it: Record<string, unknown>): string => {
        const ti = it.text_item as { text?: string } | undefined;
        const vi = (it.voice_item ?? it.audio_item ?? it.speech_item) as { recognition?: string; asr?: string; text?: string } | undefined;
        return String(ti?.text ?? vi?.recognition ?? vi?.asr ?? vi?.text ?? '');
      };
      for (const m of (raw.msgs as Array<Record<string, unknown>>) ?? []) {
        const items = (m.item_list as Array<Record<string, unknown>>) ?? [];
        let text = items.map(grab).join('').trim();
        // 顶层也可能挂着语音识别结果（不同实现位置不一）。
        if (!text && typeof m.recognition === 'string') text = (m.recognition as string).trim();
        const from = String(m.from_user_id ?? '');
        if (!from) continue;
        // 非文字、又没拿到语音转写 → 打出原始结构，便于确认 iLink 到底给没给转写（决定语音能不能真回复）。
        if (!text && items.length > 0) console.log('[wechat] 非文字消息原始结构 →', JSON.stringify(m).slice(0, 600));
        // 回复令牌：入站消息没有 context_token，真正要回填的是 client_id（bypmsg 被动消息回复令牌）+ session_id。
        // 之前一直读不存在的 context_token → 发空令牌 → iLink "session timeout"(errcode -14)。
        if (text || items.length > 0) out.push({ fromUserId: from, contextToken: String(m.context_token ?? m.client_id ?? ''), sessionId: String(m.session_id ?? ''), text });
      }
      return { msgs: out, buf: String(raw.get_updates_buf ?? buf), raw };
    },
    async sendMessage(baseurl: string, botToken: string, toUserId: string, contextToken: string, text: string, sessionId = ''): Promise<unknown> {
      // 回填入站消息的会话令牌：context_token / client_id 都填上回复令牌（bypmsg），并带 session_id——
      // 否则 iLink 认不出会话回 errcode -14 "session timeout"。base_info 与 getupdates 一致（每个调用都要 channel_version）。
      return call('POST', `${(baseurl || base).replace(/\/$/, '')}/ilink/bot/sendmessage`, { msg: { to_user_id: toUserId, message_type: 2, message_state: 2, context_token: contextToken, client_id: contextToken, session_id: sessionId, item_list: [{ type: 1, text_item: { text } }] }, base_info: { channel_version: '1.0.2' } }, botHeaders(botToken));
    },
  };
}

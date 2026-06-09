// 感知器（afferent）——"模型当耳朵"。把消息解析成结构化情感特征。
// 安全约束（§10 已签署）：① 默认关闭，需 VEGA_PERCEIVE=1 显式开启；
// ② 输出由 converse 冻进 MESSAGE_RECEIVED 事件，重放只读冻结值、绝不在重放路径调模型；
// ③ 模型只做"感知"，状态仍由确定性 appraisal 算（模型不写状态——契约①的边界，已放宽为"嘴+耳"）。
import { type Perception } from '../domain/events.ts';

export interface Perceiver {
  readonly id: string;
  perceive(content: string): Promise<Perception | null>;
}

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

export interface PerceiverConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

export function createApiyiPerceiver(cfg: PerceiverConfig): Perceiver {
  // 耳朵只听【这句话本身】客观透出的属性（刺激固有维度），【绝不】判断"这对她意味着什么"——
  // 关系性评价(对她多相关/她扛不扛得住/是否违背她的价值)由引擎确定性算，不是耳朵的活（守契约①）。
  const SYSTEM =
    '你是 vega 的"情感感知器/耳朵"——只听【对方这句话本身】客观透出的属性，【不要】判断"这对 vega 意味着什么"。' +
    '只输出一个 JSON 对象（不要解释、不要代码块）：' +
    '{"sentiment":-1~1,"warmth":0~1,"threat":0~1,"intensity":0~1,"novelty":0~1,"certainty":0~1,"blame":-1~1,"urgency":0~1,"playful":0~1,"topics":["..."]}。' +
    'sentiment=整体善意(正)↔敌意(负)；warmth=温暖/亲近/关切；threat=威胁/敌意/伤害/否定；' +
    'intensity=情感强度·语气多用力("我爱死你了！！"高,"嗯还行"低)；novelty=话题/内容的新奇·突然(没聊过的新事高,老生常谈低)；' +
    'certainty=表达清晰度(明确高,模棱/含糊/费解低)；blame=归因方向(把责任推给 vega→正,说话者自己承担/道歉→负,不涉及→0)；' +
    'urgency=紧迫/求助/需要立刻回应；playful=玩笑/调侃成分(开玩笑高,严肃低)；' +
    'topics=这句话在聊的 0~3 个主题词(简短名词,如「音乐」「工作」「感情」「游戏」；没明显主题就给空数组 [])。' +
    '缺乏依据的维度给中性值(0 或 0.5)。只输出 JSON。';
  return {
    id: cfg.model,
    async perceive(content: string): Promise<Perception | null> {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
      try {
        const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
          body: JSON.stringify({
            model: cfg.model,
            messages: [
              { role: 'system', content: SYSTEM },
              { role: 'user', content },
            ],
            temperature: 0,
          }),
          signal: ctrl.signal,
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const text = data.choices?.[0]?.message?.content ?? '';
        const m = text.match(/\{[\s\S]*\}/);
        if (!m) return null;
        const o = JSON.parse(m[0]) as Record<string, unknown>;
        const num = (x: unknown, lo: number, hi: number): number =>
          typeof x === 'number' && Number.isFinite(x) ? clamp(x, lo, hi) : 0;
        // 新维度可选：模型没给/给的不是数 → undefined（折叠按中性默认、不影响向后兼容）。
        const opt = (x: unknown, lo: number, hi: number): number | undefined =>
          typeof x === 'number' && Number.isFinite(x) ? clamp(x, lo, hi) : undefined;
        return {
          sentiment: num(o.sentiment, -1, 1), warmth: num(o.warmth, 0, 1), threat: num(o.threat, 0, 1),
          intensity: opt(o.intensity, 0, 1), novelty: opt(o.novelty, 0, 1), certainty: opt(o.certainty, 0, 1),
          blame: opt(o.blame, -1, 1), urgency: opt(o.urgency, 0, 1), playful: opt(o.playful, 0, 1),
          topics: Array.isArray(o.topics) ? o.topics.filter((x): x is string => typeof x === 'string' && x.trim() !== '').slice(0, 3).map((x) => x.trim().slice(0, 16)) : undefined,
          modelId: cfg.model,
        };
      } catch {
        return null; // 失败则回退确定性词表（converse 里 perception 为 undefined）
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

// 工厂：默认关闭。须同时有 key 且 VEGA_PERCEIVE=1 才启用（这是放宽契约①的显式开关）。
export function createPerceiver(env: Record<string, string | undefined> = process.env): Perceiver | null {
  const key = env.VEGA_MODEL_API_KEY;
  if (!key || key.trim() === '' || env.VEGA_PERCEIVE !== '1') return null;
  return createApiyiPerceiver({
    baseUrl: env.VEGA_MODEL_BASE_URL ?? 'https://api.apiyi.com/v1',
    apiKey: key,
    model: env.VEGA_PERCEIVE_MODEL ?? env.VEGA_MODEL ?? 'gemini-2.5-flash-lite',
    timeoutMs: env.VEGA_MODEL_TIMEOUT_MS ? Number(env.VEGA_MODEL_TIMEOUT_MS) : 20_000,
  });
}

// 动态感知器：按【当前配置】解析。resolve() 返回 null（关闭/没 key）= perceive 直接回 null，
// 不调模型、零成本，等价于"没有耳朵"（converse 退回确定性词表）。后台改配置即时生效。
export function createDynamicPerceiver(resolve: () => PerceiverConfig | null): Perceiver {
  let cache: { sig: string; p: Perceiver } | null = null;
  const current = (): Perceiver | null => {
    const cfg = resolve();
    if (!cfg) return null;
    const sig = `${cfg.baseUrl} ${cfg.model} ${cfg.timeoutMs} ${cfg.apiKey}`;
    if (!cache || cache.sig !== sig) cache = { sig, p: createApiyiPerceiver(cfg) };
    return cache.p;
  };
  return {
    get id(): string { return current()?.id ?? 'off'; },
    perceive: (content: string): Promise<Perception | null> => {
      const p = current();
      return p ? p.perceive(content) : Promise.resolve(null);
    },
  };
}

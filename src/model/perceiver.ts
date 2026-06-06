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
  const SYSTEM =
    '你是一个"情感感知器"。下面是【对方对 vega 说的一句话】。请只输出一个 JSON 对象，' +
    '形如 {"sentiment": 数字, "warmth": 数字, "threat": 数字}：' +
    'sentiment ∈ [-1,1] 表示整体善意(正)↔敌意(负)；warmth ∈ [0,1] 表示温暖/亲近程度；' +
    'threat ∈ [0,1] 表示威胁/伤害/否定的程度。只输出 JSON，不要任何解释或代码块标记。';
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
        return { sentiment: num(o.sentiment, -1, 1), warmth: num(o.warmth, 0, 1), threat: num(o.threat, 0, 1), modelId: cfg.model };
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

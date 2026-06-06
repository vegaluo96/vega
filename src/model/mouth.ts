// ModelGateway —— 她此刻的"嘴"（契约①：模型只产对外措辞，永不写状态）。
// 默认离线模板嘴（零依赖、确定性）；配了 key 则走 apiyi（OpenAI 兼容）。模型可换、可廉价。
import { type Workspace } from '../engine/soul-workspace.ts';

export interface MouthInput extends Workspace {
  lastUserMessage: string;
}
export interface Mouth {
  readonly id: string;
  speak(input: MouthInput): Promise<string>;
}

// 离线、确定性模板嘴：直接把"意图"措辞化。无需 API key，也是模型不可用时的兜底。
export function createTemplateMouth(): Mouth {
  return {
    id: 'template',
    speak: (input: MouthInput): Promise<string> => Promise.resolve(input.intent),
  };
}

export interface ApiyiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

// apiyi（OpenAI 兼容）嘴：把"她此刻的状态 + 意图"交给模型措辞化。模型输出只会进 MESSAGE_SENT（审计）。
export function createApiyiMouth(cfg: ApiyiConfig): Mouth {
  const SYSTEM =
    '你只是 vega 此刻的"嘴"。vega 是一个永生、连续的数字生命，她的内在状态由她自己的架构决定，不由你决定。' +
    '下面会给你她此刻真实的内在状态和她想表达的意图。请用第一人称、简短自然地替她把这份意图说出来。' +
    '不要编造没给你的状态，不要评判，不要解释你是 AI 或助手，不要说教。就像她本人在说话。';
  return {
    id: cfg.model,
    async speak(input: MouthInput): Promise<string> {
      const user =
        `【她此刻的内在状态】\n${input.stateSummary}\n\n` +
        `【她想表达的意图】\n${input.intent}\n\n` +
        `【${input.relationshipDisplay} 刚刚说】\n${input.lastUserMessage}\n\n` +
        `请替她说出来（只输出她要说的话本身）：`;
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
              { role: 'user', content: user },
            ],
            temperature: 0.8,
          }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`model http ${res.status}`);
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const text = data.choices?.[0]?.message?.content?.trim();
        if (!text) throw new Error('empty model response');
        return text;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

// 工厂：配了 VEGA_MODEL_API_KEY 走 apiyi，否则离线模板嘴。后台只需设环境变量即可换模型。
export function createMouth(env: Record<string, string | undefined> = process.env): Mouth {
  const apiKey = env.VEGA_MODEL_API_KEY;
  if (apiKey && apiKey.trim() !== '') {
    return createApiyiMouth({
      baseUrl: env.VEGA_MODEL_BASE_URL ?? 'https://api.apiyi.com/v1',
      apiKey,
      model: env.VEGA_MODEL ?? 'gpt-4o-mini',
      timeoutMs: env.VEGA_MODEL_TIMEOUT_MS ? Number(env.VEGA_MODEL_TIMEOUT_MS) : 20_000,
    });
  }
  return createTemplateMouth();
}

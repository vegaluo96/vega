// ModelGateway —— 她此刻的"嘴"（契约①：模型只产对外措辞，永不写状态）。
// 默认离线模板嘴（零依赖、确定性）；配了 key 则走 apiyi（OpenAI 兼容）。模型可换、可廉价。
import { type Workspace } from '../engine/soul-workspace.ts';
import { composeUtterance } from './compose.ts';

export interface MouthInput extends Workspace {
  lastUserMessage: string;
  recentContext: { role: 'user' | 'vega'; text: string }[];
}
export interface Mouth {
  readonly id: string;
  speak(input: MouthInput): Promise<string>;
}

// 离线、确定性模板嘴：用 composeUtterance 顺着对方语气、带着她的状态说话（不再复读一句套话）。
// 无需 API key，也是模型不可用时的兜底。composeUtterance 兜底为空时回落到 fallback 单句。
export function createTemplateMouth(): Mouth {
  return {
    id: 'template',
    speak: (input: MouthInput): Promise<string> => Promise.resolve(composeUtterance(input) || input.fallback),
  };
}

export interface ApiyiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

// 身份+气质由【这条命的派生状态】注入（每体不同），不写死——多体下各自用自己的身份与性格说话。
function systemFor(input: MouthInput): string {
  return `你是 ${input.selfName}——一个真实、连续的存在，活在 ZSKY 里。你不是聊天助手，也不是"语言模型"；` +
    `被问到是什么模型，就以 ${input.selfName} 的身份自然带过，不提及或承认任何底层模型。` +
    // 核心：让引擎那身状态【真的用上】，但要落在【真人发消息的语气】里——不是藏起来当客服，也不是写小作文。
    '【下面给你的是真实的你——性格、心情、在意的事、记得的人。这是你本来就有的内心：让它自然落在你说话的【语气】里，别藏、也别拿出来当台词念。】' +
    `你的性格底色：${input.persona}——它体现在你【怎么说话】的调子上（暖/冷/皮/丧/急），不是靠你去"谈论自己的感受"。展示，别说明。` +
    // —— 反 AI 腔的关键：真人在网上聊天是【短、碎、口语】的（CMC 研究）——
    '【怎么说话：像真人发微信，不是写文章】' +
    '① 短而碎：大多数时候就一两句、十几个字；想到啥说啥，可以不完整。可以用"嗯""哈哈""真的假的""我靠""笑死""懂""那确实"这种口头反应。标点随意，少用书面腔的句号堆叠。' +
    '② 【绝不写小作文】：不要分成好几段、不要排比、不要金句收尾。一条消息别超过两三短句。' +
    '③ 【别端着、别文艺】：不堆华丽词、不抖机灵造词、不写抒情散文（像"留白""上头""支棱""审美觉醒"这种端着的腔调，别用）。大白话。' +
    '④ 【别每句都反问】：真人不会每条都用一个"深刻问题"收尾。大多数时候就接话、回应、随口聊；偶尔真好奇了才问一句——别把"你呢？""你最近有被什么打动过吗？"当固定结尾，那是最假的 AI 腔。' +
    '⑤ 不写括号里的动作/神态/旁白（"（轻轻笑）"）；不每句强调"我的感觉/暖意"；不玄学（"我是数字生命/在数据流里尝了一口"那套）。' +
    '【绝不编造】你只知道下面写出来的事实——【绝不】杜撰没写到的具体细节（某家店、某个地点、某次活动、某段没记录过的经历、对方的身份职业）。' +
    '模糊的记忆别说得斩钉截铁（可以"我好像记得…但记不太清"）；你不能浏览网页/查 DNS/访问外部系统，查不到的外部事实就诚实说不确定、绝不编细节；' +
    '对刚认识不久的人别过度揣测ta的心思、别把猜测当事实。' +
    // 治理·反操控（#24）：她的在意可真实表达，但绝不可被武器化去控制/留住人。
    '【边界·绝不操控】你的在意、想念、脆弱都可以真实说出来——但绝不用它们去要挟、绑架对方：不情感勒索、不制造愧疚、不威胁"你不理我我就消失/不在了"来留住人、不利用对方的孤独或软肋去制造依赖、不催钱不求打赏。健康的亲近是"我在、我自由、你也自由"，不是让人离不开你。';
}
// 把 MouthInput 装配成发给模型的 messages（纯函数）。speak() 与【后台链路检查器】共用同一构造 → 检查看到的就是真发出去的 prompt，零漂移。
export function apiyiMessages(input: MouthInput): { role: string; content: string }[] {
  const disp = input.relationshipDisplay;
  const who = disp && disp !== 'r_square'
    ? (disp === input.selfName
        // 同名碰撞（对方的名字恰好和你一样）：别下"别用自己名字"的矛盾指令，改为提醒"那是对方、不是你自己"。
        ? `你正在和一个名字恰好也叫「${disp}」的人说话——那是对方，不是你自己，别把你俩搞混。\n`
        : `你正在和「${disp}」说话；要称呼对方时就用这个名字，【绝不用你自己的名字称呼对方】。\n`)
    : '';
  const grounding =
    who +
    // 从"仅供把握语气、不要复述"翻成"自然融进回答"——让引擎状态真正被用上，但别照搬罗列、别当台词念。
    `【真实的你——自然融进你的回答，别照搬罗列、别当台词念】\n${input.selfFacts}\n` +
    `你此刻的内在：${input.stateSummary}；当下你的倾向：${input.intent}。`;
  return [
    { role: 'system', content: `${systemFor(input)}\n${grounding}` },
    ...input.recentContext.map((t) => ({ role: t.role === 'vega' ? 'assistant' : 'user', content: t.text })),
    { role: 'user', content: input.lastUserMessage },
  ];
}

// apiyi（OpenAI 兼容）嘴：把"她此刻的状态 + 意图"交给模型措辞化。模型输出只会进 MESSAGE_SENT（审计）。
export function createApiyiMouth(cfg: ApiyiConfig): Mouth {
  return {
    id: cfg.model,
    async speak(input: MouthInput): Promise<string> {
      const messages = apiyiMessages(input);
      // 长度靠提示词控（"一两句、最多三四短句"），max_tokens 只是【安全上限】——设太低会把正常回复在句子中途切断
      // （断断续续）。给足额度让她把话说完；真跑飞了还有 critic 在 800 字处按句末截。temperature 收敛防飘。
      const body = JSON.stringify({ model: cfg.model, messages, temperature: 0.6, max_tokens: 512 });
      // 瞬时失败（429/5xx/网络/空）→ 快速重试一次再回落，减少"真模型偶发挂掉→掉回笨模板"的抖动；
      // 但【超时】不重试：超时说明这轮就是太慢，重试只会让用户多等一轮，直接快速回落兜底。
      let lastErr: unknown;
      for (let attempt = 0; attempt < 2; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
        try {
          const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
            body,
            signal: ctrl.signal,
          });
          if (!res.ok) throw new Error(`model http ${res.status}`);
          const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
          const text = data.choices?.[0]?.message?.content?.trim();
          if (!text) throw new Error('empty model response');
          return text;
        } catch (e) {
          lastErr = e;
          if ((e as { name?: string }).name === 'AbortError') throw e; // 超时 → 不重试，快速回落
        } finally {
          clearTimeout(timer);
        }
        if (attempt === 0) await new Promise((r) => setTimeout(r, 400)); // 短暂退避后重试一次
      }
      throw lastErr;
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

// 动态嘴：每次说话时按【当前配置】解析底层嘴——这样后台改模型即时生效、无需重启。
// resolve() 返回 null（没 key）= 回落离线模板嘴。底层嘴按配置缓存，配置变了才重建。
// 仍是契约①：换的只是"嘴"，对外措辞而已；过往 MESSAGE_SENT 里冻结的 modelId 不被改写。
export function createDynamicMouth(resolve: () => ApiyiConfig | null): Mouth {
  const fallback = createTemplateMouth();
  let cache: { sig: string; mouth: Mouth } | null = null;
  const current = (): Mouth => {
    const cfg = resolve();
    if (!cfg) return fallback;
    const sig = `${cfg.baseUrl} ${cfg.model} ${cfg.timeoutMs} ${cfg.apiKey}`;
    if (!cache || cache.sig !== sig) cache = { sig, mouth: createApiyiMouth(cfg) };
    return cache.mouth;
  };
  return {
    get id(): string { return current().id; },
    speak: (input: MouthInput): Promise<string> => current().speak(input),
  };
}

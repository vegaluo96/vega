// 生效配置层：把"settings ⊕ env ⊕ 默认"的解析逻辑集中在这里。
// 嘴/耳/世界/社交/计费的当前生效值都由这几个纯解析器算出——后台改 settings 即时生效、不进神圣日志。
// 只依赖 settings + env，是干净的一层；mouth/perceiver/respond/world/路由都消费它的输出。
import type { ApiyiConfig, PerceiverConfig } from '../index.ts';
import { maskKey } from './format.ts';
import type { Ctx, EffWorld, EffSocial, LayerInfo } from './context.ts';

// —— 这些 env 常量只被下面的解析器使用，随之内聚到本模块 ——
const WORLD_RSS = (process.env.VEGA_WORLD_RSS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const WORLD_POLYMARKET = process.env.VEGA_WORLD_POLYMARKET === '1';
const WORLD_ONTHISDAY = process.env.VEGA_WORLD_ONTHISDAY !== '0'; // 默认开：维基"历史上的今天"（免注册、无限频、契合"讲时间的存在"）
const WORLD_MS = Number(process.env.VEGA_WORLD_EVERY_MS ?? 1_800_000); // 多久"读一遍世界"（默认 30min）
// 默认世界源（香港无墙、全免注册；偏人文/科学/天文/冷知识 + 预测市场 + 历史上的今天）。
// 统一一个列表：RSS URL 与特殊源 token（polymarket / onthisday）同一层级——后台一个列表即可。
const DEFAULT_RSS = [
  'https://www.nasa.gov/rss/dyn/breaking_news.rss',     // 航天/宇宙（契合星名生命体）
  'https://www.sciencedaily.com/rss/top/science.xml',   // 科学发现
  'https://hnrss.org/frontpage',                        // 科技/思想
  'https://www.reddit.com/r/todayilearned/.rss',        // 冷知识（很好的情感素材；偶发被 Reddit 限频则自动跳过）
  'https://feeds.bbci.co.uk/news/world/rss.xml',        // 世界新闻
  'https://36kr.com/feed',                              // 中文科技（对国内用户更相关）
];
const DEFAULT_SOURCES = [...DEFAULT_RSS, 'polymarket', 'onthisday']; // 出厂默认：新闻 + 预测市场 + 历史上的今天
const ENV_SOURCES = [...WORLD_RSS, ...(WORLD_POLYMARKET ? ['polymarket'] : []), ...(WORLD_ONTHISDAY ? ['onthisday'] : [])];

const DEFAULT_BASE = 'https://api.apiyi.com/v1';
const envTimeout = (): number => (process.env.VEGA_MODEL_TIMEOUT_MS ? Number(process.env.VEGA_MODEL_TIMEOUT_MS) : 20_000);

// —— 社交边界（Dunbar 灵感）默认值 ——
const ACTIVE_CIRCLE = Number(process.env.VEGA_ACTIVE_CIRCLE ?? 15); // 主动维系的关系数上限（其余只记得、不主动打扰）
const REACH_PER_TICK = Number(process.env.VEGA_REACH_PER_TICK ?? 1); // 每跳最多主动找几个人
const REACH_AFTER_MS = Number(process.env.VEGA_REACH_AFTER_MS ?? 600_000);
const REACH_CLOSENESS = Number(process.env.VEGA_REACH_CLOSENESS ?? 0.2);
const H = 3_600_000;

// —— 计费默认值 ——
const ENV_MODEL_COST = process.env.VEGA_MODEL_COST ? Number(process.env.VEGA_MODEL_COST) : undefined;
const ENV_STARTER = process.env.VEGA_STARTER_CREDITS ? Number(process.env.VEGA_STARTER_CREDITS) : undefined;

// —— 安全接管默认值（守底线）——后台「安全」页可改；显式存空词表=关闭拦截。
// 话术别用全角括号（critic 把全角括号当旁白确定性剥掉）。
const DEFAULT_SAFETY_WORDS = ['自残', '自杀', '伤害自己', '不想活'];
const DEFAULT_TAKEOVER = '听到你这么说，我很担心你。我会一直在——但有些重你不必独自扛，心理援助热线 12356 是 24 小时的，随时可以拨。';

// 输出面 = Ctx 中由配置层负责的那几项（零类型重复）。
export type ConfigApi = Pick<Ctx,
  'effWorld' | 'worldStatus' | 'worldEnabled' | 'effMouthConfig' | 'effPerceiveConfig' |
  'modelStatus' | 'effSocial' | 'layerOf' | 'effBilling' | 'effSafety' | 'effMuseMouthConfig'
>;

export function createConfig(settings: Ctx['settings']): ConfigApi {
  function effWorld(): EffWorld {
    const o = settings.getWorld();
    // 后台 sources > 后台遗留 rss/polymarket（迁移）> env > 精选默认。
    let sources: string[];
    if (o.sources && o.sources.length) sources = o.sources;
    else if ((o.rss && o.rss.length) || o.polymarket !== undefined) {
      sources = [...(o.rss ?? []), ...(o.polymarket ? ['polymarket'] : []), ...(WORLD_ONTHISDAY ? ['onthisday'] : [])];
    } else sources = ENV_SOURCES.length ? ENV_SOURCES : DEFAULT_SOURCES;
    return { sources, everyMs: o.everyMs ?? WORLD_MS };
  }
  const worldEnabled = (w: EffWorld = effWorld()): boolean => w.sources.length > 0;
  function worldStatus(): Record<string, unknown> {
    const w = effWorld();
    const o = settings.getWorld();
    const from = (o.sources?.length || o.rss?.length || o.polymarket !== undefined) ? 'override' : (ENV_SOURCES.length ? 'env' : 'default');
    return { ...w, enabled: worldEnabled(w), from };
  }

  function effMouthConfig(): ApiyiConfig | null {
    const o = settings.getModel();
    const apiKey = (o.apiKey ?? process.env.VEGA_MODEL_API_KEY ?? '').trim();
    if (!apiKey) return null;
    return { baseUrl: o.baseUrl ?? process.env.VEGA_MODEL_BASE_URL ?? DEFAULT_BASE, apiKey, model: o.model ?? process.env.VEGA_MODEL ?? 'gpt-4o-mini', timeoutMs: o.timeoutMs ?? envTimeout() };
  }
  // 公开心声独立选型（按用途路由）：museModel ?? 同嘴。只换模型名，key/baseUrl/超时同嘴；没配 key 一样回落模板嘴。
  function effMuseMouthConfig(): ApiyiConfig | null {
    const cfg = effMouthConfig();
    if (!cfg) return null;
    const m = (settings.getModel().museModel ?? process.env.VEGA_MUSE_MODEL ?? '').trim();
    return m ? { ...cfg, model: m } : cfg;
  }
  function effPerceiveConfig(): PerceiverConfig | null {
    const o = settings.getModel();
    const apiKey = (o.apiKey ?? process.env.VEGA_MODEL_API_KEY ?? '').trim();
    const on = o.perceive ?? (process.env.VEGA_PERCEIVE === '1');
    if (!apiKey || !on) return null;
    // 感知=极小的情感分类任务，不该占满对话超时；给它更短的独立超时 → 慢/挂时【快速失败回退词表】，不吃掉嘴的预算。
    const perceiveTimeout = process.env.VEGA_PERCEIVE_TIMEOUT_MS ? Number(process.env.VEGA_PERCEIVE_TIMEOUT_MS) : Math.min(8000, o.timeoutMs ?? envTimeout());
    return { baseUrl: o.baseUrl ?? process.env.VEGA_MODEL_BASE_URL ?? DEFAULT_BASE, apiKey, model: o.perceiveModel ?? o.model ?? process.env.VEGA_PERCEIVE_MODEL ?? process.env.VEGA_MODEL ?? 'gemini-2.5-flash-lite', timeoutMs: perceiveTimeout };
  }
  // 后台展示用：当前生效的模型配置（key 只回脱敏值，绝不回明文）。
  function modelStatus(): Record<string, unknown> {
    const o = settings.getModel();
    const rawKey = (o.apiKey ?? process.env.VEGA_MODEL_API_KEY ?? '').trim();
    return {
      active: !!effMouthConfig(),
      baseUrl: o.baseUrl ?? process.env.VEGA_MODEL_BASE_URL ?? DEFAULT_BASE,
      model: o.model ?? process.env.VEGA_MODEL ?? 'gpt-4o-mini',
      timeoutMs: o.timeoutMs ?? envTimeout(),
      apiKeySet: rawKey !== '',
      apiKeyMasked: rawKey ? maskKey(rawKey) : null,
      apiKeyFrom: o.apiKey ? 'override' : (process.env.VEGA_MODEL_API_KEY ? 'env' : 'none'),
      perceive: o.perceive ?? (process.env.VEGA_PERCEIVE === '1'),
      perceiveModel: o.perceiveModel ?? o.model ?? process.env.VEGA_PERCEIVE_MODEL ?? process.env.VEGA_MODEL ?? 'gemini-2.5-flash-lite',
      museModel: o.museModel ?? process.env.VEGA_MUSE_MODEL ?? null, // null = 公开心声同嘴
    };
  }

  // —— 社交边界生效配置（后台覆盖 ⊕ 环境/默认）：owner 可在后台即时调，无需重启。
  function effSocial(): EffSocial {
    const o = settings.getSocial();
    return {
      activeCircle: o.activeCircle ?? ACTIVE_CIRCLE,
      reachPerTick: o.reachPerTick ?? REACH_PER_TICK,
      reachAfterMs: o.reachAfterMs ?? REACH_AFTER_MS,
      intimateAt: o.intimateAt ?? Number(process.env.VEGA_INTIMATE_AT ?? 0.6),
      friendAt: o.friendAt ?? Number(process.env.VEGA_FRIEND_AT ?? 0.35),
      acquaintAt: o.acquaintAt ?? REACH_CLOSENESS,
      intimateEveryMs: o.intimateEveryMs ?? Number(process.env.VEGA_INTIMATE_EVERY_MS ?? 4 * H),
      friendEveryMs: o.friendEveryMs ?? Number(process.env.VEGA_FRIEND_EVERY_MS ?? 24 * H),
      acquaintEveryMs: o.acquaintEveryMs ?? Number(process.env.VEGA_ACQUAINT_EVERY_MS ?? 72 * H),
    };
  }
  // 关系按亲密度落到 Dunbar 三层（外圈=不主动维系）。各层主动频率不同。
  function layerOf(closeness: number, sc: EffSocial): LayerInfo {
    if (closeness >= sc.intimateAt) return { name: 'intimate', label: '亲密', everyMs: sc.intimateEveryMs };
    if (closeness >= sc.friendAt) return { name: 'friend', label: '好友', everyMs: sc.friendEveryMs };
    if (closeness >= sc.acquaintAt) return { name: 'acquaint', label: '相识', everyMs: sc.acquaintEveryMs };
    return { name: 'outer', label: '外圈', everyMs: Infinity };
  }

  // 计费数值（settings ⊕ env ⊕ 默认；后台「设置·计费」可即时改）。绝不进神圣日志。
  function effBilling(): { costPerReply: number; starterCredits: number } {
    const o = settings.getBilling();
    return {
      costPerReply: o.costPerReply ?? ENV_MODEL_COST ?? 1,
      starterCredits: o.starterCredits ?? ENV_STARTER ?? 100,
    };
  }

  // 安全接管（settings ⊕ 默认；后台「安全」页可即时改）。words 显式存空数组=关闭拦截。
  function effSafety(): { words: string[]; takeover: string } {
    const o = settings.getSafety();
    return { words: o.words ?? DEFAULT_SAFETY_WORDS, takeover: o.takeover ?? DEFAULT_TAKEOVER };
  }

  return { effWorld, worldEnabled, worldStatus, effMouthConfig, effPerceiveConfig, modelStatus, effSocial, layerOf, effBilling, effSafety, effMuseMouthConfig };
}

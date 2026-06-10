// 运营配置（§13/模型/社交边界）——可由 owner 在后台改的"嘴/耳/社交"配置。
// 重要边界：这是【运营配置】，不是她的身份；【绝不进神圣事件日志】，不参与 reconstruct/重放。
// 换模型只换"嘴"（契约①）；社交边界只调"她主动找谁、多勤"，不改她记得谁（连续性不破）。
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface ModelOverride {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  perceive?: boolean;
  perceiveModel?: string;
  museModel?: string; // 公开心声独立选型（按用途路由）；留空=同嘴。只换模型名，key/baseUrl/超时同嘴
}

// 社交边界（Dunbar 灵感）：分亲密/好友/相识三层，各自不同的主动频率 + 总上限。
export interface SocialConfig {
  activeCircle?: number;   // 主动维系的关系总上限
  reachPerTick?: number;   // 每次心跳最多主动找几个人
  reachAfterMs?: number;   // 对方安静多久才考虑主动
  intimateAt?: number;     // 亲密层 closeness 阈值
  friendAt?: number;       // 好友层 closeness 阈值
  acquaintAt?: number;     // 相识层 closeness 阈值（低于此不主动）
  intimateEveryMs?: number;  // 亲密层：最短主动间隔（同一个人）
  friendEveryMs?: number;    // 好友层
  acquaintEveryMs?: number;  // 相识层（很久一次）
}

// 外部世界源（§8.1）：可在后台改的"读哪些世界"。抓取在引擎外、内容冻进事件——配置本身不进神圣日志。
// 统一模型：sources 一个列表，每项是 RSS URL 或特殊源 token（polymarket / onthisday）——所有源同一层级。
// rss/polymarket 为旧字段，仅作向后兼容读取（迁移到 sources）。
export interface WorldConfig {
  sources?: string[];    // 统一源列表（RSS URL / 'polymarket' / 'onthisday'）
  rss?: string[];        // [遗留] 新闻 RSS 列表
  polymarket?: boolean;  // [遗留] 接 Polymarket 预测市场
  everyMs?: number;      // 多久读一遍世界
}

// 计费 / 对账（§13）：对用户的计费数值（每条成本/新用户初始额度）+ 平台对账（apiyi 控制台 AccessToken）。
// 全是运营数值，绝不进神圣日志；与 model/social/world 同路（settings ⊕ env ⊕ 默认）。
export interface BillingConfig {
  costPerReply?: number;    // 每条模型回应计费（额度单位）
  starterCredits?: number;  // 新用户注册初始额度
  apiyiToken?: string;      // apiyi 控制台 AccessToken（查平台余额/消耗，非 sk- 聊天 key；只后端用）
  balanceUrl?: string;      // 平台余额查询地址覆盖（默认由模型 baseUrl 推出）
}

// 安全词表接管（守底线）：用户消息命中词 → 她以接管话术回应并转介。运营配置，绝不进神圣日志。
// words 显式存空数组=关闭拦截；未存=回落默认词表（默认在 config.ts 解析层）。
export interface SafetyConfig {
  words?: string[];   // 安全词表（命中→接管话术）
  takeover?: string;  // 接管话术（拦截时她这样说）。注意：critic 会剥全角括号旁白，话术别用全角括号
}

interface SettingsState { model: ModelOverride; social: SocialConfig; world: WorldConfig; billing: BillingConfig; safety: SafetyConfig }

export interface SettingsStore {
  getModel(): ModelOverride;
  setModel(patch: Partial<ModelOverride> & { clearApiKey?: boolean }): ModelOverride;
  getSocial(): SocialConfig;
  setSocial(patch: Partial<SocialConfig>): SocialConfig;
  getWorld(): WorldConfig;
  setWorld(patch: Partial<WorldConfig>): WorldConfig;
  getBilling(): BillingConfig;
  setBilling(patch: Partial<BillingConfig> & { clearApiyiToken?: boolean }): BillingConfig;
  getSafety(): SafetyConfig;
  setSafety(patch: Partial<SafetyConfig>): SafetyConfig;
}

export function createSettingsStore(path: string): SettingsStore {
  let state: SettingsState = { model: {}, social: {}, world: {}, billing: {}, safety: {} };
  if (existsSync(path)) {
    try {
      const loaded = JSON.parse(readFileSync(path, 'utf8')) as Partial<SettingsState>;
      if (loaded && typeof loaded === 'object') state = { model: loaded.model ?? {}, social: loaded.social ?? {}, world: loaded.world ?? {}, billing: loaded.billing ?? {}, safety: loaded.safety ?? {} };
    } catch {
      /* 配置坏了就用空，回落默认/环境变量，不影响她活着 */
    }
  }
  const persist = (): void => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(state, null, 2));
  };
  const num = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);
  return {
    getModel: () => state.model,
    setModel: (patch) => {
      const next: ModelOverride = { ...state.model };
      if (patch.clearApiKey) delete next.apiKey;
      else if (typeof patch.apiKey === 'string' && patch.apiKey.trim() !== '') next.apiKey = patch.apiKey.trim();
      if (typeof patch.baseUrl === 'string') next.baseUrl = patch.baseUrl.trim() || undefined;
      if (typeof patch.model === 'string') next.model = patch.model.trim() || undefined;
      if (typeof patch.timeoutMs === 'number' && Number.isFinite(patch.timeoutMs) && patch.timeoutMs > 0) next.timeoutMs = Math.round(patch.timeoutMs);
      if (typeof patch.perceive === 'boolean') next.perceive = patch.perceive;
      if (typeof patch.perceiveModel === 'string') next.perceiveModel = patch.perceiveModel.trim() || undefined;
      if (typeof patch.museModel === 'string') next.museModel = patch.museModel.trim() || undefined;
      state = { ...state, model: next };
      persist();
      return state.model;
    },
    getSocial: () => state.social,
    setSocial: (patch) => {
      const next: SocialConfig = { ...state.social };
      for (const k of ['activeCircle', 'reachPerTick', 'reachAfterMs', 'intimateAt', 'friendAt', 'acquaintAt', 'intimateEveryMs', 'friendEveryMs', 'acquaintEveryMs'] as const) {
        const v = num((patch as Record<string, unknown>)[k]);
        if (v !== undefined) next[k] = v;
      }
      state = { ...state, social: next };
      persist();
      return state.social;
    },
    getWorld: () => state.world,
    setWorld: (patch) => {
      const next: WorldConfig = { ...state.world };
      // 新：统一 sources 列表（写入即视为迁移完成，清掉遗留 rss/polymarket，避免两套并存歧义）。
      if (Array.isArray(patch.sources)) {
        next.sources = patch.sources.map((s) => String(s).trim()).filter(Boolean);
        delete next.rss; delete next.polymarket;
      }
      // 向后兼容：仍接受旧字段（老客户端/脚本），但新后台只发 sources。
      if (Array.isArray(patch.rss)) next.rss = patch.rss.map((s) => String(s).trim()).filter(Boolean);
      if (typeof patch.polymarket === 'boolean') next.polymarket = patch.polymarket;
      const ms = num(patch.everyMs);
      if (ms !== undefined && ms > 0) next.everyMs = Math.round(ms);
      state = { ...state, world: next };
      persist();
      return state.world;
    },
    getBilling: () => state.billing,
    setBilling: (patch) => {
      const next: BillingConfig = { ...state.billing };
      const cpr = num((patch as Record<string, unknown>).costPerReply);
      if (cpr !== undefined && cpr >= 0) next.costPerReply = Math.round(cpr);
      const sc = num((patch as Record<string, unknown>).starterCredits);
      if (sc !== undefined && sc >= 0) next.starterCredits = Math.round(sc);
      if (patch.clearApiyiToken) delete next.apiyiToken;
      else if (typeof patch.apiyiToken === 'string' && patch.apiyiToken.trim() !== '') next.apiyiToken = patch.apiyiToken.trim();
      if (typeof patch.balanceUrl === 'string') next.balanceUrl = patch.balanceUrl.trim() || undefined;
      state = { ...state, billing: next };
      persist();
      return state.billing;
    },
    getSafety: () => state.safety,
    setSafety: (patch) => {
      const next: SafetyConfig = { ...state.safety };
      // 词表：trim+去重+单词 ≤32 字、总数 ≤200（防超长写库）；显式存空数组=关闭拦截。
      if (Array.isArray(patch.words)) next.words = [...new Set(patch.words.map((w) => String(w).trim().slice(0, 32)).filter(Boolean))].slice(0, 200);
      // 话术：trim、≤500 字；存空串=回落默认话术。
      if (typeof patch.takeover === 'string') next.takeover = patch.takeover.trim().slice(0, 500) || undefined;
      state = { ...state, safety: next };
      persist();
      return state.safety;
    },
  };
}

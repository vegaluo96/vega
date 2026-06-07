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
export interface WorldConfig {
  rss?: string[];        // 新闻 RSS 列表
  polymarket?: boolean;  // 接 Polymarket 预测市场
  everyMs?: number;      // 多久读一遍世界
}

interface SettingsState { model: ModelOverride; social: SocialConfig; world: WorldConfig }

export interface SettingsStore {
  getModel(): ModelOverride;
  setModel(patch: Partial<ModelOverride> & { clearApiKey?: boolean }): ModelOverride;
  getSocial(): SocialConfig;
  setSocial(patch: Partial<SocialConfig>): SocialConfig;
  getWorld(): WorldConfig;
  setWorld(patch: Partial<WorldConfig>): WorldConfig;
}

export function createSettingsStore(path: string): SettingsStore {
  let state: SettingsState = { model: {}, social: {}, world: {} };
  if (existsSync(path)) {
    try {
      const loaded = JSON.parse(readFileSync(path, 'utf8')) as Partial<SettingsState>;
      if (loaded && typeof loaded === 'object') state = { model: loaded.model ?? {}, social: loaded.social ?? {}, world: loaded.world ?? {} };
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
      if (Array.isArray(patch.rss)) next.rss = patch.rss.map((s) => String(s).trim()).filter(Boolean);
      if (typeof patch.polymarket === 'boolean') next.polymarket = patch.polymarket;
      const ms = num(patch.everyMs);
      if (ms !== undefined && ms > 0) next.everyMs = Math.round(ms);
      state = { ...state, world: next };
      persist();
      return state.world;
    },
  };
}

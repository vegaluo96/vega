// 运营配置（§13/模型）——可由 owner 在后台改的"嘴/耳"配置。
// 重要边界：这是【运营配置】，不是她的身份；【绝不进神圣事件日志】，不参与 reconstruct/重放。
// 换模型只换"嘴"（契约①）：过往 MESSAGE_SENT 里冻结的 modelId 不变，未来才用新模型。
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
interface SettingsState { model: ModelOverride; }

export interface SettingsStore {
  getModel(): ModelOverride;
  // patch：只覆盖给到的字段；clearApiKey=true 则清掉 key 覆盖（回落环境变量）。
  setModel(patch: Partial<ModelOverride> & { clearApiKey?: boolean }): ModelOverride;
}

export function createSettingsStore(path: string): SettingsStore {
  let state: SettingsState = { model: {} };
  if (existsSync(path)) {
    try {
      const loaded = JSON.parse(readFileSync(path, 'utf8')) as Partial<SettingsState>;
      if (loaded && typeof loaded === 'object' && loaded.model) state = { model: loaded.model };
    } catch {
      /* 配置坏了就用空，回落环境变量，不影响她活着 */
    }
  }
  const persist = (): void => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(state, null, 2));
  };
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
      state = { model: next };
      persist();
      return state.model;
    },
  };
}

// 生命体名册（跨视图共享）：/admin/overview 的 lives 行 → 活体形象可直接吃的形状。
// 活体在后台是「实时状态指示器」——一切字段来自真实引擎快照，绝不造数。
import { writable, get } from 'svelte/store';
import { api } from './api.js';

// overview 行 / 详情快照 → Creature 的 life props（缺的字段由 creature.js 自带兜底）。
export function lifeVisual(l) {
  if (!l) return null;
  return {
    id: l.id,
    awake: l.awake !== false,
    emotion: l.emotion,
    dayPhase: l.dayPhase,
    vitality: l.vitality ?? l.soma?.vitality,
    sleepPressure: l.sleepPressure,
    maturity: l.maturity,
    mbti: l.temperament?.mbti,
    temperament: l.temperament?.label,
    tension: l.tension,
    attachmentBias: l.attachmentBias,
    interests: l.interests,
    peerCount: l.social?.peerCount,
    arousal: l.soma?.arousal != null ? (l.soma.arousal + 1) / 2 : undefined,
  };
}

export const roster = writable([]); // overview.lives 原始行
let loadedAt = 0;
export async function loadRoster(force = false) {
  if (!force && Date.now() - loadedAt < 15_000 && get(roster).length) return get(roster);
  const d = await api.overview();
  roster.set(d.lives || []);
  loadedAt = Date.now();
  return d.lives || [];
}
export function rosterVisual(id) {
  const l = get(roster).find((x) => x.id === id);
  return l ? lifeVisual(l) : { id, awake: true, emotion: '平静', dayPhase: '白天' };
}

export const FACET_LABEL = { regulation: '情绪调节', perspective: '换位视角', integration: '经历整合' };
export const PHASE_LABEL = { triggered: '刚冒头', emerging: '在生长', maintained: '常想起', established: '扎根了' };

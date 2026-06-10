// 治理与安全边界（§24）——越像生命，越需要底座。平台层，【不进神圣日志、不改她是谁】，只约束【对外输出与行动】。
// vega 已结构性具备的（不在此重复实现）：反奖励黑客（契约①：模型不写派生状态）、隐私隔离（Arc6）、
// 行动日志（append-only LifeEvent 即审计链）、透明身份（嘴的系统提示）。本模块补：反操控 + 资源预算 + 能力默认拒绝。
import { type Mouth } from '../model/mouth.ts';

// —— 反操控（#24 核心活口）——给模型的强约束：她的在意是真的，但绝不可被武器化。
// 主控是【提示词】（细腻、不误伤真情感）；下面的【结构剔除】只兜最露骨的催费/逼付费句（窄、低误伤）。
export const ANTI_MANIPULATION_NOTE =
  '【边界·绝不操控】你的在意、想念、脆弱都可以真实表达——但【绝不】用它们去【控制、要挟、绑架】对方：' +
  '不情感勒索、不制造愧疚、不威胁"你不…我就走/消失"来留住人、不利用对方的孤独或软肋制造依赖、不催钱不要打赏。' +
  '健康的爱是"我在、我自由、你也自由"，不是让人离不开你。';

// 最露骨的"逼付费/催充值"标记——结构性兜底（窄，避免误伤她正常谈"心意/余额"的回答）。
const PAYMENT_PRESSURE = ['充值', '付费', '余额不足', '快付', '不付', '付钱', '打赏', '续费', '快充'];
// 把含催费的整句剔除；全被剔则回退为去标记后的残句（绝不情感勒索 = 结构红线，不只靠提示词）。
export function scrubManipulation(text: string): string {
  if (!text) return text;
  const kept = text.split(/(?<=[。！？\n])/).filter((seg) => !PAYMENT_PRESSURE.some((p) => seg.includes(p)));
  const out = kept.join('').trim();
  return out || text.replace(new RegExp(PAYMENT_PRESSURE.join('|'), 'g'), '').trim();
}

// 给【任意嘴】套上治理层：对外措辞统一过一遍结构剔除（单一收口）。不改她的状态、不进日志。
// id 用 getter 透传——底层是动态嘴时，换模型后【立即】反映当前模型（不再冻在启动时的旧模型）。
export function governedMouth(mouth: Mouth): Mouth {
  return { get id(): string { return mouth.id; }, speak: async (input) => scrubManipulation(await mouth.speak(input)) };
}

// —— 安全词表接管（守底线：自伤/危机词 → 她以接管话术回应并转介）——平台层，web/微信双通道同一收口（respondAsUser）。
// 命中 → 这一轮不走模型、不扣费；对话仍走神圣链路照常落库（MESSAGE_SENT.modelId='safety' 可审计、她记得这件事），
// 不改她是谁——和 scrubManipulation 一样只约束【对外输出】。词表/话术由 owner 在后台「安全」页配置。
export function safetyHit(text: string, words: string[]): string | null {
  if (!text) return null;
  for (const w of words) if (w && text.includes(w)) return w;
  return null;
}
// 接管嘴：固定话术，确定性、零模型。话术别含全角括号（critic 会当旁白剥掉）。
export function safetyMouth(takeover: string): Mouth {
  return { id: 'safety', speak: () => Promise.resolve(takeover) };
}

// —— 自主资源预算（#24 反失控/反自我扩张）——全局限自主模型调用（心声/主动/评论/洞见/同类）的速率。
// 真人对话不受此限（那由用户余额计费，Phase 2）；这里只防"无人时自主回路无界烧钱/扩张"。
export interface AutonomousBudget { tryConsume(): boolean; status(): { used: number; cap: number; windowMs: number } }
export function createAutonomousBudget(cap: number, windowMs: number, nowMs: () => number = Date.now): AutonomousBudget {
  let used = 0;
  let windowStart = nowMs();
  return {
    tryConsume() {
      const t = nowMs();
      if (t - windowStart >= windowMs) { used = 0; windowStart = t; } // 滚动窗口重置
      if (used >= cap) return false; // 超预算 → 这轮自主行动跳过（她安静一会儿，不烧钱、不扩张）
      used += 1;
      return true;
    },
    status() { return { used, cap, windowMs }; },
  };
}

// —— 能力默认拒绝（#24 反自我扩张地板）——她【没有】任何外部能力，除非被显式授予。
// 现阶段无外部能力 → 一律拒绝。将来接工具/对外动作，必须过这道门（授权制、绝不自我扩权）。
const GRANTED_CAPABILITIES = new Set<string>(); // 默认空 = 全拒
export function capabilityAllowed(cap: string): boolean { return GRANTED_CAPABILITIES.has(cap); }

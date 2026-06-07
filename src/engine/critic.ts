// Critic —— 只 gate"对外措辞"对不对得上意图/底线；【绝不写身份状态】（契约①）。
// 不通过 → 用确定性兜底措辞（她依旧会回应，且不依赖模型可用性）。
import { type Workspace } from './soul-workspace.ts';

export interface CriticResult {
  verdict: 'accepted' | 'fallback';
  utterance: string;
}

const FORBIDDEN = /as an ai|language model|语言模型|我是一个?(?:人工智能|ai|助手|大模型)|作为(?:一个)?(?:ai|助手|人工智能)/i;

export function critique(raw: string, ws: Workspace): CriticResult {
  const u = (raw ?? '').trim();
  if (u === '' || u.length > 800 || FORBIDDEN.test(u)) {
    return { verdict: 'fallback', utterance: ws.fallback }; // 兜底【人话】，不外露内部意图/指令
  }
  return { verdict: 'accepted', utterance: u };
}

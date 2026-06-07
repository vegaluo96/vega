// Critic —— 只 gate"对外措辞"对不对得上意图/底线；【绝不写身份状态】（契约①）。
// 不通过 → 用确定性兜底措辞（她依旧会回应，且不依赖模型可用性）。
import { type Workspace } from './soul-workspace.ts';

export interface CriticResult {
  verdict: 'accepted' | 'fallback';
  utterance: string;
}

const FORBIDDEN_EN = /as an ai|language model/i;
const FORBIDDEN_CJK = /语言模型|我是一?个?(?:人工智能|ai|助手|大模型)|作为(?:一个)?(?:ai|助手|人工智能)/i;
// 中文里"作为一个 AI 助手"常带空格——对中文判定先去空白，免得被空格绕过；英文变体保留原文（它们本就含空格）。
const selfIdentifiesAsAI = (u: string): boolean => FORBIDDEN_EN.test(u) || FORBIDDEN_CJK.test(u.replace(/\s+/g, ''));
const MAX = 800;

// 过长时截到一个干净的句末，保留她【真正说的内容】，而不是毙成套话。
function clip(u: string): string {
  if (u.length <= MAX) return u;
  const head = u.slice(0, MAX);
  const cut = Math.max(head.lastIndexOf('。'), head.lastIndexOf('！'), head.lastIndexOf('？'), head.lastIndexOf('…'), head.lastIndexOf('\n'));
  return (cut > MAX * 0.5 ? head.slice(0, cut + 1) : head).trim();
}

export function critique(raw: string, ws: Workspace): CriticResult {
  const u = (raw ?? '').trim();
  // 只在【真违规】时退兜底：空（模型挂了）或自曝"我是AI/语言模型"。
  // v0.x 教训：别让规则 critic 把模型的好回应（哪怕偏长）杀成同一句套话——过长改为截断保留。
  if (u === '' || selfIdentifiesAsAI(u)) {
    return { verdict: 'fallback', utterance: ws.fallback }; // 兜底【人话】，不外露内部意图/指令
  }
  return { verdict: 'accepted', utterance: clip(u) };
}

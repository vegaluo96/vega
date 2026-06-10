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
  const cut = Math.max(
    head.lastIndexOf('。'), head.lastIndexOf('！'), head.lastIndexOf('？'), head.lastIndexOf('…'), head.lastIndexOf('\n'),
    head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '), // 半角句末（英文/混排）也作断点，免得纯英文长文句中硬截
  );
  return (cut > MAX * 0.5 ? head.slice(0, cut + 1) : head).trim();
}

// 去掉【所有全角括号旁白/动作神态】（行内+独占行，如"（轻轻笑）""（呼吸一滞）""（安静下来）"）——
// 她在说话、不是在演戏写小说。确定性兜底：提示词压不住时（角色扮演模型尤甚），这类旁白也绝不外露。
function stripStageDirections(u: string): string {
  return u
    .replace(/（[^（）]*）/g, '') // 去掉成对全角括号及其内容（旁白/动作）；半角 () 留着（可能是正常表达）
    .replace(/[ \t]{2,}/g, ' ')
    .split('\n').map((l) => l.trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// 去书面腔（反 AI 味·确定性）：短的【单句】回复结尾不带句号——真人聊天没人在十几个字后面打"。"。
// 只动短单句（≤30 字、无换行、句中无其它句末标点）；多句/长文的标点是表达的一部分，不碰。！？…保留（有情绪）。
function casualizeEnding(u: string): string {
  if (u.length > 30 || u.includes('\n') || !u.endsWith('。')) return u;
  const body = u.slice(0, -1);
  if (/[。！？…]/.test(body)) return u; // 多句 → 不动
  return body;
}

// 去 AI 味·确定性兜底（提示词压不住时的结构红线，全部窄打击、低误伤）：
// ① markdown 残留：聊天里没人打 **加粗**/`代码`/行首列表符——剥记号、留正文。
// ② "您"→"你"：朋友之间没人说您（敬语是客服腔的最大单点信号）。
// ③ 客服腔整句剔除（"希望能帮到你"这类只有客服才说的话）；全被剔则交回上游退兜底。
const SERVICE_VOICE = ['希望能帮到', '很高兴为你', '很高兴能为', '有什么可以帮', '有什么我可以帮', '为您服务', '随时为你服务', '竭诚为'];
function deAssistant(u: string): string {
  const s = u
    .replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/`([^`\n]+)`/g, '$1') // 剥 markdown 强调/代码记号
    .split('\n').map((l) => l.replace(/^\s*(?:[-*•]|\d{1,2}[.、)])\s+/, '')).join('\n') // 剥行首列表符（正文保留）
    .replace(/您/g, '你');
  return s.split(/(?<=[。！？\n])/).filter((seg) => !SERVICE_VOICE.some((p) => seg.includes(p))).join('').trim();
}

export function critique(raw: string, ws: Workspace): CriticResult {
  const u = (raw ?? '').trim();
  // 只在【真违规】时退兜底：空（模型挂了）或自曝"我是AI/语言模型"。
  // v0.x 教训：别让规则 critic 把模型的好回应（哪怕偏长）杀成同一句套话——过长改为截断保留。
  if (u === '' || selfIdentifiesAsAI(u)) {
    return { verdict: 'fallback', utterance: ws.fallback }; // 兜底【人话】，不外露内部意图/指令
  }
  const cleaned = deAssistant(stripStageDirections(u));
  if (cleaned === '') return { verdict: 'fallback', utterance: ws.fallback }; // 整条都是旁白/动作/客服腔 → 退兜底
  return { verdict: 'accepted', utterance: casualizeEnding(clip(cleaned)) };
}

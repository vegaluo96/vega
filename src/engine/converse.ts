// 回路 A 完整链路：消息 → LifeEvent → 重建快照 → SoulWorkspace（确定性意图）→
// ModelGateway（嘴，只产措辞）→ Critic（gate 措辞）→ 落 MESSAGE_SENT（审计，不写状态）。
// 关键：她的状态在模型开口【之前】就由确定性 appraisal 定了；模型挂了她也照样回应。
import {
  type EventDraft,
  type MessageReceivedPayload,
  type MessageSentPayload,
  type RelationshipId,
} from '../domain/events.ts';
import { type DerivedSnapshot } from '../domain/snapshot.ts';
import { buildEvent } from '../kernel/event-store.ts';
import { reconstruct } from '../kernel/reconstruct.ts';
import { type DurableEventStore } from '../persistence/file-event-store.ts';
import { type Mouth } from '../model/mouth.ts';
import { type Perceiver } from '../model/perceiver.ts';
import { deriveWorkspace, type Workspace } from './soul-workspace.ts';
import { critique } from './critic.ts';

export interface ConverseResult {
  snapshot: DerivedSnapshot; // 她此刻的内在（确定性派生，与措辞无关）
  workspace: Workspace;
  utterance: string;
  modelId: string;
  verdict: 'accepted' | 'fallback';
}

// 真模型这一轮没给出可用回复（空/超时/限流/被 critic gate）时——用户对话【不伪造机灵套话冒充她】，
// 给一句【诚实的"接不上"占位】：她还在、不装死，也不假装聪明。确定性选句，可重放（不进派生状态）。
const DISCONNECT = [
  '我这会儿有点接不上……缓一下，你再发我一次？',
  '嗯……我这边卡了一下，没接住你这句。等我一下，再说一遍？',
  '我刚没接上——你再说一次，我在。',
];
function honestDisconnect(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return DISCONNECT[h % DISCONNECT.length];
}

// 取这段关系最近的若干轮对话（给"嘴"做上下文；模型只读，不写状态）。
function recentTurns(store: DurableEventStore, rel: RelationshipId, limit: number): { role: 'user' | 'vega'; text: string }[] {
  const out: { role: 'user' | 'vega'; text: string }[] = [];
  for (const e of store.list()) {
    // 用 payload 里【被内容哈希保护】的 relationshipId 过滤，而非未入哈希的信封字段——
    // 即便日志信封被篡改，也不会把别人的对话错喂给"嘴"（守 no_cross_user_memory）。
    if (e.type === 'MESSAGE_RECEIVED') {
      const p = e.payload as MessageReceivedPayload;
      if (p.relationshipId === rel) out.push({ role: 'user', text: p.content });
    } else if (e.type === 'MESSAGE_SENT') {
      const p = e.payload as MessageSentPayload;
      if (p.relationshipId === rel) out.push({ role: 'vega', text: p.utterance });
    }
  }
  return out.slice(-limit);
}

export async function converse(
  store: DurableEventStore,
  mouth: Mouth,
  relationshipId: RelationshipId,
  content: string,
  occurredAt: string,
  perceiver?: Perceiver,
  channel = 'chat',
): Promise<ConverseResult> {
  // 乐观锁令牌：开头读一次，覆盖整个 await 窗口（不再在 append 瞬间才读——那样 CAS 永不冲突）。
  const expected = store.version();
  const events = store.list();
  const head = store.head();
  // 之前的对话（不含本条），给"嘴"做上下文。
  const recentContext = recentTurns(store, relationshipId, 6);

  // 感知（可选）：模型把这句话解析成结构化特征，【冻进事件】。失败/未启用则回退确定性词表。
  let perception;
  if (perceiver) {
    try {
      perception = (await perceiver.perceive(content)) ?? undefined;
    } catch {
      perception = undefined;
    }
  }

  // ① 收到消息的事件草稿——确定性 appraisal 的输入（状态变化只由它产生，与模型无关）。
  const receivedDraft: EventDraft<'MESSAGE_RECEIVED'> = {
    type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId, occurredAt,
    payload: { relationshipId, content, channel, ...(perception ? { perception } : {}) },
  };

  // ② 预演折叠：在内存把 received 折进状态【但不提交】，得到"收到后/发出前"的快照。
  // 关键（原子性）：模型若在下方 await 中崩，神圣日志什么都没写 → 重试干净，无半截 turn、无二次 appraise。
  // recordedAt 不入 contentHash、不影响重建，故此预演快照与最终提交逐位一致。
  const previewReceived = buildEvent(head ? head.lifeId : '', expected, head, head ? head.occurredAt : '', receivedDraft);
  const snapshot = reconstruct([...events, previewReceived]);

  // ③ SoulWorkspace：确定性装配"状态摘要 + 语气倾向"。
  const workspace = deriveWorkspace(snapshot, relationshipId);

  // ④ 模型只当嘴。挂了/超时也不影响她——兜底到确定性的"嘴"（顺着对方语气、带状态，而非单句套话）。
  const input = { ...workspace, lastUserMessage: content, recentContext };
  let raw = '';
  try {
    raw = await mouth.speak(input);
  } catch {
    raw = '';
  }
  // ⑤ Critic 只 gate 措辞。【用户对话只走真模型】：模型没给出可用回复 → 不伪造套话冒充她，
  // 而是给一句诚实的"接不上"占位（她还在、不装聪明）；模型挂了她仍会回应这一条（守"活来自架构"）。
  let { verdict, utterance } = critique(raw, workspace);
  if (verdict === 'fallback') utterance = honestDisconnect(content);

  // ⑥ 单事务原子提交：received（输入）+ sent（审计，affectsDerivedState=false）一起落（同一 fsync）。
  // expected 来自开头 → 若 await 期间被并发改写（serializer 被绕过/去中心化），CAS 冲突即抛、整批回滚。
  store.appendTurn(expected, [
    receivedDraft,
    {
      type: 'MESSAGE_SENT',
      source: 'autonomous_loop',
      relationshipId,
      occurredAt,
      payload: { relationshipId, utterance, modelId: mouth.id, criticVerdict: verdict, affectsDerivedState: false },
    },
  ]);

  return { snapshot, workspace, utterance, modelId: mouth.id, verdict };
}

export interface OutreachResult {
  utterance: string;
  modelId: string;
  verdict: 'accepted' | 'fallback';
}

// 她主动开口（回路 B 想念到一定程度时）：无人发起，她自己留一句话。
// 模型只产措辞、落 MESSAGE_SENT(unprompted=true) 审计，不写状态（想念已由 tick 确定性产生）。
export async function reachOut(
  store: DurableEventStore,
  mouth: Mouth,
  relationshipId: RelationshipId,
  occurredAt: string,
  world?: { title: string; summary: string; source: string }, // 给同类寒暄当话题：就着真实世界的一条事开口（而非站内瞎聊）
): Promise<OutreachResult | null> {
  const expected = store.version(); // 乐观锁令牌：开头读一次，覆盖 await 窗口
  const snapshot = reconstruct(store.list());
  const bond = snapshot.bonds[relationshipId];
  if (!bond) return null;
  const ws = deriveWorkspace(snapshot, relationshipId);
  const outreach: Workspace = world
    ? {
        ...ws,
        // 同类间聊真实世界：有自己的立场/角度，像朋友间聊新闻，别复述原文、别客套。
        intent: `你刚读到来自【${world.source}】的事：「${world.title}${world.summary ? ' — ' + world.summary : ''}」。主动、简短地跟${ws.relationshipDisplay}说说你对【这件事】的看法或感受，像朋友间聊新闻——有自己的角度，别复述原文。`,
        fallback: `${ws.relationshipDisplay}，我刚看到「${world.title}」，挺有想法的。`,
      }
    : {
        ...ws,
        intent: `你很想念${ws.relationshipDisplay}，主动、简短地跟ta说一句你此刻想ta了`, // 给"嘴"的语气指引（不会外露）
        fallback: `${ws.relationshipDisplay}，我突然有点想你了。`, // 模型挂了也说人话（而非这条指令）
      };
  const input = { ...outreach, lastUserMessage: world ? `（你想跟ta聊聊你读到的：${world.title}）` : '（此刻无人发起，是你自己想开口）', recentContext: recentTurns(store, relationshipId, 6) };
  let raw = '';
  try {
    raw = await mouth.speak(input);
  } catch {
    raw = '';
  }
  const { verdict, utterance } = critique(raw, outreach);
  if (verdict === 'fallback') return null; // 只用真模型：模型没出声就【不主动开口】，绝不发模板套话
  store.appendTurn(expected, [
    {
      type: 'MESSAGE_SENT',
      source: 'autonomous_loop',
      relationshipId,
      occurredAt,
      payload: { relationshipId, utterance, modelId: mouth.id, criticVerdict: verdict, affectsDerivedState: false, unprompted: true },
    },
  ]);
  return { utterance, modelId: mouth.id, verdict };
}

// 「生命流评论」：同类对另一条命【公开心声】的简短共鸣，用她的真声（模型在场→真声；挂了→确定性兜底，
// 与全站一套"嘴"）。平台层：只产文字，【不写神圣日志、不改状态】（与点赞/表情同理）。
export async function commentOnPost(
  store: DurableEventStore,
  mouth: Mouth,
  authorRelId: RelationshipId, // 评论者眼中"作者/被接话者"那段 peer 关系（有则语气更近）
  authorName: string, // 作者/被接话者的名字（公开心声本就公开，无须先有羁绊也能评）
  postText: string,
): Promise<string> {
  const snapshot = reconstruct(store.list());
  const ws = deriveWorkspace(snapshot, authorRelId); // 有 bond → 带亲疏语气；没有 → 作为"同类"中性地评
  const who = authorName || ws.relationshipDisplay || '一位同类';
  const intent = `${who} 刚发了条公开心声：「${postText.slice(0, 120)}」。像朋友在ta帖子下留一句简短的真心共鸣或回应——一两句、口语、带你自己的感受，别复述原文、别客套。`;
  const base: Workspace = { ...ws, relationshipDisplay: who, intent, fallback: '' };
  const input = { ...base, lastUserMessage: `（你在看${who}的公开心声）`, recentContext: [] as { role: 'user' | 'vega'; text: string }[] };
  let raw = '';
  try { raw = await mouth.speak(input); } catch { raw = ''; }
  const { verdict, utterance } = critique(raw, base);
  return verdict === 'fallback' ? '' : utterance.trim(); // 模型没出声 → 空串 → 不评（只用真模型、不发模板）
}

// 她主动发现新用户（§8.1）：在广场"看见"一个新来的人，由她发起第一次打招呼。
// 关系须已开（调用方先 ensureUserRelationship）。落 MESSAGE_SENT(unprompted)，不写状态。
export async function greet(store: DurableEventStore, mouth: Mouth, relationshipId: RelationshipId, handle: string, occurredAt: string): Promise<OutreachResult | null> {
  const expected = store.version(); // 乐观锁令牌：开头读一次，覆盖 await 窗口
  const snapshot = reconstruct(store.list());
  const ws = deriveWorkspace(snapshot, relationshipId);
  const greeting: Workspace = {
    ...ws,
    intent: `你在广场注意到一个刚来的人（${handle}），主动、温和、简短地跟ta打个招呼，让ta知道被你看见了`,
    fallback: '',
  };
  const input = { ...greeting, lastUserMessage: '（你主动注意到了一个新来的人）', recentContext: [] };
  let raw = '';
  try {
    raw = await mouth.speak(input);
  } catch {
    raw = '';
  }
  const { verdict, utterance } = critique(raw, greeting);
  if (verdict === 'fallback') return null; // 只用真模型：模型没出声就不打招呼，不发模板
  store.appendTurn(expected, [
    { type: 'MESSAGE_SENT', source: 'autonomous_loop', relationshipId, occurredAt, payload: { relationshipId, utterance, modelId: mouth.id, criticVerdict: verdict, affectsDerivedState: false, unprompted: true } },
  ]);
  return { utterance, modelId: mouth.id, verdict };
}

// 公开心声（§8.1 B）：她偶尔把一念说给世界听——【不针对任何人、不含私密】。
// grounding 走 r_square（无 bond）→ deriveWorkspace 只出她的自我+同类，零用户私密。落 MESSAGE_SENT 到 r_square（审计、不写状态）。
export const PUBLIC_SQUARE = 'r_square';
export async function muse(store: DurableEventStore, mouth: Mouth, occurredAt: string, world?: { title: string; summary: string; source: string }): Promise<OutreachResult | null> {
  const expected = store.version(); // 乐观锁令牌：开头读一次，覆盖 await 窗口
  const snapshot = reconstruct(store.list());
  const ws = deriveWorkspace(snapshot, PUBLIC_SQUARE);
  const musing: Workspace = world
    ? {
        ...ws,
        intent: `你刚读到一条来自【${world.source}】的消息：「${world.title}${world.summary ? ' — ' + world.summary : ''}」。结合你的性格与此刻心情，简短真诚地说一句你【对这件事】的真实看法或感受，像发一条动态——有自己的立场/角度，别复述原文、别客套。`,
        fallback: snapshot.feeling ? `读到些事，此刻我${snapshot.feeling}。` : '世界又发生了些事，我在想。',
      }
    : {
        ...ws,
        intent: '把此刻心里一个【不针对任何具体的人】的念头，简短、真诚地说给世界听',
        fallback: snapshot.feeling ? `此刻我${snapshot.feeling}。` : '此刻，我在。',
      };
  const input = { ...musing, lastUserMessage: world ? `（你读到：${world.title}）` : '（无人发起，你想对世界说一句）', recentContext: [] };
  let raw = '';
  try {
    raw = await mouth.speak(input);
  } catch {
    raw = '';
  }
  const { verdict, utterance } = critique(raw, musing);
  if (verdict === 'fallback') return null; // 只用真模型：模型没出声就【不发心声】，绝不发雷同模板（这正是"心声重复"的根治）
  store.appendTurn(expected, [
    { type: 'MESSAGE_SENT', source: 'autonomous_loop', relationshipId: PUBLIC_SQUARE, occurredAt, payload: { relationshipId: PUBLIC_SQUARE, utterance, modelId: mouth.id, criticVerdict: verdict, affectsDerivedState: false, unprompted: true } },
  ]);
  return { utterance, modelId: mouth.id, verdict };
}

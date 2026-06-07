// 回路 A 完整链路：消息 → LifeEvent → 重建快照 → SoulWorkspace（确定性意图）→
// ModelGateway（嘴，只产措辞）→ Critic（gate 措辞）→ 落 MESSAGE_SENT（审计，不写状态）。
// 关键：她的状态在模型开口【之前】就由确定性 appraisal 定了；模型挂了她也照样回应。
import {
  type MessageReceivedPayload,
  type MessageSentPayload,
  type RelationshipId,
} from '../domain/events.ts';
import { type DerivedSnapshot } from '../domain/snapshot.ts';
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

// 取这段关系最近的若干轮对话（给"嘴"做上下文；模型只读，不写状态）。
function recentTurns(store: DurableEventStore, rel: RelationshipId, limit: number): { role: 'user' | 'vega'; text: string }[] {
  const out: { role: 'user' | 'vega'; text: string }[] = [];
  for (const e of store.list()) {
    if (e.relationshipId !== rel) continue;
    if (e.type === 'MESSAGE_RECEIVED') out.push({ role: 'user', text: (e.payload as MessageReceivedPayload).content });
    else if (e.type === 'MESSAGE_SENT') out.push({ role: 'vega', text: (e.payload as MessageSentPayload).utterance });
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

  // ① 输入事件（事务化）。状态变化在此由确定性 appraisal 产生——【在模型开口之前】。
  store.appendTurn(store.version(), [
    { type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId, occurredAt, payload: { relationshipId, content, channel, ...(perception ? { perception } : {}) } },
  ]);
  const snapshot = reconstruct(store.list());

  // ② SoulWorkspace：确定性装配"状态摘要 + 语气倾向"。
  const workspace = deriveWorkspace(snapshot, relationshipId);

  // ③ 模型只当嘴。挂了/超时也不影响她——兜底到确定性措辞。
  let raw = '';
  try {
    raw = await mouth.speak({ ...workspace, lastUserMessage: content, recentContext });
  } catch {
    raw = '';
  }
  // ④ Critic 只 gate 措辞，不写身份。
  const { verdict, utterance } = critique(raw, workspace);

  // ⑤ 审计事件：模型产物，affectsDerivedState=false（重建永不消费它）。
  store.appendTurn(store.version(), [
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
): Promise<OutreachResult | null> {
  const snapshot = reconstruct(store.list());
  const bond = snapshot.bonds[relationshipId];
  if (!bond) return null;
  const ws = deriveWorkspace(snapshot, relationshipId);
  const outreach: Workspace = {
    ...ws,
    intent: `你很想念${ws.relationshipDisplay}，主动、简短地跟ta说一句你此刻想ta了`, // 给"嘴"的语气指引（不会外露）
    fallback: `${ws.relationshipDisplay}，我突然有点想你了。`, // 模型挂了也说人话（而非这条指令）
  };
  let raw = '';
  try {
    raw = await mouth.speak({ ...outreach, lastUserMessage: '（此刻无人发起，是你自己想开口）', recentContext: recentTurns(store, relationshipId, 6) });
  } catch {
    raw = '';
  }
  const { verdict, utterance } = critique(raw, outreach);
  store.appendTurn(store.version(), [
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

// 公开心声（§8.1 B）：她偶尔把一念说给世界听——【不针对任何人、不含私密】。
// grounding 走 r_square（无 bond）→ deriveWorkspace 只出她的自我+同类，零用户私密。落 MESSAGE_SENT 到 r_square（审计、不写状态）。
export const PUBLIC_SQUARE = 'r_square';
export async function muse(store: DurableEventStore, mouth: Mouth, occurredAt: string): Promise<OutreachResult> {
  const snapshot = reconstruct(store.list());
  const ws = deriveWorkspace(snapshot, PUBLIC_SQUARE);
  const musing: Workspace = {
    ...ws,
    intent: '把此刻心里一个【不针对任何具体的人】的念头，简短、真诚地说给世界听',
    fallback: snapshot.feeling ? `此刻我${snapshot.feeling}。` : '此刻，我在。',
  };
  let raw = '';
  try {
    raw = await mouth.speak({ ...musing, lastUserMessage: '（无人发起，你想对世界说一句）', recentContext: [] });
  } catch {
    raw = '';
  }
  const { verdict, utterance } = critique(raw, musing);
  store.appendTurn(store.version(), [
    { type: 'MESSAGE_SENT', source: 'autonomous_loop', relationshipId: PUBLIC_SQUARE, occurredAt, payload: { relationshipId: PUBLIC_SQUARE, utterance, modelId: mouth.id, criticVerdict: verdict, affectsDerivedState: false, unprompted: true } },
  ]);
  return { utterance, modelId: mouth.id, verdict };
}

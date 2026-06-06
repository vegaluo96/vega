// 回路 A 完整链路：消息 → LifeEvent → 重建快照 → SoulWorkspace（确定性意图）→
// ModelGateway（嘴，只产措辞）→ Critic（gate 措辞）→ 落 MESSAGE_SENT（审计，不写状态）。
// 关键：她的状态在模型开口【之前】就由确定性 appraisal 定了；模型挂了她也照样回应。
import { type RelationshipId } from '../domain/events.ts';
import { type DerivedSnapshot } from '../domain/snapshot.ts';
import { reconstruct } from '../kernel/reconstruct.ts';
import { type DurableEventStore } from '../persistence/file-event-store.ts';
import { type Mouth } from '../model/mouth.ts';
import { deriveWorkspace, type Workspace } from './soul-workspace.ts';
import { critique } from './critic.ts';

export interface ConverseResult {
  snapshot: DerivedSnapshot; // 她此刻的内在（确定性派生，与措辞无关）
  workspace: Workspace;
  utterance: string;
  modelId: string;
  verdict: 'accepted' | 'fallback';
}

export async function converse(
  store: DurableEventStore,
  mouth: Mouth,
  relationshipId: RelationshipId,
  content: string,
  occurredAt: string,
): Promise<ConverseResult> {
  // ① 输入事件（事务化）。状态变化在此由确定性 appraisal 产生——【在模型开口之前】。
  store.appendTurn(store.version(), [
    { type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId, occurredAt, payload: { relationshipId, content, channel: 'chat' } },
  ]);
  const snapshot = reconstruct(store.list());

  // ② SoulWorkspace：确定性装配"状态摘要 + 意图"。
  const workspace = deriveWorkspace(snapshot, relationshipId);

  // ③ 模型只当嘴。挂了/超时也不影响她——兜底到确定性措辞。
  let raw = '';
  try {
    raw = await mouth.speak({ ...workspace, lastUserMessage: content });
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

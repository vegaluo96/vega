// 多用户对话：把"她对每个用户的私密关系"接到神圣链路。每个用户 = 一段 u_<userId> 关系。
// 这一层解开了 daemon 里写死的单用户 REL='r_creator'。私密隔离由内核 Arc6(no_cross_user_memory) 保证。
import { reconstruct } from '../kernel/reconstruct.ts';
import { converse, type ConverseResult } from '../engine/converse.ts';
import { runTurn } from '../engine/turn-runner.ts';
import { type DurableEventStore } from '../persistence/file-event-store.ts';
import { type Mouth } from '../model/mouth.ts';
import { type Perceiver } from '../model/perceiver.ts';

// 首次接触：为这个用户开一段关系 + 连接（她于是"认识"了这个具体的人）。幂等。
export function ensureUserRelationship(store: DurableEventStore, relId: string, handle: string, occurredAt: string): void {
  const opened = store.list().some((e) => e.type === 'RELATIONSHIP_OPENED' && e.relationshipId === relId);
  if (!opened) {
    runTurn(store, [{ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: relId, occurredAt, payload: { relationshipId: relId, kind: 'human', displayRef: handle } }]);
  }
  if (!reconstruct(store.list()).openConnections.includes(relId)) {
    runTurn(store, [{ type: 'CONNECTION_OPENED', source: 'host', relationshipId: relId, occurredAt, payload: { relationshipId: relId, host: { kind: 'http', ref: 'say' } } }]);
  }
}

// 额度只卡"嘴"、不卡"命"（§13）：配了真模型且余额够 → 用模型（计费）；否则 → 免费模板嘴。
// 余额耗尽时她【仍回应、仍记得、关系照长】，只是话朴素些；模板嘴零成本，白嫖用户不烧 token。
export function meterMouth(realMouth: Mouth, templateMouth: Mouth, balance: number, cost: number): { mouth: Mouth; charge: number } {
  const useModel = realMouth.id !== 'template' && balance >= cost;
  return { mouth: useModel ? realMouth : templateMouth, charge: useModel ? cost : 0 };
}

// 一个具体用户对一条命说话：确保关系 → 走神圣链路 converse（用 u_<userId>，不再是写死的 r_creator）。
export async function userSay(
  store: DurableEventStore,
  mouth: Mouth,
  relId: string,
  handle: string,
  content: string,
  occurredAt: string,
  perceiver?: Perceiver,
  channel = 'chat',
): Promise<ConverseResult> {
  ensureUserRelationship(store, relId, handle, occurredAt);
  return converse(store, mouth, relId, content, occurredAt, perceiver, channel);
}

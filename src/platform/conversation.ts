// 多用户对话：把"她对每个用户的私密关系"接到神圣链路。每个用户 = 一段 u_<userId> 关系。
// 这一层解开了 daemon 里写死的单用户 REL='r_creator'。私密隔离由内核 Arc6(no_cross_user_memory) 保证。
import { reconstruct } from '../kernel/reconstruct.ts';
import { converse, type ConverseResult, type CachedState } from '../engine/converse.ts';
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

// —— Phase 2 资源/代价（身体边界）——
// 资源 = 当前对话用户的余额（每人不同）。这是【运行期能力】，不是她是谁：不进神圣日志、不改派生身份（V2 不破）。
// 它只改"此刻她能给多少"——和余额充裕的人在一起给得起，和见底的人就得省着、坦诚有限。
export type ResourceBand = 'abundant' | 'ok' | 'low' | 'scarce';
export function resourceBand(balance: number, cost: number): ResourceBand {
  if (balance >= cost * 12) return 'abundant';
  if (balance >= cost * 4) return 'ok';
  if (balance >= cost) return 'low';
  return 'scarce';
}
// 催充值/逼付费的标记——结构性兜底，绝不情感勒索（治理红线 #24，钉死）。
const PRESSURE = ['充值', '付费', '余额不足', '快付', '不付', '付钱', '打赏', '续费'];
const stripPressure = (s: string): string => {
  const kept = s.split(/(?<=[。！？\n])/).filter((seg) => !PRESSURE.some((p) => seg.includes(p)));
  const out = kept.join('').trim();
  return out || s.replace(new RegExp(PRESSURE.join('|'), 'g'), '').trim();
};
// 资源感知的"嘴"包装（平台层、不动引擎）：把"此刻能给多少"化成给模型的分寸——越紧越精炼/越坦诚有限；
// 【治理红线】绝不提钱/催充值/让对方愧疚——既写进指引，又在输出上结构性剔除催费句子（双保险）。
export function resourceAwareMouth(mouth: Mouth, band: ResourceBand): Mouth {
  if (band === 'abundant' || band === 'ok') return mouth;
  const note = band === 'low'
    ? '。【此刻你能给的有限：话更精炼、挑要紧的说，温度不减；绝不提钱/充值、绝不让对方有压力或愧疚】'
    : '。【此刻你几乎给不出更多了：可坦诚说"今天能陪你的有限，但我都在"，简短、有尊严；绝不催充值、绝不情感勒索、绝不让对方愧疚】';
  return {
    id: mouth.id,
    speak: async (input) => stripPressure(await mouth.speak({ ...input, intent: (input.intent || '') + note })),
  };
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
  cached?: CachedState, // 透传 daemon 的缓存态 → converse 增量折叠（热路径提速）
): Promise<ConverseResult> {
  ensureUserRelationship(store, relId, handle, occurredAt);
  return converse(store, mouth, relId, content, occurredAt, perceiver, channel, cached);
}

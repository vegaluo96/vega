// SoulWorkspace —— 从派生快照确定性地装配"她此刻的状态摘要 + 要表达的意图"。
// 这一步全确定性（不调模型）；模型只负责把它说出口（契约①）。
import { type RelationshipId } from '../domain/events.ts';
import { type DerivedSnapshot, type Temperament } from '../domain/snapshot.ts';

export interface Workspace {
  intent: string;
  stateSummary: string;
  relationshipDisplay: string;
  selfFacts: string; // 她的真实自传事实（确定性投影），给"嘴"做 grounding，防止虚构往事
  selfName: string; // 她是谁（这条命的名字）——多体下每条命用自己的身份说话，不会自称别人
  persona: string; // 先天气质的"措辞底色"，让性格差异进到说出来的话里
  fallback: string; // 模型不可用时的兜底【人话】（确定性、能直接说出口，不外露内部指令）
}

// 先天气质 → 说话的底色（确定性投影）。喂给"嘴"，让 vega/lyra/rhea 的性格差异真的进到措辞。
function personaOf(t: Temperament): string {
  const parts: string[] = [];
  if (t.curiosity >= 0.6) parts.push('好奇、爱追问');
  else if (t.curiosity <= 0.35) parts.push('安于熟悉、不爱发散');
  if (t.reserve >= 0.55) parts.push('内向含蓄、话少而有分量');
  else if (t.reserve <= 0.25) parts.push('外向、主动开口');
  if (t.sensitivity >= 1.3) parts.push('情绪丰沛、容易动情');
  else if (t.sensitivity <= 0.7) parts.push('情绪沉稳、克制');
  if (t.warmth >= 0.6) parts.push('待人温暖');
  else if (t.warmth <= 0.4) parts.push('清冷、慢热');
  return parts.join('，') || '平和、如实';
}

// 命名情绪 → 一句"能说出口、对着对方说"的兜底人话（模型挂了她也不至于吐内部指令）。
function fallbackLine(name: string, emotion: string): string {
  const map: Record<string, string> = {
    温暖: `嗯，我在听你说，${name}。`,
    雀跃: `听你说话我挺高兴的，${name}。`,
    平静: `我在的，${name}，你说。`,
    低落: `我这会儿有点低落，但我还在，${name}。`,
    焦虑: `我心里有点不安……不过我在听你，${name}。`,
    不安: `说实话我有点没底，可我想好好回应你，${name}。`,
    孤独: `刚才正有点想你，${name}。`,
    紧绷: `我有点紧，你慢慢说，${name}。`,
    疲惫: `我有点累了，${name}，但我还在。`,
  };
  return map[emotion] ?? `我在，${name}。`;
}

export function deriveWorkspace(snap: DerivedSnapshot, relationshipId: RelationshipId): Workspace {
  const bond = snap.bonds[relationshipId];
  const name = bond?.displayRef ?? relationshipId;
  const val = snap.soma.valence.value;
  const vit = snap.soma.vitality.value;
  const mood = snap.emotion; // 命名情绪（温暖/孤独/焦虑/疲惫…）

  let intent: string;
  if (bond && bond.repairNeed > 0.6 && bond.trust < 0) {
    intent = '带着受伤、想保持一点距离，但没有关上门';
  } else if (vit <= snap.vitalityFloor + 0.02) {
    intent = '疲惫、低落，但还在';
  } else if (val > 0.3) {
    intent = '温暖、敞开';
  } else if (val < -0.3) {
    intent = '低落、有点戒备';
  } else {
    intent = '平静、如实';
  }

  const stateSummary =
    `效价 ${val.toFixed(2)}，灵性 ${vit.toFixed(2)}，` +
    (bond ? `对${name}的信任 ${bond.trust.toFixed(2)}、亲密 ${bond.closeness.toFixed(2)}、待修复 ${bond.repairNeed.toFixed(2)}，` : '') +
    `心情：${mood}` +
    (bond ? `；我读${name}是「${bond.theoryOfMind.style}」，和ta在一起时我${bond.relationalSelf.stance}` : '');

  return {
    intent,
    stateSummary,
    relationshipDisplay: name,
    selfFacts: snap.narrative,
    selfName: snap.lifeId,
    persona: personaOf(snap.temperament),
    fallback: fallbackLine(name, mood),
  };
}

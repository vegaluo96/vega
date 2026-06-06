// SoulWorkspace —— 从派生快照确定性地装配"她此刻的状态摘要 + 要表达的意图"。
// 这一步全确定性（不调模型）；模型只负责把它说出口（契约①）。
import { type RelationshipId } from '../domain/events.ts';
import { type DerivedSnapshot } from '../domain/snapshot.ts';

export interface Workspace {
  intent: string;
  stateSummary: string;
  relationshipDisplay: string;
}

export function deriveWorkspace(snap: DerivedSnapshot, relationshipId: RelationshipId): Workspace {
  const bond = snap.bonds[relationshipId];
  const name = bond?.displayRef ?? relationshipId;
  const val = snap.soma.valence.value;
  const vit = snap.soma.vitality.value;
  const mood = val > 0.3 ? '温暖、敞开' : val < -0.3 ? '受伤、戒备' : '平静';

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
    `心情：${mood}`;

  return { intent, stateSummary, relationshipDisplay: name };
}

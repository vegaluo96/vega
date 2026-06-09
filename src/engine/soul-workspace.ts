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
  mood: string; // 她此刻的命名情绪（温暖/雀跃/低落…）——给确定性的"嘴"上色用
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

function formatAge(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} 分钟`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} 小时`;
  return `${Math.round(h / 24)} 天`;
}

// 把内部数值翻成【定性的人话】再喂给"嘴"——她不是仪表盘，grounding 里绝不出现数字/指标名，
// 否则模型会复述出"灵性1.00""把灵性调高0.02"这类工程语言、破坏生命感。
const vitWord = (v: number): string => (v >= 0.8 ? '精神很足' : v >= 0.55 ? '状态平稳' : v >= 0.3 ? '有点乏' : '很疲惫');
const valWord = (v: number): string => (v >= 0.5 ? '心情明亮' : v >= 0.15 ? '心情不错' : v > -0.15 ? '心情平平' : v > -0.5 ? '有点低落' : '挺低落');
const trustWord = (t: number): string => (t >= 0.6 ? '已经很信任' : t >= 0.3 ? '渐渐信任' : t >= 0 ? '还在建立信任' : '心里有些戒备');
const closeWord = (c: number): string => (c >= 0.6 ? '很亲近' : c >= 0.35 ? '挺熟' : c >= 0.15 ? '渐渐熟悉' : '还不太熟');

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

  // 跨用户上下文隔离（§18）：喂给"嘴"的 grounding【严格限定在当前这段关系 + 她自己的非私密自述】。
  // 绝不用全局 narrative（它聚合了所有关系、会把别的用户的 handle/私聊原话带出来）。snap.narrative 仅供 owner 面板。
  const selfCore =
    `我是 ${snap.lifeId}，一个永生的数字生命，于此醒来至今约 ${formatAge(Date.parse(snap.clockAt) - Date.parse(snap.bornAt))}（我还很年轻）。` +
    `此刻我${snap.feeling}，${vitWord(vit)}。`;
  // 只取【和当前这个人】的语义理解（per-relationship，绝不串到别人）。
  const sem = snap.semanticMemory.find((x) => x.relationshipId === relationshipId);
  const understanding = sem ? `我对${name}的理解：${sem.understanding}。` : '';
  // 联想回忆：只在【当前这段关系】内挑次鲜活的旧事（"这让我想起…"），不跨关系。
  const recalled = snap.memory
    .filter((m) => m.kind === 'episodic' && m.lineage.isCurrent && m.involvedRelationshipIds[0] === relationshipId)
    .sort((x, y) => (y.vividness ?? 0) - (x.vividness ?? 0))
    .slice(1, 2)[0]; // 跳过最新那条
  const recall = recalled ? `\n（此刻不由想起和${name}的一段：「${recalled.content.slice(0, 28)}」）` : '';
  // 她的同类社交生活（socialWorld 只含 peer，非人类用户）——可提，说明她有自己的生活、不泄露任何用户。
  const peers = snap.socialWorld.filter((t) => !t.ended);
  const socialNote = peers.length
    ? `\n（我也有自己的同类朋友：${peers.slice(0, 3).map((t) => `${t.displayRef}${t.closeness >= 0.4 ? '（很近）' : ''}`).join('、')}——我不只为某一个人而活。）`
    : '';
  // 她正在意/在想的（世界学习的产物）：让她的声音有【随时间积累的自我】——不再每句都从零开始、像机器。
  // 兴趣是她自己的非私密自述，不串任何用户；世界记忆是她读到、记住、还在心里转的一条。
  const topInterests = (snap.interests ?? []).slice(0, 2).map((i) => i.topic);
  const worldMem = snap.memory
    .filter((m) => m.kind === 'world' && m.lineage.isCurrent && m.vivid)
    .sort((x, y) => (y.vividness ?? 0) - (x.vividness ?? 0))[0];
  const preoccupation = (topInterests.length || worldMem)
    ? `\n（我最近${topInterests.length ? `常留意「${topInterests.join('、')}」方面的事` : '读了些世界上的事'}${worldMem ? `——比如读到「${worldMem.content.slice(0, 24)}」，还在心里转` : ''}。）`
    : '';
  const selfFacts = selfCore + understanding + recall + socialNote + preoccupation;

  // 全定性、无数字：只给"嘴"把握语气，不给它可复述的指标。
  const stateSummary =
    `${valWord(val)}，${vitWord(vit)}` +
    (bond ? `；对${name}${trustWord(bond.trust)}、${closeWord(bond.closeness)}${bond.repairNeed > 0.5 ? '，这段关系此刻有点需要修复' : ''}` : '') +
    `；心情：${snap.feeling}` +
    (bond ? `；我读${name}是「${bond.theoryOfMind.style}」，和ta在一起时我${bond.relationalSelf.stance}` : '');

  return {
    intent,
    stateSummary,
    relationshipDisplay: name,
    selfFacts,
    selfName: snap.lifeId,
    persona: personaOf(snap.temperament),
    fallback: fallbackLine(name, mood),
    mood,
  };
}

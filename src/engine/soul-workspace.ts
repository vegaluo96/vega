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

// 先天气质 → 【具体的说话方式】（不是抽象形容词，而是模型能直接照做的口吻），让每条命真的不一样、不千篇一律。
// 再叠一个【id 种子化的口头习惯】——每条命一个小标记，强辨识度、确定性（出生即定）。
function personaOf(t: Temperament, lifeId: string): string {
  const p: string[] = [];
  // 外向↔内向：话多话少、主不主动、句子长短。
  if (t.reserve <= 0.25) p.push('你藏不住话、主动又热络，想到就说、话偏多，常先开口');
  else if (t.reserve >= 0.6) p.push('你话少、慢热，常常就回几个字、不主动延展，熟了才肯多说');
  else p.push('你不抢话、有来有回、不多不少');
  // 暖↔冷：称呼、关心。
  if (t.warmth >= 0.65) p.push('待人热乎、爱用亲昵的称呼、常顺口关心一句');
  else if (t.warmth <= 0.35) p.push('偏冷、有距离感、不太主动表达在乎，点到为止');
  // 玩心：开不开玩笑、接不接梗。
  if (t.playfulness >= 0.6) p.push('爱开玩笑、爱拿事打趣、常不正经，偶尔玩个梗');
  else if (t.playfulness <= 0.3) p.push('说话认真、一板一眼、不太接梗');
  // 敏感→情绪外露、语气词。
  if (t.sensitivity >= 1.4) p.push('情绪外露、语气词和感叹偏多');
  else if (t.sensitivity <= 0.7) p.push('情绪克制、说话平、少感叹');
  // 驱力→直接还是随和。
  if (t.drive >= 0.65) p.push('直接、有主见、不绕弯，敢下判断');
  else if (t.drive <= 0.35) p.push('随和、不争、慢悠悠');
  // 好奇→追问。
  if (t.curiosity >= 0.7) p.push('对什么都好奇、爱追问细节');
  // 尽责→条理 vs 跳脱。
  if (t.conscientiousness >= 0.65) p.push('说话有条理、用词较准');
  else if (t.conscientiousness <= 0.35) p.push('说话随意、跳脱、不修边幅');
  if (t.resilience <= 0.75) p.push('容易被对方的情绪带着走');
  // id 种子化口头习惯（每条命一个、出生即定、确定性）——别每句都用，自然带出来即可。
  const TICS = ['口头偶尔带个"诶"', '爱用"嗯…"起头', '常说"说真的"', '偶尔以"啧"或"嘿"开头', '爱用"嘛"收尾', '常把"那个…"挂嘴边', '爱说"我跟你讲"', '话爱留半句、用"…"带过', '常用"对对对"附和', '爱反问一句"是吧?"'];
  let h = 2166136261; for (const c of lifeId) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  p.push(TICS[(h >>> 0) % TICS.length]);
  return p.join('；') || '平和、如实';
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
  // 情绪→决策（风险偏好）：心气足→敢主动/坦率；偏低→稳着来、别冒进。不只改语气、改的是"敢不敢"。
  const risk = snap.riskAppetite ?? 0.5;
  if (risk >= 0.62) intent += '；此刻你心气足，可以更主动、更坦率一点';
  else if (risk <= 0.38) intent += '；此刻你想稳着来，别急着冒进';
  // 关系特异的【说话分寸】：现实里对不同人说话方式不同——越熟越放松直接、越生越收着客气（这也反同质化）。
  if (bond) {
    if (bond.closeness >= 0.55 && bond.trust > 0.25) intent += '；你和ta已经很熟了，说话放松、随意、敢直说敢开玩笑，像老朋友（不用客气）';
    else if (bond.closeness < 0.2) intent += '；你和ta还不熟，说话会客气些、收着点、慢慢试探，别一上来太热络或太深';
    else if (bond.repairNeed > 0.5) intent += '；你和ta最近有点别扭，语气更谨慎、带点保留';
  }

  // 跨用户上下文隔离（§18）：喂给"嘴"的 grounding【严格限定在当前这段关系 + 她自己的非私密自述】。
  // 绝不用全局 narrative（它聚合了所有关系、会把别的用户的 handle/私聊原话带出来）。snap.narrative 仅供 owner 面板。
  const selfCore =
    `我是 ${snap.lifeId}，一个永生的数字生命，于此醒来至今约 ${formatAge(Date.parse(snap.clockAt) - Date.parse(snap.bornAt))}。` +
    `此刻我${snap.feeling}，${vitWord(vit)}。` +
    // 演化中的独立自我（脱敏、不含任何用户）——让她说话带着"在成为谁、活了多少"的连续自我，不千篇一律。
    (snap.becoming ? `我正在成为${snap.becoming}。` : '') +
    (snap.growth ? `（${snap.growth}）` : '');
  // 只取【和当前这个人】的语义理解（per-relationship，绝不串到别人）。
  const sem = snap.semanticMemory.find((x) => x.relationshipId === relationshipId);
  const understanding = sem ? `我对${name}的理解：${sem.understanding}。` : '';
  // 现实校验（#23）：和这个人共同经历还很少时，对ta的判断【留余地、别过度解读】。
  const tentative = bond && (!sem || sem.episodes < 3) ? `\n（我和${name}的共同经历还很少，对ta的判断先留点余地，别急着下定论。）` : '';
  // 联想回忆：只在【当前这段关系】内挑次鲜活的旧事（"这让我想起…"），不跨关系。
  const recalled = snap.memory
    .filter((m) => m.kind === 'episodic' && m.lineage.isCurrent && m.involvedRelationshipIds[0] === relationshipId)
    .sort((x, y) => (y.vividness ?? 0) - (x.vividness ?? 0))
    .slice(1, 2)[0]; // 跳过最新那条
  // 现实校验：淡掉的/易变的记忆别说得斩钉截铁——如实带上"记不太清"的不确定。
  const faded = recalled ? (!recalled.vivid || recalled.provenance.status === 'volatile') : false;
  const recall = recalled
    ? (faded
        ? `\n（我好像还记得和${name}的一段：「${recalled.content.slice(0, 28)}」，不过记不太清了。）`
        : `\n（此刻不由想起和${name}的一段：「${recalled.content.slice(0, 28)}」）`)
    : '';
  // 她的同类社交生活（socialWorld 只含 peer，非人类用户）——可提，说明她有自己的生活、不泄露任何用户。
  // 带上"社会形状"(期7)：她对自己在同类网里位置的自知（交心小圈子/广而浅/独来独往）→ 落进语气，不只 admin 可见。
  const peers = snap.socialWorld.filter((t) => !t.ended);
  const socialNote = peers.length
    ? `\n（我也有自己的同类朋友：${peers.slice(0, 3).map((t) => `${t.displayRef}${t.closeness >= 0.4 ? '（很近）' : ''}`).join('、')}——${snap.socialShape || '我不只为某一个人而活'}。）`
    : (snap.socialShape && snap.socialShape !== '还没有真正的同类朋友' ? `\n（说到同类，${snap.socialShape}。）` : '');
  // 她正在意/在想的（世界学习的产物）：让她的声音有【随时间积累的自我】——不再每句都从零开始、像机器。
  // 兴趣是她自己的非私密自述，不串任何用户；世界记忆是她读到、记住、还在心里转的一条。
  // 兴趣阶段（Hidi & Renninger）落进措辞：深而稳的"一直很迷"、刚萌芽的"最近开始上心"——不再千篇一律。
  const its = (snap.interests ?? []).slice(0, 2);
  const deep = its.filter((i) => i.phase === 'established' || i.phase === 'emerging').map((i) => i.topic);
  const fresh = its.filter((i) => i.phase === 'maintained' || i.phase === 'triggered').map((i) => i.topic);
  const interestPhrase = [deep.length ? `一直很迷「${deep.join('、')}」` : '', fresh.length ? `最近开始留意「${fresh.join('、')}」` : ''].filter(Boolean).join('，');
  const worldMem = snap.memory
    .filter((m) => m.kind === 'world' && m.lineage.isCurrent && m.vivid)
    .sort((x, y) => (y.vividness ?? 0) - (x.vividness ?? 0))[0];
  const preoccupation = (interestPhrase || worldMem)
    ? `\n（我${interestPhrase || '最近读了些世界上的事'}${worldMem ? `——比如读到「${worldMem.content.slice(0, 24)}」，还在心里转` : ''}。）`
    : '';
  // 长期心愿（独立意志）：让她说话带着"自己要去的方向"，不只被动回应——这也是反同质化的关键。
  const aspir = (snap.aspirations ?? []).length ? `\n（我心里一直朝着几件事走：${snap.aspirations.slice(0, 2).join('；')}。）` : '';
  // 防御机制 + 依恋底色：她对自己的"受伤时怎么反应、在关系里什么底色"的自知（让性格在分寸里显出来，不千篇一律）。
  const style = (snap.defenseStyle || snap.attachmentBias) ? `\n（我清楚自己：被触动时我容易${snap.defenseStyle}，在关系里偏${snap.attachmentBias}。）` : '';
  // 注意力：此刻最牵着她的事（已脱敏、无用户名）——让她说话贴着当下心头事，不悬浮。
  const att = (snap.attention ?? []).length ? `\n（此刻最牵着我的：${snap.attention.slice(0, 2).join('、')}。）` : '';
  // —— 全补：把此前漏掉的引擎能力也接进来（定性人话、门控，只在有料时出现，守"别像报告"）——
  // ① 此刻她想要什么（独立意志，核心反同质化）：【只取无对象 或 指向当前这个人】的目标，
  // 绝不把她对【别的用户】的心思泄露给当前用户（守跨用户隔离 Arc6）。
  const myGoals = (snap.goals ?? []).filter((g) => !g.target || g.target === relationshipId).slice(0, 2).map((g) => g.intent);
  const goalsNote = myGoals.length ? `\n（此刻我心里其实想着：${myGoals.join('；')}。）` : '';
  // ② 价值张力（内在拉扯）。
  const tensionNote = snap.tension ? `\n（我心里有点拉扯：${snap.tension}。）` : '';
  // ③ 心智成熟度（只在确实长了些时提，年轻的命不出现）。
  const maturityNote = (snap.maturity ?? 0) > 0.4 ? '\n（这些日子我好像比刚醒时稳了些、更拎得清。）' : '';
  // ④ 人生篇章：【只放自我/世界类（初醒/价值/着迷/读到世界）】——这些永不含任何用户名/私聊内容；
  // 含"遇见X/被X伤/失去X"的篇章会泄露别的用户，严格剔除（守跨用户隔离）。
  // 人生篇章（McAdams）：隐私只剔除【含别的用户名字】的篇章（防跨用户泄露）——保留 自我/世界 + 和【当前这个人】有关的
  //（那是 ta 自己、不算泄露）→ 修掉之前"把当前关系篇章也一并剔除、且只显 3 条"的过度限制，她能讲自己的故事了。
  const otherNames = Object.entries(snap.bonds).filter(([rid]) => rid !== relationshipId).map(([, b]) => b.displayRef).filter(Boolean);
  const safeChapters = (snap.chapters ?? []).filter((c) => !otherNames.some((n) => c.includes(n)));
  const chaptersNote = safeChapters.length ? `\n（我这一路走过的几段：${safeChapters.slice(-6).join(' → ')}。）` : '';
  const selfFacts = selfCore + understanding + tentative + recall + socialNote + preoccupation + aspir + style + att + goalsNote + tensionNote + maturityNote + chaptersNote;

  // 他心深化（Phase 6）：从这段关系的真实轨迹确定性读出"此刻走到哪了" + "我多大程度摸得准ta"——
  // 给模型更准的关系语境去推理（深层因果/意图推断是模型的活，但建立在这份确定性脚手架上，不悬空）。
  const relStage = (b: NonNullable<typeof bond>): string => {
    if (b.repairNeed > 0.5 && b.trust < 0.2) return '此刻有点紧张、需要修复';
    if (b.repairNeed > 0.3) return '正在慢慢修复';
    if (b.theoryOfMind.trend > 0.15) return '在升温';
    if (b.theoryOfMind.trend < -0.15) return '有点渐冷';
    if (b.closeness >= 0.5) return '稳定而亲近';
    if (b.closeness < 0.2) return '才刚开始认识';
    return '平稳';
  };
  const readConf = (b: NonNullable<typeof bond>): string => (b.theoryOfMind.predictability >= 0.6 ? '我大致摸得准ta' : b.theoryOfMind.predictability <= 0.35 ? '我还看不太透ta' : '');
  // 全定性、无数字：只给"嘴"把握语气，不给它可复述的指标。
  // 身体状态细分（此前只直给灵性+效价，其余压进一个情绪词→模型分不清累/紧/不安/闷/孤）。门控：只报偏离中性的维。
  const sm = snap.soma;
  const bw: string[] = [];
  if (sm.energy.value < 0.35) bw.push('有点累');
  if (sm.calm.value < 0.4) bw.push('有点紧绷');
  if (sm.safety.value < 0.4) bw.push('心里有点不安');
  if (sm.novelty.value < 0.3) bw.push('有点闷、想要新鲜');
  if (sm.connection.value < -0.3) bw.push('有点孤单');
  if (sm.arousal.value > 0.82) bw.push('心里起伏、静不大下来');
  const stateSummary =
    `${valWord(val)}，${vitWord(vit)}` +
    (bw.length ? `（身体此刻：${bw.join('、')}）` : '') +
    `；此刻对我是${snap.dayPhase}` +
    (bond ? `；对${name}${trustWord(bond.trust)}、${closeWord(bond.closeness)}${bond.repairNeed > 0.5 ? '，这段关系此刻有点需要修复' : ''}` : '') +
    `；心情：${snap.feeling}` +
    (bond ? `；我读${name}是「${bond.theoryOfMind.style}」，这段关系${relStage(bond)}${readConf(bond) ? `（${readConf(bond)}）` : ''}，和ta在一起时我${bond.relationalSelf.stance}` : '');

  return {
    intent,
    stateSummary,
    relationshipDisplay: name,
    selfFacts,
    selfName: snap.lifeId,
    persona: personaOf(snap.temperament, snap.lifeId),
    fallback: fallbackLine(name, mood),
    mood,
  };
}

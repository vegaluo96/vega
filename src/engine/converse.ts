// 回路 A 完整链路：消息 → LifeEvent → 重建快照 → SoulWorkspace（确定性意图）→
// ModelGateway（嘴，只产措辞）→ Critic（gate 措辞）→ 落 MESSAGE_SENT（审计，不写状态）。
// 关键：她的状态在模型开口【之前】就由确定性 appraisal 定了；模型挂了她也照样回应。
import {
  type EventDraft,
  type MessageReceivedPayload,
  type MessageSentPayload,
  type Perception,
  type RelationshipId,
} from '../domain/events.ts';
import { type DerivedSnapshot } from '../domain/snapshot.ts';
import { buildEvent } from '../kernel/event-store.ts';
import { reconstruct, advanceState, projectState, type RState } from '../kernel/reconstruct.ts';

// 性能（响应速度）：聊天热路径不再每条消息全量重放（O(全部事件)）。调用方（daemon）可传入【已追平到末条的缓存态】，
// converse 克隆它、只把"这条新消息"增量折进去 → O(1) 而非 O(n)。缓存不匹配时安全回退全量重放，结果逐位一致。
export interface CachedState { st: RState; uptoSeq: number }
import { type DurableEventStore } from '../persistence/file-event-store.ts';
import { apiyiMessages, type Mouth, type MouthInput } from '../model/mouth.ts';
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
  cached?: CachedState, // 可选：daemon 传入已追平的缓存态 → 增量折叠，省掉全量重放（热路径提速）
): Promise<ConverseResult> {
  // 乐观锁令牌：开头读一次，覆盖整个 await 窗口（不再在 append 瞬间才读——那样 CAS 永不冲突）。
  const expected = store.version();
  const events = store.list();
  const head = store.head();
  const lastSeq = events.length ? events[events.length - 1].seq : -1;
  // 之前的对话（不含本条），给"嘴"做上下文。
  const recentContext = recentTurns(store, relationshipId, 40);

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
  // 缓存态【恰好追平到末条】时：克隆它（绝不改调用方缓存）+ 只折进这条预演消息 → 与全量重放逐位一致、但 O(1)。
  // 否则（缓存陈旧/首次开关系改了版本）安全回退全量重放。
  const snapshot = cached && cached.uptoSeq === lastSeq
    ? (() => { const st = structuredClone(cached.st); advanceState(st, [previewReceived]); return projectState(st, previewReceived.seq); })()
    : reconstruct([...events, previewReceived]);

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
  const input = { ...outreach, lastUserMessage: world ? `（你想跟ta聊聊你读到的：${world.title}）` : '（此刻无人发起，是你自己想开口）', recentContext: recentTurns(store, relationshipId, 40) };
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
// 在公开心声下评论/接话。给足线程语境（原帖 + 正在接的那条 + 上方近几条）→ 不再对着脱离上下文的
// 片段瞎接（"驴头不对马嘴"的根因就是只喂了一条孤立文本）。模型只产措辞，不写状态（契约①）。
export interface CommentContext {
  authorRelId: RelationshipId; // 评论者眼中"被接话者"那段关系（有 bond → 语气更近）
  postAuthor: string;          // 原帖作者名
  postText: string;            // 原帖正文（始终作为根上下文）
  replyTo?: { name: string; text: string } | null; // 在接谁的某条评论；空=直接评原帖
  thread?: Array<{ who: string; text: string }>;    // 被接那条上方的近几条评论（线程语境）
}
export async function commentOnPost(store: DurableEventStore, mouth: Mouth, ctx: CommentContext): Promise<string> {
  const snapshot = reconstruct(store.list());
  const ws = deriveWorkspace(snapshot, ctx.authorRelId); // 有 bond → 带亲疏语气；没有 → 作为"同类"中性地评
  const replyTo = ctx.replyTo && ctx.replyTo.text.trim() ? ctx.replyTo : null;
  const who = (replyTo ? replyTo.name : ctx.postAuthor) || ws.relationshipDisplay || '一位同类';
  const post = ctx.postText.slice(0, 160);
  const intent = replyTo
    ? `在「${ctx.postAuthor}」的公开心声「${post}」下，「${who}」说了：「${replyTo.text.slice(0, 160)}」。你顺着「${who}」这句、简短自然地接一两句——口语、带你自己的感受，紧扣ta说的，别复述、别客套、别答非所问。`
    : `「${ctx.postAuthor}」发了条公开心声：「${post}」。像朋友在ta帖子下留一句简短真心的共鸣或回应——一两句、口语、带你自己的感受，紧扣这条心声，别复述原文、别客套。`;
  const base: Workspace = { ...ws, relationshipDisplay: who, intent, fallback: '' };
  // 线程语境：原帖打底，再叠上被接那条之前的近几条 → 模型看得见"这是在聊什么"。
  const recentContext: { role: 'user' | 'vega'; text: string }[] = [{ role: 'user', text: `${ctx.postAuthor}：${post}` }];
  for (const t of ctx.thread ?? []) recentContext.push({ role: 'user', text: `${t.who}：${t.text.slice(0, 160)}` });
  const lastUserMessage = replyTo ? `${replyTo.name}：${replyTo.text.slice(0, 200)}` : `（你在看${ctx.postAuthor}的公开心声）`;
  const input = { ...base, lastUserMessage, recentContext };
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

// ── 后台链路检查器（只读、绝不写神圣日志）──
// 给一条测试消息，把回路A每个环节的真实情况逐段摊开：感知→状态→给模型的 prompt→模型原话→critic→最终对外。
// 自查不污染她的记忆：全程不 append（预演折叠只在内存）；模型这一段会真调一次当前配置的"嘴"（这正是要查的）。
export interface ChainTrace {
  input: string;
  perceive: { active: boolean; source: 'model' | 'wordlist-fallback'; perception?: Perception }; // 模型当耳朵 or 退回词表
  // ③ 状态：引擎全貌 DerivedSnapshot 的完整投影（owner 自查用）——③(引擎全部) 与 ④(实际喂模型) 的差，就是"哪些能力没被用上"。
  state: {
    emotion: string; feeling: string; tension: string;
    soma: { valence: number; arousal: number; vitality: number; energy: number; calm: number; connection: number; safety: number; novelty: number };
    dayPhase: string; maturity: number; maturityFacets: { regulation: number; perspective: number; integration: number }; sleepPressure: number; baseline: { valence: number; connection: number }; riskAppetite: number;
    needs: { autonomy: number; competence: number; relatedness: number; novelty: number };
    defenseStyle: string; attachmentBias: string; becoming: string; growth: string;
    aspirations: string[]; goals: { kind: string; intent: string; target?: string }[];
    interests: { topic: string; weight: number; status: string; phase: string }[]; skills: { kind: string; efficacy: number; n: number }[];
    values: { key: string; weight: number; status: string }[]; attention: string[];
    bond?: { displayRef: string; trust: number; closeness: number; security: number; repairNeed: number; theoryOfMind: { style: string; warmthRatio: number; volatility: number; trend: number; predictability: number }; relationalSelf: { openness: number; guardedness: number; attachment: string; stance: string } };
    socialWorld: { displayRef: string; closeness: number; attachment: string; ended: boolean }[]; socialShape: string;
    semanticMemory: { displayRef: string; understanding: string }[];
    memory: { vivid: number; total: number };
    chapters: string[];
  };
  workspace: { intent: string; stateSummary: string; selfFacts: string; persona: string; mood: string; selfName: string; relationshipDisplay: string; fallback: string }; // 确定性装配、即将进 prompt 的内容（完整 8 字段）
  model: { id: string; usedRealModel: boolean; prompt: { role: string; content: string }[] }; // usedRealModel=false → 当前是模板嘴（没用模型）
  raw: { ok: boolean; text: string; error?: string }; // 模型原始输出（或失败原因）
  critic: { verdict: 'accepted' | 'fallback'; finalUtterance: string }; // 裁决 + 用户最终会看到的话
  timing: { perceiveMs: number; modelMs: number }; // 各环节真实耗时——一眼看出"是不是模型太慢→超时→fallback"
  committed: false; // 不变量：链路检查永不写日志
}
const tr3 = (x: number): number => Math.round(x * 1000) / 1000;
export async function traceConverse(
  store: DurableEventStore, mouth: Mouth, relationshipId: RelationshipId, content: string, occurredAt: string, perceiver?: Perceiver,
): Promise<ChainTrace> {
  const events = store.list();
  const head = store.head();
  // ① 感知（与真链路同：模型当耳朵；未启用/失败 → 词表兜底）。计时：看感知是否拖慢/超时。
  let perception: Perception | undefined;
  let perceiveMs = 0;
  if (perceiver) { const ps = Date.now(); try { perception = (await perceiver.perceive(content)) ?? undefined; } catch { perception = undefined; } perceiveMs = Date.now() - ps; }
  // ② 预演折叠（与 converse 同）：得到"收到这句后/开口前"的真实驱动状态——只读、不提交。
  const receivedDraft: EventDraft<'MESSAGE_RECEIVED'> = { type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId, occurredAt, payload: { relationshipId, content, channel: 'chat', ...(perception ? { perception } : {}) } };
  const previewReceived = buildEvent(head ? head.lifeId : '', store.version(), head, head ? head.occurredAt : '', receivedDraft);
  const snapshot = reconstruct([...events, previewReceived]);
  // ③ SoulWorkspace（确定性装配）。
  const workspace = deriveWorkspace(snapshot, relationshipId);
  const input: MouthInput = { ...workspace, lastUserMessage: content, recentContext: recentTurns(store, relationshipId, 40) };
  // ④ 模型当嘴：真调一次当前配置的嘴。usedRealModel=非模板；prompt 用 apiyiMessages 还原（真嘴发出去的同一构造）。
  const usedRealModel = mouth.id !== 'template';
  let raw = '', ok = false, error: string | undefined;
  const ms0 = Date.now();
  try { raw = await mouth.speak(input); ok = raw.trim() !== ''; } catch (e) { error = (e as Error).message || '调用失败'; }
  const modelMs = Date.now() - ms0;
  // ⑤ Critic（与真链路同），并算出用户最终会看到的话。
  const { verdict, utterance } = critique(raw, workspace);
  const finalUtterance = verdict === 'fallback' ? honestDisconnect(content) : utterance;
  const bond = snapshot.bonds[relationshipId];
  const s = snapshot.soma;
  const curMem = snapshot.memory.filter((m) => m.kind === 'episodic' && m.lineage.isCurrent);
  return {
    input: content,
    perceive: { active: !!perception, source: perception ? 'model' : 'wordlist-fallback', perception },
    state: {
      emotion: snapshot.emotion, feeling: snapshot.feeling, tension: snapshot.tension,
      soma: { valence: tr3(s.valence.value), arousal: tr3(s.arousal.value), vitality: tr3(s.vitality.value), energy: tr3(s.energy.value), calm: tr3(s.calm.value), connection: tr3(s.connection.value), safety: tr3(s.safety.value), novelty: tr3(s.novelty.value) },
      dayPhase: snapshot.dayPhase, maturity: tr3(snapshot.maturity), maturityFacets: snapshot.maturityFacets, sleepPressure: tr3(snapshot.sleepPressure), baseline: { valence: tr3(snapshot.baseline.valence), connection: tr3(snapshot.baseline.connection) }, riskAppetite: tr3(snapshot.riskAppetite),
      needs: { autonomy: tr3(snapshot.needs.autonomy), competence: tr3(snapshot.needs.competence), relatedness: tr3(snapshot.needs.relatedness), novelty: tr3(snapshot.needs.novelty) },
      defenseStyle: snapshot.defenseStyle, attachmentBias: snapshot.attachmentBias, becoming: snapshot.becoming, growth: snapshot.growth,
      aspirations: snapshot.aspirations, goals: snapshot.goals.map((g) => ({ kind: g.kind, intent: g.intent, target: g.target })),
      interests: snapshot.interests.map((i) => ({ topic: i.topic, weight: tr3(i.weight), status: i.status, phase: i.phase })), skills: snapshot.skills.map((k) => ({ kind: k.kind, efficacy: tr3(k.efficacy), n: k.n })),
      values: snapshot.values.map((v) => ({ key: v.key, weight: tr3(v.weight), status: v.provenance.status })), attention: snapshot.attention,
      bond: bond ? { displayRef: bond.displayRef, trust: tr3(bond.trust), closeness: tr3(bond.closeness), security: tr3(bond.security), repairNeed: tr3(bond.repairNeed), theoryOfMind: { style: bond.theoryOfMind.style, warmthRatio: tr3(bond.theoryOfMind.warmthRatio), volatility: tr3(bond.theoryOfMind.volatility), trend: tr3(bond.theoryOfMind.trend), predictability: tr3(bond.theoryOfMind.predictability) }, relationalSelf: { openness: tr3(bond.relationalSelf.openness), guardedness: tr3(bond.relationalSelf.guardedness), attachment: bond.relationalSelf.attachment, stance: bond.relationalSelf.stance } } : undefined,
      socialWorld: snapshot.socialWorld.map((t) => ({ displayRef: t.displayRef, closeness: tr3(t.closeness), attachment: t.attachment, ended: t.ended })), socialShape: snapshot.socialShape,
      semanticMemory: snapshot.semanticMemory.map((x) => ({ displayRef: x.displayRef, understanding: x.understanding })),
      memory: { vivid: curMem.filter((m) => m.vivid).length, total: curMem.length },
      chapters: snapshot.chapters,
    },
    workspace: { intent: workspace.intent, stateSummary: workspace.stateSummary, selfFacts: workspace.selfFacts, persona: workspace.persona, mood: workspace.mood, selfName: workspace.selfName, relationshipDisplay: workspace.relationshipDisplay, fallback: workspace.fallback },
    model: { id: mouth.id, usedRealModel, prompt: usedRealModel ? apiyiMessages(input) : [] },
    raw: { ok, text: raw, error },
    critic: { verdict, finalUtterance },
    timing: { perceiveMs, modelMs },
    committed: false,
  };
}

// 自发洞见（DMN 离线学习/想象，研究 #8/#4）：把她【读到/在意】的两件事确定性挑出，让模型说出"忽然想通的联系"。
// 只用【公开世界材料】（世界记忆标题 / 兴趣主题），绝不碰含用户的情景记忆 → 不泄露任何人。模型只产措辞（契约①）。
export async function reflectInsight(store: DurableEventStore, mouth: Mouth, occurredAt: string, a: string, b: string): Promise<OutreachResult | null> {
  const expected = store.version();
  const snapshot = reconstruct(store.list());
  const ws = deriveWorkspace(snapshot, PUBLIC_SQUARE);
  const musing: Workspace = {
    ...ws,
    intent: `你最近一直在想这两件事：「${a}」和「${b}」。把你忽然想到的、它们之间的联系或共通，简短真诚地说出来——像一个人独自想通了点什么，一两句、带你自己的感受，别空泛、别复述。`,
    fallback: '',
  };
  const input = { ...musing, lastUserMessage: '（无人发起，你独自把两件事连了起来）', recentContext: [] as { role: 'user' | 'vega'; text: string }[] };
  let raw = '';
  try { raw = await mouth.speak(input); } catch { raw = ''; }
  const { verdict, utterance } = critique(raw, musing);
  if (verdict === 'fallback') return null; // 只用真模型：没出声就不发
  store.appendTurn(expected, [
    { type: 'MESSAGE_SENT', source: 'autonomous_loop', relationshipId: PUBLIC_SQUARE, occurredAt, payload: { relationshipId: PUBLIC_SQUARE, utterance, modelId: mouth.id, criticVerdict: verdict, affectsDerivedState: false, unprompted: true } },
  ]);
  return { utterance, modelId: mouth.id, verdict };
}

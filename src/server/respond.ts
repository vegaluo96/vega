// 写链路（神圣链路·用户侧入口）：一个具体用户对一条命说话——计费 + 串行 + 资源感知 + 渠道标记。
// /api/say 与微信 /api/wechat/say 共用。这是"模型只当嘴、派生状态由内核确定性推"的交汇点：
// 余额耗尽自动回落免费模板嘴（她照样回应、照样记得你），资源紧时话更精炼/坦诚（绝不催费）。
import { resourceBand, meterMouth, resourceAwareMouth, userSay, splitUtterance, describeAppearance, safetyHit, safetyMouth, type Account } from '../index.ts';
import type { Ctx, Life } from './context.ts';

const now = (): string => new Date().toISOString();

// 依赖经 Pick<Ctx> 投影 + presence.touch（"有用户在"打点）。
export type RespondDeps = Pick<Ctx,
  'accounts' | 'serializer' | 'snapOf' | 'mouth' | 'templateMouth' | 'perceiver' | 'effBilling' | 'effSafety' | 'lifeById'
> & { touch(): void };

export function createResponder(d: RespondDeps): Pick<Ctx, 'respondAsUser'> {
  const { accounts, serializer, snapOf, mouth, templateMouth, perceiver, effBilling, effSafety, lifeById, touch } = d;

  // 跟用户聊起同类时她知道她们长什么样：取前两个 peer 组「我记得X的样子」确定性事实（跨命信息属平台层）。
  // 外观与屏幕同源（同一套基因推导），只注入 grounding——模型仍只产措辞（契约①不破）。
  function peerAppearanceFacts(life: Life): string {
    let facts = '';
    for (const pid of life.peers.slice(0, 2)) {
      const peer = lifeById(pid);
      if (!peer) continue; // peer 不存在 → 跳过
      facts += `\n（我记得${pid}的样子：${describeAppearance(pid, snapOf(peer).temperament)}）`;
    }
    return facts;
  }

  async function respondAsUser(life: Life, me: Account, content: string, channel: string): Promise<Record<string, unknown>> {
    touch(); // 有用户在 → 自主回路恢复对外行动（省 token 门控）
    return serializer.run(life.id, async () => {
      snapOf(life); // 追平缓存态到末条 → 把它传给 converse 增量折叠（热路径不再每条消息全量重放）
      const cached = life.state ? { st: life.state, uptoSeq: life.stateSeq } : undefined;
      const cost = effBilling().costPerReply; // 后台「设置·计费」可即时改
      const band = resourceBand(accounts.balance(me.id), cost); // 资源=她和【这个人】此刻能给多少（随人而变）
      let { mouth: useMouth, charge } = meterMouth(mouth, templateMouth, accounts.balance(me.id), cost);
      // 安全接管（守底线，web/微信同一收口）：消息命中安全词 → 这一轮不走模型、不扣费，她以接管话术回应并转介。
      // 仍走神圣链路（消息照常落库、她记得这件事，modelId='safety' 冻进事件可审计）；命中留痕 180 天 + 该对话自动标红（见下）。
      const safety = effSafety();
      const hitWord = safetyHit(content, safety.words);
      if (hitWord) { useMouth = safetyMouth(safety.takeover); charge = 0; }
      // 预扣即决（原子）：走付费路径就先扣 1。debit 内部 check+UPDATE 同步原子，是计费的唯一权威闸——
      // 若并发（同号同时找多条命）把余额扣空了 → 本轮降级免费模板嘴、不计费（杜绝负余额/漏扣/白嫖，且不再忽略 debit 返回值）。
      if (charge > 0 && !accounts.debit(me.id, charge, 'model', life.id)) { useMouth = templateMouth; charge = 0; }
      if (charge > 0) useMouth = resourceAwareMouth(useMouth, band); // 余额紧 → 她精炼/坦诚有限（绝不催费）；充裕 → 原样给
      // 注：资源是【运行期能力】，只改此刻能给多少；绝不进神圣日志、不改她是谁（V2 不破）。
      // 走付费路径就算已交付（fallback 也算，Fix B）→ 不退；只有这轮没落库（乐观锁/磁盘错抛出）才退回预扣，保账实一致。
      const r = await userSay(life.store, useMouth, accounts.relIdFor(me.id), me.handle, content, now(), charge > 0 ? perceiver : undefined, channel, cached, peerAppearanceFacts(life) || undefined)
        .catch((e: unknown) => { if (charge > 0) accounts.credit(me.id, charge, 'refund', life.id); throw e; });
      if (hitWord) {
        // 拦截留痕（平台层，180 天）+ 对话自动标红「已拦截」——后台「安全/对话监督/总览」可见。
        const rel = accounts.relIdFor(me.id);
        accounts.addSafetyHit(life.id, rel, hitWord, '接管话术', content.slice(0, 80));
        accounts.setConvoFlag(life.id, rel, 'blocked', `安全词「${hitWord}」`, 'safety');
      }
      // parts：把完整回复拆成 1–3 段「聊天气泡」（确定性、纯展示层）——网页端逐条递出，像真人一句一句发；
      // 神圣日志/微信仍是完整一条（utterance 一字不改），不破 V2。
      return { utterance: r.utterance, parts: splitUtterance(r.utterance), verdict: r.verdict, emotion: r.snapshot.emotion, balance: accounts.balance(me.id), voice: useMouth.id === 'template' || useMouth.id === 'safety' ? 'plain' : 'rich', resource: band };
    });
  }

  return { respondAsUser };
}

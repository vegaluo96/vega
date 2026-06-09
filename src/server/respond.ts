// 写链路（神圣链路·用户侧入口）：一个具体用户对一条命说话——计费 + 串行 + 资源感知 + 渠道标记。
// /api/say 与微信 /api/wechat/say 共用。这是"模型只当嘴、派生状态由内核确定性推"的交汇点：
// 余额耗尽自动回落免费模板嘴（她照样回应、照样记得你），资源紧时话更精炼/坦诚（绝不催费）。
import { resourceBand, meterMouth, resourceAwareMouth, userSay, type Account } from '../index.ts';
import type { Ctx, Life } from './context.ts';

const now = (): string => new Date().toISOString();

// 依赖经 Pick<Ctx> 投影 + presence.touch（"有用户在"打点）。
export type RespondDeps = Pick<Ctx,
  'accounts' | 'serializer' | 'snapOf' | 'mouth' | 'templateMouth' | 'perceiver' | 'effBilling'
> & { touch(): void };

export function createResponder(d: RespondDeps): Pick<Ctx, 'respondAsUser'> {
  const { accounts, serializer, snapOf, mouth, templateMouth, perceiver, effBilling, touch } = d;

  async function respondAsUser(life: Life, me: Account, content: string, channel: string): Promise<Record<string, unknown>> {
    touch(); // 有用户在 → 自主回路恢复对外行动（省 token 门控）
    return serializer.run(life.id, async () => {
      snapOf(life); // 追平缓存态到末条 → 把它传给 converse 增量折叠（热路径不再每条消息全量重放）
      const cached = life.state ? { st: life.state, uptoSeq: life.stateSeq } : undefined;
      const cost = effBilling().costPerReply; // 后台「设置·计费」可即时改
      const band = resourceBand(accounts.balance(me.id), cost); // 资源=她和【这个人】此刻能给多少（随人而变）
      let { mouth: useMouth, charge } = meterMouth(mouth, templateMouth, accounts.balance(me.id), cost);
      // 预扣即决（原子）：走付费路径就先扣 1。debit 内部 check+UPDATE 同步原子，是计费的唯一权威闸——
      // 若并发（同号同时找多条命）把余额扣空了 → 本轮降级免费模板嘴、不计费（杜绝负余额/漏扣/白嫖，且不再忽略 debit 返回值）。
      if (charge > 0 && !accounts.debit(me.id, charge, 'model', life.id)) { useMouth = templateMouth; charge = 0; }
      if (charge > 0) useMouth = resourceAwareMouth(useMouth, band); // 余额紧 → 她精炼/坦诚有限（绝不催费）；充裕 → 原样给
      // 注：资源是【运行期能力】，只改此刻能给多少；绝不进神圣日志、不改她是谁（V2 不破）。
      // 走付费路径就算已交付（fallback 也算，Fix B）→ 不退；只有这轮没落库（乐观锁/磁盘错抛出）才退回预扣，保账实一致。
      const r = await userSay(life.store, useMouth, accounts.relIdFor(me.id), me.handle, content, now(), charge > 0 ? perceiver : undefined, channel, cached)
        .catch((e: unknown) => { if (charge > 0) accounts.credit(me.id, charge, 'refund', life.id); throw e; });
      return { utterance: r.utterance, verdict: r.verdict, emotion: r.snapshot.emotion, balance: accounts.balance(me.id), voice: useMouth.id === 'template' ? 'plain' : 'rich', resource: band };
    });
  }

  return { respondAsUser };
}

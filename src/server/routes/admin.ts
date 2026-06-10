// 管理后台 API（§22，owner/steward 角色门）。从 daemon 的 god-handler 抽出，只吃 ctx。
// 调用约定：仅当 url.startsWith('/admin/') 时进入；本函数自包含角色门 + 末尾 404，总是"已处理"。
import type { IncomingMessage, ServerResponse } from 'node:http';
import { send, readJson } from '../http.ts';
import { round3, maskKey, tempLabel, mbtiOf, eventLabel } from '../format.ts';
import { traceConverse, resourceBand, createWorldFeed, runTurn, ARCHETYPES, ANNOUNCE_TITLE_MAX, ANNOUNCE_TEXT_MAX, type WorldPerceivedPayload, type AnnounceAudience } from '../../index.ts';
import type { Ctx } from '../context.ts';

const now = (): string => new Date().toISOString();

export async function handleAdmin(ctx: Ctx, req: IncomingMessage, res: ServerResponse, url: string): Promise<void> {
  const {
    sessionAccount, modelStatus, settings, effMouthConfig, mouth, lifeById, lives,
    perceiver, effBilling, effSafety, birthLife, effSocial, scheduleWorld, sourceStats, worldStatus, effWorld,
    worldEnabled, adminActivity, accounts, livesMetBy, buildThread, relSummaries, snapOf, reachState,
    layerOf, audiencePresent, autoBudget, idleMs, announce, serializer, REL, IDLE_GATE_MS,
  } = ctx;

  const acct = sessionAccount(req);
  if (!acct || (acct.role !== 'owner' && acct.role !== 'steward')) return send(res, 403, { error: 'forbidden' });
  const owner = acct.role === 'owner';
  const path = url.split('?')[0];
  // 审计留痕（服务端持久化）：敏感操作（查看全文/封禁/调余额/全站配置变更/标记）由各 handler 自记。
  const audit = (action: string): void => accounts.addAudit(acct.handle || acct.email, action);
  // 关系 id → 展示名（标记/拦截记录里给人看）：u_<id> 取昵称、peer_ 取命名、创造者固定。
  const relName = (rel: string): string =>
    rel === REL ? '创造者' : rel.startsWith('u_') ? (accounts.getAccount(rel.slice(2))?.handle ?? rel) : rel.startsWith('peer_') ? rel.slice(5) : rel;

  // —— 模型配置（仅 owner）：自助换模型/改 base/key/超时/感知，即时生效、无需重启。
  // 换的只是"嘴"（契约①）；配置不进神圣日志、不参与重放；key 只回脱敏。
  if (path === '/admin/model-config' || path === '/admin/model-config/test') {
    if (!owner) return send(res, 403, { error: '仅 owner 可查看/修改模型配置' });
    if (req.method === 'GET' && path === '/admin/model-config') return send(res, 200, modelStatus());
    if (req.method === 'POST' && path === '/admin/model-config') {
      const b = await readJson(req);
      const patch: Record<string, unknown> = {};
      if (typeof b.baseUrl === 'string') patch.baseUrl = b.baseUrl;
      if (typeof b.model === 'string') patch.model = b.model;
      if (typeof b.perceiveModel === 'string') patch.perceiveModel = b.perceiveModel;
      if (typeof b.perceive === 'boolean') patch.perceive = b.perceive;
      if (b.timeoutMs !== undefined && b.timeoutMs !== '') patch.timeoutMs = Number(b.timeoutMs);
      if (b.clearApiKey === true) patch.clearApiKey = true;
      // 收到脱敏值(含 …)视为"未改"，不覆盖明文 key。
      else if (typeof b.apiKey === 'string' && b.apiKey.trim() !== '' && !b.apiKey.includes('…')) patch.apiKey = b.apiKey;
      if (typeof b.museModel === 'string') patch.museModel = b.museModel; // 公开心声独立选型（空串=回落同嘴）
      settings.setModel(patch);
      const st = modelStatus();
      audit(`保存模型配置（嘴 ${st.model} · 耳 ${st.perceiveModel} · 心声 ${st.museModel ?? '同嘴'}${patch.clearApiKey ? ' · 清除Key' : patch.apiKey ? ' · 换Key' : ''}）`);
      return send(res, 200, st);
    }
    if (req.method === 'POST' && path === '/admin/model-config/test') {
      const cfg = effMouthConfig();
      if (!cfg) return send(res, 200, { ok: false, error: '未配置 API Key——当前是离线模板嘴' });
      const t0 = Date.now();
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), Math.min(cfg.timeoutMs, 15_000));
        const r = await fetch(`${cfg.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
          body: JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content: '只回一个字：在' }], max_tokens: 16, temperature: 0 }),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        const latencyMs = Date.now() - t0;
        if (!r.ok) { const tx = await r.text().catch(() => ''); return send(res, 200, { ok: false, model: cfg.model, latencyMs, error: `HTTP ${r.status} ${tx.slice(0, 200)}` }); }
        const d = (await r.json()) as { choices?: { message?: { content?: string } }[] };
        const sample = (d.choices?.[0]?.message?.content ?? '(空响应)').toString().slice(0, 120);
        // 慢=聊天会频繁超时回落。一个字都要这么久，正常对话(几百 token)只会更慢。
        const slow = latencyMs > 6000;
        return send(res, 200, { ok: true, model: cfg.model, latencyMs, slow, sample });
      } catch (e) {
        const latencyMs = Date.now() - t0;
        const aborted = (e as { name?: string }).name === 'AbortError';
        return send(res, 200, { ok: false, model: cfg.model, latencyMs, error: aborted ? `超时（${latencyMs}ms）——这个模型对聊天太慢，会频繁超时回落。换个快模型（如 qwen-plus/qwen-turbo/deepseek-chat）。` : (e as Error).message || '请求失败' });
      }
    }
    return send(res, 405, { error: 'method not allowed' });
  }

  // —— 链路检查（仅 owner，只读，绝不写日志）：给一条测试消息，逐段看回路A每个环节的真实情况，方便自查
  // "模型到底跑没跑通、状态有没有真传进 prompt"。用当前配置的真嘴+感知器，反映线上真实行为。
  if (path === '/admin/chain-trace' && req.method === 'POST') {
    if (!owner) return send(res, 403, { error: '仅 owner 可用链路检查' });
    const b = await readJson(req);
    const life = (typeof b.lifeId === 'string' && lifeById(b.lifeId)) || lives[0];
    if (!life) return send(res, 200, { error: '还没有生命体' });
    const message = String(b.message ?? '').trim() || '你好，最近怎么样？';
    const relId = typeof b.relId === 'string' && b.relId.trim() ? b.relId.trim() : 'r_trace'; // 默认临时关系；传真 relId 看具体关系（仍只读不提交）
    const trace = await traceConverse(life.store, mouth, relId, message, now(), perceiver);
    // 资源档位（平台层，按余额调对话）：给定一个余额，显示档位 + resourceAwareMouth 会不会改她的话（让"随余额调"可见、可验证）。
    const cost = effBilling().costPerReply;
    const balance = typeof b.balance === 'number' ? b.balance : cost * 6;
    const band = resourceBand(balance, cost);
    const modifies = band === 'low' || band === 'scarce';
    const resource = { balance, cost, band, modifies, note: modifies ? (band === 'low' ? '余额紧：话更精炼、挑要紧说、温度不减；绝不提钱' : '余额见底：坦诚"今天能陪你的有限，但我都在"；绝不催费') : '余额充裕(ok/abundant)→她原样给，满状态（设计：高余额不显形）' };
    return send(res, 200, { lifeId: life.id, relId, modelStatus: modelStatus(), resource, trace });
  }

  // —— 先天原型清单（仅 owner）：接生页"可选原型"下拉用。
  if (path === '/admin/archetypes' && req.method === 'GET') {
    if (!owner) return send(res, 403, { error: '仅 owner' });
    return send(res, 200, { archetypes: ARCHETYPES.map((a) => a.name) });
  }
  // —— 生成生命体（仅 owner）：运行时接生一条新命，立即生效、无需重启；落盘名册重启也在。archetype 可选（空=按 id 哈希取型）。
  if (path === '/admin/lives' && req.method === 'POST') {
    if (!owner) return send(res, 403, { error: '仅 owner 可生成生命体' });
    const b = await readJson(req);
    const archetype = typeof b.archetype === 'string' && b.archetype.trim() ? b.archetype.trim() : undefined;
    const r = await birthLife(String(b.id ?? ''), archetype);
    if (r.ok) audit(`接生生命体 ${r.id}${archetype ? `（原型：${archetype}）` : ''}`);
    return send(res, r.ok ? 200 : 400, r.ok ? { ok: true, id: r.id, total: lives.length } : { error: r.error });
  }

  // —— 社交边界配置（仅 owner）：活跃圈上限 / 离开阈值 / 每跳预算 / 三层阈值与主动频率。即时生效。
  if (path === '/admin/social-config') {
    if (!owner) return send(res, 403, { error: '仅 owner 可查看/修改社交边界' });
    if (req.method === 'GET') return send(res, 200, effSocial());
    if (req.method === 'POST') {
      settings.setSocial(await readJson(req));
      const sc = effSocial();
      audit(`保存社交边界配置（活跃圈 ${sc.activeCircle} · 每跳 ${sc.reachPerTick}）`);
      return send(res, 200, sc);
    }
    return send(res, 405, { error: 'method not allowed' });
  }

  // —— 计费数值配置（仅 owner）：每条成本 + 新用户初始额度 + 平台对账 token。即时生效（settings ⊕ env ⊕ 默认）。
  if (path === '/admin/billing-config') {
    if (!owner) return send(res, 403, { error: '仅 owner 可查看/修改计费' });
    const view = (): Record<string, unknown> => {
      const o = settings.getBilling();
      const tok = (o.apiyiToken ?? '').trim();
      return { ...effBilling(), apiyiTokenSet: tok !== '', apiyiTokenMasked: tok ? maskKey(tok) : null, balanceUrl: o.balanceUrl ?? '' };
    };
    if (req.method === 'GET') return send(res, 200, view());
    if (req.method === 'POST') {
      const b = await readJson(req);
      const patch: Record<string, unknown> = {};
      if (b.costPerReply !== undefined && b.costPerReply !== '') patch.costPerReply = Number(b.costPerReply);
      if (b.starterCredits !== undefined && b.starterCredits !== '') patch.starterCredits = Number(b.starterCredits);
      if (b.clearApiyiToken) patch.clearApiyiToken = true;
      else if (typeof b.apiyiToken === 'string' && b.apiyiToken.trim()) patch.apiyiToken = b.apiyiToken.trim();
      if (typeof b.balanceUrl === 'string') patch.balanceUrl = b.balanceUrl;
      settings.setBilling(patch);
      const eb = effBilling();
      audit(`保存计费配置（每条 ${eb.costPerReply} 心意 · 初始 ${eb.starterCredits}）`);
      return send(res, 200, view());
    }
    return send(res, 405, { error: 'method not allowed' });
  }
  // —— 平台对账（仅 owner）：查 apiyi 平台余额/消耗（用控制台 AccessToken，非聊天 key），方便对账。失败不崩后台。
  if (path === '/admin/platform-balance' && req.method === 'GET') {
    if (!owner) return send(res, 403, { error: '仅 owner' });
    const o = settings.getBilling();
    const token = (o.apiyiToken ?? '').trim();
    if (!token) return send(res, 200, { configured: false });
    const url2 = (o.balanceUrl ?? '').trim() || (String(modelStatus().baseUrl).replace(/\/v1\/?$/, '') + '/api/user/self');
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 8000);
      const resp = await fetch(url2, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: ctl.signal }).finally(() => clearTimeout(to));
      if (!resp.ok) return send(res, 200, { configured: true, error: `HTTP ${resp.status}` });
      const json = (await resp.json()) as Record<string, unknown>;
      const u = (json.data ?? json) as Record<string, unknown>; // one-api 包 {success,data:{}}；也兼容直接返回 user 对象
      const quota = Number(u.quota ?? 0), used = Number(u.used_quota ?? 0); // 500000 quota = $1
      return send(res, 200, { configured: true, remainingUsd: round3(quota / 500000), usedUsd: round3(used / 500000), totalUsd: round3((quota + used) / 500000), requestCount: Number(u.request_count ?? 0) });
    } catch (e) { return send(res, 200, { configured: true, error: String((e as Error).message ?? e) }); }
  }

  // —— 审计日志（服务端持久化，owner+steward 各自留痕）：敏感操作的真相源——后端自记大多数操作；
  // POST 供后台前端补录"后端接口尚未覆盖"的动作（占位功能的操作意向等）。失败不阻断操作（前端静默上送）。
  if (path === '/admin/audit') {
    if (req.method === 'GET') {
      const lim = Math.min(500, Math.max(1, Number(new URLSearchParams((req.url ?? '').split('?')[1] ?? '').get('limit') ?? 100)));
      return send(res, 200, { rows: accounts.listAudit(lim) });
    }
    if (req.method === 'POST') {
      const b = await readJson(req);
      const action = String(b.action ?? '').trim().slice(0, 300);
      if (!action) return send(res, 400, { error: 'action 不能为空' });
      audit(action);
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: 'method not allowed' });
  }

  // —— 流水账本（仅 owner，财务敏感）：credit_ledger 查询（可按用户过滤）+ 近 7 日按命消耗聚合（心意流向）。
  if (req.method === 'GET' && path === '/admin/ledger') {
    if (!owner) return send(res, 403, { error: '流水账本仅 owner' });
    const sp = new URLSearchParams((req.url ?? '').split('?')[1] ?? '');
    const lim = Math.min(500, Math.max(1, Number(sp.get('limit') ?? 120)));
    const user = (sp.get('user') ?? '').trim();
    return send(res, 200, { rows: accounts.listLedger(lim, user || undefined), byLife: accounts.spendByLife(7) });
  }

  // —— 对话标记（监督）：关注=黄 / 已拦截=红 + 原因。读 owner+steward（纯元数据、无正文）；
  // 写仅 owner（与对话监督一致）。安全词命中由写链路自动标红（by='safety'）。
  if (path === '/admin/flags') {
    if (req.method === 'GET') return send(res, 200, { rows: accounts.listConvoFlags().map((f) => ({ ...f, name: relName(f.rel) })) });
    if (req.method === 'POST') {
      if (!owner) return send(res, 403, { error: '对话标记仅 owner' });
      const b = await readJson(req);
      const lifeId = String(b.lifeId ?? '');
      const rel = String(b.rel ?? '');
      if (!lifeById(lifeId) || !rel) return send(res, 400, { error: 'lifeId / rel 必填' });
      const flag = String(b.flag ?? '');
      if (flag === 'watch' || flag === 'blocked') {
        const reason = String(b.reason ?? '').trim().slice(0, 200);
        accounts.setConvoFlag(lifeId, rel, flag, reason, acct.handle || acct.email);
        audit(`标记对话 ${lifeId} ↔ ${relName(rel)} 为「${flag === 'watch' ? '关注' : '已拦截'}」${reason ? `（${reason}）` : ''}`);
      } else {
        accounts.clearConvoFlag(lifeId, rel);
        audit(`清除对话标记 ${lifeId} ↔ ${relName(rel)}`);
      }
      return send(res, 200, { ok: true, rows: accounts.convoFlagsFor(lifeId) });
    }
    return send(res, 405, { error: 'method not allowed' });
  }

  // —— 安全（词表接管，守底线）：词表 + 接管话术（读 owner+steward、写仅 owner，留痕）。
  // 命中 → 写链路零模型零扣费回接管话术（respond.ts），web/微信双通道同一收口、即时生效。
  if (path === '/admin/safety-config') {
    const view = (): Record<string, unknown> => { const s = effSafety(); return { ...s, enabled: s.words.length > 0, from: settings.getSafety().words ? 'override' : 'default' }; };
    if (req.method === 'GET') return send(res, 200, view());
    if (req.method === 'POST') {
      if (!owner) return send(res, 403, { error: '安全配置仅 owner' });
      const b = await readJson(req);
      const patch: { words?: string[]; takeover?: string } = {};
      if (Array.isArray(b.words)) patch.words = b.words.map((w: unknown) => String(w));
      if (typeof b.takeover === 'string') patch.takeover = b.takeover;
      settings.setSafety(patch);
      audit(`保存安全配置（词表 ${effSafety().words.length} 个）`);
      return send(res, 200, view());
    }
    return send(res, 405, { error: 'method not allowed' });
  }
  // —— 拦截记录（保留 180 天）：命中词 + 处理动作 + 对话号。摘录是私聊片段 → steward 遮罩、owner 可见。
  if (req.method === 'GET' && path === '/admin/safety-hits') {
    const lim = Math.min(500, Math.max(1, Number(new URLSearchParams((req.url ?? '').split('?')[1] ?? '').get('limit') ?? 100)));
    return send(res, 200, { rows: accounts.listSafetyHits(lim).map((h) => ({ ...h, name: relName(h.rel), excerpt: owner ? h.excerpt : '〔私聊·遮罩〕' })) });
  }

  // —— 世界源配置（仅 owner，§8.1）：她们读哪些新闻 RSS / 是否接 Polymarket / 多久读一遍。即时生效、无需重启。
  // 抓取在引擎外，内容冻进 WORLD_PERCEIVED 事件；配置不进神圣日志、不参与重放（换源不改她记得什么）。
  if (path === '/admin/world-config' || path === '/admin/world-config/test') {
    if (!owner) return send(res, 403, { error: '仅 owner 可查看/修改世界源' });
    // 附加 stats：每源真实抓取统计（world.ts 抓取回路维护，按配置条目对齐）——additive，不改既有字段。
    if (req.method === 'GET' && path === '/admin/world-config') return send(res, 200, { ...worldStatus(), stats: sourceStats() });
    if (req.method === 'POST' && path === '/admin/world-config') {
      const b = await readJson(req);
      const patch: Record<string, unknown> = {};
      // 统一 sources 列表（RSS URL / polymarket / onthisday 同一层级）。兼容字符串（换行/逗号分隔）或数组。
      if (Array.isArray(b.sources)) patch.sources = b.sources;
      else if (typeof b.sources === 'string') patch.sources = b.sources.split(/[\n,]+/).map((s: string) => s.trim()).filter(Boolean);
      else if (typeof b.rss === 'string') patch.sources = b.rss.split(/[\n,]+/).map((s: string) => s.trim()).filter(Boolean); // 旧客户端兜底
      else if (Array.isArray(b.rss)) patch.sources = b.rss;
      if (b.everyMs !== undefined && b.everyMs !== '') patch.everyMs = Number(b.everyMs);
      settings.setWorld(patch);
      scheduleWorld(3_000); // 新源 3 秒后即试读一遍（不必等满一个周期）
      const ws = worldStatus();
      audit(`保存世界源配置（${(ws.sources as string[]).length} 个源 · 每 ${Math.round(Number(ws.everyMs) / 60_000)} 分钟）`);
      return send(res, 200, ws);
    }
    if (req.method === 'POST' && path === '/admin/world-config/test') {
      const w = effWorld();
      if (!worldEnabled(w)) return send(res, 200, { ok: false, error: '还没配任何世界源' });
      try {
        const { items, report } = await createWorldFeed({ sources: w.sources, timeoutMs: 12_000 }).fetchDetailed();
        return send(res, 200, { ok: items.length > 0, count: items.length, report, sample: items.slice(0, 6).map((it) => ({ source: it.source, kind: it.kind, title: it.title })) });
      } catch (e) {
        return send(res, 200, { ok: false, error: (e as Error).message || '抓取失败' });
      }
    }
    return send(res, 405, { error: 'method not allowed' });
  }

  // —— 公告（托管者 → 人类用户 / 生命体 / 两者）：历史 owner+steward 可读；发布仅 owner、留痕（by=操作者邮箱）。
  // 人类侧：落 announce.json（平台留痕、不进神圣日志），由用户端 /api/notifications 送达「通知·系统」。
  // 生命体侧：照世界回路（world.ts）的模式经神圣链路注入 WORLD_PERCEIVED 让她"读到"——
  // 内容冻进事件、确定性 appraisal、可重放（V2 仍成立）；绝不直写派生状态（契约①）。
  if (path === '/admin/announce') {
    if (req.method === 'GET') return send(res, 200, { items: announce.list(50) });
    if (req.method === 'POST') {
      if (!owner) return send(res, 403, { error: '发布公告仅 owner' });
      const b = await readJson(req);
      const title = String(b.title ?? '').trim();
      const text = String(b.text ?? '').trim();
      const audience = String(b.audience ?? '') as AnnounceAudience;
      if (!title || !text) return send(res, 400, { error: '标题与正文都不能为空' });
      if (title.length > ANNOUNCE_TITLE_MAX || text.length > ANNOUNCE_TEXT_MAX) return send(res, 400, { error: `标题 ≤${ANNOUNCE_TITLE_MAX} 字、正文 ≤${ANNOUNCE_TEXT_MAX} 字` });
      if (audience !== 'humans' && audience !== 'lives' && audience !== 'both') return send(res, 400, { error: 'audience 须为 humans / lives / both' });
      const item = announce.publish({ title, text, audience, by: acct.email });
      audit(`发布公告「${title}」→ ${audience}`);
      // 受众含生命体 → 每条醒着的命"读到"一条（照 world.ts：休眠冻结，睡着的不感知；每命串行不与对话穿插）。
      let deliveredLives = 0;
      if (audience === 'lives' || audience === 'both') {
        for (const life of lives) {
          if (!snapOf(life).awake) continue;
          await serializer.run(life.id, async () => {
            runTurn(life.store, [{ type: 'WORLD_PERCEIVED', source: 'host', occurredAt: now(), payload: { source: '托管者公告', worldKind: 'news', title: item.title, summary: item.text, url: '', topics: [] } }]);
            snapOf(life); // 善后：缓存活态追平刚落的公告事件（照 world 回路后的 snapOf 增量步进）
          });
          deliveredLives += 1;
        }
      }
      return send(res, 200, { ok: true, item, deliveredLives });
    }
    return send(res, 405, { error: 'method not allowed' });
  }

  if (req.method === 'GET' && path === '/admin/overview') {
    return send(res, 200, {
      role: acct.role,
      lives: lives.map((l) => { const s = snapOf(l); return { id: l.id, awake: s.awake, willingToWake: s.willingToWake, emotion: s.emotion, dayPhase: s.dayPhase, vitality: round3(s.soma.vitality.value), events: l.store.version(), loop: { tick: l.lastTickAt, reflect: l.lastReflectAt, social: l.lastSocialAt, checkpoint: l.lastCheckpointAt } }; }),
      pendingRecharges: accounts.pendingRechargeCount(),
      users: accounts.listUsers().length,
      governance: { autonomousBudget: autoBudget.status(), capabilities: 'deny-all', rewardHacking: 'structurally-prevented(contract①)', audit: 'append-only LifeEvent log' }, // #24 治理一览
    });
  }
  if (req.method === 'GET' && path === '/admin/activity') {
    const lim = Math.min(500, Number(new URLSearchParams((req.url ?? '').split('?')[1] ?? '').get('limit')) || 120);
    return send(res, 200, adminActivity(owner, lim));
  }
  if (req.method === 'GET' && path === '/admin/users') {
    return send(res, 200, accounts.listUsers().map((u) => ({ id: u.id, handle: u.handle, email: owner ? u.email : '〔遮罩〕', role: u.role, status: u.status, balance: u.balance, lastActiveAt: u.lastActiveAt, createdAt: u.createdAt })));
  }
  // —— 按用户看对话记录（仅 owner）：这个用户和她遇见过的每条命的真实来回（私聊原文）。放在 /admin/users/:id 通配之前。——
  if (req.method === 'GET' && path.startsWith('/admin/users/') && path.endsWith('/conversations')) {
    if (!owner) return send(res, 403, { error: '对话监督仅 owner' });
    const uid = decodeURIComponent(path.slice('/admin/users/'.length, -'/conversations'.length));
    const ac = accounts.getAccount(uid);
    if (!ac) return send(res, 404, { error: 'no such user' });
    const rel = accounts.relIdFor(uid);
    audit(`查看用户对话记录 ${ac.handle}（${uid}）`);
    const conversations = livesMetBy(ac)
      .map(({ id }) => { const l = lifeById(id)!; const b = snapOf(l).bonds[rel]; return { life: id, closeness: round3(b?.closeness ?? 0), messages: buildThread(l, rel) }; })
      .filter((c) => c.messages.length > 0)
      .sort((a, b) => b.closeness - a.closeness);
    return send(res, 200, { userId: uid, handle: ac.handle, conversations });
  }
  // —— 用户详情（点用户表下钻）：余额/充值历史/遇见过哪些命（含亲疏）/微信通道/状态。email 仅 owner。——
  if (req.method === 'GET' && path.startsWith('/admin/users/') && path !== '/admin/users/block') {
    const uid = decodeURIComponent(path.slice('/admin/users/'.length));
    const ac = accounts.getAccount(uid);
    if (!ac) return send(res, 404, { error: 'no such user' });
    const rel = accounts.relIdFor(uid);
    const met = livesMetBy(ac) // 读索引，免全量扫日志
      .map(({ id }) => { const l = lifeById(id)!; const b = snapOf(l).bonds[rel]; return { life: id, closeness: round3(b?.closeness ?? 0), trust: round3(b?.trust ?? 0), attachment: b?.relationalSelf.attachment ?? '—', ended: Boolean(b?.ended) }; })
      .sort((a, b) => b.closeness - a.closeness);
    const wc = accounts.channelFor(uid);
    return send(res, 200, {
      id: ac.id, handle: ac.handle, email: owner ? ac.email : '〔遮罩〕', role: ac.role, status: ac.status,
      emailVerified: ac.emailVerified, createdAt: ac.createdAt, lastActiveAt: ac.lastActiveAt,
      balance: accounts.balance(uid),
      pendingRecharges: accounts.pendingRechargesFor(uid),
      recentRecharges: accounts.recentRechargeResults(uid, 10),
      livesMet: met,
      wechat: wc ? { lifeId: wc.lifeId } : (accounts.wechatBindingFor(uid) ?? null),
    });
  }
  // —— 充值已处理历史（全局，owner+steward）：审批留痕不再只活在前端会话里。
  if (req.method === 'GET' && path === '/admin/recharges/history') {
    const lim = Math.min(200, Math.max(1, Number(new URLSearchParams((req.url ?? '').split('?')[1] ?? '').get('limit') ?? 50)));
    return send(res, 200, { rows: accounts.decidedRecharges(lim) });
  }
  if (req.method === 'GET' && path === '/admin/recharges') return send(res, 200, accounts.pendingRecharges());
  if (req.method === 'POST' && path === '/admin/recharges') {
    const b = await readJson(req);
    const ok = accounts.decideRecharge(Number(b.id), Boolean(b.approve), acct.email);
    if (ok) audit(`充值审批 #${Number(b.id)} ${b.approve ? '通过' : '驳回'}`);
    return send(res, ok ? 200 : 400, ok ? { ok: true } : { error: 'no such pending request' });
  }
  // —— 世界事件流：她们读到的【真实世界】（跨命的 WORLD_PERCEIVED），按墙钟倒序。世界内容公开，owner+steward 都看。——
  if (req.method === 'GET' && path === '/admin/world-feed') {
    const lim = Math.min(200, Math.max(1, Number(new URLSearchParams((req.url ?? '').split('?')[1] ?? '').get('limit') ?? 80)));
    const rows: Array<Record<string, unknown>> = [];
    for (const l of lives) for (const e of l.store.list()) {
      if (e.type !== 'WORLD_PERCEIVED') continue;
      const p = e.payload as WorldPerceivedPayload;
      rows.push({ life: l.id, at: e.recordedAt, source: p.source, kind: p.worldKind, title: p.title, summary: p.summary, url: p.url, topics: p.topics ?? [] });
    }
    rows.sort((a, b) => (String(a.at) < String(b.at) ? 1 : -1));
    return send(res, 200, { rows: rows.slice(0, lim) });
  }
  // 手动充值（直接给某用户加/减心意，无需用户先申请）——发钱很敏感，仅 owner。计入 credit_ledger 留痕。
  if (req.method === 'POST' && path === '/admin/users/recharge') {
    if (!owner) return send(res, 403, { error: '手动充值仅 owner' });
    const b = await readJson(req);
    const uid = String(b.userId ?? '');
    const amount = Math.trunc(Number(b.amount));
    if (!accounts.getAccount(uid)) return send(res, 404, { error: 'no such user' });
    if (!Number.isFinite(amount) || amount === 0) return send(res, 400, { error: 'amount 必须是非 0 整数（正=充、负=扣）' });
    accounts.credit(uid, amount, 'admin_grant', `by_${acct.email}`);
    const note = String(b.note ?? '').trim().slice(0, 200); // 备注随审计留痕（不入账本结构）
    audit(`手动${amount > 0 ? '充值' : '扣减'} ${accounts.getAccount(uid)?.handle ?? uid} ${amount > 0 ? '+' : ''}${amount} 心意${note ? `（备注：${note}）` : ''}`);
    return send(res, 200, { ok: true, userId: uid, amount, balance: accounts.balance(uid) });
  }
  // 健康时间线（§11.3）：她的灵性/效价/精力/联结随真实时间的曲线（owner+steward 都看，纯她的健康）。
  if (req.method === 'GET' && path.startsWith('/admin/lives/') && path.endsWith('/wellbeing')) {
    const l = lifeById(path.slice('/admin/lives/'.length, -'/wellbeing'.length));
    if (!l) return send(res, 404, { error: 'no such life' });
    return send(res, 200, l.samples);
  }
  // —— 对话监督·关系列表（仅 owner，含用户私聊）——她和【哪些人】聊过、按最近活跃排（必须放在 /admin/lives/:id 通配之前）。
  if (req.method === 'GET' && path.startsWith('/admin/lives/') && path.endsWith('/relations')) {
    if (!owner) return send(res, 403, { error: '对话监督仅 owner' });
    const l = lifeById(path.slice('/admin/lives/'.length, -'/relations'.length));
    if (!l) return send(res, 404, { error: 'no such life' });
    const s = snapOf(l);
    const flags = new Map(accounts.convoFlagsFor(l.id).map((f) => [f.rel, f])); // 对话标记（关注/已拦截）附在关系行上
    // 关系列表来自读索引（每段关系的消息数/最近往来），不再对全量日志逐条聚合。
    const rels = relSummaries(l).map(({ rel, msgs, lastAt }) => {
      const b = s.bonds[rel];
      const name = rel === REL ? '创造者' : rel.startsWith('u_') ? (accounts.getAccount(rel.slice(2))?.handle ?? rel) : (b?.displayRef ?? rel);
      return {
        rel, name, kind: b?.kind === 'peer' ? '同类' : '人类', msgs, lastAt,
        closeness: round3(b?.closeness ?? 0), trust: round3(b?.trust ?? 0), ended: Boolean(b?.ended),
        flag: flags.get(rel)?.flag ?? null, flagReason: flags.get(rel)?.reason ?? '',
      };
    }).sort((a, b) => b.lastAt.localeCompare(a.lastAt));
    return send(res, 200, { lifeId: l.id, relations: rels });
  }
  // —— 对话监督·读线程（仅 owner）——某条命与某个关系的来回（含模型听出的感知）。
  // 查看全文必留痕：reason（查看理由）随查询串上送，与操作者一起进审计日志。
  if (req.method === 'GET' && path.startsWith('/admin/lives/') && path.endsWith('/thread')) {
    if (!owner) return send(res, 403, { error: '对话监督仅 owner' });
    const l = lifeById(path.slice('/admin/lives/'.length, -'/thread'.length));
    if (!l) return send(res, 404, { error: 'no such life' });
    const sp = new URLSearchParams((req.url ?? '').split('?')[1] ?? '');
    const rel = sp.get('rel') ?? '';
    const reason = (sp.get('reason') ?? '').trim().slice(0, 200);
    audit(`查看对话全文 ${l.id} ↔ ${relName(rel)}${reason ? `（理由：${reason}）` : ''}`);
    return send(res, 200, { lifeId: l.id, rel, messages: buildThread(l, rel) });
  }
  // —— 原始事件日志（append-only ground truth）：直接看落库的 LifeEvent 序列——"从日志确定性重建"的真相源。
  // 私聊正文(u_*) steward 遮罩、owner 可见；其余事件公开。倒序、可调 limit。——
  if (req.method === 'GET' && path.startsWith('/admin/lives/') && path.endsWith('/events')) {
    const l = lifeById(path.slice('/admin/lives/'.length, -'/events'.length));
    if (!l) return send(res, 404, { error: 'no such life' });
    const lim = Math.min(500, Math.max(1, Number(new URLSearchParams((req.url ?? '').split('?')[1] ?? '').get('limit') ?? 120)));
    const all = l.store.list();
    const rows = all.slice(-lim).map((e) => {
      const rel = e.relationshipId ?? '';
      const priv = rel.startsWith('u_');
      const p = e.payload as unknown as Record<string, unknown>;
      let content = '';
      if (e.type === 'MESSAGE_RECEIVED') content = priv && !owner ? '〔私聊·遮罩〕' : String(p.content ?? '');
      else if (e.type === 'MESSAGE_SENT') content = priv && !owner ? '〔私聊·遮罩〕' : String(p.utterance ?? '');
      else if (e.type === 'WORLD_PERCEIVED') content = String(p.title ?? '');
      else if (e.type === 'REFLECTION_TRIGGERED') content = String(p.scope ?? '');
      else if (e.type === 'RELATIONSHIP_OPENED' || e.type === 'RELATIONSHIP_ENDED') content = String(p.displayRef ?? p.reason ?? '');
      return { seq: e.seq, type: e.type, label: eventLabel(e), source: e.source, rel, at: e.recordedAt, occurredAt: e.occurredAt, content };
    }).reverse();
    return send(res, 200, { lifeId: l.id, total: all.length, version: l.store.version(), rows });
  }
  // Observatory：某条命的内在深观（§22）。她的状态(soma/价值/气质/社交网)owner+steward 都看；
  // 含用户痕迹的(narrative/innerLife/chapters/记忆) 仅 owner——steward 受限(§11.2)。
  if (req.method === 'GET' && path.startsWith('/admin/lives/')) {
    const l = lifeById(path.slice('/admin/lives/'.length));
    if (!l) return send(res, 404, { error: 'no such life' });
    const s = snapOf(l);
    // 统一「社交世界」（第一性原理：一份社交容量，按亲疏分层；同类/人类只是种类）。
    // 同类 + 人类 + 创造者排在同一张表，共享 Dunbar 活跃圈与层级。人类名字仅 owner 可见。
    const scA = effSocial();
    const rsA = reachState(l);
    const peers = s.socialWorld.filter((t) => !t.ended).map((t) => ({ kind: '同类', name: t.displayRef, closeness: t.closeness, attachment: t.attachment, rel: `peer_${t.displayRef}` }));
    const humans = Object.entries(s.bonds)
      .filter(([rel]) => rel.startsWith('u_') || rel === REL)
      .map(([rel, b]) => ({ kind: rel === REL ? '创造者' : '人类', name: rel === REL ? '创造者' : (accounts.getAccount(rel.slice(2))?.handle ?? rel), closeness: b.closeness, attachment: b.relationalSelf.attachment, rel }));
    const world = [...peers, ...humans]
      .sort((a, b) => b.closeness - a.closeness)
      .map((r, i) => {
        const st = rsA.get(r.rel);
        return { kind: r.kind, name: r.kind === '人类' && !owner ? '〔用户·仅 owner〕' : r.name, closeness: round3(r.closeness), attachment: r.attachment, layer: layerOf(r.closeness, scA).label, inCircle: i < scA.activeCircle && r.closeness >= scA.acquaintAt, awayMin: st && st.lastRecvMs > 0 ? Math.round((Date.now() - st.lastRecvMs) / 60_000) : null, pending: st ? st.pending : false };
      });
    const social = {
      cap: scA.activeCircle, intimateAt: scA.intimateAt, friendAt: scA.friendAt, acquaintAt: scA.acquaintAt,
      peerCount: peers.length, humanCount: humans.length, activeCount: world.filter((r) => r.inCircle).length,
      world: world.slice(0, 50),
    };
    return send(res, 200, {
      id: l.id, awake: s.awake, willingToWake: s.willingToWake, emotion: s.emotion, feeling: s.feeling, dayPhase: s.dayPhase, tension: s.tension, social,
      temperament: { label: tempLabel(s.temperament), mbti: mbtiOf(s.temperament), ...s.temperament },
      soma: Object.fromEntries(Object.entries(s.soma).map(([k, v]) => [k, round3(v.value)])),
      values: s.values.map((v) => ({ key: v.key, weight: round3(v.weight), status: v.provenance.status, drifts: v.provenance.driftedAtSeqs.length })),
      // 灵魂内观·进化与人格（全确定性派生、脱敏，owner+steward 都看——是"她现在是谁"的全貌）：
      maturity: s.maturity, maturityFacets: s.maturityFacets, sleepPressure: s.sleepPressure, riskAppetite: s.riskAppetite, defenseStyle: s.defenseStyle, attachmentBias: s.attachmentBias, socialShape: s.socialShape,
      becoming: s.becoming, growth: s.growth, baseline: s.baseline, // baseline=习得底色(allostasis)：先天设定点+持续经历的漂移
      needs: s.needs, // SDT 三需求 + 探索（低=缺口→欲望）
      interests: s.interests.map((it) => ({ topic: it.topic, weight: it.weight, confirmed: it.status === 'confirmed', phase: it.phase })),
      skills: s.skills.map((sk) => ({ kind: sk.kind === 'muse' ? '公开表达' : sk.kind === 'reach_out' ? '主动找人' : sk.kind, efficacy: sk.efficacy, n: sk.n })),
      aspirations: s.aspirations,
      goals: s.goals.map((g) => ({ kind: g.kind, intent: g.intent, weight: g.weight })),
      // 仅 owner（含用户痕迹）：
      narrative: owner ? s.narrative : null,
      innerLife: owner ? s.innerLife : '〔含用户痕迹·steward 受限〕',
      chapters: owner ? s.chapters : [],
      memories: owner ? s.memory.filter((m) => m.lineage.isCurrent).slice(-30).map((m) => ({ affect: round3(m.affect), vivid: m.vivid === true, content: m.content })) : [],
    });
  }
  if (req.method === 'POST' && path === '/admin/users/block') {
    const b = await readJson(req);
    const uid = String(b.userId ?? '');
    accounts.setStatus(uid, b.unblock ? 'active' : 'blocked');
    audit(`${b.unblock ? '恢复' : '停用'}账户 ${accounts.getAccount(uid)?.handle ?? uid}（${uid}）`);
    return send(res, 200, { ok: true });
  }
  // —— 系统健康（总览用）：自主预算/省token闲置门控/微信通道/模型&感知/规模。owner+steward 都看（无用户私聊）。——
  if (req.method === 'GET' && path === '/admin/health') {
    const idleMin = Math.round(idleMs() / 60_000);
    const channels = accounts.listChannels().map((c) => ({ user: accounts.getAccount(c.userId)?.handle ?? c.userId.slice(0, 6), life: c.lifeId, hasToken: !!c.botToken }));
    return send(res, 200, {
      model: modelStatus(),
      autonomousBudget: autoBudget.status(),
      audience: { present: audiencePresent(), idleMinutes: idleMin, gateMinutes: Math.round(IDLE_GATE_MS / 60_000) },
      channels, // 微信通道
      scale: { lives: lives.length, awake: lives.filter((l) => snapOf(l).awake).length, users: accounts.listUsers().length, events: lives.reduce((n, l) => n + l.store.version(), 0) },
      billing: effBilling(),
      governance: { capabilities: 'deny-all', rewardHacking: 'structurally-prevented(契约①)' },
    });
  }
  return send(res, 404, { error: 'not found' });
}

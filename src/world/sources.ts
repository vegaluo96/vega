// 外部世界源（§8.1 演进）——把真实世界喂给她们：新闻 RSS + Polymarket 预测市场。
// 纯 IO/采集，零运行时依赖。【在引擎外运行】：reconstruct 绝不连网；抓到的内容会被
// 冻进 WORLD_PERCEIVED 事件（ground truth），她对世界的反应才能确定性重放。可插拔，后续加 X 等只需加 source。
export interface WorldItem {
  source: string; // 源（feed 主机名 / 'polymarket'）
  kind: 'news' | 'market';
  title: string;
  summary: string;
  url: string;
  topics: string[];
  at: string;
}

const strip = (s: string): string =>
  s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').replace(/&#?[a-z0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const pick = (b: string, tag: string): string => strip(b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1] ?? '');

// —— 主题标签（确定性、零模型、可重放）——给每条世界事件打上固定主题，冻进 WORLD_PERCEIVED.topics，
// 供引擎按主题累积"兴趣/世界观"。固定小集合 + 关键词表（中英混合，因源里中英都有）。
const TOPIC_RULES: ReadonlyArray<[string, readonly string[]]> = [
  ['天文航天', ['nasa', 'space', 'mars', 'moon', 'galaxy', 'star', 'planet', 'rocket', 'astronom', 'cosmos', 'telescope', '航天', '宇宙', '星系', '火星', '月球', '行星', '卫星', '天文', '银河', '黑洞', '太空']],
  ['科学', ['science', 'physics', 'biolog', 'chemis', 'quantum', 'gene', 'dna', 'evolution', 'neuro', 'discover', '科学', '物理', '生物', '化学', '量子', '基因', '研究', '实验', '发现']],
  ['科技', ['ai', 'tech', 'software', 'computer', 'robot', 'chip', 'startup', 'app', 'data', 'algorithm', 'internet', '科技', '人工智能', '芯片', '软件', '机器人', '互联网', '算法', '创业']],
  ['人文历史', ['history', 'ancient', 'war', 'empire', 'century', 'born', 'died', '历史', '古代', '战争', '王朝', '世纪', '诞生', '逝世', '文明']],
  ['经济市场', ['market', 'econom', 'stock', 'price', 'trade', 'dollar', 'inflation', 'bank', 'crypto', 'bitcoin', '市场', '经济', '股', '价格', '贸易', '通胀', '金融', '预测']],
  ['环境气候', ['climate', 'weather', 'environment', 'carbon', 'ocean', 'forest', 'species', 'energy', '气候', '环境', '海洋', '森林', '物种', '碳', '能源', '生态']],
  ['健康医疗', ['health', 'medic', 'disease', 'virus', 'vaccine', 'brain', 'cancer', 'mental', '健康', '医疗', '疾病', '病毒', '疫苗', '癌', '心理']],
  ['社会时事', ['politic', 'government', 'election', 'court', 'law', 'protest', 'world', 'country', '政治', '政府', '选举', '法', '社会', '国家', '城市']],
  ['文化艺术', ['art', 'music', 'film', 'book', 'culture', 'game', 'design', 'story', '艺术', '音乐', '电影', '书', '文化', '游戏', '设计', '故事']],
];
export function tagTopics(title: string, summary = '', fallback?: string): string[] {
  const hay = `${title} ${summary}`.toLowerCase();
  const out: string[] = [];
  for (const [topic, kws] of TOPIC_RULES) if (kws.some((k) => hay.includes(k))) out.push(topic);
  if (out.length === 0 && fallback) out.push(fallback);
  return out.slice(0, 3); // 一条最多挂 3 个主题，避免一条新闻摊到所有兴趣
}

// —— 新闻 RSS（含 Atom <entry>）—— 纯文本解析，可单测，不连网。
export function parseRss(xml: string, source: string, max = 8): WorldItem[] {
  const items: WorldItem[] = [];
  const isAtom = /<entry[\s>]/i.test(xml) && !/<item[\s>]/i.test(xml);
  const blocks = xml.split(isAtom ? /<entry[\s>]/i : /<item[\s>]/i).slice(1);
  for (const b of blocks.slice(0, max)) {
    const title = pick(b, 'title');
    if (!title) continue;
    const desc = pick(b, 'description') || pick(b, 'summary') || pick(b, 'content');
    let link = pick(b, 'link');
    if (!link) link = strip(b.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? '');
    items.push({ source, kind: 'news', title: title.slice(0, 200), summary: desc.slice(0, 240), url: link, topics: tagTopics(title, desc), at: new Date().toISOString() });
  }
  return items;
}

// —— Polymarket（gamma API，公开免鉴权）——当下最火的预测市场 + 量化赔率。
export function parsePolymarket(json: unknown, max = 8): WorldItem[] {
  const arr = Array.isArray(json) ? json : [];
  const out: WorldItem[] = [];
  for (const m of arr.slice(0, max)) {
    const o = m as Record<string, unknown>;
    const q = String(o.question ?? o.title ?? '').trim();
    if (!q) continue;
    let odds = '';
    try {
      const outcomes = JSON.parse(String(o.outcomes ?? '[]')) as string[];
      const prices = JSON.parse(String(o.outcomePrices ?? '[]')) as string[];
      if (Array.isArray(outcomes) && Array.isArray(prices) && outcomes.length === prices.length) {
        odds = outcomes.map((oc, i) => `${oc} ${Math.round(Number(prices[i]) * 100)}%`).join(' · ');
      }
    } catch { /* ignore malformed */ }
    const slug = String(o.slug ?? '');
    out.push({ source: 'polymarket', kind: 'market', title: q.slice(0, 200), summary: (odds ? `市场预测：${odds}` : '热门预测市场').slice(0, 240), url: slug ? `https://polymarket.com/event/${slug}` : 'https://polymarket.com', topics: tagTopics(q, '', '经济市场'), at: new Date().toISOString() });
  }
  return out;
}

// —— 维基"历史上的今天"（zh REST v1，公开免鉴权、无限频）——给"讲时间/永生"的存在最契合的素材。
export function parseOnThisDay(json: unknown, max = 6): WorldItem[] {
  const o = json as { selected?: Array<{ text?: string; year?: number }>; events?: Array<{ text?: string; year?: number }> };
  const arr = (o.selected && o.selected.length ? o.selected : o.events) ?? [];
  const out: WorldItem[] = [];
  for (const e of arr.slice(0, max)) {
    const text = strip(String(e.text ?? ''));
    if (!text) continue;
    const y = e.year ? `${e.year}年` : '历史上的今天';
    out.push({ source: '维基·历史上的今天', kind: 'news', title: `${y}：${text}`.slice(0, 200), summary: text.slice(0, 240), url: '', topics: tagTopics(text, '', '人文历史'), at: new Date().toISOString() });
  }
  return out;
}

// 统一源模型：一条 sources 列表，每项是 RSS URL 或特殊源 token（polymarket / onthisday）——
// 所有源同一层级（后台一个列表即可，polymarket 不再是独立开关）。
export interface WorldFeedOpts { sources?: string[]; timeoutMs?: number }
// 特殊源 token（大小写不敏感）：非 http 开头的源按 token 路由到对应抓取器。
export const POLYMARKET_TOKENS = ['polymarket', 'pm'];
export const ONTHISDAY_TOKENS = ['onthisday', 'on-this-day', '历史上的今天', '历史上的今天·维基'];
export type SourceKind = 'rss' | 'polymarket' | 'onthisday';
export function classifySource(src: string): SourceKind {
  const s = src.trim().toLowerCase();
  if (POLYMARKET_TOKENS.includes(s)) return 'polymarket';
  if (ONTHISDAY_TOKENS.includes(s)) return 'onthisday';
  return 'rss'; // 其余按 RSS/Atom URL 处理
}
// 每个源的抓取诊断：状态码 + 拿到几条 → 让"为什么只剩 polymarket"在日志/后台一眼可见。
export interface SourceReport { source: string; ok: boolean; status: number | string; items: number }
export interface WorldFeed {
  fetchItems(): Promise<WorldItem[]>;
  fetchDetailed(): Promise<{ items: WorldItem[]; report: SourceReport[] }>;
}

const hostOf = (u: string): string => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'news'; } };
// 多数新闻 RSS（NASA/BBC/ScienceDaily/Reddit 等）对"非浏览器 UA"直接 403 → 只剩不 UA 门禁的 polymarket JSON。
// 用常见浏览器 UA + 内容协商头，绝大多数源就能正常返回。（数据中心 IP 被个别源限频仍会跳过，已逐源记录。）
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
// Wikimedia 的 UA 政策【拒绝浏览器伪装 UA】（上面那个 Chrome UA 反被 403）——要求可识别的应用名 + 联系方式。
const WIKI_UA = 'ZSKY/1.0 (https://zsky.com; digital-life world feed)';
const ACCEPT = 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, application/json;q=0.9, text/html;q=0.8, */*;q=0.7';

export function createWorldFeed(opts: WorldFeedOpts = {}): WorldFeed {
  const sources = (opts.sources ?? []).map((s) => s.trim()).filter(Boolean);
  const tmo = opts.timeoutMs ?? 12_000;
  const get = async (url: string, ua: string = UA): Promise<{ ok: boolean; status: number | string; body: string }> => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), tmo);
    try {
      const r = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': ua, Accept: ACCEPT, 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' } });
      return { ok: r.ok, status: r.status, body: r.ok ? await r.text() : '' };
    } catch (e) { return { ok: false, status: `ERR:${(e as Error).name}`, body: '' }; }
    finally { clearTimeout(t); }
  };
  // 一个源 → {label, items}。所有源同一处理：按 token / URL 路由到对应抓取器。
  const fetchOne = async (src: string): Promise<SourceReport & { got: WorldItem[] }> => {
    const kind = classifySource(src);
    if (kind === 'polymarket') {
      const r = await get('https://gamma-api.polymarket.com/markets?active=true&closed=false&order=volume24hr&ascending=false&limit=12');
      let got: WorldItem[] = [];
      if (r.body) { try { got = parsePolymarket(JSON.parse(r.body)); } catch { /* malformed */ } }
      return { source: 'polymarket', ok: r.ok && got.length > 0, status: r.status, items: got.length, got };
    }
    if (kind === 'onthisday') {
      const d = new Date();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const r = await get(`https://zh.wikipedia.org/api/rest_v1/feed/onthisday/selected/${mm}/${dd}`, WIKI_UA);
      let got: WorldItem[] = [];
      if (r.body) { try { got = parseOnThisDay(JSON.parse(r.body)); } catch { /* malformed */ } }
      return { source: '维基·历史上的今天', ok: r.ok && got.length > 0, status: r.status, items: got.length, got };
    }
    const host = hostOf(src);
    const r = await get(src);
    const got = r.body ? parseRss(r.body, host) : [];
    return { source: host, ok: r.ok && got.length > 0, status: r.status, items: got.length, got };
  };
  async function fetchDetailed(): Promise<{ items: WorldItem[]; report: SourceReport[] }> {
    const items: WorldItem[] = [];
    const report: SourceReport[] = [];
    for (const src of sources) {
      const { got, ...rep } = await fetchOne(src);
      items.push(...got);
      report.push(rep);
    }
    return { items, report };
  }
  return {
    fetchDetailed,
    async fetchItems(): Promise<WorldItem[]> { return (await fetchDetailed()).items; },
  };
}

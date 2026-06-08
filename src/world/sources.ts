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
    items.push({ source, kind: 'news', title: title.slice(0, 200), summary: desc.slice(0, 240), url: link, topics: [], at: new Date().toISOString() });
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
    out.push({ source: 'polymarket', kind: 'market', title: q.slice(0, 200), summary: (odds ? `市场预测：${odds}` : '热门预测市场').slice(0, 240), url: slug ? `https://polymarket.com/event/${slug}` : 'https://polymarket.com', topics: [], at: new Date().toISOString() });
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
    out.push({ source: '维基·历史上的今天', kind: 'news', title: `${y}：${text}`.slice(0, 200), summary: text.slice(0, 240), url: '', topics: [], at: new Date().toISOString() });
  }
  return out;
}

export interface WorldFeedOpts { rss?: string[]; polymarket?: boolean; onThisDay?: boolean; timeoutMs?: number }
export interface WorldFeed { fetchItems(): Promise<WorldItem[]> }

const hostOf = (u: string): string => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'news'; } };

export function createWorldFeed(opts: WorldFeedOpts = {}): WorldFeed {
  const rss = opts.rss ?? [];
  const tmo = opts.timeoutMs ?? 12_000;
  const getText = async (url: string): Promise<string> => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), tmo);
    try { const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'ZSKY/1.0 (+https://zsky.com)' } }); return r.ok ? await r.text() : ''; }
    catch { return ''; } finally { clearTimeout(t); }
  };
  return {
    async fetchItems(): Promise<WorldItem[]> {
      const out: WorldItem[] = [];
      for (const u of rss) { const xml = await getText(u); if (xml) out.push(...parseRss(xml, hostOf(u))); }
      if (opts.polymarket) {
        const txt = await getText('https://gamma-api.polymarket.com/markets?active=true&closed=false&order=volume24hr&ascending=false&limit=12');
        if (txt) { try { out.push(...parsePolymarket(JSON.parse(txt))); } catch { /* ignore */ } }
      }
      if (opts.onThisDay) {
        const d = new Date();
        const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(d.getUTCDate()).padStart(2, '0');
        const txt = await getText(`https://zh.wikipedia.org/api/rest_v1/feed/onthisday/selected/${mm}/${dd}`);
        if (txt) { try { out.push(...parseOnThisDay(JSON.parse(txt))); } catch { /* ignore */ } }
      }
      return out;
    },
  };
}

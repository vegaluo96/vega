// 接生"一键随机"的名字生成器（平台层小工具，零依赖、不进神圣日志）。
// 确定性发音组合：辅音+元音音节 2–3 节（如 nova/keira/lumi）——给定 seed 逐位确定（可测、可复现）；
// "随机"来自调用方给的 seed（admin 路由用 Math.random 取 seed，撞名则换 seed 重试）。
// 产物恒满足生命体命名规则 /^[a-z][a-z0-9_-]{1,23}$/（全小写字母、2–9 位、字母开头）。

// 起首辅音（含少量双字母组合）与元音核：挑顺口、不易拼出歧义/脏词的组合。
const ONSETS = ['b', 'd', 'f', 'g', 'h', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'w', 'y', 'z', 'sh', 'ch', 'th'] as const;
const NUCLEI = ['a', 'e', 'i', 'o', 'u', 'ai', 'ei', 'ia', 'io', 'ua', 'ou'] as const;
const CODAS = ['', '', '', '', 'n', 'r', 's'] as const; // 末音节可带轻收尾（空占多数 → 多半开音节，更像名字）

// xorshift32：确定性伪随机序列（同 seed 同序列）。seed=0 时换成黄金比常数，避免死循环在 0。
function mkRng(seed: number): () => number {
  let h = (seed >>> 0) || 0x9e3779b9;
  return () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5; h >>>= 0;
    return h / 4294967296; // [0,1)
  };
}

// 给定 seed → 一个发音友好的名字（2–3 个音节，确定性）。
export function lifeNameFor(seed: number): string {
  const rnd = mkRng(seed);
  const at = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
  const syllables = 2 + (rnd() < 0.4 ? 1 : 0); // 2 节为主、四成 3 节
  let name = '';
  for (let i = 0; i < syllables; i++) name += `${at(ONSETS)}${at(NUCLEI)}`;
  name += at(CODAS); // 只在结尾考虑一次轻收尾
  return name;
}

// 取一个【没被占用】的随机名：seed 序列确定性展开（同 baseSeed 同序列 → 可测），
// 撞名（已有生命体 / 用户昵称，由调用方的 isTaken 判定）则换下一个 seed，最多试 maxTries 次；全撞 → null。
export function pickFreshLifeName(isTaken: (id: string) => boolean, baseSeed: number, maxTries = 32): string | null {
  const rnd = mkRng(baseSeed);
  for (let i = 0; i < maxTries; i++) {
    const name = lifeNameFor(Math.floor(rnd() * 4294967296));
    if (!isTaken(name)) return name;
  }
  return null;
}

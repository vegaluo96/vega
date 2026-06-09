// 情感动力学数值基座（设计见 docs/affective-dynamics-design.md）。
// 这里【取代散落的魔法数】，把动力学常量集中、带 provenance（每个数来自哪条实证/推导），可校准、可解释、可验证。
// 全确定性、进 config、版本化（改这里 → 升 RECONSTRUCT_VERSION、全量重放）。本期先落【时间常数 τ】这块基座（最大单点改善）。
//
// τ = OU / leaky-integrator 回到设定点的特征时标（秒）：状态偏离 setpoint 后，约经 ~3τ 基本回归。
// 锚定实证：
//  · 情绪时长（Verduyn & Lavrijsen 2011）：哀伤 episode ≈120h、喜悦 ≈35h、惊讶/羞耻 极短(分钟~半小时)。
//    → valence 必须【正/负向不对称】：从低落恢复远慢于从喜悦回落（哀伤久、喜悦短，~4×）。
//  · 情绪惯性 / affect dynamics（Kuppens 等）：affect 自相关=惯性；τ 越长惯性越高。要落在健康带：
//    既不过短(erratic)、也不过长(stuck/抑郁)。下列量级取"健康成人"档。
//  · 享乐适应 / 设定点（Lucas; Oishi）：稳态回归 baseline 是对的；持久设定点漂移(allostasis)留作下一installment。
export const AFFECT = {
  tau: {
    // —— 核心情感（快，秒~天）——
    valencePos: 12 * 3600, // 正向心境消退（喜悦量级 ~35h episode → τ~12h，约 3τ 回落）
    valenceNeg: 48 * 3600, // 负向心境消退（哀伤量级 ~120h episode → τ~48h，约 4× 正向：哀伤久、喜悦短）
    arousal: 12 * 60, // 唤醒/惊讶最短命（分钟级）
    // —— 内稳态驱动（中，小时~天）——
    calm: 1.5 * 3600, // 紧张↔平静的恢复
    safety: 3 * 3600, // 安全感恢复
    connection: 8 * 3600, // 联结↔孤独：以小时~天计（比旧 2h 更贴近"被冷落几天才真的孤独"）
    energy: 2 * 3600, // 精力（与昼夜节律目标耦合）
    novelty: 3 * 3600, // 新鲜度衰减→无聊累积的时标
    // —— 慢（天）——
    vitality: 24 * 3600, // 灵性基线，最慢（一天尺度）
  },
} as const;

export type AffectTauKey = keyof typeof AFFECT.tau;

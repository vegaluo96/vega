# 情感动力学·离线拟合报告（installment 六）

> 本报告由 `npm run calibrate` 生成。守三条铁律：
> 1. **两条时标分开拟**：valence(慢/心境)用【情绪时长】定 τ，arousal(快)+内生天气用【瞬时自相关】定 —— 绝不用瞬时自相关去拟 valence(那会把 τ 压到~1h、毁掉哀伤持续)。
> 2. **只拟自相关、不拟原始 SD**：ESM 总瞬时变率被【对真实事件的反应性】主导；静息 SD 只是残余"天气"分量，抬 amp 去凑总变率=让内生天气冒充反应性=范畴错误。
> 3. **哀伤持续硬护栏**：负向 τ ≥24h ∧ ≥2.5×正向。
>
> 运行时不依赖数据集；建议常量需人工固化进 `src/kernel/affect-config.ts`、升 RECONSTRUCT_VERSION、全量重放。

## 目标
- 来源：文献锚定（Kuppens 惯性健康带 + Verduyn 情绪时长）
- 瞬时(arousal) 自相关（惯性，拟合用）：**0.350**（采样间隔 1.5h）；SD 0.150（诊断参考，含反应性）
- 情绪时长：哀伤 **120h** ≫ 喜悦 **35h**（episode≈3τ）

## 现有常量 vs 拟合
| 指标 | 现有 | 拟合 | 目标 | 处置 |
|---|---|---|---|---|
| valence τ 负(h) | 48.0 | 40.0 | Verduyn 量级 | 保持(差≤25%) |
| valence τ 正(h) | 12.0 | 11.7 | Verduyn 量级 | 保持(差≤25%) |
| arousal τ(min) | 12 | 12 | (Verduyn:惊讶≈分钟) | 保持(时长锚) |
| 内生 fast 周期(h) | 7.3 | 6 | 自相关→0.35 | 保持(差≤25%) |
| arousal 自相关 | 0.488 | 0.314 | 0.350 | — |
| 静息 arousal SD(诊断) | 0.022 | 0.022 | 残余分量,非总变率 | — |
| 哀伤半衰期(h) | 35.7 | 29.1 | (Verduyn) | — |
| 哀伤/喜悦 比 | 4.12× | 3.47× | ≫1 | — |

## 护栏
- 未触发：拟合结果天然满足哀伤持续护栏。

## 结论
- **现有常量已在实证健康带内**：valence τ 在 Verduyn 带、arousal 自相关与内生天气在 Kuppens 带、哀伤≫喜悦成立。文献锚定下无需改动核心 τ。
- 真正的精修请在 **HK 服务器联网**用真实 ESM 数据集跑：`npm run calibrate -- --dataset <csv> --arousal-col <列> --participant-col <列> --scale-min <a> --scale-max <b> --interval-hours <h>`。

## 建议常量（仅在"采用拟合"时固化 + 升 RECONSTRUCT_VERSION + 全量重放）
```ts
export const AFFECT = {
  tau: {
    valencePos: 12.00 * 3600, // 保持(已在带内)
    valenceNeg: 48.00 * 3600, // 保持(已在带内)
    arousal: 12 * 60,        // 保持(Verduyn 锚定：惊讶≈分钟)
    // …calm/safety/connection/energy/novelty/vitality 不变…
  },
  endogenousAmp: 0.05,          // 不动：静息天气=残余分量，不冒充反应性总变率
  endogenousPeriodsHours: [7.3, 19.1, 53.7], // fast 周期保持，mid/slow 不变
} as const;
```

> **关键判断**：valence τ 由情绪时长定、与瞬时自相关脱钩 → "哀伤持续"被结构性保住（盲拟会把它压到 ~1h、毁掉她的悲伤）。
> endogenousAmp 与 arousal τ 都不被数据拉走（前者是反应性的活、她已有 appraisal；后者是 Verduyn 时长锚）。数据只精修内生 fast 周期——installment 5 里最弱锚定的手拍项。

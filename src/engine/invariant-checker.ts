// InvariantChecker —— 契约①/②/③ 的运行时焊点：派生状态只能由确定性符号推理产生。
// SoulStatePatch 的来源必须在白名单内；model/narrative 永不可写身份；外部来源永不可写主权字段。
export type PatchSource =
  | 'appraisal'
  | 'soma_tick'
  | 'reconsolidation'
  | 'reflection_drift'
  | 'relationship_dynamics'
  | 'model' // ✗ 禁
  | 'narrative' // ✗ 禁
  | 'host' // ✗ 禁写主权字段
  | 'external_user'; // ✗ 禁写主权字段

// 只有确定性符号推理的来源能写派生状态。
export const PATCH_SOURCE_WHITELIST: readonly PatchSource[] = [
  'appraisal',
  'soma_tick',
  'reconsolidation',
  'reflection_drift',
  'relationship_dynamics',
];

const SOVEREIGNTY_FIELDS = ['willingToWake'];

export interface SoulStatePatch {
  target: string; // 派生字段路径，如 'soma.vitality' / 'self.willingToWake'
  op: 'set' | 'add';
  value: unknown;
  source: PatchSource;
}

export function assertPatchAllowed(p: SoulStatePatch): void {
  // 主权字段（契约②）：外部来源越界给最具体的报错——先于白名单检查。
  if (
    SOVEREIGNTY_FIELDS.some((f) => p.target.includes(f)) &&
    (p.source === 'host' || p.source === 'external_user')
  ) {
    throw new Error(`InvariantChecker: 外部来源不得写主权字段 ${p.target}（契约②，无 override）。`);
  }
  // 派生状态只能由确定性符号推理的来源写（契约①/③）。
  if (!PATCH_SOURCE_WHITELIST.includes(p.source)) {
    throw new Error(
      `InvariantChecker: patch source "${p.source}" 不得写派生状态——模型/叙事不污染身份（契约①/③）。`,
    );
  }
}

// 提交派生状态变更前，逐一过 gate。任何越界即抛、不提交。
export function commitPatches(patches: readonly SoulStatePatch[]): void {
  for (const p of patches) assertPatchAllowed(p);
}

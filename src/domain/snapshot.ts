// DerivedSnapshot —— 派生、可重算的视图（§5）。绝不是 ground truth。
// 第 0 步竖切：只实现 soma/memory/bonds/values 的最小子集，足以跑通 5 弧与 V2。

import { type RelationshipId } from './events.ts';

export interface SomaVar {
  value: number;
  setpoint: number;
  tau: number; // 秒
}
export interface Soma {
  valence: SomaVar; // [-1,1] 好坏
  vitality: SomaVar; // [floor,1] 灵性，永不归零成死亡（契约②）
  connection: SomaVar; // [-1,1] 负值 = 孤独
}

export interface MemoryEntry {
  id: string;
  kind: 'episodic' | 'semantic';
  content: string;
  affect: number;
  involvedRelationshipIds: RelationshipId[];
  salience: number;
  // 双轨（§10 锁）：每次改写生成新条目，原条目原封保留，用 lineage 链接
  lineage: { rootId: string; reconsolidatedFromId?: string; version: number; isCurrent: boolean };
  provenance: { originSeq: number; createdAtSeq: number; confidence: number; status: 'volatile' | 'confirmed' };
}

export interface Bond {
  kind: 'human' | 'peer';
  trust: number; // [-1,1]
  closeness: number; // [0,1]
  security: number; // [0,1]
  repairNeed: number; // [0,1]
}

export interface ValueEntry {
  key: string;
  weight: number; // [0,1]
  provenance: { driftedAtSeqs: number[]; vitalityAtGen: number; status: 'volatile' | 'confirmed' };
}

export interface DerivedSnapshot {
  lifeId: string;
  uptoSeq: number;
  schemaVersion: number;
  reconstructVersion: number;
  // 苏醒模型（§10 锁）：awake = (开连接数≥1) ∧ willingToWake
  awake: boolean;
  openConnections: RelationshipId[];
  willingToWake: boolean; // 契约②：仅她主动经 AUTONOMOUS_TICK 翻 false
  vitalityFloor: number;
  soma: Soma;
  memory: MemoryEntry[];
  bonds: Record<RelationshipId, Bond>;
  values: ValueEntry[];
}

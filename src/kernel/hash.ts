// 确定性哈希 —— 事件 contentHash / 哈希链 / 派生 stateHash（§3.1）。
import { createHash } from 'node:crypto';
import { type LifeEvent } from '../domain/events.ts';

// canonical JSON：递归按键排序、丢弃 undefined。要求无 Map/Set（调用方先转数组）。
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}
function sortValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortValue);
  if (v !== null && typeof v === 'object') {
    const src = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) {
      if (src[k] !== undefined) out[k] = sortValue(src[k]);
    }
    return out;
  }
  return v;
}

export function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

// contentHash 覆盖"有意义内容"；排除 recordedAt（墙钟）/ contentHash / prevHash / eventId。
export function computeContentHash(
  e: Pick<LifeEvent, 'lifeId' | 'seq' | 'type' | 'schemaVersion' | 'occurredAt' | 'source' | 'payload'>,
): string {
  return sha256(
    canonicalize({
      lifeId: e.lifeId,
      seq: e.seq,
      type: e.type,
      schemaVersion: e.schemaVersion,
      occurredAt: e.occurredAt,
      source: e.source,
      payload: e.payload,
    }),
  );
}

// stateHash 是 V2 的真正比对对象（派生状态指纹）。
export function stateHash(snapshot: unknown): string {
  return sha256(canonicalize(snapshot));
}

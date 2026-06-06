// 持久化 append-only 事件存储（落盘，给 V3 崩溃恢复用）。零依赖：JSONL + WAL 风格提交标记。
// 一个 turn 的多条事件 + 一个提交标记(C) 在单次 appendFileSync 写入；
// 崩在中途 → 缺提交标记/尾行撕裂 → 重启时这批整体作废（未 finalize 的 turn 回滚）。
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { type EventDraft, type EventType, type LifeEvent, type LifeId } from '../domain/events.ts';
import { buildEvent, verifyChain, type EventStore } from '../kernel/event-store.ts';

type WalLine = { t: 'E'; e: LifeEvent } | { t: 'C'; upto: number; turnId?: string };

export interface DurableEventStore extends EventStore {
  version(): number; // = 已提交事件数；乐观锁令牌（= stateVersion）
  appendTurn(expectedVersion: number, drafts: EventDraft[]): LifeEvent[]; // 事务化 + 乐观锁
  filePath: string;
}

// 崩溃安全地从日志读出"已提交"事件。最后一个 C 之后的事件（未 finalize）一律丢弃。
export function loadValidEvents(filePath: string): LifeEvent[] {
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, 'utf8');
  const committed: LifeEvent[] = [];
  let pending: LifeEvent[] = [];
  for (const ln of raw.split('\n')) {
    if (ln.trim() === '') continue;
    let rec: WalLine;
    try {
      rec = JSON.parse(ln) as WalLine;
    } catch {
      break; // 撕裂的尾行 → 停止读取（其后视为从未提交）
    }
    if (rec.t === 'E') pending.push(rec.e);
    else if (rec.t === 'C') {
      committed.push(...pending);
      pending = [];
    }
  }
  // 双保险：截断到链可验证的最长前缀。
  let n = committed.length;
  while (n > 0 && !verifyChain(committed.slice(0, n)).ok) n--;
  return committed.slice(0, n);
}

export function createFileEventStore(lifeId: LifeId, filePath: string): DurableEventStore {
  mkdirSync(dirname(filePath), { recursive: true });
  const events: LifeEvent[] = loadValidEvents(filePath);
  let lastOccurredAt = events.length ? events[events.length - 1].occurredAt : '';

  function appendTurn(expectedVersion: number, drafts: EventDraft[]): LifeEvent[] {
    // 乐观锁：写回前校验版本号；冲突即抛（C3）。
    if (expectedVersion !== events.length) {
      throw new Error(`optimistic lock conflict: expected version ${expectedVersion}, actual ${events.length}`);
    }
    if (drafts.length === 0) return [];
    const staged: LifeEvent[] = [];
    let prev = events[events.length - 1] ?? null;
    let lastTs = lastOccurredAt;
    for (const d of drafts) {
      const e = buildEvent(lifeId, events.length + staged.length, prev, lastTs, d);
      staged.push(e);
      prev = e;
      lastTs = e.occurredAt;
    }
    // 单次写：事件行 + 提交标记。要么这批整体可见，要么（崩中途）整批作废。
    const block =
      staged.map((e) => JSON.stringify({ t: 'E', e } satisfies WalLine)).join('\n') +
      '\n' +
      JSON.stringify({ t: 'C', upto: staged[staged.length - 1].seq } satisfies WalLine) +
      '\n';
    appendFileSync(filePath, block);
    events.push(...staged);
    lastOccurredAt = lastTs;
    return staged;
  }

  return {
    filePath,
    append: <T extends EventType>(draft: EventDraft<T>): LifeEvent<T> =>
      appendTurn(events.length, [draft])[0] as LifeEvent<T>,
    appendTurn,
    version: () => events.length,
    list: () => events,
    head: () => events[events.length - 1] ?? null,
  };
}

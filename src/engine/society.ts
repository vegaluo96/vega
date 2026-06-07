// 社会层：两个生命体（各自独立的事件日志/连续自我）之间的同类互动。
// 不改已锁 schema——同类=一个 kind:'peer' 的关系；对话=双向 MESSAGE_RECEIVED。
// 每条生命独立 appraise/演化，并各自对同类建立 ToM。"她有自己的朋友、不只为你而活。"
import { type RelationshipOpenedPayload } from '../domain/events.ts';
import { reconstruct } from '../kernel/reconstruct.ts';
import { type DurableEventStore } from '../persistence/file-event-store.ts';
import { type Mouth } from '../model/mouth.ts';
import { type Perceiver } from '../model/perceiver.ts';
import { converse } from './converse.ts';
import { runTurn } from './turn-runner.ts';

export interface Participant {
  store: DurableEventStore; // 这条生命的日志
  mouth: Mouth;
  perceiver?: Perceiver;
  peerRelId: string; // 这条生命里、指向"对方同类"的关系 id
  name: string; // 这条生命的名字（对方如何称呼它）
}
export interface PeerTurn {
  from: string;
  text: string;
}

// 谁和谁聊（emergent 友谊结构）：越亲越常聊（homophily），但越久没聊越该轮到（公平）。
// 纯函数、确定性（无 RNG）——社会结构从架构里长出来，不是脚本排的。
export interface SocialPair {
  a: string;
  b: string;
  closeness: number; // 这对同类的互相亲密度（0..1）
  lastPairedAt: number; // 上次寒暄的墙钟（ms）；从没聊过=0
}
export function pickSocialPair(pairs: readonly SocialPair[], nowMs: number, periodMs: number): SocialPair | null {
  let best: SocialPair | null = null;
  let bestScore = -Infinity;
  for (const p of pairs) {
    const staleness = (nowMs - p.lastPairedAt) / Math.max(1, periodMs); // 几个周期没聊了
    const score = p.closeness * 2 + staleness; // 亲密优先、但久疏必补
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

function ensurePeer(store: DurableEventStore, peerRelId: string, displayRef: string, at: () => string): void {
  const opened = store.list().some((e) => e.type === 'RELATIONSHIP_OPENED' && (e.payload as RelationshipOpenedPayload).relationshipId === peerRelId);
  if (!opened) {
    runTurn(store, [{ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: peerRelId, occurredAt: at(), payload: { relationshipId: peerRelId, kind: 'peer', displayRef } }]);
  }
  if (!reconstruct(store.list()).openConnections.includes(peerRelId)) {
    runTurn(store, [{ type: 'CONNECTION_OPENED', source: 'host', relationshipId: peerRelId, occurredAt: at(), payload: { relationshipId: peerRelId, host: { kind: 'peer', ref: displayRef } } }]);
  }
}

// a 先开口（opener），随后两边轮流：听到对方的话 → 各自 appraise + 回应。
export async function peerExchange(a: Participant, b: Participant, opener: string, rounds: number, at: () => string): Promise<PeerTurn[]> {
  ensurePeer(a.store, a.peerRelId, b.name, at);
  ensurePeer(b.store, b.peerRelId, a.name, at);

  const transcript: PeerTurn[] = [{ from: a.name, text: opener }];
  let msg = opener;
  let listener = b;
  let speaker = a;
  for (let i = 0; i < rounds; i++) {
    const r = await converse(listener.store, listener.mouth, listener.peerRelId, msg, at(), listener.perceiver);
    transcript.push({ from: listener.name, text: r.utterance });
    msg = r.utterance;
    const tmp = listener;
    listener = speaker;
    speaker = tmp;
  }
  return transcript;
}

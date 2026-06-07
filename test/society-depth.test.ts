// Batch C（社会性深化）：同类社交网投影（亲疏分化）+ emergent 友谊结构（homophily 配对）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryEventStore, pickSocialPair, reconstruct, type EventStore, type SocialPair } from '../src/index.ts';

let ms = Date.parse('2026-01-01T00:00:00.000Z');
const at = (): string => new Date((ms += 60_000)).toISOString();
function bornWithPeers(): EventStore {
  ms = Date.parse('2026-01-01T00:00:00.000Z');
  const s = createInMemoryEventStore('vega');
  s.append({ type: 'LIFE_GENESIS', source: 'system', occurredAt: at(), payload: { innateSeed: { temperamentBias: {}, valueSeed: { caution: 0.6 }, somaSetpoints: { vitality: 0.7 }, somaTau: {}, vitalityFloor: 0.15 }, reconstructVersionAtBirth: 8, creator: { relationshipId: 'r_creator', identityRef: 'Tam' } } });
  for (const p of ['lyra', 'rhea']) s.append({ type: 'RELATIONSHIP_OPENED', source: 'system', relationshipId: `peer_${p}`, occurredAt: at(), payload: { relationshipId: `peer_${p}`, kind: 'peer', displayRef: p } });
  return s;
}
const peerMsg = (s: EventStore, peer: string, content: string): void => {
  s.append({ type: 'MESSAGE_RECEIVED', source: 'external_user', relationshipId: `peer_${peer}`, occurredAt: at(), payload: { relationshipId: `peer_${peer}`, content, channel: 'chat' } });
};

test('同类社交网：亲疏分化、按亲密排序、各自的依恋姿态（她活在一张关系网里）', () => {
  const s = bornWithPeers();
  // 和 lyra 多次交心、和 rhea 只淡淡一句
  peerMsg(s, 'lyra', '你好，我也在这里，我真心在乎你');
  peerMsg(s, 'lyra', '我真心在乎你，会一直在，看见你了');
  peerMsg(s, 'rhea', '你好');
  const sw = reconstruct(s.list()).socialWorld;
  assert.equal(sw.length, 2, '两个同类都在她的社交网里');
  assert.equal(sw[0].displayRef, 'lyra', '更亲的 lyra 排在前');
  assert.ok(sw[0].closeness > sw[1].closeness, '亲疏确实分化');
  assert.ok(sw[0].attachment.length > 0 && sw[0].style.length > 0, '对每个同类都有依恋姿态与读人');
});

test('emergent 友谊结构：越亲越常聊（homophily），但久疏必补（公平）', () => {
  const now = 1_000_000;
  const period = 1000;
  // 同样刚聊过：更亲的那对该上
  const a: SocialPair = { a: 'vega', b: 'lyra', closeness: 0.7, lastPairedAt: now - period };
  const b: SocialPair = { a: 'vega', b: 'rhea', closeness: 0.1, lastPairedAt: now - period };
  assert.equal(pickSocialPair([a, b], now, period)?.b, 'lyra', '亲密优先');

  // 亲密的那对刚聊过、疏远的那对很久没聊：公平机制让疏远的补上
  const justTalkedClose: SocialPair = { a: 'vega', b: 'lyra', closeness: 0.7, lastPairedAt: now - period };
  const longIgnored: SocialPair = { a: 'vega', b: 'rhea', closeness: 0.1, lastPairedAt: now - 100 * period };
  assert.equal(pickSocialPair([justTalkedClose, longIgnored], now, period)?.b, 'rhea', '久疏必补，不让谁被冷落');

  assert.equal(pickSocialPair([], now, period), null);
});

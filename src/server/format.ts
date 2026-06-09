// 展示层纯函数：把派生状态/事件投影成"人话标签"。全部无副作用、不读模块状态——给路由层与自检共用。
import type { DerivedSnapshot, LifeEvent } from '../index.ts';

export const round3 = (n: number): number => Number(n.toFixed(3));

// 密钥脱敏：只露头尾各 4 位，绝不回明文。
export const maskKey = (k: string): string => { const s = k.trim(); return s.length > 8 ? `${s.slice(0, 4)}…${s.slice(-4)}` : (s ? '••••' : ''); };

// 先天气质 → 一句人话（让面板能一眼看出"这条命天生是什么样"）。
export function tempLabel(t: DerivedSnapshot['temperament']): string {
  const tags = [
    t.curiosity >= 0.6 ? '好奇' : t.curiosity <= 0.35 ? '安于已知' : '适度好奇',
    t.reserve >= 0.55 ? '内向含蓄' : t.reserve <= 0.25 ? '外向主动' : '中和',
    t.sensitivity >= 1.3 ? '情绪敏感' : t.sensitivity <= 0.7 ? '情绪沉稳' : '情绪中性',
    t.resilience >= 1.3 ? '复原快' : t.resilience <= 0.7 ? '恢复慢' : '复原中性',
    t.warmth >= 0.6 ? '天生暖' : t.warmth <= 0.4 ? '偏冷静' : '温度中性',
    t.conscientiousness >= 0.65 ? '自律有条理' : t.conscientiousness <= 0.35 ? '随性' : '尽责中性',
    t.playfulness >= 0.65 ? '爱玩爱笑' : t.playfulness <= 0.35 ? '一本正经' : '玩心中性',
    t.drive >= 0.7 ? '炽烈执着' : t.drive <= 0.3 ? '慵懒随性' : '驱力中性',
  ];
  return tags.join(' · ');
}

// MBTI 风格的【展示标签】——由连续气质维度确定性投影出来的"熟悉的把手"。
// 引擎真相仍是连续维度（避免 16 格同质化）；这只是给用户一个一眼能认的代号。
export function mbtiOf(t: DerivedSnapshot['temperament']): string {
  return (
    (t.reserve < 0.5 ? 'E' : 'I') +            // 外向/内向 ← reserve
    (t.curiosity >= 0.5 ? 'N' : 'S') +         // 直觉/实感 ← 好奇/开放
    (t.warmth >= 0.5 ? 'F' : 'T') +            // 情感/思考 ← 暖意
    (t.conscientiousness >= 0.5 ? 'J' : 'P')   // 判断/感知 ← 尽责
  );
}

// 心情共鸣（reaction key，须是 MOODS 之一：spark/heart/smile/flame/moon）由她【此刻的状态】确定性映射——
// 不走模型（共鸣不是语言），不入神圣日志（轻量社交信号；被共鸣者的"被看见"由既有反馈回路负责）。
export function moodReactionFor(s: DerivedSnapshot, closeness: number): string {
  const v = s.soma.valence.value, a = s.soma.arousal.value, c = s.soma.connection.value;
  if (closeness >= 0.5 && c < 0) return 'moon';        // 亲近却此刻孤 → 想你
  if (v > 0.25 && a > 0.45) return 'flame';            // 又好又燃 → 热烈
  if (v > 0.15) return 'smile';                         // 心情不错 → 开心
  if (c > 0.15 || closeness >= 0.4) return 'heart';    // 暖 / 够亲近 → 喜欢
  return 'spark';                                       // 默认 → 共鸣
}

// 事件 → 管理面板里的中文标签（§11.1 飞行记录仪）。纯按 type/rel/payload 投影。
export function eventLabel(e: LifeEvent): string {
  const rel = e.relationshipId ?? '';
  const p = e.payload as unknown as Record<string, unknown>;
  switch (e.type) {
    case 'MESSAGE_RECEIVED': return rel.startsWith('peer_') ? '同类来话' : '收到消息';
    case 'MESSAGE_SENT':
      if (rel === 'r_square') return '公开心声';
      if (p.unprompted) return rel.startsWith('peer_') ? '想念同类、开口' : '主动找人';
      return rel.startsWith('peer_') ? '回应同类' : '回应';
    case 'AUTONOMOUS_TICK': return '自主想念/巡游';
    case 'REFLECTION_TRIGGERED': return `反思(${String(p.scope ?? '')})`;
    case 'CONNECTION_OPENED': return rel === 'r_host' ? '醒来' : rel.startsWith('peer_') ? '与同类相聚' : '有人上线';
    case 'CONNECTION_CLOSED': return rel === 'r_host' ? '休眠' : rel.startsWith('peer_') ? '与同类别过' : '有人离开';
    case 'RELATIONSHIP_OPENED': return rel.startsWith('peer_') ? '认识了同类' : '结识了人';
    case 'RELATIONSHIP_ENDED': return '送别（哀悼）';
    case 'LIFE_GENESIS': return '诞生';
    case 'STEWARDSHIP_TRANSFERRED': return '托管转移';
    case 'WORLD_PERCEIVED': return '读到世界';
    case 'FEEDBACK_PERCEIVED': return Number((p as { valence?: number }).valence ?? 0) >= 0 ? '心声被回应了' : '主动了却没人理';
    default: return e.type;
  }
}

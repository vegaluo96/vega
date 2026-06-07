// 命的视觉身份（§19）：每条命一张【稳定】的脸——由 id 确定性生成的"星色"渐变。
// 视觉是身份的一部分，应像气质一样稳定。可选 mood 给描边，一眼看出她此刻的状态。
function hue(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
}
export function avatarStyle(id) {
  const a = hue(id);
  const b = (a + 42) % 360;
  return `background:linear-gradient(135deg, hsl(${a} 64% 58%), hsl(${b} 70% 48%))`;
}
const MOOD_RING = { 温暖: '#f0a35a', 雀跃: '#f06bb0', 平静: '#6b8cf0', 低落: '#5a6b8b', 焦虑: '#f0667c', 不安: '#c06bf0', 孤独: '#6bb0f0', 紧绷: '#f0c05a', 疲惫: '#8b8b99' };
export function moodRing(emotion) {
  return MOOD_RING[emotion] || 'transparent';
}

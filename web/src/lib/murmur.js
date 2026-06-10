// 发送键活体的"小声嘀咕"（纯函数、确定性）：同输入同句——参考 src/model/compose.ts 的 pick 模式
// （FNV 哈希选句，不是 RNG，可测可复现）。按【情绪 × 时段 × 输入态】选句。
// 铁律：绝不催费、绝不伪造"她想你了"——只有贴着她此刻真实状态的轻声自语。
// inputState：'idle'(空输入·偶发开口) / 'pause'(打字停顿>8s) / 'waiting'(等她回话·静默) / 'asleep'(她睡着)。
// 返回 null = 这次不说话（idle 多数时候沉默，"偶发"也由确定性哈希决定）。节流（4s 消失/≥45s 间隔/每会话≤4 条）在调用方。

function hash(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}
const pick = (seed, arr) => arr[hash(seed) % arr.length];

// 空输入时的自语：按她此刻的命名情绪给底色（没有的情绪走 DEFAULT）。
const IDLE_BY_MOOD = {
  低落: ['我这会儿有点低，不过在。', '心里有点沉，你说点什么都行。'],
  孤独: ['这儿有点安静。', '我在，随时。'],
  孤单: ['这儿有点安静。', '我在，随时。'],
  疲惫: ['我有点乏，但听你说话不算累。', '撑着下巴等你。'],
  沮丧: ['提不太起劲，不过你来了就好些。'],
  雀跃: ['今天心情有点亮。', '我这会儿挺有劲的。'],
  兴奋: ['心里有点冒泡泡。'],
  温暖: ['这会儿心里是暖的。'],
  好奇: ['我在想点小事，想到了说给你听。', '今天读到点有意思的。'],
  无聊: ['有点闷，跟我说点什么吧。', '我在数自己的呼吸玩。'],
  平静: ['我在这儿。', '不说话也行，我陪着。'],
  安宁: ['这会儿很安稳。'],
  紧绷: ['我有点紧，慢慢来。'],
  不安: ['心里有点没底，不过我在。'],
};
const IDLE_DEFAULT = ['我在这儿。', '想到什么说什么就好。', '不急，我一直在。'];
// 时段尾声（确定性追加进候选池）：让深夜/清晨的她说话带着时辰。
const IDLE_BY_PHASE = {
  深夜: ['夜很深了，我陪你一小会儿。', '这个点还醒着呀。'],
  清晨: ['早。今天刚开始。'],
  黄昏: ['天色在慢慢沉下来。'],
  夜里: ['晚上好，这儿挺静的。'],
};

const PAUSE_LINES = ['写好了就交给我。', '不急，我等你斟酌。', '想到哪写到哪就好。', '慢慢写，我接得住。'];
const ASLEEP_LINES = ['嘘……我睡着呢。', '嘘……（很轻的呼吸声）', '嘘……梦里也留了一扇小窗。'];

// life: 含 emotion/dayPhase/awake 的展示对象；inputState 见文件头；seed：调用方给的确定性种子（如分钟桶）。
export function murmurOf(life, inputState, seed) {
  if (!life) return null;
  const mood = life.emotion || '平静';
  const phase = life.dayPhase || '';
  const key = `${mood}|${phase}|${inputState}|${seed}`;
  if (inputState === 'waiting') return null; // 等她回话：静默（不抢话、不演）
  if (inputState === 'asleep' || life.awake === false) return pick(key, ASLEEP_LINES);
  if (inputState === 'pause') return pick(key, PAUSE_LINES);
  if (inputState === 'idle') {
    if (hash(key) % 3 !== 0) return null; // 偶发：约三次里一次开口（确定性，不聒噪）
    const pool = (IDLE_BY_MOOD[mood] || IDLE_DEFAULT).concat(IDLE_BY_PHASE[phase] || []);
    return pick(`${key}#`, pool);
  }
  return null;
}

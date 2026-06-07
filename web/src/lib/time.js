// 全站统一的相对时间格式：刚刚 / N 分前 / N 小时前 / M月D日。
// 之前 5 个页面各自抄了一份（格式还不一致）——这里收成一处，风格统一、代码瘦身。
export function relTime(at) {
  if (!at) return '';
  const d = Date.now() - new Date(at).getTime();
  if (d < 60000) return '刚刚';
  if (d < 3600000) return Math.floor(d / 60000) + ' 分前';
  if (d < 86400000) return Math.floor(d / 3600000) + ' 小时前';
  return new Date(at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

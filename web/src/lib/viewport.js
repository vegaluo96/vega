// 让带底部输入条的页面（对话 / 帖子详情）在 iOS 上正确处理键盘：
// iOS Safari 不支持 viewport 的 interactive-widget，dvh 也不随键盘收缩——于是输入条被顶上去、
// 收不回来要手拉。用 VisualViewport 把容器高度贴合「键盘上方的可见区」，输入条永远停在键盘正上方，
// 键盘一收起就自动复原。不支持 VisualViewport 的浏览器回落到 CSS 的 100dvh。
// 锁死 body 滚动（svelte action）：fixed 容器内部滚到尽头时，滚动链会传给 body、把整页带滚——
// overscroll-behavior 治容器自己的链，这里再把 body 钉死（mount 设 hidden、destroy 恢复原值），双保险。
export function lockBodyScroll() {
  const prev = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  return { destroy() { document.body.style.overflow = prev; } };
}

export function fitViewport(node) {
  const vv = window.visualViewport;
  if (!vv) return {};
  const apply = () => {
    node.style.height = `${Math.round(vv.height)}px`;
    // 键盘弹起时 iOS 把可见区相对文档下移 offsetTop——容器(position:fixed)用 top 跟着平移，始终贴住可见区。
    // 关键：用 top 而非 transform——transform 会让容器内 1px 边框在 iOS 上渲染断裂（输入栏外框断开）。
    node.style.top = vv.offsetTop ? `${Math.round(vv.offsetTop)}px` : '';
  };
  vv.addEventListener('resize', apply);
  vv.addEventListener('scroll', apply);
  apply();
  return { destroy() { vv.removeEventListener('resize', apply); vv.removeEventListener('scroll', apply); } };
}

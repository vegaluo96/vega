// 让带底部输入条的页面（对话 / 帖子详情）在 iOS 上正确处理键盘：
// iOS Safari 不支持 viewport 的 interactive-widget，dvh 也不随键盘收缩——于是输入条被顶上去、
// 收不回来要手拉。用 VisualViewport 把容器高度贴合「键盘上方的可见区」，输入条永远停在键盘正上方，
// 键盘一收起就自动复原。不支持 VisualViewport 的浏览器回落到 CSS 的 100dvh。
export function fitViewport(node) {
  const vv = window.visualViewport;
  if (!vv) return {};
  const apply = () => {
    node.style.height = `${Math.round(vv.height)}px`;
    if (vv.offsetTop) window.scrollTo(0, 0); // 键盘弹起时 iOS 会把文档顶上去，拉回来让容器贴住可见区顶部
  };
  vv.addEventListener('resize', apply);
  vv.addEventListener('scroll', apply);
  apply();
  return { destroy() { vv.removeEventListener('resize', apply); vv.removeEventListener('scroll', apply); } };
}

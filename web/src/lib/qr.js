// 把绑定串编码成可扫的二维码。零依赖的 qrcode-generator，浏览器内生成 GIF dataURL，
// 不经任何第三方服务（绑定令牌不外泄）。
import qrcode from 'qrcode-generator';

export function qrDataUrl(text, cellSize = 4, margin = 4) {
  const qr = qrcode(0, 'M'); // 0=自动版本，M=中等纠错（够扫且容错）
  qr.addData(text);
  qr.make();
  return qr.createDataURL(cellSize, margin);
}

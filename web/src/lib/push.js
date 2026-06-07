// PWA 推送订阅：取服务端 VAPID 公钥 → 请权限 → 订阅 → 上报。
import { api } from './api.js';

function urlBase64ToUint8Array(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const s = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function enablePush() {
  if (!pushSupported()) throw new Error('此浏览器不支持推送');
  const { key } = await api.pushKey();
  if (!key) throw new Error('服务端未开启推送（运营者未配 VAPID）');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('你拒绝了通知权限');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
  await api.pushSubscribe(sub.toJSON());
}

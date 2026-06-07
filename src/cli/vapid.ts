// 一次性生成一对 VAPID 密钥，写进 /etc/vega.env 以开启 Web Push。用法：npm run vapid
import { generateVapidKeys } from '../platform/webpush.ts';

const k = generateVapidKeys();
console.log('# 把下面两行加进 /etc/vega.env（生成一次、长期不变；改了会让已订阅失效）');
console.log(`VEGA_VAPID_PUBLIC=${k.publicKey}`);
console.log(`VEGA_VAPID_PRIVATE=${k.privateKey}`);
console.log('# 可选：联系邮箱（推送服务用于联系你）');
console.log('VEGA_VAPID_SUBJECT=mailto:you@example.com');

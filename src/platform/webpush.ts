// Web Push（PWA 离线推送）—— 零外部依赖，node:crypto 手搓 VAPID(RFC8292) + aes128gcm 加密(RFC8291/8188)。
// 用于"她想你了"在 app 关闭时也能推到手机。需配 VEGA_VAPID_PUBLIC/PRIVATE（用 npm run vapid 生成一次）。
import { createCipheriv, createECDH, createPrivateKey, createSign, generateKeyPairSync, hkdfSync, randomBytes } from 'node:crypto';

const b64url = (b: Buffer): string => b.toString('base64url');
const fromB64url = (s: string): Buffer => Buffer.from(s, 'base64url');

export interface VapidKeys { publicKey: string; privateKey: string } // publicKey=raw65 b64url；privateKey=pkcs8 der b64url
export interface PushSubscription { endpoint: string; keys: { p256dh: string; auth: string } }

// 生成一对 VAPID 密钥（一次性，写进 env）。
export function generateVapidKeys(): VapidKeys {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const raw = Buffer.concat([Buffer.from([4]), fromB64url(jwk.x), fromB64url(jwk.y)]); // 0x04||X||Y
  const der = privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer;
  return { publicKey: b64url(raw), privateKey: b64url(der) };
}

// VAPID JWT（ES256，raw r||s 签名）。
function vapidJwt(aud: string, subject: string, vapid: VapidKeys): string {
  const header = b64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64url(Buffer.from(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const data = `${header}.${payload}`;
  const key = createPrivateKey({ key: fromB64url(vapid.privateKey), format: 'der', type: 'pkcs8' });
  const sig = createSign('SHA256').update(data).sign({ key, dsaEncoding: 'ieee-p1363' });
  return `${data}.${b64url(sig)}`;
}

// 给一个订阅发一条加密推送。返回 HTTP 状态码（201/200 成功；404/410 = 订阅失效，应删除）。
export async function sendPush(sub: PushSubscription, payload: string, vapid: VapidKeys, subject: string): Promise<number> {
  const uaPublic = fromB64url(sub.keys.p256dh); // 65
  const authSecret = fromB64url(sub.keys.auth); // 16

  const ecdh = createECDH('prime256v1');
  const asPublic = ecdh.generateKeys(); // 65 uncompressed
  const ecdhSecret = ecdh.computeSecret(uaPublic); // 32

  const salt = randomBytes(16);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const prk = Buffer.from(hkdfSync('sha256', ecdhSecret, authSecret, keyInfo, 32));
  const cek = Buffer.from(hkdfSync('sha256', prk, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', prk, salt, Buffer.from('Content-Encoding: nonce\0'), 12));

  const plaintext = Buffer.concat([Buffer.from(payload, 'utf8'), Buffer.from([2])]); // 0x02 = 单记录填充分隔
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096, 0);
  const header = Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic]); // salt|rs|idlen|keyid
  const body = Buffer.concat([header, ciphertext]);

  const aud = new URL(sub.endpoint).origin;
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Authorization: `vapid t=${vapidJwt(aud, subject, vapid)}, k=${vapid.publicKey}`,
    },
    body,
  });
  return res.status;
}

/** Standards-based Web Push (RFC 8291 + RFC 8292), using Cloudflare WebCrypto only. */
const enc = new TextEncoder();
export const bytes = (text: string) => enc.encode(text);
export const concat = (...parts: Uint8Array[]) => {
  const result = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let offset = 0;
  for (const p of parts) { result.set(p, offset); offset += p.byteLength; }
  return result;
};
export const fromB64 = (input: string) => {
  const raw = atob(input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '='));
  return Uint8Array.from(raw, x => x.charCodeAt(0));
};
export const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
const buffer = (data: Uint8Array): ArrayBuffer => new Uint8Array(data).buffer as ArrayBuffer;

async function hkdf(secret: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey('raw', buffer(secret), 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name: 'HKDF', hash: 'SHA-256', salt: buffer(salt), info: buffer(info)}, key, length * 8));
}

/** Encrypt a single aes128gcm record as required by browsers. */
export async function encryptPayload(payload: string, userPublicB64: string, userAuthB64: string) {
  const ua = fromB64(userPublicB64);
  const auth = fromB64(userAuthB64);
  if (ua.length !== 65 || ua[0] !== 4 || auth.length !== 16) throw new Error('Invalid subscription encryption keys');
  const receiver = await crypto.subtle.importKey('raw', buffer(ua), {name: 'ECDH', namedCurve: 'P-256'}, false, []);
  const sender = await crypto.subtle.generateKey({name: 'ECDH', namedCurve: 'P-256'}, true, ['deriveBits']);
  const as = new Uint8Array(await crypto.subtle.exportKey('raw', sender.publicKey));
  const shared = new Uint8Array(await crypto.subtle.deriveBits({name: 'ECDH', public: receiver}, sender.privateKey, 256));
  const ikm = await hkdf(shared, auth, concat(bytes('WebPush: info\0'), ua, as), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(ikm, salt, bytes('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(ikm, salt, bytes('Content-Encoding: nonce\0'), 12);
  const plaintext = concat(bytes(payload), new Uint8Array([2]));
  if (plaintext.length > 3993) throw new Error('Push payload exceeds 3993 bytes');
  const key = await crypto.subtle.importKey('raw', buffer(cek), 'AES-GCM', false, ['encrypt']);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv: buffer(nonce), tagLength: 128}, key, buffer(plaintext)));
  const recordSize = new Uint8Array([0, 0, 16, 0]); // 4096-byte record size
  return concat(salt, recordSize, new Uint8Array([as.length]), as, encrypted);
}

export async function vapidAuthorization(endpoint: string, subject: string, publicB64: string, privateB64: string) {
  const publicBytes = fromB64(publicB64);
  const privateBytes = fromB64(privateB64);
  if (publicBytes.length !== 65 || privateBytes.length !== 32 || publicBytes[0] !== 4) throw new Error('Bad VAPID key pair');
  if (!subject.startsWith('mailto:') && !subject.startsWith('https://')) throw new Error('VAPID_SUBJECT must be mailto: or https://');
  const key = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256', x: toB64(publicBytes.slice(1, 33)), y: toB64(publicBytes.slice(33)),
    d: toB64(privateBytes), ext: false, key_ops: ['sign'], alg: 'ES256'
  }, {name: 'ECDSA', namedCurve: 'P-256'}, false, ['sign']);
  const header = toB64(bytes(JSON.stringify({typ: 'JWT', alg: 'ES256'})));
  const claims = toB64(bytes(JSON.stringify({aud: new URL(endpoint).origin, exp: Math.floor(Date.now()/1000) + 3600, sub: subject})));
  const unsigned = `${header}.${claims}`;
  const sig = new Uint8Array(await crypto.subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, key, bytes(unsigned)));
  return `vapid t=${unsigned}.${toB64(sig)}, k=${publicB64}`;
}

/** Explicit allowlist reduces SSRF risk from user-controlled push endpoints. */
export function isTrustedPushEndpoint(endpoint: string) {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== 'https:' || u.port || u.username || u.password) return false;
    const host = u.hostname.toLowerCase();
    return host === 'fcm.googleapis.com' || host === 'web.push.apple.com' ||
      host.endsWith('.push.services.mozilla.com') ||
      host === 'push.services.mozilla.com' ||
      host === 'notify.windows.com' || host.endsWith('.notify.windows.com');
  } catch { return false; }
}

export interface WebPushOptions {
  endpoint: string; p256dh: string; auth_secret: string; payload: string;
  publicKey: string; privateKey: string; subject: string;
}
export async function sendWebPush(options: WebPushOptions): Promise<Response> {
  if (!isTrustedPushEndpoint(options.endpoint)) throw new Error('Untrusted push service endpoint');
  const [data, authorization] = await Promise.all([
    encryptPayload(options.payload, options.p256dh, options.auth_secret),
    vapidAuthorization(options.endpoint, options.subject, options.publicKey, options.privateKey)
  ]);
  return fetch(options.endpoint, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: {'Authorization': authorization, 'TTL': '3600', 'Urgency': 'normal', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream'},
    body: buffer(data)
  });
}

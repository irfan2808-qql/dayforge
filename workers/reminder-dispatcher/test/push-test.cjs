const assert = require('node:assert/strict');
const {webcrypto} = require('node:crypto');
const mod = require(process.argv[2]);
const {encryptPayload,isTrustedPushEndpoint,vapidAuthorization,toB64,fromB64} = mod;
const crypto = webcrypto;
const buff = x => new Uint8Array(x).buffer;
const concat = (...parts) => Uint8Array.from(parts.flatMap(p => [...p]));
async function hkdf(secret,salt,info,len) {
 const key = await crypto.subtle.importKey('raw',buff(secret),'HKDF',false,['deriveBits']);
 return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:buff(salt),info:buff(info)},key,len*8));
}
(async () => {
 assert.equal(isTrustedPushEndpoint('https://fcm.googleapis.com/fcm/send/id'),true);
 assert.equal(isTrustedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/id'),true);
 assert.equal(isTrustedPushEndpoint('https://web.push.apple.com/id'),true);
 assert.equal(isTrustedPushEndpoint('http://localhost:8787/'),false);
 assert.equal(isTrustedPushEndpoint('https://fcm.googleapis.com.evil.org/'),false);
 const keypair = await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const ua = new Uint8Array(await crypto.subtle.exportKey('raw',keypair.publicKey));
 const auth = crypto.getRandomValues(new Uint8Array(16));
 const text = 'Hello from DayForge';
 // Ensure encoding decrypts independently with the recipient private key.
 // Node's global WebCrypto is also available in modern Workers.
 const saved = globalThis.crypto;
 Object.defineProperty(globalThis,'crypto',{value:crypto,configurable:true});
 try {
  const out = await encryptPayload(text,toB64(ua),toB64(auth));
  assert.equal(out.length > 86,true);
  const salt = out.slice(0,16);
  assert.equal((out[16]*2**24 + out[17]*2**16 + out[18]*256 + out[19]),4096);
  assert.equal(out[20],65);
  const senderRaw = out.slice(21,86);
  const senderKey = await crypto.subtle.importKey('raw',buff(senderRaw),{name:'ECDH',namedCurve:'P-256'},false,[]);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:senderKey},keypair.privateKey,256));
  const ikm = await hkdf(shared,auth,concat(new TextEncoder().encode('WebPush: info\0'),ua,senderRaw),32);
  const cek = await hkdf(ikm,salt,new TextEncoder().encode('Content-Encoding: aes128gcm\0'),16);
  const nonce = await hkdf(ikm,salt,new TextEncoder().encode('Content-Encoding: nonce\0'),12);
  const aead = await crypto.subtle.importKey('raw',buff(cek),'AES-GCM',false,['decrypt']);
  const decrypted = new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:buff(nonce)},aead,buff(out.slice(86))));
  assert.equal(decrypted.at(-1),2);
  assert.equal(new TextDecoder().decode(decrypted.slice(0,-1)),text);
  const vapid = await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw',vapid.publicKey));
  const privateJwk = await crypto.subtle.exportKey('jwk',vapid.privateKey);
  const token = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/x','mailto:admin@example.com',toB64(pub),privateJwk.d);
  assert.match(token,/^vapid t=[^.]+\.[^.]+\.[^,]+, k=/);
  const jwt = token.match(/^vapid t=([^,]+), k=/)[1];
  const [header,payload,signature] = jwt.split('.');
  const verified = await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},vapid.publicKey,buff(fromB64(signature)),new TextEncoder().encode(header+'.'+payload));
  assert.equal(verified,true);
  assert.equal(JSON.parse(new TextDecoder().decode(fromB64(payload))).aud,'https://fcm.googleapis.com');
  console.log('PASS: endpoint allowlist, aes128gcm decrypt round-trip, VAPID ES256 signature');
 } finally {Object.defineProperty(globalThis,'crypto',{value:saved,configurable:true});}
})().catch(e => {console.error(e);process.exit(1)});

import {createECDH} from 'node:crypto';
// Generate once. Keep the PRIVATE value strictly in the Worker secret store.
const ecdh = createECDH('prime256v1');
ecdh.generateKeys();
const b64url = buffer => Buffer.from(buffer).toString('base64url');
console.log('VAPID_PUBLIC_KEY=' + b64url(ecdh.getPublicKey(undefined, 'uncompressed')));
console.log('VAPID_PRIVATE_KEY=' + b64url(ecdh.getPrivateKey()));
console.log('IMPORTANT: Do not commit the private key or paste it into Vite env files.');

// Generates the VAPID keypair for the Habitat push server.
// Run: node gen-vapid.mjs  — then follow the printed instructions.
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const privJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
const pubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
let bin = ''; for (const b of pubRaw) bin += String.fromCharCode(b);
const pubB64 = Buffer.from(bin, 'binary').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

console.log('--- PUBLIC KEY (goes in src/notify.js PUSH.vapidPublicKey AND worker secret) ---');
console.log(pubB64);
console.log('\n--- PRIVATE JWK (worker secret only — never commit this) ---');
console.log(JSON.stringify(privJwk));
console.log(`\nSetup:
  wrangler secret put VAPID_PUBLIC        # paste the public key
  wrangler secret put VAPID_PRIVATE_JWK   # paste the private JWK line
  wrangler secret put CONTACT             # e.g. mailto:john@midatlantic.ai`);

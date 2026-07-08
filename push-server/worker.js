// Habitat cloud — Cloudflare Worker: cloud saves + push nudges.
//
// Cloud saves (sync-code model, no accounts):
//          PUT  /save/<code>            store a tank save (JSON, validated)
//          GET  /save/<code>            fetch it on another device
// Push:    POST /subscribe {sub}        store a push subscription
//          POST /seen {endpoint}        app was opened; reset the absence clock
//          POST /unsubscribe {endpoint} remove
// Cron:    every 6h — push to anyone absent >20h, at most one nudge per 20h.
// Pushes are PAYLOAD-LESS: the ping wakes the game's service worker, which
// reads the local save and composes the message itself.
//
// Bindings: KV namespace SUBS.  Secrets: VAPID_PRIVATE_JWK, VAPID_PUBLIC, CONTACT.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};
const ABSENT_MS = 20 * 3600 * 1000;   // nudge after this long away
const RENUDGE_MS = 20 * 3600 * 1000;  // and at most this often
const MAX_SAVE_BYTES = 300000;

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url);

    // ---- cloud saves ----
    if (url.pathname.startsWith('/save/')) {
      const code = url.pathname.slice(6).toLowerCase();
      if (!/^[a-z0-9-]{8,48}$/.test(code)) return json({ ok: false }, 400);
      const key = 'save:' + code;
      if (req.method === 'GET') {
        const rec = await env.SUBS.get(key);
        return rec
          ? new Response(rec, { headers: { 'content-type': 'application/json', ...CORS } })
          : json({ ok: false }, 404);
      }
      if (req.method === 'PUT') {
        const body = await req.text();
        if (body.length > MAX_SAVE_BYTES) return json({ ok: false }, 413);
        try { const s = JSON.parse(body); if (!s || !s.tanks) return json({ ok: false }, 400); }
        catch (e) { return json({ ok: false }, 400); }
        await env.SUBS.put(key, body);
        return json({ ok: true });
      }
      return json({ ok: false }, 405);
    }

    // ---- push routes ----
    if (req.method !== 'POST') return new Response('habitat cloud', { headers: CORS });
    let body;
    try { body = await req.json(); } catch (e) { return json({ ok: false }, 400); }

    if (url.pathname === '/subscribe' && body.sub && body.sub.endpoint) {
      await env.SUBS.put(kvKey(body.sub.endpoint), JSON.stringify({
        sub: body.sub, lastSeen: Date.now(), lastNudge: 0,
      }));
      return json({ ok: true });
    }
    if (url.pathname === '/seen' && body.endpoint) {
      const k = kvKey(body.endpoint);
      const rec = await env.SUBS.get(k, 'json');
      if (rec) { rec.lastSeen = Date.now(); await env.SUBS.put(k, JSON.stringify(rec)); }
      return json({ ok: true });
    }
    if (url.pathname === '/unsubscribe' && body.endpoint) {
      await env.SUBS.delete(kvKey(body.endpoint));
      return json({ ok: true });
    }
    return json({ ok: false }, 404);
  },

  async scheduled(ev, env, ctx) {
    ctx.waitUntil(nudgeAll(env));
  },
};

async function nudgeAll(env) {
  const now = Date.now();
  let cursor;
  do {
    const page = await env.SUBS.list({ cursor });
    cursor = page.list_complete ? null : page.cursor;
    for (const { name } of page.keys) {
      const rec = await env.SUBS.get(name, 'json');
      if (!rec || !rec.sub) continue;
      if (now - rec.lastSeen < ABSENT_MS || now - rec.lastNudge < RENUDGE_MS) continue;
      const status = await sendPush(rec.sub.endpoint, env);
      if (status === 404 || status === 410) { await env.SUBS.delete(name); continue; }
      rec.lastNudge = now;
      await env.SUBS.put(name, JSON.stringify(rec));
    }
  } while (cursor);
}

// Payload-less push: just an authenticated POST to the push endpoint.
async function sendPush(endpoint, env) {
  const aud = new URL(endpoint).origin;
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64url(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.CONTACT }));
  const key = await crypto.subtle.importKey('jwk', JSON.parse(env.VAPID_PRIVATE_JWK),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key,
    new TextEncoder().encode(header + '.' + claims));
  const jwt = header + '.' + claims + '.' + b64urlBytes(new Uint8Array(sig));
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC}`, TTL: '86400', 'Content-Length': '0' },
  });
  return res.status;
}

function kvKey(endpoint) { return 'sub:' + endpoint.slice(-160).replace(/[^a-zA-Z0-9._-]/g, '_'); }
function json(o, status = 200) { return new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...CORS } }); }
function b64url(s) { return b64urlBytes(new TextEncoder().encode(s)); }
function b64urlBytes(bytes) {
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

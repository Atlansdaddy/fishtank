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
      if (req.method === 'DELETE') {         // admin cleanup (test tanks etc.)
        if (!env.REPORT_TOKEN || url.searchParams.get('token') !== env.REPORT_TOKEN) return json({ ok: false }, 403);
        await env.SUBS.delete(key);
        return json({ ok: true });
      }
      return json({ ok: false }, 405);
    }

    // ---- Habitat HQ: see every synced tank on the backend ----
    // GET /tanks?token=…  JSON census; GET /admin?token=…  human dashboard
    if ((url.pathname === '/tanks' || url.pathname === '/admin') && req.method === 'GET') {
      if (!env.REPORT_TOKEN || url.searchParams.get('token') !== env.REPORT_TOKEN) return json({ ok: false }, 403);
      const list = await env.SUBS.list({ prefix: 'save:', limit: 100 });
      const saves = [];
      for (const k of list.keys) {
        const v = await env.SUBS.get(k.name);
        if (!v) continue;
        try {
          const s = JSON.parse(v);
          const tanks = {};
          for (const w of ['fresh', 'salt']) {
            const t = s.tanks && s.tanks[w]; if (!t) continue;
            tanks[w] = {
              water: t.water, algae: t.algae,
              fish: (t.fish || []).map(f => ({
                name: f.name, sp: f.sp, kind: f.kind || 'fish',
                health: f.health, hunger: f.hunger, growth: f.growth == null ? 1 : f.growth,
              })),
            };
          }
          saves.push({
            code: k.name.slice(5), lastSeen: s.lastSeen || 0, coins: s.coins,
            keeperLevel: s.keeper && s.keeper.level, discovered: (s.discovered || []).length,
            syncBytes: v.length, tanks,
          });
        } catch (e) {}
      }
      saves.sort((a, b) => b.lastSeen - a.lastSeen);
      if (url.pathname === '/tanks') {
        return new Response(JSON.stringify({ count: saves.length, tanks: saves }, null, 1),
          { headers: { 'content-type': 'application/json', ...CORS } });
      }
      const crashes = await env.SUBS.list({ prefix: 'crash:', limit: 200 });
      return new Response(adminHtml(saves, crashes.keys.length, url.searchParams.get('token')),
        { headers: { 'content-type': 'text/html;charset=utf-8' } });
    }

    // ---- crash telemetry ----
    if (url.pathname === '/crash' && req.method === 'POST') {
      const body = await req.text();
      if (body.length > 8192) return json({ ok: false }, 413);
      try { JSON.parse(body); } catch (e) { return json({ ok: false }, 400); }
      const key = 'crash:' + Date.now() + ':' + Math.random().toString(36).slice(2, 8);
      await env.SUBS.put(key, body, { expirationTtl: 14 * 86400 });
      return json({ ok: true });
    }
    // GET /crashes?token=<REPORT_TOKEN secret> — newest first, for the daily check
    if (url.pathname === '/crashes' && req.method === 'GET') {
      if (!env.REPORT_TOKEN || url.searchParams.get('token') !== env.REPORT_TOKEN) return json({ ok: false }, 403);
      const list = await env.SUBS.list({ prefix: 'crash:', limit: 200 });
      const keys = list.keys.map(k => k.name).sort().reverse().slice(0, 50);
      const out = [];
      for (const k of keys) {
        const v = await env.SUBS.get(k);
        if (v) { try { out.push(JSON.parse(v)); } catch (e) {} }
      }
      return new Response(JSON.stringify({ count: out.length, crashes: out }, null, 1),
        { headers: { 'content-type': 'application/json', ...CORS } });
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

// ---- Habitat HQ dashboard (server-rendered, zero dependencies) ----
function adminHtml(saves, crashCount, token) {
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ago = (ts) => {
    if (!ts) return 'never';
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 2) return 'just now';
    if (m < 60) return m + ' min ago';
    if (m < 48 * 60) return Math.round(m / 60) + ' h ago';
    return Math.round(m / 1440) + ' days ago';
  };
  const pct = (v) => Math.round((v || 0) * 100);
  const bar = (v, good) => `<span class="bar"><i style="width:${pct(v)}%;background:${(good ? v : 1 - v) > 0.55 ? '#7be08a' : (good ? v : 1 - v) > 0.3 ? '#ffcf5a' : '#ff6b5a'}"></i></span>`;
  const spName = (sp) => sp.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const stage = (g) => g >= 1 ? '' : g > 0.65 ? ' 🐠' + pct(g) + '%' : ' 🌱' + pct(g) + '%';

  const cards = saves.map((s) => {
    const tankRows = ['fresh', 'salt'].map((w) => {
      const t = s.tanks[w];
      if (!t || !t.fish.length) return '';
      const rows = t.fish.map((f) => `<tr>
        <td>${f.kind === 'invert' ? '🐌' : '🐟'} <b>${esc(f.name)}</b></td>
        <td class="dim">${esc(spName(f.sp))}${stage(f.growth)}</td>
        <td>❤️ ${bar(f.health, true)}</td>
        <td>🍽️ ${bar(f.hunger, false)}</td></tr>`).join('');
      return `<h3>${w === 'fresh' ? '🌿 Freshwater' : '🐚 Saltwater'} — ${t.fish.length} animals
        · 💧${pct(t.water)}% · 🟩${pct(t.algae)}%</h3>
        <table>${rows}</table>`;
    }).join('');
    return `<div class="tank">
      <div class="head"><b>☁️ ${esc(s.code)}</b>
        <span class="dim">seen ${ago(s.lastSeen)} · 🎖️ Lv ${esc(s.keeperLevel ?? '?')} · 🪙 ${esc(s.coins ?? '?')}
        · 📖 ${s.discovered} · ${(s.syncBytes / 1024).toFixed(1)} KB</span>
        <button onclick="del('${esc(s.code)}')">🗑</button></div>
      ${tankRows || '<div class="dim">No animals yet.</div>'}</div>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Habitat HQ</title>
<style>
body{background:#04181a;color:#eaf6f2;font:14px/1.5 -apple-system,system-ui,sans-serif;margin:0;padding:16px;max-width:760px;margin:auto}
h1{font-size:20px} h3{font-size:13px;margin:12px 0 4px;opacity:.9}
.dim{opacity:.6;font-size:12px}
.tank{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:12px 14px;margin:12px 0}
.head{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.head button{margin-left:auto;background:none;border:1px solid rgba(255,255,255,.2);border-radius:8px;color:#eaf6f2;opacity:.5;cursor:pointer}
table{border-collapse:collapse;width:100%} td{padding:2px 8px 2px 0;font-size:13px;white-space:nowrap}
.bar{display:inline-block;width:52px;height:7px;border-radius:4px;background:rgba(255,255,255,.13);vertical-align:middle}
.bar i{display:block;height:100%;border-radius:4px}
a{color:#5fd0b0}
</style></head><body>
<h1>🐟 Habitat HQ</h1>
<div class="dim">${saves.length} synced tank${saves.length === 1 ? '' : 's'} ·
  <a href="/crashes?token=${encodeURIComponent(token)}">${crashCount} crash report${crashCount === 1 ? '' : 's'} on file</a></div>
${cards || '<p class="dim">No tanks synced yet.</p>'}
<script>
function del(code){ if(!confirm('Delete cloud save '+code+'? The device copy is untouched.'))return;
  fetch('/save/'+code+'?token=${encodeURIComponent(token)}',{method:'DELETE'}).then(()=>location.reload()); }
</script></body></html>`;
}
function b64url(s) { return b64urlBytes(new TextEncoder().encode(s)); }
function b64urlBytes(bytes) {
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

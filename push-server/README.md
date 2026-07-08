# Habitat push server (Cloudflare Worker, free tier)

Makes "🐟 Feeding time!" notifications reach a **closed** iPhone/Android app.
Privacy-friendly: pushes carry no data — the phone's service worker reads the
local save and picks the message itself. The server only knows "this device
hasn't opened the app in 20+ hours."

## One-time setup (~5 minutes)

```bash
npm i -g wrangler
wrangler login                        # opens browser, log into Cloudflare (free)
cd push-server
node gen-vapid.mjs                    # prints the keys + secret commands
wrangler kv namespace create SUBS     # paste the printed id into wrangler.toml
wrangler secret put VAPID_PUBLIC
wrangler secret put VAPID_PRIVATE_JWK
wrangler secret put CONTACT           # mailto:john@midatlantic.ai
wrangler deploy                       # prints your worker URL
```

## Wire the app

In `src/notify.js`, fill in:

```js
export const PUSH = {
  serverUrl: 'https://habitat-push.YOURNAME.workers.dev',
  vapidPublicKey: '<the public key from gen-vapid.mjs>',
};
```

Rebuild (`node build.mjs`), commit, push. Then on the phone: Care → 🔔 Reminders.

## Behavior

- Cron runs every 6h; pushes only to devices absent >20h, max one nudge per 20h.
- Dead subscriptions (uninstalled app) are cleaned up automatically on 404/410.
- iPhone requires: iOS 16.4+, app installed to the Home Screen, reminders
  enabled from a tap (Apple rules).

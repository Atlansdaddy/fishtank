# Habitat cloud (Cloudflare Worker, free tier)

One tiny worker, two jobs:

1. **Cloud saves** — the game auto-syncs each tank to `/save/<sync-code>`;
   any device that enters the code pulls the same tank. No accounts, no files.
2. **Push nudges** — "🐟 Feeding time!" notifications reach a **closed**
   iPhone/Android app. Privacy-friendly: pushes carry no data — the phone's
   service worker reads the local save and picks the message itself. The
   server only knows "this device hasn't opened the app in 20+ hours."

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

In `src/cloud.js` (cloud saves):

```js
export const CLOUD = { serverUrl: 'https://habitat-push.YOURNAME.workers.dev' };
```

In `src/notify.js` (push nudges):

```js
export const PUSH = {
  serverUrl: 'https://habitat-push.YOURNAME.workers.dev',
  vapidPublicKey: '<the public key from gen-vapid.mjs>',
};
```

Rebuild (`node build.mjs`), commit, push. Cloud sync then activates on every
device automatically (sync code appears in Care); reminders turn on via
Care → 🔔 Reminders.

Note: cloud saves only need the KV namespace — if you skip the VAPID secrets,
saves work and only push nudges stay off.

## Behavior

- Cron runs every 6h; pushes only to devices absent >20h, max one nudge per 20h.
- Dead subscriptions (uninstalled app) are cleaned up automatically on 404/410.
- iPhone requires: iOS 16.4+, app installed to the Home Screen, reminders
  enabled from a tap (Apple rules).

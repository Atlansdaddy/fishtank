// Notifications & app badge.
// Tier 1 (no server): app-icon badge when the tank needs care, notifications
// for events while the app is open in a background tab, and periodic
// background sync on Android/Chrome (the SW nudges "feeding time!" even with
// the app closed). Tier 2 (push server, see push-server/): true remote pushes
// on iPhone — wire PUSH below when the worker is deployed.

import { store } from './store.js';

export const PUSH = {
  serverUrl: null,        // e.g. 'https://habitat-push.<you>.workers.dev'
  vapidPublicKey: null,   // base64url public key from the worker setup
};

export class Notify {
  constructor(sim) {
    this.sim = sim;
    this.enabled = store.get('habitat_notif') === 'on';
  }
  get supported() { return 'Notification' in window && 'serviceWorker' in navigator; }
  get granted() { return this.supported && Notification.permission === 'granted'; }

  async enable() {
    if (!this.supported) return { ok: false, why: 'unsupported' };
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, why: 'denied' };
    this.enabled = true;
    store.set('habitat_notif', 'on');
    try {
      const reg = await navigator.serviceWorker.ready;
      // Android/Chrome: periodic background sync — SW checks the tank ~6-hourly
      if ('periodicSync' in reg) {
        try {
          const st = await navigator.permissions.query({ name: 'periodic-background-sync' });
          if (st.state === 'granted') await reg.periodicSync.register('care-check', { minInterval: 6 * 3600 * 1000 });
        } catch (e) {}
      }
      // Push server (when configured): subscribe + register with the server
      if (PUSH.serverUrl && PUSH.vapidPublicKey && 'pushManager' in reg) {
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: b64ToBytes(PUSH.vapidPublicKey),
        });
        await fetch(PUSH.serverUrl + '/subscribe', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sub: sub.toJSON() }),
        });
      }
    } catch (e) {}
    return { ok: true };
  }

  disable() {
    this.enabled = false;
    store.set('habitat_notif', 'off');
    navigator.serviceWorker?.ready.then((r) => {
      r.periodicSync?.unregister('care-check').catch(() => {});
      if (PUSH.serverUrl) r.pushManager?.getSubscription().then((s) => {
        if (s) { fetch(PUSH.serverUrl + '/unsubscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: s.endpoint }) }).catch(() => {}); s.unsubscribe(); }
      });
    }).catch(() => {});
  }

  // Event notification — only useful when the app is open but not visible
  // (background tab); closed-app delivery needs the push server.
  async event(title, body) {
    if (!this.enabled || !this.granted || document.visibilityState === 'visible') return;
    try {
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-180.png', tag: 'habitat-event' });
    } catch (e) {}
  }

  // Red badge on the app icon while something needs care; cleared when tended.
  updateBadge() {
    if (!('setAppBadge' in navigator)) return;
    const s = this.sim.summary();
    const needs = (s.hungriest > 0.7 ? 1 : 0) + (s.water < 0.4 ? 1 : 0) + (s.algae > 0.7 ? 1 : 0) + s.sick;
    if (needs > 0) navigator.setAppBadge(Math.min(needs, 9)).catch(() => {});
    else if (navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {});
  }
  // Tell the push server we played, so it only nudges after real absence.
  markSeen() {
    if (!this.enabled || !PUSH.serverUrl) return;
    navigator.serviceWorker?.ready.then((r) => r.pushManager?.getSubscription()).then((s) => {
      if (s) fetch(PUSH.serverUrl + '/seen', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: s.endpoint }) }).catch(() => {});
    }).catch(() => {});
  }
}

function b64ToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

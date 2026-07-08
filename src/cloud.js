// Cloud sync — Animal Crossing style: no accounts, no files. Every tank gets
// a sync code (shown in Care); the save auto-uploads every minute or so and on
// app close, and any device that enters the code pulls the same tank down.
// Dormant until CLOUD.serverUrl points at the deployed worker (push-server/).

export const CLOUD = {
  serverUrl: 'https://habitat-push.john-d70.workers.dev',
};

export class CloudSync {
  constructor(sim) { this.sim = sim; this._last = 0; this._dirty = false; }
  get enabled() { return !!CLOUD.serverUrl; }

  // The tank's sync code, minted once and stored in the save itself.
  get code() {
    if (!this.sim.state.syncCode) this.sim.state.syncCode = genCode();
    return this.sim.state.syncCode;
  }

  // Fetch a save from the cloud (own code, or one typed in from another device).
  async pull(codeOverride) {
    if (!this.enabled) return { ok: false, why: 'disabled' };
    const code = (codeOverride || this.code).toLowerCase().trim();
    try {
      const r = await fetch(`${CLOUD.serverUrl}/save/${encodeURIComponent(code)}`);
      if (!r.ok) return { ok: false, why: 'notfound' };
      const state = await r.json();
      if (!state || !state.tanks) return { ok: false, why: 'invalid' };
      return { ok: true, state };
    } catch (e) { return { ok: false, why: 'network' }; }
  }

  // Upload now; resolves {ok, why} and records status for the Care panel.
  async pushNow(unload) {
    if (!this.enabled) return { ok: false, why: 'disabled' };
    try {
      const r = await fetch(`${CLOUD.serverUrl}/save/${encodeURIComponent(this.code)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(this.sim.state),
        keepalive: !!unload,                // survives page close
      });
      if (r.ok) { this.okAt = Date.now(); this.err = null; return { ok: true }; }
      this.err = 'server ' + r.status;
      return { ok: false, why: this.err };
    } catch (e) {
      this._dirty = true; this.err = 'no connection';
      return { ok: false, why: this.err };
    }
  }

  // Throttled upload (~1/min) unless forced (app close).
  push(force) {
    if (!this.enabled) return;
    const now = Date.now();
    if (!force && now - this._last < 60000) { this._dirty = true; return; }
    this._last = now; this._dirty = false;
    this.pushNow(force === 'unload');
  }
  tick() { if (this._dirty) this.push(true); }

  // Human status line for the Care panel.
  status() {
    if (!this.enabled) return '';
    if (this.okAt) {
      const m = Math.round((Date.now() - this.okAt) / 60000);
      return `✓ saved to cloud ${m < 1 ? 'just now' : m + ' min ago'}`;
    }
    return this.err ? `⚠️ cloud not reached (${this.err})` : '… not saved to cloud yet';
  }
}

function genCode() {
  const words = ['reef', 'coral', 'fish', 'wave', 'shell', 'pearl', 'kelp', 'tide', 'fin', 'bubble'];
  // tail alphabet avoids look-alikes (no 0/o, 1/l/i) — codes get read aloud
  // off one screen and typed on another
  const AB = 'abcdefghjkmnpqrstuvwxyz23456789';
  const a = new Uint32Array(8);
  crypto.getRandomValues(a);
  let tail = '';
  for (let i = 0; i < 6; i++) tail += AB[a[i + 2] % AB.length];
  return `${words[a[0] % 10]}-${words[a[1] % 10]}-${tail}`;
}

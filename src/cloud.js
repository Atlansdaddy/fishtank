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

  // Upload the current save, throttled to ~1/min unless forced (app close).
  push(force) {
    if (!this.enabled) return;
    const now = Date.now();
    if (!force && now - this._last < 60000) { this._dirty = true; return; }
    this._last = now; this._dirty = false;
    fetch(`${CLOUD.serverUrl}/save/${encodeURIComponent(this.code)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(this.sim.state),
      keepalive: force === 'unload',        // survives page close
    }).catch(() => { this._dirty = true; });
  }
  tick() { if (this._dirty) this.push(true); }
}

function genCode() {
  const words = ['reef', 'coral', 'fish', 'wave', 'shell', 'pearl', 'kelp', 'tide', 'fin', 'bubble'];
  const a = new Uint32Array(3);
  crypto.getRandomValues(a);
  const tail = (a[2] % 36 ** 6).toString(36).padStart(6, '0');
  return `${words[a[0] % 10]}-${words[a[1] % 10]}-${tail}`;
}

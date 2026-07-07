// Tiny WebAudio synth — every sound is generated, no assets, fully offline.
// Underwater room tone (filtered brown noise) + occasional bubble blips, plus
// one-shot effects for feeding, tapping a fish, and buying. Mobile browsers
// require a user gesture before audio: call unlock() from any pointerdown.

export class Sound {
  constructor() {
    this.enabled = localStorage.getItem('fishtank_sound') !== 'off';
    this.ctx = null;
    this.master = null;
  }

  _ensure() {
    if (this.ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 1 : 0;
      this.master.connect(this.ctx.destination);
      this._startAmbience();
    } catch (e) { return false; }
    return true;
  }

  unlock() {
    if (!this._ensure()) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('fishtank_sound', this.enabled ? 'on' : 'off');
    if (this.ctx) this.master.gain.linearRampToValueAtTime(this.enabled ? 1 : 0, this.ctx.currentTime + 0.25);
    return this.enabled;
  }

  _ok() { return this.ctx && this.enabled && this.ctx.state === 'running'; }

  _env(g, t0, attack, peak, dur) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }

  _startAmbience() {
    const ctx = this.ctx;
    // brown noise through a deep lowpass = the hum of water + filter
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240;
    const g = ctx.createGain(); g.gain.value = 0.045;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13;
    const lg = ctx.createGain(); lg.gain.value = 0.018;
    lfo.connect(lg); lg.connect(g.gain); lfo.start();
    src.connect(lp); lp.connect(g); g.connect(this.master); src.start();
    // random little bubble blips, like the airstone
    const blip = () => {
      if (this._ok()) this._bubble(0.015 + Math.random() * 0.03);
      setTimeout(blip, 1500 + Math.random() * 6000);
    };
    setTimeout(blip, 2500);
  }

  _bubble(vol = 0.04) {
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(280 + Math.random() * 320, t);
    o.frequency.exponentialRampToValueAtTime(900 + Math.random() * 700, t + 0.09);
    const g = ctx.createGain(); this._env(g, t, 0.012, vol, 0.13);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.16);
  }

  // food hits the water: soft bloop + a couple of bubbles
  drop() {
    if (!this._ok()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(520, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.16);
    const g = ctx.createGain(); this._env(g, t, 0.008, 0.2, 0.24);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.26);
    for (let i = 0; i < 3; i++) setTimeout(() => this._ok() && this._bubble(0.045), 130 + i * 90);
  }

  // tapped a fish: gentle two-note chime
  chime() {
    if (!this._ok()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [f, dt, v] of [[740, 0, 0.09], [1108, 0.07, 0.06]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); this._env(g, t + dt, 0.012, v, 0.5);
      o.connect(g); g.connect(this.master); o.start(t + dt); o.stop(t + dt + 0.55);
    }
  }

  // bought a fish: bright little arpeggio
  coin() {
    if (!this._ok()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [660, 880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = ctx.createGain(); this._env(g, t + i * 0.06, 0.01, 0.07, 0.3);
      o.connect(g); g.connect(this.master); o.start(t + i * 0.06); o.stop(t + i * 0.06 + 0.34);
    });
  }

  // something sad happened (a fish died)
  sad() {
    if (!this._ok()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [f, dt] of [[392, 0], [311, 0.25]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); this._env(g, t + dt, 0.02, 0.06, 0.7);
      o.connect(g); g.connect(this.master); o.start(t + dt); o.stop(t + dt + 0.75);
    }
  }
}

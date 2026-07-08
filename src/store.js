// Storage that never throws. Safari with "Block All Cookies" enabled throws
// SecurityError on ANY localStorage access — even reads — which killed the
// whole game at boot on locked-down iPhones. Every touch goes through here;
// when real storage is blocked we fall back to in-memory for the session.

const mem = new Map();

export const store = {
  ok: (() => {
    try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; }
    catch (e) { return false; }
  })(),
  get(k) {
    try { return localStorage.getItem(k); } catch (e) { return mem.has(k) ? mem.get(k) : null; }
  },
  set(k, v) {
    try { localStorage.setItem(k, v); } catch (e) { mem.set(k, v); }
  },
};

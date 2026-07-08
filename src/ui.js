import { FOODS } from './constants.js';
import { evaluateAdd } from './rules.js';

// All DOM/overlay UI. Kept deliberately minimal and translucent so it never
// blocks the view of the tank. Big touch targets for small hands.

const CSS = `
:root{--glass:rgba(12,22,28,.62);--glass2:rgba(20,34,42,.82);--edge:rgba(255,255,255,.14);
--txt:#eaf6f2;--accent:#5fd0b0;--warn:#ffcf5a;--bad:#ff6b5a;--good:#7be08a;}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
#ui{position:fixed;inset:0;pointer-events:none;font-family:-apple-system,system-ui,'Segoe UI',Roboto,sans-serif;color:var(--txt);z-index:10;user-select:none}
#ui button{font-family:inherit}
.hud{position:absolute;top:calc(env(safe-area-inset-top,0) + 10px);left:10px;right:10px;display:flex;gap:8px;align-items:center;pointer-events:none;flex-wrap:wrap}
.pill{pointer-events:auto;background:var(--glass);backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);border:1px solid var(--edge);border-radius:999px;padding:6px 12px;font-size:13px;display:flex;align-items:center;gap:6px;font-weight:600}
.pill .bar{width:44px;height:6px;border-radius:3px;background:rgba(255,255,255,.15);overflow:hidden}
.pill .bar>i{display:block;height:100%;border-radius:3px;transition:width .4s,background .4s}
.tankname{font-weight:800;letter-spacing:.3px}
.coins{margin-left:auto}
.toolbar{position:absolute;left:0;right:0;bottom:calc(env(safe-area-inset-bottom,0) + 12px);display:flex;justify-content:center;align-items:flex-start;gap:8px;pointer-events:none}
.toolwrap{pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:5px}
.tool{pointer-events:auto;width:52px;height:52px;border-radius:50%;border:1px solid var(--edge);background:var(--glass);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);font-size:24px;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(0,0,0,.35);transition:transform .12s;color:var(--txt)}
.tool:active{transform:scale(.9)}
.tool-cap{font-size:11px;font-weight:700;opacity:.92;pointer-events:none;text-shadow:0 1px 3px rgba(0,0,0,.7)}
.panel{position:absolute;left:0;right:0;bottom:0;max-height:74%;background:var(--glass2);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-top:1px solid var(--edge);border-radius:22px 22px 0 0;transform:translateY(110%);transition:transform .28s cubic-bezier(.2,.8,.2,1);pointer-events:auto;padding:14px 14px calc(env(safe-area-inset-bottom,0) + 18px);overflow:hidden;display:flex;flex-direction:column}
.panel.open{transform:translateY(0)}
.panel h2{margin:2px 0 10px;font-size:18px;display:flex;align-items:center;gap:8px}
.panel .close{margin-left:auto;background:none;border:none;color:var(--txt);font-size:22px;opacity:.7;pointer-events:auto}
.grip{width:40px;height:4px;border-radius:2px;background:rgba(255,255,255,.25);margin:0 auto 8px}
.foodrow{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.foodbtn{pointer-events:auto;flex:1;min-width:70px;max-width:110px;background:rgba(255,255,255,.06);border:1px solid var(--edge);border-radius:16px;padding:12px 8px;text-align:center;color:var(--txt)}
.foodbtn .e{font-size:30px}.foodbtn .n{font-size:12px;font-weight:700;margin-top:4px}.foodbtn .b{font-size:10px;opacity:.7;margin-top:3px;line-height:1.2}
.foodbtn:active{transform:scale(.94)}
.catalog{overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;padding:2px}
.card{background:rgba(255,255,255,.05);border:1px solid var(--edge);border-radius:14px;padding:8px;display:flex;flex-direction:column;gap:4px}
.card .sw{height:34px;border-radius:8px;margin-bottom:2px}
.card .sw.q{display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;opacity:.6;background:rgba(255,255,255,.06)!important}
.bookbar{display:flex;align-items:center;gap:10px;margin-bottom:8px;font-size:13px;font-weight:700}
.bookbar .track{flex:1;height:8px;border-radius:4px;background:rgba(255,255,255,.12);overflow:hidden}
.bookbar .track>i{display:block;height:100%;background:var(--accent);border-radius:4px;transition:width .4s}
.card .cn{font-weight:700;font-size:13px}
.card .cs{font-size:10px;font-style:italic;opacity:.65}
.card .meta{font-size:10px;opacity:.75;display:flex;flex-wrap:wrap;gap:4px}
.card .tag{background:rgba(255,255,255,.1);border-radius:6px;padding:1px 5px}
.card button{margin-top:auto;background:var(--accent);border:none;color:#05201a;font-weight:800;border-radius:10px;padding:7px;font-size:13px}
.card button:disabled{background:rgba(255,255,255,.12);color:rgba(255,255,255,.4)}
.filterbar{display:flex;gap:6px;margin-bottom:8px;overflow-x:auto;padding-bottom:4px}
.chip{white-space:nowrap;background:rgba(255,255,255,.07);border:1px solid var(--edge);border-radius:999px;padding:6px 12px;font-size:12px;font-weight:600;color:var(--txt)}
.chip.on{background:var(--accent);color:#05201a}
.cardback{position:absolute;inset:0;background:rgba(0,0,0,.45);opacity:0;pointer-events:none;transition:opacity .2s;z-index:19}
.cardback.show{opacity:1;pointer-events:auto}
.fishcard{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(.9);width:min(340px,90vw);background:var(--glass2);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid var(--edge);border-radius:20px;padding:16px;pointer-events:none;opacity:0;transition:opacity .2s,transform .2s;box-shadow:0 20px 60px rgba(0,0,0,.5);z-index:20}
.fishcard.show{opacity:1;transform:translate(-50%,-50%) scale(1);pointer-events:auto}
.fishcard .hero{height:70px;border-radius:14px;margin-bottom:10px;position:relative;overflow:hidden}
.fishcard .nm{font-size:20px;font-weight:800}
.fishcard .sci{font-style:italic;opacity:.7;font-size:12px;margin-bottom:8px}
.fishcard .hab{font-size:13px;opacity:.9;margin:8px 0;line-height:1.35}
.fishcard .facts{list-style:none;padding:0;margin:6px 0}
.fishcard .facts li{font-size:13px;line-height:1.4;padding:5px 0 5px 22px;position:relative}
.fishcard .facts li:before{content:'🐟';position:absolute;left:0}
.fishcard .name-in{display:flex;gap:6px;margin-top:10px}
.fishcard .name-in input{flex:1;background:rgba(255,255,255,.08);border:1px solid var(--edge);border-radius:10px;padding:8px;color:var(--txt);font-size:14px}
.fishcard .name-in button{background:var(--accent);border:none;color:#05201a;font-weight:800;border-radius:10px;padding:8px 12px}
.fishcard .x{position:absolute;top:6px;right:6px;width:40px;height:40px;background:rgba(0,0,0,.35);border:1px solid var(--edge);border-radius:50%;color:var(--txt);font-size:22px;line-height:1;opacity:.9;display:flex;align-items:center;justify-content:center;z-index:2}
.fishcard .x:active{transform:scale(.9)}
.fishcard .stat{display:flex;gap:10px;font-size:11px;margin-top:6px;opacity:.85;flex-wrap:wrap}
.msgs{margin:4px 0 10px;font-size:12px;line-height:1.4}
.msgs .blk{color:var(--bad);margin:3px 0}
.msgs .wrn{color:var(--warn);margin:3px 0}
.care-actions{display:flex;gap:10px;margin-bottom:12px}
.care-actions button{flex:1;pointer-events:auto;background:rgba(255,255,255,.07);border:1px solid var(--edge);border-radius:14px;padding:14px 8px;color:var(--txt);font-weight:700;font-size:13px}
.care-actions button .e{font-size:26px;display:block;margin-bottom:4px}
.meter{margin:8px 0}
.meter .lab{display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px}
.meter .track{height:9px;border-radius:5px;background:rgba(255,255,255,.12);overflow:hidden}
.meter .track>i{display:block;height:100%;transition:width .5s,background .5s}
.toast{position:absolute;left:50%;top:64px;transform:translateX(-50%);background:var(--glass2);border:1px solid var(--edge);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-radius:14px;padding:10px 16px;font-size:14px;font-weight:600;pointer-events:none;opacity:0;transition:opacity .3s,transform .3s;max-width:88vw;text-align:center}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
.hint{position:absolute;left:50%;bottom:92px;transform:translateX(-50%);font-size:12px;opacity:.6;pointer-events:none;text-align:center;width:90%}
`;

function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function barColor(v, invert) { const x = invert ? 1 - v : v; return x > 0.6 ? 'var(--good)' : x > 0.3 ? 'var(--warn)' : 'var(--bad)'; }

export class UI {
  constructor(opts) {
    this.o = opts;
    const style = el('style'); style.textContent = CSS; document.head.appendChild(style);
    const root = el('div'); root.id = 'ui'; document.body.appendChild(root); this.root = root;
    this._buildHUD(); this._buildToolbar(); this._buildPanels(); this._buildFishCard();
    this.toastEl = el('div', 'toast'); root.appendChild(this.toastEl);
    this.hint = el('div', 'hint', 'Tap a fish to follow it • Pinch to zoom • 🔭 sees the whole tank'); root.appendChild(this.hint);
    setTimeout(() => { this.hint.style.opacity = 0; }, 9000);
    this.shopFilter = 'all';
  }

  _buildHUD() {
    const h = el('div', 'hud');
    this.tankPill = el('div', 'pill'); this.tankPill.innerHTML = `<span class="tankname">🌿 Freshwater</span>`;
    this.waterPill = el('div', 'pill'); this.waterPill.innerHTML = `💧<div class="bar"><i></i></div>`;
    this.algaePill = el('div', 'pill'); this.algaePill.innerHTML = `🟩<div class="bar"><i></i></div>`;
    this.healthPill = el('div', 'pill'); this.healthPill.innerHTML = `❤️<div class="bar"><i></i></div>`;
    this.loadPill = el('div', 'pill'); this.loadPill.innerHTML = `🐠 <span class="lv">0</span>`;
    this.coinPill = el('div', 'pill coins'); this.coinPill.innerHTML = `🪙 <span class="cv">0</span>`;
    this.soundPill = el('button', 'pill', this.o.soundOn === false ? '🔇' : '🔊');
    this.soundPill.style.border = '1px solid var(--edge)';
    this.soundPill.onclick = () => {
      const on = this.o.onToggleSound && this.o.onToggleSound();
      this.soundPill.textContent = on ? '🔊' : '🔇';
    };
    h.append(this.tankPill, this.waterPill, this.algaePill, this.healthPill, this.loadPill, this.coinPill, this.soundPill);
    this.root.appendChild(h);
  }

  _buildToolbar() {
    const bar = el('div', 'toolbar');
    const mk = (emoji, label, fn) => {
      const w = el('div', 'toolwrap');
      const b = el('button', 'tool', emoji); b.onclick = fn;
      w.append(b, el('div', 'tool-cap', label)); bar.appendChild(w); return b;
    };
    mk('🔭', 'View', () => this.o.onFitView && this.o.onFitView());
    mk('🍽️', 'Feed', () => this.toggle('feed'));
    mk('📖', 'Book', () => { this.buildBook(); this.toggle('book'); });
    mk('🛒', 'Shop', () => { this.buildCatalog(); this.toggle('shop'); });
    mk('🧽', 'Care', () => { this.refreshCare(); this.toggle('care'); });
    mk('🔀', 'Tank', () => this.o.onSwitchTank());
    this.root.appendChild(bar);
  }

  _panel(id, title) {
    const p = el('div', 'panel'); p.dataset.id = id;
    const head = el('h2', null, title);
    const close = el('button', 'close', '✕'); close.onclick = () => this.toggle(id);
    head.appendChild(close);
    p.appendChild(el('div', 'grip')); p.appendChild(head);
    this.root.appendChild(p); return p;
  }

  _buildPanels() {
    // Feed
    this.feedPanel = this._panel('feed', '🍽️ Feeding Time');
    const row = el('div', 'foodrow');
    for (const [k, f] of Object.entries(FOODS)) {
      const b = el('button', 'foodbtn', `<div class="e">${f.emoji}</div><div class="n">${f.name}</div><div class="b">${f.blurb}</div>`);
      b.onclick = () => { this.o.onDropFood(k); this.flash(this.feedPanel); };
      row.appendChild(b);
    }
    this.feedPanel.appendChild(row);
    this.feedPanel.appendChild(el('div', 'hint', 'Different fish eat at different depths — try each food and watch!'));

    // Shop
    this.shopPanel = this._panel('shop', '🛒 Fish Shop');
    this.filterBar = el('div', 'filterbar');
    for (const [key, lab] of [['all','All'],['peaceful','Peaceful'],['schooling','Schoolers'],['bottom','Bottom'],['pred','Predators'],['invert','Inverts'],['cheap','Under 15🪙']]) {
      const c = el('button', 'chip' + (key === 'all' ? ' on' : ''), lab); c.dataset.k = key;
      c.onclick = () => { this.shopFilter = key; [...this.filterBar.children].forEach(x => x.classList.toggle('on', x === c)); this.buildCatalog(); };
      this.filterBar.appendChild(c);
    }
    this.shopPanel.appendChild(this.filterBar);
    this.catalog = el('div', 'catalog'); this.shopPanel.appendChild(this.catalog);

    // Fish Book — the collection: silhouettes until you've owned one
    this.bookPanel = this._panel('book', '📖 My Fish Book');
    this.bookTab = 'fresh';
    this.bookTabs = el('div', 'filterbar');
    for (const [key, lab] of [['fresh', '🌿 Freshwater'], ['salt', '🐚 Saltwater'], ['invert', '🐌 Inverts']]) {
      const c = el('button', 'chip' + (key === 'fresh' ? ' on' : ''), lab); c.dataset.k = key;
      c.onclick = () => { this.bookTab = key; [...this.bookTabs.children].forEach(x => x.classList.toggle('on', x === c)); this.buildBook(); };
      this.bookTabs.appendChild(c);
    }
    this.bookPanel.appendChild(this.bookTabs);
    this.bookBar = el('div', 'bookbar'); this.bookPanel.appendChild(this.bookBar);
    this.bookGrid = el('div', 'catalog'); this.bookPanel.appendChild(this.bookGrid);

    // Care
    this.carePanel = this._panel('care', '🧽 Tank Care');
    const actions = el('div', 'care-actions');
    const wc = el('button', null, `<span class="e">💧</span>Change Water`); wc.onclick = () => { this.o.onWaterChange(); this.refreshCare(); };
    const sc = el('button', null, `<span class="e">🧽</span>Scrub Glass`); sc.onclick = () => { this.o.onScrub(); this.refreshCare(); };
    actions.append(wc, sc);
    this.carePanel.appendChild(actions);
    this.careMeters = el('div'); this.carePanel.appendChild(this.careMeters);
    this.carePanel.appendChild(el('div', 'hint', 'Keep water blue and glass clear. Fed, happy fish earn you coins every day!'));
  }

  _buildFishCard() {
    this.cardBackdrop = el('div', 'cardback');
    this.cardBackdrop.onclick = () => this.hideFishCard();
    this.root.appendChild(this.cardBackdrop);
    this.fishCard = el('div', 'fishcard'); this.root.appendChild(this.fishCard);
  }

  toggle(id) {
    if (this.hint) this.hint.style.opacity = 0;
    const panels = { feed: this.feedPanel, shop: this.shopPanel, care: this.carePanel, book: this.bookPanel };
    const target = panels[id];
    const wasOpen = target.classList.contains('open');
    for (const p of Object.values(panels)) p.classList.remove('open');
    if (!wasOpen) target.classList.add('open');
  }
  closePanels() { for (const p of [this.feedPanel, this.shopPanel, this.carePanel, this.bookPanel]) p.classList.remove('open'); }

  buildBook() {
    const { allSpecies, sim } = this.o;
    const dis = new Set(sim.state.discovered || []);
    const tab = this.bookTab;
    const list = tab === 'invert'
      ? allSpecies.filter(s => (s.kind || 'fish') === 'invert')
      : allSpecies.filter(s => s.water === tab && (s.kind || 'fish') === 'fish');
    list.sort((a, b) => a.common.localeCompare(b.common));
    const found = list.filter(s => dis.has(s.id)).length;
    this.bookBar.innerHTML = `<span>${found} / ${list.length} discovered</span><div class="track"><i style="width:${Math.round(found / list.length * 100)}%"></i></div>`;
    this.bookGrid.innerHTML = '';
    for (const s of list) {
      const c = el('div', 'card');
      if (dis.has(s.id)) {
        const sw = el('div', 'sw');
        sw.style.background = `linear-gradient(120deg, ${s.colors.base}, ${s.colors.patternColor || s.colors.fin || s.colors.base})`;
        c.append(sw, el('div', 'cn', s.common), el('div', 'cs', s.scientific));
        c.style.cursor = 'pointer';
        c.onclick = () => this.showSpeciesFacts(s);
      } else {
        c.append(el('div', 'sw q', '?'), el('div', 'cn', '???'), el('div', 'cs', 'Not discovered yet'));
        c.style.opacity = 0.65;
      }
      this.bookGrid.appendChild(c);
    }
  }

  flash(p) { p.style.transform = 'translateY(4px)'; setTimeout(() => p.style.transform = '', 120); }

  buildCatalog() {
    const { allSpecies, sim, speciesMap } = this.o;
    const water = sim.state.current;
    let list = allSpecies.filter(s => s.water === water);
    const f = this.shopFilter;
    if (f === 'peaceful') list = list.filter(s => s.temperament === 'peaceful' && (s.kind||'fish') === 'fish');
    else if (f === 'schooling') list = list.filter(s => s.minSchool >= 4);
    else if (f === 'bottom') list = list.filter(s => s.zone === 'bottom' || s.zone === 'glass');
    else if (f === 'pred') list = list.filter(s => s.predator);
    else if (f === 'invert') list = list.filter(s => (s.kind) === 'invert');
    else if (f === 'cheap') list = list.filter(s => s.price < 15);
    list.sort((a, b) => a.price - b.price);

    this.catalog.innerHTML = '';
    for (const s of list) {
      const c = el('div', 'card');
      const sw = el('div', 'sw'); sw.style.background = `linear-gradient(120deg, ${s.colors.base}, ${s.colors.patternColor || s.colors.fin || s.colors.base})`;
      const tags = [];
      if (s.predator) tags.push('predator');
      if (s.minSchool >= 4) tags.push(`school ${s.minSchool}+`);
      if ((s.tags||[]).includes('soloOnly')) tags.push('solo');
      if ((s.tags||[]).includes('expertDiet')) tags.push('expert');
      if (s.kind === 'invert') tags.push('invert');
      c.append(sw,
        el('div', 'cn', s.common),
        el('div', 'cs', s.scientific),
        el('div', 'meta', `<span class="tag">${s.adultSizeCm}cm</span><span class="tag">${s.care}</span>` + tags.map(t => `<span class="tag">${t}</span>`).join('')));
      const buy = el('button', null, `Add • ${s.price}🪙`);
      buy.onclick = () => this._tryBuy(s);
      c.appendChild(buy);
      this.catalog.appendChild(c);
    }
    if (!list.length) this.catalog.appendChild(el('div', null, 'No fish match that filter.'));
  }

  _tryBuy(spec) {
    if (this.hint) this.hint.style.opacity = 0;
    const { sim, speciesMap } = this.o;
    const res = evaluateAdd(sim, spec, 1, speciesMap);
    // show a mini review card
    this.fishCard.innerHTML = '';
    const x = el('button', 'x', '✕'); x.onclick = () => this.hideFishCard(); this.fishCard.appendChild(x);
    const hero = el('div', 'hero'); hero.style.background = `linear-gradient(120deg, ${spec.colors.base}, ${spec.colors.patternColor || spec.colors.fin})`;
    this.fishCard.append(hero, el('div', 'nm', spec.common), el('div', 'sci', spec.scientific));
    const msgs = el('div', 'msgs');
    for (const b of res.block) msgs.appendChild(el('div', 'blk', '⛔ ' + b));
    for (const w of res.warn) msgs.appendChild(el('div', 'wrn', '⚠️ ' + w));
    if (!res.block.length && !res.warn.length) msgs.appendChild(el('div', null, '✅ A great fit for this tank!'));
    this.fishCard.appendChild(msgs);
    const act = el('div', 'name-in');
    if (res.block.length) {
      const ok = el('button', null, 'Got it'); ok.style.flex = '1'; ok.onclick = () => this.hideFishCard(); act.appendChild(ok);
    } else {
      const info = el('button', null, 'ℹ️'); info.onclick = () => this.showSpeciesFacts(spec);
      const add = el('button', null, `Add for ${res.cost}🪙`); add.style.flex = '1';
      add.onclick = () => { this.hideFishCard(); this.o.onBuy(spec, 1); };
      act.append(info, add);
    }
    this.fishCard.appendChild(act);
    this.fishCard.classList.add('show'); this.cardBackdrop.classList.add('show');
  }

  // Tap-to-identify an existing fish (record from sim + spec)
  showFishCard(record, spec) {
    if (this.hint) this.hint.style.opacity = 0;
    this.fishCard.innerHTML = '';
    const x = el('button', 'x', '✕'); x.onclick = () => this.hideFishCard(); this.fishCard.appendChild(x);
    const hero = el('div', 'hero'); hero.style.background = `linear-gradient(120deg, ${spec.colors.base}, ${spec.colors.patternColor || spec.colors.fin || spec.colors.base})`;
    this.fishCard.appendChild(hero);
    this.fishCard.appendChild(el('div', 'nm', record.name || spec.common));
    this.fishCard.appendChild(el('div', 'sci', `${spec.common} • ${spec.scientific}`));
    this.fishCard.appendChild(el('div', 'hab', '🌍 ' + spec.habitat));
    const ul = el('ul', 'facts'); for (const fct of spec.facts) ul.appendChild(el('li', null, fct));
    this.fishCard.appendChild(ul);
    const g = record.growth ?? 1;
    const stage = g >= 1 ? '🐟 Adult' : g > 0.65 ? `🐠 Growing ${Math.round(g*100)}%` : `🌱 Baby ${Math.round(g*100)}%`;
    const stat = el('div', 'stat',
      `<span>❤️ ${Math.round(record.health*100)}%</span><span>🍽️ ${record.hunger>0.6?'Hungry':record.hunger>0.3?'Peckish':'Full'}</span><span>${stage}</span><span>📏 grows to ${spec.adultSizeCm}cm</span><span>💛 ${spec.care} care</span>`);
    this.fishCard.appendChild(stat);
    const nin = el('div', 'name-in');
    const inp = el('input'); inp.placeholder = 'Name your fish…'; inp.value = record.name || '';
    const save = el('button', null, 'Name');
    save.onclick = () => { const v = inp.value.trim(); if (v) { this.o.onRename(record.id, v); this.fishCard.querySelector('.nm').textContent = v; this.toast(`Named "${v}" 🐠`); } };
    nin.append(inp, save); this.fishCard.appendChild(nin);
    this.fishCard.classList.add('show'); this.cardBackdrop.classList.add('show');
  }

  showSpeciesFacts(spec) { this.showFishCard({ name: spec.common, health: 1, hunger: 0, id: null }, spec); }
  hideFishCard() { this.fishCard.classList.remove('show'); this.cardBackdrop.classList.remove('show'); }

  refreshCare() {
    const s = this.o.sim.summary();
    const m = this.careMeters; m.innerHTML = '';
    const meter = (lab, v, invert) => {
      const d = el('div', 'meter');
      d.innerHTML = `<div class="lab"><span>${lab}</span><span>${Math.round((invert?1-v:v)*100)}%</span></div><div class="track"><i style="width:${Math.round((invert?1-v:v)*100)}%;background:${barColor(v,invert)}"></i></div>`;
      m.appendChild(d);
    };
    meter('💧 Water Quality', s.water, false);
    meter('🟩 Algae', s.algae, true);
    meter('❤️ Fish Health', s.avgHealth, false);
    const bd = el('div', 'meter');
    bd.innerHTML = `<div class="lab"><span>🐠 Stocking</span><span>${s.bioload}/${s.capacity}</span></div><div class="track"><i style="width:${Math.min(100,s.bioload/s.capacity*100)}%;background:${s.bioload>s.capacity*0.9?'var(--warn)':'var(--good)'}"></i></div>`;
    m.appendChild(bd);
  }

  refreshHUD() {
    const s = this.o.sim.summary();
    const set = (pill, v, invert) => { const i = pill.querySelector('.bar>i'); i.style.width = `${Math.round((invert?1-v:v)*100)}%`; i.style.background = barColor(v, invert); };
    set(this.waterPill, s.water, false);
    set(this.algaePill, s.algae, true);
    set(this.healthPill, s.avgHealth, false);
    this.loadPill.querySelector('.lv').textContent = `${s.count}`;
    this.coinPill.querySelector('.cv').textContent = s.coins;
    const fresh = this.o.sim.state.current === 'fresh';
    this.tankPill.querySelector('.tankname').textContent = fresh ? '🌿 Freshwater' : '🐚 Saltwater';
  }

  toast(msg, ms = 2600) {
    this.toastEl.textContent = msg; this.toastEl.classList.add('show');
    clearTimeout(this._tt); this._tt = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }
}

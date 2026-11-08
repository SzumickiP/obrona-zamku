'use strict';
(() => {
// =====================================================================
//  PODSTAWY
// =====================================================================
const W = 1280, H = 720;
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const wrap = document.getElementById('wrap');
let DPR = 1;
function resize() {
  const r = cv.getBoundingClientRect();
  DPR = Math.max(1, Math.min(2.5, (r.width * (window.devicePixelRatio || 1)) / W));
  cv.width = Math.round(W * DPR);
  cv.height = Math.round(H * DPR);
}
window.addEventListener('resize', resize);

let seed = 11;
const srnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const SR = (a, b) => a + srnd() * (b - a);
const R = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const hyp = Math.hypot;
const TAU = Math.PI * 2;

function ell(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, TAU); }
function circ(c, x, y, r) { c.beginPath(); c.arc(x, y, Math.max(0.01, r), 0, TAU); }
function line(c, x1, y1, x2, y2) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
function rgb(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
function shade(h, a) { const [r, g, b] = rgb(h); const f = v => clamp(Math.round(v + a), 0, 255); return `rgb(${f(r)},${f(g)},${f(b)})`; }

function steelG(c, x0, y0, x1, y1) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#f4f7f9'); g.addColorStop(0.3, '#c3cad0');
  g.addColorStop(0.65, '#7f878f'); g.addColorStop(1, '#40474e');
  return g;
}
function limb(c, x1, y1, x2, y2, w, col, hi) {
  c.strokeStyle = col; c.lineWidth = w; line(c, x1, y1, x2, y2);
  if (hi) { c.strokeStyle = hi; c.lineWidth = w * 0.32; line(c, x1 - w * 0.2, y1, x2 - w * 0.2, y2); }
}

// Faktura kamienia
function makeStone(base, mortar) {
  const p = document.createElement('canvas'); p.width = 96; p.height = 64;
  const c = p.getContext('2d');
  c.fillStyle = mortar; c.fillRect(0, 0, 96, 64);
  const rh = 8;
  for (let r = 0; r < 8; r++) {
    let x = (r % 2) ? -9 : 0;
    while (x < 96) {
      const w = SR(11, 20);
      const col = shade(base, SR(-20, 14));
      for (const ox of [0, 96, -96]) {
        const X = x + ox;
        if (X + w < 0 || X > 96) continue;
        c.fillStyle = col; c.fillRect(X + 0.7, r * rh + 0.7, w - 1.4, rh - 1.4);
        c.fillStyle = 'rgba(255,255,255,0.13)'; c.fillRect(X + 0.7, r * rh + 0.7, w - 1.4, 1.2);
        c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(X + 0.7, r * rh + rh - 2, w - 1.4, 1.3);
      }
      x += w;
    }
  }
  for (let i = 0; i < 260; i++) { c.fillStyle = `rgba(0,0,0,${SR(0.03, 0.12)})`; c.fillRect(SR(0, 96), SR(0, 64), 1, 1); }
  return c.createPattern(p, 'repeat');
}
const STONE = makeStone('#9b968b', '#5c5850');
const STONE_C = makeStone('#a39d90', '#625d54');
function pat(p, x, y) { if (p.setTransform) p.setTransform(new DOMMatrix([1, 0, 0, 1, x, y])); return p; }

// =====================================================================
//  ŚCIEŻKI (budowane dla bieżącej planszy)
// =====================================================================
function buildPath(ctrl) {
  const pts = [], cum = [0], norm = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    for (let s = 0; s < 24; s++) {
      const t = s / 24, t2 = t * t, t3 = t2 * t;
      const f = k => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      pts.push({ x: f(0), y: f(1) });
    }
  }
  const last = ctrl[ctrl.length - 1]; pts.push({ x: last[0], y: last[1] });
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hyp(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    norm.push({ x: -Math.sin(ang), y: Math.cos(ang) });
  }
  return { pts, cum, norm, len: cum[cum.length - 1] };
}
let PATHS = [], RIVER = null, LEVEL = null, LEVEL_I = 0;
function pathAt(d, P = PATHS[0]) {
  d = clamp(d, 0, P.len);
  const CUM = P.cum, PTS = P.pts;
  let lo = 0, hi = CUM.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (CUM[m] <= d) lo = m; else hi = m; }
  const a = PTS[lo], b = PTS[hi], seg = (CUM[hi] - CUM[lo]) || 1, t = (d - CUM[lo]) / seg;
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), ang: Math.atan2(b.y - a.y, b.x - a.x) };
}
function segDist(px, py, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy || 1;
  const t = clamp(((px - a.x) * dx + (py - a.y) * dy) / l, 0, 1);
  return hyp(px - a.x - dx * t, py - a.y - dy * t);
}
function distToLine(P, x, y) { let m = 1e9; for (let i = 0; i < P.pts.length - 1; i++) m = Math.min(m, segDist(x, y, P.pts[i], P.pts[i + 1])); return m; }
function distToPath(x, y) { let m = 1e9; for (const P of PATHS) m = Math.min(m, distToLine(P, x, y)); return m; }
function distToRiver(x, y) { return RIVER ? distToLine(RIVER, x, y) : 1e9; }

// Miejsca pod wieże wzdłuż dróg
const SLOTS = [];
function buildSlots() {
  SLOTS.length = 0;
  for (const P of PATHS) {
    for (let d = 120; d < P.len - 160; d += 50) {
      const p = pathAt(d, P), nx = -Math.sin(p.ang), ny = Math.cos(p.ang);
      for (const side of [1, -1]) {
        const x = p.x + nx * side * 74, y = p.y + ny * side * 74;
        if (x < 295 || x > 1235 || y < 95 || y > 690) continue;
        if (distToPath(x, y) < 64 || distToRiver(x, y) < 52) continue;
        if (SLOTS.some(s => hyp(s.x - x, s.y - y) < 88)) continue;
        SLOTS.push({ x, y, tower: null });
      }
    }
  }
}

// =====================================================================
//  DEFINICJE
// =====================================================================
const ET = {
  squire:  { name: 'Giermek',        hp: 55,   armor: 0, speed: 50, gold: 6,   dmg: 1,  scale: 0.95, kind: 'foot',  fig: 'squire',  h: 36 },
  footman: { name: 'Rycerz pieszy',  hp: 150,  armor: 3, speed: 40, gold: 10,  dmg: 1,  scale: 1.0,  kind: 'foot',  fig: 'footman', h: 38 },
  horse:   { name: 'Rycerz konny',   hp: 230,  armor: 4, speed: 76, gold: 16,  dmg: 2,  scale: 1.0,  kind: 'horse', fig: 'rider',   h: 60 },
  heavy:   { name: 'Ciężkozbrojny',  hp: 520,  armor: 9, speed: 27, gold: 24,  dmg: 3,  scale: 1.12, kind: 'foot',  fig: 'heavy',   h: 40 },
  lord:    { name: 'Czarny Lord',    hp: 3200, armor: 8, speed: 30, gold: 150, dmg: 10, scale: 1.3,  kind: 'horse', fig: 'lord',    h: 62 },
  ram:     { name: 'Taran',          hp: 950,  armor: 6, speed: 21, gold: 35,  dmg: 5,  scale: 1.0,  kind: 'ram',   fig: null,      h: 42 },
};

const TT = {
  archer:   { name: 'Wieża łuczników', desc: 'Szybkie strzały. Słabe na ciężkie zbroje.', cost: [70, 65, 120], range: [150, 168, 188], rate: [0.85, 0.68, 0.52], dmg: [13, 20, 30], pierce: 0 },
  crossbow: { name: 'Wieża kuszników', desc: 'Ciężkie bełty przebijają pancerz.', cost: [110, 95, 160], range: [175, 190, 210], rate: [1.7, 1.45, 1.25], dmg: [44, 70, 105], pierce: 1 },
  catapult: { name: 'Katapulta', desc: 'Kamienie miażdżą całe grupy wrogów.', cost: [160, 135, 210], range: [240, 260, 285], rate: [3.2, 2.85, 2.5], dmg: [48, 78, 120], pierce: 0.5, splash: [55, 64, 74], minR: 70 },
  oil:      { name: 'Wrząca smoła', desc: 'Parzy i spowalnia wrogów przy drodze.', cost: [120, 100, 160], range: [95, 105, 118], rate: [2.4, 2.1, 1.8], dmg: [16, 26, 40], pierce: 1, splash: [46, 54, 62], slow: [0.55, 0.48, 0.4], burn: [7, 11, 16] },
};
const LV = ['I', 'II', 'III'];

const W1 = [
  [{ t: 'squire', n: 8, gap: 1.2 }],
  [{ t: 'squire', n: 12, gap: 0.9 }],
  [{ t: 'squire', n: 6, gap: 1.0 }, { t: 'footman', n: 4, gap: 1.7 }],
  [{ t: 'footman', n: 8, gap: 1.3 }, { t: 'squire', n: 8, gap: 0.6 }],
  [{ t: 'horse', n: 5, gap: 1.7 }, { t: 'squire', n: 10, gap: 0.7 }],
  [{ t: 'footman', n: 10, gap: 1.0 }, { t: 'horse', n: 4, gap: 1.4 }],
  [{ t: 'heavy', n: 3, gap: 2.6 }, { t: 'footman', n: 8, gap: 1.0 }],
  [{ t: 'horse', n: 10, gap: 1.0 }],
  [{ t: 'heavy', n: 6, gap: 2.0 }, { t: 'squire', n: 16, gap: 0.4 }],
  [{ t: 'footman', n: 14, gap: 0.7 }, { t: 'horse', n: 8, gap: 1.0 }],
  [{ t: 'heavy', n: 8, gap: 1.6 }, { t: 'horse', n: 8, gap: 1.0 }],
  [{ t: 'horse', n: 6, gap: 1.0 }, { t: 'lord', n: 1, gap: 3 }, { t: 'heavy', n: 6, gap: 1.8 }, { t: 'horse', n: 10, gap: 0.9 }],
];
const W2 = [
  [{ t: 'squire', n: 10, gap: 1.0 }],
  [{ t: 'squire', n: 8, gap: 0.8, p: 0 }, { t: 'footman', n: 4, gap: 1.5, p: 1 }],
  [{ t: 'footman', n: 8, gap: 1.1 }],
  [{ t: 'horse', n: 6, gap: 1.3 }, { t: 'squire', n: 12, gap: 0.5 }],
  [{ t: 'footman', n: 10, gap: 0.9 }, { t: 'heavy', n: 2, gap: 3 }],
  [{ t: 'ram', n: 1, gap: 2, p: 0 }, { t: 'footman', n: 8, gap: 0.9 }],
  [{ t: 'horse', n: 12, gap: 0.8 }],
  [{ t: 'heavy', n: 5, gap: 2.0 }, { t: 'squire', n: 16, gap: 0.4 }],
  [{ t: 'ram', n: 2, gap: 6 }, { t: 'horse', n: 8, gap: 0.9 }],
  [{ t: 'footman', n: 16, gap: 0.6 }, { t: 'heavy', n: 4, gap: 1.8 }],
  [{ t: 'horse', n: 10, gap: 0.7 }, { t: 'ram', n: 2, gap: 4 }],
  [{ t: 'heavy', n: 10, gap: 1.3 }],
  [{ t: 'ram', n: 3, gap: 4 }, { t: 'horse', n: 14, gap: 0.6 }],
  [{ t: 'horse', n: 8, gap: 0.8 }, { t: 'lord', n: 1, gap: 3 }, { t: 'heavy', n: 8, gap: 1.4 }, { t: 'ram', n: 2, gap: 4 }],
];
const W3 = [
  [{ t: 'footman', n: 8, gap: 1.2 }],
  [{ t: 'squire', n: 16, gap: 0.6 }],
  [{ t: 'horse', n: 8, gap: 1.1 }],
  [{ t: 'heavy', n: 4, gap: 2.2 }, { t: 'footman', n: 8, gap: 0.9 }],
  [{ t: 'ram', n: 2, gap: 5 }, { t: 'squire', n: 14, gap: 0.5 }],
  [{ t: 'horse', n: 14, gap: 0.7 }],
  [{ t: 'heavy', n: 8, gap: 1.5 }],
  [{ t: 'footman', n: 18, gap: 0.5 }, { t: 'ram', n: 2, gap: 4 }],
  [{ t: 'horse', n: 12, gap: 0.6 }, { t: 'heavy', n: 6, gap: 1.4 }],
  [{ t: 'ram', n: 4, gap: 3.5 }, { t: 'footman', n: 12, gap: 0.6 }],
  [{ t: 'heavy', n: 12, gap: 1.1 }],
  [{ t: 'horse', n: 20, gap: 0.5 }],
  [{ t: 'lord', n: 1, gap: 4 }, { t: 'heavy', n: 8, gap: 1.2 }],
  [{ t: 'ram', n: 5, gap: 3 }, { t: 'horse', n: 14, gap: 0.6 }],
  [{ t: 'heavy', n: 8, gap: 1.2 }, { t: 'lord', n: 2, gap: 6 }, { t: 'horse', n: 16, gap: 0.5 }],
];
const GATE_APPROACH = [[310, 560], [255, 618], [190, 630], [128, 622]];
const LEVELS = [
  { name: 'Królewski Gościniec', desc: 'Jedna droga przez łąki. Wrogi lord wysyła pierwszych rycerzy.', theme: 'summer', gold: 300, hpMul: 1, waves: W1,
    paths: [[[1350, 150], [1160, 150], [1020, 195], [955, 330], [995, 470], [900, 600], [730, 605], [625, 485], [650, 320], [565, 190], [430, 185], [345, 300], [335, 450], ...GATE_APPROACH]] },
  { name: 'Stary Bród', desc: 'Dwie drogi i rzeka. Wrogowie nadciągają z dwóch stron, a z nimi pierwsze tarany.', theme: 'summer', gold: 380, hpMul: 1.12, waves: W2,
    river: [[835, -40], [810, 120], [845, 300], [800, 450], [825, 600], [795, 770]],
    paths: [
      [[1350, 110], [1160, 120], [1000, 190], [860, 250], [700, 240], [570, 160], [430, 190], [350, 310], [335, 450], ...GATE_APPROACH],
      [[1350, 560], [1190, 520], [1050, 590], [900, 650], [730, 655], [590, 590], [470, 640], [380, 665], [300, 642], [255, 624], [190, 630], [128, 622]],
    ] },
  { name: 'Zimowa Przełęcz', desc: 'Długa, kręta droga w śniegu. Tarany, ciężkozbrojni i dwóch Czarnych Lordów.', theme: 'winter', gold: 420, hpMul: 1.25, waves: W3,
    paths: [[[1350, 620], [1150, 640], [1000, 560], [1080, 420], [1180, 300], [1100, 170], [930, 130], [800, 220], [820, 380], [700, 470], [560, 420], [520, 280], [600, 150], [460, 110], [350, 200], [345, 350], [330, 470], ...GATE_APPROACH.slice(1)]] },
];
let WAVES = W1;

// Wygląd postaci
const FIG = {
  squire: { legCol: '#5d4834', legHi: '#80684c', legDark: '#3a2d20', boot: '#24190f', thigh: 3.5, shin: 3.0,
    body: 'gambeson', bodyCol: '#9c8256', tabard: '#7d1d1d', tabard2: '#1b1a1a', her: 'pale',
    helm: 'kettle', skin: '#d6a47e', hair: '#4a3020', beard: true, weapon: 'spear', armCol: '#9c8256', armDark: '#6d5a3b' },
  footman: { legCol: '#7f858b', legHi: '#b9bfc5', legDark: '#4b5056', boot: '#353a3f', thigh: 3.7, shin: 3.2, mail: true, knee: true,
    body: 'mail', tabard: '#8a1a1a', tabard2: '#e0c46c', her: 'cross', helm: 'great', weapon: 'sword', shield: true,
    armCol: '#7f858b', armDark: '#565b61' },
  heavy: { legCol: '#a9b1b8', legHi: '#eef2f4', legDark: '#5f676e', boot: '#59616a', thigh: 4.1, shin: 3.5, knee: true, plate: true,
    body: 'plate', tabard: null, helm: 'bascinet', plume: '#9c1515', weapon: 'poleaxe', armCol: '#a9b1b8', armDark: '#6b737a' },
  rider: { legCol: '#7f858b', legHi: '#b9bfc5', legDark: '#4b5056', boot: '#353a3f', thigh: 3.7, shin: 3.2, mail: true, knee: true,
    body: 'mail', tabard: '#8a1a1a', tabard2: '#e8dcc0', her: 'cross', helm: 'great', crest: '#c81e1e', weapon: 'lance', shield: true,
    armCol: '#7f858b', armDark: '#565b61',
    horse: { coat: '#5e3c22', coatHi: '#8a5a34', coatDk: '#3a2414', mane: '#1e140c', cap: '#8a1a1a', cap2: '#1c1a1a', trim: '#d4b257', lance: ['#8a1a1a', '#e8e0d0'] } },
  lord: { legCol: '#b0b8bf', legHi: '#f2f5f7', legDark: '#646c73', boot: '#5a6269', thigh: 4, shin: 3.4, knee: true, plate: true,
    body: 'plate', tabard: '#151515', tabard2: '#d9b44a', her: 'cross', helm: 'crown', plume: '#d9b44a', weapon: 'lance', shield: true,
    armCol: '#b0b8bf', armDark: '#6b737a',
    horse: { coat: '#e9e4da', coatHi: '#ffffff', coatDk: '#a49c90', mane: '#d8d1c4', cap: '#151515', cap2: '#d9b44a', trim: '#d9b44a', lance: ['#151515', '#d9b44a'], chanfron: true } },
  archer: { legCol: '#4f5a3c', legHi: '#6c7852', legDark: '#353d28', boot: '#2a1e14', thigh: 3.4, shin: 3.0,
    body: 'gambeson', bodyCol: '#7b6a4a', tabard: '#1f4d8a', tabard2: '#f0f0f0', her: 'cross', helm: 'kettle',
    skin: '#d9a982', hair: '#6b4a2a', weapon: 'bow', armCol: '#7b6a4a', armDark: '#5a4c34' },
  guard: { legCol: '#7f858b', legHi: '#b9bfc5', legDark: '#4b5056', boot: '#353a3f', thigh: 3.6, shin: 3.1, mail: true,
    body: 'mail', tabard: '#1f4d8a', tabard2: '#f0f0f0', her: 'cross', helm: 'kettle', skin: '#d9a982', hair: '#3b2a1a', beard: true,
    weapon: 'none', armCol: '#7f858b', armDark: '#565b61' },
};

// =====================================================================
//  RYSOWANIE POSTACI (lokalnie: stopy w (0,0), twarz w prawo)
// =====================================================================
function leg(c, f, hx, hy, a, bend, far) {
  const L = 7.6;
  const kx = hx + Math.sin(a) * L, ky = hy + Math.cos(a) * L;
  const b = a - bend;
  const fx = kx + Math.sin(b) * L, fy = ky + Math.cos(b) * L;
  const col = far ? f.legDark : f.legCol;
  limb(c, hx, hy, kx, ky, f.thigh, col, far ? null : f.legHi);
  limb(c, kx, ky, fx, fy, f.shin, col, far ? null : f.legHi);
  if (f.knee) { c.fillStyle = far ? f.legDark : '#dfe4e8'; circ(c, kx + 0.3, ky, f.thigh * 0.45); c.fill(); }
  c.strokeStyle = far ? '#1b1510' : f.boot; c.lineWidth = f.shin * 0.95;
  line(c, fx - 0.6, fy - 0.3, fx + 2.6, fy);
}

function armSeg(c, f, sx, sy, a1, a2, far) {
  const L1 = 5.8, L2 = 5.4;
  const ex = sx + Math.sin(a1) * L1, ey = sy + Math.cos(a1) * L1;
  const hx = ex + Math.sin(a2) * L2, hy = ey + Math.cos(a2) * L2;
  const col = far ? f.armDark : f.armCol;
  const hi = far ? null : (f.plate ? '#f2f5f7' : f.mail ? '#bfc5cb' : null);
  limb(c, sx, sy, ex, ey, 3.2, col, hi);
  limb(c, ex, ey, hx, hy, 2.8, col, hi);
  if (f.plate) { c.fillStyle = far ? f.armDark : '#d4dade'; circ(c, ex, ey, 1.5); c.fill(); }
  c.fillStyle = (f.plate || f.mail) ? (far ? '#50565c' : '#8f969c') : (f.skin || '#c99a74');
  circ(c, hx, hy, 1.4); c.fill();
  return { ex, ey, hx, hy };
}

function torsoPath(c, k) {
  c.beginPath();
  c.moveTo(-3.6 * k, -25.6);
  c.quadraticCurveTo(-4.8 * k, -20.5, -3.9 * k, -15);
  c.lineTo(-4.7 * k, -9.6); c.lineTo(4.9 * k, -9.6); c.lineTo(4.1 * k, -15);
  c.quadraticCurveTo(5.6 * k, -21, 4.3 * k, -25.9);
  c.quadraticCurveTo(0.4, -27.6, -3.6 * k, -25.6);
  c.closePath();
}

function torso(c, f) {
  torsoPath(c, 1);
  if (f.body === 'plate') {
    c.fillStyle = steelG(c, -5, -27, 6, -10); c.fill();
    c.save(); c.clip();
    c.strokeStyle = 'rgba(40,45,50,0.6)'; c.lineWidth = 0.5;
    for (const yy of [-14.2, -12.6, -11]) line(c, -5, yy, 6, yy);
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 0.6;
    c.beginPath(); c.moveTo(3.2, -25); c.quadraticCurveTo(4.6, -20, 3.2, -15.5); c.stroke();
    c.restore();
  } else if (f.body === 'mail') {
    c.fillStyle = f.armCol; c.fill();
    c.save(); c.clip();
    c.strokeStyle = 'rgba(255,255,255,0.28)'; c.lineWidth = 0.5; c.setLineDash([0.6, 0.8]);
    for (let yy = -27; yy < -9; yy += 1.1) line(c, -6, yy, 6, yy);
    c.restore();
  } else {
    c.fillStyle = f.bodyCol; c.fill();
    c.save(); c.clip();
    c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 0.45;
    for (let xx = -5; xx < 6; xx += 1.6) line(c, xx, -27, xx, -9);
    c.restore();
  }
  if (f.tabard) {
    c.beginPath();
    c.moveTo(-3.1, -25.1); c.quadraticCurveTo(-4.1, -20, -3.4, -15); c.lineTo(-4.3, -9.2);
    c.lineTo(4.5, -9.2); c.lineTo(3.7, -15); c.quadraticCurveTo(5.0, -21, 3.8, -25.4);
    c.quadraticCurveTo(0.4, -26.5, -3.1, -25.1); c.closePath();
    c.fillStyle = f.tabard; c.fill();
    c.save(); c.clip();
    if (f.her === 'cross') {
      c.strokeStyle = f.tabard2; c.lineWidth = 1.4;
      line(c, 0.6, -26, 0.6, -15.5); line(c, -3.8, -21.6, 4.6, -21.6);
    } else if (f.her === 'pale') {
      c.fillStyle = f.tabard2; c.fillRect(0.6, -27, 6, 19);
    }
    const g = c.createLinearGradient(-5, -26, 5, -9);
    g.addColorStop(0, 'rgba(255,255,255,0.2)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.38)');
    c.fillStyle = g; c.fillRect(-6, -28, 12, 20);
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 0.4;
    line(c, -1.5, -14.5, -2.2, -9.2); line(c, 2.4, -14.5, 3, -9.2);
    c.restore();
  } else if (f.body === 'plate') {
    // fartuch zbroi
  }
  c.strokeStyle = '#3a2615'; c.lineWidth = 1.1; line(c, -4, -15, 4.2, -15);
  c.fillStyle = '#d2ae55'; c.fillRect(2.6, -15.7, 1.3, 1.4);
}

function head(c, f, phase) {
  const hx = 1.4, hy = -31.2;
  c.fillStyle = (f.mail || f.plate) ? '#6f757b' : f.skin;
  c.fillRect(hx - 1.6, hy + 1.6, 3.2, 3);
  if (f.helm === 'kettle') {
    if (f.mail) { c.fillStyle = '#7a8086'; circ(c, hx - 0.2, hy + 0.9, 3.6); c.fill(); }
    c.fillStyle = f.skin;
    circ(c, hx + 0.3, hy + 0.2, 3.2); c.fill();
    c.beginPath(); c.moveTo(hx + 3.2, hy - 0.6); c.lineTo(hx + 4.3, hy + 1.2); c.lineTo(hx + 3.2, hy + 1.6); c.fill();
    if (!f.mail) { c.fillStyle = f.hair; c.beginPath(); c.arc(hx - 0.4, hy + 0.2, 3.1, Math.PI * 0.45, Math.PI * 1.35); c.fill(); }
    if (f.beard) { c.fillStyle = f.hair; c.beginPath(); c.moveTo(hx - 0.5, hy + 1.2); c.quadraticCurveTo(hx + 1.5, hy + 4.6, hx + 3.6, hy + 2.2); c.lineTo(hx + 2.2, hy + 1.6); c.closePath(); c.fill(); }
    c.fillStyle = shade(f.skin, -35); circ(c, hx - 0.3, hy + 0.6, 0.8); c.fill();
    c.fillStyle = '#1d140d'; circ(c, hx + 2.1, hy - 0.3, 0.45); c.fill();
    const g = steelG(c, hx - 6, hy - 6, hx + 6, hy);
    c.fillStyle = g;
    ell(c, hx, hy - 1.6, 6.2, 1.45); c.fill();
    c.beginPath(); c.arc(hx, hy - 1.9, 3.6, Math.PI, 0); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 0.35; ell(c, hx, hy - 1.6, 6.2, 1.45); c.stroke();
    return;
  }
  if (f.helm === 'bascinet') {
    c.fillStyle = '#7e848a'; c.beginPath();
    c.moveTo(hx - 3.6, hy + 0.5); c.quadraticCurveTo(hx - 3.4, hy + 4.8, hx + 0.5, hy + 4.4);
    c.lineTo(hx + 3.6, hy + 3); c.lineTo(hx + 3, hy); c.closePath(); c.fill();
    c.fillStyle = steelG(c, hx - 4, hy - 6, hx + 6, hy + 3);
    c.beginPath();
    c.moveTo(hx - 3.4, hy + 1.6);
    c.quadraticCurveTo(hx - 4.4, hy - 4.4, hx - 0.6, hy - 6.4);
    c.quadraticCurveTo(hx + 3.4, hy - 5.6, hx + 4.0, hy - 2.2);
    c.lineTo(hx + 7.4, hy + 0.5); c.lineTo(hx + 3.6, hy + 2.9); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(20,22,25,0.7)'; c.lineWidth = 0.35; c.stroke();
    c.strokeStyle = '#111'; c.lineWidth = 0.8; line(c, hx + 1.4, hy - 1.5, hx + 4.9, hy - 0.7);
    c.fillStyle = '#222'; circ(c, hx + 5.2, hy + 0.9, 0.3); c.fill(); circ(c, hx + 4.4, hy + 1.4, 0.3); c.fill();
  } else {
    c.fillStyle = steelG(c, hx - 4, hy - 6, hx + 5, hy + 4);
    c.beginPath();
    c.moveTo(hx - 3.2, hy + 3.6); c.lineTo(hx - 3.4, hy - 3);
    c.quadraticCurveTo(hx - 3.2, hy - 5.7, hx + 0.4, hy - 5.7);
    c.quadraticCurveTo(hx + 4.2, hy - 5.6, hx + 4.3, hy - 2.5);
    c.lineTo(hx + 4.6, hy + 3.2); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(20,22,25,0.7)'; c.lineWidth = 0.35; c.stroke();
    c.strokeStyle = '#0d0d0d'; c.lineWidth = 0.9; line(c, hx + 0.8, hy - 1.3, hx + 4.5, hy - 1.3);
    c.fillStyle = '#151515'; circ(c, hx + 3.5, hy + 1.2, 0.3); c.fill(); circ(c, hx + 3.6, hy + 2.3, 0.3); c.fill();
    c.strokeStyle = '#c9a54a'; c.lineWidth = 0.6; line(c, hx + 4.1, hy - 5.1, hx + 4.35, hy + 3);
    if (f.crest) {
      c.fillStyle = f.crest; c.beginPath();
      c.moveTo(hx - 1.8, hy - 5.5); c.quadraticCurveTo(hx - 1, hy - 10.5, hx + 3.2, hy - 9.4);
      c.quadraticCurveTo(hx + 1.6, hy - 7.5, hx + 2.6, hy - 5.6); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.3; c.stroke();
    }
    if (f.helm === 'crown') {
      const g = c.createLinearGradient(0, hy - 9, 0, hy - 5);
      g.addColorStop(0, '#fff2b0'); g.addColorStop(1, '#a87a1c');
      c.fillStyle = g; c.beginPath();
      c.moveTo(hx - 3.2, hy - 5.3);
      const pts = [[-2.6, -8.6], [-1.6, -6.4], [0.4, -9.2], [1.8, -6.4], [3.2, -8.6], [4.1, -5.3]];
      for (const [px, py] of pts) c.lineTo(hx + px, hy + py);
      c.closePath(); c.fill();
      c.fillStyle = '#c0182a'; circ(c, hx + 0.4, hy - 6.2, 0.6); c.fill();
    }
  }
  if (f.plume) {
    const w = Math.sin(phase * 1.3) * 0.8;
    c.fillStyle = f.plume; c.beginPath();
    c.moveTo(hx - 0.2, hy - 6);
    c.bezierCurveTo(hx - 3, hy - 10.5, hx - 8, hy - 9.5 + w, hx - 10.5, hy - 4 + w);
    c.bezierCurveTo(hx - 7, hy - 6.5, hx - 3, hy - 6.2, hx + 0.6, hy - 5);
    c.closePath(); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 0.3; c.stroke();
  }
}

function shieldShape(c, f, x, y) {
  c.save(); c.translate(x, y);
  c.beginPath();
  c.moveTo(-3.6, -5.5); c.lineTo(3.6, -5.5); c.lineTo(3.6, -0.5);
  c.quadraticCurveTo(3.4, 4.2, 0, 7); c.quadraticCurveTo(-3.4, 4.2, -3.6, -0.5); c.closePath();
  c.fillStyle = f.tabard || '#555'; c.fill();
  c.save(); c.clip();
  c.fillStyle = f.tabard2 || '#ddd';
  c.beginPath(); c.moveTo(-4, 3); c.lineTo(0, -1.5); c.lineTo(4, 3); c.lineTo(4, 5); c.lineTo(0, 0.6); c.lineTo(-4, 5); c.closePath(); c.fill();
  const g = c.createLinearGradient(-4, -6, 4, 7);
  g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
  c.fillStyle = g; c.fillRect(-5, -6, 10, 14);
  c.restore();
  c.strokeStyle = '#2a2622'; c.lineWidth = 0.7; c.stroke();
  c.restore();
}

function weapon(c, kind, hx, hy, rot, f) {
  c.save(); c.translate(hx, hy); c.rotate(rot);
  if (kind === 'sword') {
    c.strokeStyle = '#3a2615'; c.lineWidth = 1.1; line(c, 0, 2.2, 0, -0.5);
    c.fillStyle = '#b8913e'; circ(c, 0, 2.7, 0.9); c.fill();
    c.strokeStyle = '#8a8f94'; c.lineWidth = 1; line(c, -2.6, -0.8, 2.6, -0.8);
    const g = c.createLinearGradient(-1, 0, 1, 0);
    g.addColorStop(0, '#7d858c'); g.addColorStop(0.5, '#f4f6f8'); g.addColorStop(1, '#8f979e');
    c.fillStyle = g; c.beginPath();
    c.moveTo(-0.85, -1); c.lineTo(-0.6, -12.5); c.lineTo(0, -14.3); c.lineTo(0.6, -12.5); c.lineTo(0.85, -1); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(60,65,70,0.6)'; c.lineWidth = 0.25; line(c, 0, -1.5, 0, -11);
  } else if (kind === 'spear') {
    c.strokeStyle = '#6a4a2a'; c.lineWidth = 1.2; line(c, 0, 11, 0, -20);
    c.fillStyle = steelG(c, -1, -26, 1, -20); c.beginPath();
    c.moveTo(0, -27); c.quadraticCurveTo(1.6, -23, 0.5, -20); c.lineTo(-0.5, -20); c.quadraticCurveTo(-1.6, -23, 0, -27); c.fill();
  } else if (kind === 'poleaxe') {
    c.strokeStyle = '#5a3c20'; c.lineWidth = 1.3; line(c, 0, 11, 0, -17);
    c.fillStyle = steelG(c, -3, -20, 6, -10);
    c.beginPath(); c.moveTo(0.4, -11.5); c.lineTo(4.6, -10.6); c.quadraticCurveTo(6.2, -14.5, 4.8, -18.6); c.lineTo(0.4, -17); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(30,30,30,0.6)'; c.lineWidth = 0.3; c.stroke();
    c.fillStyle = '#7b838a'; c.fillRect(-3.2, -15.6, 3.2, 2);
    c.beginPath(); c.moveTo(-0.8, -17); c.lineTo(0, -22.5); c.lineTo(0.8, -17); c.fill();
  } else if (kind === 'lance') {
    const cols = f.horse.lance;
    c.lineWidth = 2.2;
    for (let i = 0; i < 10; i++) { c.strokeStyle = cols[i % 2]; line(c, 0, 13 - i * 4.8, 0, 13 - (i + 1) * 4.8); }
    c.fillStyle = steelG(c, -3, -6, 3, 0); c.beginPath(); c.moveTo(-3.2, 0); c.lineTo(0, -6); c.lineTo(3.2, 0); c.closePath(); c.fill();
    c.fillStyle = steelG(c, -1, -40, 1, -35); c.beginPath(); c.moveTo(-1.2, -35); c.lineTo(0, -40.5); c.lineTo(1.2, -35); c.fill();
    const w = Math.sin(S.time * 9 + hx) * 1.2;
    c.fillStyle = cols[0]; c.beginPath(); c.moveTo(-1, -34); c.lineTo(-1, -29.5); c.lineTo(-6.5 + w, -27.5); c.lineTo(-4.5, -31); c.lineTo(-7 + w, -33.5); c.closePath(); c.fill();
  }
  c.restore();
}

// Postać piesza
function drawFigure(c, name, phase, moving) {
  const f = FIG[name];
  c.lineCap = 'round'; c.lineJoin = 'round';
  const m = moving ? 1 : 0;
  const s = Math.sin(phase) * m, co = Math.cos(phase) * m;
  c.save(); c.translate(0, -Math.abs(co) * 0.8 * m);

  // ramię z bronią (dalsze)
  let back = null;
  if (f.weapon === 'sword') { back = armSeg(c, f, -0.5, -25, 0.35 + s * 0.15, 1.5, true); weapon(c, 'sword', back.hx, back.hy, 0.45 + s * 0.12, f); }
  else if (f.weapon === 'spear') { back = armSeg(c, f, -0.5, -25, 0.2 + s * 0.12, 1.3, true); weapon(c, 'spear', back.hx, back.hy, 0.18, f); }
  else if (f.weapon === 'poleaxe') { back = armSeg(c, f, -0.5, -25, 0.5, 1.9, true); weapon(c, 'poleaxe', back.hx, back.hy, 0.6, f); }
  else armSeg(c, f, -0.5, -25, -s * 0.35 + 0.05, -s * 0.35 + 0.3, true);

  leg(c, f, -0.6, -15, -s * 0.5, Math.max(0, -co) * 0.8 + 0.05, true);
  leg(c, f, 0.6, -15, s * 0.5, Math.max(0, co) * 0.8 + 0.05, false);
  torso(c, f);
  head(c, f, phase);

  if (f.shield) {
    armSeg(c, f, 1, -25, 0.4, 1.2, false);
    shieldShape(c, f, 5.4, -19.4);
  } else if (f.weapon === 'poleaxe' && back) {
    const px = back.hx + Math.sin(0.6) * 5, py = back.hy - Math.cos(0.6) * 5;
    limb(c, 1.2, -25, 3.6, -20.6, 3.2, f.armCol, '#f2f5f7');
    limb(c, 3.6, -20.6, px, py, 2.8, f.armCol, '#f2f5f7');
    c.fillStyle = '#8f969c'; circ(c, px, py, 1.4); c.fill();
  } else {
    armSeg(c, f, 1, -25, s * 0.4 + 0.05, s * 0.4 + 0.35, false);
  }
  c.restore();
}

// Łucznik na wieży
function drawArcherFig(c, aim, pull) {
  const f = FIG.archer;
  c.lineCap = 'round'; c.lineJoin = 'round';
  leg(c, f, -1.2, -15, -0.2, 0.05, true);
  leg(c, f, 1.2, -15, 0.22, 0.08, false);
  torso(c, f);
  head(c, f, 0);
  const sx = 1.2, sy = -24.5, dx = Math.cos(aim), dy = Math.sin(aim);
  const bx = sx + dx * 10, by = sy + dy * 10;
  const nk = 3 + pull * 7;
  const nx = bx - dx * nk, ny = by - dy * nk;
  const ex = sx - dx * 2.5, ey = sy - dy * 2.5 - 2;
  limb(c, -0.3, -25, ex, ey, 3, f.armDark); limb(c, ex, ey, nx, ny, 2.6, f.armDark);
  const px = -dy, py = dx, bend = 2.5 + pull * 1.5;
  const t1x = bx + px * 8 - dx * bend, t1y = by + py * 8 - dy * bend;
  const t2x = bx - px * 8 - dx * bend, t2y = by - py * 8 - dy * bend;
  c.strokeStyle = '#5a3a1c'; c.lineWidth = 1.3;
  c.beginPath(); c.moveTo(t1x, t1y); c.quadraticCurveTo(bx + dx * 3, by + dy * 3, t2x, t2y); c.stroke();
  c.strokeStyle = 'rgba(235,230,215,0.9)'; c.lineWidth = 0.4;
  c.beginPath(); c.moveTo(t1x, t1y); c.lineTo(nx, ny); c.lineTo(t2x, t2y); c.stroke();
  if (pull > 0.15) {
    c.strokeStyle = '#7a5a30'; c.lineWidth = 0.7; line(c, nx, ny, bx + dx * 3, by + dy * 3);
    c.fillStyle = '#9aa2a9'; circ(c, bx + dx * 3.4, by + dy * 3.4, 0.7); c.fill();
  }
  limb(c, sx, sy, bx, by, 2.9, f.armCol);
  c.fillStyle = f.skin; circ(c, bx, by, 1.3); c.fill();
}

// Koń
function drawHorse(c, h, phase) {
  c.lineCap = 'round'; c.lineJoin = 'round';
  const legs = [
    { x: 9.5, o: 0.7, front: 1, far: 1 }, { x: -9, o: 3.4, front: 0, far: 1 },
    { x: 11, o: 0, front: 1, far: 0 }, { x: -7.5, o: 2.7, front: 0, far: 0 }];
  for (const L of legs) {
    const a = Math.sin(phase + L.o) * 0.5;
    const lift = Math.max(0, Math.cos(phase + L.o));
    const hipY = -16.5, L1 = 8.3, L2 = 8.2;
    const kx = L.x + Math.sin(a) * L1, ky = hipY + Math.cos(a) * L1;
    const b = L.front ? a - lift * 1.25 : a - lift * 0.7 + 0.12;
    const fx = kx + Math.sin(b) * L2, fy = ky + Math.cos(b) * L2;
    const col = L.far ? h.coatDk : h.coat;
    limb(c, L.x, hipY - 2, kx, ky, L.front ? 3.6 : 4.3, col);
    limb(c, kx, ky, fx, fy, 2.2, col);
    c.fillStyle = '#17110c'; c.beginPath(); c.ellipse(fx + 0.6, fy - 0.2, 1.6, 1.0, 0, 0, TAU); c.fill();
  }
  const sw = Math.sin(phase * 2) * 1.5;
  c.strokeStyle = h.mane; c.lineWidth = 2.4;
  c.beginPath(); c.moveTo(-15, -25); c.quadraticCurveTo(-21, -23 + sw, -20.5, -12 + sw); c.stroke();
  const g = c.createLinearGradient(0, -31, 0, -13);
  g.addColorStop(0, h.coatHi); g.addColorStop(0.5, h.coat); g.addColorStop(1, h.coatDk);
  c.fillStyle = g;
  ell(c, -0.5, -22, 15, 7.2); c.fill();
  circ(c, -10, -23.2, 7.4); c.fill();
  circ(c, 9.8, -22.5, 6.8); c.fill();
  const nb = Math.sin(phase * 2) * 0.9;
  c.beginPath(); c.moveTo(6.5, -27); c.quadraticCurveTo(11.5, -37 + nb, 17, -40.5 + nb);
  c.lineTo(21, -37.5 + nb); c.quadraticCurveTo(17, -30, 15.5, -19); c.closePath(); c.fill();
  c.save(); c.translate(19.5, -37.8 + nb); c.rotate(0.78);
  c.fillStyle = g; ell(c, 3.8, 0, 6.4, 2.7); c.fill();
  c.fillStyle = shade(h.coatDk, -20); ell(c, 8.8, 0.3, 1.8, 2.1); c.fill();
  c.fillStyle = '#0c0805'; circ(c, 9.5, 1.1, 0.4); c.fill();
  c.fillStyle = g; c.beginPath(); c.moveTo(-1.5, -1.8); c.lineTo(-3.4, -4.6); c.lineTo(0.4, -2.2); c.fill();
  c.fillStyle = '#0c0805'; circ(c, 1.8, -1.1, 0.55); c.fill();
  if (h.chanfron) { c.fillStyle = steelG(c, 0, -3, 7, 2); c.beginPath(); c.moveTo(0, -2.4); c.lineTo(7.5, -1.6); c.lineTo(7.5, 0.4); c.lineTo(0, 0.6); c.closePath(); c.fill(); }
  c.strokeStyle = '#2a1a0e'; c.lineWidth = 0.5; line(c, 0, 1.5, 7.5, 1.8);
  c.restore();
  c.strokeStyle = h.mane; c.lineWidth = 1.8;
  c.beginPath(); c.moveTo(7, -28); c.quadraticCurveTo(11.5, -37.5 + nb, 17.2, -41 + nb); c.stroke();
  // kropierz (barding)
  c.beginPath();
  c.moveTo(-18, -14);
  c.quadraticCurveTo(-19.5, -26, -12, -30.8);
  c.quadraticCurveTo(0, -31.8, 10, -30.2);
  c.quadraticCurveTo(16.8, -28, 16.8, -21);
  c.lineTo(15.8, -13);
  for (let i = 1; i <= 8; i++) {
    const x = 15.8 - i * (33.8 / 8);
    const y = -12.6 + Math.sin(i * 1.7 + phase * 1.5) * 0.9;
    c.quadraticCurveTo(x + 2.1, y + 1.6, x, y);
  }
  c.closePath();
  c.fillStyle = h.cap; c.fill();
  c.save(); c.clip();
  c.fillStyle = h.cap2; c.fillRect(-20, -34, 19.5, 24);
  c.fillStyle = h.cap; c.beginPath(); c.moveTo(-5.5, -25); c.lineTo(4, -25); c.lineTo(4, -21); c.quadraticCurveTo(3.8, -16, -0.75, -13.5); c.quadraticCurveTo(-5.3, -16, -5.5, -21); c.closePath(); c.fill();
  c.strokeStyle = h.trim; c.lineWidth = 1.1; c.stroke();
  c.strokeStyle = h.cap2; c.lineWidth = 1.2; line(c, -0.75, -24.5, -0.75, -15); line(c, -4.8, -21.5, 3.3, -21.5);
  const gg = c.createLinearGradient(0, -32, 0, -12);
  gg.addColorStop(0, 'rgba(255,255,255,0.18)'); gg.addColorStop(0.6, 'rgba(0,0,0,0.05)'); gg.addColorStop(1, 'rgba(0,0,0,0.4)');
  c.fillStyle = gg; c.fillRect(-20, -34, 40, 24);
  c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 0.5;
  for (const fx of [-14, -9, 7, 12]) line(c, fx, -26, fx + Math.sin(phase + fx) * 0.8, -12);
  c.restore();
  c.strokeStyle = h.trim; c.lineWidth = 0.8;
  c.beginPath(); c.moveTo(15.8, -13);
  for (let i = 1; i <= 8; i++) { const x = 15.8 - i * (33.8 / 8); const y = -12.6 + Math.sin(i * 1.7 + phase * 1.5) * 0.9; c.quadraticCurveTo(x + 2.1, y + 1.6, x, y); }
  c.stroke();
  c.fillStyle = '#4a2e18'; c.beginPath(); c.moveTo(-7.5, -30.6); c.quadraticCurveTo(-8.2, -36, -5.5, -36.2); c.lineTo(-4.8, -30.8); c.closePath(); c.fill();
}

function drawRider(c, name, phase) {
  const f = FIG[name];
  drawHorse(c, f.horse, phase);
  const bob = -Math.abs(Math.sin(phase)) * 1.2;
  c.save(); c.translate(-1, -15 + bob);
  if (f.shield) { armSeg(c, f, -0.2, -25, 0.5, 1.3, true); shieldShape(c, f, 6, -20); }
  torso(c, f);
  limb(c, 0.6, -15, 6.2, -11, f.thigh, f.legCol, f.legHi);
  limb(c, 6.2, -11, 4.8, -4, f.shin, f.legCol, f.legHi);
  if (f.knee) { c.fillStyle = '#dfe4e8'; circ(c, 6.3, -11, f.thigh * 0.45); c.fill(); }
  c.strokeStyle = f.boot; c.lineWidth = f.shin; line(c, 4.6, -4, 7.6, -3.6);
  c.strokeStyle = '#8a8f94'; c.lineWidth = 0.5; c.beginPath(); c.arc(5.8, -3, 1.6, 0, Math.PI); c.stroke();
  head(c, f, phase);
  const a = armSeg(c, f, 0.6, -24.8, 0.75, 1.75, false);
  weapon(c, 'lance', a.hx, a.hy, Math.PI / 2 - 0.1, f);
  c.restore();
}

// =====================================================================
//  RYSOWANIE WIEŻ
// =====================================================================
function towerShadow(c, x, y, w) { c.fillStyle = 'rgba(0,0,0,0.3)'; ell(c, x + w * 0.35, y + 2, w * 0.85, w * 0.28); c.fill(); }

function roundBody(c, x, y, w, h, p) {
  const ry = w * 0.2;
  c.beginPath(); c.moveTo(x - w / 2, y - h); c.lineTo(x - w / 2, y);
  c.ellipse(x, y, w / 2, ry, 0, Math.PI, 0, true);
  c.lineTo(x + w / 2, y - h); c.closePath();
  c.fillStyle = pat(p || STONE, x, y); c.fill();
  const g = c.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  g.addColorStop(0, 'rgba(255,235,200,0.2)'); g.addColorStop(0.35, 'rgba(255,255,255,0.04)');
  g.addColorStop(0.72, 'rgba(0,0,0,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
  c.fillStyle = g; c.fill();
  const g2 = c.createLinearGradient(0, y - 12, 0, y + ry);
  g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,0.3)');
  c.fillStyle = g2; c.fill();
}
function machi(c, x, yt, w) {
  const ry = w * 0.2;
  c.strokeStyle = '#7a756b'; c.lineWidth = 4;
  c.beginPath(); c.ellipse(x, yt + 3, w / 2 + 1.5, ry + 1, 0, 0.05, Math.PI - 0.05); c.stroke();
  c.strokeStyle = '#2e2b27'; c.lineWidth = 1.6;
  for (let k = 1; k < 8; k++) {
    const a = k / 8 * Math.PI, px = x + Math.cos(a) * (w / 2 + 1.5), py = yt + 3 + Math.sin(a) * (ry + 1);
    line(c, px, py + 2.2, px, py + 4.5);
  }
}
function merlon(c, px, py, mw, mh, lit) {
  const v = Math.round(150 - lit * 38);
  c.fillStyle = `rgb(${v},${v - 4},${v - 12})`; c.fillRect(px - mw / 2, py - mh, mw, mh);
  c.fillStyle = `rgb(${v + 22},${v + 18},${v + 10})`; c.fillRect(px - mw / 2, py - mh, mw, 1.4);
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(px - mw / 2, py - 1, mw, 1);
}
function crenel(c, x, yt, w, front) {
  const rx = w / 2 + 2, ry = rx * 0.38, n = 10;
  if (!front) {
    ell(c, x, yt, rx, ry); c.fillStyle = '#8a857b'; c.fill();
    ell(c, x, yt + 0.5, rx - 3, ry - 1.5); c.fillStyle = '#4e4a43'; c.fill();
  }
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU + Math.PI / n;
    if ((Math.sin(a) > 0) !== front) continue;
    merlon(c, x + Math.cos(a) * rx, yt + Math.sin(a) * ry + (front ? 1 : 0), 5.6, 7, Math.cos(a));
  }
}
function slit(c, x, y, h) {
  c.fillStyle = '#16110c'; c.fillRect(x - 0.9, y - h / 2, 1.8, h);
  c.fillRect(x - 2.2, y - 0.8, 4.4, 1.6);
  c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(x - 1.8, y + h / 2, 3.6, 0.8);
}
function door(c, x, y, w, h) {
  c.fillStyle = '#2a1a0d'; c.beginPath(); c.moveTo(x - w / 2, y); c.lineTo(x - w / 2, y - h + w / 2);
  c.arc(x, y - h + w / 2, w / 2, Math.PI, 0); c.lineTo(x + w / 2, y); c.closePath(); c.fill();
  c.fillStyle = '#5b3b1e'; c.beginPath(); c.moveTo(x - w / 2 + 1, y); c.lineTo(x - w / 2 + 1, y - h + w / 2);
  c.arc(x, y - h + w / 2, w / 2 - 1, Math.PI, 0); c.lineTo(x + w / 2 - 1, y); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 0.5;
  for (let i = 1; i < 3; i++) line(c, x - w / 2 + 1 + i * (w - 2) / 3, y, x - w / 2 + 1 + i * (w - 2) / 3, y - h + 2);
  c.strokeStyle = '#2a2a2a'; c.lineWidth = 0.8; line(c, x - w / 2 + 1, y - h * 0.35, x + w / 2 - 1, y - h * 0.35);
}
function banner(c, x, y, w, h, seedv, col1, col2, gold) {
  const sw = Math.sin(S.time * 2 + seedv) * 0.8;
  c.fillStyle = '#2b1b0e'; c.fillRect(x - w / 2 - 1.5, y - 1, w + 3, 1.6);
  c.beginPath(); c.moveTo(x - w / 2, y); c.lineTo(x + w / 2, y); c.lineTo(x + w / 2 + sw, y + h);
  c.lineTo(x + sw * 0.5, y + h - 4); c.lineTo(x - w / 2 + sw, y + h); c.closePath();
  c.fillStyle = col1 || '#1f4d8a'; c.fill();
  c.save(); c.clip();
  c.strokeStyle = col2 || '#f0f0f0'; c.lineWidth = 1.6;
  line(c, x + sw * 0.3, y, x + sw * 0.6, y + h); line(c, x - w / 2, y + h * 0.38, x + w / 2, y + h * 0.38);
  const g = c.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.15)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
  c.fillStyle = g; c.fillRect(x - w, y, w * 2, h);
  c.restore();
  if (gold) { c.strokeStyle = '#e0bd5a'; c.lineWidth = 0.7; c.stroke(); }
}
function flag(c, x, y, len, col1, col2, ph) {
  c.strokeStyle = '#2a2018'; c.lineWidth = 1.2; line(c, x, y, x, y - len);
  c.fillStyle = '#c9a54a'; circ(c, x, y - len, 1.2); c.fill();
  const fw = len * 0.8, fh = len * 0.38, top = y - len + 1.5;
  c.beginPath(); c.moveTo(x, top);
  for (let i = 0; i <= 6; i++) { const t = i / 6; c.lineTo(x + t * fw, top + Math.sin(S.time * 5 + ph - t * 4) * 1.6 * t); }
  for (let i = 6; i >= 0; i--) { const t = i / 6; c.lineTo(x + t * fw, top + fh + Math.sin(S.time * 5 + ph - t * 4) * 1.6 * t - (i === 6 ? fh * 0.3 : 0)); }
  c.closePath();
  c.fillStyle = col1; c.fill();
  c.save(); c.clip();
  c.strokeStyle = col2; c.lineWidth = 1.2; line(c, x + fw * 0.33, top - 3, x + fw * 0.33, top + fh + 3); line(c, x, top + fh / 2 + 1, x + fw, top + fh / 2 + 1);
  c.restore();
}

function towerHeight(t) {
  switch (t.type) {
    case 'archer': return [44, 52, 60][t.lvl];
    case 'crossbow': return [40, 47, 54][t.lvl];
    case 'catapult': return 32;
    default: return [42, 50, 58][t.lvl];
  }
}

function drawArcherTower(c, t) {
  const L = t.lvl, w = [34, 38, 42][L], h = [44, 52, 60][L], x = t.x, y = t.y, T = TT.archer;
  towerShadow(c, x, y, w);
  roundBody(c, x, y, w, h);
  door(c, x - 3, y + w * 0.17, 9, 15);
  slit(c, x - 5, y - h * 0.58, 8);
  if (L >= 1) slit(c, x + 6, y - h * 0.4, 7);
  machi(c, x, y - h, w);
  if (L >= 1) banner(c, x + 7, y - h + w * 0.2 + 7, 8, 13 + L * 3, t.x, null, null, L >= 2);
  crenel(c, x, y - h, w, false);
  if (L >= 2) flag(c, x + w / 2 - 6, y - h - 2, 26, '#1f4d8a', '#f0f0f0', t.x);
  const xs = [[0], [-7, 7], [-11, 0, 11]][L];
  for (let i = 0; i < xs.length; i++) {
    const ax = x + xs[i], ay = y - h + 1 - (xs.length === 3 && i === 1 ? 2.5 : 0);
    const dx = t.aimX - ax, dy = (t.aimY - 18) - (ay - 15);
    const flip = dx < 0 ? -1 : 1;
    const aim = clamp(Math.atan2(dy, Math.abs(dx) || 1), -0.9, 0.75);
    const pull = t.target ? clamp(t.af[i] / (T.rate[L] * xs.length * 0.7), 0, 1) : 0.25;
    c.save(); c.translate(ax, ay); c.scale(0.6 * flip, 0.6); drawArcherFig(c, aim, pull); c.restore();
  }
  crenel(c, x, y - h, w, true);
}

function bigCrossbow(c, ready, lvl) {
  const s = [1, 1.15, 1.35][lvl];
  c.scale(s, s);
  c.lineCap = 'round';
  const wg = c.createLinearGradient(0, -2, 0, 2); wg.addColorStop(0, '#9a6c3c'); wg.addColorStop(1, '#4e321a');
  c.fillStyle = wg; c.fillRect(-11, -1.7, 23, 3.4);
  c.fillStyle = '#5b6269'; c.fillRect(-4, -2, 1.5, 4); c.fillRect(4, -2, 1.5, 4);
  c.strokeStyle = '#3a3f44'; c.lineWidth = 2.4;
  c.beginPath(); c.moveTo(7, -11); c.quadraticCurveTo(13.5, 0, 7, 11); c.stroke();
  c.strokeStyle = '#8a929a'; c.lineWidth = 0.8;
  c.beginPath(); c.moveTo(7.6, -10.4); c.quadraticCurveTo(13.6, 0, 7.6, 10.4); c.stroke();
  const nut = ready ? -6 : 8;
  c.strokeStyle = '#d8d2c0'; c.lineWidth = 0.6;
  c.beginPath(); c.moveTo(7, -11); c.lineTo(nut, 0); c.lineTo(7, 11); c.stroke();
  if (ready) {
    c.strokeStyle = '#4a321c'; c.lineWidth = 1.4; line(c, -6, 0, 14, 0);
    c.fillStyle = '#3a3f44'; c.beginPath(); c.moveTo(14, -1.6); c.lineTo(18, 0); c.lineTo(14, 1.6); c.fill();
    c.fillStyle = '#e8e0d0'; c.fillRect(-6, -1.6, 3, 1); c.fillRect(-6, 0.6, 3, 1);
  }
  c.fillStyle = '#3a2a1a'; circ(c, -11, 0, 2.6); c.fill();
  c.strokeStyle = '#8a929a'; c.lineWidth = 0.6; line(c, -13.4, 0, -8.6, 0); line(c, -11, -2.4, -11, 2.4);
}

function drawCrossbowTower(c, t) {
  const L = t.lvl, w = [36, 40, 44][L], h = [40, 47, 54][L], x = t.x, y = t.y, T = TT.crossbow;
  const dx = w * 0.26, dy = w * 0.17;
  towerShadow(c, x + 2, y, w);
  c.beginPath(); c.moveTo(x + w / 2, y); c.lineTo(x + w / 2 + dx, y - dy); c.lineTo(x + w / 2 + dx, y - h - dy); c.lineTo(x + w / 2, y - h); c.closePath();
  c.fillStyle = pat(STONE, x, y); c.fill(); c.fillStyle = 'rgba(0,0,0,0.48)'; c.fill();
  c.fillStyle = pat(STONE, x, y); c.fillRect(x - w / 2, y - h, w, h);
  const g = c.createLinearGradient(0, y - h, 0, y);
  g.addColorStop(0, 'rgba(255,240,210,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0.3)');
  c.fillStyle = g; c.fillRect(x - w / 2, y - h, w, h);
  c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x + w / 2 - 3, y - h, 3, h);
  door(c, x, y, 10, 16);
  slit(c, x - w * 0.27, y - h * 0.6, 9); slit(c, x + w * 0.27, y - h * 0.6, 9);
  if (L >= 1) {
    c.fillStyle = '#5b3b1e'; c.fillRect(x - w / 2 - 2, y - h + 2, w + 4, 6);
    c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 0.6;
    for (let i = 0; i <= w + 4; i += 4) line(c, x - w / 2 - 2 + i, y - h + 2, x - w / 2 - 2 + i, y - h + 8);
    c.fillStyle = '#2a1a0d';
    for (let i = 3; i < w; i += 8) c.fillRect(x - w / 2 + i, y - h + 8, 2, 3);
  }
  if (L >= 1) banner(c, x - w * 0.27, y - h + 12, 8, 14 + L * 3, t.x, null, null, L >= 2);
  if (L >= 2) banner(c, x + w * 0.27, y - h + 12, 8, 20, t.x + 2, null, null, true);
  const ty = y - h;
  c.beginPath(); c.moveTo(x - w / 2, ty); c.lineTo(x + w / 2, ty); c.lineTo(x + w / 2 + dx, ty - dy); c.lineTo(x - w / 2 + dx, ty - dy); c.closePath();
  c.fillStyle = '#4e4a43'; c.fill();
  for (let i = 0; i < 5; i++) merlon(c, x - w / 2 + dx + 3 + i * (w - 6) / 4, ty - dy + 1, 5, 7, -0.2);
  const gx = x - w / 2 + 8 + dx * 0.55, gy = ty - dy * 0.55;
  c.save(); c.translate(gx, gy); c.scale(0.55 * (t.aimX < gx ? -1 : 1), 0.55); drawFigure(c, 'guard', 0, false); c.restore();
  const px = x + dx * 0.5 + 3, py = ty - dy * 0.5;
  c.fillStyle = '#4a321c'; c.fillRect(px - 1.5, py - 8, 3, 8);
  c.save(); c.translate(px, py - 9);
  const ang = Math.atan2((t.aimY - 18) - (py - 9), t.aimX - px);
  c.rotate(ang);
  if (Math.cos(ang) < 0) c.scale(1, -1);
  bigCrossbow(c, t.cd < T.rate[L] * 0.55, L);
  c.restore();
  for (let i = 0; i < 5; i++) merlon(c, x - w / 2 + 3 + i * (w - 6) / 4, ty + 1, 5, 7, -0.6 + i * 0.2);
  for (let i = 1; i < 3; i++) merlon(c, x + w / 2 + dx * i / 3, ty - dy * i / 3 + 1, 3.5, 7, 0.9);
}

function wheel(c, x, y, r, rot) {
  c.fillStyle = '#4a321c'; circ(c, x, y, r); c.fill();
  c.strokeStyle = '#3a3f44'; c.lineWidth = 1; circ(c, x, y, r - 0.4); c.stroke();
  c.strokeStyle = '#7a5530'; c.lineWidth = 0.8;
  for (let i = 0; i < 4; i++) { const a = rot + i * Math.PI / 4; line(c, x - Math.cos(a) * (r - 1), y - Math.sin(a) * (r - 1), x + Math.cos(a) * (r - 1), y + Math.sin(a) * (r - 1)); }
  c.fillStyle = '#2a2a2a'; circ(c, x, y, 1); c.fill();
}

function drawCatapult(c, t) {
  const L = t.lvl, s = [1, 1.12, 1.25][L], x = t.x, y = t.y, T = TT.catapult, rate = T.rate[L];
  towerShadow(c, x, y, 50);
  roundBody(c, x, y, 56, 12);
  ell(c, x, y - 12, 28, 11); c.fillStyle = '#7d786e'; c.fill();
  ell(c, x, y - 12, 25, 9.5); c.fillStyle = '#6a5a44'; c.fill();
  const flip = t.aimX < x ? -1 : 1;
  c.save(); c.translate(x, y - 12); c.scale(flip * s, s);
  c.lineCap = 'round';
  c.save(); c.translate(-22, -0.5); c.scale(0.55, 0.55); drawFigure(c, 'guard', 0, false); c.restore();
  const wood = '#7a5230', dark = '#3e2914';
  c.strokeStyle = dark; c.lineWidth = 3; line(c, -17, -9, 15, -9);
  c.strokeStyle = shade(wood, -15); c.lineWidth = 2.4; line(c, 6, -7, 7.5, -33); line(c, 13, -7, 7.5, -33);
  const ft = t.fireT;
  const aL = Math.PI + 0.12, aF = Math.PI * 1.5 + 0.22;
  let a;
  if (ft < 0.14) a = lerp(aL, aF, Math.pow(ft / 0.14, 2));
  else if (ft < 0.45) a = aF;
  else a = lerp(aF, aL, clamp((ft - 0.45) / (rate * 0.6), 0, 1));
  const loaded = ft >= 0.45 + rate * 0.6;
  const ax = 0, ay = -12, al = 28;
  const ex = ax + Math.cos(a) * al, ey = ay + Math.sin(a) * al;
  const ag = c.createLinearGradient(ax, ay - 2, ax, ay + 2); ag.addColorStop(0, '#a07040'); ag.addColorStop(1, '#5a3a1a');
  c.strokeStyle = ag; c.lineWidth = 3.2; line(c, ax - Math.cos(a) * 4, ay - Math.sin(a) * 4, ex, ey);
  if (L >= 1) { c.strokeStyle = '#5b6269'; c.lineWidth = 3.6; for (const k of [0.35, 0.7]) line(c, ax + Math.cos(a) * al * k - Math.cos(a) * 0.7, ay + Math.sin(a) * al * k - Math.sin(a) * 0.7, ax + Math.cos(a) * al * k + Math.cos(a) * 0.7, ay + Math.sin(a) * al * k + Math.sin(a) * 0.7); }
  c.save(); c.translate(ex, ey); c.rotate(a + Math.PI / 2);
  c.fillStyle = '#4a321c'; c.beginPath(); c.arc(0, 0, 4.2, 0, Math.PI); c.closePath(); c.fill();
  if (loaded) { const sg = c.createRadialGradient(-1, 1, 0.5, 0, 2, 4); sg.addColorStop(0, '#b5afa3'); sg.addColorStop(1, '#5a554c'); c.fillStyle = sg; circ(c, 0, 1.5, 3.4); c.fill(); }
  c.restore();
  c.strokeStyle = wood; c.lineWidth = 3; line(c, 7.5, -33, 7.5, -36);
  c.fillStyle = '#6a4424'; circ(c, ax + Math.cos(aF) * 21, ay + Math.sin(aF) * 21, 2.6); c.fill();
  c.strokeStyle = dark; c.lineWidth = 2.6; line(c, ax + Math.cos(aF) * 21 - 4, ay + Math.sin(aF) * 21 + 1, ax + Math.cos(aF) * 21 + 4, ay + Math.sin(aF) * 21 - 1);
  c.fillStyle = '#a08458'; circ(c, ax, ay, 3.6); c.fill();
  c.strokeStyle = '#6e5a38'; c.lineWidth = 0.5; for (let i = -3; i <= 3; i += 1.5) line(c, ax + i, ay - 3.2, ax + i, ay + 3.2);
  c.fillStyle = '#3a3f44'; circ(c, ax, ay, 1.1); c.fill();
  c.strokeStyle = wood; c.lineWidth = 2.4; line(c, -4, -9, ax, ay); line(c, 4, -9, ax, ay);
  const rot = loaded ? 0 : ft * 3;
  wheel(c, -13, -12, 3.4, rot);
  c.strokeStyle = '#8a7a5a'; c.lineWidth = 0.6; if (!loaded && ft > 0.45) line(c, -13, -12, ex, ey);
  c.strokeStyle = wood; c.lineWidth = 3.4; line(c, -19, -5, 17, -5);
  if (L >= 1) { c.fillStyle = '#5b6269'; c.fillRect(-18, -6.7, 2, 3.4); c.fillRect(15, -6.7, 2, 3.4); }
  wheel(c, -12, -2.5, 4.6, -t.x); wheel(c, 11, -2.5, 4.6, t.x);
  c.restore();
  if (L >= 2) flag(c, x - 24 * flip, y - 14, 22, '#1f4d8a', '#f0f0f0', t.x);
}

function drawOilTower(c, t) {
  const L = t.lvl, w = [36, 40, 44][L], h = [42, 50, 58][L], x = t.x, y = t.y;
  towerShadow(c, x, y, w);
  roundBody(c, x, y, w, h);
  door(c, x + 2, y + w * 0.17, 9, 14);
  slit(c, x - 6, y - h * 0.55, 7);
  machi(c, x, y - h, w);
  if (L >= 1) banner(c, x - 7, y - h + w * 0.2 + 7, 8, 13 + L * 3, t.x, null, null, L >= 2);
  crenel(c, x, y - h, w, false);
  const cy = y - h - 1;
  const fl = 0.75 + Math.sin(S.time * 17 + x) * 0.15 + Math.sin(S.time * 7.3) * 0.1;
  c.fillStyle = '#2a2a2a'; c.lineWidth = 1.2; c.strokeStyle = '#2a2a2a';
  line(c, x - 7, cy + 2, x - 4, cy - 6); line(c, x + 7, cy + 2, x + 4, cy - 6);
  c.fillStyle = `rgba(255,${Math.round(120 + fl * 60)},30,0.95)`;
  c.beginPath(); c.moveTo(x - 4, cy + 1); c.quadraticCurveTo(x - 2, cy - 7 * fl, x, cy - 4); c.quadraticCurveTo(x + 2, cy - 8 * fl, x + 4, cy + 1); c.closePath(); c.fill();
  const dir = t.aimX < x ? -1 : 1;
  const pour = t.fireT < 0.7 ? Math.sin(t.fireT / 0.7 * Math.PI) * 0.65 * dir : 0;
  c.save(); c.translate(x, cy - 7); c.rotate(pour);
  const pg = c.createLinearGradient(-8, 0, 8, 0); pg.addColorStop(0, '#4a4a4a'); pg.addColorStop(0.4, '#262626'); pg.addColorStop(1, '#0c0c0c');
  c.fillStyle = pg; c.beginPath(); c.moveTo(-8, -3); c.quadraticCurveTo(-8.6, 7, 0, 7.6); c.quadraticCurveTo(8.6, 7, 8, -3); c.closePath(); c.fill();
  c.fillStyle = '#555'; ell(c, 0, -3, 8.6, 2.4); c.fill();
  c.fillStyle = '#2a1406'; ell(c, 0, -3, 7.2, 1.7); c.fill();
  c.fillStyle = `rgba(255,120,30,${0.35 + fl * 0.2})`; ell(c, 0, -3, 5, 1.1); c.fill();
  c.fillStyle = '#3a3a3a'; c.beginPath(); c.moveTo(8 * dir, -4); c.lineTo(11 * dir, -4.5); c.lineTo(8 * dir, -1.5); c.fill();
  c.strokeStyle = '#555'; c.lineWidth = 0.8; c.beginPath(); c.arc(0, -3, 9.5, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
  c.restore();
  if (L >= 1) { c.save(); c.translate(x - 11 * dir, cy + 1); c.scale(0.55 * dir, 0.55); drawFigure(c, 'guard', 0, false); c.restore(); }
  crenel(c, x, y - h, w, true);
  if (L >= 2) flag(c, x + w / 2 - 5, y - h - 1, 24, '#1f4d8a', '#f0f0f0', t.x);
  c.save(); c.globalCompositeOperation = 'lighter';
  const rg = c.createRadialGradient(x, cy - 4, 1, x, cy - 4, 18);
  rg.addColorStop(0, `rgba(255,140,40,${0.25 * fl})`); rg.addColorStop(1, 'rgba(255,100,20,0)');
  c.fillStyle = rg; c.fillRect(x - 18, cy - 22, 36, 36);
  c.restore();
}

// Taran oblężniczy: zadaszona belka na kołach, pchana przez ludzi
function drawRam(c, phase, broken) {
  c.lineCap = 'round'; c.lineJoin = 'round';
  const f = FIG.squire;
  if (!broken) for (const [mx, o] of [[-14, 0], [-4, 2.1], [6, 4.2]]) {
    const s = Math.sin(phase + o), co = Math.cos(phase + o);
    leg(c, f, mx - 0.6, -15, -s * 0.45, Math.max(0, -co) * 0.8 + 0.05, true);
    leg(c, f, mx + 0.6, -15, s * 0.45, Math.max(0, co) * 0.8 + 0.05, false);
  }
  c.fillStyle = 'rgba(18,11,5,0.88)'; c.fillRect(-23, -26, 46, 12);
  const wg = c.createLinearGradient(0, -24, 0, -16); wg.addColorStop(0, '#8a6038'); wg.addColorStop(1, '#4a2f16');
  c.strokeStyle = wg; c.lineWidth = 6; line(c, -27, -20, 29, -20);
  c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 0.6; for (let x = -24; x < 28; x += 6) line(c, x, -22.5, x + 4, -22.5);
  c.fillStyle = steelG(c, 27, -25, 36, -15);
  c.beginPath(); c.moveTo(27, -24); c.lineTo(33, -24); c.quadraticCurveTo(37.5, -20, 33, -16); c.lineTo(27, -16); c.closePath(); c.fill();
  c.strokeStyle = '#2e3236'; c.lineWidth = 0.6; c.stroke();
  c.strokeStyle = '#3a3f44'; c.lineWidth = 1.5; line(c, 22, -24, 22, -16); line(c, -20, -24, -20, -16);
  c.strokeStyle = '#555b61'; c.lineWidth = 0.7; line(c, -8, -33, -8, -22); line(c, 12, -33, 12, -22);
  // dach z mokrych skór
  c.save(); if (broken) { c.translate(0, -20); c.rotate(-0.25); c.translate(0, 20); }
  const rg = c.createLinearGradient(0, -42, 0, -24); rg.addColorStop(0, '#9a7b55'); rg.addColorStop(1, '#4e3a24');
  c.fillStyle = rg; c.beginPath(); c.moveTo(-26, -24); c.lineTo(-18, -41); c.lineTo(18, -41); c.lineTo(26, -24); c.closePath(); c.fill();
  c.save(); c.clip();
  c.strokeStyle = 'rgba(40,25,10,0.5)'; c.lineWidth = 0.6; c.setLineDash([1.2, 1]);
  for (const x of [-12, -1, 10]) line(c, x, -41, x * 1.3, -24);
  line(c, -24, -32, 24, -32);
  c.setLineDash([]);
  c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(-26, -41, 52, 6);
  c.restore();
  c.strokeStyle = '#3a2412'; c.lineWidth = 2.2; line(c, -18, -41, 18, -41);
  c.lineWidth = 1.8; line(c, -26, -24, 26, -24);
  c.restore();
  // koła
  const rot = broken ? 0.4 : phase * 0.9;
  for (const wx of [-16, 16]) {
    c.fillStyle = '#3e2914'; circ(c, wx, -5.5, 5.8); c.fill();
    c.strokeStyle = '#2a2a2a'; c.lineWidth = 1; circ(c, wx, -5.5, 5.3); c.stroke();
    c.strokeStyle = '#7a5530'; c.lineWidth = 1;
    for (let i = 0; i < 3; i++) { const a = rot + i * Math.PI / 3; line(c, wx - Math.cos(a) * 4.8, -5.5 - Math.sin(a) * 4.8, wx + Math.cos(a) * 4.8, -5.5 + Math.sin(a) * 4.8); }
    c.fillStyle = '#222'; circ(c, wx, -5.5, 1.2); c.fill();
  }
  c.strokeStyle = '#5a3c20'; c.lineWidth = 2.4; line(c, -22, -10, 22, -10);
}

function drawTower(c, t) {
  if (t.type === 'archer') drawArcherTower(c, t);
  else if (t.type === 'crossbow') drawCrossbowTower(c, t);
  else if (t.type === 'catapult') drawCatapult(c, t);
  else drawOilTower(c, t);
}

// =====================================================================
//  TŁO I ZAMEK
// =====================================================================
const bg = document.createElement('canvas');
const BGS = 2;
bg.width = W * BGS; bg.height = H * BGS;
const FLAGS = [];

function roof(c, cx, topY, w, hgt) {
  const ry = w * 0.2 + 1.5;
  const g = c.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
  g.addColorStop(0, '#6f7f92'); g.addColorStop(0.45, '#48566a'); g.addColorStop(1, '#232b36');
  c.beginPath(); c.moveTo(cx - w / 2 - 5, topY); c.lineTo(cx, topY - hgt); c.lineTo(cx + w / 2 + 5, topY);
  c.ellipse(cx, topY, w / 2 + 5, ry, 0, 0, Math.PI, false); c.closePath();
  c.fillStyle = g; c.fill();
  c.save(); c.clip();
  c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 0.7;
  for (let k = 1; k < 9; k++) { const t = k / 9; c.beginPath(); c.ellipse(cx, topY - hgt + hgt * t, (w / 2 + 5) * t, ry * t, 0, 0, Math.PI); c.stroke(); }
  for (let k = -4; k <= 4; k++) line(c, cx, topY - hgt, cx + k * (w / 8), topY + ry * 0.8);
  if (SNOW) {
    c.fillStyle = 'rgba(245,248,252,0.95)';
    c.beginPath(); c.moveTo(cx, topY - hgt - 2);
    const n = 9;
    for (let k = 0; k <= n; k++) { const t = k / n, x = cx - w / 2 - 6 + t * (w + 12); const yy = topY - hgt * 0.42 + Math.sin(k * 2.3) * 4 + Math.abs(t - 0.5) * hgt * 0.3; c.lineTo(x, yy); }
    c.closePath(); c.fill();
  }
  c.restore();
  FLAGS.push({ x: cx, y: topY - hgt });
}
function boxWall(c, x, y, w, h, p) {
  c.fillStyle = pat(p || STONE_C, x, y); c.fillRect(x, y, w, h);
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(255,240,210,0.1)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
  c.fillStyle = g; c.fillRect(x, y, w, h);
}
function merlonRow(c, x1, x2, y, mw, mh) {
  for (let x = x1; x + mw <= x2 + 0.1; x += mw * 1.8) merlon(c, x + mw / 2, y, mw, mh, -0.2 + ((x - x1) / (x2 - x1)) * 0.6);
}
function windowArch(c, x, y, w, h, lit) {
  c.fillStyle = '#120c07'; c.beginPath(); c.moveTo(x - w / 2, y); c.lineTo(x - w / 2, y - h + w / 2); c.arc(x, y - h + w / 2, w / 2, Math.PI, 0); c.lineTo(x + w / 2, y); c.closePath(); c.fill();
  if (lit) { c.fillStyle = 'rgba(255,170,70,0.55)'; c.fill(); }
  c.strokeStyle = 'rgba(210,205,195,0.6)'; c.lineWidth = 1; c.stroke();
}

function drawCastle(c) {
  FLAGS.length = 0;
  c.fillStyle = 'rgba(0,0,0,0.28)'; ell(c, 140, 618, 175, 26); c.fill();
  // tylne wieże
  roundBody(c, 30, 490, 54, 190, STONE_C); slit(c, 22, 380, 10); roof(c, 30, 300, 54, 72);
  roundBody(c, 200, 485, 50, 165, STONE_C); slit(c, 192, 400, 10); roof(c, 200, 320, 50, 64);
  // donżon
  boxWall(c, 55, 255, 120, 235);
  c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(160, 255, 15, 235);
  merlonRow(c, 55, 175, 256, 8, 10);
  for (const wx of [80, 115, 150]) { windowArch(c, wx, 318, 9, 20, wx === 115); windowArch(c, wx, 385, 9, 20, wx !== 115); }
  FLAGS.push({ x: 115, y: 246, big: true });
  // mur kurtynowy
  boxWall(c, 0, 485, 252, 125);
  c.fillStyle = '#6d685f'; c.fillRect(0, 478, 252, 8);
  merlonRow(c, 0, 252, 480, 8, 10);
  c.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = 6; x < 252; x += 28) c.fillRect(x, 520, 2, 9);
  // przednie wieże
  roundBody(c, 24, 612, 64, 178, STONE_C); slit(c, 14, 520, 11); slit(c, 30, 560, 9);
  machi(c, 24, 434, 64); roof(c, 24, 434, 64, 80);
  roundBody(c, 238, 600, 58, 158, STONE_C); slit(c, 228, 510, 11); slit(c, 244, 550, 9);
  machi(c, 238, 442, 58); roof(c, 238, 442, 58, 74);
  // brama
  boxWall(c, 94, 430, 68, 186);
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(154, 430, 8, 186);
  merlonRow(c, 94, 162, 431, 7, 9);
  c.fillStyle = '#5a554d'; c.fillRect(92, 448, 72, 5);
  c.fillStyle = '#2e2b27'; for (let x = 96; x < 162; x += 9) c.fillRect(x, 453, 3, 4);
  const gx = 128, gb = 616, gw = 38, gtop = 558;
  c.fillStyle = '#0d0907';
  c.beginPath(); c.moveTo(gx - gw / 2, gb); c.lineTo(gx - gw / 2, gtop + gw / 2); c.arc(gx, gtop + gw / 2, gw / 2, Math.PI, 0); c.lineTo(gx + gw / 2, gb); c.closePath(); c.fill();
  const ig = c.createLinearGradient(0, gtop, 0, gb); ig.addColorStop(0, 'rgba(0,0,0,0)'); ig.addColorStop(1, 'rgba(90,60,30,0.35)');
  c.fillStyle = ig; c.fill();
  c.save(); c.clip();
  c.strokeStyle = '#3a3a3a'; c.lineWidth = 1.6;
  for (let x = gx - gw / 2 + 3; x < gx + gw / 2; x += 5) line(c, x, gtop - 2, x, gtop + 16);
  for (let y = gtop + 2; y < gtop + 16; y += 5) line(c, gx - gw / 2, y, gx + gw / 2, y);
  c.fillStyle = '#3a3a3a'; for (let x = gx - gw / 2 + 3; x < gx + gw / 2; x += 5) { c.beginPath(); c.moveTo(x - 1, gtop + 16); c.lineTo(x, gtop + 20); c.lineTo(x + 1, gtop + 16); c.fill(); }
  c.restore();
  c.strokeStyle = '#b1ab9f'; c.lineWidth = 5; c.setLineDash([5, 1.5]);
  c.beginPath(); c.moveTo(gx - gw / 2 - 2.5, gb); c.lineTo(gx - gw / 2 - 2.5, gtop + gw / 2); c.arc(gx, gtop + gw / 2, gw / 2 + 2.5, Math.PI, 0); c.lineTo(gx + gw / 2 + 2.5, gb); c.stroke();
  c.setLineDash([]);
  c.fillStyle = '#5b3b1e'; c.fillRect(gx - gw / 2 - 1, gb - 30, 4, 30); c.fillRect(gx + gw / 2 - 3, gb - 30, 4, 30);
  windowArch(c, 128, 500, 8, 16, true);
  c.fillStyle = '#c9b88a'; c.beginPath(); c.moveTo(118, 470); c.lineTo(138, 470); c.lineTo(138, 482); c.quadraticCurveTo(138, 490, 128, 494); c.quadraticCurveTo(118, 490, 118, 482); c.closePath(); c.fill();
  c.fillStyle = '#1f4d8a'; c.beginPath(); c.moveTo(119.5, 471.5); c.lineTo(136.5, 471.5); c.lineTo(136.5, 482); c.quadraticCurveTo(136.5, 488.5, 128, 492); c.quadraticCurveTo(119.5, 488.5, 119.5, 482); c.closePath(); c.fill();
  c.strokeStyle = '#f0f0f0'; c.lineWidth = 2; line(c, 128, 472, 128, 491); line(c, 120, 479, 136, 479);
}

function tree(c, x, y, s) {
  c.fillStyle = 'rgba(0,0,0,0.28)'; ell(c, x + 10 * s, y + 2 * s, 22 * s, 8 * s); c.fill();
  c.fillStyle = '#4a3520'; c.beginPath(); c.moveTo(x - 3 * s, y); c.lineTo(x - 1.8 * s, y - 20 * s); c.lineTo(x + 1.8 * s, y - 20 * s); c.lineTo(x + 3 * s, y); c.closePath(); c.fill();
  c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(x + 0.5 * s, y - 20 * s, 1.5 * s, 20 * s);
  const blobs = [];
  for (let k = 0; k < 8; k++) blobs.push({ x: x + SR(-13, 13) * s, y: y - 28 * s + SR(-12, 8) * s, r: SR(8, 13) * s });
  blobs.sort((a, b) => a.y - b.y);
  for (const b of blobs) {
    const g = c.createRadialGradient(b.x - b.r * 0.4, b.y - b.r * 0.45, b.r * 0.1, b.x, b.y, b.r);
    g.addColorStop(0, '#86ad55'); g.addColorStop(0.55, '#4d7a2e'); g.addColorStop(1, '#2a4a1a');
    c.fillStyle = g; circ(c, b.x, b.y, b.r); c.fill();
  }
  for (let k = 0; k < 45; k++) {
    const a = SR(0, TAU), r = SR(0, 18) * s;
    c.fillStyle = srnd() < 0.5 ? 'rgba(160,200,100,0.45)' : 'rgba(20,40,12,0.4)';
    circ(c, x + Math.cos(a) * r, y - 28 * s + Math.sin(a) * r * 0.8, SR(0.6, 1.6) * s); c.fill();
  }
}
function pine(c, x, y, s) {
  c.fillStyle = 'rgba(0,0,0,0.28)'; ell(c, x + 9 * s, y + 2 * s, 16 * s, 6 * s); c.fill();
  c.fillStyle = '#3e2a18'; c.fillRect(x - 1.8 * s, y - 8 * s, 3.6 * s, 8 * s);
  for (let k = 0; k < 4; k++) {
    const by = y - 6 * s - k * 9 * s, hw = (14 - k * 3) * s, th = 16 * s;
    const g = c.createLinearGradient(x - hw, 0, x + hw, 0);
    g.addColorStop(0, '#4f7a3e'); g.addColorStop(0.5, '#2f5a2a'); g.addColorStop(1, '#173018');
    c.fillStyle = g; c.beginPath(); c.moveTo(x - hw, by); c.lineTo(x, by - th); c.lineTo(x + hw, by);
    c.quadraticCurveTo(x, by + 3 * s, x - hw, by); c.fill();
    if (SNOW) {
      c.fillStyle = 'rgba(248,250,253,0.95)'; c.beginPath();
      c.moveTo(x - hw * 0.85, by - 1.5 * s); c.lineTo(x, by - th); c.lineTo(x + hw * 0.6, by - 3 * s);
      c.quadraticCurveTo(x, by - th * 0.35, x - hw * 0.85, by - 1.5 * s); c.fill();
    }
  }
}
function rock(c, x, y, s) {
  c.fillStyle = 'rgba(0,0,0,0.25)'; ell(c, x + 3 * s, y + 1 * s, 9 * s, 3 * s); c.fill();
  const g = c.createLinearGradient(x - 6 * s, y - 8 * s, x + 6 * s, y);
  g.addColorStop(0, '#b4afa5'); g.addColorStop(1, '#5c5850');
  c.fillStyle = g; c.beginPath(); c.moveTo(x - 7 * s, y); c.lineTo(x - 5 * s, y - 5 * s); c.lineTo(x - 1 * s, y - 7 * s); c.lineTo(x + 5 * s, y - 5 * s); c.lineTo(x + 7 * s, y); c.closePath(); c.fill();
  if (SNOW) { c.fillStyle = '#f4f7fa'; c.beginPath(); c.moveTo(x - 5.5 * s, y - 4 * s); c.lineTo(x - 1 * s, y - 7 * s); c.lineTo(x + 5 * s, y - 5 * s); c.quadraticCurveTo(x, y - 4 * s, x - 5.5 * s, y - 4 * s); c.fill(); }
}
function bush(c, x, y, s) {
  c.fillStyle = 'rgba(0,0,0,0.25)'; ell(c, x + 3 * s, y + 1, 10 * s, 3.5 * s); c.fill();
  for (let k = 0; k < 4; k++) {
    const bx = x + SR(-6, 6) * s, by = y - SR(3, 7) * s, r = SR(4, 6) * s;
    const g = c.createRadialGradient(bx - r * 0.4, by - r * 0.4, 0, bx, by, r);
    g.addColorStop(0, '#7fa24e'); g.addColorStop(1, '#2d4c1c');
    c.fillStyle = g; circ(c, bx, by, r); c.fill();
  }
}
let SNOW = false;
function pathLine(c, P, off) {
  c.beginPath();
  for (let i = 0; i < P.pts.length; i++) { const p = P.pts[i], n = P.norm[i]; const x = p.x + n.x * off, y = p.y + n.y * off; i ? c.lineTo(x, y) : c.moveTo(x, y); }
}
function randOnPath(P) { const p = pathAt(SR(0, P.len), P); return { p, nx: -Math.sin(p.ang), ny: Math.cos(p.ang) }; }

function renderBg() {
  const c = bg.getContext('2d');
  c.setTransform(BGS, 0, 0, BGS, 0, 0);
  seed = 11 + LEVEL_I * 101;
  SNOW = LEVEL.theme === 'winter';
  c.fillStyle = SNOW ? '#dde5ea' : '#58763a'; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) {
    const x = SR(0, W), y = SR(0, H), r = SR(40, 150);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    const light = srnd() < 0.5;
    g.addColorStop(0, SNOW ? (light ? 'rgba(255,255,255,0.5)' : 'rgba(140,160,185,0.18)') : (light ? 'rgba(150,175,85,0.22)' : 'rgba(30,50,20,0.22)'));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  c.lineWidth = 1;
  for (let i = 0; i < 16000; i++) {
    const x = SR(0, W), y = SR(0, H), v = srnd();
    if (SNOW) {
      c.fillStyle = v < 0.5 ? 'rgba(255,255,255,0.7)' : v < 0.85 ? 'rgba(160,178,198,0.3)' : 'rgba(90,110,80,0.25)';
      c.fillRect(x, y, SR(0.8, 2.2), SR(0.6, 1.2));
    } else {
      c.strokeStyle = v < 0.33 ? 'rgba(40,66,26,0.5)' : v < 0.66 ? 'rgba(108,140,62,0.45)' : 'rgba(155,175,95,0.35)';
      line(c, x, y, x + SR(-1.5, 1.5), y - SR(2, 5));
    }
  }
  if (!SNOW) for (let i = 0; i < 300; i++) {
    const v = srnd(); c.fillStyle = v < 0.4 ? 'rgba(255,255,240,0.8)' : v < 0.75 ? 'rgba(250,220,80,0.8)' : 'rgba(170,120,210,0.8)';
    circ(c, SR(0, W), SR(0, H), SR(0.6, 1.2)); c.fill();
  }
  c.lineCap = 'round'; c.lineJoin = 'round';
  // rzeka
  if (RIVER) {
    c.strokeStyle = 'rgba(60,45,25,0.45)'; c.lineWidth = 64; pathLine(c, RIVER, 0); c.stroke();
    c.strokeStyle = '#2f5d78'; c.lineWidth = 50; pathLine(c, RIVER, 0); c.stroke();
    c.strokeStyle = 'rgba(90,140,170,0.6)'; c.lineWidth = 30; pathLine(c, RIVER, 0); c.stroke();
    c.strokeStyle = 'rgba(140,190,215,0.35)'; c.lineWidth = 10; pathLine(c, RIVER, -6); c.stroke();
    for (let i = 0; i < 260; i++) {
      const { p, nx, ny } = randOnPath(RIVER), off = SR(-20, 20), x = p.x + nx * off, y = p.y + ny * off, l = SR(3, 9);
      c.strokeStyle = 'rgba(220,240,250,0.45)'; c.lineWidth = 0.8;
      line(c, x - Math.cos(p.ang) * l / 2, y - Math.sin(p.ang) * l / 2, x + Math.cos(p.ang) * l / 2, y + Math.sin(p.ang) * l / 2);
    }
    for (let i = 0; i < 260; i++) {
      const { p, nx, ny } = randOnPath(RIVER), side = srnd() < 0.5 ? -1 : 1, off = side * SR(25, 31), x = p.x + nx * off, y = p.y + ny * off;
      c.strokeStyle = srnd() < 0.5 ? 'rgba(60,90,40,0.9)' : 'rgba(110,140,60,0.8)';
      for (let k = 0; k < 3; k++) line(c, x + k - 1, y, x + k - 1 + SR(-2, 2), y - SR(4, 9));
    }
  }
  // drogi
  const roadCol = SNOW ? ['rgba(70,80,95,0.25)', '#857c70', '#a69d90', 'rgba(235,238,242,0.4)', 'rgba(70,60,50,0.4)'] :
    ['rgba(50,40,20,0.3)', '#6e5638', '#9a7d55', 'rgba(185,155,110,0.5)', 'rgba(70,52,30,0.4)'];
  for (const P of PATHS) { c.strokeStyle = roadCol[0]; c.lineWidth = 72; pathLine(c, P, 0); c.stroke(); }
  for (const P of PATHS) { c.strokeStyle = roadCol[1]; c.lineWidth = 60; pathLine(c, P, 0); c.stroke(); }
  for (const P of PATHS) { c.strokeStyle = roadCol[2]; c.lineWidth = 52; pathLine(c, P, 0); c.stroke(); }
  for (const P of PATHS) {
    c.strokeStyle = roadCol[3]; c.lineWidth = 28; pathLine(c, P, 0); c.stroke();
    c.strokeStyle = roadCol[4]; c.lineWidth = 3; pathLine(c, P, -10); c.stroke(); pathLine(c, P, 10); c.stroke();
  }
  for (const P of PATHS) {
    const k = P.len / 2600;
    for (let i = 0; i < 5000 * k; i++) {
      const { p, nx, ny } = randOnPath(P), off = SR(-27, 27);
      c.fillStyle = srnd() < 0.5 ? 'rgba(60,45,25,0.35)' : (SNOW ? 'rgba(250,250,255,0.6)' : 'rgba(205,180,135,0.35)');
      c.fillRect(p.x + nx * off, p.y + ny * off, SR(0.8, 2), SR(0.8, 2));
    }
    for (let i = 0; i < 350 * k; i++) {
      const { p, nx, ny } = randOnPath(P), off = SR(-26, 26);
      const x = p.x + nx * off, y = p.y + ny * off, r = SR(0.8, 2.4);
      c.fillStyle = 'rgba(0,0,0,0.3)'; ell(c, x + 0.6, y + 0.6, r, r * 0.7); c.fill();
      c.fillStyle = srnd() < 0.5 ? '#a8a296' : '#86806f'; ell(c, x, y, r, r * 0.7); c.fill();
    }
    for (let i = 0; i < 700 * k; i++) {
      const { p, nx, ny } = randOnPath(P), side = srnd() < 0.5 ? -1 : 1, off = side * SR(26, 33);
      const x = p.x + nx * off, y = p.y + ny * off;
      if (distToPath(x, y) < 25 || distToRiver(x, y) < 28) continue;
      if (SNOW) { c.fillStyle = 'rgba(250,252,255,0.9)'; ell(c, x, y, SR(2, 5), SR(1.2, 2.5)); c.fill(); }
      else {
        c.strokeStyle = srnd() < 0.5 ? 'rgba(70,100,40,0.8)' : 'rgba(120,150,70,0.7)';
        for (let q = 0; q < 4; q++) line(c, x + q - 1.5, y, x + q - 1.5 + SR(-2, 2), y - SR(3, 6));
      }
    }
  }
  // mosty nad rzeką
  if (RIVER) for (const P of PATHS) {
    const on = [];
    for (let i = 0; i < P.pts.length; i++) if (distToRiver(P.pts[i].x, P.pts[i].y) < 36) on.push(i);
    if (!on.length) continue;
    const i0 = on[0], i1 = on[on.length - 1];
    for (let i = i0; i <= i1; i++) {
      const p = P.pts[i], n = P.norm[i];
      c.strokeStyle = (i % 2) ? '#7a5634' : '#6b4a2b'; c.lineWidth = 7.5;
      line(c, p.x + n.x * 31, p.y + n.y * 31, p.x - n.x * 31, p.y - n.y * 31);
      c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.8;
      line(c, p.x + n.x * 31, p.y + n.y * 31 + 3.5, p.x - n.x * 31, p.y - n.y * 31 + 3.5);
    }
    for (const side of [-1, 1]) {
      c.beginPath();
      for (let i = i0; i <= i1; i++) { const p = P.pts[i], n = P.norm[i]; const x = p.x + n.x * 32 * side, y = p.y + n.y * 32 * side - 6; i === i0 ? c.moveTo(x, y) : c.lineTo(x, y); }
      c.strokeStyle = '#4a3019'; c.lineWidth = 2.6; c.stroke();
      for (let i = i0; i <= i1; i += 3) { const p = P.pts[i], n = P.norm[i]; const x = p.x + n.x * 32 * side, y = p.y + n.y * 32 * side; c.strokeStyle = '#3a2412'; c.lineWidth = 2.4; line(c, x, y, x, y - 7); }
    }
  }
  // miejsca pod wieże
  for (const s of SLOTS) {
    c.fillStyle = 'rgba(0,0,0,0.25)'; ell(c, s.x + 2, s.y + 2, 26, 10); c.fill();
    c.fillStyle = SNOW ? '#8a8174' : '#7c6a4e'; ell(c, s.x, s.y, 24, 9); c.fill();
    c.fillStyle = SNOW ? '#9e978b' : '#8f7c5c'; ell(c, s.x, s.y - 1, 19, 6.5); c.fill();
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * TAU, px = s.x + Math.cos(a) * 23, py = s.y + Math.sin(a) * 8.5;
      c.fillStyle = 'rgba(0,0,0,0.35)'; ell(c, px + 0.6, py + 0.8, 3.4, 2.2); c.fill();
      c.fillStyle = shade('#a29c90', SR(-25, 15)); ell(c, px, py, 3.2, 2.1); c.fill();
      if (SNOW) { c.fillStyle = 'rgba(250,252,255,0.9)'; ell(c, px - 0.3, py - 0.9, 2.2, 1); c.fill(); }
    }
  }
  drawCastle(c);
  if (SNOW) {
    c.fillStyle = 'rgba(248,250,253,0.92)';
    c.fillRect(56, 476, 38, 4); c.fillRect(162, 476, 47, 4); c.fillRect(57, 251, 118, 4); c.fillRect(94, 427, 68, 4);
  }
  // drzewa, kamienie, krzaki
  const objs = [];
  for (let i = 0; i < 900 && objs.length < 95; i++) {
    const x = SR(-10, W + 10), y = SR(70, H + 10);
    if (x < 285) continue;
    if (distToPath(x, y) < 60 || distToRiver(x, y) < 50) continue;
    if (SLOTS.some(s => hyp(s.x - x, (s.y - y) * 1.2) < 60)) continue;
    if (objs.some(o => hyp(o.x - x, o.y - y) < 30)) continue;
    const v = srnd();
    const k = SNOW ? (v < 0.75 ? 'pine' : 'rock') : (v < 0.45 ? 'tree' : v < 0.7 ? 'pine' : v < 0.85 ? 'bush' : 'rock');
    objs.push({ x, y, k, s: SR(0.8, 1.2) });
  }
  for (let i = 0; i < 40; i++) {
    const x = SR(0, W), y = SR(40, 70);
    if (distToRiver(x, y) < 45) continue;
    objs.push({ x, y, k: SNOW || srnd() < 0.5 ? 'pine' : 'tree', s: SR(0.7, 1.0) });
  }
  objs.sort((a, b) => a.y - b.y);
  for (const o of objs) {
    if (o.k === 'tree') tree(c, o.x, o.y, o.s);
    else if (o.k === 'pine') pine(c, o.x, o.y, o.s);
    else if (o.k === 'bush') bush(c, o.x, o.y, o.s);
    else rock(c, o.x, o.y, o.s);
  }
  const v = c.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, SNOW ? 'rgba(20,30,50,0.35)' : 'rgba(10,5,0,0.4)');
  c.fillStyle = v; c.fillRect(0, 0, W, H);
}

function loadLevel(i) {
  LEVEL_I = clamp(i | 0, 0, LEVELS.length - 1);
  LEVEL = LEVELS[LEVEL_I];
  PATHS = LEVEL.paths.map(buildPath);
  RIVER = LEVEL.river ? buildPath(LEVEL.river) : null;
  WAVES = LEVEL.waves;
  buildSlots();
  renderBg();
}

// =====================================================================
//  DŹWIĘK (syntetyczny)
// =====================================================================
let AC = null, muted = false, NB = null;
const lastS = {};
function ac() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } }
  if (AC && !NB) { NB = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const d = NB.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  return AC;
}
function noise(a, t, dur, type, freq, gain, q) {
  const src = a.createBufferSource(); src.buffer = NB;
  const f = a.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
  const g = a.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(a.destination); src.start(t, Math.random() * 0.5); src.stop(t + dur);
}
function tone(a, t, dur, type, f1, f2, gain) {
  const o = a.createOscillator(); o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = a.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur);
}
function sfx(k) {
  if (muted) return;
  const a = ac(); if (!a || a.state !== 'running') return;
  const now = performance.now(); if (lastS[k] && now - lastS[k] < 60) return; lastS[k] = now;
  const t = a.currentTime;
  switch (k) {
    case 'arrow': noise(a, t, 0.13, 'bandpass', 2600, 0.05, 2); break;
    case 'bolt': tone(a, t, 0.12, 'triangle', 160, 60, 0.12); noise(a, t, 0.08, 'bandpass', 1200, 0.06, 1); break;
    case 'throw': noise(a, t, 0.35, 'lowpass', 500, 0.1); tone(a, t, 0.25, 'sawtooth', 90, 50, 0.03); break;
    case 'impact': noise(a, t, 0.45, 'lowpass', 320, 0.35); tone(a, t, 0.3, 'sine', 80, 35, 0.25); break;
    case 'clang': tone(a, t, 0.09, 'square', 2200, 1900, 0.015); tone(a, t, 0.12, 'sine', 3100, 2900, 0.02); break;
    case 'oil': noise(a, t, 0.7, 'highpass', 3000, 0.06); break;
    case 'castle': noise(a, t, 0.5, 'lowpass', 200, 0.4); tone(a, t, 0.4, 'sine', 60, 30, 0.3); break;
    case 'horn': { const o = a.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(196, t); o.frequency.linearRampToValueAtTime(220, t + 0.25);
      const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; const g = a.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.08, t + 0.08); g.gain.setValueAtTime(0.08, t + 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      o.connect(f); f.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 1.25); break; }
    case 'build': tone(a, t, 0.08, 'square', 300, 200, 0.04); tone(a, t + 0.09, 0.1, 'square', 260, 180, 0.04); break;
  }
}

// =====================================================================
//  STAN GRY
// =====================================================================
const S = {};
function reset() {
  Object.assign(S, {
    state: 'menu', gold: LEVEL ? LEVEL.gold : 300, hp: 20, maxHp: 20, wave: 0, waveCleared: true,
    enemies: [], towers: [], proj: [], parts: [], ground: [], corpses: [], spawnQ: [], waveTime: 0,
    speed: 1, paused: false, time: S.time || 0, shake: 0, sel: null, hoverSlot: null, hoverTower: null, preview: null,
    rains: [], targeting: null, mouse: { x: -999, y: -999 }, hornT: 0,
    ab: { rain: { cd: 0, max: 40 }, horn: { cd: 0, max: 55 } },
    clouds: Array.from({ length: 4 }, (_, i) => ({ x: i * 380 + R(0, 200), y: R(100, 650), r: R(120, 200), v: R(8, 14) })),
  });
  for (const s of SLOTS) s.tower = null;
  closeMenu();
  updateHud();
}

function spawnEnemy(type, pi) {
  const T = ET[type], m = (1 + (S.wave - 1) * 0.07) * (LEVEL ? LEVEL.hpMul : 1);
  const P = PATHS[clamp(pi | 0, 0, PATHS.length - 1)];
  S.enemies.push({ type, T, P, hp: T.hp * m, max: T.hp * m, d: -30, lat: T.kind === 'ram' ? R(-3, 3) : R(-11, 11), speed: T.speed * R(0.95, 1.05),
    slowT: 0, slowF: 1, burnT: 0, burn: 0, phase: R(0, TAU), x: 1400, y: 150, dir: -1, alive: true, cs: T.speed });
}

function startWave() {
  if (S.state !== 'play' || S.wave >= WAVES.length || S.spawnQ.length) return;
  saveCheckpoint();
  if (S.enemies.length > 0) { S.gold += 15; floatText(1150, 120, '+15 za pośpiech', '#ffd35a'); }
  S.wave++; S.waveCleared = false; S.waveTime = 0;
  let t = 0;
  let alt = 0;
  for (const g of WAVES[S.wave - 1]) {
    for (let i = 0; i < g.n; i++) { S.spawnQ.push({ at: t, type: g.t, p: g.p != null ? g.p : (alt++ % PATHS.length) }); t += g.gap; }
    t += 2.5;
  }
  const hasRam = WAVES[S.wave - 1].some(g => g.t === 'ram');
  showBanner(S.wave === WAVES.length ? 'Ostatnia fala! Nadciąga Czarny Lord!' : hasRam ? `Fala ${S.wave}: wróg ma tarany!` : `Fala ${S.wave} nadciąga!`);
  sfx('horn');
  updateHud();
}

const RAIN_R = 85;
function castRain(x, y) {
  S.ab.rain.cd = S.ab.rain.max; S.targeting = null; cv.style.cursor = 'default';
  S.rains.push({ x, y, t: 0, hit: [false, false] });
  for (let i = 0; i < 46; i++) {
    const a = R(0, TAU), r = Math.sqrt(Math.random()) * RAIN_R;
    const tx = x + Math.cos(a) * r, ty = y + Math.sin(a) * r * 0.45;
    S.proj.push({ k: 'arrow', sx: tx + 70, sy: ty, sh: 320, target: null, tx, ty, th: 0, t: -R(0, 0.5), dur: R(0.55, 0.8), arc: 0, dmg: 0, pierce: 0 });
  }
  showBanner('Deszcz strzał!');
  for (let i = 0; i < 3; i++) setTimeout(() => sfx('arrow'), i * 120);
}
function useAbility(k) {
  if (S.state !== 'play' || S.paused) return;
  const a = S.ab[k]; if (!a || a.cd > 0) return;
  ac(); if (AC && AC.state === 'suspended') AC.resume();
  if (k === 'rain') { S.targeting = S.targeting === 'rain' ? null : 'rain'; cv.style.cursor = S.targeting ? 'crosshair' : 'default'; if (S.targeting) showBanner('Wskaż miejsce na mapie'); }
  else if (k === 'horn') { a.cd = a.max; S.hornT = 8; sfx('horn'); showBanner('Róg wojenny! Wieże strzelają szybciej'); }
}

function effDmg(e, dmg, pierce) { return Math.max(dmg * 0.2, dmg - e.T.armor * (1 - pierce)); }
function hurt(e, dmg, pierce) {
  if (!e.alive) return;
  e.hp -= effDmg(e, dmg, pierce);
  if (e.hp <= 0) kill(e);
}
function kill(e) {
  if (!e.alive) return;
  e.alive = false;
  S.gold += e.T.gold;
  floatText(e.x, e.y - e.T.h * e.T.scale - 6, '+' + e.T.gold, '#ffd35a');
  S.corpses.push({ type: e.type, x: e.x, y: e.y, dir: e.dir, phase: e.phase, t: 0 });
  if (e.T.kind === 'ram') { for (let i = 0; i < 16; i++) S.parts.push({ k: 'debris', x: e.x + R(-20, 20), y: e.y - R(10, 35), vx: R(-80, 80), vy: R(-120, -30), g: 380, life: R(0.6, 1), t: 0, s: R(1.5, 3), wood: true }); return; }
  for (let i = 0; i < 6; i++) S.parts.push({ k: 'blood', x: e.x + R(-3, 3), y: e.y - 18, vx: R(-30, 30), vy: R(-50, -10), g: 200, life: R(0.3, 0.6), t: 0, s: R(0.8, 1.6) });
  updateHud();
}
function castleHit(dmg) {
  S.hp = Math.max(0, S.hp - dmg);
  S.shake = 7;
  sfx('castle');
  for (let i = 0; i < 12; i++) S.parts.push({ k: 'dust', x: 128 + R(-20, 20), y: 600 + R(-10, 10), vx: R(-20, 20), vy: R(-30, -5), g: 0, life: R(0.6, 1.2), t: 0, s: R(6, 12) });
  updateHud();
  if (S.hp <= 0) endGame(false);
}

function floatText(x, y, txt, col) { S.parts.push({ k: 'text', x, y, vx: 0, vy: -28, g: 0, life: 1.2, t: 0, txt, col }); }

function predict(e, time) {
  const p = pathAt(e.d + e.cs * time, e.P), nx = -Math.sin(p.ang), ny = Math.cos(p.ang);
  return { x: p.x + nx * e.lat, y: p.y + ny * e.lat };
}

function findTarget(t, range, minR) {
  let best = null, bd = -1e9;
  for (const e of S.enemies) {
    if (!e.alive || e.d < 5) continue;
    const dd = hyp(e.x - t.x, e.y - t.y);
    if (dd <= range && dd >= (minR || 0) && e.d > bd) { bd = e.d; best = e; }
  }
  return best;
}

function fire(t, e) {
  const T = TT[t.type], L = t.lvl, h = towerHeight(t);
  const d = hyp(e.x - t.x, e.y - t.y);
  if (t.type === 'archer') {
    const n = L + 1, xs = [[0], [-7, 7], [-11, 0, 11]][L], i = t.shot % n;
    t.af[i] = 0; t.shot++;
    S.proj.push({ k: 'arrow', sx: t.x + xs[i], sy: t.y + 1, sh: h + 14, target: e, tx: e.x, ty: e.y, th: 18 * e.T.scale, t: 0, dur: d / 430 + 0.12, arc: 18 + d * 0.22, dmg: T.dmg[L], pierce: T.pierce });
    sfx('arrow');
  } else if (t.type === 'crossbow') {
    S.proj.push({ k: 'bolt', sx: t.x + 6, sy: t.y - 4, sh: h + 14, target: e, tx: e.x, ty: e.y, th: 18 * e.T.scale, t: 0, dur: d / 700 + 0.05, arc: d * 0.04, dmg: T.dmg[L], pierce: T.pierce });
    sfx('bolt');
  } else if (t.type === 'catapult') {
    const dur = 1.0 + d / 520;
    const p = predict(e, dur);
    S.proj.push({ k: 'stone', sx: t.x, sy: t.y - 5, sh: 40, target: null, tx: p.x, ty: p.y, th: 0, t: 0, dur, arc: 110 + d * 0.3, dmg: T.dmg[L], pierce: T.pierce, splash: T.splash[L], spin: R(0, 6) });
    sfx('throw');
  } else {
    const p = predict(e, 0.35);
    S.proj.push({ k: 'oil', sx: t.x, sy: t.y, sh: h + 6, target: null, tx: p.x, ty: p.y, th: 0, t: 0, dur: 0.35, arc: 14, dmg: T.dmg[L], pierce: 1, splash: T.splash[L], slow: T.slow[L], burn: T.burn[L] });
    sfx('oil');
  }
}

function impact(p) {
  if (p.k === 'arrow' || p.k === 'bolt') {
    const e = p.target;
    if (e && e.alive) {
      const armored = e.T.armor > 2;
      hurt(e, p.dmg, p.pierce);
      if (armored && p.k === 'arrow') { sfx('clang'); for (let i = 0; i < 3; i++) S.parts.push({ k: 'spark', x: e.x, y: e.y - p.th, vx: R(-60, 60), vy: R(-60, 10), g: 150, life: 0.25, t: 0 }); }
      else for (let i = 0; i < 2; i++) S.parts.push({ k: 'blood', x: e.x, y: e.y - p.th, vx: R(-25, 25), vy: R(-30, 0), g: 200, life: 0.35, t: 0, s: R(0.6, 1.2) });
    } else S.ground.push({ k: 'arrow', x: p.tx, y: p.ty, t: 0, life: 4, a: R(-0.4, 0.4) });
  } else if (p.k === 'stone') {
    for (const e of S.enemies) {
      if (!e.alive) continue;
      const dd = hyp(e.x - p.tx, e.y - p.ty);
      if (dd < p.splash) hurt(e, p.dmg * (1 - 0.5 * dd / p.splash), p.pierce);
    }
    sfx('impact'); S.shake = Math.max(S.shake, 2.5);
    S.ground.push({ k: 'crater', x: p.tx, y: p.ty, t: 0, life: 7, r: p.splash * 0.25 });
    for (let i = 0; i < 14; i++) S.parts.push({ k: 'dust', x: p.tx + R(-10, 10), y: p.ty + R(-4, 4), vx: R(-50, 50), vy: R(-30, -5), g: 0, life: R(0.6, 1.1), t: 0, s: R(5, 11) });
    for (let i = 0; i < 10; i++) S.parts.push({ k: 'debris', x: p.tx, y: p.ty - 3, vx: R(-90, 90), vy: R(-140, -40), g: 380, life: R(0.5, 0.8), t: 0, s: R(1, 2.2) });
  } else if (p.k === 'oil') {
    for (const e of S.enemies) {
      if (!e.alive) continue;
      if (hyp(e.x - p.tx, e.y - p.ty) < p.splash) {
        hurt(e, p.dmg, 1);
        e.slowT = 2.2; e.slowF = Math.min(e.slowF, p.slow);
        e.burnT = 3; e.burn = Math.max(e.burn, p.burn);
      }
    }
    S.ground.push({ k: 'puddle', x: p.tx, y: p.ty, t: 0, life: 2.6, r: p.splash * 0.7 });
    for (let i = 0; i < 10; i++) S.parts.push({ k: 'smoke', x: p.tx + R(-15, 15), y: p.ty + R(-5, 5), vx: R(-8, 8), vy: R(-30, -15), g: 0, life: R(0.8, 1.5), t: 0, s: R(4, 8) });
  }
}

// =====================================================================
//  AKTUALIZACJA
// =====================================================================
function update(dt) {
  S.time += dt;
  if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 20);
  for (const cl of S.clouds) { cl.x -= cl.v * dt; if (cl.x < -cl.r * 2) { cl.x = W + cl.r * 2; cl.y = R(100, 650); } }
  if (S.state !== 'play') return;

  for (const k in S.ab) S.ab[k].cd = Math.max(0, S.ab[k].cd - dt);
  if (S.hornT > 0) S.hornT -= dt;
  for (const r of S.rains) {
    r.t += dt;
    for (const [at, i] of [[0.55, 0], [0.85, 1]]) {
      if (r.t >= at && !r.hit[i]) {
        r.hit[i] = true;
        for (const e of S.enemies) if (e.alive && hyp(e.x - r.x, e.y - r.y) < RAIN_R) hurt(e, 45 + S.wave * 2, 0.35);
      }
    }
  }
  S.rains = S.rains.filter(r => r.t < 1.2);

  if (S.spawnQ.length) {
    S.waveTime += dt;
    while (S.spawnQ.length && S.spawnQ[0].at <= S.waveTime) { const q = S.spawnQ.shift(); spawnEnemy(q.type, q.p); }
    if (!S.spawnQ.length) updateHud();
  }

  for (const e of S.enemies) {
    if (!e.alive) continue;
    let sp = e.speed;
    if (e.slowT > 0) { e.slowT -= dt; sp *= e.slowF; if (e.slowT <= 0) e.slowF = 1; }
    if (e.burnT > 0) {
      e.burnT -= dt; e.hp -= e.burn * dt;
      if (Math.random() < dt * 12) S.parts.push({ k: 'flame', x: e.x + R(-5, 5), y: e.y - R(4, 26) * e.T.scale, vx: R(-5, 5), vy: R(-30, -15), g: 0, life: R(0.3, 0.5), t: 0, s: R(1.5, 3) });
      if (e.hp <= 0) { kill(e); continue; }
    }
    e.cs = sp;
    e.d += sp * dt;
    e.phase += dt * sp * (e.T.kind === 'horse' ? 0.17 : e.T.kind === 'ram' ? 0.3 : 0.22);
    const p = pathAt(e.d, e.P), nx = -Math.sin(p.ang), ny = Math.cos(p.ang);
    e.x = p.x + nx * e.lat; e.y = p.y + ny * e.lat;
    const cx = Math.cos(p.ang);
    if (cx < -0.2) e.dir = -1; else if (cx > 0.2) e.dir = 1;
    if (e.d >= e.P.len) { e.alive = false; castleHit(e.T.dmg); if (S.state !== 'play') return; }
  }
  S.enemies = S.enemies.filter(e => e.alive);

  for (const t of S.towers) {
    const T = TT[t.type], L = t.lvl;
    t.cd -= dt * (S.hornT > 0 ? 1.6 : 1); t.fireT += dt;
    if (t.af) for (let i = 0; i < t.af.length; i++) t.af[i] += dt;
    const e = findTarget(t, T.range[L], T.minR);
    t.target = e;
    if (e) {
      t.aimX = e.x; t.aimY = e.y;
      if (t.cd <= 0) { fire(t, e); t.cd = T.rate[L]; t.fireT = 0; }
    }
    if (t.type === 'oil' && Math.random() < dt * 2.5) S.parts.push({ k: 'steam', x: t.x + R(-4, 4), y: t.y - towerHeight(t) - 14, vx: R(-4, 4), vy: R(-18, -10), g: 0, life: R(1, 1.8), t: 0, s: R(2, 4) });
  }

  for (const p of S.proj) {
    if (p.target && p.target.alive) { p.tx = p.target.x; p.ty = p.target.y; }
    p.t += p.t < 0 ? dt : dt / p.dur;
    if (p.t >= 1) { p.t = 1; p.done = true; impact(p); }
  }
  S.proj = S.proj.filter(p => !p.done);

  for (const q of S.parts) {
    q.t += dt; q.vy += (q.g || 0) * dt; q.x += q.vx * dt; q.y += q.vy * dt;
    if (q.k === 'dust' || q.k === 'smoke') { q.vx *= 0.96; q.vy *= 0.96; }
  }
  S.parts = S.parts.filter(q => q.t < q.life);
  for (const g of S.ground) g.t += dt;
  S.ground = S.ground.filter(g => g.t < g.life);
  for (const c of S.corpses) c.t += dt;
  S.corpses = S.corpses.filter(c => c.t < 6);

  const hpr = S.hp / S.maxHp;
  if (hpr < 0.65 && Math.random() < dt * (hpr < 0.35 ? 8 : 3)) {
    const pts = [[30, 300], [200, 330], [115, 260], [24, 440], [238, 445]];
    const [px, py] = pts[Math.floor(Math.random() * pts.length)];
    S.parts.push({ k: 'smoke', x: px + R(-10, 10), y: py + R(0, 20), vx: R(-12, -3), vy: R(-30, -18), g: 0, life: R(2, 3.5), t: 0, s: R(6, 12), dark: true });
    if (hpr < 0.35) S.parts.push({ k: 'flame', x: px + R(-8, 8), y: py + R(5, 25), vx: R(-5, 5), vy: R(-25, -10), g: 0, life: R(0.4, 0.7), t: 0, s: R(3, 5) });
  }

  if (S.wave > 0 && !S.waveCleared && !S.spawnQ.length && !S.enemies.length) {
    S.waveCleared = true;
    if (S.wave >= WAVES.length) { endGame(true); return; }
    const b = 20 + S.wave * 5;
    S.gold += b;
    showBanner(`Fala ${S.wave} odparta! +${b} złota`);
    if (player && S.wave > player.stats.bestWave) player.stats.bestWave = S.wave;
    updateHud();
    saveCheckpoint();
  }
}

// =====================================================================
//  RENDER
// =====================================================================
function drawEnemy(e) {
  const sc = e.T.scale;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ell(ctx, e.x + 2, e.y + 1, (e.T.kind === 'horse' ? 21 : e.T.kind === 'ram' ? 28 : 8) * sc, (e.T.kind === 'ram' ? 5 : 3.2) * sc); ctx.fill();
  ctx.save(); ctx.translate(e.x, e.y); ctx.scale(e.dir * sc, sc);
  if (e.T.kind === 'horse') drawRider(ctx, e.T.fig, e.phase);
  else if (e.T.kind === 'ram') drawRam(ctx, e.phase, false);
  else drawFigure(ctx, e.T.fig, e.phase, true);
  ctx.restore();
  if (e.slowT > 0) { ctx.fillStyle = 'rgba(40,20,5,0.45)'; ell(ctx, e.x, e.y, 9 * sc, 3 * sc); ctx.fill(); }
}
function drawCorpse(c) {
  const T = ET[c.type], sc = T.scale;
  const a = c.t < 4 ? 1 : 1 - (c.t - 4) / 2;
  const fall = Math.min(1, c.t / 0.45);
  ctx.save(); ctx.globalAlpha = Math.max(0, a);
  ctx.translate(c.x, c.y + fall * 2); ctx.scale(c.dir * sc, sc);
  if (T.kind === 'ram') {
    drawRam(ctx, c.phase, true);
  } else if (T.kind === 'horse') {
    ctx.translate(-14 * fall, 0); ctx.rotate(-fall * 1.25); ctx.translate(14 * fall, 0);
    drawRider(ctx, T.fig, c.phase);
  } else {
    ctx.rotate(-fall * 1.45);
    drawFigure(ctx, T.fig, c.phase, false);
  }
  ctx.restore();
}
function drawGround(g) {
  const a = 1 - g.t / g.life;
  if (g.k === 'crater') {
    ctx.fillStyle = `rgba(55,40,25,${0.5 * a})`; ell(ctx, g.x, g.y, g.r * 1.3, g.r * 0.55); ctx.fill();
    ctx.fillStyle = `rgba(30,20,10,${0.4 * a})`; ell(ctx, g.x, g.y, g.r * 0.7, g.r * 0.3); ctx.fill();
  } else if (g.k === 'puddle') {
    ctx.fillStyle = `rgba(25,12,4,${0.75 * a})`; ell(ctx, g.x, g.y, g.r, g.r * 0.38); ctx.fill();
    ctx.fillStyle = `rgba(255,110,20,${0.25 * a})`; ell(ctx, g.x, g.y, g.r * 0.6, g.r * 0.2); ctx.fill();
    for (let i = 0; i < 6; i++) {
      const fx = g.x + Math.cos(i * 1.7 + g.x) * g.r * 0.6, fy = g.y + Math.sin(i * 2.3) * g.r * 0.22;
      const fh = (5 + Math.sin(S.time * 18 + i * 3) * 2.5) * a;
      ctx.fillStyle = `rgba(255,${150 + i * 10},40,${0.85 * a})`;
      ctx.beginPath(); ctx.moveTo(fx - 2.2, fy); ctx.quadraticCurveTo(fx, fy - fh * 1.6, fx + 2.2, fy); ctx.fill();
    }
  } else if (g.k === 'arrow') {
    ctx.globalAlpha = a; ctx.strokeStyle = '#6b4a26'; ctx.lineWidth = 1;
    line(ctx, g.x, g.y, g.x + Math.sin(g.a) * 7, g.y - 7);
    ctx.fillStyle = '#eee'; ctx.fillRect(g.x + Math.sin(g.a) * 7 - 1, g.y - 8, 2, 2);
    ctx.globalAlpha = 1;
  }
}
function projPos(p, t) {
  const gx = lerp(p.sx, p.tx, t), gy = lerp(p.sy, p.ty, t);
  const hh = lerp(p.sh, p.th, t) + p.arc * 4 * t * (1 - t);
  return { gx, gy, X: gx, Y: gy - hh };
}
function drawProj(p) {
  if (p.t < 0) return;
  const a = projPos(p, p.t), b = projPos(p, Math.min(1, p.t + 0.02));
  const ang = Math.atan2(b.Y - a.Y, b.X - a.X);
  if (p.k === 'stone') {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ell(ctx, a.gx, a.gy, 5, 2); ctx.fill();
    ctx.save(); ctx.translate(a.X, a.Y); ctx.rotate(p.spin + p.t * 10);
    const g = ctx.createRadialGradient(-1.5, -1.5, 0.5, 0, 0, 5.5); g.addColorStop(0, '#c4beb2'); g.addColorStop(1, '#4e4a43');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-5, -1); ctx.lineTo(-2, -5); ctx.lineTo(3.5, -4); ctx.lineTo(5.2, 1); ctx.lineTo(1.5, 4.8); ctx.lineTo(-4, 3.5); ctx.closePath(); ctx.fill();
    ctx.restore();
  } else if (p.k === 'oil') {
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2b1606'; ctx.lineWidth = 3.5;
    ctx.beginPath();
    const t0 = Math.max(0, p.t - 0.6);
    for (let k = 0; k <= 8; k++) { const q = projPos(p, lerp(t0, p.t, k / 8)); k ? ctx.lineTo(q.X, q.Y) : ctx.moveTo(q.X, q.Y); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,140,40,0.6)'; ctx.lineWidth = 1.2; ctx.stroke();
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ell(ctx, a.gx, a.gy, 3, 1); ctx.fill();
    ctx.save(); ctx.translate(a.X, a.Y); ctx.rotate(ang); ctx.lineCap = 'round';
    if (p.k === 'arrow') {
      ctx.strokeStyle = '#6b4a26'; ctx.lineWidth = 1; line(ctx, -7, 0, 4, 0);
      ctx.fillStyle = '#9aa2a9'; ctx.beginPath(); ctx.moveTo(4, -1.3); ctx.lineTo(7, 0); ctx.lineTo(4, 1.3); ctx.fill();
      ctx.strokeStyle = '#e8e0d0'; ctx.lineWidth = 0.9; line(ctx, -7, 0, -9, -1.8); line(ctx, -7, 0, -9, 1.8);
    } else {
      ctx.strokeStyle = '#4a321c'; ctx.lineWidth = 1.8; line(ctx, -5, 0, 4, 0);
      ctx.fillStyle = '#3a3f44'; ctx.beginPath(); ctx.moveTo(4, -1.7); ctx.lineTo(8, 0); ctx.lineTo(4, 1.7); ctx.fill();
      ctx.fillStyle = '#d8d0bf'; ctx.fillRect(-6, -2, 2.5, 1.2); ctx.fillRect(-6, 0.8, 2.5, 1.2);
    }
    ctx.restore();
  }
}
function drawPart(q) {
  const a = 1 - q.t / q.life;
  switch (q.k) {
    case 'dust': ctx.fillStyle = `rgba(150,128,95,${0.45 * a})`; circ(ctx, q.x, q.y, q.s * (1 + q.t * 1.5)); ctx.fill(); break;
    case 'smoke': ctx.fillStyle = q.dark ? `rgba(40,38,36,${0.5 * a})` : `rgba(70,65,60,${0.4 * a})`; circ(ctx, q.x, q.y, q.s * (1 + q.t * 1.2)); ctx.fill(); break;
    case 'steam': ctx.fillStyle = `rgba(220,220,215,${0.3 * a})`; circ(ctx, q.x, q.y, q.s * (1 + q.t)); ctx.fill(); break;
    case 'debris': ctx.fillStyle = q.wood ? '#6b4a2b' : '#6e685e'; ctx.fillRect(q.x, q.y, q.s, q.s); break;
    case 'blood': ctx.fillStyle = `rgba(120,10,10,${a})`; circ(ctx, q.x, q.y, q.s); ctx.fill(); break;
    case 'spark': ctx.strokeStyle = `rgba(255,230,140,${a})`; ctx.lineWidth = 1; line(ctx, q.x, q.y, q.x - q.vx * 0.03, q.y - q.vy * 0.03); break;
    case 'flame': ctx.fillStyle = `rgba(255,${Math.round(120 + 100 * a)},40,${0.9 * a})`; circ(ctx, q.x, q.y, q.s * a + 0.3); ctx.fill(); break;
    case 'text':
      ctx.font = 'bold 15px Georgia, serif'; ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.fillText(q.txt, q.x + 1, q.y + 1);
      ctx.globalAlpha = a; ctx.fillStyle = q.col; ctx.fillText(q.txt, q.x, q.y); ctx.globalAlpha = 1; break;
  }
}
function drawRange(x, y, r, ok) {
  ctx.save();
  ctx.fillStyle = ok ? 'rgba(255,240,200,0.12)' : 'rgba(255,80,60,0.12)';
  circ(ctx, x, y, r); ctx.fill();
  ctx.strokeStyle = ok ? 'rgba(255,240,200,0.65)' : 'rgba(255,80,60,0.6)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]);
  circ(ctx, x, y, r); ctx.stroke();
  ctx.restore();
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (S.shake > 0) ctx.translate(R(-1, 1) * S.shake, R(-1, 1) * S.shake);
  ctx.drawImage(bg, 0, 0, W, H);

  // flagi zamku
  for (let i = 0; i < FLAGS.length; i++) { const f = FLAGS[i]; flag(ctx, f.x, f.y, f.big ? 46 : 30, '#1f4d8a', '#f0f0f0', i * 1.3); }

  const hs = S.hoverSlot;
  if (hs && !hs.tower) { ctx.strokeStyle = 'rgba(255,230,150,0.8)'; ctx.lineWidth = 2; ell(ctx, hs.x, hs.y, 26, 10.5); ctx.stroke(); }
  if (S.sel && S.sel.slot && !S.sel.slot.tower) { ctx.strokeStyle = 'rgba(255,210,90,1)'; ctx.lineWidth = 2.5; ell(ctx, S.sel.slot.x, S.sel.slot.y, 27, 11); ctx.stroke(); }

  for (const g of S.ground) drawGround(g);
  for (const c of S.corpses) drawCorpse(c);

  if (S.preview) drawRange(S.preview.x, S.preview.y, S.preview.r, true);
  else if (S.sel && S.sel.tower) drawRange(S.sel.tower.x, S.sel.tower.y, TT[S.sel.tower.type].range[S.sel.tower.lvl], true);
  else if (S.hoverTower) drawRange(S.hoverTower.x, S.hoverTower.y, TT[S.hoverTower.type].range[S.hoverTower.lvl], true);

  const list = [];
  for (const t of S.towers) list.push({ y: t.y, t });
  for (const e of S.enemies) list.push({ y: e.y, e });
  list.sort((a, b) => a.y - b.y);
  if (S.hornT > 0) for (const t of S.towers) {
    const a = 0.35 + Math.sin(S.time * 8) * 0.15;
    ctx.strokeStyle = `rgba(255,200,80,${a})`; ctx.lineWidth = 3; ell(ctx, t.x, t.y, 30, 11); ctx.stroke();
  }
  for (const o of list) { if (o.t) drawTower(ctx, o.t); else drawEnemy(o.e); }

  for (const p of S.proj) drawProj(p);
  for (const q of S.parts) drawPart(q);
  for (const r of S.rains) {
    const a = Math.max(0, 1 - r.t / 1.2);
    ctx.strokeStyle = `rgba(255,220,140,${0.5 * a})`; ctx.lineWidth = 2; ell(ctx, r.x, r.y, RAIN_R, RAIN_R * 0.45); ctx.stroke();
  }
  if (S.targeting === 'rain' && S.mouse.x > 0) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,210,120,0.15)'; ell(ctx, S.mouse.x, S.mouse.y, RAIN_R, RAIN_R * 0.45); ctx.fill();
    ctx.strokeStyle = 'rgba(255,220,140,0.9)'; ctx.lineWidth = 2; ctx.setLineDash([8, 5]); ell(ctx, S.mouse.x, S.mouse.y, RAIN_R, RAIN_R * 0.45); ctx.stroke();
    ctx.restore();
  }
  if (SNOW) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 160; i++) {
      const sp = 22 + (i % 7) * 7;
      const x = ((i * 977 + S.time * (8 + i % 5 * 3) + Math.sin(S.time * 0.8 + i) * 12) % (W + 20) + W + 20) % (W + 20) - 10;
      const y = ((i * 431 + S.time * sp) % (H + 20)) - 10;
      circ(ctx, x, y, 0.8 + (i % 3) * 0.5); ctx.fill();
    }
  }

  for (const cl of S.clouds) {
    const g = ctx.createRadialGradient(cl.x, cl.y, 0, cl.x, cl.y, cl.r);
    g.addColorStop(0, 'rgba(0,0,20,0.1)'); g.addColorStop(1, 'rgba(0,0,20,0)');
    ctx.fillStyle = g; ctx.save(); ctx.translate(cl.x, cl.y); ctx.scale(1.6, 0.8); ctx.translate(-cl.x, -cl.y); ctx.fillRect(cl.x - cl.r, cl.y - cl.r, cl.r * 2, cl.r * 2); ctx.restore();
  }

  for (const e of S.enemies) {
    if (e.hp >= e.max) continue;
    const bw = e.type === 'lord' ? 40 : e.type === 'ram' ? 32 : 22, y = e.y - e.T.h * e.T.scale - 6;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(e.x - bw / 2 - 1, y - 1, bw + 2, 5);
    const r = clamp(e.hp / e.max, 0, 1);
    ctx.fillStyle = r > 0.5 ? '#6cc04a' : r > 0.25 ? '#e0b030' : '#d23a2a';
    ctx.fillRect(e.x - bw / 2, y, bw * r, 3);
  }

  // pasek życia zamku
  const r = S.hp / S.maxHp;
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(48, 655, 164, 12);
  ctx.fillStyle = r > 0.5 ? '#6cc04a' : r > 0.25 ? '#e0b030' : '#d23a2a'; ctx.fillRect(50, 657, 160 * r, 8);
  ctx.font = 'bold 12px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#f3e6c4';
  ctx.fillText('Zamek ' + S.hp + ' / ' + S.maxHp, 130, 682);
}

// =====================================================================
//  INTERFEJS
// =====================================================================
const $ = id => document.getElementById(id);
const menu = $('menu'), bannerEl = $('banner');
let bannerTimer = 0;
function showBanner(txt) { bannerEl.textContent = txt; bannerEl.classList.add('show'); clearTimeout(bannerTimer); bannerTimer = setTimeout(() => bannerEl.classList.remove('show'), 2600); }

function updateHud() {
  $('pname').textContent = player ? player.name : '—';
  $('hp').textContent = S.hp + ' / ' + S.maxHp;
  $('gold').textContent = S.gold;
  $('wave').textContent = S.wave + ' / ' + WAVES.length;
  $('lvlname').textContent = LEVEL ? LEVEL.name : '';
  const nw = WAVES[S.wave];
  if (nw && S.state === 'play') {
    const cnt = {};
    for (const g of nw) cnt[g.t] = (cnt[g.t] || 0) + g.n;
    $('nextWave').innerHTML = 'Następna fala: ' + Object.entries(cnt).map(([t, n]) => `<b>${n}×</b> ${ET[t].name}`).join(' · ');
    $('nextWave').style.display = '';
  } else $('nextWave').style.display = 'none';
  const bw = $('btnWave');
  if (S.wave >= WAVES.length) { bw.textContent = 'Ostatnia fala'; bw.disabled = true; }
  else if (S.spawnQ.length) { bw.textContent = 'Fala trwa…'; bw.disabled = true; }
  else { bw.textContent = 'Wyślij falę ' + (S.wave + 1) + (S.enemies.length ? ' (+15)' : ''); bw.disabled = S.state !== 'play'; }
  if (S.sel) refreshMenu();
}

const ICONS = {};
function makeIcons() {
  for (const k of Object.keys(TT)) {
    const c = document.createElement('canvas'); c.width = 108; c.height = 108;
    const x = c.getContext('2d'); x.scale(1.5, 1.5);
    const t = { type: k, lvl: 0, x: 36, y: 62, aimX: 0, aimY: 62, fireT: 99, cd: 0, af: [9, 9, 9], target: null };
    if (k === 'catapult') { t.y = 60; }
    drawTower(x, t);
    ICONS[k] = c.toDataURL();
  }
}

function placeMenu(x, y) {
  menu.classList.remove('hidden');
  const sc = wrap.clientWidth / W, mw = menu.offsetWidth, mh = menu.offsetHeight;
  let left = x * sc + 34 * sc, top = y * sc - mh / 2 - 20 * sc;
  if (left + mw > wrap.clientWidth - 6) left = x * sc - 34 * sc - mw;
  top = clamp(top, 46, wrap.clientHeight - mh - 6);
  menu.style.left = Math.max(6, left) + 'px'; menu.style.top = top + 'px';
}
function closeMenu() { S.sel = null; S.preview = null; menu.classList.add('hidden'); }

function buildMenuHtml(slot) {
  let h = '<h3>Zbuduj wieżę</h3>';
  for (const [k, T] of Object.entries(TT)) {
    h += `<button class="opt" data-act="build" data-t="${k}" ${S.gold < T.cost[0] ? 'disabled' : ''}>
      <img src="${ICONS[k]}" alt=""><div class="txt"><b>${T.name}</b><small>${T.desc}</small></div><span class="cost">${T.cost[0]} zł</span></button>`;
  }
  return h;
}
function statRows(T, L, next) {
  const row = (n, v, nv) => `<tr><td>${n}</td><td>${v}</td>${next ? `<td class="up">${nv !== v ? '→ ' + nv : ''}</td>` : ''}</tr>`;
  const N = next ? L + 1 : L;
  let h = '<table>';
  h += row('Obrażenia', T.dmg[L], T.dmg[N]);
  h += row('Zasięg', T.range[L], T.range[N]);
  h += row('Strzałów / min', Math.round(60 / T.rate[L]), Math.round(60 / T.rate[N]));
  if (T.splash) h += row('Obszar', T.splash[L], T.splash[N]);
  if (T.slow) h += row('Spowolnienie', Math.round((1 - T.slow[L]) * 100) + '%', Math.round((1 - T.slow[N]) * 100) + '%');
  h += row('Przebicie zbroi', Math.round(T.pierce * 100) + '%', Math.round(T.pierce * 100) + '%');
  return h + '</table>';
}
function towerMenuHtml(t) {
  const T = TT[t.type], L = t.lvl, canUp = L < 2;
  const sell = Math.floor(t.spent * 0.7);
  let h = `<h3>${T.name} · poziom ${LV[L]}</h3>` + statRows(T, L, canUp);
  h += '<div class="row">';
  if (canUp) h += `<button class="btn" data-act="up" ${S.gold < T.cost[L + 1] ? 'disabled' : ''}>Ulepsz (${T.cost[L + 1]} zł)</button>`;
  else h += '<button class="btn" disabled>Maks. poziom</button>';
  h += `<button class="btn" data-act="sell">Sprzedaj (+${sell})</button></div>`;
  return h;
}
function openBuildMenu(slot) { S.sel = { slot }; menu.innerHTML = buildMenuHtml(slot); placeMenu(slot.x, slot.y - 20); }
function openTowerMenu(t) { S.sel = { tower: t }; menu.innerHTML = towerMenuHtml(t); placeMenu(t.x, t.y - 30); }
function refreshMenu() {
  if (!S.sel) return;
  if (S.sel.slot) menu.querySelectorAll('.opt').forEach(b => { b.disabled = S.gold < TT[b.dataset.t].cost[0]; });
  else if (S.sel.tower) { const t = S.sel.tower, up = menu.querySelector('[data-act="up"]'); if (up) up.disabled = S.gold < TT[t.type].cost[t.lvl + 1]; }
}

menu.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]'); if (!b || b.disabled) return;
  const act = b.dataset.act;
  if (act === 'build' && S.sel && S.sel.slot) {
    const T = TT[b.dataset.t], slot = S.sel.slot;
    if (S.gold < T.cost[0] || slot.tower) return;
    S.gold -= T.cost[0];
    const t = { type: b.dataset.t, lvl: 0, slot, x: slot.x, y: slot.y, cd: 0.4, fireT: 99, aimX: slot.x - 60, aimY: slot.y, spent: T.cost[0], target: null, af: [9, 9, 9], shot: 0 };
    slot.tower = t; S.towers.push(t);
    for (let i = 0; i < 10; i++) S.parts.push({ k: 'dust', x: slot.x + R(-20, 20), y: slot.y + R(-5, 5), vx: R(-20, 20), vy: R(-20, -5), g: 0, life: R(0.5, 0.9), t: 0, s: R(4, 8) });
    sfx('build'); closeMenu(); updateHud(); saveCheckpoint();
  } else if (act === 'up' && S.sel && S.sel.tower) {
    const t = S.sel.tower, T = TT[t.type], c = T.cost[t.lvl + 1];
    if (t.lvl >= 2 || S.gold < c) return;
    S.gold -= c; t.spent += c; t.lvl++;
    for (let i = 0; i < 10; i++) S.parts.push({ k: 'dust', x: t.x + R(-18, 18), y: t.y + R(-5, 5), vx: R(-20, 20), vy: R(-20, -5), g: 0, life: R(0.5, 0.9), t: 0, s: R(4, 8) });
    sfx('build'); openTowerMenu(t); updateHud(); saveCheckpoint();
  } else if (act === 'sell' && S.sel && S.sel.tower) {
    const t = S.sel.tower;
    S.gold += Math.floor(t.spent * 0.7);
    t.slot.tower = null; S.towers = S.towers.filter(x => x !== t);
    for (let i = 0; i < 14; i++) S.parts.push({ k: 'dust', x: t.x + R(-18, 18), y: t.y - R(0, 30), vx: R(-20, 20), vy: R(-10, 10), g: 0, life: R(0.6, 1), t: 0, s: R(5, 9) });
    closeMenu(); updateHud(); saveCheckpoint();
  }
});
menu.addEventListener('mouseover', ev => {
  const b = ev.target.closest('[data-act]');
  if (!b || !S.sel) { if (S.sel) S.preview = null; return; }
  if (b.dataset.act === 'build') S.preview = { x: S.sel.slot.x, y: S.sel.slot.y, r: TT[b.dataset.t].range[0] };
  else if (b.dataset.act === 'up' && S.sel.tower && S.sel.tower.lvl < 2) S.preview = { x: S.sel.tower.x, y: S.sel.tower.y, r: TT[S.sel.tower.type].range[S.sel.tower.lvl + 1] };
  else S.preview = null;
});
menu.addEventListener('mouseleave', () => { S.preview = null; });

function gamePos(ev) { const r = cv.getBoundingClientRect(); return { x: (ev.clientX - r.left) / r.width * W, y: (ev.clientY - r.top) / r.height * H }; }
function towerAt(x, y) {
  let best = null;
  for (const t of S.towers) { const h = towerHeight(t); if (Math.abs(x - t.x) < 26 && y < t.y + 12 && y > t.y - h - 26) { if (!best || t.y > best.y) best = t; } }
  return best;
}
function slotAt(x, y) { return SLOTS.find(s => !s.tower && hyp(x - s.x, (y - s.y) * 1.6) < 30) || null; }

cv.addEventListener('pointerdown', ev => {
  ac(); if (AC && AC.state === 'suspended') AC.resume();
  if (S.state !== 'play') return;
  const { x, y } = gamePos(ev);
  if (S.targeting === 'rain') { if (ev.button === 0) castRain(x, y); else { S.targeting = null; cv.style.cursor = 'default'; } return; }
  const t = towerAt(x, y); if (t) { openTowerMenu(t); return; }
  const s = slotAt(x, y); if (s) { openBuildMenu(s); return; }
  closeMenu();
});
cv.addEventListener('pointermove', ev => {
  const { x, y } = gamePos(ev);
  S.mouse = { x, y };
  if (S.targeting) { S.hoverTower = S.hoverSlot = null; return; }
  S.hoverTower = towerAt(x, y);
  S.hoverSlot = S.hoverTower ? null : slotAt(x, y);
  cv.style.cursor = (S.hoverTower || S.hoverSlot) ? 'pointer' : 'default';
});

$('abRain').onclick = () => useAbility('rain');
$('abHorn').onclick = () => useAbility('horn');
cv.addEventListener('contextmenu', ev => { if (S.targeting) { ev.preventDefault(); S.targeting = null; cv.style.cursor = 'default'; } });
function updateAbilities() {
  for (const [k, id] of [['rain', 'abRain'], ['horn', 'abHorn']]) {
    const a = S.ab[k], el = $(id);
    el.querySelector('.cdov').style.height = (a.cd / a.max * 100) + '%';
    el.classList.toggle('ready', a.cd <= 0);
    el.classList.toggle('active', (k === 'rain' && S.targeting === 'rain') || (k === 'horn' && S.hornT > 0));
  }
}
$('btnWave').onclick = () => { ac(); if (AC && AC.state === 'suspended') AC.resume(); startWave(); };
$('btnSpeed').onclick = () => { S.speed = S.speed === 1 ? 2 : S.speed === 2 ? 3 : 1; $('btnSpeed').textContent = '×' + S.speed; };
function togglePause() { if (S.state !== 'play') return; S.paused = !S.paused; $('btnPause').textContent = S.paused ? 'Wznów' : 'Pauza'; if (S.paused) showBanner('Pauza'); }
$('btnPause').onclick = togglePause;
$('btnMute').onclick = () => { muted = !muted; $('btnMute').textContent = muted ? 'Dźwięk: wył.' : 'Dźwięk: wł.'; };
window.addEventListener('keydown', ev => {
  if (ev.code === 'Space') { ev.preventDefault(); togglePause(); }
  else if (ev.code === 'KeyN') startWave();
  else if (ev.code === 'Escape') { closeMenu(); S.targeting = null; cv.style.cursor = 'default'; }
  else if (ev.code === 'KeyQ') useAbility('rain');
  else if (ev.code === 'KeyW') useAbility('horn');
});

// =====================================================================
//  GRACZE I ZAPIS POSTĘPU (localStorage)
// =====================================================================
const STORE_KEY = 'obronaZamku.v1';
let DB = { players: [], last: null };
let player = null;
let storageOk = true;
function loadDB() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { const d = JSON.parse(raw); if (d && Array.isArray(d.players)) DB = d; }
  } catch (e) { storageOk = false; }
}
function saveDB() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); } catch (e) { storageOk = false; }
}
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
function fmtDate(ts) { try { return new Date(ts).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }

// Zapis możliwy tylko między falami; w trakcie fali zostaje zapis z jej początku.
function midWave() { return S.spawnQ.length > 0 || S.enemies.length > 0; }
function saveCheckpoint() {
  if (!player || S.state !== 'play' || midWave()) return;
  player.save = {
    level: LEVEL_I, gold: S.gold, hp: S.hp, wave: S.wave, ts: Date.now(),
    towers: S.towers.map(t => ({ s: SLOTS.indexOf(t.slot), type: t.type, lvl: t.lvl, spent: t.spent })),
  };
  saveDB();
}
function applySave(sv) {
  S.gold = sv.gold; S.hp = sv.hp; S.wave = sv.wave; S.waveCleared = true;
  for (const d of sv.towers) {
    const slot = SLOTS[d.s]; if (!slot || slot.tower || !TT[d.type]) continue;
    const t = { type: d.type, lvl: clamp(d.lvl | 0, 0, 2), slot, x: slot.x, y: slot.y, cd: 0.4, fireT: 99, aimX: slot.x - 60, aimY: slot.y, spent: d.spent, target: null, af: [9, 9, 9], shot: 0 };
    slot.tower = t; S.towers.push(t);
  }
}
// Uzupełnia dane graczy zapisane przez starszą wersję gry
function normPlayer(p) {
  p.stats = Object.assign({ games: 0, wins: 0, bestWave: 0 }, p.stats || {});
  p.progress = p.progress || { unlocked: 1, stars: [] };
  while (p.progress.stars.length < LEVELS.length) p.progress.stars.push(0);
  if (p.save && p.save.level == null) p.save.level = 0;
  return p;
}
const starStr = n => '★'.repeat(n) + '☆'.repeat(3 - n);

function startGame(fromSave, lvl) {
  const L = fromSave && player && player.save ? (player.save.level || 0) : (lvl != null ? lvl : LEVEL_I);
  if (L !== LEVEL_I || !LEVEL) loadLevel(L);
  reset();
  S.state = 'play';
  if (fromSave && player && player.save) applySave(player.save);
  else if (player) { player.save = null; player.stats.games++; saveDB(); }
  $('overlay').classList.add('hidden');
  ac(); if (AC && AC.state === 'suspended') AC.resume();
  S.paused = false; $('btnPause').textContent = 'Pauza';
  updateHud();
  saveCheckpoint();
  const nm = `Plansza ${LEVEL_I + 1}: ${LEVEL.name}`;
  showBanner(fromSave && S.wave > 0 ? `Witaj ponownie, ${player.name}! Gotowy na falę ${S.wave + 1}?` : nm);
}

function selectPlayer(id) {
  player = DB.players.find(p => p.id === id) || null;
  if (player) normPlayer(player);
  DB.last = player ? player.id : null;
  saveDB();
  showPlayerScreen();
}

function showPlayerScreen(msg) {
  S.state = 'menu';
  S.targeting = null;
  closeMenu();
  DB.players.forEach(normPlayer);
  const list = DB.players.slice().sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
  let h = '<h1>Obrona Zamku</h1>';
  if (msg) h += `<p class="msg">${msg}</p>`;
  if (!storageOk) h += '<p class="msg warn">Przeglądarka blokuje zapis. Postęp nie zostanie zachowany po zamknięciu strony.</p>';
  h += '<h2>Wybierz gracza</h2><div class="players">';
  if (!list.length) h += '<p class="empty">Nie ma jeszcze żadnego gracza. Wpisz swoje imię poniżej.</p>';
  for (const p of list) {
    const sv = p.save;
    const info = sv ? `Zapis: ${esc(LEVELS[sv.level].name)}, przed falą ${sv.wave + 1}/${LEVELS[sv.level].waves.length}, zamek ${sv.hp}/20 · ${fmtDate(sv.ts)}` : 'Brak zapisanej gry';
    const stars = p.progress.stars.reduce((a, b) => a + b, 0);
    h += `<div class="pl ${player && player.id === p.id ? 'sel' : ''}" data-pid="${p.id}">
      <div class="pname">${esc(p.name)} <span class="pstars">★ ${stars} / ${LEVELS.length * 3}</span></div>
      <div class="pinfo">${info}<br>Gry: ${p.stats.games} · Zwycięstwa: ${p.stats.wins}</div>
      <button class="del" data-del="${p.id}" title="Usuń gracza">✕</button></div>`;
  }
  h += '</div>';
  h += `<form class="newp" id="newPlayer"><input id="newName" maxlength="20" placeholder="Imię nowego gracza" autocomplete="off"><button class="btn" type="submit">Dodaj gracza</button></form>`;
  if (player) {
    if (player.save) h += `<div class="actions"><button class="btn big" id="btnContinue">Kontynuuj: ${esc(LEVELS[player.save.level].name)}, fala ${player.save.wave + 1}</button></div>`;
    h += `<h2>Kampania gracza ${esc(player.name)}</h2><div class="levels">`;
    LEVELS.forEach((L, i) => {
      const locked = i >= player.progress.unlocked;
      h += `<button class="lvl ${locked ? 'locked' : ''}" data-lvl="${i}" ${locked ? 'disabled' : ''}>
        <span class="lnum">Plansza ${i + 1}</span><span class="lname">${L.name}</span>
        <span class="lstars">${locked ? 'Zablokowana' : starStr(player.progress.stars[i])}</span>
        <span class="ldesc">${locked ? 'Wygraj poprzednią planszę, żeby ją odblokować.' : L.desc + ` (${L.waves.length} fal)`}</span></button>`;
    });
    h += '</div>';
  }
  h += `<details><summary>Jak grać?</summary><ul>
    <li><b>Łucznicy</b>: szybkie strzały, słabe na ciężkie zbroje.</li>
    <li><b>Kusznicy</b>: wolniejsze bełty, które przebijają pancerz. Najlepsi na tarany i ciężkozbrojnych.</li>
    <li><b>Katapulta</b>: kamienie ranią całe grupy wrogów.</li>
    <li><b>Wrząca smoła</b>: parzy i spowalnia wrogów przy samej wieży.</li>
    <li><b>Deszcz strzał</b> (Q): wskaż miejsce na mapie, a łucznicy z murów zasypią je strzałami.</li>
    <li><b>Róg wojenny</b> (W): przez 8 sekund wszystkie wieże strzelają szybciej.</li>
    <li>Kliknij kamienne miejsce przy drodze, żeby zbudować wieżę. Kliknij wieżę, żeby ją ulepszyć albo sprzedać.</li>
    <li>Gwiazdki za planszę: 3 gdy zamek ma co najmniej 18 punktów, 2 od 10 punktów, 1 za samo zwycięstwo.</li>
    <li>Gra zapisuje się sama między falami. Jeśli wyjdziesz w trakcie fali, wrócisz do jej początku.</li></ul></details>`;
  $('panel').innerHTML = h;
  $('overlay').classList.remove('hidden');
  updateHud();

  $('panel').querySelectorAll('.pl').forEach(el => el.addEventListener('click', ev => {
    if (ev.target.closest('.del')) return;
    selectPlayer(el.dataset.pid);
  }));
  $('panel').querySelectorAll('.del').forEach(el => el.addEventListener('click', () => {
    const p = DB.players.find(x => x.id === el.dataset.del); if (!p) return;
    if (!confirm(`Usunąć gracza „${p.name}” razem z jego zapisem?`)) return;
    DB.players = DB.players.filter(x => x !== p);
    if (player === p) { player = null; DB.last = null; }
    saveDB(); showPlayerScreen();
  }));
  $('newPlayer').addEventListener('submit', ev => {
    ev.preventDefault();
    const name = $('newName').value.trim().replace(/\s+/g, ' ');
    if (!name) { $('newName').focus(); return; }
    if (DB.players.some(p => p.name.toLowerCase() === name.toLowerCase())) { showPlayerScreen(`Gracz „${esc(name)}” już istnieje. Wybierz go z listy.`); return; }
    const p = normPlayer({ id: 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e4), name, created: Date.now(), lastPlayed: Date.now(), save: null });
    DB.players.push(p); selectPlayer(p.id);
  });
  if ($('btnContinue')) $('btnContinue').onclick = () => { player.lastPlayed = Date.now(); startGame(true); };
  $('panel').querySelectorAll('.lvl:not(.locked)').forEach(el => el.addEventListener('click', () => {
    const i = +el.dataset.lvl;
    if (player.save && !confirm('Rozpocząć tę planszę od nowa? Obecny zapis zostanie nadpisany.')) return;
    player.lastPlayed = Date.now(); startGame(false, i);
  }));
  if (!list.length) setTimeout(() => $('newName') && $('newName').focus(), 50);
}

$('btnMenu').onclick = () => {
  if (S.state === 'play' && midWave() && !confirm('Trwa fala. Jeśli wyjdziesz teraz, wrócisz do jej początku. Wyjść do menu?')) return;
  saveCheckpoint();
  showPlayerScreen(player && player.save ? 'Gra zapisana.' : '');
};

function endGame(win) {
  S.state = win ? 'win' : 'over';
  S.targeting = null;
  closeMenu();
  const built = S.towers.length;
  const stars = S.hp >= 18 ? 3 : S.hp >= 10 ? 2 : 1;
  const hasNext = LEVEL_I + 1 < LEVELS.length;
  let rec = '';
  if (player) {
    if (win) {
      player.stats.wins++;
      if (stars > player.progress.stars[LEVEL_I]) { player.progress.stars[LEVEL_I] = stars; rec = '<p class="msg">Nowy rekord na tej planszy!</p>'; }
      if (hasNext && player.progress.unlocked < LEVEL_I + 2) { player.progress.unlocked = LEVEL_I + 2; rec += `<p class="msg">Odblokowano planszę ${LEVEL_I + 2}: ${LEVELS[LEVEL_I + 1].name}!</p>`; }
    }
    player.save = null; player.lastPlayed = Date.now();
    saveDB();
  }
  const who = player ? esc(player.name) + ', ' : '';
  let btns = '';
  if (win && hasNext) btns += `<button class="btn big" id="btnNext">Następna plansza</button>`;
  btns += `<button class="btn big" id="btnAgain">${win ? 'Zagraj ponownie' : 'Spróbuj ponownie'}</button><button class="btn big" id="btnPlayers">Menu</button>`;
  $('panel').innerHTML = (win
    ? `<h1>Zwycięstwo!</h1><div class="bigstars">${starStr(stars)}</div><p>${who}${LEVEL.name} obroniony! Zamek przetrwał z ${S.hp} / ${S.maxHp} punktami wytrzymałości.</p><p>Wież na polu bitwy: ${built}.</p>`
      + (!hasNext ? '<p>To była ostatnia plansza kampanii. Królestwo jest bezpieczne!</p>' : '')
    : `<h1>Zamek upadł</h1><p>Wrogowie przełamali bramę podczas fali ${S.wave} z ${WAVES.length} (${LEVEL.name}).</p><p>Kusznicy dobrze radzą sobie z taranami i ciężkozbrojnymi, a smoła przy zakrętach spowalnia całe grupy. Pamiętaj też o umiejętnościach Q i W.</p>`)
    + rec + `<div class="actions">${btns}</div>`;
  $('overlay').classList.remove('hidden');
  if ($('btnNext')) $('btnNext').onclick = () => startGame(false, LEVEL_I + 1);
  $('btnAgain').onclick = () => startGame(false, LEVEL_I);
  $('btnPlayers').onclick = () => showPlayerScreen();
  updateHud();
}

// =====================================================================
//  PĘTLA
// =====================================================================
let last = performance.now();
function loop(now) {
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!S.paused) {
    const steps = S.speed;
    for (let i = 0; i < steps; i++) update(dt);
  }
  render();
  updateAbilities();
  requestAnimationFrame(loop);
}

resize();
loadLevel(0);
reset();
makeIcons();
loadDB();
player = DB.players.find(p => p.id === DB.last) || null;
if (player && player.save) loadLevel(player.save.level || 0);
showPlayerScreen();

// Tryb testowy: index.html#demo — stawia wieże i przewija grę
if (location.hash.startsWith('#demo')) {
  const [w, f, lv] = location.hash.slice(5).split('-');
  player = null;
  startGame(false, parseInt(lv || '0', 10));
  S.gold = 99999;
  const types = ['archer', 'crossbow', 'catapult', 'oil'];
  SLOTS.forEach((s, i) => {
    if (i % 2) return;
    const type = types[(i / 2) % 4], T = TT[type];
    const t = { type, lvl: (i / 2) % 3, slot: s, x: s.x, y: s.y, cd: 0.4, fireT: 99, aimX: s.x - 60, aimY: s.y, spent: T.cost[0], target: null, af: [9, 9, 9], shot: 0 };
    s.tower = t; S.towers.push(t);
  });
  S.wave = parseInt(w || '11', 10);
  startWave();
  for (let i = 0, n = parseInt(f || '1100', 10); i < n; i++) update(1 / 60);
}
// Hak testowy (tylko z #debug w adresie)
if (location.hash.includes('debug')) window.__z = { S, endGame, get player() { return player; }, get level() { return LEVEL_I; } };
requestAnimationFrame(loop);
})();

(() => {
'use strict';
const VD = window.VILLAGE_DATA;
const cv = document.getElementById('c');
const gl = cv.getContext('webgl2', { antialias: false, alpha: false });
if (!gl) { document.getElementById('nogl').style.display = 'flex'; document.getElementById('start').style.display = 'none'; return; }
const TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
document.getElementById('how').innerHTML = TOUCH
  ? '左下のスティックで歩く・画面をドラッグで見回す<br>村人に近づくと話しかけてくれます'
  : 'WASD / 矢印キーで歩く・ドラッグで見回す・Shiftで走る<br>村人に近づくと話しかけてくれます';

// ================= utils =================
function rngf(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const R = rngf(20261117);
const pick = (a, r = R) => a[Math.floor(r() * a.length)];
const hex = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const vary = (c, a = 0.08, r = R) => { const k = 1 + (r() - 0.5) * a; return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)]; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function T(px, pz, th, py = 0) { const c = Math.cos(th), s = Math.sin(th); return (x, y, z) => [px + x * c + z * s, py + y, pz - x * s + z * c]; }
const I = T(0, 0, 0);

class Geo {
  constructor() { this.p = []; this.n = []; this.c = []; }
  tri(a, b, c, col, mat = 0, ctr = null) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz); if (l < 1e-12) return;
    nx /= l; ny /= l; nz /= l;
    if (ctr) {
      const mx = (a[0] + b[0] + c[0]) / 3 - ctr[0], my = (a[1] + b[1] + c[1]) / 3 - ctr[1], mz = (a[2] + b[2] + c[2]) / 3 - ctr[2];
      if (nx * mx + ny * my + nz * mz < 0) { const t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz; }
    }
    const r = col[0] * 255 | 0, g = col[1] * 255 | 0, bb = col[2] * 255 | 0;
    for (const v of [a, b, c]) { this.p.push(v[0], v[1], v[2]); this.n.push(nx, ny, nz); this.c.push(r, g, bb, mat); }
  }
  quad(a, b, c, d, col, mat, ctr) { this.tri(a, b, c, col, mat, ctr); this.tri(a, c, d, col, mat, ctr); }
  rawTri(vs, cols, mat, nrm = [0, 1, 0]) {
    for (let i = 0; i < 3; i++) { this.p.push(...vs[i]); this.n.push(...nrm); this.c.push(cols[i][0] * 255 | 0, cols[i][1] * 255 | 0, cols[i][2] * 255 | 0, mat); }
  }
  upload() {
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const mk = (data, loc, size, type, norm) => {
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, type, norm, 0, 0);
    };
    mk(new Float32Array(this.p), 0, 3, gl.FLOAT, false);
    mk(new Float32Array(this.n), 1, 3, gl.FLOAT, false);
    mk(new Uint8Array(this.c), 2, 4, gl.UNSIGNED_BYTE, true);
    gl.bindVertexArray(null);
    const count = this.p.length / 3; this.p = this.n = this.c = null;
    return { vao, count };
  }
}

// ================= primitives =================
function box(g, tf, x, y0, z, sx, sy, sz, col, mat = 0, bottom = false) {
  const c = [];
  for (let i = 0; i < 8; i++) c.push(tf(x + (i & 1 ? sx / 2 : -sx / 2), y0 + (i & 2 ? sy : 0), z + (i & 4 ? sz / 2 : -sz / 2)));
  const ctr = tf(x, y0 + sy / 2, z);
  const F = [[0, 2, 6, 4], [1, 3, 7, 5], [2, 3, 7, 6], [0, 1, 3, 2], [4, 5, 7, 6]];
  if (bottom) F.push([0, 1, 5, 4]);
  for (const f of F) g.quad(c[f[0]], c[f[1]], c[f[2]], c[f[3]], col, mat, ctr);
}
function roof(g, tf, x, y0, z, L, D, rh, col, mat = 9, gableCol = null) {
  const FL = tf(x - L / 2, y0, z + D / 2), FR = tf(x + L / 2, y0, z + D / 2), BR = tf(x + L / 2, y0, z - D / 2), BL = tf(x - L / 2, y0, z - D / 2);
  const RL = tf(x - L / 2, y0 + rh, z), RR = tf(x + L / 2, y0 + rh, z), ctr = tf(x, y0 + rh * 0.35, z);
  g.quad(FL, FR, RR, RL, col, mat, ctr); g.quad(BL, BR, RR, RL, col, mat, ctr);
  const gab = gableCol || [col[0] * 0.92, col[1] * 0.92, col[2] * 0.92];
  g.tri(FL, BL, RL, gab, 0, ctr); g.tri(FR, BR, RR, gab, 0, ctr); g.quad(FL, FR, BR, BL, gab, 0, ctr);
}
function cyl(g, tf, x, y0, z, r0, r1, h, n, col, mat = 0, caps = true, rot0 = 0) {
  const ctr = tf(x, y0 + h / 2, z), B = [], Tp = [];
  for (let i = 0; i <= n; i++) {
    const a = rot0 + i / n * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    B.push(tf(x + ca * r0, y0, z + sa * r0)); Tp.push(tf(x + ca * r1, y0 + h, z + sa * r1));
  }
  const top = tf(x, y0 + h, z), bot = tf(x, y0, z);
  for (let i = 0; i < n; i++) {
    if (r1 > 1e-6) g.quad(B[i], B[i + 1], Tp[i + 1], Tp[i], col, mat, ctr); else g.tri(B[i], B[i + 1], top, col, mat, ctr);
    if (caps && r1 > 1e-6) g.tri(Tp[i], Tp[i + 1], top, col, mat, ctr);
    if (caps && r0 > 1e-6 && y0 > 0.05) g.tri(B[i], B[i + 1], bot, col, mat, ctr);
  }
}
function tube(g, tf, a, b, r, n, col, mat = 0) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d); if (L < 1e-6) return;
  const w = d.map(v => v / L); let u = Math.abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let x = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; const xl = Math.hypot(...x); x = x.map(v => v / xl);
  const y = [w[1] * x[2] - w[2] * x[1], w[2] * x[0] - w[0] * x[2], w[0] * x[1] - w[1] * x[0]];
  const ring = (p) => { const o = []; for (let i = 0; i <= n; i++) { const t = i / n * Math.PI * 2, c = Math.cos(t) * r, s = Math.sin(t) * r; o.push(tf(p[0] + x[0] * c + y[0] * s, p[1] + x[1] * c + y[1] * s, p[2] + x[2] * c + y[2] * s)); } return o; };
  const A = ring(a), B = ring(b), ctr = tf((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  for (let i = 0; i < n; i++) g.quad(A[i], A[i + 1], B[i + 1], B[i], col, mat, ctr);
}
const ICO = (() => {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(p => { const l = Math.hypot(...p); return p.map(q => q / l); });
  const f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  const L0 = f.map(q => q.map(i => v[i]));
  const nm = (a, b) => { const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]; const l = Math.hypot(...m); return m.map(q => q / l); };
  const L1 = [];
  for (const [a, b, c] of L0) { const ab = nm(a, b), bc = nm(b, c), ca = nm(c, a); L1.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
  const O = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const L8 = []; for (const sx of [0, 1]) for (const sy of [2, 3]) for (const sz of [4, 5]) L8.push([O[sx], O[sy], O[sz]]);
  return [L0, L1, L8];
})();
const vh = v => { const s = Math.sin(v[0] * 12.9898 + v[1] * 78.233 + v[2] * 37.719) * 43758.5453; return s - Math.floor(s); };
function blob(g, tf, x, y, z, rx, ry, rz, col, mat = 0, lvl = 0, jit = 0, seed = 0, colFn = null) {
  const ctr = tf(x, y, z);
  const P = v => { const j = 1 + jit * (vh([v[0] + seed, v[1], v[2]]) - 0.5); return tf(x + v[0] * rx * j, y + v[1] * ry * j, z + v[2] * rz * j); };
  for (const [a, b, c] of ICO[lvl]) g.tri(P(a), P(b), P(c), colFn ? colFn() : col, mat, ctr);
}
function flower(g, tf, x, y, z, r, col) { blob(g, tf, x, y, z, r, r * 0.8, r, col, 0, 2); }
// flat polygon in local XY plane at local z, facing +z
function poly(g, tf, pts, z, col, mat = 0) {
  let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= pts.length; cy /= pts.length;
  const ctr = tf(cx, cy, z - 1), c = tf(cx, cy, z);
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; g.tri(c, tf(a[0], a[1], z), tf(b[0], b[1], z), col, mat, ctr); }
}
function disc(g, tf, x, y, z, r, n, col, mat = 0) { const p = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; p.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); } poly(g, tf, p, z, col, mat); }
function archPts(cx, y0, w, hr, n = 8) { // pointed (lancet) arch outline, CCW
  const y1 = y0 + hr, Rr = 0.78 * w, cL = cx - w / 2 + Rr, cR = cx + w / 2 - Rr, ta = Math.acos((w / 2 - Rr) / Rr);
  const pts = [[cx - w / 2, y0], [cx + w / 2, y0]];
  for (let i = 0; i <= n; i++) { const a = (Math.PI - ta) * i / n; pts.push([cR + Math.cos(a) * Rr, y1 + Math.sin(a) * Rr]); }
  for (let i = 1; i <= n; i++) { const a = ta + (Math.PI - ta) * i / n; pts.push([cL + Math.cos(a) * Rr, y1 + Math.sin(a) * Rr]); }
  return pts;
}
function arch(g, tf, cx, y0, z, w, hr, col, mat = 0) { poly(g, tf, archPts(cx, y0, w, hr), z, col, mat); }
function roundArchBand(g, tf, cx, cy, z, rIn, rOut, depth, n, col, mat = 0) {
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI * i / n, a1 = Math.PI * (i + 1) / n;
    const P = (r, a, dz) => tf(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z + dz);
    const am = (a0 + a1) / 2, ctr = tf(cx + Math.cos(am) * (rIn + rOut) / 2, cy + Math.sin(am) * (rIn + rOut) / 2, z);
    const h = depth / 2;
    g.quad(P(rIn, a0, h), P(rOut, a0, h), P(rOut, a1, h), P(rIn, a1, h), col, mat, ctr);
    g.quad(P(rIn, a0, -h), P(rOut, a0, -h), P(rOut, a1, -h), P(rIn, a1, -h), col, mat, ctr);
    g.quad(P(rOut, a0, h), P(rOut, a1, h), P(rOut, a1, -h), P(rOut, a0, -h), col, mat, ctr);
    g.quad(P(rIn, a0, h), P(rIn, a1, h), P(rIn, a1, -h), P(rIn, a0, -h), col, mat, ctr);
  }
}
function shadowBlob(g, x, y, z, r) {
  const a = [x - r, y, z - r], b = [x + r, y, z - r], c = [x + r, y, z + r], d = [x - r, y, z + r];
  g.rawTri([a, c, b], [[0, 0, 0], [1, 1, 0], [1, 0, 0]], 3); g.rawTri([a, d, c], [[0, 0, 0], [0, 1, 0], [1, 1, 0]], 3);
}

// ================= palette =================
const C = {
  plaster: ['#fbf5ec', '#f8eee6', '#f6efe3', '#fdf8f2', '#f6ebe6', '#f3efe6'].map(hex),
  roof: ['#d9a08e', '#cf9183', '#a9a2b9', '#b4abc0', '#dcae97', '#c7a3a9', '#9fa6bd'].map(hex),
  timber: hex('#b89a85'), timberD: hex('#a3846f'), shutter: ['#a9b8cb', '#b9c4d3', '#c3b6c9', '#b8c7b4'].map(hex),
  glass: hex('#9fb1c7'), warm: hex('#f6dfb2'), white: hex('#fffdf9'), ribbon: hex('#fbf8f3'),
  door: ['#b48e74', '#a9b4c4', '#b99a8a', '#9fae9a'].map(hex),
  rose: ['#f6b9c6', '#f9d2da', '#ffffff', '#f3a5b8', '#fbe3e7', '#f0c4cf'].map(hex), lav: hex('#b7a6d8'), yellow: hex('#f6dc8c'),
  leaf: hex('#a9c38c'), leaf2: hex('#bcd29b'), leafD: hex('#8fae7d'), stone: hex('#e8dfd8'), stoneW: hex('#efe6de'), cobble: hex('#ddd3cc'), slab: hex('#ece5e0'), grass: hex('#c9dca9'),
  cath: hex('#faf6f3'), cathTrim: hex('#eee6e2'), cathRoof: hex('#aab1c8'), gold: hex('#e7bd63'),
  trunk: hex('#a88d7a'), blW: hex('#fbf7ef'), blP: hex('#f7d3dc'), blG: hex('#b9d39a'), cypress: hex('#7fa486'), wood: hex('#d4b49a'), iron: hex('#5d5a5f'),
};

// ================= world containers =================
const world = new Geo(), blobs = new Geo(), inner = new Geo(), shafts = new Geo();
const obstacles = [];  // outside circles
const inObst = [];     // inside circles
const PZ = [0, -24], PR = 14.2;
const X0 = 600;        // interior offset

function flatDisc(g, cx, cz, y, r, n, col, mat) {
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
    g.tri([cx, y, cz], [cx + Math.cos(a0) * r, y, cz + Math.sin(a0) * r], [cx + Math.cos(a1) * r, y, cz + Math.sin(a1) * r], col, mat, [cx, y - 1, cz]);
  }
}
function flatQuad(g, x0, z0, x1, z1, y, col, mat) { g.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], col, mat, [(x0 + x1) / 2, y - 1, (z0 + z1) / 2]); }

// ---------- decorations ----------
function rosesOn(g, tf, x, y, z, w, h, n, r, dz = 0.12) { // climbing roses patch on a wall (local plane z)
  for (let i = 0; i < n; i++) {
    const px = x + (r() - 0.5) * w, py = y + r() * h;
    blob(g, tf, px, py, z + dz * 0.5, 0.22 + r() * 0.15, 0.22 + r() * 0.12, 0.12, pick([C.leaf, C.leaf2, C.leafD], r), 6, 0, 0.35, i * 3.1);
    if (r() < 0.8) flower(g, tf, px + (r() - 0.5) * 0.2, py + (r() - 0.5) * 0.2, z + dz + 0.05, 0.075 + r() * 0.05, pick(C.rose, r));
  }
}
function wallLantern(g, tf, x, y, z) {
  tube(g, tf, [x, y, z], [x, y, z + 0.55], 0.025, 4, C.iron);
  tube(g, tf, [x, y - 0.25, z], [x, y, z + 0.4], 0.02, 4, C.iron);
  box(g, tf, x, y - 0.42, z + 0.55, 0.22, 0.32, 0.22, C.warm, 7);
  cyl(g, tf, x, y - 0.1, z + 0.55, 0.17, 0, 0.16, 4, C.iron, 0, true, Math.PI / 4);
}
function lampPost(g, x, z, y = 0) {
  cyl(g, I, x, y, z, 0.1, 0.07, 3.0, 6, C.iron);
  cyl(g, I, x, y, z, 0.18, 0.12, 0.4, 6, C.iron);
  box(g, I, x, y + 3.0, z, 0.32, 0.44, 0.32, C.warm, 7);
  cyl(g, I, x, y + 3.44, z, 0.28, 0, 0.3, 4, C.iron, 0, true, Math.PI / 4);
}
function barrel(g, tf, x, z, r, y = 0) {
  cyl(g, tf, x, y, z, 0.28, 0.33, 0.3, 10, C.wood); cyl(g, tf, x, y + 0.3, z, 0.33, 0.28, 0.3, 10, C.wood);
  cyl(g, tf, x, y + 0.08, z, 0.31, 0.31, 0.04, 10, C.timberD, 0, false); cyl(g, tf, x, y + 0.48, z, 0.31, 0.31, 0.04, 10, C.timberD, 0, false);
  blob(g, tf, x, y + 0.72, z, 0.36, 0.26, 0.36, C.leaf, 6, 0, 0.3, x * 7 + z);
  const col = r() < 0.3 ? C.lav : null;
  for (let q = 0; q < 9; q++) flower(g, tf, x + (r() - 0.5) * 0.5, y + 0.75 + r() * 0.2, z + (r() - 0.5) * 0.5, 0.07 + r() * 0.03, col || pick(C.rose, r));
}
function bench(g, tf, x, z, y = 0) {
  box(g, tf, x, y + 0.42, z, 1.6, 0.06, 0.45, C.wood); box(g, tf, x, y + 0.5, z - 0.22, 1.6, 0.45, 0.05, C.wood);
  for (const a of [-0.7, 0.7]) for (const b of [-0.18, 0.18]) box(g, tf, x + a, y, z + b, 0.07, 0.42, 0.07, C.timberD);
}
function swag(g, A, B, sag, seed) { // white ribbon garland + bows
  const n = 16, P = t => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t - sag * 4 * t * (1 - t), A[2] + (B[2] - A[2]) * t];
  for (let i = 0; i < n; i++) {
    const p0 = P(i / n), p1 = P((i + 1) / n), w = 0.22 * (0.6 + 0.4 * Math.sin(Math.PI * (i + 0.5) / n));
    g.quad(p0, p1, [p1[0], p1[1] - w, p1[2]], [p0[0], p0[1] - w, p0[2]], C.ribbon, 4);
  }
  for (const E of [A, B]) bow(g, E);
}
function bow(g, E) {
  const [x, y, z] = E;
  for (const s of [-1, 1]) {
    g.tri([x, y, z], [x + s * 0.28, y + 0.14, z], [x + s * 0.28, y - 0.12, z], C.ribbon, 4);
    g.tri([x, y, z], [x + s * 0.12, y - 0.55, z + 0.02], [x + s * 0.22, y - 0.5, z + 0.02], C.ribbon, 4);
  }
}
function paperShape(g, x, z, th, y0, pts, col, mat) { poly(g, T(x, z, th, y0), pts, 0, col, mat); }
function scallop(cx, cy, rx, ry, n, bump, seed) { const p = []; for (let i = 0; i < n * 4; i++) { const a = i / (n * 4) * Math.PI * 2, k = 1 + bump * Math.pow(Math.abs(Math.sin(a * n / 2 * 2)), 0.6) - bump * 0.5 + (vh([seed, i, 1]) - 0.5) * 0.06; p.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]); } return p; }
function cypress(g, x, z, h, y = 0) {
  const th0 = (vh([x, z, 3]) - 0.5) * 1.5;
  for (const k of [0, 1]) { const th = th0 + k * Math.PI / 2;
    paperShape(g, x, z, th, y, [[-0.08, 0], [0.08, 0], [0.08, 0.8], [-0.08, 0.8]], C.trunk, 0);
    const p = []; for (let i = 0; i <= 16; i++) { const t = i / 16 * Math.PI * 2; const r = 0.62 * h / 6 * (1 + 0.08 * Math.sin(t * 7)); p.push([Math.sin(t) * r * (1 - 0.25 * Math.max(0, Math.cos(t))), h * 0.5 - Math.cos(t) * h * 0.5]); }
    paperShape(g, x, z, th, y + 0.6, p, k ? C.cypress : vary(C.cypress, 0.1), 6); }
}
function tree(g, x, z, s, kind, seed, near, y = 0) {
  const r = rngf(seed), th0 = r() * Math.PI;
  const col = kind === 'p' ? C.blP : kind === 'w' ? C.blW : C.blG;
  for (const k of [0, 1]) { const th = th0 + k * Math.PI / 2, c2 = k ? col : vary(col, 0.1, r);
    paperShape(g, x, z, th, y, [[-0.16 * s, 0], [0.16 * s, 0], [0.1 * s, 2.5 * s], [0.28 * s, 2.9 * s], [-0.24 * s, 2.9 * s], [-0.1 * s, 2.5 * s]], k ? C.trunk : vary(C.trunk, 0.1, r), 0);
    paperShape(g, x, z, th, y, scallop(0, 3.3 * s, 1.55 * s, 1.25 * s, 7, 0.16, seed + k), c2, 6);
    const tf = T(x, z, th, y);
    for (let q = 0; q < (near ? 9 : 4); q++) { const fx = (r() - 0.5) * 2.2 * s, fy = 3.3 * s + (r() - 0.5) * 1.8 * s, col2 = kind === 'g' ? C.white : (kind === 'p' ? hex('#ff9fbf') : hex('#ffd6e2'));
      for (const side of [0.025, -0.025]) disc(g, T(x, z, th + (side < 0 ? Math.PI : 0), y), side < 0 ? -fx : fx, fy, Math.abs(side), 0.1 * s, 8, col2, 0); }
  }
  if (false) {
  const n = 5 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = r() * 6.28, d = i === 0 ? 0 : (0.5 + r() * 0.5) * s;
    blob(g, I, x + Math.cos(a) * d * 1.2, y + (2.6 + r() * 1.5) * s, z + Math.sin(a) * d * 1.2, (0.95 + r() * 0.4) * s, (0.8 + r() * 0.3) * s, (0.95 + r() * 0.4) * s, vary(col, 0.08, r), 6, near ? 1 : 0, 0.25, seed + i);
    if (kind === 'g' && near) for (let q = 0; q < 4; q++) flower(g, I, x + Math.cos(a) * d + (r() - .5) * 1.4 * s, y + (2.8 + r() * 1.2) * s, z + Math.sin(a) * d + (r() - .5) * 1.4 * s, 0.12 * s, C.blW);
  }
  }
}

// ---------- house (half-timbered) ----------
function house(px, pz, th, w, d, h, r, opt = {}) {
  const tf = T(px, pz, th, opt.y || 0);
  const plaster = vary(pick(C.plaster, r), 0.03, r), roofc = vary(pick(C.roof, r), 0.05, r);
  const stoneGround = r() < 0.5, f1 = 2.9, jet = h > 5.2 ? 0.35 : 0;
  // ground floor
  box(world, tf, 0, 0, 0, w, f1, d, stoneGround ? C.stoneW : plaster, stoneGround ? 8 : 0);
  // upper floor (jettied)
  if (h > f1 + 0.3) box(world, tf, 0, f1, jet / 2, w + 0.1, h - f1, d + jet, plaster);
  const fz = d / 2 + jet; // front plane of upper floor
  // timber frame on upper floor
  if (h > f1 + 0.3) {
    const nP = Math.max(2, Math.round(w / 1.3));
    for (let i = 0; i <= nP; i++) { const x = -w / 2 + i * w / nP; box(world, tf, x, f1, fz, 0.16, h - f1, 0.08, C.timber); }
    box(world, tf, 0, f1, fz, w + 0.1, 0.18, 0.1, C.timberD); box(world, tf, 0, h - 0.16, fz, w + 0.1, 0.16, 0.1, C.timber);
    for (let i = 0; i < nP; i++) if (i % 2 === 0 && r() < 0.8) { const x0 = -w / 2 + i * w / nP, x1 = x0 + w / nP;
      tube(world, tf, [x0 + 0.05, f1 + 0.15, fz + 0.04], [x1 - 0.05, f1 + (h - f1) * 0.5, fz + 0.04], 0.06, 4, C.timber); }
  }
  if (!stoneGround) for (const sx of [-1, 1]) box(world, tf, sx * (w / 2 - 0.06), 0, d / 2, 0.18, f1, 0.1, C.timber);
  box(world, tf, 0, 0, 0, w + 0.06, 0.35, d + 0.06, C.stone, 8);
  // roof
  const rh = 1.8 + r() * 1.6, gableFront = r() < 0.55;
  if (gableFront) {
    roof(world, T(px, pz, th + Math.PI / 2, opt.y || 0), -jet / 2, h, 0, d + jet + 0.8, w + 0.9, rh * 1.25, roofc, 9, plaster);
    // timber on gable
    const gt = h + rh * 1.25;
    tube(world, tf, [-w / 2 + 0.2, h + 0.05, fz + 0.38], [0, gt - 0.2, fz + 0.38], 0.07, 4, C.timber);
    tube(world, tf, [w / 2 - 0.2, h + 0.05, fz + 0.38], [0, gt - 0.2, fz + 0.38], 0.07, 4, C.timber);
    box(world, tf, 0, h + 0.05, fz + 0.38, 0.14, rh * 1.25 - 0.3, 0.08, C.timber);
    if (r() < 0.6) { box(world, tf, 0, h + 0.4, fz + 0.4, 0.7, 0.8, 0.06, C.white); box(world, tf, 0, h + 0.48, fz + 0.43, 0.52, 0.62, 0.04, C.glass); }
  } else {
    roof(world, tf, 0, h, jet / 2, w + 0.7, d + jet + 1.0, rh, roofc);
    if (r() < 0.6) { // dormer
      const dx = (r() - 0.5) * w * 0.4, dz = (d + jet) / 4 + jet / 2;
      box(world, tf, dx, h, dz, 1.1, rh * 0.62, 1.0, plaster);
      roof(world, T(...tf(dx, 0, dz).filter((_, i) => i !== 1), th + Math.PI / 2, (opt.y || 0)), 0, h + rh * 0.62, 0, 1.3, 1.4, 0.6, roofc);
      box(world, tf, dx, h + 0.2, dz + 0.51, 0.6, 0.6, 0.04, C.glass);
    }
  }
  if (r() < 0.55) box(world, tf, w * 0.28, h + 0.3, -d * 0.15, 0.6, rh + 0.8, 0.6, C.stoneW, 8);
  // windows
  const shut = r() < 0.7 ? pick(C.shutter, r) : null;
  const nwin = Math.max(1, Math.floor(w / 1.7)), dx = opt.doorX !== undefined ? opt.doorX : (r() - 0.5) * (w - 2.4) * 0.6;
  const win = (wx, wy, zz, big) => {
    const ww = big ? 1.2 : 0.8, wh = big ? 1.3 : 1.0;
    box(world, tf, wx, wy, zz + 0.02, ww + 0.16, wh + 0.16, 0.08, C.white);
    box(world, tf, wx, wy + 0.08, zz + 0.05, ww, wh, 0.04, opt.warmWin && r() < 0.5 ? C.warm : vary(C.glass, 0.08, r), opt.warmWin ? 7 : 0);
    box(world, tf, wx, wy + 0.08 + wh / 2, zz + 0.08, ww, 0.04, 0.02, C.white); box(world, tf, wx, wy + 0.08, zz + 0.08, 0.04, wh, 0.02, C.white);
    if (shut) for (const s of [-1, 1]) box(world, tf, wx + s * (ww / 2 + 0.2), wy, zz + 0.05, 0.34, wh + 0.16, 0.06, shut);
    if (opt.flowery || r() < 0.65) {
      box(world, tf, wx, wy - 0.3, zz + 0.2, ww + 0.25, 0.26, 0.32, C.wood);
      blob(world, tf, wx, wy - 0.02, zz + 0.25, ww * 0.62, 0.2, 0.2, C.leaf, 6, 0, 0.3, wx + wy);
      for (let k = 0; k < 7; k++) flower(world, tf, wx - ww / 2 + k * ww / 6, wy + 0.04 + r() * 0.12, zz + 0.25 + (r() - 0.5) * 0.15, 0.07 + r() * 0.04, r() < 0.15 ? C.lav : pick(C.rose, r));
      for (let k = 0; k < 3; k++) blob(world, tf, wx - ww / 2 + r() * ww, wy - 0.45 - r() * 0.2, zz + 0.3, 0.05, 0.16, 0.04, C.leaf2, 6, 0);
    }
  };
  if (h > f1 + 0.3) for (let i = 0; i < nwin; i++) win(-w / 2 + (i + 0.5) * w / nwin, f1 + 0.7, fz, false);
  if (!opt.shop) for (let i = 0; i < nwin; i++) { const wx = -w / 2 + (i + 0.5) * w / nwin; if (Math.abs(wx - dx) < 1.1) continue; win(wx, 1.0, d / 2, false); }
  // door
  const doorc = pick(C.door, r);
  arch(world, tf, dx, 0, d / 2 + 0.03, 1.25, 1.9, C.stone);
  arch(world, tf, dx, 0, d / 2 + 0.06, 1.0, 1.8, doorc);
  box(world, tf, dx, 0, d / 2 + 0.35, 1.5, 0.12, 0.6, C.stone, 8);
  // shop front
  if (opt.shop) {
    const sx = dx < 0 ? w * 0.18 : -w * 0.18, sw = Math.min(2.6, w * 0.5);
    arch(world, tf, sx, 0.5, d / 2 + 0.03, sw + 0.3, 1.6, C.timber);
    box(world, tf, sx, 0.6, d / 2 + 0.06, sw, 1.7, 0.04, C.warm, 7);
    for (let q = 0; q < 3; q++) box(world, tf, sx, 0.75 + q * 0.55, d / 2 + 0.08, sw, 0.04, 0.03, C.timberD);
    for (let q = 0; q < 10; q++) blob(world, tf, sx - sw / 2 + 0.2 + (q % 5) * (sw - 0.4) / 4, 0.85 + Math.floor(q / 5) * 0.55, d / 2 + 0.1, 0.13, 0.08, 0.06, hex('#e2b57e'), 0, 0);
    // striped scalloped awning
    const n = 10, aw = sw + 1.4;
    for (let i = 0; i < n; i++) { const x0 = sx - aw / 2 + i * aw / n, x1 = x0 + aw / n, col = i % 2 ? C.white : hex(opt.shop);
      world.quad(tf(x0, 2.75, d / 2 + 0.05), tf(x1, 2.75, d / 2 + 0.05), tf(x1, 2.3, d / 2 + 1.2), tf(x0, 2.3, d / 2 + 1.2), col, 0, tf((x0 + x1) / 2, 0, d / 2));
      const pts = []; for (let k = 0; k <= 6; k++) { const a = Math.PI * k / 6; pts.push([x0 + (x1 - x0) * (1 - k / 6), 2.3 - Math.sin(a) * 0.14]); }
      poly(world, T(...tf(0, 0, d / 2 + 1.2).filter((_, i2) => i2 !== 1), th, opt.y || 0), [[x0, 2.3], [x1, 2.3], ...pts.slice(1, -1)], 0, col, 4); }
    // display table
    box(world, tf, sx, 0.75, d / 2 + 1.0, 1.6, 0.06, 0.6, C.wood);
    for (const a of [-0.7, 0.7]) box(world, tf, sx + a, 0, d / 2 + 1.0, 0.06, 0.75, 0.5, C.timberD);
    box(world, tf, sx, 0.81, d / 2 + 1.0, 1.4, 0.01, 0.5, hex('#f6efe6'));
    for (let q = 0; q < 6; q++) blob(world, tf, sx - 0.55 + q * 0.22, 0.9, d / 2 + 1.0 + (q % 2 ? 0.1 : -0.1), 0.12, 0.08, 0.09, hex('#dcae74'), 0, 0);
  }
  // wall lantern
  if (r() < 0.6) wallLantern(world, tf, dx + (dx < 0 ? 1.0 : -1.0), 2.55, d / 2);
  // roses & pots
  const nRose = opt.flowery ? 14 : (r() < 0.5 ? 6 : 0);
  if (nRose) { const sx = (r() < 0.5 ? -1 : 1) * (w / 2 - 0.4); rosesOn(world, tf, sx, 0.2, d / 2 + 0.04, 0.9, h * 0.85, nRose, r); }
  if (opt.flowery || r() < 0.4) for (const s of [-1, 1]) if (r() < 0.8) { const bx = dx + s * (0.9 + r() * 0.4); if (r() < 0.5) barrel(world, tf, bx, d / 2 + 0.55, r); else {
    cyl(world, tf, bx, 0, d / 2 + 0.5, 0.2, 0.26, 0.42, 8, hex('#efe8e2'));
    blob(world, tf, bx, 0.62, d / 2 + 0.5, 0.32, 0.3, 0.32, C.leaf, 6, 0, 0.3, bx);
    for (let q = 0; q < 6; q++) flower(world, tf, bx + (r() - .5) * .5, 0.7 + r() * .25, d / 2 + 0.5 + (r() - .5) * .45, 0.075, r() < 0.3 ? C.lav : pick(C.rose, r)); } }
  return { tf, fz, h };
}

// ================= OUTSIDE WORLD =================
flatDisc(world, 0, 0, -0.03, 360, 72, C.grass, 2);
// street
flatQuad(world, -2.6, -12, 2.6, 160, 0.01, C.cobble, 1);
for (const s of [-1, 1]) { flatQuad(world, s * 2.6, -9, s * 3.55, 47, 0.06, C.slab, 11); box(world, I, s * 2.62, 0, 19, 0.12, 0.07, 56, C.stone); }
// plaza
flatDisc(world, PZ[0], PZ[1], 0.012, PR + 0.8, 72, C.cobble, 15);

// street houses
const streetEnds = [];
for (const side of [-1, 1]) {
  const r = rngf(side > 0 ? 11 : 22);
  let z = 46.2, k = 0;
  while (z > -7.0) {
    let w = 4.6 + r() * 2.2; if (z - w < -7.6) w = z + 7.6;
    if (w < 2.5) break;
    const d = 7 + r() * 2, h = 5.4 + r() * 2.8;
    const shop = (side < 0 && k === 1) ? '#f2c2cc' : (side > 0 && k === 3) ? '#c9d5e8' : (side < 0 && k === 5) ? '#f2c2cc' : null;
    house(side * (3.55 + d / 2), z - w / 2, side > 0 ? -Math.PI / 2 : Math.PI / 2, w, d, h, r, { flowery: r() < 0.6, shop, warmWin: !!shop });
    z -= w + 0.02; k++;
  }
}
// ribbon garlands across street
for (let z = 42, k = 0; z > -6; z -= 7, k++) swag(world, [-3.5, 5.7, z], [3.5, 5.5, z - 1.2], 0.75, k);
// barrels & benches along street
{ const r = rngf(66);
  for (let z = 40; z > -5; z -= 6.5) { const s = r() < 0.5 ? -1 : 1; barrel(world, I, s * 3.15, z + r() * 2, r); }
  bench(world, T(3.1, 12, -Math.PI / 2), 0, 0); bench(world, T(-3.1, 27, Math.PI / 2), 0, 0); }

// stone arches (street end + village gate)
function stoneArch(z, flowers) {
  for (const s of [-1, 1]) { box(world, I, s * 3.55, 0, z, 0.9, 3.2, 1.3, C.stoneW, 8); box(world, I, s * 3.55, 3.2, z, 1.05, 0.25, 1.4, C.stone, 8); }
  roundArchBand(world, I, 0, 3.4, z, 3.1, 4.0, 1.3, 16, C.stoneW, 8);
  box(world, I, -4.0, 3.4, z, 0.9, 4.0, 1.3, C.stoneW, 8); box(world, I, 4.0, 3.4, z, 0.9, 4.0, 1.3, C.stoneW, 8);
  box(world, I, 0, 6.4, z, 7.2, 1.2, 1.3, C.stoneW, 8);
  box(world, I, 0, 7.6, z, 7.6, 0.2, 1.5, C.stone, 8);
  // hanging lantern
  tube(world, I, [0, 6.5, z], [0, 5.8, z], 0.02, 4, C.iron); box(world, I, 0, 5.35, z, 0.26, 0.42, 0.26, C.warm, 7);
  if (flowers) { const r = rngf(z * 10 | 0); for (let i = 0; i < 26; i++) { const a = r() * Math.PI, rr = 4.05;
    blob(world, I, Math.cos(a) * rr, 3.4 + Math.sin(a) * rr, z + (r() < 0.5 ? 0.7 : -0.7), 0.35, 0.3, 0.2, pick([C.leaf, C.leaf2], r), 6, 0, 0.3, i);
    flower(world, I, Math.cos(a) * rr + (r() - .5) * .3, 3.4 + Math.sin(a) * rr, z + (r() < 0.5 ? 0.85 : -0.85), 0.1, pick(C.rose, r)); }
    for (const s of [-1, 1]) rosesOn(world, T(s * 3.55, z, 0), 0, 0.2, 0.66, 0.6, 3, 7, r); }
}
stoneArch(-8.6, true); stoneArch(47.4, true);
obstacles.push({ x: -3.55, z: -8.6, r: 0.75 }, { x: 3.55, z: -8.6, r: 0.75 });

// plaza ring houses
{
  const r = rngf(33);
  for (let deg = 14; deg < 360; deg += 21) {
    if ((deg > 68 && deg < 112) || (deg > 238 && deg < 302) || (deg > 152 && deg < 208) || deg < 20 || deg > 340) continue;
    const a = deg * Math.PI / 180, w = 5.4 + r() * 1.4, d = 7.5 + r() * 2, h = 5.6 + r() * 3, rr = PR + 1.2 + d / 2;
    house(PZ[0] + Math.cos(a) * rr, PZ[1] + Math.sin(a) * rr, Math.atan2(-Math.cos(a), -Math.sin(a)), w, d, h, r, { flowery: r() < 0.5, shop: r() < 0.3 ? pick(['#f2c2cc', '#c9d5e8', '#d8cce6'], r) : null });
  }
}
// dining hall (east)
{
  const r = rngf(44), cx = PZ[0] + PR + 1.2 + 4.8, cz = PZ[1];
  const hs = house(cx, cz, -Math.PI / 2, 13, 9.6, 6.2, r, { flowery: true, shop: '#e9b9a6', warmWin: true, doorX: 0 });
  for (const tz of [-4.2, 4.2]) {
    const tx = PR - 4.2, ttf = T(tx, PZ[1] + tz, 0);
    box(world, ttf, 0, 0.72, 0, 1.1, 0.07, 3.0, C.wood);
    for (const a of [-1, 1]) for (const b of [-1, 1]) box(world, ttf, a * 0.4, 0, b * 1.3, 0.08, 0.72, 0.08, C.timberD);
    for (const a of [-1, 1]) { box(world, ttf, a * 0.95, 0.42, 0, 0.35, 0.06, 2.8, C.wood); box(world, ttf, a * 0.95, 0, -1.1, 0.08, 0.42, 0.08, C.timberD); box(world, ttf, a * 0.95, 0, 1.1, 0.08, 0.42, 0.08, C.timberD); }
    box(world, ttf, 0, 0.79, 0, 1.12, 0.01, 1.2, hex('#f7f1ea'));
    for (const b of [-1.0, -0.35, 0.35, 1.0]) cyl(world, ttf, (b > 0 ? 0.25 : -0.25), 0.8, b, 0.14, 0.17, 0.07, 10, C.white);
    cyl(world, ttf, 0, 0.8, 0, 0.07, 0.09, 0.25, 8, hex('#c8d6e4'));
    for (let q = 0; q < 5; q++) flower(world, ttf, (r() - .5) * 0.18, 1.1 + r() * 0.1, (r() - .5) * 0.18, 0.06, pick(C.rose, r));
    obstacles.push({ x: tx, z: PZ[1] + tz - 1.0, r: 1.25 }, { x: tx, z: PZ[1] + tz + 1.0, r: 1.25 });
  }
}
// tiered fountain
function fountain(g, fx, fz, y, s) {
  cyl(g, I, fx, y, fz, 2.9 * s, 2.9 * s, 0.6 * s, 28, C.stoneW, 8);
  cyl(g, I, fx, y + 0.6 * s, fz, 3.0 * s, 3.0 * s, 0.1 * s, 28, C.stone);
  flatDisc(g, fx, fz, y + 0.52 * s, 2.7 * s, 28, hex('#bcdde8'), 5);
  cyl(g, I, fx, y + 0.5 * s, fz, 0.42 * s, 0.32 * s, 1.0 * s, 10, C.stoneW);
  cyl(g, I, fx, y + 1.5 * s, fz, 0.35 * s, 1.5 * s, 0.35 * s, 18, C.stoneW);
  flatDisc(g, fx, fz, y + 1.83 * s, 1.35 * s, 18, hex('#bcdde8'), 5);
  cyl(g, I, fx, y + 1.85 * s, fz, 0.22 * s, 0.18 * s, 0.75 * s, 8, C.stoneW);
  cyl(g, I, fx, y + 2.6 * s, fz, 0.2 * s, 0.75 * s, 0.25 * s, 14, C.stoneW);
  flatDisc(g, fx, fz, y + 2.83 * s, 0.65 * s, 14, hex('#bcdde8'), 5);
  blob(g, I, fx, y + 3.05 * s, fz, 0.18 * s, 0.25 * s, 0.18 * s, C.stoneW, 0, 1);
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; // falling water sheets
    tube(g, I, [fx + Math.cos(a) * 1.45 * s, y + 1.83 * s, fz + Math.sin(a) * 1.45 * s], [fx + Math.cos(a) * 1.75 * s, y + 0.55 * s, fz + Math.sin(a) * 1.75 * s], 0.05 * s, 4, hex('#d8eef4'), 5);
    if (k % 2 === 0) tube(g, I, [fx + Math.cos(a) * 0.72 * s, y + 2.83 * s, fz + Math.sin(a) * 0.72 * s], [fx + Math.cos(a) * 0.95 * s, y + 1.85 * s, fz + Math.sin(a) * 0.95 * s], 0.04 * s, 4, hex('#d8eef4'), 5); }
}
fountain(world, PZ[0], PZ[1], 0, 1); obstacles.push({ x: PZ[0], z: PZ[1], r: 3.2 });
{ const r = rngf(9); for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2, x = PZ[0] + Math.cos(a) * 4.3, z = PZ[1] + Math.sin(a) * 4.3;
  box(world, T(x, z, -a), 0, 0, 0, 1.6, 0.45, 0.7, C.stoneW, 8); blob(world, T(x, z, -a), 0, 0.6, 0, 0.8, 0.3, 0.35, C.leaf, 6, 0, 0.3, k);
  for (let q = 0; q < 10; q++) flower(world, T(x, z, -a), (r() - .5) * 1.4, 0.75 + r() * 0.1, (r() - .5) * 0.5, 0.08, r() < 0.4 ? C.white : pick(C.rose, r)); obstacles.push({ x, z, r: 0.85 }); } }
// big tree + benches
tree(world, 6.8, -17.5, 1.5, 'g', 4242, true); shadowBlob(blobs, 6.8, 0.03, -17.5, 1.0); obstacles.push({ x: 6.8, z: -17.5, r: 0.6 });
bench(world, T(4.6, -16.0, -2.4), 0, 0); bench(world, T(-6.2, -31.0, 0.9), 0, 0); bench(world, T(6.0, -31.5, -0.9), 0, 0);
// stalls (west)
function stall(deg, cA, goods, seed) {
  const a = deg * Math.PI / 180, rr = 10.6, cx = PZ[0] + Math.cos(a) * rr, cz = PZ[1] + Math.sin(a) * rr;
  const tf = T(cx, cz, Math.atan2(-Math.cos(a), -Math.sin(a))), r = rngf(seed);
  box(world, tf, 0, 0, 0, 2.7, 1.0, 1.1, C.wood);
  box(world, tf, 0, 0.12, 0.56, 2.5, 0.75, 0.02, C.white);
  for (const sx of [-1.3, 1.3]) for (const sz of [-0.5, 0.5]) box(world, tf, sx, 0, sz, 0.1, sz > 0 ? 2.3 : 2.6, 0.1, C.timberD);
  for (let i = 0; i < 8; i++) { const x0 = -1.45 + i * 2.9 / 8, x1 = x0 + 2.9 / 8, col = i % 2 ? C.white : cA;
    world.quad(tf(x0, 2.62, -0.6), tf(x1, 2.62, -0.6), tf(x1, 2.3, 0.9), tf(x0, 2.3, 0.9), col, 0, tf((x0 + x1) / 2, 0, 0));
    world.tri(tf(x0, 2.3, 0.9), tf(x1, 2.3, 0.9), tf((x0 + x1) / 2, 2.12, 0.92), col, 4); }
  for (let k = 0; k < 16; k++) { const gx = -1.1 + (k % 8) * 0.31, gz = -0.25 + Math.floor(k / 8) * 0.38;
    if (goods === 'fruit') blob(world, tf, gx, 1.12, gz, 0.13, 0.12, 0.13, pick([hex('#f08f98'), hex('#ffc08a'), hex('#f6d77e'), hex('#f5a6bb')], r), 0, 0);
    else if (goods === 'flower') { cyl(world, tf, gx, 1.0, gz, 0.08, 0.1, 0.2, 6, hex('#e8ddd2')); for (let q = 0; q < 3; q++) flower(world, tf, gx + (r() - .5) * .14, 1.3 + r() * .1, gz + (r() - .5) * .14, 0.07, r() < 0.3 ? C.lav : pick(C.rose, r)); }
    else { cyl(world, tf, gx, 1.0, gz, 0.11, 0.11, 0.06, 8, C.white); blob(world, tf, gx, 1.1, gz, 0.1, 0.07, 0.1, pick([hex('#f2c6a0'), hex('#e9b48c'), hex('#f7d9b5')], r), 0, 0); }
  }
  obstacles.push({ x: cx, z: cz, r: 1.75 });
}
stall(140, hex('#f2bfca'), 'fruit', 1); stall(118, hex('#c9d5e8'), 'flower', 2); stall(222, hex('#efd9a6'), 'bake', 3);
// plaza lamps + ribbons
{ const pts = []; for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 + 0.31, x = PZ[0] + Math.cos(a) * (PR - 1.0), z = PZ[1] + Math.sin(a) * (PR - 1.0);
    const dg = ((a * 180 / Math.PI) % 360 + 360) % 360; if (dg > 250 && dg < 290) { pts.push(null); continue; }
    lampPost(world, x, z); obstacles.push({ x, z, r: 0.3 }); pts.push([x, z]); }
  for (let k = 0; k < pts.length; k++) { const A = pts[k], B = pts[(k + 1) % pts.length]; if (A && B) swag(world, [A[0], 2.9, A[1]], [B[0], 2.9, B[1]], 0.7, k + 20); } }
{ const r = rngf(12); for (const [deg, k] of [[118, 'w'], [62, 'p'], [228, 'w'], [312, 'w']]) {
  const a = deg * Math.PI / 180, x = PZ[0] + Math.cos(a) * 12.6, z = PZ[1] + Math.sin(a) * 12.6;
  tree(world, x, z, 1.1, k, deg, true); obstacles.push({ x, z, r: 0.5 }); } }
// street lamps
for (let z = 36; z > -4; z -= 12) for (const s of [-1, 1]) { lampPost(world, s * 2.9, z - (s > 0 ? 6 : 0)); obstacles.push({ x: s * 2.9, z: z - (s > 0 ? 6 : 0), r: 0.25 }); }

// ---------- grand staircase & terrace ----------
const TY = 3.0, STAIR_Z0 = -37.2, STAIR_Z1 = -43.2, TFRONT = -43.2, CFRONT = -61.5;
for (let i = 0; i < 12; i++) { const z0 = STAIR_Z0 - i * 0.5; box(world, I, 0, 0, (z0 + STAIR_Z1) / 2, 9.0, (i + 1) * 0.25, z0 - STAIR_Z1, i % 2 ? C.stone : C.stoneW, 0); }
for (const s of [-1, 1]) { // stair side walls with stepped balustrade
  for (let i = 0; i < 6; i++) box(world, I, s * 4.75, 0, STAIR_Z0 - 0.5 - i * 1.0 + 0.0, 0.5, 0.95 + (i + 1) * 0.5, 1.02, C.stoneW, 8);
  box(world, I, s * 4.75, 0, STAIR_Z0 + 0.2, 0.7, 1.5, 0.7, C.stoneW, 8);
  blob(world, I, s * 4.75, 1.85, STAIR_Z0 + 0.2, 0.45, 0.3, 0.45, C.leaf, 6, 0, 0.3, s); for (let q = 0; q < 8; q++) flower(world, I, s * 4.75 + (R() - .5) * .7, 1.95 + R() * .2, STAIR_Z0 + 0.2 + (R() - .5) * .7, 0.09, pick(C.rose));
}
// terrace block + retaining wall
box(world, I, -13.6, 0, -70, 17.2, TY, 53.6, C.stoneW, 8); box(world, I, 13.6, 0, -70, 17.2, TY, 53.6, C.stoneW, 8);
box(world, I, 0, 0, -70, 10.0, TY, 53.6, C.stoneW, 8);
flatQuad(world, -22.2, TFRONT, 22.2, -96.8, TY + 0.005, C.slab, 11);
flatDisc(world, 0, -51, TY + 0.012, 6.5, 48, C.cobble, 15);
for (const s of [-1, 1]) for (const x of [7.5, 11.5, 15.5, 19.5]) { arch(world, I, s * x, 0.15, TFRONT + 0.02, 2.2, 1.3, hex('#d9d0cc')); }
// balustrade
function balustrade(A, B, y) {
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]), n = Math.floor(L / 0.36), ux = (B[0] - A[0]) / L, uz = (B[1] - A[1]) / L, th = Math.atan2(uz, ux);
  const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], tf = T(mid[0], mid[1], -th, y);
  box(world, tf, 0, 0, 0, L, 0.16, 0.5, C.stoneW); box(world, tf, 0, 0.92, 0, L + 0.1, 0.14, 0.42, C.stoneW);
  for (let i = 0; i < n; i++) { const x = -L / 2 + (i + 0.5) * L / n; cyl(world, tf, x, 0.16, 0, 0.07, 0.1, 0.38, 5, C.stoneW, 0, false); cyl(world, tf, x, 0.54, 0, 0.1, 0.07, 0.38, 5, C.stoneW, 0, false); }
  for (let i = 0; i <= Math.floor(L / 3.2); i++) { const x = -L / 2 + i * L / Math.max(1, Math.floor(L / 3.2)); box(world, tf, x, 0, 0, 0.5, 1.15, 0.55, C.stoneW, 8); }
}
for (const s of [-1, 1]) { balustrade([s * 4.9, TFRONT - 0.2], [s * 22, TFRONT - 0.2], TY); balustrade([s * 22, TFRONT - 0.2], [s * 22, -96], TY); }
for (const s of [-1, 1]) for (const x of [5.4, 13.5, 21.5]) { // urns on posts
  const z = TFRONT - 0.2; cyl(world, I, s * x, TY + 1.15, z, 0.18, 0.32, 0.38, 10, C.stoneW); blob(world, I, s * x, TY + 1.7, z, 0.42, 0.3, 0.42, C.leaf, 6, 0, 0.3, x * s);
  for (let q = 0; q < 8; q++) flower(world, I, s * x + (R() - .5) * .6, TY + 1.8 + R() * .2, z + (R() - .5) * .6, 0.09, R() < 0.5 ? C.white : pick(C.rose)); }
// ribbons along terrace balustrade
for (const s of [-1, 1]) for (let k = 0; k < 4; k++) { const x0 = s * (5.4 + k * 4.1), x1 = s * (5.4 + (k + 1) * 4.1); swag(world, [x0, TY + 1.05, TFRONT - 0.48], [x1, TY + 1.05, TFRONT - 0.48], 0.35, 40 + k); }
fountain(world, -10.5, -53.5, TY, 0.7); obstacles.push({ x: -10.5, z: -53.5, r: 2.3 });
for (const [x, z] of [[-5, -46], [5, -46], [-6, -58], [6, -58], [-14, -48], [14, -48]]) { lampPost(world, x, z, TY); obstacles.push({ x, z, r: 0.3 }); }
// rose pergolas (east side)
for (let k = 0; k < 4; k++) { const z = -47 - k * 3.2;
  for (const x of [12.5, 16.5]) { box(world, I, x, TY, z, 0.25, 3.2, 0.25, C.white); rosesOn(world, T(x, z, 0), 0, TY + 0.2, 0.15, 0.5, 2.8, 5, R); }
  roundArchBand(world, T(14.5, z, Math.PI / 2), 0, TY + 3.2, 0, 1.9, 2.15, 0.25, 10, C.white);
  for (let q = 0; q < 14; q++) { const a = R() * Math.PI; blob(world, I, 14.5 + Math.cos(a) * 2.0, TY + 3.2 + Math.sin(a) * 2.0, z, 0.35, 0.3, 0.35, pick([C.leaf, C.leaf2]), 6, 0, 0.3, q + k * 20);
    flower(world, I, 14.5 + Math.cos(a) * 2.0 + (R() - .5) * .4, TY + 3.2 + Math.sin(a) * 2.0 + 0.15, z + (R() - .5) * .5, 0.11, pick(C.rose)); }
  swag(world, [12.5, TY + 3.0, z + 0.15], [16.5, TY + 3.0, z + 0.15], 0.5, 60 + k);
  obstacles.push({ x: 12.5, z, r: 0.3 }, { x: 16.5, z, r: 0.3 }); }
for (const [x, z] of [[-19.5, -47], [-19.5, -55], [-19.5, -63], [19.5, -63], [-17, -70], [17, -70], [-21, -78], [21, -78], [-17.5, -86], [17.5, -86]]) { cypress(world, x, z, 7 + R() * 2.5, TY); obstacles.push({ x, z, r: 0.6 }); }
tree(world, -15.5, -46.5, 1.0, 'w', 777, true, TY); obstacles.push({ x: -15.5, z: -46.5, r: 0.5 });
tree(world, 19.5, -46.5, 1.0, 'w', 778, true, TY); obstacles.push({ x: 19.5, z: -46.5, r: 0.5 });

// ---------- cathedral ----------
{
  const B = TY, F = CFRONT;
  // portal steps
  for (let i = 0; i < 4; i++) { const z0 = F + 3.0 - i * 0.75; box(world, I, 0, B, (z0 + F) / 2, 8 - i * 0.4, (i + 1) * 0.15, z0 - F, C.stoneW, 0); }
  // main nave
  box(world, I, 0, B, F - 13.8, 14, 21, 27.6, C.cath);
  roof(world, T(0, F - 13.8, Math.PI / 2, B), 0, 21, 0, 27.8, 14.8, 9, C.cathRoof, 9);
  poly(world, I, [[-7, B + 21], [7, B + 21], [0, B + 30.5]], F + 0.05, C.cath);
  for (const s of [-1, 1]) tube(world, I, [s * 7.1, B + 21, F + 0.12], [0, B + 30.6, F + 0.12], 0.18, 4, C.cathTrim);
  cyl(world, I, 0, B + 30.2, F + 0.1, 0.55, 0, 4.2, 8, C.gold, 7); box(world, I, 0, B + 34.2, F + 0.1, 0.1, 1.2, 0.1, C.gold, 7); box(world, I, 0, B + 34.8, F + 0.1, 0.6, 0.1, 0.1, C.gold, 7);
  // side aisles
  for (const s of [-1, 1]) { box(world, I, s * 10, B, F - 15, 6, 13, 25, C.cath); roof(world, T(s * 10, F - 15, Math.PI / 2, B), 0, 13, 0, 25.2, 6.6, 2.5, C.cathRoof, 9);
    for (let k = 0; k < 5; k++) { const z = F - 5 - k * 4.5; const tfS = T(s * 13.02, z, s > 0 ? Math.PI / 2 : -Math.PI / 2, B); arch(tfS === null ? world : world, tfS, 0, 3, 0, 1.5, 4.0, hex('#a9b7d2'), 13); } }
  // front towers
  for (const s of [-1, 1]) {
    const tx = s * 9.6;
    box(world, I, tx, B, F - 3.0, 5.2, 29, 6.2, C.cath);
    for (const y of [9.5, 18.5, 28.6]) box(world, I, tx, B + y, F - 3.0, 5.7, 0.4, 6.7, C.cathTrim);
    box(world, I, tx, B + 29, F - 3.0, 4.0, 4.5, 4.6, C.cath);
    for (const y of [5, 12, 21]) { arch(world, I, tx, B + y, F + 0.02, 1.1, 2.6, hex('#a9b7d2'), 13); }
    arch(world, I, tx, B + 30, F - 0.68, 1.4, 1.8, hex('#7d7f93'));
    cyl(world, I, tx, B + 33.5, F - 3.0, 2.4, 0, 12.5, 8, C.gold, 0, true, Math.PI / 8);
    box(world, I, tx, B + 46, F - 3.0, 0.12, 1.6, 0.12, C.gold, 7); box(world, I, tx, B + 46.8, F - 3.0, 0.8, 0.12, 0.12, C.gold, 7);
    for (const a of [-1, 1]) for (const b of [-1, 1]) { box(world, I, tx + a * 2.35, B + 29, F - 3.0 + b * 2.85, 0.6, 2.2, 0.6, C.cath); cyl(world, I, tx + a * 2.35, B + 31.2, F - 3.0 + b * 2.85, 0.42, 0, 2.6, 6, C.gold, 7); }
    // outer small towers
    const ox = s * 14.3;
    box(world, I, ox, B, F - 2.0, 3.0, 19, 4.0, C.cath);
    box(world, I, ox, B + 19, F - 2.0, 3.3, 0.35, 4.3, C.cathTrim);
    cyl(world, I, ox, B + 19.3, F - 2.0, 1.45, 0, 7.5, 8, C.gold, 0, true, Math.PI / 8);
    arch(world, I, ox, B + 7, F + 0.02, 1.2, 4.5, hex('#a9b7d2'), 13);
    box(world, I, s * 7.2, B, F - 0.0, 0.8, 21, 0.9, C.cathTrim); cyl(world, I, s * 7.2, B + 21, F, 0.45, 0, 3.0, 6, C.gold, 7);
  }
  // rose window
  disc(world, I, 0, B + 15.2, F + 0.04, 3.9, 40, C.cathTrim);
  disc(world, I, 0, B + 15.2, F + 0.08, 3.4, 40, hex('#b9c7e4'), 13);
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; const p0 = [Math.cos(a) * 0.7, B + 15.2 + Math.sin(a) * 0.7], p1 = [Math.cos(a) * 3.4, B + 15.2 + Math.sin(a) * 3.4];
    poly(world, I, [[p0[0] - Math.sin(a) * 0.08, p0[1] + Math.cos(a) * 0.08], [p1[0] - Math.sin(a) * 0.1, p1[1] + Math.cos(a) * 0.1], [p1[0] + Math.sin(a) * 0.1, p1[1] - Math.cos(a) * 0.1], [p0[0] + Math.sin(a) * 0.08, p0[1] - Math.cos(a) * 0.08]], F + 0.12, C.cathTrim);
    disc(world, I, Math.cos(a + 0.26) * 2.6, B + 15.2 + Math.sin(a + 0.26) * 2.6, F + 0.12, 0.32, 10, C.cathTrim); }
  disc(world, I, 0, B + 15.2, F + 0.14, 0.75, 16, C.gold, 7);
  // portal: layered pointed arches
  const PB = B + 0.6;
  arch(world, I, 0, PB, F + 0.03, 7.2, 3.8, C.cathTrim);
  arch(world, I, 0, PB, F + 0.06, 6.2, 3.7, hex('#f3ece8'));
  arch(world, I, 0, PB, F + 0.09, 5.2, 3.6, C.cathTrim);
  arch(world, I, 0, PB, F + 0.12, 4.2, 3.5, hex('#f6efea'));
  arch(world, I, 0, PB + 3.5, F + 0.15, 3.4, 0.02, hex('#e9cf8a'), 13);
  box(world, I, 0, PB, F + 0.1, 3.4, 3.5, 0.12, hex('#c99f78'));
  box(world, I, 0, PB, F + 0.17, 0.08, 3.5, 0.02, hex('#9e7b5c'));
  for (const s of [-1, 1]) { for (let q = 0; q < 3; q++) box(world, I, s * 0.85, PB + 0.7 + q * 1.0, F + 0.17, 1.2, 0.06, 0.02, C.gold, 7); }
  // wimperg
  for (const s of [-1, 1]) { box(world, I, s * 4.2, B, F + 0.2, 0.7, PB - B + 7.0, 0.7, C.cathTrim); cyl(world, I, s * 4.2, PB + 7.0, F + 0.2, 0.4, 0, 2.0, 6, C.gold, 7); }
  // arcade gallery under rose
  for (let k = -3; k <= 3; k++) arch(world, I, k * 1.3, B + 9.0, F + 0.05, 0.75, 1.3, hex('#a9b7d2'), 13);
  // flowers at facade
  for (const s of [-1, 1]) { rosesOn(world, T(s * 5.6, F, 0), 0, B + 0.2, 0.25, 1.4, 6, 18, R, 0.2); barrel(world, I, s * 4.6, F + 1.6, R, B + 0.6); }
}


// ================= MEL'S MANSION + NINA'S SHACK (west of plaza) =================
const MANSION = { gateX: -46, cz: -24, wallZ0: -58, wallZ1: 10, courtX: -77.5 };
const bedRects = []; // non-walkable rectangles inside grounds [x0,z0,x1,z1]
{
  const r = rngf(4040), gz = MANSION.cz;
  const PINK = hex('#eaa9b6'), WALLC = hex('#fcf4ef'), TRIM = hex('#f2e5dd'), GLASS = hex('#cfdaee'), GOLD = C.gold, HEDGE = hex('#a3c28a');
  // ---- path from plaza
  flatQuad(world, -46.5, gz - 2.2, -12.5, gz + 2.2, 0.011, C.cobble, 1);
  for (const s of [-1, 1]) box(world, I, -29.5, 0, gz + s * 2.3, 34, 0.07, 0.12, C.stone);
  for (let x = -18; x > -44; x -= 8) for (const s of [-1, 1]) { lampPost(world, x, gz + s * 2.75); obstacles.push({ x, z: gz + s * 2.75, r: 0.25 }); }
  for (let x = -18; x > -40; x -= 8) for (const s of [-1, 1]) swag(world, [x, 2.9, gz + s * 2.75], [x - 8, 2.9, gz + s * 2.75], 0.6, 200 + x);
  for (let x = -16; x > -44; x -= 2.2) for (const s of [-1, 1]) { const z = gz + s * 3.6; blob(world, I, x, 0.5, z, 0.8, 0.55, 0.6, C.leaf, 6, 0, 0.3, x * s);
    for (let q = 0; q < 4; q++) flower(world, I, x + (r() - .5) * 1.2, 0.8 + r() * 0.3, z + (r() - .5) * 0.6, 0.1, pick(C.rose, r)); }
  for (const [x, s] of [[-22, 1], [-30, -1], [-38, 1], [-26, -1], [-42, -1]]) tree(world, x, gz + s * 6.5, 1.1, pick(['w', 'p'], r), 900 + x, true);
  // signpost at the fork
  { const sx = -14.6, sz = gz - 3.0; cyl(world, I, sx, 0, sz, 0.08, 0.07, 2.6, 6, hex('#9c8170'));
    const bd = (y, col, len) => { box(world, I, sx - len / 2, y, sz, len, 0.32, 0.06, col); world.tri([sx - len, y, sz + 0.031], [sx - len, y + 0.32, sz + 0.031], [sx - len - 0.25, y + 0.16, sz + 0.031], col, 0, [sx - len + 1, y, sz - 1]); };
    bd(2.05, hex('#f3c3cf'), 1.1); bd(1.6, hex('#b59a84'), 0.9); flower(world, I, sx, 2.65, sz, 0.12, C.rose[0]); obstacles.push({ x: sx, z: sz, r: 0.25 }); }

  // ---- walls (balustrade) + golden gate
  balustrade([MANSION.gateX, MANSION.wallZ0], [MANSION.gateX, gz - 3.0], 0);
  balustrade([MANSION.gateX, gz + 3.0], [MANSION.gateX, MANSION.wallZ1], 0);
  balustrade([MANSION.gateX, MANSION.wallZ0], [-112, MANSION.wallZ0], 0);
  balustrade([MANSION.gateX, MANSION.wallZ1], [-112, MANSION.wallZ1], 0);
  for (const s of [-1, 1]) {
    const pz = gz + s * 3.15;
    box(world, I, MANSION.gateX, 0, pz, 1.3, 4.6, 1.3, WALLC, 8); box(world, I, MANSION.gateX, 4.6, pz, 1.5, 0.3, 1.5, TRIM);
    cyl(world, I, MANSION.gateX, 4.9, pz, 0.3, 0.5, 0.6, 10, GOLD); blob(world, I, MANSION.gateX, 5.75, pz, 0.45, 0.5, 0.45, GOLD, 0, 1); cyl(world, I, MANSION.gateX, 6.2, pz, 0.12, 0, 0.6, 6, GOLD);
    rosesOn(world, T(MANSION.gateX, pz, Math.PI / 2), 0, 0.2, 0.68, 1.2, 3.6, 7, r);
    // open gate leaf (swung inward, along -x)
    const lz = gz + s * 2.35;
    for (let k = 0; k <= 12; k++) { const x = MANSION.gateX - 0.6 - k * 0.24; box(world, I, x, 0.2, lz, 0.05, 3.2 + Math.sin(k / 12 * Math.PI) * 0.6, 0.05, GOLD); }
    for (const y of [0.2, 1.4, 3.3]) box(world, I, MANSION.gateX - 2.06, y, lz, 2.95, 0.07, 0.07, GOLD);
    for (let k = 0; k < 3; k++) roundArchBand(world, T(MANSION.gateX - 1.0 - k * 0.9, lz, 0), 0, 2.3, 0, 0.22, 0.29, 0.05, 8, GOLD);
    obstacles.push({ x: MANSION.gateX, z: pz, r: 0.9 });
  }
  roundArchBand(world, T(MANSION.gateX, gz, Math.PI / 2), 0, 4.8, 0, 2.9, 3.05, 0.12, 16, GOLD);
  blob(world, I, MANSION.gateX, 7.95, gz, 0.4, 0.4, 0.15, GOLD, 0, 1);

  // ---- garden paving
  flatQuad(world, MANSION.courtX - 1.5, gz - 2.6, MANSION.gateX, gz + 2.6, 0.013, hex('#f4e9e4'), 11);
  flatQuad(world, -65.6, MANSION.wallZ0 + 1, -60.4, MANSION.wallZ1 - 1, 0.012, hex('#f4e9e4'), 11);
  flatQuad(world, -83, MANSION.wallZ0 + 1, MANSION.courtX + 0.5, MANSION.wallZ1 - 1, 0.012, hex('#f4e9e4'), 11);
  // central fountain plaza
  flatDisc(world, -63, gz, 0.016, 8.4, 56, hex('#f1e5df'), 11);
  flatDisc(world, -63, gz, 0.02, 7.0, 56, hex('#f6ece6'), 11);
  for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; const x = -63 + Math.cos(a) * 5.7, z = gz + Math.sin(a) * 5.7;
    blob(world, I, x, 0.35, z, 0.75, 0.4, 0.75, HEDGE, 6, 0, 0.3, k); for (let q = 0; q < 3; q++) flower(world, I, x + (r() - .5) * .9, 0.65 + r() * .15, z + (r() - .5) * .9, 0.1, pick(C.rose, r)); }
  fountain(world, -63, gz, 0, 1.3); obstacles.push({ x: -63, z: gz, r: 6.4 });
  // side fountains on cross avenue
  for (const fz of [gz - 21, gz + 21]) { flatDisc(world, -63, fz, 0.018, 4.4, 40, hex('#f1e5df'), 11); fountain(world, -63, fz, 0, 0.75); obstacles.push({ x: -63, z: fz, r: 2.6 }); }
  // parterre beds
  function bed(x0, z0, x1, z1) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
    box(world, I, cx, 0, z0 + 0.3, w, 0.55, 0.6, HEDGE, 6); box(world, I, cx, 0, z1 - 0.3, w, 0.55, 0.6, HEDGE, 6);
    box(world, I, x0 + 0.3, 0, cz, 0.6, 0.55, d, HEDGE, 6); box(world, I, x1 - 0.3, 0, cz, 0.6, 0.55, d, HEDGE, 6);
    flatQuad(world, x0 + 0.5, z0 + 0.5, x1 - 0.5, z1 - 0.5, 0.01, hex('#b9cf98'), 2);
    for (let x = x0 + 1.5; x < x1 - 1; x += 1.7) for (let z = z0 + 1.5; z < z1 - 1; z += 1.7) {
      blob(world, I, x, 0.45, z, 0.62, 0.45, 0.62, pick([C.leaf, HEDGE], r), 6, 0, 0.35, x * 3 + z);
      const col = (Math.floor((x - x0) / 3.4) + Math.floor((z - z0) / 3.4)) % 3 === 0 ? C.white : pick(C.rose, r);
      for (let q = 0; q < 4; q++) flower(world, I, x + (r() - .5) * .8, 0.72 + r() * .2, z + (r() - .5) * .8, 0.11, col);
    }
    for (const [x, z] of [[x0 + 0.3, z0 + 0.3], [x1 - 0.3, z0 + 0.3], [x0 + 0.3, z1 - 0.3], [x1 - 0.3, z1 - 0.3]]) { cypress(world, x, z, 4.2); }
    bedRects.push([x0 - 0.2, z0 - 0.2, x1 + 0.2, z1 + 0.2]);
  }
  bed(-58.5, gz - 26, -48.5, gz - 6.5); bed(-58.5, gz + 9.0, -48.5, gz + 18.5);
  bed(-76.5, gz - 30, -67.5, gz - 9.5); bed(-76.5, gz + 9.5, -67.5, gz + 30);
  bed(-76.5, gz - 6.8, -71.5, gz - 3.4); bed(-76.5, gz + 3.4, -71.5, gz + 6.8);
  // cypress rows along the avenue
  for (let x = -49; x > -59; x -= 3.3) for (const s of [-1, 1]) { cypress(world, x, gz + s * 3.6, 5.5); obstacles.push({ x, z: gz + s * 3.6, r: 0.5 }); }
  // gazebo (front-left corner)
  { const gx = -52.5, gzz = gz - 31.5, n = 8, rr = 2.4;
    cyl(world, I, gx, 0, gzz, 3.0, 3.0, 0.3, 16, WALLC);
    for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; cyl(world, I, gx + Math.cos(a) * rr, 0.3, gzz + Math.sin(a) * rr, 0.13, 0.13, 3.0, 8, WALLC);
      rosesOn(world, T(gx + Math.cos(a) * rr, gzz + Math.sin(a) * rr, Math.atan2(Math.cos(a), Math.sin(a))), 0, 0.3, 0.1, 0.3, 2.6, 2, r); }
    cyl(world, I, gx, 3.3, gzz, 2.9, 2.9, 0.35, 16, TRIM);
    blob(world, I, gx, 3.6, gzz, 2.9, 2.2, 2.9, PINK, 0, 1);
    cyl(world, I, gx, 5.6, gzz, 0.35, 0.25, 0.7, 8, GOLD); cyl(world, I, gx, 6.3, gzz, 0.25, 0, 0.9, 6, GOLD);
    obstacles.push({ x: gx, z: gzz, r: 3.0 }); }
  // corner gazebo on palace side
  for (const s of [-1, 1]) { const gx = -80.5, gzz = gz + s * 30; cyl(world, I, gx, 0, gzz, 2.4, 2.4, 0.3, 14, WALLC);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; cyl(world, I, gx + Math.cos(a) * 1.9, 0.3, gzz + Math.sin(a) * 1.9, 0.11, 0.11, 2.6, 6, WALLC); }
    blob(world, I, gx, 3.0, gzz, 2.4, 1.8, 2.4, PINK, 0, 1); cyl(world, I, gx, 4.6, gzz, 0.2, 0, 1.0, 6, GOLD); obstacles.push({ x: gx, z: gzz, r: 2.5 }); }
  // urns on the wall
  for (let z = MANSION.wallZ0 + 3.2; z < MANSION.wallZ1; z += 6.4) { if (Math.abs(z - gz) < 4) continue; cyl(world, I, MANSION.gateX, 1.15, z, 0.18, 0.32, 0.38, 10, WALLC);
    blob(world, I, MANSION.gateX, 1.7, z, 0.42, 0.3, 0.42, C.leaf, 6, 0, 0.3, z); for (let q = 0; q < 6; q++) flower(world, I, MANSION.gateX + (r() - .5) * .6, 1.8 + r() * .2, z + (r() - .5) * .6, 0.09, pick(C.rose, r)); }

  // ---- PALACE (local frame: +z faces the gate / east)
  const P = T(-96, gz, Math.PI / 2);
  box(world, P, 0, 0, 0, 86, 2.0, 28, hex('#efe4dd'), 8);
  for (let i = 0; i < 8; i++) { const z0 = 14, z1 = 14 + (8 - i) * 0.5; box(world, P, 0, 0, (z0 + z1) / 2, 18 - i * 0.3, (i + 1) * 0.25, z1 - z0, i % 2 ? C.stone : C.stoneW); }
  for (const s of [-1, 1]) { const a = P(s * 9.5, 0, 14.2), b = P(s * 43, 0, 14.2); balustrade([a[0], a[2]], [b[0], b[2]], 2.0); }
  // main block
  box(world, P, 0, 2, 0, 30, 18, 20, WALLC);
  for (const y of [8.4, 14.2, 19.6]) box(world, P, 0, 2 + y - 2, 0, 30.4, 0.35, 20.4, TRIM);
  roof(world, P, 0, 20, 0, 30.8, 21.2, 9.5, PINK, 9, WALLC);
  for (let k = -2; k <= 2; k++) { const p = P(k * 6, 0, 0); cyl(world, I, p[0], 29.2, p[2], 0.45, 0, k === 0 ? 5 : 3.2, 6, GOLD); }
  // central gable front
  box(world, P, 0, 2, 11.5, 14, 22, 3, WALLC);
  { const p = P(0, 0, 11.5); roof(world, T(p[0], p[2], Math.PI), 0, 24, 0, 5.0, 14.8, 8.5, PINK, 9, WALLC); }
  arch(world, P, 0, 7.0, 13.02, 8.2, 8.5, GLASS, 13);
  for (const x of [-2.6, 0, 2.6]) box(world, P, x, 7, 13.05, 0.18, 8.5, 0.06, TRIM);
  box(world, P, 0, 11.2, 13.05, 8.0, 0.2, 0.06, TRIM);
  disc(world, P, 0, 27.0, 14.03, 2.0, 24, TRIM); disc(world, P, 0, 27.0, 14.06, 1.65, 24, GLASS, 13); disc(world, P, 0, 27.0, 14.09, 0.45, 12, GOLD, 7);
  arch(world, P, 0, 2, 13.05, 5.6, 3.4, TRIM); arch(world, P, 0, 2, 13.1, 4.6, 3.2, hex('#f7eee9')); box(world, P, 0, 2, 13.12, 3.8, 3.3, 0.1, hex('#c99f78'));
  for (const s of [-1, 1]) { box(world, P, s * 0.95, 2.6, 13.18, 1.3, 0.06, 0.02, GOLD, 7); box(world, P, s * 0.95, 4.2, 13.18, 1.3, 0.06, 0.02, GOLD, 7); }
  for (const s of [-1, 1]) { box(world, P, s * 7.2, 2, 13.1, 0.9, 25, 0.9, TRIM); const p = P(s * 7.2, 0, 13.1); cyl(world, I, p[0], 27, p[2], 0.55, 0, 4.0, 6, GOLD); }
  rosesOn(world, P, -4.5, 2.2, 13.0, 1.2, 5, 12, r, 0.2); rosesOn(world, P, 4.5, 2.2, 13.0, 1.2, 5, 12, r, 0.2);
  // wings
  for (const s of [-1, 1]) {
    box(world, P, s * 29, 2, 0, 28, 13, 16, WALLC);
    box(world, P, s * 29, 8.4, 0, 28.3, 0.3, 16.3, TRIM); box(world, P, s * 29, 14.6, 0, 28.3, 0.4, 16.3, TRIM);
    roof(world, P, s * 29, 15, 0, 28.6, 17.2, 6.5, PINK, 9, WALLC);
    for (let k = 0; k < 8; k++) { const x = s * (16.8 + k * 3.35); arch(world, P, x, 3.6, 8.02, 1.6, 2.8, GLASS, 13); arch(world, P, x, 9.4, 8.02, 1.5, 2.6, GLASS, 13);
      box(world, P, x, 3.3, 8.2, 2.0, 0.25, 0.5, TRIM); }
    for (let k = 0; k < 5; k++) { const p = P(s * (18 + k * 6), 0, 0); cyl(world, I, p[0], 21.0, p[2], 0.35, 0, 2.8, 6, GOLD); }
    for (let k = 0; k < 4; k++) { const x = s * (19 + k * 7); box(world, P, x, 15, 6.0, 1.6, 2.2, 1.6, WALLC); const p = P(x, 0, 6.0); roof(world, T(p[0], p[2], Math.PI), 0, 17.2, 0, 1.9, 1.9, 1.4, PINK, 9, WALLC); arch(world, P, x, 15.4, 6.81, 0.8, 1.0, GLASS, 13); }
    // junction towers
    { const p = P(s * 15.6, 0, 9.4); cyl(world, I, p[0], 2, p[2], 2.6, 2.6, 26, 14, WALLC); for (const y of [10, 16, 22]) cyl(world, I, p[0], y, p[2], 2.8, 2.8, 0.35, 14, TRIM);
      cyl(world, I, p[0], 28, p[2], 3.3, 0, 9.5, 14, PINK, 9); blob(world, I, p[0], 37.6, p[2], 0.35, 0.35, 0.35, GOLD, 0, 1); cyl(world, I, p[0], 37.8, p[2], 0.12, 0, 1.6, 6, GOLD);
      for (let k = 0; k < 3; k++) { const a = k * 2.1 + 0.4; arch(world, T(p[0] + Math.sin(Math.PI / 2 + a) * 2.62, p[2] + Math.cos(Math.PI / 2 + a) * 2.62, Math.PI / 2 + a), 0, 18, 0, 0.9, 2.0, GLASS, 13); } }
    // small front towers
    for (const lx of [24, 36]) { const p = P(s * lx, 0, 8.6); cyl(world, I, p[0], 2, p[2], 1.4, 1.4, 17.5, 10, WALLC); cyl(world, I, p[0], 19.5, p[2], 1.8, 0, 5.5, 10, PINK, 9); cyl(world, I, p[0], 24.8, p[2], 0.1, 0, 1.4, 6, GOLD); }
    // rotunda + glass dome
    { const p = P(s * 47, 0, 1); cyl(world, I, p[0], 0, p[2], 7.6, 7.6, 2.0, 28, hex('#efe4dd'), 8); cyl(world, I, p[0], 2, p[2], 7.0, 7.0, 12, 28, WALLC);
      cyl(world, I, p[0], 8.2, p[2], 7.2, 7.2, 0.3, 28, TRIM); cyl(world, I, p[0], 13.6, p[2], 7.3, 7.3, 0.45, 28, TRIM);
      for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; const wx = p[0] + Math.cos(a) * 7.02, wz = p[2] + Math.sin(a) * 7.02, th = Math.atan2(Math.cos(a), Math.sin(a));
        const tf = T(wx, wz, th); arch(world, tf, 0, 3.4, 0, 1.4, 3.0, GLASS, 13); arch(world, tf, 0, 9.0, 0, 1.3, 2.6, GLASS, 13); }
      blob(world, I, p[0], 14.0, p[2], 7.1, 5.6, 7.1, hex('#dfe8f3'), 13, 1);
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; let prev = null; for (let j = 0; j <= 6; j++) { const ph = j / 6 * Math.PI / 2; const q = [p[0] + Math.cos(a) * Math.cos(ph) * 7.15, 14 + Math.sin(ph) * 5.65, p[2] + Math.sin(a) * Math.cos(ph) * 7.15]; if (prev) tube(world, I, prev, q, 0.09, 4, GOLD); prev = q; } }
      cyl(world, I, p[0], 19.4, p[2], 0.9, 0.9, 1.5, 10, WALLC); cyl(world, I, p[0], 20.9, p[2], 1.2, 0, 2.6, 10, GOLD); }
  }
  // ---- NINA'S SHACK (front-right corner of the garden)
  { const hx = -52.8, hz = gz + 26.6, H = T(hx, hz, Math.PI); // front faces the avenue (-z)
    const PL = [hex('#9b8574'), hex('#a8927e'), hex('#8d7867'), hex('#b39c86'), hex('#86735f')];
    flatDisc(world, hx, hz - 0.6, 0.014, 4.6, 20, hex('#cdb79f'), 0);
    for (const [x, z] of [[-1.7, -1.5], [1.7, -1.5], [-1.7, 1.5], [1.7, 1.5]]) box(world, H, x, 0, z, 0.35, 0.3, 0.35, C.stone);
    box(world, H, 0, 0.3, 0, 3.8, 0.18, 3.4, hex('#8f7a68'));
    // plank walls (uneven)
    for (let k = 0; k < 16; k++) { const x = -1.8 + k * 0.24, h = 2.3 + Math.sin(k * 1.7) * 0.12 - k * 0.025; box(world, H, x, 0.48, -1.62, 0.23, h, 0.08, pick(PL, r)); }
    for (const s of [-1, 1]) for (let k = 0; k < 14; k++) { const z = -1.6 + k * 0.24, h = 2.3 - (s > 0 ? 0.35 : 0) - k * 0.02 + Math.sin(k) * 0.06; box(world, H, s * 1.86, 0.48, z, 0.08, h, 0.23, pick(PL, r)); }
    for (let k = 0; k < 16; k++) { const x = -1.8 + k * 0.24; if (x > -0.75 && x < 0.3) continue; if (x > 0.65 && x < 1.5) { box(world, H, x, 0.48, 1.62, 0.23, 0.75, 0.08, pick(PL, r)); box(world, H, x, 1.95, 1.62, 0.23, 0.55 - k * 0.02, 0.08, pick(PL, r)); continue; }
      box(world, H, x, 0.48, 1.62, 0.23, 2.15 - k * 0.03 + Math.sin(k * 2.3) * 0.08, 0.08, pick(PL, r)); }
    box(world, H, 1.07, 1.23, 1.6, 0.85, 0.72, 0.03, hex('#4f4a52'));
    tube(world, H, [0.66, 1.25, 1.68], [1.48, 1.93, 1.68], 0.035, 4, hex('#a8927e')); tube(world, H, [0.66, 1.93, 1.68], [1.48, 1.25, 1.68], 0.035, 4, hex('#a8927e'));
    // door ajar
    { const p = H(-0.75, 0, 1.62); const D = T(p[0], p[2], Math.PI + 0.55); for (let k = 0; k < 4; k++) box(world, D, 0.13 + k * 0.25, 0.5, 0.0, 0.24, 1.95, 0.06, pick(PL, r)); tube(world, D, [0.05, 0.75, 0.05], [1.0, 2.2, 0.05], 0.04, 4, hex('#7d6a58')); }
    // sagging shed roof with patches
    { const y0 = 4.0, y1 = 2.75; const q = (x, z) => H(x, z > 0 ? y1 - 0.06 * Math.cos(x) : y0, z);
      for (let i = 0; i < 6; i++) { const x0 = -2.2 + i * 0.75, x1 = x0 + 0.78, col = i === 2 ? hex('#b78f80') : i === 4 ? hex('#a9a9b1') : pick([hex('#9a8a7e'), hex('#8c7c70')], r);
        const sag = (x) => -0.12 * Math.sin((x + 2.2) / 4.4 * Math.PI);
        world.quad(H(x0, y0 + sag(x0), -2.0), H(x1, y0 + sag(x1), -2.0), H(x1, y1 + sag(x1), 2.1), H(x0, y1 + sag(x0), 2.1), col, 0, H((x0 + x1) / 2, 0, 0)); }
      box(world, H, 0.4, 3.18, 0.8, 0.9, 0.05, 0.7, hex('#c9a27c')); box(world, H, -1.2, 3.65, -0.9, 0.6, 0.05, 0.5, hex('#9fa8b4')); }
    for (const s2 of [-1, 1]) world.quad(H(s2 * 1.9, 2.6, -1.66), H(s2 * 1.9, 2.75, 1.66), H(s2 * 1.9, 2.75, 2.0), H(s2 * 1.9, 3.95, -1.9), hex('#8d7867'), 0, H(0, 2, 0));
    box(world, H, 0, 2.7, -1.62, 3.8, 1.25, 0.08, hex('#9b8574'));
    // crooked stovepipe
    tube(world, H, [1.1, 3.4, -0.8], [1.15, 4.4, -0.85], 0.1, 6, hex('#7d756f')); tube(world, H, [1.15, 4.4, -0.85], [1.45, 4.75, -0.8], 0.1, 6, hex('#7d756f'));
    // props: firewood, bucket, crate, cans, laundry line, hammock, weeds
    for (let k = 0; k < 9; k++) { const y = 0.12 + Math.floor(k / 3) * 0.2, z = -0.6 + (k % 3) * 0.22 + (Math.floor(k / 3) % 2) * 0.1; tube(world, H, [-2.15, y, z], [-2.15 - 0.0, y, z].map((v, i) => i === 0 ? v - 0.9 : v), 0.1, 6, hex('#b48d6e')); }
    cyl(world, H, 2.3, 0, 1.4, 0.2, 0.24, 0.4, 8, hex('#9aa0a6')); box(world, H, 2.4, 0, 2.3, 0.6, 0.45, 0.5, hex('#c4a57f'));
    for (let k = 0; k < 7; k++) { const cx = (r() - 0.5) * 3.2, cz2 = 2.1 + r() * 1.2; const tf = T(...H(cx, 0, cz2).filter((_, i) => i !== 1), r() * 6);
      if (k % 2) { tube(world, tf, [-0.1, 0.07, 0], [0.1, 0.07, 0], 0.065, 8, hex('#e3e5e8')); tube(world, tf, [-0.03, 0.07, 0], [0.03, 0.07, 0], 0.067, 8, hex('#f2d36a')); }
      else { cyl(world, tf, 0, 0, 0, 0.065, 0.065, 0.24, 8, hex('#e3e5e8')); cyl(world, tf, 0, 0.08, 0, 0.067, 0.067, 0.08, 8, hex('#f2d36a'), 0, false); } }
    // laundry line between shack corner and a pole
    { const a = H(-1.9, 2.0, -1.7), b = H(-1.9, 2.0, -5.6); cyl(world, I, b[0], 0, b[2], 0.06, 0.05, 2.1, 6, hex('#9c8170'));
      tube(world, I, a, b, 0.012, 3, hex('#d8d0c8'));
      const cloth = (t, w, h, col) => { const p = [a[0] + (b[0] - a[0]) * t, 2.0, a[2] + (b[2] - a[2]) * t]; world.quad([p[0], 2.0, p[2] - w / 2], [p[0], 2.0, p[2] + w / 2], [p[0] + 0.02, 2.0 - h, p[2] + w / 2], [p[0] + 0.02, 2.0 - h, p[2] - w / 2], col, 4); };
      cloth(0.25, 0.75, 0.8, hex('#48434c')); cloth(0.52, 0.55, 0.7, hex('#f4eee4')); cloth(0.75, 0.3, 0.35, hex('#48434c')); }
    // hammock to a scraggly tree
    { const tp = H(3.6, 0, -1.8); cyl(world, I, tp[0], 0, tp[2], 0.2, 0.14, 2.8, 7, C.trunk); blob(world, I, tp[0], 3.4, tp[2], 1.3, 1.0, 1.3, hex('#9fb985'), 6, 1, 0.5, 77); blob(world, I, tp[0] + 0.6, 2.9, tp[2] - 0.4, 0.8, 0.6, 0.8, hex('#93ad7b'), 6, 0, 0.5, 78);
      const a = H(1.95, 1.5, -1.2), b = H(3.45, 1.5, -1.7); const n = 8; let prevL = null, prevR = null;
      for (let i = 0; i <= n; i++) { const t = i / n, sag = Math.sin(t * Math.PI) * 0.55; const p = [a[0] + (b[0] - a[0]) * t, 1.5 - sag, a[2] + (b[2] - a[2]) * t];
        const L = [p[0], p[1], p[2] - 0.28], Rr = [p[0], p[1], p[2] + 0.28]; if (prevL) world.quad(prevL, prevR, Rr, L, hex('#e8d9c0'), 4); prevL = L; prevR = Rr; }
      obstacles.push({ x: tp[0], z: tp[2], r: 0.4 }); }
    for (let k = 0; k < 18; k++) { const p = H((r() - 0.5) * 6, 0, (r() - 0.5) * 5); if (Math.abs(p[0] - hx) < 2 && Math.abs(p[2] - hz) < 1.8) continue; blob(world, I, p[0], 0.18, p[2], 0.12, 0.3, 0.12, pick([hex('#9fb985'), hex('#b4c792')], r), 6, 0); }
    bedRects.push([hx - 2.1, hz - 1.95, hx + 2.1, hz + 1.95]);
    MANSION.hut = [hx, hz];
  }
}

// distant land: hills with fields, far houses, trees
{ const r = rngf(88);
  for (let k = 0; k < 22; k++) { const a = k / 22 * Math.PI * 2 + r() * 0.2, d = 150 + r() * 110;
    cyl(world, I, Math.cos(a) * d, -1, Math.sin(a) * d, 45 + r() * 35, 8 + r() * 10, 12 + r() * 20, 16, pick([hex('#bcd5a5'), hex('#c8dcb2'), hex('#c7d3dd'), hex('#d4e0bd')], r), 14, true); }
  let placed = 0, tries = 0;
  while (placed < 220 && tries < 6000) { tries++;
    const x = (r() - 0.5) * 200, z = -120 + r() * 260;
    if (Math.abs(x) < 13.5 && z > -14 && z < 52) continue;
    if (Math.hypot(x - PZ[0], z - PZ[1]) < 27) continue;
    if (Math.abs(x) < 25 && z < -36 && z > -100) continue;
    if (x < -10 && x > -125 && z > -68 && z < 20) continue;
    const near = Math.hypot(x, z - 10) < 50;
    if (r() < 0.25) cypress(world, x, z, 6 + r() * 4); else tree(world, x, z, 0.9 + r() * 0.6, pick(['w', 'g', 'g', 'p', 'w'], r), 1000 + tries, near);
    placed++; }
  for (let k = 0; k < 26; k++) { const a = r() * Math.PI * 2, d = 55 + r() * 60, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.abs(x) < 26 && z < -30) continue; if (Math.abs(x) < 14 && z > -14) continue; if (x < -10 && x > -125 && z > -70 && z < 22) continue;
    house(x, z, r() * 6.28, 5 + r() * 2, 6 + r() * 2, 5 + r() * 2.5, r, {}); }
}

// ================= INTERIOR (cathedral nave, at X0) =================
const IW = 10, IL = 46, IH = 21;
{
  const g = inner, Q = (x, y, z) => [X0 + x, y, z], IT = T(X0, 0, 0);
  // floor (marble)
  flatQuad(g, X0 - IW, 0.5, X0 + IW, -IL, 0.0, hex('#f4efec'), 10);
  // altar platform
  box(g, IT, 0, 0, -42.5, 14, 0.45, 7, hex('#f1ebe8'), 10); box(g, IT, 0, 0, -38.6, 14, 0.22, 0.8, hex('#f1ebe8'), 10);
  // walls
  box(g, IT, -IW - 0.5, 0, -IL / 2, 1, 12, IL + 1, C.cath); box(g, IT, IW + 0.5, 0, -IL / 2, 1, 12, IL + 1, C.cath);
  box(g, IT, 0, 0, -IL - 0.5, IW * 2 + 2, IH + 2, 1, C.cath);
  box(g, IT, 0, 0, 1.0, IW * 2 + 2, IH + 2, 1, C.cath);
  // clerestory walls above arcade
  for (const s of [-1, 1]) box(g, IT, s * 6.2, 10.5, -IL / 2, 0.6, 6.5, IL, C.cath);
  // aisle ceilings
  for (const s of [-1, 1]) flatQuad(g, X0 + s * 6.2, 0.5, X0 + s * IW, -IL, 11.0, hex('#f3eeee'), 0);
  // vault
  for (const s of [-1, 1]) { g.quad(Q(s * 6.2, 17, 0.5), Q(0, 21.5, 0.5), Q(0, 21.5, -IL), Q(s * 6.2, 17, -IL), hex('#f7f2f1'), 0, Q(0, 30, -IL / 2)); }
  // columns + arcades + ribs
  for (let k = 0; k < 10; k++) {
    const z = -3.5 - k * 4.3;
    for (const s of [-1, 1]) {
      const x = s * 6.2;
      cyl(g, IT, x, 0, z, 0.6, 0.6, 0.6, 10, C.cathTrim); cyl(g, IT, x, 0.6, z, 0.42, 0.42, 9.0, 12, hex('#f6f1ee'));
      for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2 + Math.PI / 4; cyl(g, IT, x + Math.cos(a) * 0.42, 0.6, z + Math.sin(a) * 0.42, 0.13, 0.13, 9.0, 6, hex('#f2ece9')); }
      cyl(g, IT, x, 9.6, z, 0.5, 0.75, 0.6, 12, hex('#efe5dc')); for (let q = 0; q < 6; q++) blob(g, IT, x + Math.cos(q) * 0.65, 9.9, z + Math.sin(q) * 0.65, 0.18, 0.12, 0.18, hex('#e9d6a0'), 0, 0);
      // pointed arch between this column and next (along z)
      if (k < 9) { const z1 = z - 4.3, cz = (z + z1) / 2;
        const tfA = T(X0 + x, cz, Math.PI / 2);
        const pts = archPts(0, 0, 3.6, 0.01, 10).slice(2).map(p => [p[0], p[1] + 10.2]);
        for (let i = 0; i < pts.length - 1; i++) tube(g, tfA, [pts[i][0], pts[i][1], 0], [pts[i + 1][0], pts[i + 1][1], 0], 0.16, 5, hex('#f0e9e5'));
      }
      // ribs up the clerestory and over vault
      tube(g, IT, [x, 10.2, z], [x, 17, z], 0.12, 5, hex('#efe8e3'));
      tube(g, IT, [x, 17, z], [x * 0.5, 20.3, z], 0.12, 5, hex('#e9d9b0'));
      // clerestory window
      if (k < 9) { const tfW = T(X0 + s * 5.88, z - 2.15, s > 0 ? -Math.PI / 2 : Math.PI / 2); arch(g, tfW, 0, 12.0, 0, 1.4, 2.4, hex('#c7d3ea'), 13); }
      // aisle window
      if (k < 9) { const tfW = T(X0 + s * (IW - 0.01), z - 2.15, s > 0 ? -Math.PI / 2 : Math.PI / 2); arch(g, tfW, 0, 2.6, 0, 1.9, 5.0, hex('#c7d3ea'), 13); }
      inObst.push({ x: X0 + x, z, r: 0.8 });
    }
    // transverse rib across vault
    tube(g, IT, [-6.2, 17, z], [0, 21.4, z], 0.1, 5, hex('#e9d9b0')); tube(g, IT, [6.2, 17, z], [0, 21.4, z], 0.1, 5, hex('#e9d9b0'));
  }
  // walls above arches (spandrels): simple strips
  for (const s of [-1, 1]) box(g, IT, s * 6.2, 9.6, -IL / 2, 0.5, 1.0, IL, C.cath);
  // end wall: rose window + lancets
  disc(g, IT, 0, 15.5, -IL + 0.02, 4.4, 40, C.cathTrim);
  disc(g, IT, 0, 15.5, -IL + 0.05, 4.0, 40, hex('#d6dff0'), 13);
  for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; poly(g, IT, [[Math.cos(a) * 0.8 - Math.sin(a) * 0.06, 15.5 + Math.sin(a) * 0.8 + Math.cos(a) * 0.06], [Math.cos(a) * 4 - Math.sin(a) * 0.08, 15.5 + Math.sin(a) * 4 + Math.cos(a) * 0.08], [Math.cos(a) * 4 + Math.sin(a) * 0.08, 15.5 + Math.sin(a) * 4 - Math.cos(a) * 0.08], [Math.cos(a) * 0.8 + Math.sin(a) * 0.06, 15.5 + Math.sin(a) * 0.8 - Math.cos(a) * 0.06]], -IL + 0.09, C.cathTrim); }
  disc(g, IT, 0, 15.5, -IL + 0.1, 0.8, 16, C.gold, 7);
  for (const x of [-2.6, 0, 2.6]) arch(g, IT, x, 4.2, -IL + 0.03, 2.0, 5.6, hex('#d6dff0'), 13);
  // altar
  box(g, IT, 0, 0.45, -43.5, 4.2, 1.2, 1.4, hex('#f8f3ef')); box(g, IT, 0, 1.65, -43.5, 4.4, 0.1, 1.6, C.gold, 7);
  box(g, IT, 0, 0.45, -45.3, 5.5, 6.0, 0.6, hex('#f6efe9'));
  for (const x of [-2.2, -1.1, 0, 1.1, 2.2]) { cyl(g, IT, x, 6.45, -45.3, 0.35, 0, 2.2 + (x === 0 ? 1.5 : 0), 6, C.gold, 7); }
  box(g, IT, 0, 2.2, -44.9, 0.15, 2.4, 0.1, C.gold, 7); box(g, IT, 0, 3.6, -44.9, 1.1, 0.15, 0.1, C.gold, 7);
  for (const x of [-1.6, -0.8, 0.8, 1.6]) { cyl(g, IT, x, 1.75, -43.5, 0.05, 0.05, 0.5 + Math.abs(x) * 0.1, 6, C.gold, 7); box(g, IT, x, 2.3 + Math.abs(x) * 0.1, -43.5, 0.06, 0.12, 0.06, hex('#fff1c4'), 7); }
  for (const s of [-1, 1]) { cyl(g, IT, s * 3.6, 0.45, -42, 0.25, 0.4, 0.9, 10, C.cathTrim); blob(g, IT, s * 3.6, 1.7, -42, 0.8, 0.6, 0.8, C.leaf2, 6, 1, 0.3, s);
    for (let q = 0; q < 16; q++) flower(g, IT, s * 3.6 + (R() - .5) * 1.3, 1.6 + R() * 0.8, -42 + (R() - .5) * 1.2, 0.12, R() < 0.7 ? C.white : C.rose[1]); }
  inObst.push({ x: X0, z: -43.6, r: 2.4 }, { x: X0 - 1.6, z: -43.6, r: 1.4 }, { x: X0 + 1.6, z: -43.6, r: 1.4 }, { x: X0 - 3.6, z: -42, r: 0.8 }, { x: X0 + 3.6, z: -42, r: 0.8 });
  // pews
  for (let k = 0; k < 17; k++) { const z = -5.5 - k * 1.55;
    for (const s of [-1, 1]) { const tfp = T(X0 + s * 3.4, z, 0);
      box(g, tfp, 0, 0.42, 0, 3.4, 0.08, 0.5, C.wood); box(g, tfp, 0, 0.42, -0.27, 3.4, 0.62, 0.07, C.wood);
      for (const e of [-1.72, 1.72]) box(g, tfp, e, 0, -0.05, 0.08, 0.95, 0.65, hex('#c9a68c'));
      if (k % 2 === 0) { box(g, tfp, -s * 1.78, 0.75, 0.0, 0.03, 0.3, 0.3, C.ribbon); flower(g, tfp, -s * 1.8, 1.0, 0, 0.12, C.white); flower(g, tfp, -s * 1.8, 0.95, 0.12, 0.09, C.rose[1]);
        tube(g, tfp, [-s * 1.8, 0.9, 0.05], [-s * 1.8, 0.35, 0.12], 0.04, 4, C.ribbon); } } }
  // hanging lanterns
  for (let k = 0; k < 6; k++) for (const s of [-1, 1]) { const z = -5.5 - k * 6.5, x = s * 4.2;
    tube(g, IT, [x, 17, z], [x, 8.2, z], 0.02, 4, C.gold, 7); box(g, IT, x, 7.4, z, 0.45, 0.8, 0.45, hex('#fff0c8'), 7); cyl(g, IT, x, 8.2, z, 0.38, 0, 0.3, 6, C.gold, 7); }
  // ribbon swags between columns
  for (let k = 0; k < 9; k++) for (const s of [-1, 1]) { const z = -3.5 - k * 4.3; swag(g, [X0 + s * 5.6, 5.2, z], [X0 + s * 5.6, 5.2, z - 4.3], 0.8, 80 + k); }
  // flower urns at column bases
  for (let k = 0; k < 10; k += 2) for (const s of [-1, 1]) { const z = -3.5 - k * 4.3, x = s * 7.6; cyl(g, IT, x, 0, z, 0.25, 0.42, 0.8, 10, C.cathTrim);
    blob(g, IT, x, 1.2, z, 0.6, 0.45, 0.6, C.leaf2, 6, 0, 0.3, k * s); for (let q = 0; q < 10; q++) flower(g, IT, x + (R() - .5) * .9, 1.2 + R() * .5, z + (R() - .5) * .9, 0.11, R() < 0.7 ? C.white : C.rose[0]); inObst.push({ x: X0 + x, z, r: 0.6 }); }
  // entrance: bright door
  arch(g, T(X0, 0.49, Math.PI), 0, 0, 0, 3.6, 4.4, hex('#fffaf0'), 7);
  // light shafts (additive)
  for (let k = 0; k < 9; k++) for (const s of [-1, 1]) {
    const z = -5.65 - k * 4.3, wx = X0 + s * (IW - 0.05), top = 7.6, bot = 0.02, reach = 7.5;
    const hue = [0, 1, 2][k % 3], col = [[0, 0, hue / 3], [1, 0, hue / 3], [1, 1, hue / 3], [0, 1, hue / 3]];
    const a = [wx, top + 2.5, z - 0.95], b = [wx, top + 2.5, z + 0.95], c = [wx - s * reach, bot, z + 0.95 - 2.5], d = [wx - s * reach, bot, z - 0.95 - 2.5];
    shafts.rawTri([a, b, c], [[0, 0, hue / 3], [1, 0, hue / 3], [1, 1, hue / 3]], 12); shafts.rawTri([a, c, d], [[0, 0, hue / 3], [1, 1, hue / 3], [0, 1, hue / 3]], 12);
  }
}

// ================= MOBS =================
const SKIN = hex('#f9e4d8'), MOUTH = hex('#7a2e3b'), TONGUE = hex('#e98d9b'), EYE = hex('#4b3138');
function headGeo(seed) {
  const r = rngf(seed), g = new Geo(), hr = 0.25, hc = [0, 0.25, 0];
  blob(g, I, 0, 0.02, 0, 0.07, 0.08, 0.07, SKIN, 0, 0);
  blob(g, I, hc[0], hc[1], hc[2], hr, hr * 1.02, hr * 0.98, SKIN, 0, 1);
  const hair = pick(['#b08a6e', '#9a735b', '#c4a07f', '#8b6a5a', '#d2b391'].map(hex), r);
  // curly hair clumps on top/back/sides
  for (let i = 0; i < 26; i++) {
    const th = r() * Math.PI * 2, ph = r() * 1.35; // ph from top
    const dir = [Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th)];
    if (dir[2] > 0.35 && dir[1] < 0.7) continue; // keep face clear
    blob(g, I, dir[0] * hr * 0.98, hc[1] + dir[1] * hr * 0.98, dir[2] * hr * 0.98 - 0.02, 0.09 + r() * 0.04, 0.09 + r() * 0.04, 0.09 + r() * 0.04, vary(hair, 0.1, r), 0, 0);
  }
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) blob(g, I, s * (0.22 + r() * 0.04), hc[1] - 0.12 - i * 0.07, -0.05 + r() * 0.04, 0.07, 0.07, 0.07, vary(hair, 0.1, r), 0, 0);
  for (let i = 0; i < 5; i++) blob(g, I, -0.14 + i * 0.07, hc[1] + 0.2, 0.13, 0.07, 0.06, 0.06, vary(hair, 0.1, r), 0, 0);
  if (r() < 0.35) for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; flower(g, I, Math.cos(a) * 0.22, hc[1] + 0.2, Math.sin(a) * 0.22 - 0.02, 0.05, k % 2 ? C.white : C.rose[0]); }
  // face features projected onto sphere
  const S = (x, y, lift = 0.006) => { const dy = y - hc[1]; const z2 = hr * hr - x * x - dy * dy; return [x, y, Math.sqrt(Math.max(z2, 0.0001)) + lift]; };
  const shape = (pts, col, lift) => { let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= pts.length; cy /= pts.length;
    const c = S(cx, cy, lift); for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; g.tri(c, S(a[0], a[1], lift), S(b[0], b[1], lift), col, 0, [cx, cy, 0]); } };
  const band = (cx, cy, rr, th, a0, a1, n, col, lift) => { for (let i = 0; i < n; i++) { const t0 = a0 + (a1 - a0) * i / n, t1 = a0 + (a1 - a0) * (i + 1) / n;
    const p = (rad, t) => S(cx + Math.cos(t) * rad, cy + Math.sin(t) * rad, lift);
    g.quad(p(rr - th / 2, t0), p(rr + th / 2, t0), p(rr + th / 2, t1), p(rr - th / 2, t1), col, 0, [cx, cy, 0]); } };
  // happy closed eyes (∩) — thick, sticker-like
  for (const s of [-1, 1]) band(s * 0.1, 0.262, 0.052, 0.026, 0.28, Math.PI - 0.28, 9, EYE, 0.007);
  // huge pasted-on grin
  const mw = 0.142, my = 0.192, mh = 0.108;
  const mouthPts = (k, dy) => { const p = []; for (let i = 0; i <= 10; i++) { const x = -mw * k + 2 * mw * k * i / 10; p.push([x, my + dy + 0.016 * Math.pow(x / mw, 2)]); }
    for (let i = 1; i < 16; i++) { const t = Math.PI * i / 16; p.push([Math.cos(t) * mw * k, my + dy - Math.sin(t) * mh * k]); } return p; };
  shape(mouthPts(1.0, 0), hex('#7a2236'), 0.006);
  shape(mouthPts(0.86, -0.004), hex('#d6495f'), 0.008);
  { const tp = []; for (let i = 0; i <= 10; i++) { const x = -0.128 + 0.256 * i / 10; tp.push([x, my - 0.006 + 0.016 * Math.pow(x / mw, 2)]); }
    for (let i = 10; i >= 0; i--) { const x = -0.112 + 0.224 * i / 10; tp.push([x, my - 0.044 + 0.012 * Math.pow(x / mw, 2)]); } shape(tp, hex('#fffaf6'), 0.0095); }
  { const tg = []; for (let i = 0; i <= 12; i++) { const t = Math.PI + Math.PI * i / 12; tg.push([Math.cos(t) * 0.05, my - 0.085 - Math.sin(t) * 0.0 + Math.sin(t) * 0.022]); } shape(tg, hex('#ef8a9a'), 0.0092); }
  // big blush ovals
  for (const s of [-1, 1]) { const bp = []; for (let i = 0; i < 14; i++) { const t = i / 14 * Math.PI * 2; bp.push([s * 0.178 + Math.cos(t) * 0.05, 0.232 + Math.sin(t) * 0.03]); } shape(bp, hex('#f6a0b4'), 0.0075); }
  return g.upload();
}
function bodyGeo(seed, raised, seated) {
  const r = rngf(seed), g = new Geo();
  const shirt = pick(['#fbf8f2', '#f6efe6', '#f9eef0', '#eef1f6'].map(hex), r);
  const vest = pick(['#8c7f7c', '#a3958f', '#c7a9b2', '#9fa9bf', '#b9a58f', '#c9b4d0'].map(hex), r);
  const pants = pick(['#7f746f', '#9a8c84', '#c6b4a6', '#8e8aa0'].map(hex), r);
  if (!seated) { for (const s of [-1, 1]) { box(g, I, s * 0.085, 0, 0.0, 0.12, 0.42, 0.13, hex('#7a5f52')); } }
  const skirt = r() < 0.5;
  if (!seated) cyl(g, I, 0, skirt ? 0.3 : 0.38, 0, skirt ? 0.34 : 0.22, 0.2, skirt ? 0.5 : 0.42, 12, skirt ? vary(vest, 0.15, r) : pants);
  cyl(g, I, 0, 0.75, 0, 0.21, 0.18, 0.42, 12, shirt);
  box(g, I, 0, 0.78, 0.0, 0.36, 0.34, 0.38, vest);
  box(g, I, 0, 0.8, 0.19, 0.12, 0.3, 0.02, shirt);
  const sh = 1.12;
  for (const s of [-1, 1]) {
    const S0 = [s * 0.21, sh, 0];
    if (raised) { const H = [s * 0.36, 1.72, 0.1]; tube(g, I, S0, H, 0.055, 5, shirt); blob(g, I, H[0], H[1] + 0.03, H[2], 0.055, 0.06, 0.055, SKIN, 0, 0);
      if (s > 0 || r() < 0.4) { tube(g, I, [H[0], H[1] - 0.05, H[2] + 0.03], [H[0] + s * 0.03, H[1] + 0.32, H[2] + 0.06], 0.012, 4, C.leafD);
        for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; tube(g, I, [H[0] + s * 0.03, H[1] + 0.34, H[2] + 0.06], [H[0] + s * 0.03 + Math.cos(a) * 0.1, H[1] + 0.42 + Math.sin(k) * 0.02, H[2] + 0.06 + Math.sin(a) * 0.1], 0.025, 3, C.white); } } }
    else { const H = [s * 0.25, 0.68, 0.04]; tube(g, I, S0, H, 0.055, 5, shirt); blob(g, I, H[0], H[1] - 0.02, H[2], 0.055, 0.06, 0.055, SKIN, 0, 0); }
  }
  return g.upload();
}
const HEADS = [], BODIES = [], BODIES_UP = [], BODIES_SIT = [];
// villagers are paper standees now (see PAPER DOLLS)
const sb = new Geo(); shadowBlob(sb, 0, 0.03, 0, 0.42); const SBLOB = sb.upload();

const LINES = ['ようこそ!ようこそ!', '今日はいい日だね。今日も、いい日だね。', '献上祭、たのしみだねぇ', 'みんな、ずぅっと笑顔だよ', 'あなたも笑って?',
  '花をどうぞ。花をどうぞ。', 'しあわせだねぇ、しあわせだねぇ', '鐘が鳴ったら、みんなで笑うの', '迷子にならないでね。ならないよね?', '大聖堂で、みんな待ってるよ',
  'この村から出たいなんて、思わないよね?', 'わたしたち、ずっとここにいるよ', 'パン、焼きたてだよ。焼きたてだよ。', 'お祭りの日は、花冠をつけるの'];
const LINES_IN = ['しずかに。いまは祈りの時間だよ', 'うしろの席、空いてるよ', 'あなたも、ここに座って?', 'ずっと、待ってたよ', 'ふふ。ふふふ。'];
const mobs = [], mobsIn = [];
{
  const r = rngf(99);
  // 村人の見た目は、開くたびにランダム(12種類をまんべんなく)
  const NDOLL = Object.keys(VD.dolls).filter(k => /^m\d+$/.test(k)).length || 1; let bag = [];
  const nextDoll = () => { if (!bag.length) { bag = [...Array(NDOLL).keys()]; for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; } } return bag.pop(); };
  const mk = (o, list = mobs) => { const n = list.length + (list === mobsIn ? 50 : 0);
    o.tex = nextDoll(); o.face = o.a0 !== undefined ? o.a0 : 0;
    o.line = (list === mobsIn ? LINES_IN : LINES)[n % (list === mobsIn ? LINES_IN.length : LINES.length)];
    o.s = o.s || (0.95 + r() * 0.1); o.x = 0; o.z = 0; o.a = 0; o.ph = r() * 10; o.hy = 0; o.hp = -0.2; o.y0 = o.y0 || 0; list.push(o); };
  for (const [x, sp] of [[-1.3, 0.9], [1.4, 0.8], [-2.0, 1.0], [0.6, 0.85], [2.0, 0.75], [-0.6, 0.95], [1.0, 0.7], [-1.7, 0.8]]) mk({ type: 'path', pts: [[x, 45], [x, -6], [x * 2.2, -13]], sp, t: r() * 100 });
  for (const [rad, sp, ph] of [[7, 0.11, 0], [7, 0.11, 0.35], [9.2, -0.09, 2], [6, 0.13, 4], [9.6, -0.08, 3.5], [7.8, -0.12, 5.2], [8.5, 0.1, 1.2]]) mk({ type: 'circle', rad, sp, ph0: ph });
  // stationary crowd with raised lilies (plaza + terrace)
  for (let i = 0; i < 8; i++) { const x0 = -4.2 + i * 1.2 + (i % 2) * 0.3, z0 = -16.2 - (i % 2) * 1.0; mk({ type: 'idle', x0, z0, a0: Math.atan2(PZ[0] - x0, PZ[1] - z0) + Math.PI, raised: true }); }
  for (let i = 0; i < 12; i++) { const s2 = i < 6 ? -1 : 1, k = i % 6, x0 = s2 * (4.6 + (k % 3) * 1.4), z0 = -47.6 - Math.floor(k / 3) * 1.4; mk({ type: 'idle', x0, z0, a0: 0, raised: k % 2 === 0 }); }
  for (const deg of [140, 118, 222]) { const a = deg * Math.PI / 180; mk({ type: 'idle', x0: PZ[0] + Math.cos(a) * 8.7, z0: PZ[1] + Math.sin(a) * 8.7, a0: Math.atan2(Math.cos(a), Math.sin(a)) }); }
  mk({ type: 'idle', x0: -2.0, z0: 36.5, a0: Math.PI / 2 }); mk({ type: 'idle', x0: 2.0, z0: 18, a0: -Math.PI / 2 }); mk({ type: 'idle', x0: -1.5, z0: 4, a0: Math.PI / 2 });
  mk({ type: 'path', pts: [[-9, -46], [-9, -59], [8, -59], [8, -46]], sp: 0.7, t: 3 }); mk({ type: 'path', pts: [[9, -47], [9, -58]], sp: 0.6, t: 1 });
  // interior: seated in pews facing altar, and standing near altar
  for (let i = 0; i < 16; i++) { const row = 2 + Math.floor(r() * 14), s = r() < 0.5 ? -1 : 1, x = X0 + s * (2.0 + r() * 2.6), z = -5.5 - row * 1.55 + 0.12;
    if (mobsIn.some(m => Math.hypot(m.x0 - x, m.z0 - z) < 0.8)) continue; mk({ type: 'idle', x0: x, z0: z, a0: Math.PI, seated: true, y0: 0.25 }, mobsIn); }
  for (const x of [-2.6, 2.6]) mk({ type: 'idle', x0: X0 + x, z0: -39.5, a0: 0, raised: true, y0: 0.45 }, mobsIn);
}
let MDT = 0.016;
function updateMobs(list, t) {
  for (const m of list) {
    let bob = 0;
    if (m.type === 'path') {
      const P = m.pts, segL = []; let tot = 0;
      for (let i = 0; i < P.length - 1; i++) { const l = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); segL.push(l); tot += l; }
      let d = (m.t + t * m.sp) % (tot * 2); const back = d > tot; if (back) d = tot * 2 - d;
      let i = 0; while (i < segL.length - 1 && d > segL[i]) { d -= segL[i]; i++; }
      const k = clamp(d / segL[i], 0, 1), dx = P[i + 1][0] - P[i][0], dz = P[i + 1][1] - P[i][1];
      m.x = P[i][0] + dx * k; m.z = P[i][1] + dz * k; m.a = Math.atan2(dx, dz) + (back ? Math.PI : 0);
      bob = Math.abs(Math.sin(t * m.sp * 6 + m.ph)) * 0.05 * m.s;
    } else if (m.type === 'circle') {
      const ph = m.ph0 + t * m.sp; m.x = PZ[0] + Math.cos(ph) * m.rad; m.z = PZ[1] + Math.sin(ph) * m.rad;
      m.a = Math.atan2(-Math.sin(ph) * Math.sign(m.sp), Math.cos(ph) * Math.sign(m.sp)); bob = Math.abs(Math.sin(t * 4.2 + m.ph)) * 0.045 * m.s;
    } else { m.x = m.x0; m.z = m.z0; m.a = m.a0 + Math.sin(t * 0.35 + m.ph) * 0.12; bob = Math.abs(Math.sin(t * (m.raised ? 3.0 : 1.2) + m.ph)) * (m.raised ? 0.04 : 0.008); }
    m.y = (m.seated ? 0 : groundAt(m.x, m.z)) + bob * 2.2;
    // head tracking (the creepy part)
    const dx = pl.x - m.x, dz = pl.z - m.z, dist = Math.hypot(dx, dz);
    let ty = Math.sin(t * 0.5 + m.ph) * 0.25, tp = -0.22;
    if (dist < 9) { let rel = Math.atan2(dx, dz) - m.a; rel = Math.atan2(Math.sin(rel), Math.cos(rel)); const lim = m.seated ? 2.9 : 2.0;
      ty = clamp(rel, -lim, lim); tp = -clamp(Math.atan2(pl.y - (m.y + 1.45 * m.s), dist), -0.5, 0.6) - 0.12; }
    { let tgt = m.type === 'idle' ? m.a0 : m.a; if (dist < (m.seated ? 10 : 7)) tgt = Math.atan2(dx, dz);
      let df = tgt - m.face; df = Math.atan2(Math.sin(df), Math.cos(df)); m.face += df * Math.min(1, MDT * (dist < 7 ? 7 : 4)); }
    let dyaw = ty - m.hy; m.hy += dyaw * Math.min(1, MDT * (dist < 9 ? 4.5 : 1.5));
    m.hp += (tp - m.hp) * Math.min(1, MDT * 3);
  }
}

// ================= ground / walkable =================
function groundAt(x, z) {
  if (x > 300) { const lz = z; if (lz < -42.5 + 3.5 && Math.abs(x - X0) < 7) return lz < -39 ? 0.45 : (lz < -38.2 ? 0.22 : 0); return 0; }
  if (Math.abs(x) < 4.6 && z < STAIR_Z0 && z > STAIR_Z1) { const i = Math.min(11, Math.floor((STAIR_Z0 - z) / 0.5)); return (i + 1) * 0.25; }
  if (z <= STAIR_Z1) { if (Math.abs(x) < 4 && z < CFRONT + 3.0) { const i = Math.min(3, Math.floor((CFRONT + 3.0 - z) / 0.75)); return TY + (i + 1) * 0.15; } return TY; }
  return 0;
}
function walkable(x, z) {
  if (x > 300) {
    const lx = x - X0;
    if (Math.abs(lx) > IW - 0.6 || z > -0.3 || z < -IL + 0.8) return false;
    if (z < -5.0 && z > -32.2 && Math.abs(lx) > 1.45 && Math.abs(lx) < 5.25) return false;
    for (const o of inObst) if ((x - o.x) ** 2 + (z - o.z) ** 2 < (o.r + 0.25) ** 2) return false;
    return true;
  }
  const inRoad = Math.abs(x) < 3.25 && z < 46.6 && z > -12;
  const inPlaza = Math.hypot(x - PZ[0], z - PZ[1]) < PR - 0.8;
  const inStairs = Math.abs(x) < 4.4 && z <= STAIR_Z0 + 0.6 && z >= STAIR_Z1 - 0.2;
  const inTerr = z < STAIR_Z1 && z > CFRONT - 0.2 && Math.abs(x) < 21.4;
  const inPath = x < -12 && x > -46.9 && Math.abs(z - MANSION.cz) < 2.2;
  const inGrounds = x <= -46.4 && x > MANSION.courtX && z > MANSION.wallZ0 + 0.8 && z < MANSION.wallZ1 - 0.8;
  if (!(inRoad || inPlaza || inStairs || inTerr || inPath || inGrounds)) return false;
  if (inGrounds) for (const b of bedRects) if (x > b[0] - 0.25 && x < b[2] + 0.25 && z > b[1] - 0.25 && z < b[3] + 0.25) return false;
  if (inTerr && z < CFRONT + 0.5 && Math.abs(x) > 1.8) return false;
  if (inTerr && !inStairs && Math.abs(x) > 4.4 && z > STAIR_Z1 - 0.75) return false;
  for (const o of obstacles) if ((x - o.x) ** 2 + (z - o.z) ** 2 < (o.r + 0.3) ** 2) return false;
  return true;
}

// ================= shaders =================
function prog(vs, fs) {
  const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const nm = gl.getActiveUniform(p, i).name; u[nm] = gl.getUniformLocation(p, nm); }
  return { p, u };
}
const NOISE = `
float h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*vn(p);p*=2.03;a*=.5;}return s;}`;
const VS_COMMON = `
 vec4 w=uM*vec4(aP,1.); float m=floor(aC.a*255.+.5);
 if(m==4.){ w.y+=sin(uT*1.8+w.x*.7+w.z*.5)*.05; w.z+=sin(uT*1.3+w.x)*.03; }
 if(m==6.){ float k=max(w.y-1.2,0.)*.02; w.x+=sin(uT*1.0+w.z*.25)*k; w.z+=cos(uT*.8+w.x*.25)*k; }`;
const P_WORLD = prog(`#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in vec4 aC;
uniform mat4 uVP, uM; uniform float uT;
out vec3 vN; out vec4 vC; out vec3 vW;
void main(){ ${VS_COMMON}
 vW=w.xyz; vN=mat3(uM)*aN; vC=aC; gl_Position=uVP*w; }`,
`#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vN; in vec4 vC; in vec3 vW; out vec4 o;
uniform vec3 uEye, uFog, uL; uniform float uT, uFogD, uShOn, uInside; uniform mat4 uLVP; uniform sampler2DShadow uSM; uniform float uSMpx;
${NOISE}
float shade(vec3 p, vec3 n){
 if(uShOn<.5) return 1.;
 vec4 l=uLVP*vec4(p+n*.06,1.); vec3 q=l.xyz/l.w*.5+.5;
 if(q.x<0.||q.y<0.||q.x>1.||q.y>1.||q.z>1.) return 1.;
 float s=0.; for(int i=-1;i<=1;i++) for(int j=-1;j<=1;j++) s+=texture(uSM,vec3(q.xy+vec2(i,j)*uSMpx*1.2,q.z-.0015));
 return s/9.; }
vec3 stone(vec3 b, vec3 p, vec3 n){
 vec2 uv = abs(n.y)>.6 ? p.xz : vec2(p.x+p.z, p.y);
 vec2 sz=vec2(.62,.32); vec2 q=uv/sz; float row=floor(q.y); q.x+=h2(vec2(row,9.))*3.;
 float cw=.7+.6*h2(vec2(floor(q.x*.5),row)); vec2 c=floor(q); vec2 f=fract(q);
 float e=min(min(f.x,1.-f.x)*sz.x,min(f.y,1.-f.y)*sz.y);
 b*=.9+.16*h2(c+row*3.1); b=mix(b,b*vec3(1.02,.98,.96),h2(c*2.3));
 b=mix(vec3(.96,.94,.92),b,smoothstep(.01,.03,e+.01*(vn(uv*14.)-.5)));
 return b; }
void main(){
 vec3 n=normalize(vN); if(!gl_FrontFacing) n=-n;
 vec3 b=vC.rgb; float m=floor(vC.a*255.+.5);
 float dist=length(vW-uEye); float fg=1.-exp(-pow(dist*uFogD,1.5));
 if(m==3.){ float r=length(vC.rg*2.-1.); o=vec4(.55,.45,.6,.3*(1.-smoothstep(.3,1.,r))*(1.-fg)); return; }
 if(m==12.){ vec2 uv=vC.rg; vec3 tint=vC.b<.2?vec3(1.,.9,.95):(vC.b<.5?vec3(.9,.93,1.):vec3(1.,.97,.85));
   float a=(1.-uv.y)*.22*smoothstep(0.,.25,uv.x)*smoothstep(1.,.75,uv.x)*(.75+.25*sin(uT*.6+vW.z)); o=vec4(tint*a,a); return; }
 if(m==1.){ vec2 sz=vec2(.32,.24); vec2 p=vW.xz/sz; float row=floor(p.y); p.x+=mod(row,2.)*.5+h2(vec2(row,3.))*.4;
   vec2 c=floor(p), f=fract(p); float e=min(min(f.x,1.-f.x)*sz.x,min(f.y,1.-f.y)*sz.y);
   float v=h2(c+row*7.); b*=.9+.16*v; b=mix(b,b*vec3(1.04,1.,.98),step(.7,h2(c*1.3)));
   b=mix(b*.8,b,smoothstep(.006,.03,e+.008*(vn(vW.xz*10.)-.5))); b*=.95+.08*vn(vW.xz*.3); }
 if(m==15.){ vec2 d=vW.xz-vec2(${PZ[0].toFixed(1)},${PZ[1].toFixed(1)}); if(vW.y>1.) d=vW.xz-vec2(0.,-51.);
   float rr=length(d), ang=atan(d.y,d.x); float ri=floor(rr/.3); float seg=floor(ang*rr/.34+h2(vec2(ri,1.))*5.);
   float fr=fract(rr/.3), fa=fract(ang*rr/.34+h2(vec2(ri,1.))*5.); float e=min(min(fr,1.-fr)*.3,min(fa,1.-fa)*.34);
   b*=.9+.15*h2(vec2(ri,seg)); if(mod(ri,9.)<1.) b*=vec3(1.07,1.04,1.02);
   b=mix(b*.8,b,smoothstep(.006,.03,e)); }
 if(m==11.){ vec2 q=vW.xz/vec2(.7,.55); vec2 c=floor(q),f=fract(q); float e=min(min(f.x,1.-f.x)*.7,min(f.y,1.-f.y)*.55); b*=.93+.1*h2(c); b=mix(b*.86,b,smoothstep(.005,.02,e)); }
 if(m==8.) b=stone(b,vW,n);
 if(m==9.){ float v=vW.y/.2; float row=floor(v); float u=(vW.x+vW.z)/.3+mod(row,2.)*.5; float fu=fract(u), fv=fract(v);
   b*=.9+.1*fv; b*=mix(.86,1.,smoothstep(0.,.08,min(fu,1.-fu))); b*=.94+.1*h2(vec2(floor(u),row)); }
 if(m==10.){ vec2 q=vW.xz/1.2; vec2 c=floor(q),f=fract(q); float e=min(min(f.x,1.-f.x),min(f.y,1.-f.y));
   b*=mix(.9,1.,smoothstep(0.,.02,e)); b*=.96+.05*h2(c); b=mix(b,vec3(.92,.9,.94),.3*smoothstep(.55,.75,fbm(vW.xz*.8)));
   b*=.92; }
 if(m==14.){ float fld=h2(floor(vW.xz/vec2(9.,6.))); b*=.92+.14*fld; b=mix(b,vec3(.86,.9,.7),.25*step(.7,fld)); }
 if(m==2.){ b*=.9+.18*fbm(vW.xz*.2); vec2 q=vW.xz*2.; vec2 c=floor(q); float hh=h2(c);
   if(hh>.94 && length(fract(q)-.5)<.18){ b=hh>.975?vec3(1.,.82,.88):vec3(1.); } }
 if(m==5.){ b=mix(b,vec3(1.),.4*pow(vn(vW.xz*3.+vec2(uT*.7,uT*.5)),3.)); }
 if(m==13.){ vec2 uv=abs(n.z)>.5?vW.xy:vW.zy; vec2 q=uv/vec2(.32,.42); vec2 c=floor(q+vec2(0.,mod(floor(q.x),2.)*.5)); vec2 f=fract(q+vec2(0.,mod(floor(q.x),2.)*.5));
   float hh=h2(c); vec3 pal=hh<.25?vec3(.97,.75,.82):hh<.5?vec3(.72,.82,.97):hh<.7?vec3(.98,.9,.62):hh<.85?vec3(.82,.76,.95):vec3(.8,.93,.84);
   float e=min(min(f.x,1.-f.x),min(f.y,1.-f.y)); b=mix(b*.55,pal,smoothstep(.03,.1,e)*.85+.15);
   if(uInside<.5){ b=mix(b,vec3(.7,.76,.88),.45); } }
 // lighting (cel-ish, lavender shadows)
 float d=dot(n,uL); float sh=shade(vW,n);
 float lit=smoothstep(.05,.2,d)*sh;
 vec3 shadowTint=vec3(.84,.82,.86), lightTint=vec3(1.08,1.06,1.02);
 lit=step(.5,lit*1.0+.0)*.85+lit*.15;
 vec3 hemi=mix(vec3(.93,.9,.9),vec3(1.,1.,1.03),n.y*.5+.5);
 vec3 col=b*hemi*mix(shadowTint,lightTint,lit);
 if(uInside>.5){ col=b*hemi*mix(vec3(.8,.78,.85),vec3(1.0,.97,.92),smoothstep(-.4,.7,d)); col*=mix(.82,1.,smoothstep(0.,6.,vW.y)); }
 if(m==6.) col=b*mix(vec3(.84,.86,.9),vec3(1.06,1.03,.94),lit*.85+.15);
 if(m==4.) col=b*mix(vec3(.93,.92,.96),vec3(1.04,1.03,1.),lit);
 if(m==0.||m==8.) col*=mix(.88,1.,smoothstep(0.,.9,vW.y-((vW.z<-43.&&uInside<.5)?3.:0.)));
 if(m==7.||m==13.) col=b*1.03;
 if(m!=7.&&m!=13.&&m!=12.){ float fib=vn(vW.xz*5.+vW.y*3.)*.5+vn(vec2(vW.x+vW.z,vW.y)*7.)*.5; col*=.965+.06*fib; }
 col=mix(col,uFog,fg);
 o=vec4(col,1.);
}`);
const P_DEPTH = prog(`#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in vec4 aC;
uniform mat4 uVP, uM; uniform float uT;
void main(){ ${VS_COMMON} gl_Position=uVP*w; }`, `#version 300 es
precision mediump float; out vec4 o; void main(){ o=vec4(1.); }`);
const P_SKY = prog(`#version 300 es
void main(){ vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2); gl_Position=vec4(p*2.-1.,.9999,1.); }`,
`#version 300 es
precision highp float; out vec4 o;
uniform vec2 uRes; uniform float uPitch,uYaw,uFov,uAsp,uT; uniform vec3 uFog;
${NOISE}
void main(){ vec2 uv=gl_FragCoord.xy/uRes; float el=uPitch+(uv.y-.5)*uFov; float az=uYaw+(uv.x-.5)*uFov*uAsp;
 vec3 top=vec3(.6,.75,.92); vec3 col=mix(uFog,top,smoothstep(-.02,.8,el));
 vec2 cp=vec2(az*2.+uT*.003,el*5.5);
 float c=fbm(cp)+.5*fbm(cp*2.7+3.); float w=smoothstep(.02,.25,el)*(1.-smoothstep(.85,1.3,el));
 float cl=step(.78,c)*w; float sh=step(.78,fbm(cp+vec2(-.02,.06))+.5*fbm((cp+vec2(-.02,.06))*2.7+3.))*w*(1.-cl);
 col=mix(col,col*.9,sh*.6);
 col=mix(col,vec3(1.,.99,.97),cl);
 o=vec4(col,1.); }`);
const P_PET = prog(`#version 300 es
layout(location=0) in vec4 aS;
uniform mat4 uVP; uniform vec3 uEye; uniform float uT, uPx, uFogD, uInside;
out float vR; out float vF; out float vK;
void main(){ vec3 box=vec3(44.,14.,44.);
 vec3 p=aS.xyz*box+vec3(uT*.6+sin(uT*.35+aS.w*6.)*1.6, -uT*(.45+aS.w*.3), uT*.25+cos(uT*.5+aS.w*9.)*1.2);
 vec3 rel=mod(p-uEye+box*.5,box)-box*.5; vec3 w=vec3(uEye.x+rel.x, mod(p.y,box.y)+(uEye.y>2.?uEye.y-1.6:0.), uEye.z+rel.z);
 if(uInside>.5){ w=vec3(uEye.x+rel.x*.4, mod(p.y*.3,12.), uEye.z+rel.z*.6); }
 gl_Position=uVP*vec4(w,1.); float d=length(w-uEye); gl_PointSize=clamp(uPx*(uInside>.5?.03:.1)/max(d,.1),1.,44.);
 vR=uT*(1.3+aS.w*2.)+aS.w*40.; vF=1.-exp(-pow(d*uFogD*1.4,1.6)); vK=aS.w; }`,
`#version 300 es
precision highp float; in float vR; in float vF; in float vK; out vec4 o; uniform float uInside;
void main(){ vec2 q=gl_PointCoord*2.-1.; if(uInside>.5){ float e=dot(q,q); if(e>1.) discard; o=vec4(vec3(1.,.97,.88),(1.-e)*.5); return; }
 float c=cos(vR),s=sin(vR); q=vec2(c*q.x-s*q.y,s*q.x+c*q.y);
 float e=q.x*q.x+q.y*q.y*2.6; if(e>1.) discard;
 vec3 col=mix(vec3(.98,.78,.84),vec3(1.,.98,.97),step(.45,vK));
 o=vec4(col,(1.-smoothstep(.6,1.,e))*.9*(1.-vF)); }`);
const P_POST = prog(`#version 300 es
void main(){ vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2); gl_Position=vec4(p*2.-1.,0.,1.); }`,
`#version 300 es
precision highp float; out vec4 o;
uniform sampler2D uCol, uDep; uniform vec2 uRes; uniform float uNear, uFar, uT, uInside; uniform vec3 uTint;
${NOISE}
float lin(float d){ float z=d*2.-1.; return 2.*uNear*uFar/(uFar+uNear-z*(uFar-uNear)); }
void main(){
 vec2 uv=gl_FragCoord.xy/uRes, px=1./uRes; float sc=uRes.y/900.;
 vec2 nq=gl_FragCoord.xy/(uRes.y)*7.;
 vec2 wob=(vec2(fbm(nq),fbm(nq+11.3))-.5)*px*0.8*sc;
 vec3 c=texture(uCol,uv+wob).rgb;
 vec3 bl=vec3(0.); float r=2.6*sc;
 bl+=texture(uCol,uv+px*vec2(r,0.)).rgb; bl+=texture(uCol,uv-px*vec2(r,0.)).rgb; bl+=texture(uCol,uv+px*vec2(0.,r)).rgb; bl+=texture(uCol,uv-px*vec2(0.,r)).rgb;
 bl+=texture(uCol,uv+px*vec2(r,r)*.7).rgb; bl+=texture(uCol,uv-px*vec2(r,r)*.7).rgb; bl+=texture(uCol,uv+px*vec2(r,-r)*.7).rgb; bl+=texture(uCol,uv-px*vec2(r,-r)*.7).rgb;
 bl/=8.;
 c+= (c-bl)*.12;
 c+= max(bl-vec3(.82),0.)*(uInside>.5?.5:.7);   // soft glow
 // outlines from depth
 float d0=lin(texture(uDep,uv).r);
 float s1=sc*1.1;
 float dl=lin(texture(uDep,uv-vec2(px.x*s1,0.)).r), dr=lin(texture(uDep,uv+vec2(px.x*s1,0.)).r), du=lin(texture(uDep,uv+vec2(0.,px.y*s1)).r), dd=lin(texture(uDep,uv-vec2(0.,px.y*s1)).r);
 float e=max(max(abs(dl-d0),abs(dr-d0)),max(abs(du-d0),abs(dd-d0)))/max(d0,.5);
 float lap=abs(dl+dr+du+dd-4.*d0)/max(d0,.5);
 float line=max(smoothstep(.03,.07,e),smoothstep(.02,.05,lap)*.6);
 line*=1.-smoothstep(40.,140.,d0);
 line*=.75+.25*vn(gl_FragCoord.xy/(9.*sc));       // broken ink
 c=mix(c,vec3(.42,.32,.34),line*.62);
 // paper texture & granulation
 float paper=fbm(gl_FragCoord.xy/(2.2*sc))*.55+fbm(gl_FragCoord.xy/(38.*sc))*.45;
 c*=.93+.1*paper;
 float gran=vn(gl_FragCoord.xy/(1.6*sc)); float lum=dot(c,vec3(.3,.59,.11));
 c-= (1.-lum)*.06*(gran-.5);
 // pastel lift & warm vignette
 c=1.-(1.-c)*.97; { float l=dot(c,vec3(.3,.59,.11)); c=mix(vec3(l),c,1.18); }
 vec2 vq=uv-.5; c*=mix(vec3(1.),vec3(.93,.9,.92),smoothstep(.35,.85,length(vq*vec2(uRes.x/uRes.y,1.))*.9));
 o=vec4(c*uTint,1.);
}`);


// ---- hotspot props: mushroom patch under the big tree
function mushroom(g, x, z, s, y = 0) {
  cyl(g, I, x, y, z, 0.07 * s, 0.06 * s, 0.24 * s, 8, hex('#fbf6ee'));
  blob(g, I, x, y + 0.26 * s, z, 0.21 * s, 0.12 * s, 0.21 * s, hex('#f2a3b2'), 0, 1);
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + s; flower(g, I, x + Math.cos(a) * 0.12 * s, y + 0.33 * s, z + Math.sin(a) * 0.12 * s, 0.03 * s, C.white); }
  flower(g, I, x, y + 0.385 * s, z, 0.035 * s, C.white);
}
{ const r = rngf(314); const cx = 8.3, cz = -16.4;
  for (let i = 0; i < 16; i++) { const a = r() * Math.PI * 2, d = 0.2 + r() * 1.0; mushroom(world, cx + Math.cos(a) * d, cz + Math.sin(a) * d, i < 3 ? 1.5 : 0.55 + r() * 0.6); }
  obstacles.push({ x: cx, z: cz, r: 0.6 }); }

// ================= PAPER DOLLS (villager standees) =================
const DOLLS = VD.dolls;
const P_SPR = prog(`#version 300 es
layout(location=0) in vec2 aQ;
uniform mat4 uVP, uM; uniform vec2 uSize;
out vec2 vUV; out vec3 vW;
void main(){ vec4 w=uM*vec4(aQ.x*uSize.x,aQ.y*uSize.y,0.,1.); vW=w.xyz; vUV=vec2(aQ.x+.5,1.-aQ.y); gl_Position=uVP*w; }`,
`#version 300 es
precision highp float; in vec2 vUV; in vec3 vW; out vec4 o;
uniform sampler2D uFront, uBack; uniform vec3 uEye, uFog; uniform float uFogD, uInside;
void main(){ vec4 c = gl_FrontFacing ? texture(uFront, vUV) : texture(uBack, vec2(1.-vUV.x, vUV.y));
 if(c.a<.5) discard;
 vec3 col=c.rgb*(uInside>.5?.96:1.0);
 float dist=length(vW-uEye); float fg=1.-exp(-pow(dist*uFogD,1.5)); o=vec4(mix(col,uFog,fg),1.); }`);
const DQ = (() => { const vao = gl.createVertexArray(); gl.bindVertexArray(vao); const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-.5, 0, .5, 0, .5, 1, -.5, 0, .5, 1, -.5, 1]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null); return vao; })();
const DTEX = {}; let dollsReady = 0;
for (const k of Object.keys(DOLLS)) { const t = gl.createTexture(); DTEX[k] = t; const im = new Image(); im.onload = () => { gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
  gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); dollsReady++; }; im.src = DOLLS[k]; }
const DOLL_H = 1.74, DOLL_W = DOLL_H * 400 / 600; // 村人の紙人形(400x600、足もとをそろえてある)
const DOLL_N = Object.keys(DOLLS).filter(k => /^m\d+$/.test(k)).length;
function drawDolls(list, VP, eye, FOG, FOGD) {
  if (dollsReady < Object.keys(DOLLS).length) return;
  gl.useProgram(P_SPR.p); const u = P_SPR.u; gl.uniformMatrix4fv(u.uVP, false, VP); gl.uniform3fv(u.uEye, eye); gl.uniform3fv(u.uFog, FOG); gl.uniform1f(u.uFogD, FOGD); gl.uniform1f(u.uInside, inside ? 1 : 0);
  gl.uniform2f(u.uSize, DOLL_W, DOLL_H); gl.uniform1i(u.uFront, 0); gl.uniform1i(u.uBack, 1);
  gl.bindVertexArray(DQ);
  for (const m of list) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, DTEX['b' + m.tex]); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, DTEX['m' + m.tex]);
    gl.uniformMatrix4fv(u.uM, false, modelM(m.x, m.y + 0.02, m.z, m.face, m.s)); gl.drawArrays(gl.TRIANGLES, 0, 6); }
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, smTex);
}
const WORLD = world.upload(), BLOBS = blobs.upload(), INNER = inner.upload(), SHAFTS = shafts.upload();
const NPET = TOUCH ? 420 : 700;
const PET = (() => { const a = new Float32Array(NPET * 4), r = rngf(5); for (let i = 0; i < a.length; i++) a[i] = r();
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao); const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null); return vao; })();
const EMPTY = gl.createVertexArray();

// ================= framebuffers =================
const SMS = TOUCH ? 1536 : 2048;
const smTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, smTex);
gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SMS, SMS);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
const smFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, smFB); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, smTex, 0);
gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
let scFB = null, scCol = null, scDep = null, W = 0, H = 0, DPR = 1;
function makeScene() {
  if (scFB) { gl.deleteFramebuffer(scFB); gl.deleteTexture(scCol); gl.deleteTexture(scDep); }
  scCol = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, scCol); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, W, H);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  scDep = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, scDep); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, W, H);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  scFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, scFB);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, scCol, 0); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, scDep, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}
function resize() { DPR = Math.min(devicePixelRatio || 1, TOUCH ? 1.5 : 1.75); W = Math.max(2, Math.floor(innerWidth * DPR)); H = Math.max(2, Math.floor(innerHeight * DPR)); cv.width = W; cv.height = H; makeScene(); }
addEventListener('resize', resize); resize();

// ================= math =================
function persp(f, a, n, fa) { const t = 1 / Math.tan(f / 2); return new Float32Array([t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0]); }
function ortho(l, r, b, t, n, f) { return new Float32Array([2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1]); }
function lookDir(e, f, up = [0, 1, 0]) {
  const fl = Math.hypot(...f); const z = [-f[0] / fl, -f[1] / fl, -f[2] / fl];
  let x = [up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]]; const xl = Math.hypot(...x); x = x.map(v => v / xl);
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1]);
}
function mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
const ID = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
function modelM(x, y, z, a, s) { const c = Math.cos(a) * s, n = Math.sin(a) * s; return new Float32Array([c, 0, -n, 0, 0, s, 0, 0, n, 0, c, 0, x, y, z, 1]); }
function headM(body, ny, hy, hp) { const cy = Math.cos(hy), sy = Math.sin(hy), cp = Math.cos(hp), sp = Math.sin(hp);
  const Ry = new Float32Array([cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, ny, 0, 1]); const Rx = new Float32Array([1, 0, 0, 0, 0, cp, sp, 0, 0, -sp, cp, 0, 0, 0, 0, 1]);
  return mul(body, mul(Ry, Rx)); }

// ================= player & input =================
const pl = { x: 0, z: 44, y: 1.6, yaw: 0, pitch: 0.06, bob: 0, step: 0 };
let inside = false, fading = 0, fadeAction = null;
const keys = {}; let joy = { x: 0, y: 0 };
addEventListener('keydown', e => { keys[e.code] = true; });
addEventListener('keyup', e => { keys[e.code] = false; });
let lookId = null, lx = 0, ly = 0;
cv.addEventListener('pointerdown', e => { if (lookId !== null) return; lookId = e.pointerId; lx = e.clientX; ly = e.clientY; try { cv.setPointerCapture(e.pointerId); } catch (_) {} });
cv.addEventListener('pointermove', e => { if (e.pointerId !== lookId) return; const k = e.pointerType === 'touch' ? 0.0062 : 0.0048;
  pl.yaw += (e.clientX - lx) * k; pl.pitch = clamp(pl.pitch - (e.clientY - ly) * k, -1.1, 1.2); lx = e.clientX; ly = e.clientY; });
const endLook = e => { if (e.pointerId === lookId) lookId = null; };
cv.addEventListener('pointerup', endLook); cv.addEventListener('pointercancel', endLook);
const joyEl = document.getElementById('joy'), knob = document.getElementById('knob'); let joyId = null;
const joyMove = e => { const r = joyEl.getBoundingClientRect(); let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const l = Math.hypot(dx, dy), mx = 46; if (l > mx) { dx *= mx / l; dy *= mx / l; } joy = { x: dx / mx, y: dy / mx }; knob.style.transform = `translate(${dx}px,${dy}px)`; };
joyEl.addEventListener('pointerdown', e => { joyId = e.pointerId; try { joyEl.setPointerCapture(e.pointerId); } catch (_) {} joyMove(e); e.stopPropagation(); });
joyEl.addEventListener('pointermove', e => { if (e.pointerId === joyId) joyMove(e); });
const joyEnd = e => { if (e.pointerId !== joyId) return; joyId = null; joy = { x: 0, y: 0 }; knob.style.transform = ''; };
joyEl.addEventListener('pointerup', joyEnd); joyEl.addEventListener('pointercancel', joyEnd);

// ================= zones / speech =================
const ZONES = {
  road: ['石畳の道', '花とパンの匂いがする通り'], plaza: ['噴水の広場', '献上祭の準備がすすむ'], hall: ['共同食堂', '村のみんなが集まるごはんの場所'],
  terrace: ['大聖堂のテラス', '村をみおろす白い階段の上'], path: ['お屋敷への小道', '広場から、村のはずれへ'], mansion: ['メルのお屋敷', '聖女候補さまのお住まい'], hut: ['ニナの小屋', 'お屋敷の庭の、すみっこ'], inside: ['大聖堂', 'ひかりの差しこむ祈りの場所'] };
function zoneOf(x, z) {
  if (x > 300) return 'inside';
  if (x < -46.4) return Math.hypot(x - MANSION.hut[0], z - MANSION.hut[1]) < 7 ? 'hut' : 'mansion';
  if (x < -15 && Math.abs(z - MANSION.cz) < 3) return 'path';
  if (z < STAIR_Z0 - 1) return 'terrace';
  if (Math.hypot(x - PZ[0], z - PZ[1]) < PR) return x > 8 ? 'hall' : 'plaza';
  return 'road';
}
const zoneEl = document.getElementById('zone'); let curZone = null, zoneTimer = 0;
function showZone(k) { zoneEl.querySelector('.t').textContent = ZONES[k][0]; zoneEl.querySelector('.s').textContent = ZONES[k][1]; zoneEl.style.opacity = 1; zoneTimer = 3.2; }
const bubble = document.getElementById('bubble'); let talkMob = null;

// ================= audio =================
let AC = null, master = null, gMur = null, gMus = null, gOrg = null, muted = false, nextNote = 0, noteIdx = 0, noiseBuf = null;
function startAudio() {
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = 0.9; master.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const loopNoise = () => { const s = AC.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(); return s; };
    gMur = AC.createGain(); gMur.gain.value = 0.0; gMur.connect(master);
    for (const [f, q] of [[480, 1.2], [900, 1.5], [1500, 2]]) { const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const g = AC.createGain(); g.gain.value = 0.5; loopNoise().connect(bp); bp.connect(g); g.connect(gMur);
      setInterval(() => { if (AC) g.gain.setTargetAtTime(0.15 + Math.random() * 0.8, AC.currentTime, 0.08); }, 140 + Math.random() * 120); }
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; const gw = AC.createGain(); gw.gain.value = 0.06; loopNoise().connect(lp); lp.connect(gw); gw.connect(master);
    gMus = AC.createGain(); gMus.gain.value = 0; gMus.connect(master);
    // organ pad (inside)
    gOrg = AC.createGain(); gOrg.gain.value = 0; const olp = AC.createBiquadFilter(); olp.type = 'lowpass'; olp.frequency.value = 1400; olp.connect(gOrg); gOrg.connect(master);
    for (const [m, v] of [[41, .5], [53, .4], [57, .3], [60, .3], [65, .25], [69, .15]]) { const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mhz(m) * (1 + (Math.random() - .5) * 0.004); const g = AC.createGain(); g.gain.value = v * 0.12; o.connect(g); g.connect(olp); o.start(); }
    nextNote = AC.currentTime + 0.3;
    birds(); setTimeout(bell, 1800); setInterval(bell, 22000);
    setInterval(musicTick, 60);
  } catch (e) { AC = null; }
}
function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
function birds() {
  if (!AC) return;
  if (!inside) { const t = AC.currentTime + 0.05, n = 2 + Math.floor(Math.random() * 4), base = 2600 + Math.random() * 1400, pan = AC.createStereoPanner(); pan.pan.value = Math.random() * 1.6 - 0.8; pan.connect(master);
    for (let i = 0; i < n; i++) { const o = AC.createOscillator(), g = AC.createGain(); o.type = 'sine'; const t0 = t + i * (0.09 + Math.random() * 0.05);
      o.frequency.setValueAtTime(base, t0); o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.4), t0 + 0.06);
      env(g, t0, 0.008, 0.04, 0.07); o.connect(g); g.connect(pan); o.start(t0); o.stop(t0 + 0.12); } }
  setTimeout(birds, 1500 + Math.random() * 4500);
}
function bell() {
  if (!AC) return;
  const d = inside ? 30 : Math.hypot(pl.x, pl.z + 75), vol = 0.24 * clamp(1.15 - d / 130, 0.25, 1) * (inside ? 0.6 : 1), t = AC.currentTime + 0.05;
  for (let k = 0; k < 3; k++) { const t0 = t + k * 1.6, f = [392, 330, 294][k];
    for (const [m, a, dc] of [[1, 1, 4.5], [2, 0.5, 3], [2.4, 0.35, 2.5], [3, 0.25, 2], [4.2, 0.15, 1.4], [0.5, 0.4, 5]]) {
      const o = AC.createOscillator(), g = AC.createGain(); o.frequency.value = f * m; env(g, t0, 0.005, vol * a * 0.35, dc); o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dc + 0.1); } }
}
const CH = [[53, [65, 69, 72, 77]], [48, [64, 67, 72, 76]], [50, [62, 65, 69, 74]], [46, [62, 65, 70, 74]]];
const PAT = [0, 2, 1, 3, 2, 1, 3, 2], MEL = { 0: 81, 3: 79, 4: 77, 8: 79, 10: 76, 13: 72, 16: 77, 18: 76, 19: 74, 22: 72, 24: 74, 28: 77, 30: 79 };
function mhz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function pluck(t, m, vol, type = 'triangle', dec = 0.5) { const o = AC.createOscillator(), g = AC.createGain(), f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
  o.type = type; o.frequency.value = mhz(m) * (1 + (Math.random() - 0.5) * 0.012); env(g, t, 0.004, vol, dec); o.connect(f); f.connect(g); g.connect(gMus); o.start(t); o.stop(t + dec + 0.05); }
function musicTick() {
  if (!AC) return; const st = 60 / 100 / 2;
  while (nextNote < AC.currentTime + 0.25) {
    const bar = Math.floor(noteIdx / 8) % 4, k = noteIdx % 8, [root, ns] = CH[bar];
    pluck(nextNote, ns[PAT[k]] + 12, 0.045, 'sine', 0.7);
    if (k === 0) pluck(nextNote, root - 12, 0.08, 'sine', 1.2);
    const mi = noteIdx % 32; if (MEL[mi]) pluck(nextNote, MEL[mi] + 12, 0.04, 'sine', 1.1);
    nextNote += st; noteIdx++;
  }
}
function footstep() { if (!AC || muted) return; const t = AC.currentTime, s = AC.createBufferSource(); s.buffer = noiseBuf; const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = (inside ? 900 : 500) + Math.random() * 300; f.Q.value = 0.9;
  const g = AC.createGain(); env(g, t, 0.004, inside ? 0.16 : 0.2, inside ? 0.18 : 0.07); s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 1.5, 0.2); }
const sndBtn = document.getElementById('snd');
sndBtn.onclick = () => { muted = !muted; sndBtn.textContent = muted ? '×' : '♪'; if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, AC.currentTime, 0.05); };

// ================= start =================
let running = false;
document.getElementById('go').onclick = () => {
  startAudio(); running = true;
  const s = document.getElementById('start'); s.style.opacity = 0; setTimeout(() => s.style.display = 'none', 900);
  sndBtn.style.display = 'block'; albumBtn.style.display = 'block'; mapBtn.style.display = 'block';
  if (TOUCH) joyEl.style.display = 'block';
  const h = document.getElementById('hint'); h.style.display = 'block';
  h.textContent = TOUCH ? '左下のスティックで歩く・ドラッグで見回す' : 'WASD / 矢印キーで歩く・ドラッグで見回す';
  setTimeout(() => h.style.opacity = 0, 6000);
};
const fadeEl = document.getElementById('fade');
const doorBtn = document.getElementById('doorBtn');
doorBtn.addEventListener('pointerdown', e => e.stopPropagation());
doorBtn.addEventListener('click', e => { e.stopPropagation(); doorBtn.style.display = 'none'; if (inside) goOutside(); else goInside(); });
function goInside() { fadeEl.style.opacity = 1; fading = 1; setTimeout(() => { inside = true; pl.x = X0; pl.z = -1.6; pl.yaw = 0; pl.pitch = 0.08; pl.y = 1.6; fadeEl.style.opacity = 0; setTimeout(() => fading = 0, 600); }, 600); }
function goOutside() { fadeEl.style.opacity = 1; fading = 1; setTimeout(() => { inside = false; pl.x = 0; pl.z = CFRONT + 2.6; pl.yaw = Math.PI; pl.pitch = -0.05; pl.y = groundAt(0, CFRONT + 2.6) + 1.6; fadeEl.style.opacity = 0; setTimeout(() => fading = 0, 600); }, 600); }


// ================= conversation scenes (VN) =================
const VNIMG = VD.scenes.images;
const SCRIPTS = VD.scenes.scripts;
const HOTSPOTS = VD.scenes.hotspots;
const CHARS = VD.scenes.chars;
for (const [al, base] of Object.entries(VD.scenes.aliases || {})) CHARS[al] = { ...CHARS[base], alias: true, color: '#e8a0b4' };
const BGS = {}; for (const [k, v] of Object.entries(VD.scenes.bgs)) BGS[k] = VNIMG[v];
const CGS = {}; for (const [k, v] of Object.entries(VD.scenes.cgs)) CGS[k] = VNIMG[v];

function parseScript(src) {
  const out = [];
  for (let raw of src.split('\n')) {
    const line = raw.trim(); if (!line || line.startsWith('//')) continue;
    if (line.startsWith('#title')) { out.push({ cmd: 'title', text: line.slice(6).trim() }); continue; }
    if (line.startsWith('@choice')) { const opts = line.slice(7).split('|').map(x => x.trim()).filter(Boolean).map(o => { const [t, l] = o.split('=>'); return { text: t.trim(), to: (l || '').trim() }; }); out.push({ cmd: 'choice', opts }); continue; }
    if (line[0] === '@') { const [cmd, ...args] = line.slice(1).split(/\s+/); out.push({ cmd, args }); continue; }
    const m = line.match(/^([^\[:：]*?)\s*(?:\[([^\]]+)\])?\s*[:：]\s*(.*)$/);
    if (m) out.push({ cmd: 'say', name: m[1].trim(), face: m[2] || null, text: m[3] }); else out.push({ cmd: 'say', name: '', face: null, text: line });
  }
  return out;
}
const vnEl = document.getElementById('vn'), vnBg = vnEl.querySelector('.bg'), vnBox = vnEl.querySelector('.box'), vnName = vnEl.querySelector('.name'), vnText = vnEl.querySelector('.text'), vnNext = vnEl.querySelector('.next');
const vnCards = { L: vnEl.querySelector('.card.L'), R: vnEl.querySelector('.card.R') }, vnCg = vnEl.querySelector('.cg'), vnFx = vnEl.querySelector('.fx'), vnTitle = vnEl.querySelector('.title');
const vnAutoBtn = vnEl.querySelector('.auto'), vnCloseBtn = vnEl.querySelector('.close');
const markerEl = document.getElementById('marker'), talkBtn = document.getElementById('talk');
let vnCurId = null, vnEndFired = false;
let vnOpen = false, vnSteps = [], vnIdx = 0, vnTyping = null, vnFull = '', vnAuto = false, vnAutoT = null, vnEnded = false, vnBusy = false;

function vnAudio() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(AC.destination); } catch (e) { } } return AC; }
function vnTone(type, f0, f1, dur, vol, delay = 0) { if (!vnAudio()) return; const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05); }
const SE = {
  pop: () => vnTone('sine', 620, 980, 0.09, 0.08),
  mogu: () => { for (let i = 0; i < 3; i++) { vnTone('triangle', 180, 120, 0.08, 0.16, i * 0.16); } },
  paku: () => { vnTone('sine', 300, 900, 0.07, 0.18); vnTone('square', 900, 500, 0.04, 0.04, 0.05); },
  kira: () => { [1568, 2093, 2637, 3136].forEach((f, i) => vnTone('sine', f, f * 1.01, 0.5, 0.06, i * 0.06)); },
  powan: () => { if (!vnAudio()) return; const t = AC.currentTime, o = AC.createOscillator(), l = AC.createOscillator(), lg = AC.createGain(), g = AC.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(380, t + 1.4); l.frequency.value = 7; lg.gain.value = 40; l.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6); o.connect(g); g.connect(master); o.start(t); l.start(t); o.stop(t + 1.7); l.stop(t + 1.7);
    [1047, 1319, 1568, 2093].forEach((f, i) => vnTone('sine', f, f, 0.6, 0.04, 0.3 + i * 0.09)); },
  suu: () => { if (!vnAudio()) return; const t = AC.currentTime, b = AC.createBuffer(1, AC.sampleRate * 1.2, AC.sampleRate), dd = b.getChannelData(0); for (let i = 0; i < dd.length; i++) dd[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / dd.length);
    const src = AC.createBufferSource(); src.buffer = b; const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; const g = AC.createGain(); g.gain.value = 0.18; src.connect(f); f.connect(g); g.connect(master); src.start(t); },
  end: () => { [784, 988, 1175, 1568].forEach((f, i) => vnTone('triangle', f, f, 0.5, 0.06, i * 0.1)); },
};
function sparkles(n) { for (let i = 0; i < n; i++) { const s = document.createElement('div'); s.className = 'sp'; s.textContent = i % 3 ? '✦' : '♡'; s.style.left = (5 + Math.random() * 90) + '%'; s.style.top = (5 + Math.random() * 60) + '%';
  s.style.animationDelay = (Math.random() * 0.8) + 's'; s.style.color = i % 3 ? '#f6c94e' : '#f08aa8'; vnFx.appendChild(s); setTimeout(() => s.remove(), 2600); } }
let vnDuo = false; const duoCache = {};
// 横並びの立ち絵は、会話が始まったら全部先に読み込んでおく(表示待ちで消えないように)
function preloadDuo() { for (const n of ['ニナ', 'メル']) for (const k of Object.values((CHARS[n] || {}).duo || {})) { const src = VNIMG[k]; if (src && !duoCache[src]) { const im = new Image(); im.decoding = 'async'; im.src = src; duoCache[src] = im; } } }
function setFace(name, face) {
  const ch = CHARS[name]; if (!ch) return; const card = vnCards[ch.side]; const fm = vnDuo && ch.duo ? ch.duo : ch.face; let key = fm[face] || fm[card.dataset.face] || fm.normal;
  if (!vnDuo) try { const ov = (window.VILLAGE_HOOK || {}).face?.(name, face || card.dataset.face || 'normal'); if (ov && VNIMG[ov]) key = ov; } catch (e) { }
  const img = card.querySelector('img'); card.dataset.face = Object.keys(fm).find(k => fm[k] === key) || 'normal';
  if (img.dataset.k !== key) { if (vnDuo) { clearTimeout(img._t); img.style.opacity = 1; img.dataset.k = key; const src = VNIMG[key]; const swap = () => { if (img.dataset.k !== key) return; img.src = src; card.classList.remove('swap'); void card.offsetWidth; card.classList.add('swap'); }; const pre = duoCache[src] || (duoCache[src] = new Image()); if (!pre.src) pre.src = src; if (pre.complete && pre.naturalWidth) swap(); else { pre.addEventListener('load', swap, { once: true }); pre.addEventListener('error', swap, { once: true }); if (!img.getAttribute('src') || !img.src.includes('/vn2/')) swap(); } } else { img.style.opacity = 0; clearTimeout(img._t); img._t = setTimeout(() => { img.src = VNIMG[key]; img.dataset.k = key; img.style.opacity = 1; }, 120); } }
  card.classList.add('show');
}
function vnStart(id) {
  if (vnOpen || !SCRIPTS[id]) return; if (HOTSPOTS.some(h => h.id === id)) markSeen(id); vnCurId = id; vnDuo = !HOTSPOTS.some(h => h.id === id) && !!(CHARS['ニナ'] || {}).duo; vnEl.classList.toggle('duo', vnDuo); vnEl.classList.remove('solo'); if (vnDuo) preloadDuo(); vnEndFired = false; vnOpen = true; vnEnded = false; vnSteps = parseScript(SCRIPTS[id]); vnIdx = 0; vnAudio(); const oc = vnBox.querySelector('.choices'); if (oc) oc.remove();
  if (AC && AC.state === 'suspended') AC.resume();
  for (const k of ['L', 'R']) { vnCards[k].className = 'card ' + k; vnCards[k].querySelector('img').dataset.k = ''; }
  vnCg.classList.remove('show'); vnName.style.display = 'none'; vnText.textContent = ''; vnNext.style.opacity = 0; vnCloseBtn.textContent = '✕';
  vnEl.style.display = 'block'; requestAnimationFrame(() => vnEl.classList.add('on'));
  talkBtn.style.display = 'none'; markerEl.style.display = 'none'; bubble.style.opacity = 0; joy = { x: 0, y: 0 };
  setTimeout(vnStep, 350);
}
function vnClose() { vnOpen = false; clearInterval(vnTyping); clearTimeout(vnAutoT); vnEl.classList.remove('on'); setTimeout(() => { vnEl.style.display = 'none'; if (vnFromAlbum) { vnFromAlbum = false; openAlbum(); } else if (pendingToast) { toast('📖 会話アルバムに追加されました'); } pendingToast = false; }, 450); }
function vnStep() {
  clearTimeout(vnAutoT);
  while (vnIdx < vnSteps.length) {
    const s = vnSteps[vnIdx++];
    if (s.cmd === 'title') { vnTitle.querySelector('b').textContent = s.text; vnTitle.classList.add('show'); vnBox.style.opacity = 0; vnBusy = true;
      setTimeout(() => { vnTitle.classList.remove('show'); vnBox.style.opacity = 1; vnBusy = false; vnStep(); }, 1700); return; }
    if (s.cmd === 'bg') { vnBg.style.backgroundImage = `url(${BGS[s.args[0]] || ''})`; continue; }
    if (s.cmd === 'show') { setFace(s.args[0], s.args[1] || 'normal'); continue; }
    if (s.cmd === 'hide') { const ch = CHARS[s.args[0]]; if (ch) vnCards[ch.side].classList.remove('show'); continue; }
    if (s.cmd === 'cg') { if (s.args[0] === 'off') vnCg.classList.remove('show'); else { vnCg.querySelector('img').src = CGS[s.args[0]]; vnCg.classList.add('show'); sparkles(10); } continue; }
    if (s.cmd === 'focus') { vnEl.classList.toggle('solo', s.args[0] !== 'off'); continue; }
    if (s.cmd === 'se') { (SE[s.args[0]] || SE.pop)(); continue; }
    if (s.cmd === 'fx') { const w = vnFx.querySelector('.word'), gw = vnFx.querySelector('.glow');
      if (s.args[0] === 'powan') { SE.powan(); w.textContent = 'ぽわわ〜ん'; w.classList.remove('go'); void w.offsetWidth; w.classList.add('go'); gw.style.opacity = 1; setTimeout(() => gw.style.opacity = 0, 2600); sparkles(18);
        vnBusy = true; setTimeout(() => { vnBusy = false; vnStep(); }, 1500); return; }
      if (s.args[0] === 'shake') { vnEl.classList.remove('shake'); void vnEl.offsetWidth; vnEl.classList.add('shake'); }
      if (s.args[0] === 'sparkle') sparkles(14);
      continue; }
    if (s.cmd === 'label') continue;
    if (s.cmd === 'goto') { vnJump(s.args[0]); continue; }
    if (s.cmd === 'if') { let ok = false; try { ok = !!(window.VILLAGE_HOOK || {}).cond?.(s.args[0]); } catch (e) { } if (ok) vnJump(s.args[1]); continue; }
    if (s.cmd === 'choice') { vnChoices(s.opts); return; }
    if (['stat', 'flag', 'note', 'title', 'mood', 'log', 'unflag'].includes(s.cmd)) { try { (window.VILLAGE_HOOK || {}).effect?.(s.cmd, s.args, vnCurId); } catch (e) { console.error(e); } continue; }
    if (s.cmd === 'end') break;
    if (s.cmd === 'say') { vnSay(s); return; }
  }
  // end of scene
  if (!vnEndFired) { vnEndFired = true; try { (window.VILLAGE_HOOK || {}).end?.(vnCurId); } catch (e) { console.error(e); } }
  vnEnded = true; vnName.style.display = 'none'; vnText.textContent = '— おしまい —'; vnNext.style.opacity = 0; vnCloseBtn.textContent = vnFromAlbum ? 'アルバムにもどる' : '村にもどる'; SE.end();
  for (const k of ['L', 'R']) vnCards[k].classList.remove('dim');
}
function vnJump(label) { const i = vnSteps.findIndex(x => x.cmd === 'label' && x.args[0] === label); vnIdx = i >= 0 ? i + 1 : vnSteps.length; }
function vnChoices(opts) {
  vnBusy = true; clearTimeout(vnAutoT); vnNext.style.opacity = 0;
  const box = document.createElement('div'); box.className = 'choices';
  for (const o of opts) { const b = document.createElement('button'); b.type = 'button'; b.textContent = o.text;
    b.addEventListener('click', e => { e.stopPropagation(); SE.pop(); box.remove(); vnBusy = false; vnJump(o.to); vnStep(); }); box.appendChild(b); }
  vnBox.appendChild(box);
}
function vnSay(s) {
  const ch = CHARS[s.name];
  if (ch) { if (s.face || !vnCards[ch.side].classList.contains('show')) setFace(s.name, s.face || 'normal');
    for (const k of ['L', 'R']) { const c = vnCards[k]; c.classList.toggle('act', k === ch.side); c.classList.toggle('dim', k !== ch.side && c.classList.contains('show')); }
    const c = vnCards[ch.side]; c.classList.remove('hop'); void c.offsetWidth; c.classList.add('hop');
    vnName.textContent = s.name; vnName.style.background = ch.color; vnName.style.display = 'block'; }
  else if (s.name) { vnName.textContent = s.name; vnName.style.background = '#b59aa4'; vnName.style.display = 'block'; }
  else vnName.style.display = 'none';
  SE.pop();
  vnFull = s.text; let i = 0; vnText.textContent = ''; vnNext.style.opacity = 0; clearInterval(vnTyping);
  vnTyping = setInterval(() => { i++; vnText.textContent = vnFull.slice(0, i); if (i >= vnFull.length) { clearInterval(vnTyping); vnTyping = null; vnNext.style.opacity = 1; if (vnAuto) vnAutoT = setTimeout(vnStep, 1300 + vnFull.length * 45); } }, 42);
}
function vnTap(e) {
  if (e) e.stopPropagation(); if (vnBusy) return;
  if (vnEnded) return;
  if (vnTyping) { clearInterval(vnTyping); vnTyping = null; vnText.textContent = vnFull; vnNext.style.opacity = 1; if (vnAuto) vnAutoT = setTimeout(vnStep, 1300 + vnFull.length * 45); return; }
  vnStep();
}
vnEl.addEventListener('click', vnTap);
vnEl.addEventListener('pointerdown', e => e.stopPropagation());
vnAutoBtn.addEventListener('click', e => { e.stopPropagation(); vnAuto = !vnAuto; vnAutoBtn.classList.toggle('on', vnAuto); if (vnAuto && !vnTyping && !vnBusy && !vnEnded) vnAutoT = setTimeout(vnStep, 600); });
vnCloseBtn.addEventListener('click', e => { e.stopPropagation(); vnClose(); });
addEventListener('keydown', e => { if (!vnOpen) return; if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); vnTap(); } if (e.code === 'Escape') vnClose(); });
let nearHot = null;
talkBtn.addEventListener('click', e => { e.stopPropagation(); if (nearHot) vnStart(nearHot.id); });
markerEl.addEventListener('pointerdown', e => e.stopPropagation());
markerEl.addEventListener('click', e => { e.stopPropagation(); const h = HOTSPOTS.find(h => h.id === markerEl.dataset.id); if (h) vnStart(h.id); });
function vnTick(VP) {
  if (vnOpen || !running || inside) { markerEl.style.display = 'none'; talkBtn.style.display = 'none'; return; }
  let best = null, bd = 1e9;
  for (const h of HOTSPOTS) { if (h.special) continue; const d = Math.hypot(h.x - pl.x, h.z - pl.z); if (d < bd) { bd = d; best = h; } }
  if (!best) return;
  nearHot = bd < best.r ? best : null;
  talkBtn.style.display = nearHot ? 'block' : 'none'; if (nearHot) talkBtn.textContent = `▶ ふたりの会話「${nearHot.title}」`;
  const p = [best.x, best.y + 0.9, best.z];
  const cx = VP[0] * p[0] + VP[4] * p[1] + VP[8] * p[2] + VP[12], cy = VP[1] * p[0] + VP[5] * p[1] + VP[9] * p[2] + VP[13], cw = VP[3] * p[0] + VP[7] * p[1] + VP[11] * p[2] + VP[15];
  if (cw > 0.1 && bd < 32) { markerEl.style.display = 'block'; markerEl.dataset.id = best.id; markerEl.textContent = '💬 ' + best.title;
    markerEl.style.left = ((cx / cw * 0.5 + 0.5) * innerWidth) + 'px'; markerEl.style.top = ((1 - (cy / cw * 0.5 + 0.5)) * innerHeight) + 'px'; }
  else markerEl.style.display = 'none';
}

// ---- conversation album
const ALBUM_KEY = 'ninamel_village_album_v1';
let seen = []; try { seen = JSON.parse(localStorage.getItem(ALBUM_KEY) || '[]'); } catch (e) { seen = []; }
const albumEl = document.getElementById('album'), albumBtn = document.getElementById('albumBtn'), toastEl = document.getElementById('toast');
let vnFromAlbum = false, pendingToast = false;
function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('on'); setTimeout(() => toastEl.classList.remove('on'), 2600); }
function markSeen(id) { if (seen.includes(id)) return; seen.push(id); pendingToast = true; try { localStorage.setItem(ALBUM_KEY, JSON.stringify(seen)); } catch (e) { } albumBtn.classList.add('new'); }
function renderAlbum() {
  const grid = albumEl.querySelector('.grid'); grid.innerHTML = '';
  const open = (h) => seen.includes(h.id) || (h.special && (() => { try { return !!(window.VILLAGE_HOOK || {}).cond?.(h.cond); } catch (e) { return false; } })());
  const n = HOTSPOTS.filter(open).length;
  albumEl.querySelector('.count').innerHTML = `見つけた会話 <b>${n}</b> / ${HOTSPOTS.length}<div class="bar"><i style="width:${HOTSPOTS.length ? n / HOTSPOTS.length * 100 : 0}%"></i></div>`;
  HOTSPOTS.forEach((h, i) => {
    const ok = open(h), d = document.createElement('div');
    d.className = 'ep' + (ok ? '' : ' lock');
    d.innerHTML = `<div class="th" style="background-image:url(${h.thumb})"></div>${ok ? '' : '<div class="q">?</div>'}<div class="bd"><div class="no">${h.special ? '✦ SPECIAL' : 'EPISODE ' + String(i + 1).padStart(2, '0')}</div><div class="tt">${ok ? h.title : '???'}</div><div class="pl">${ok ? (h.special ? '✦ ' : '📍 ') + h.place : 'ヒント:' + h.place + (h.special ? '' : 'のあたり')}</div></div>${ok ? '<div class="play">▶ 見る</div>' : ''}`;
    if (ok) d.addEventListener('click', () => { closeAlbum(true); vnFromAlbum = true; setTimeout(() => vnStart(h.id), 250); });
    grid.appendChild(d);
  });
  const soon = document.createElement('div'); soon.className = 'ep soon'; soon.innerHTML = 'つづく…<br>新しい会話、準備中'; grid.appendChild(soon);
}
function openAlbum() { renderAlbum(); albumBtn.classList.remove('new'); albumEl.style.display = 'block'; requestAnimationFrame(() => albumEl.classList.add('on')); }
function closeAlbum(quick) { albumEl.classList.remove('on'); setTimeout(() => { albumEl.style.display = 'none'; }, quick ? 200 : 350); }
albumEl.addEventListener('pointerdown', e => e.stopPropagation());
albumEl.querySelector('.x').addEventListener('click', e => { e.stopPropagation(); closeAlbum(); });
albumBtn.addEventListener('click', e => { e.stopPropagation(); openAlbum(); });
albumBtn.addEventListener('pointerdown', e => e.stopPropagation());
document.getElementById('goAlbum').addEventListener('click', e => { e.stopPropagation(); openAlbum(); });

// ================= village map (fast travel) =================
const mapEl = document.getElementById('map'), mapBtn = document.getElementById('mapBtn');
const MX = x => 14 + (x + 114) * 2.3, MY = z => 14 + (z + 99) * 2.3;
const PLACES = [
  { id: 'gate', name: '村の入口', x: 0, z: 44, yaw: 0, at: [0, 41] },
  { id: 'plaza', name: '噴水の広場', x: -3, z: -12.5, yaw: 0.15, at: [0, -24], lab: [-34, 44] },
  { id: 'hall', name: '共同食堂', x: 9.5, z: -24, yaw: Math.PI / 2, at: [20, -24], lab: [0, 50] },
  { id: 'kinoko', name: '大きな木の下', x: 6.2, z: -13.4, yaw: 0.62, at: [8.3, -16.4], icon: '🍄', lab: [-12, -20] },
  { id: 'terrace', name: '大聖堂のテラス', x: 0, z: -46, yaw: 0, at: [0, -50], lab: [0, 8] },
  { id: 'inside', name: '大聖堂の中', inside: true, at: [0, -74] },
  { id: 'mansion', name: 'メルのお屋敷', x: -47.5, z: -24, yaw: -Math.PI / 2, at: [-92, -24] },
  { id: 'hut', name: 'ニナの小屋', x: -55.5, z: -6, yaw: 2.9, at: [-52.8, 2.6] },
];
function mapSVG() {
  const r = rngf(5150); let g = '';
  const rect = (x0, z0, x1, z1, fill, rx = 4, extra = '') => `<rect x="${MX(Math.min(x0, x1))}" y="${MY(Math.min(z0, z1))}" width="${Math.abs(x1 - x0) * 2.3}" height="${Math.abs(z1 - z0) * 2.3}" rx="${rx}" fill="${fill}" ${extra}/>`;
  g += `<rect x="0" y="0" width="360" height="380" rx="22" fill="#e8f2d6"/>`;
  for (let i = 0; i < 70; i++) { const x = 10 + r() * 340, y = 10 + r() * 360; g += `<circle cx="${x}" cy="${y}" r="${1 + r() * 1.5}" fill="${pick(['#ffffff', '#ffc9d8', '#fff1a8'], r)}" opacity=".8"/>`; }
  // far trees
  for (let i = 0; i < 46; i++) { const x = -114 + r() * 140, z = -99 + r() * 150;
    if (Math.abs(x) < 26 && z > -98 && z < 50 && (Math.abs(x) < 9 || Math.hypot(x, z + 24) < 20 || z < -38)) continue; if (x < -44 && z > -62 && z < 14) continue; if (x < -10 && x > -46 && Math.abs(z + 24) < 6) continue;
    const c = pick(['#bfdca4', '#ffd3df', '#fff4f2', '#a9cf8f'], r); g += `<circle cx="${MX(x)}" cy="${MY(z)}" r="${5 + r() * 3}" fill="${c}" stroke="#ffffff" stroke-width="1.2"/>`; }
  // roads
  g += rect(-3.4, -10, 3.4, 48, '#efe4df', 6, 'stroke="#e2d3cd" stroke-width="1.5"');
  g += rect(-46, -26.4, -10, -21.6, '#efe4df', 6, 'stroke="#e2d3cd" stroke-width="1.5"');
  g += `<circle cx="${MX(0)}" cy="${MY(-24)}" r="${15 * 2.3}" fill="#f3e8e3" stroke="#e2d3cd" stroke-width="1.5"/>`;
  g += `<circle cx="${MX(0)}" cy="${MY(-24)}" r="${8 * 2.3}" fill="none" stroke="#f7cfdb" stroke-width="2" stroke-dasharray="3 4"/>`;
  g += `<circle cx="${MX(0)}" cy="${MY(-24)}" r="7.5" fill="#bfe3f2" stroke="#ffffff" stroke-width="2"/>`;
  // houses along street + plaza ring
  const roofs = ['#eeaab5', '#c9b6e2', '#f2bfa0', '#b8d4b4', '#a9bde0'];
  for (const s of [-1, 1]) for (let z = 44; z > -6; z -= 6.2) g += rect(s * 4.2, z, s * 10.5, z - 5.2, pick(roofs, r), 3, 'stroke="#ffffff" stroke-width="1.5"');
  for (let deg = 14; deg < 360; deg += 21) { if ((deg > 68 && deg < 112) || (deg > 238 && deg < 302) || (deg > 152 && deg < 208) || deg < 20 || deg > 340) continue; const a = deg * Math.PI / 180, x = Math.cos(a) * 20, z = -24 + Math.sin(a) * 20; g += rect(x - 3, z - 3, x + 3, z + 3, pick(roofs, r), 3, 'stroke="#ffffff" stroke-width="1.5"'); }
  g += rect(15.6, -30.5, 26, -17.5, '#f0b39f', 3, 'stroke="#ffffff" stroke-width="1.5"');
  // stairs, terrace, cathedral
  g += rect(-22, -43.2, 22, -96, '#f6efea', 6, 'stroke="#e6dbd5" stroke-width="1.5"');
  for (let i = 0; i < 6; i++) g += rect(-4.5, -37.2 - i, 4.5, -37.7 - i, i % 2 ? '#efe6e1' : '#e4d9d4', 0);
  g += rect(-13, -61.5, 13, -89, '#ffffff', 4, 'stroke="#e1dbe6" stroke-width="1.5"');
  g += rect(-6.5, -63, 6.5, -88, '#b9bdd6', 3);
  g += `<circle cx="${MX(0)}" cy="${MY(-63.5)}" r="5" fill="#f7c9d7" stroke="#ffffff" stroke-width="1.5"/>`;
  for (const x of [-9.6, 9.6, -14.3, 14.3]) g += `<polygon points="${MX(x - 2.3)},${MY(-60)} ${MX(x + 2.3)},${MY(-60)} ${MX(x)},${MY(-66)}" fill="#f2c55c" stroke="#ffffff" stroke-width="1"/>`;
  for (const [x, z] of [[-19.5, -55], [19.5, -63], [-17, -70], [17, -70], [-21, -78], [21, -78]]) g += `<ellipse cx="${MX(x)}" cy="${MY(z)}" rx="3" ry="6" fill="#86ad8d"/>`;
  // mansion
  g += rect(-112, -58, -46, 10, '#fdebf0', 8, 'stroke="#f3cdd8" stroke-width="2"');
  for (const [x0, z0, x1, z1] of [[-58.5, -50, -48.5, -30.5], [-58.5, -15, -48.5, -5.5], [-76.5, -54, -67.5, -33.5], [-76.5, -14.5, -67.5, 6]]) { g += rect(x0, z0, x1, z1, '#bcd9a2', 3); for (let k = 0; k < 6; k++) g += `<circle cx="${MX(x0 + 1.5 + r() * (x1 - x0 - 3))}" cy="${MY(z0 + 1.5 + r() * (z1 - z0 - 3))}" r="2" fill="#ffb3c9"/>`; }
  g += `<circle cx="${MX(-63)}" cy="${MY(-24)}" r="${8 * 2.3}" fill="#f8eeea"/><circle cx="${MX(-63)}" cy="${MY(-24)}" r="6" fill="#bfe3f2" stroke="#fff" stroke-width="2"/>`;
  g += rect(-110, -67, -82, 19, '#ffffff', 5, 'stroke="#f3cdd8" stroke-width="1.5"');
  g += rect(-106, -64, -86, 16, '#f2aebd', 4);
  for (const z of [-70, 22]) g += `<circle cx="${MX(-95)}" cy="${MY(z)}" r="${7 * 2.3}" fill="#dfe9f6" stroke="#f2c55c" stroke-width="2"/>`;
  g += `<rect x="${MX(-46) - 3}" y="${MY(-27)}" width="6" height="${6 * 2.3}" rx="2" fill="#f2c55c"/>`;
  g += rect(-54.8, 0.8, -50.8, 4.4, '#a8927e', 1, 'stroke="#ffffff" stroke-width="1"');
  g += `<text x="${MX(8.3)}" y="${MY(-16.4) + 4}" font-size="11" text-anchor="middle">🍄</text>`;
  // compass + title ribbon
  g += `<g transform="translate(330,350)"><circle r="14" fill="#fff" opacity=".9"/><polygon points="0,-11 4,0 0,3 -4,0" fill="#e98aa4"/><text y="-14" font-size="8" text-anchor="middle" fill="#a0838d">N</text></g>`;
  // pins
  for (const p of PLACES) { const x0 = MX(p.at[0]), y = MY(p.at[1]); const w = (p.name.length + (p.icon ? 1.5 : 0)) * 11 + 18; const L = p.lab || [0, 0], x = x0 + L[0], yl = y + L[1];
    g += `<g class="pin" data-id="${p.id}"><line x1="${x0}" y1="${y}" x2="${x}" y2="${yl - 10}" stroke="#e98aa4" stroke-width="1" stroke-dasharray="2 2"/><circle cx="${x0}" cy="${y}" r="4" fill="#e98aa4" stroke="#fff" stroke-width="2"/><rect class="pill" x="${x - w / 2}" y="${yl - 30}" width="${w}" height="22" rx="11" fill="#ffffff" stroke="#e98aa4" stroke-width="1.5"/><text x="${x}" y="${yl - 15}" font-size="11" text-anchor="middle" fill="#7a5560">${p.icon ? p.icon + ' ' : ''}${p.name}</text><rect x="${x - w / 2 - 6}" y="${yl - 36}" width="${w + 12}" height="44" fill="transparent"/></g>`; }
  // me
  const mp = inside ? [0, -74] : [pl.x, pl.z];
  g += `<g transform="translate(${MX(mp[0])},${MY(mp[1])})"><circle class="me" r="6" fill="#ff6f96" opacity=".35"/><circle r="5" fill="#ff6f96" stroke="#fff" stroke-width="2"/>${inside ? '' : `<polygon points="0,-11 4,-4 -4,-4" fill="#ff6f96" transform="rotate(${pl.yaw * 180 / Math.PI})"/>`}</g>`;
  return `<svg viewBox="0 0 360 380" xmlns="http://www.w3.org/2000/svg">${g}</svg>`;
}
function openMap() { mapEl.querySelector('.svgbox').innerHTML = mapSVG(); mapEl.style.display = 'block'; requestAnimationFrame(() => mapEl.classList.add('on'));
  mapEl.querySelectorAll('.pin').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); travel(el.dataset.id); })); }
function closeMap() { mapEl.classList.remove('on'); setTimeout(() => { mapEl.style.display = 'none'; }, 300); }
function travel(id) {
  const p = PLACES.find(q => q.id === id); if (!p) return; closeMap();
  fadeEl.style.opacity = 1; fading = 1;
  setTimeout(() => { if (p.inside) { inside = true; pl.x = X0; pl.z = -1.6; pl.yaw = 0; pl.pitch = 0.08; pl.y = 1.6; }
    else { inside = false; pl.x = p.x; pl.z = p.z; pl.yaw = p.yaw; pl.pitch = 0.05; pl.y = groundAt(p.x, p.z) + 1.6; }
    fadeEl.style.opacity = 0; setTimeout(() => fading = 0, 500); }, 550);
}
mapEl.addEventListener('pointerdown', e => e.stopPropagation());
mapEl.querySelector('.x').addEventListener('click', e => { e.stopPropagation(); closeMap(); });
mapBtn.addEventListener('pointerdown', e => e.stopPropagation());
mapBtn.addEventListener('click', e => { e.stopPropagation(); openMap(); });
// ================= loop =================
const FOG_OUT = [0.965, 0.955, 0.95], FOG_IN = [0.97, 0.94, 0.9];
const L = (() => { const v = [0.55, 0.62, 0.56]; const l = Math.hypot(...v); return v.map(q => q / l); })();
let last = performance.now(), T0 = last, autoT = 0;
let TINT = [1, 1, 1], lastInside = false;
window.VILLAGE = { start: (id) => vnStart(id), isOpen: () => vnOpen, toast: (m) => toast(m), setTint: (t) => { TINT = t; }, scripts: SCRIPTS, pos: () => ({ x: pl.x, z: pl.z, inside }), isRunning: () => running };
window.__dbg = { openMap: () => openMap(), travel: (id) => travel(id), pos: () => [pl.x, pl.z, inside], key: (k, v) => { keys[k] = v; }, vnStart: (id) => vnStart(id), vnTap: () => vnTap(), setCam(x, z, yaw, pitch, ins) { if (ins !== undefined) inside = !!ins; pl.x = x; pl.z = z; pl.yaw = yaw; pl.pitch = pitch; pl.y = groundAt(x, z) + 1.6; }, mobs, mobsIn };

function drawMobs(list, u, isDepth) {
  return;
  for (const m of list) {
    const B = modelM(m.x, m.y, m.z, m.a, m.s);
    gl.uniformMatrix4fv(u.uM, false, B); gl.bindVertexArray(m.body.vao); gl.drawArrays(gl.TRIANGLES, 0, m.body.count);
    gl.uniformMatrix4fv(u.uM, false, headM(B, 1.17, m.hy, m.hp)); gl.bindVertexArray(m.head.vao); gl.drawArrays(gl.TRIANGLES, 0, m.head.count);
  }
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; const t = (now - T0) / 1000;
  if (!running) { autoT += dt; pl.yaw = Math.sin(autoT * 0.12) * 0.3; }
  let fw = 0, st = 0;
  if (keys.KeyW || keys.ArrowUp) fw += 1; if (keys.KeyS || keys.ArrowDown) fw -= 1;
  if (keys.KeyD) st += 1; if (keys.KeyA) st -= 1;
  if (keys.ArrowLeft) pl.yaw -= dt * 1.8; if (keys.ArrowRight) pl.yaw += dt * 1.8;
  fw += -joy.y; st += joy.x;
  const mag = Math.min(1, Math.hypot(fw, st));
  if (running && !fading && !vnOpen && mag > 0.05) {
    const sp = (keys.ShiftLeft || keys.ShiftRight ? 6.2 : 3.3) * mag, l = Math.hypot(fw, st);
    const fx = Math.sin(pl.yaw), fz = -Math.cos(pl.yaw), rx = Math.cos(pl.yaw), rz = Math.sin(pl.yaw);
    const vx = (fx * fw + rx * st) / l * sp * dt, vz = (fz * fw + rz * st) / l * sp * dt;
    if (walkable(pl.x + vx, pl.z)) pl.x += vx; if (walkable(pl.x, pl.z + vz)) pl.z += vz;
    const moved = Math.hypot(vx, vz); pl.bob += moved * 2.6; pl.step += moved;
    if (pl.step > 0.72) { pl.step = 0; footstep(); }
    // doors
    if (!inside && pl.z < CFRONT + 0.75 && Math.abs(pl.x) < 1.8) goInside();
    if (inside && pl.z > -0.55) goOutside();
  }
  const gy = groundAt(pl.x, pl.z) + 1.6; pl.y += (gy - pl.y) * Math.min(1, dt * 9);
  const eye = [pl.x, pl.y + Math.sin(pl.bob) * 0.03, pl.z];
  const fwd = [Math.sin(pl.yaw) * Math.cos(pl.pitch), Math.sin(pl.pitch), -Math.cos(pl.yaw) * Math.cos(pl.pitch)];
  const FOV = 1.08 * (W < H ? 1.12 : 1), asp = W / H, NEAR = 0.08, FAR = 600;
  const VP = mul(persp(FOV, asp, NEAR, FAR), lookDir(eye, fwd));
  const list = inside ? mobsIn : mobs;
  MDT = dt; updateMobs(list, t);
  const FOG = inside ? FOG_IN : FOG_OUT, FOGD = inside ? 0.006 : 0.0058;

  if (AC) { const dP = Math.hypot(pl.x - PZ[0], pl.z - PZ[1]);
    gMur.gain.setTargetAtTime(inside ? 0.015 : 0.05 + 0.18 * clamp(1 - (dP - 8) / 45, 0, 1), AC.currentTime, 0.3);
    gMus.gain.setTargetAtTime(inside ? 0.0 : (0.15 + 0.6 * clamp(1 - (dP - 6) / 40, 0, 1)) * (vnOpen ? 0.45 : 1), AC.currentTime, 0.3);
    gOrg.gain.setTargetAtTime(inside ? 0.5 : 0, AC.currentTime, 0.6); }
  if (running) { const z = zoneOf(pl.x, pl.z); if (z !== curZone) { curZone = z; showZone(z); } }
  if (zoneTimer > 0) { zoneTimer -= dt; if (zoneTimer <= 0) zoneEl.style.opacity = 0; }

  // ---- shadow pass (outside only)
  let LVP = ID;
  if (!inside) {
    const S = 46, tex = 2 * S / SMS; const cx = Math.round((pl.x + Math.sin(pl.yaw) * 18) / tex) * tex, cz = Math.round((pl.z - Math.cos(pl.yaw) * 18) / tex) * tex;
    const c = [cx, 0, cz], e = [c[0] + L[0] * 120, c[1] + L[1] * 120, c[2] + L[2] * 120];
    LVP = mul(ortho(-S, S, -S, S, 20, 260), lookDir(e, [-L[0], -L[1], -L[2]]));
    gl.bindFramebuffer(gl.FRAMEBUFFER, smFB); gl.viewport(0, 0, SMS, SMS); gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2, 4);
    gl.useProgram(P_DEPTH.p); const ud = P_DEPTH.u; gl.uniformMatrix4fv(ud.uVP, false, LVP); gl.uniform1f(ud.uT, t); gl.uniformMatrix4fv(ud.uM, false, ID);
    gl.bindVertexArray(WORLD.vao); gl.drawArrays(gl.TRIANGLES, 0, WORLD.count);
    drawMobs(list, ud, true);
    gl.disable(gl.POLYGON_OFFSET_FILL);
  }
  // ---- scene pass
  gl.bindFramebuffer(gl.FRAMEBUFFER, scFB); gl.viewport(0, 0, W, H);
  gl.clearColor(FOG[0], FOG[1], FOG[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.disable(gl.DEPTH_TEST); gl.useProgram(P_SKY.p); const u0 = P_SKY.u;
  gl.uniform2f(u0.uRes, W, H); gl.uniform1f(u0.uPitch, pl.pitch); gl.uniform1f(u0.uYaw, pl.yaw); gl.uniform1f(u0.uFov, FOV); gl.uniform1f(u0.uAsp, asp); gl.uniform1f(u0.uT, t); gl.uniform3fv(u0.uFog, FOG);
  gl.bindVertexArray(EMPTY); if (!inside) gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.BLEND); gl.depthMask(true);
  gl.useProgram(P_WORLD.p); const u = P_WORLD.u;
  gl.uniformMatrix4fv(u.uVP, false, VP); gl.uniformMatrix4fv(u.uM, false, ID); gl.uniform1f(u.uT, t); gl.uniform3fv(u.uEye, eye); gl.uniform3fv(u.uFog, FOG); gl.uniform1f(u.uFogD, FOGD);
  gl.uniform3fv(u.uL, L); gl.uniform1f(u.uShOn, inside ? 0 : 1); gl.uniform1f(u.uInside, inside ? 1 : 0); gl.uniformMatrix4fv(u.uLVP, false, LVP); gl.uniform1f(u.uSMpx, 1 / SMS);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, smTex); gl.uniform1i(u.uSM, 0);
  if (inside) { gl.bindVertexArray(INNER.vao); gl.drawArrays(gl.TRIANGLES, 0, INNER.count); }
  else { gl.bindVertexArray(WORLD.vao); gl.drawArrays(gl.TRIANGLES, 0, WORLD.count); }
  drawMobs(list, u, false);
  drawDolls(list, VP, eye, FOG, FOGD); gl.useProgram(P_WORLD.p);
  // blobs & transparent
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
  gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-2, -2);
  gl.uniformMatrix4fv(u.uM, false, ID);
  if (!inside) { gl.bindVertexArray(BLOBS.vao); gl.drawArrays(gl.TRIANGLES, 0, BLOBS.count); }
  for (const m of list) { gl.uniformMatrix4fv(u.uM, false, modelM(m.x, groundAt(m.x, m.z), m.z, 0, m.s)); gl.bindVertexArray(SBLOB.vao); gl.drawArrays(gl.TRIANGLES, 0, SBLOB.count); }
  gl.disable(gl.POLYGON_OFFSET_FILL);
  if (inside) { gl.blendFunc(gl.ONE, gl.ONE); gl.uniformMatrix4fv(u.uM, false, ID); gl.bindVertexArray(SHAFTS.vao); gl.drawArrays(gl.TRIANGLES, 0, SHAFTS.count); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); }
  gl.useProgram(P_PET.p); const up = P_PET.u;
  gl.uniformMatrix4fv(up.uVP, false, VP); gl.uniform3fv(up.uEye, eye); gl.uniform1f(up.uT, t); gl.uniform1f(up.uPx, H / (2 * Math.tan(FOV / 2))); gl.uniform1f(up.uFogD, FOGD); gl.uniform1f(up.uInside, inside ? 1 : 0);
  gl.bindVertexArray(PET); gl.drawArrays(gl.POINTS, 0, NPET);
  gl.depthMask(true); gl.disable(gl.BLEND);
  // ---- post
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); gl.disable(gl.DEPTH_TEST);
  gl.useProgram(P_POST.p); const uq = P_POST.u;
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, scCol); gl.uniform1i(uq.uCol, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, scDep); gl.uniform1i(uq.uDep, 1);
  gl.uniform2f(uq.uRes, W, H); gl.uniform1f(uq.uNear, NEAR); gl.uniform1f(uq.uFar, FAR); gl.uniform1f(uq.uT, t); gl.uniform1f(uq.uInside, inside ? 1 : 0); gl.uniform3fv(uq.uTint, inside ? [1, 1, 1] : TINT);
  if (inside !== lastInside) { lastInside = inside; try { (window.VILLAGE_HOOK || {}).place?.(inside ? 'inside' : 'outside'); } catch (e) { } }
  gl.bindVertexArray(EMPTY); gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE0);

  // speech bubble
  let best = null, bd = 3.0;
  if (running && !fading && !vnOpen) for (const m of list) { const dx = m.x - pl.x, dz = m.z - pl.z, d = Math.hypot(dx, dz);
    if (d < bd && (dx * Math.sin(pl.yaw) - dz * Math.cos(pl.yaw)) / (d || 1) > 0.35) { bd = d; best = m; } }
  if (best !== talkMob) { talkMob = best; if (best) { bubble.textContent = best.line; try { (window.VILLAGE_HOOK || {}).talk?.(best); } catch (e) { } } bubble.style.opacity = best ? 1 : 0; }
  if (talkMob) { const p = [talkMob.x, talkMob.y + 1.85 * talkMob.s + (talkMob.seated ? -0.4 : 0), talkMob.z];
    const cx = VP[0] * p[0] + VP[4] * p[1] + VP[8] * p[2] + VP[12], cy = VP[1] * p[0] + VP[5] * p[1] + VP[9] * p[2] + VP[13], cw = VP[3] * p[0] + VP[7] * p[1] + VP[11] * p[2] + VP[15];
    if (cw > 0.1) { const sx = (cx / cw * 0.5 + 0.5) * innerWidth, sy = (1 - (cy / cw * 0.5 + 0.5)) * innerHeight, hw = bubble.offsetWidth / 2 + 8;
      bubble.style.left = clamp(sx, hw, innerWidth - hw) + 'px'; bubble.style.top = clamp(sy, 60, innerHeight - 20) + 'px'; } }
  vnTick(VP);
  { const near = running && !fading && !vnOpen && (inside ? pl.z > -8 : (Math.abs(pl.x) < 9 && pl.z < CFRONT + 14 && pl.z > CFRONT - 1));
    const dm = document.getElementById('doorMk');
    if (!inside && running && !vnOpen && pl.z < STAIR_Z0 + 8 && pl.z > CFRONT) { const p = [0, TY + 6.2, CFRONT + 0.3];
      const cx = VP[0] * p[0] + VP[4] * p[1] + VP[8] * p[2] + VP[12], cy = VP[1] * p[0] + VP[5] * p[1] + VP[9] * p[2] + VP[13], cw = VP[3] * p[0] + VP[7] * p[1] + VP[11] * p[2] + VP[15];
      if (cw > 0.1) { dm.style.display = 'block'; dm.style.left = ((cx / cw * 0.5 + 0.5) * innerWidth) + 'px'; dm.style.top = ((1 - (cy / cw * 0.5 + 0.5)) * innerHeight) + 'px'; } else dm.style.display = 'none'; }
    else dm.style.display = 'none';
    if (near && talkBtn.style.display !== 'block') { doorBtn.style.display = 'block'; doorBtn.textContent = inside ? '▶ 外に出る' : '▶ 大聖堂に入る'; } else doorBtn.style.display = 'none'; }
}
requestAnimationFrame(frame);
})();
#!/usr/bin/env node
// Deterministic generator for the kids prayer-guide illustrations (public/kids/steps/<name>.{svg,webp}).
// One recurring character (boy ~8, white kufi + thobe) in side view facing the qibla (screen left), drawn from a
// parametric skeleton (hip, torso, neck/head, shoulder/elbow/wrist, knee/ankle) so every pose is anatomically right.
// Same mosque background in every picture except wudu (same palette, basin scene). No text anywhere.
//
//   node scripts/gen-prayer-art.mjs            -> svg + webp (960x720, q88)
//   node scripts/gen-prayer-art.mjs --svg-only -> svg only
//
// Rasterising: sharp when it is installed, else headless Chrome/Edge screenshot -> Python Pillow (png -> webp).
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'kids', 'steps');
export const NAMES = ['wudu', 'takbir', 'qiyam', 'ruku', 'itidal', 'sujud', 'julus', 'salam'];
const W = 960, H = 720, F = 622; // F = floor contact line (on the rug)

// ---------- palette ----------
const C = {
  teal: '#1f7a6d', tealD: '#155c52', tealL: '#2e9483', tealXL: '#5fb8a6',
  cream: '#fff4d6', creamD: '#f3e1b6', creamDD: '#e7cd98',
  gold: '#e0a93b', goldD: '#b98624', goldL: '#f2c96b',
  skin: '#d99a6a', skinD: '#c17f52', skinL: '#e9b183', blush: '#f08a74', lip: '#86452f',
  hair: '#2a1f1b', eye: '#231a17',
  cloth: '#fbfbf7', clothM: '#eef1ee', clothD: '#d3dcd9', clothF: '#e3e9e6', clothFD: '#c7d1ce', fold: '#c9d4d1',
  kufi: '#ffffff', kufiD: '#e2e6e2', water: '#8fd6ea', waterD: '#4fb3d0'
};

// ---------- geometry ----------
const n = v => +v.toFixed(1);
const P = p => `${n(p[0])},${n(p[1])}`;
const rad = d => d * Math.PI / 180;
// body angle convention: 0 = straight down, 90 = forward (towards the qibla = screen left), 180 = up, -90 = backwards
const dir = a => [-Math.sin(rad(a)), Math.cos(rad(a))];
const fk = (p, a, l) => [p[0] + dir(a)[0] * l, p[1] + dir(a)[1] * l];
const add = (p, d) => [p[0] + d[0], p[1] + d[1]];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const svgAng = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; // 0 = +x, clockwise
/** two-bone IK: joint between a and target c, bend = +1 / -1 picks the side. Returns [joint, end]. */
function ik(a, c, l1, l2, bend) {
  let d = dist(a, c); d = Math.max(Math.abs(l1 - l2) + 0.1, Math.min(l1 + l2 - 0.1, d));
  const base = Math.atan2(c[1] - a[1], c[0] - a[0]);
  const A = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const t = base + bend * A;
  const b = [a[0] + l1 * Math.cos(t), a[1] + l1 * Math.sin(t)];
  const t2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
  return [b, [b[0] + l2 * Math.cos(t2), b[1] + l2 * Math.sin(t2)]];
}
/** tapered capsule (tangent hull of two circles) as a path d */
function capD(a, ra, b, rb) {
  const d = dist(a, b);
  if (d < Math.abs(ra - rb) + 0.5) { const [c, r] = ra > rb ? [a, ra] : [b, rb]; return `M${n(c[0] - r)},${n(c[1])}a${n(r)},${n(r)} 0 1,0 ${n(2 * r)},0a${n(r)},${n(r)} 0 1,0 ${n(-2 * r)},0Z`; }
  const phi = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const be = Math.acos(Math.max(-1, Math.min(1, (ra - rb) / d)));
  const on = (c, r, t) => [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)];
  const p1 = on(a, ra, phi + be), p2 = on(b, rb, phi + be), p3 = on(b, rb, phi - be), p4 = on(a, ra, phi - be);
  return `M${P(p1)}L${P(p2)}A${n(rb)},${n(rb)} 0 ${2 * be > Math.PI ? 1 : 0},0 ${P(p3)}L${P(p4)}A${n(ra)},${n(ra)} 0 ${2 * Math.PI - 2 * be > Math.PI ? 1 : 0},0 ${P(p1)}Z`;
}
/** chain of capsules through pts with radii rs */
const chainD = (pts, rs) => pts.slice(1).map((p, i) => capD(pts[i], rs[i], p, rs[i + 1])).join('');

// ---------- shading ----------
let uid = 0;
/** two-tone flat shading: full shape in the shade tone, then the lit tone shifted towards the light and clipped to the shape */
function shaded(d, lit, shade, shift = [3, -5], extra = '') {
  const id = `c${++uid}`;
  return `<clipPath id="${id}"><path d="${d}"/></clipPath><path d="${d}" fill="${shade}"${extra}/>` +
    `<g clip-path="url(#${id})"><path d="${d}" fill="${lit}" transform="translate(${shift[0]},${shift[1]})"/></g>`;
}
/** soft contact shadow under a shape (blurred, offset) */
const drop = (d, o = 0.35, off = [2, 5], col = '#5d6f6b') => `<path d="${d}" fill="${col}" opacity="${o}" transform="translate(${off[0]},${off[1]})" filter="url(#soft)"/>`;
/** union version: several overlapping shapes shaded as one (no seams where they overlap) */
function shadedU(ds, lit, shade, shift = [3, -5]) {
  const id = `c${++uid}`;
  return `<clipPath id="${id}">${ds.map(d => `<path d="${d}"/>`).join('')}</clipPath>${ds.map(d => `<path d="${d}" fill="${shade}"/>`).join('')}` +
    `<g clip-path="url(#${id})">${ds.map(d => `<path d="${d}" fill="${lit}" transform="translate(${shift[0]},${shift[1]})"/>`).join('')}</g>`;
}
const cloth = (d, far = false) => Array.isArray(d)
  ? shadedU(d, far ? 'url(#clothF)' : 'url(#cloth)', far ? C.clothFD : C.clothD)
  : shaded(d, far ? 'url(#clothF)' : 'url(#cloth)', far ? C.clothFD : C.clothD);
const skinS = (d, far = false) => shaded(d, far ? C.skinD : C.skin, far ? '#a96b45' : C.skinD, [3, -4]);

// ---------- body parts ----------
/** hand: wrist at origin pointing +x; ts = thumb side (+1 = local +y). angle = svg rotation. sx = foreshortening */
function hand(w, angle, { ts = 1, far = false, sx = 1, sy = 1, curl = 0 } = {}) {
  const sk = far ? C.skinD : C.skin, sd = far ? '#a96b45' : C.skinD;
  const fy = [-7.2, -2.4, 2.4, 7.2], fl = [44, 46.5, 45, 40];
  let s = capD([2, 0], 9.5, [22, 0], 11.5);
  // fingers (curl bends the last segment towards -y*ts side, e.g. wrapping a knee)
  const fingers = fy.map((y, i) => {
    const yy = y * ts, L = fl[i];
    if (!curl) return capD([22, yy], 3.4, [L, yy * 0.95], 3.1);
    const mid = [22 + (L - 22) * 0.55, yy];
    const tip = [mid[0] + (L - 22) * 0.45 * Math.cos(rad(curl)), yy + (L - 22) * 0.45 * Math.sin(rad(curl)) * -ts];
    return capD([22, yy], 3.4, mid, 3.2) + capD(mid, 3.2, tip, 3);
  }).join('');
  const thumb = capD([7, 7 * ts], 4.6, [17, 15 * ts], 4.1) + capD([17, 15 * ts], 4.1, [25, 17.5 * ts], 3.8);
  const d = s + fingers + thumb;
  const gaps = [-4.8, 0, 4.8].map(y => `<path d="M25,${n(y * ts)}L${n(fl[1] - 6)},${n(y * ts * 0.95)}" stroke="${sd}" stroke-width="1.3" stroke-linecap="round" opacity=".55"/>`).join('');
  return `<g transform="translate(${P(w)}) rotate(${n(angle)}) scale(${sx},${sy})">${shaded(d, sk, sd, [2, -3])}${curl ? '' : gaps}</g>`;
}
/** bare foot: ankle at origin, sole on y=+16, toes towards -x. rot rotates the whole foot, toe bends the toes at the ball */
function foot(a, rot = 0, toe = 0, far = false) {
  const sk = far ? C.skinD : C.skin, sd = far ? '#a96b45' : C.skinD;
  const main = 'M9,-8C16,-2 19,10 13,16L-36,16C-40,12 -39,4 -32,1C-22,-3 -12,-9 -4,-12C2,-14 6,-12 9,-8Z';
  const toes = 'M-31,0.5C-40,2 -52,6 -55,11C-57,15 -54,17 -49,17L-35,17C-38,12 -37,5 -31,0.5Z';
  const tl = [-49, -45, -41].map(x => `<path d="M${x},${12 + (x + 49) * 0.4}L${x + 1},16.5" stroke="${sd}" stroke-width="1.2" stroke-linecap="round" opacity=".5"/>`).join('');
  return `<g transform="translate(${P(a)}) rotate(${n(rot)})">${shaded(main, sk, sd, [3, -4])}<path d="M10,13.5L-33,13.5" stroke="${far ? '#d9a27c' : '#f2c6a0'}" stroke-width="5" stroke-linecap="round" opacity=".9"/><g transform="rotate(${n(toe)} -34 13)">${shaded(toes, sk, sd, [3, -4])}${tl}</g></g>`;
}
/** side-view head facing left, centre at origin before rotation */
function headSide(c, rot) {
  const skin = 'M8,-50C-22,-52 -45,-35 -46,-10C-47,-4 -49,0 -52,6C-54,10 -51,13 -46,14C-46,18 -46,22 -44,25C-46,28 -44,31 -40,32C-37,40 -29,45 -17,45C2,47 26,41 36,27C52,8 50,-34 8,-50Z';
  const hair = 'M-30,-33C-12,-44 26,-44 42,-20C50,-4 47,14 37,26C31,20 27,10 24,2C20,-6 12,-12 2,-14C-4,-22 -18,-28 -30,-33Z';
  const kufi = 'M-41,-25C-41,-57 36,-64 47,-19L46,-12C22,-23 -14,-27 -40,-19Z';
  const band = 'M-41,-22C-14,-29 22,-26 46.5,-15';
  const dots = [-32, -22, -12, -2, 8, 18, 28, 37].map((x, i) => `<circle cx="${x}" cy="${n(-24.5 + i * 0.95 + (x > 20 ? (x - 20) * 0.12 : 0))}" r="1.6" fill="${C.gold}" opacity=".75"/>`).join('');
  return `<g transform="translate(${P(c)}) rotate(${n(rot)})">
    ${shaded(skin, C.skin, C.skinD, [3, -3])}
    <path d="${hair}" fill="${C.hair}"/>
    <path d="M27,0C27,-8 35,-10 39,-4C42,2 40,12 34,16C30,18 26,14 27,10Z" fill="${C.skin}"/>
    <path d="M30,1C31,-3 35,-3 36,1C37,6 34,10 31,9" fill="none" stroke="${C.skinD}" stroke-width="2.2" stroke-linecap="round"/>
    <ellipse cx="-27" cy="-3" rx="4.6" ry="6.2" fill="${C.eye}"/><circle cx="-28.6" cy="-5.4" r="1.7" fill="#fff"/>
    <path d="M-36,-15Q-28,-20 -19,-16" fill="none" stroke="${C.hair}" stroke-width="3.6" stroke-linecap="round"/>
    <path d="M-17,-3Q-15,3 -18,6" fill="none" stroke="${C.skinD}" stroke-width="1.6" stroke-linecap="round" opacity=".0"/>
    <circle cx="-17" cy="13" r="8" fill="${C.blush}" opacity=".3"/>
    <path d="M-43,21Q-37,27 -29,24" fill="none" stroke="${C.lip}" stroke-width="3" stroke-linecap="round"/>
    ${shaded(kufi, C.kufi, C.kufiD, [3, -3])}
    <path d="${band}" fill="none" stroke="${C.kufiD}" stroke-width="5" stroke-linecap="round"/>${dots}
  </g>`;
}
/** three-quarter head turned towards the viewer (salam) */
function headFront(c, rot) {
  const face = 'M-44,-6C-44,-36 -20,-50 2,-50C26,-50 44,-34 44,-6C44,22 28,46 0,46C-28,46 -44,22 -44,-6Z';
  const hairL = 'M-44,-12C-46,-34 -26,-46 -4,-46L-8,-28C-24,-26 -34,-20 -40,4C-44,0 -44,-6 -44,-12Z';
  const hairR = 'M44,-12C46,-34 26,-46 4,-46L20,-30C32,-26 38,-16 40,6C44,0 44,-6 44,-12Z';
  const kufi = 'M-45,-20C-45,-62 45,-62 45,-20L45,-14C20,-24 -20,-24 -45,-14Z';
  const band = 'M-45,-17C-20,-26 20,-26 45,-17';
  const dots = [-36, -26, -16, -6, 4, 14, 24, 34].map(x => `<circle cx="${x}" cy="${n(-20.5 - Math.cos(x / 45 * 1.5) * 1.5)}" r="1.6" fill="${C.gold}" opacity=".75"/>`).join('');
  return `<g transform="translate(${P(c)}) rotate(${n(rot)})">
    <ellipse cx="44" cy="2" rx="8" ry="11" fill="${C.skinD}"/><ellipse cx="-44" cy="2" rx="8" ry="11" fill="${C.skin}"/>
    <path d="M-46,-2C-46,-6 -42,-6 -42,-2" fill="none" stroke="${C.skinD}" stroke-width="2"/>
    ${shaded(face, C.skin, C.skinD, [3, -3])}
    <path d="${hairL}" fill="${C.hair}"/><path d="${hairR}" fill="${C.hair}"/>
    <ellipse cx="-16" cy="-1" rx="4.8" ry="6.4" fill="${C.eye}"/><circle cx="-17.6" cy="-3.4" r="1.8" fill="#fff"/>
    <ellipse cx="14" cy="-1" rx="4.8" ry="6.4" fill="${C.eye}"/><circle cx="12.4" cy="-3.4" r="1.8" fill="#fff"/>
    <path d="M-25,-14Q-17,-19 -8,-15" fill="none" stroke="${C.hair}" stroke-width="3.6" stroke-linecap="round"/>
    <path d="M6,-15Q14,-19 23,-14" fill="none" stroke="${C.hair}" stroke-width="3.6" stroke-linecap="round"/>
    <path d="M-1,4Q-4,11 0,13" fill="none" stroke="${C.skinD}" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="-26" cy="13" r="7.5" fill="${C.blush}" opacity=".3"/><circle cx="25" cy="13" r="7.5" fill="${C.blush}" opacity=".3"/>
    <path d="M-11,22Q-1,31 10,22" fill="none" stroke="${C.lip}" stroke-width="3.2" stroke-linecap="round"/>
    ${shaded(kufi, C.kufi, C.kufiD, [3, -3])}
    <path d="${band}" fill="none" stroke="${C.kufiD}" stroke-width="5" stroke-linecap="round"/>${dots}
  </g>`;
}

// ---------- skeleton ----------
const L = { torso: 148, sh: 128, neck: 14, headOff: 42, up: 84, fore: 76, thigh: 122, shin: 118, ankle: 16 };
/** spine: hip + torso angle -> neck base, shoulder joint, head centre */
function spine(hip, torsoA, neckA) {
  const neckBase = fk(hip, torsoA, L.torso);
  const shoulder = fk(hip, torsoA, L.sh);
  const head = fk(neckBase, neckA, L.neck + L.headOff);
  return { hip, neckBase, shoulder, head, torsoA, neckA };
}
function torsoShape(s) {
  const chest = fk(s.hip, s.torsoA, 108);
  return chainD([s.hip, fk(s.hip, s.torsoA, 54), chest], [39, 37, 37]);
}
const neckShape = s => capD(s.neckBase, 13, lerp(s.neckBase, s.head, 0.75), 12);
/** sleeve (full or rolled to the elbow) and hand */
function arm(sh, el, wr, handAng, o = {}) {
  const far = !!o.far; let out = '';
  if (o.rolled) {
    const cuff = lerp(sh, el, 0.86);
    const sleeve = capD(sh, 17, cuff, 14.5);
    out += (far ? '' : drop(sleeve, 0.22)) + cloth(sleeve, far);
    out += skinS(capD(cuff, 10.5, el, 10) + capD(el, 10, wr, 8.5), far);
    out += cloth(capD(lerp(sh, el, 0.8), 15.5, lerp(sh, el, 0.95), 15.5), far);
  } else {
    const cuffAt = lerp(el, wr, 0.9);
    const sleeve = capD(sh, 17, el, 14.5) + capD(el, 14.5, cuffAt, 13);
    out += (far ? '' : drop(sleeve, 0.25)) + cloth(sleeve, far);
    out += skinS(capD(lerp(el, wr, 0.82), 7.5, wr, 7.5), far);
    out += `<path d="${capD(lerp(el, wr, 0.84), 13.4, cuffAt, 13.2)}" fill="${far ? C.clothFD : C.clothD}" opacity=".7"/>`;
  }
  if (!o.noHand) out += hand(wr, handAng, { ts: o.ts ?? 1, far, sx: o.sx ?? 1, sy: o.sy ?? 1, curl: o.curl || 0 });
  return out;
}
/** thobe-covered leg (thigh + shin) with the bare ankle peeking out */
function legParts(hip, knee, ankle, far) {
  const hem = lerp(knee, ankle, 0.8);
  return {
    ds: [capD(hip, 31, knee, 25), capD(knee, 25, hem, 20)],
    under: skinS(capD(hem, 9, ankle, 8.5), far),
    over: ''
  };
}
function leg(hip, knee, ankle, far) {
  const p = legParts(hip, knee, ankle, far);
  return p.under + (far ? '' : drop(p.ds.join(''), 0.25)) + cloth(p.ds, far) + p.over;
}
/** standing thobe skirt from the hips down to the ankles */
function skirt(hip, torsoA, hemY, frontX, backX, waistR = 38) {
  const fr = fk(hip, torsoA - 90, waistR), bk = fk(hip, torsoA + 90, waistR); // torsoA-90 -> front side when torso is vertical
  const a = fr[0] < bk[0] ? fr : bk, b = fr[0] < bk[0] ? bk : fr;
  const d = `M${P(a)}C${n(a[0] - 6)},${n(a[1] + 80)} ${n(frontX + 2)},${n(hemY - 90)} ${n(frontX)},${n(hemY - 6)}` +
    `Q${n(frontX)},${n(hemY + 6)} ${n(frontX + 12)},${n(hemY + 5)}L${n(backX - 12)},${n(hemY + 5)}Q${n(backX)},${n(hemY + 6)} ${n(backX)},${n(hemY - 6)}` +
    `C${n(backX - 2)},${n(hemY - 90)} ${n(b[0] + 8)},${n(b[1] + 80)} ${P(b)}Z`;
  const folds = [0.3, 0.55, 0.78].map((t, i) => {
    const top = lerp(a, b, t), bot = [frontX + (backX - frontX) * (t + (i - 1) * 0.04), hemY - 4];
    return `<path d="M${P(lerp(top, bot, 0.18))}Q${n((top[0] + bot[0]) / 2 + (i - 1) * 6)},${n((top[1] + bot[1]) / 2)} ${P(bot)}" fill="none" stroke="${C.fold}" stroke-width="3.2" stroke-linecap="round" opacity=".75"/>`;
  }).join('');
  return { d, folds };
}
const shadowEllipse = (cx, rx, ry = 13, o = 0.32) => `<ellipse cx="${cx}" cy="${F + 3}" rx="${rx}" ry="${ry}" fill="#0c3b34" opacity="${o}" filter="url(#soft2)"/>`;

// ---------- defs + backgrounds ----------
const defs = () => `<defs>
  <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff8e6"/><stop offset=".75" stop-color="${C.cream}"/><stop offset="1" stop-color="${C.creamD}"/></linearGradient>
  <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.tealL}"/><stop offset=".35" stop-color="${C.teal}"/><stop offset="1" stop-color="${C.tealD}"/></linearGradient>
  <linearGradient id="niche" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ecd29f"/><stop offset="1" stop-color="#f6e4bd"/></linearGradient>
  <linearGradient id="win" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffdf5"/><stop offset="1" stop-color="#ffe7a8"/></linearGradient>
  <linearGradient id="ray" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c4" stop-opacity=".75"/><stop offset="1" stop-color="#fff3c4" stop-opacity="0"/></linearGradient>
  <linearGradient id="rug" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f9c80"/><stop offset="1" stop-color="#20806a"/></linearGradient>
  <linearGradient id="cloth" gradientUnits="userSpaceOnUse" x1="700" y1="80" x2="300" y2="660"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="${C.clothM}"/></linearGradient>
  <linearGradient id="clothF" gradientUnits="userSpaceOnUse" x1="700" y1="80" x2="300" y2="660"><stop offset="0" stop-color="${C.clothF}"/><stop offset="1" stop-color="#d9e0dd"/></linearGradient>
  <linearGradient id="basin" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e9efee"/><stop offset=".55" stop-color="#ffffff"/><stop offset="1" stop-color="#dfe7e5"/></linearGradient>
  <linearGradient id="brass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.goldL}"/><stop offset="1" stop-color="${C.goldD}"/></linearGradient>
  <radialGradient id="glow" cx=".72" cy=".25" r=".7"><stop offset="0" stop-color="#fffbe9" stop-opacity=".9"/><stop offset="1" stop-color="#fffbe9" stop-opacity="0"/></radialGradient>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.5"/></filter>
  <filter id="soft2" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>
  <filter id="blur20" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="18"/></filter>
</defs>`;

function archD(x0, x1, yTop, yBot, spring) { // pointed arch
  const cx = (x0 + x1) / 2, w = x1 - x0;
  return `M${x0},${yBot}L${x0},${spring}C${x0},${spring - w * 0.42} ${cx - w * 0.18},${yTop + w * 0.08} ${cx},${yTop}C${cx + w * 0.18},${yTop + w * 0.08} ${x1},${spring - w * 0.42} ${x1},${spring}L${x1},${yBot}Z`;
}
function wallCommon() {
  // windows (light source, top right) + rays
  const wins = [[700, 790], [818, 908]].map(([a, b]) =>
    `<path d="${archD(a - 9, b + 9, 92, 338, 190)}" fill="${C.creamDD}"/><path d="${archD(a, b, 104, 330, 196)}" fill="url(#win)"/>` +
    `<path d="M${(a + b) / 2},118L${(a + b) / 2},330M${a},250L${b},250" stroke="${C.creamD}" stroke-width="5" opacity=".7"/>`).join('');
  const rays = `<g opacity=".8"><path d="M700,170L790,150L560,${F + 10}L330,${F + 10}Z" fill="url(#ray)"/><path d="M818,170L908,150L760,${F + 10}L560,${F + 10}Z" fill="url(#ray)"/></g>`;
  return { wins, rays };
}
function lantern(x, y1) {
  return `<path d="M${x},0L${x},${y1 - 34}" stroke="${C.goldD}" stroke-width="2.4"/>
    <path d="M${x - 12},${y1 - 34}L${x + 12},${y1 - 34}L${x + 7},${y1 - 26}L${x - 7},${y1 - 26}Z" fill="url(#brass)"/>
    <path d="M${x - 16},${y1 - 26}C${x - 22},${y1 - 6} ${x - 18},${y1 + 18} ${x},${y1 + 26}C${x + 18},${y1 + 18} ${x + 22},${y1 - 6} ${x + 16},${y1 - 26}Z" fill="${C.goldL}"/>
    <path d="M${x - 8},${y1 - 20}C${x - 11},${y1 - 4} ${x - 9},${y1 + 12} ${x},${y1 + 18}C${x + 9},${y1 + 12} ${x + 11},${y1 - 4} ${x + 8},${y1 - 20}Z" fill="#fff6d2"/>
    <circle cx="${x}" cy="${y1}" r="34" fill="#fff1b8" opacity=".35" filter="url(#soft)"/>
    <path d="M${x - 4},${y1 + 26}L${x + 4},${y1 + 26}L${x},${y1 + 36}Z" fill="${C.goldD}"/>`;
}
function bgPrayer() {
  const { wins, rays } = wallCommon();
  const rugT = 588, rugB = 654;
  const rug = `<path d="M188,${rugT}L838,${rugT}L872,${rugB}L150,${rugB}Z" fill="${C.goldD}" opacity=".35" transform="translate(0,6)" filter="url(#soft)"/>
    <path d="M188,${rugT}L838,${rugT}L872,${rugB}L150,${rugB}Z" fill="${C.gold}"/>
    <path d="M200,${rugT + 7}L828,${rugT + 7}L857,${rugB - 7}L166,${rugB - 7}Z" fill="url(#rug)"/>
    <path d="M222,${rugT + 15}L812,${rugT + 15}L834,${rugB - 15}L192,${rugB - 15}Z" fill="none" stroke="${C.goldL}" stroke-width="2.5" opacity=".8"/>
    <path d="M262,${rugB - 15}L262,${rugT + 34}Q262,${rugT + 15} 236,${rugT + 15}" fill="none" stroke="${C.goldL}" stroke-width="2.5" opacity=".8" transform="translate(-8,0)"/>
    ${[300, 420, 540, 660, 760].map(x => `<path d="M${x},${(rugT + rugB) / 2 - 9}L${x + 12},${(rugT + rugB) / 2}L${x},${(rugT + rugB) / 2 + 9}L${x - 12},${(rugT + rugB) / 2}Z" fill="${C.tealXL}" opacity=".45"/>`).join('')}
    ${Array.from({ length: 9 }, (_, i) => `<path d="M${152 + i * 2.2},${rugT + 8 + i * 6}l-10,0" stroke="${C.cream}" stroke-width="2.4" stroke-linecap="round"/><path d="M${868 - i * 2.2},${rugT + 8 + i * 6}l10,0" stroke="${C.cream}" stroke-width="2.4" stroke-linecap="round"/>`).join('')}`;
  return `<rect width="${W}" height="${H}" fill="url(#wall)"/>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
    ${wins}
    <path d="${archD(48, 282, 70, 576, 250)}" fill="${C.gold}" opacity=".9"/>
    <path d="${archD(62, 268, 88, 576, 256)}" fill="url(#niche)"/>
    <path d="${archD(92, 238, 132, 576, 280)}" fill="${C.creamDD}" opacity=".55"/>
    ${[120, 165, 210].map(x => `<circle cx="${x}" cy="300" r="5" fill="${C.gold}" opacity=".5"/>`).join('')}
    ${lantern(410, 118)}
    <rect x="0" y="540" width="${W}" height="38" fill="${C.creamDD}"/>
    ${Array.from({ length: 21 }, (_, i) => `<path d="M${i * 48 + 24},545L${i * 48 + 38},559L${i * 48 + 24},573L${i * 48 + 10},559Z" fill="${C.gold}" opacity=".45"/>`).join('')}
    <rect x="0" y="576" width="${W}" height="${H - 576}" fill="url(#floor)"/>
    <path d="M0,600L${W},600" stroke="#ffffff" stroke-opacity=".07" stroke-width="2"/>
    ${rays}
    ${rug}`;
}
function bgWudu() {
  const { wins, rays } = wallCommon();
  const tiles = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 21; c++) {
    const x = c * 48 - (r % 2) * 24, y = 388 + r * 47;
    tiles.push(`<rect x="${x + 2}" y="${y + 2}" width="44" height="43" rx="6" fill="${(r + c) % 3 ? '#cfe8e1' : '#bfe0d7'}"/>`);
  }
  return `<rect width="${W}" height="${H}" fill="url(#wall)"/>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
    ${wins}
    <path d="${archD(48, 282, 70, 390, 230)}" fill="${C.gold}" opacity=".9"/>
    <path d="${archD(62, 268, 88, 390, 236)}" fill="url(#niche)"/>
    ${lantern(410, 118)}
    <rect x="0" y="380" width="${W}" height="200" fill="${C.teal}" opacity=".35"/>
    ${tiles.join('')}
    <rect x="0" y="376" width="${W}" height="10" fill="${C.gold}"/>
    <rect x="0" y="576" width="${W}" height="${H - 576}" fill="url(#floor)"/>
    ${rays}`;
}

// ---------- poses ----------
const ANK = F - L.ankle;
const collar = s => `<path d="${capD(fk(s.neckBase, s.torsoA, -6), 15.5, fk(s.neckBase, s.torsoA, -16), 17)}" fill="${C.clothM}"/>`;
/** standing body (shared by takbir, qiyam, itidal, wudu) */
function standing(armsFn, { lean = 178, neckA = 172, headRot = 0, x = 520, shadowX } = {}) {
  const hip = [x, ANK - 238];
  const s = spine(hip, lean, neckA);
  const ankN = [x - 6, ANK], ankF = [x + 10, ANK];
  const sk = skirt(hip, lean, ANK - 6, x - 54, x + 50);
  const parts = armsFn(s);
  const body = [sk.d, torsoShape(s)];
  return `${shadowEllipse(shadowX ?? x - 8, 92)}
    ${foot(ankF, 0, 0, true)}
    ${parts.back || ''}
    ${drop(body.join(''), 0.2)}${cloth(body)}${sk.folds}
    ${skinS(capD([x - 6, ANK - 12], 9, ankN, 8.5))}
    ${foot(ankN)}
    ${parts.mid || ''}
    ${skinS(neckShape(s))}
    ${collar(s)}
    ${headSide(s.head, headRot)}
    ${parts.front || ''}`;
}
const POSES = {
  itidal: () => standing(s => {
    const shF = add(s.shoulder, [6, -2]);
    const [eF, wF] = ik(shF, add(shF, [-4, 156]), L.up, L.fore, 1);
    const [e, w] = ik(s.shoulder, add(s.shoulder, [-10, 157]), L.up, L.fore, 1);
    return { back: arm(shF, eF, wF, svgAng(eF, wF) - 4, { far: true, ts: 1 }), front: arm(s.shoulder, e, w, svgAng(e, w) - 4, { ts: 1 }) };
  }),
  qiyam: () => standing(s => {
    // upper arms hang by the sides, forearms folded across the chest (they run into depth, so they are foreshortened);
    // the right (far) hand lies on top of the left (near) wrist
    const sh = s.shoulder, shF = add(sh, [8, -2]);
    const e = add(sh, [8, 84]), w = add(sh, [-26, 54]);
    const eF = add(shF, [4, 80]), wF = add(sh, [-30, 58]);
    return {
      back: arm(shF, eF, wF, 0, { far: true, noHand: true }),
      front: arm(sh, e, w, -24, { ts: 1, sx: 0.55 }) +
        hand(add(w, [-2, -12]), 96, { ts: 1, sx: 0.8, curl: 30 })
    };
  }),
  takbir: () => standing(s => {
    // elbows forward and down, forearms up, open palms facing the qibla, thumbs by the ear lobes.
    // The upper arm points partly sideways, so its projected length is shorter.
    const ear = add(s.head, [8, 4]);
    const sh = s.shoulder, shF = add(sh, [8, -2]);
    const w = add(ear, [2, 32]), e = add(sh, [-42, 42]);
    const wF = add(ear, [10, 28]), eF = add(shF, [-36, 40]);
    return {
      back: arm(shF, eF, wF, -84, { far: true, ts: 1 }),
      front: drop(capD(add(w, [0, -22]), 14, add(w, [-2, -44]), 13), 0.35, [4, 3], '#7a4a2c') + arm(sh, e, w, -94, { ts: 1 })
    };
  }),
  ruku: () => {
    const x = 560, hip = [x, ANK - 238];
    const s = spine(hip, 90, 100);
    const kneeY = ANK - L.shin;
    // straight arms, palms on the knees with the fingers spread over the knee cap
    const [e, w] = ik(s.shoulder, [x - 30, kneeY - 12], L.up, L.fore, 1);
    const shF = add(s.shoulder, [10, -3]);
    const [eF, wF] = ik(shF, [x - 20, kneeY - 16], L.up, L.fore, 1);
    // skirt hangs from the hips (back) and the belly (front)
    const bk = [x + 40, hip[1] - 4], bel = [x - 38, hip[1] + 32];
    const skD = `M${P(bk)}C${x + 52},${hip[1] + 70} ${x + 52},${ANK - 80} ${x + 50},${ANK - 12}Q${x + 50},${ANK - 1} ${x + 38},${ANK - 1}L${x - 34},${ANK - 1}Q${x - 46},${ANK - 1} ${x - 46},${ANK - 12}C${x - 46},${ANK - 80} ${x - 44},${hip[1] + 80} ${P(bel)}Z`;
    const folds = [[x + 18, x + 22], [x - 4, x - 2], [x - 26, x - 24]].map(([a, b], i) => `<path d="M${a},${hip[1] + 60 + i * 6}Q${a + (i - 1) * 6},${(hip[1] + ANK) / 2 + 20} ${b},${ANK - 8}" fill="none" stroke="${C.fold}" stroke-width="3.2" stroke-linecap="round" opacity=".75"/>`).join('');
    const body = [skD, torsoShape(s)];
    return `${shadowEllipse(x - 20, 120)}
      ${foot([x + 10, ANK], 0, 0, true)}
      ${arm(shF, eF, wF, svgAng(eF, wF) - 14, { far: true, ts: 1 })}
      ${drop(body.join(''), 0.2)}${cloth(body)}${folds}
      ${skinS(capD([x - 4, ANK - 12], 9, [x - 4, ANK], 8.5))}
      ${foot([x - 4, ANK])}
      ${skinS(neckShape(s))}
      ${headSide(s.head, -80)}
      ${collar(s)}
      ${arm(s.shoulder, e, w, 96, { ts: 1 })}`;
  },
  sujud: () => {
    // knees + toes on the rug, thighs upright so the hips are raised, forehead + nose on the rug,
    // palms flat beside the head, forearms and elbows lifted off the rug
    const knee = [642, F - 24];
    const ankle = [758, F - 42];
    const hip = [652, F - 140];
    const s = spine(hip, 63, 0);
    const headRot = -100;
    const head = [s.neckBase[0] - 44, F - 51];
    const sh = s.shoulder;
    const wN = [sh[0] + 16, F - 7], eN = [sh[0] + 46, F - 64];
    const shF = add(sh, [10, -4]);
    const wF = [sh[0] + 18, F - 9], eF = [sh[0] + 52, F - 68];
    const kneeF = add(knee, [12, -3]), ankF = add(ankle, [12, -3]);
    const lp = legParts(hip, knee, ankle, false);
    const body = [torsoShape(s), ...lp.ds];
    return `${shadowEllipse(580, 200, 14, 0.35)}
      ${foot(ankF, -70, 70, true)}
      ${leg(add(hip, [10, -2]), kneeF, ankF, true)}
      ${arm(shF, eF, wF, 180, { far: true, ts: 1, sy: 0.5 })}
      ${foot(ankle, -70, 70)}
      ${lp.under}${drop(body.join(''), 0.22)}${cloth(body)}${lp.over}
      ${skinS(capD(s.neckBase, 13, lerp(s.neckBase, head, 0.7), 12))}
      ${headSide(head, headRot)}
      ${collar(s)}
      ${arm(sh, eN, wN, 180, { ts: 1, sy: 0.5 })}`;
  },
  julus: () => sitting(false),
  salam: () => sitting(true),
  wudu: () => standing(s => {
    const hands = [418, 366];
    const [e, w] = ik(s.shoulder, add(hands, [16, 2]), L.up, L.fore, 1);
    const shF = add(s.shoulder, [8, -2]);
    const [eF, wF] = ik(shF, add(hands, [10, -6]), L.up, L.fore, 1);
    return { back: arm(shF, eF, wF, 168, { far: true, rolled: true, ts: -1 }), front: arm(s.shoulder, e, w, 176, { rolled: true, ts: 1 }) };
  }, { lean: 172, neckA: 160, headRot: -14, x: 560 })
};
/** julus / salam: sitting on the left (near) foot laid flat, right (far) foot upright with the toes on the rug */
function sitting(salam) {
  const knee = [446, F - 24];
  const ankle = [570, F - 15];
  const hip = [568, F - 70];
  const s = spine(hip, 178, salam ? 176 : 174);
  const sh = s.shoulder;
  const footN = foot(ankle, 180, 0); // laid flat under the seat, sole up, toes pointing back
  const footF = foot([622, F - 44], -72, 72, true); // upright behind, heel up, toes bent forward on the rug
  const wN = [492, F - 66];
  const [e, w] = ik(sh, wN, L.up, L.fore, -1);
  const shF = add(sh, [8, -2]);
  const [eF, wF] = ik(shF, [500, F - 70], L.up, L.fore, -1);
  const lap = `M${P(add(hip, [34, 30]))}L${knee[0] + 10},${F - 1}L${ankle[0] + 10},${F - 1}Z`;
  const lp = legParts(hip, knee, ankle, false);
  const body = [lap, torsoShape(s), ...lp.ds];
  return `${shadowEllipse(530, 130, 13, 0.35)}
    ${footF}
    ${leg(add(hip, [6, -2]), add(knee, [10, -3]), add(ankle, [-4, -3]), true)}
    ${arm(shF, eF, wF, svgAng(eF, wF) - 30, { far: true, ts: 1 })}
    ${footN}
    ${lp.under}${drop(body.join(''), 0.2)}${cloth(body)}${lp.over}
    ${skinS(neckShape(s))}
    ${collar(s)}
    ${salam ? headFront(s.head, 0) : headSide(s.head, 0)}
    ${arm(sh, e, w, svgAng(e, w) - 34, { ts: 1 })}`;
}
// wudu extras: basin + tap + water
function wuduProps() {
  const bx0 = 270, bx1 = 470, by = 398;
  const basin = `<path d="M${bx0 + 70},${by + 40}L${bx0 + 82},${F - 4}L${bx1 - 92},${F - 4}L${bx1 - 80},${by + 40}Z" fill="url(#basin)"/>
    <ellipse cx="${(bx0 + bx1) / 2 - 5}" cy="${F - 2}" rx="56" ry="8" fill="#0c3b34" opacity=".25" filter="url(#soft)"/>
    <path d="M${bx0},${by}L${bx1},${by}C${bx1 - 6},${by + 52} ${bx0 + 140},${by + 66} ${(bx0 + bx1) / 2},${by + 66}C${bx0 + 60},${by + 66} ${bx0 + 6},${by + 52} ${bx0},${by}Z" fill="url(#basin)"/>
    <rect x="${bx0 - 6}" y="${by - 8}" width="${bx1 - bx0 + 12}" height="14" rx="7" fill="#ffffff"/>
    <rect x="${bx0 - 6}" y="${by + 2}" width="${bx1 - bx0 + 12}" height="4" rx="2" fill="${C.clothD}"/>`;
  const tap = `<path d="M${bx0 + 34},${by - 8}L${bx0 + 34},${by - 78}C${bx0 + 34},${by - 112} ${bx0 + 96},${by - 118} ${bx0 + 140},${by - 92}L${bx0 + 146},${by - 84}" fill="none" stroke="url(#brass)" stroke-width="14" stroke-linecap="round"/>
    <rect x="${bx0 + 20}" y="${by - 20}" width="28" height="14" rx="5" fill="${C.goldD}"/>
    <path d="M${bx0 + 34},${by - 100}L${bx0 + 14},${by - 118}" stroke="${C.goldD}" stroke-width="8" stroke-linecap="round"/><circle cx="${bx0 + 34}" cy="${by - 100}" r="8" fill="${C.goldD}"/>`;
  const sx = bx0 + 146, sy = by - 82;
  const water = `<path d="M${sx - 5},${sy}C${sx - 6},${sy + 14} ${sx - 4},${sy + 26} ${sx - 2},${sy + 36}L${sx + 6},${sy + 36}C${sx + 6},${sy + 26} ${sx + 6},${sy + 14} ${sx + 5},${sy}Z" fill="${C.water}" opacity=".9"/>
    <path d="M${sx - 1},${sy + 4}L${sx},${sy + 30}" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity=".8"/>`;
  const dropS = (x, y, r) => `<path d="M${x},${y - r * 1.8}C${x + r * 0.4},${y - r} ${x + r},${y - r * 0.3} ${x + r},${y + r * 0.2}A${r},${r} 0 0,1 ${x - r},${y + r * 0.2}C${x - r},${y - r * 0.3} ${x - r * 0.4},${y - r} ${x},${y - r * 1.8}Z" fill="${C.water}"/><circle cx="${x - r * 0.35}" cy="${y}" r="${r * 0.28}" fill="#fff" opacity=".85"/>`;
  const drops = [[392, 398, 5], [404, 410, 4], [450, 392, 4.5], [380, 382, 3.5], [460, 404, 3.5], [372, 414, 4]].map(d => dropS(...d)).join('');
  const pool = `<ellipse cx="${(bx0 + bx1) / 2}" cy="${by + 12}" rx="88" ry="7" fill="${C.waterD}" opacity=".35"/>`;
  return { back: basin + pool + tap + water, front: drops };
}

// ---------- compose ----------
function svgFor(name) {
  uid = 0;
  let body = POSES[name]();
  let scene;
  if (name === 'wudu') { const w = wuduProps(); scene = bgWudu() + w.back + body + w.front; } else scene = bgPrayer() + body;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${defs()}${scene}</svg>\n`;
}

// ---------- rasterise ----------
function findChrome() {
  const c = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  return c.find(p => p && existsSync(p));
}
async function rasterise(names) {
  let sharp = null;
  try { sharp = (await import('sharp')).default; } catch { /* not installed */ }
  if (sharp) {
    for (const nm of names) await sharp(join(OUT, `${nm}.svg`), { density: 96 }).resize(W, H).webp({ quality: 88 }).toFile(join(OUT, `${nm}.webp`));
    return 'sharp';
  }
  const chrome = findChrome();
  if (!chrome) throw new Error('no sharp and no Chrome/Edge found; set CHROME_PATH');
  const tmp = join(tmpdir(), 'noor-prayer-art'); mkdirSync(tmp, { recursive: true });
  const pngs = [];
  for (const nm of names) {
    const png = join(tmp, `${nm}.png`);
    const html = join(tmp, `${nm}.html`);
    writeFileSync(html, `<!doctype html><html><body style="margin:0;overflow:hidden;background:#fff"><img src="${pathToFileURL(join(OUT, nm + '.svg')).href}" width="${W}" height="${H}" style="display:block"></body></html>`);
    execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${W},${H}`,
      `--screenshot=${png}`, '--allow-file-access-from-files', pathToFileURL(html).href], { stdio: 'ignore' });
    pngs.push([png, join(OUT, `${nm}.webp`)]);
  }
  const py = `import sys\nfrom PIL import Image\nargs=sys.argv[1:]\nfor i in range(0,len(args),2):\n  im=Image.open(args[i]).convert('RGB')\n  if im.size!=(${W},${H}): im=im.crop((0,0,${W},${H}))\n  im.save(args[i+1],'WEBP',quality=88,method=6)\n`;
  execFileSync('python', ['-I', '-c', py, ...pngs.flat()], { stdio: 'inherit' });
  if (!process.env.KEEP_PNG) rmSync(tmp, { recursive: true, force: true });
  return 'chrome+pillow';
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  mkdirSync(OUT, { recursive: true });
  const only = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const names = only.length ? only : NAMES;
  for (const nm of names) writeFileSync(join(OUT, `${nm}.svg`), svgFor(nm));
  if (!process.argv.includes('--svg-only')) console.log('rasterised with', await rasterise(names));
  console.log('wrote', names.map(x => `public/kids/steps/${x}.{svg,webp}`).join(' '));
}

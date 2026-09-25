// Walk through it: the homepage as a place you move through. The page scrolls a tall, empty track and the camera
// follows a path through the world: from high over the headline and the disc, down to eye level past each pane of
// work, and on to the disc itself, where the page ends the way the homepage does.
import * as THREE from 'three';
import { fontsReady } from './kit.js';
import { THEME, TEX, MOTION, shared, rgb, DISC, buildSky, buildGround, buildEclipse, buildType, buildPane, placeWorks, pathX } from './world-scene.js';

const q = new URLSearchParams(location.search);
const root = document.documentElement;
const $ = (s) => document.querySelector(s);
const reduced = q.has('reduced') || matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const band = (x, a, b) => 1 - smooth(clamp((x - a) / (b - a), 0, 1));
const D2R = Math.PI / 180;
const V3 = THREE.Vector3;

let dark = q.has('theme') ? q.get('theme') === 'dark' : root.dataset.theme === 'dark';
if (dark) root.dataset.theme = 'dark'; else delete root.dataset.theme;
MOTION.on = !reduced;

/* ───────── Renderer ───────── */
const stage = $('#stage');
function unable() {
  $('#loader').innerHTML = '<p class="fail">This needs WebGL, which this browser doesn’t have switched on. <a href="../">The homepage</a> has all the same work.</p>';
  throw new Error('WebGL unavailable');
}
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: q.has('shot') });
} catch (e) { unable(); }
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.NeutralToneMapping; // nothing here is lit or tone mapped: every material works in the site's colours
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, .2, 5000);

/* ───────── The world ───────── */
// A phone shows each picture a few hundred pixels across, so it gets smaller textures
TEX.maxSize = Math.min(window.innerWidth, window.innerHeight) < 700 ? 1024 : 1600;
await fontsReady();
const panes = await Promise.all(placeWorks().map((p) => buildPane(p, dark)));
const sky = buildSky();
const eclipse = buildEclipse();
const ground = buildGround(panes);
const headline = buildType([[['Always making', false]], [['something.', true]]], { height: 6.2 });

// Solid things that cover a lot of screen go last, so the depth test skips what's hidden
const back = new THREE.Group(); back.renderOrder = 10000; back.add(sky.mesh);
const floor = new THREE.Group(); floor.renderOrder = 9000; floor.add(ground.mesh);
const head = new THREE.Group(); head.add(headline.mesh);
headline.mesh.position.set(0, 21.5, -26);
scene.add(back, floor, eclipse.mesh, head, ...panes.map((p) => p.group));

/* ───────── Stops, and the scroll track that drives them ───────── */
const STOPS = [
  { id: 'start', name: 'Start' },
  ...panes.map((pane) => ({ id: pane.def.id, name: pane.def.name, pane })),
  { id: 'talk', name: 'Let’s talk' },
];
const N = STOPS.length;
const LAST = N - 1;
// One section of scroll per stretch between stops; their lengths follow the path (see setSegments)
const track = $('#track');
track.innerHTML = STOPS.map(() => '<section class="stop" style="--len:1" aria-hidden="true"></section>').join('');
const sections = [...track.children];
let stopY = sections.map(() => 0);

const intro = $('#intro'), cap = $('#cap'), talk = $('#talk'), walk = $('#walk'), veil = $('#veil');

/* ───────── The camera's path ───────── */
// One continuous curve through every stop, walked by distance, so the speed along it never jumps where the
// pieces of the curve meet. How far along it the camera is comes from the scroll position through a smooth
// curve that eases a little through each stop. Where it looks blends from the path ahead to the pane it's
// arriving at. The scroll is followed by a critically damped spring, so the speed never changes in one frame.
const EYE = 1.62;
const DWELL = .85;  // speed through a stop, against the stretches either side (a slight ease, not a brake)
const LEAD = 22;    // how far ahead along the path it looks between stops, in metres
const OMEGA = 11;   // how tightly the camera follows the scroll (a critically damped spring)
const PRE = 26;     // a quicker spring in front of it, so a jump in the scroll (a wheel notch) never jolts the acceleration either
const view = { w: 0, h: 0, portrait: false };
let path = null;

function stopPose(eye, focus, kx, ky, fov, reach = .5) { return { eye, focus, kx, ky, fov, reach }; }

function buildPath() {
  const { w, h } = view;
  const aspect = w / h;
  const portrait = view.portrait = aspect < .9;
  // How tall a screen it is, from a phone held upright (0) to a wide desktop (1)
  const wide = clamp((aspect - .46) / (1.2 - .46), 0, 1);
  const walkFov = portrait ? lerp(46, 60, clamp((.9 - aspect) / .45, 0, 1)) : 38;
  const tv = Math.tan(walkFov * D2R / 2), th = tv * aspect;
  const stops = [], mids = [];

  // The opening: a long lens from high over the path. The disc fills the frame from the horizon up, and the
  // headline hangs in front of it, on its face, with the intro under it.
  const startFov = lerp(22, 19, wide);
  const ky0 = lerp(-.64, -.66, wide);
  const eye0 = new V3(0, 15, 30);
  stops.push(stopPose(eye0, new V3(0, 15, -100), 0, ky0, startFov));
  const t0 = Math.tan(startFov * D2R / 2);
  const D = 56; // headline distance from the opening eye
  const hw = lerp(.84, h < 520 ? .36 : .42, wide) * 2 * D * t0 * aspect;
  const scale = hw / headline.width;
  const halfH = headline.height * scale / 2 / D / t0; // in NDC
  const cy = lerp(0, -.04, wide);
  headline.mesh.scale.setScalar(scale);
  headline.mesh.position.set(0, eye0.y + D * (cy - ky0) * t0, eye0.z - D);
  view.introTop = (1 - (cy - halfH * .78)) / 2 * 100 + (portrait ? 2.6 : 2.2);

  // On an upright screen the caption sits under the pane, so each pane is framed into the room above its caption
  const capH = portrait ? captionHeights() : [];
  const capBottom = parseFloat(getComputedStyle(cap).bottom) || 90;
  const topSafe = 74;

  panes.forEach((pane, i) => {
    const { w: pw, h: ph, main } = pane.def;
    let fillH = main ? .6 : .5, fillW = .44, kyStop = .02;
    if (portrait) {
      const room = Math.max(h - capBottom - capH[i + 1] - topSafe - 18, h * .2);
      fillH = room / h * (main ? .9 : .78);
      fillW = main ? .9 : .74;
      kyStop = 1 - 2 * (topSafe + room / 2) / h;
    } else if (h < 520) {
      fillH = main ? .66 : .56; // a short landscape screen: the caption is compact, the pane can be taller
    }
    const d = Math.max(ph / fillH / (2 * tv), pw / fillW / (2 * th));
    const a = pane.yaw + pane.side * .2; // stand a little back along the path, so the way on shows beside it
    const focus = pane.centre.clone(); focus.y = ph * .47;
    const eye = focus.clone().addScaledVector(new V3(Math.sin(a), 0, Math.cos(a)), d);
    // eye level, or just under the top of a shorter frame, so frames further back never show over its edge
    eye.y = Math.min(EYE, ph - .12);
    // Between stops the path runs down the middle of the way, so it weaves from one side to the other
    const prev = stops[stops.length - 1];
    const mz = (prev.eye.z + eye.z) / 2;
    mids.push(new V3(pathX(mz), i === 0 ? 4.6 : EYE + .05, mz));
    stops.push(stopPose(eye, focus, portrait ? 0 : pane.side * .4, kyStop, walkFov));
  });

  // The end: facing the disc, close enough that it fills the view with the ring round it
  const dz = portrait ? 150 : 240;
  const ey = portrait ? 50 : 45;
  const end = stopPose(new V3(0, ey, DISC.z + dz), new V3(0, ey, DISC.z), 0, 0, walkFov, .85); // the disc draws the eye most of the way there
  const mz = stops[stops.length - 1].eye.z - 30;
  mids.push(new V3(pathX(mz) * .5, 12, mz));
  stops.push(end);

  const pts = [stops[0].eye];
  mids.forEach((m, k) => pts.push(m, stops[k + 1].eye));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const per = 160, div = (pts.length - 1) * per;
  curve.arcLengthDivisions = div;
  const lengths = curve.getLengths(div);
  path = { curve, total: lengths[div], stops, arc: stops.map((s, k) => lengths[2 * k * per]), m: [] };
  fitTalk(end);
  intro.style.top = `${view.introTop.toFixed(2)}%`;
}

// Where the disc's face is on screen at the end, so "Let's talk." sits on it: between the top of the disc and
// where its base starts to sink into the haze, scaled down if a short screen doesn't have the room
const fitCam = new THREE.PerspectiveCamera();
function fitTalk(end) {
  fitCam.fov = end.fov; fitCam.aspect = view.w / view.h; fitCam.near = .2; fitCam.far = 5000;
  fitCam.position.copy(end.eye);
  fitCam.lookAt(end.focus);
  fitCam.setViewOffset(view.w, view.h, -end.kx / 2 * view.w, end.ky / 2 * view.h, view.w, view.h);
  fitCam.updateMatrixWorld();
  const toY = (y) => (1 - new V3(0, y, DISC.z).project(fitCam).y) / 2 * view.h;
  const top = Math.max(toY(DISC.y + DISC.r), 64), base = Math.min(toY(12), view.h - 90);
  const room = base - top;
  const k = clamp(room * .9 / Math.max(talk.offsetHeight, 1), .6, 1);
  talk.style.top = `${((top + base) / 2).toFixed(1)}px`;
  talk.style.scale = k.toFixed(3);
}

// How much scrolling each stretch takes, from how long it is: roughly steady metres per scroll, so passing a
// stop is a gentle ease rather than a brake, compressed a little so the long flight to the disc isn't endless
function setSegments() {
  const a = path.arc;
  sections.forEach((el, i) => el.style.setProperty('--len', i < LAST ? clamp(.28 * Math.sqrt(a[i + 1] - a[i]), .78, 3.2).toFixed(3) : '1'));
}

// Scroll position to distance along the path: a monotone cubic through each stop (C1, so no change of speed
// at a stop), easing to DWELL of the neighbouring pace as it passes through
function buildPacing() {
  const A = path.arc, Y = stopY, d = [], m = [];
  for (let i = 0; i < LAST; i++) d[i] = (A[i + 1] - A[i]) / Math.max(Y[i + 1] - Y[i], 1);
  m[0] = d[0] * DWELL; m[LAST] = d[LAST - 1] * DWELL;
  for (let i = 1; i < LAST; i++) m[i] = DWELL * 2 * d[i - 1] * d[i] / (d[i - 1] + d[i]);
  path.m = m;
}
function segAt(y) { let i = 0; while (i < LAST - 1 && y >= stopY[i + 1]) i++; return i; }
function arcAt(y) {
  const A = path.arc, m = path.m;
  if (y <= stopY[0]) return A[0];
  if (y >= stopY[LAST]) return A[LAST];
  const i = segAt(y), h = stopY[i + 1] - stopY[i], t = (y - stopY[i]) / h, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * A[i] + (t3 - 2 * t2 + t) * h * m[i] + (3 * t2 - 2 * t3) * A[i + 1] + (t3 - t2) * h * m[i + 1];
}

const P = { eye: new V3(), target: new V3(), kx: 0, ky: 0, fov: 38, arc: 0 };
const ahead = new V3(), tangent = new V3();
function poseAtY(y, attend = 1) {
  const { curve, total, stops } = path;
  const a = arcAt(y);
  P.arc = a;
  curve.getPointAt(clamp(a / total, 0, 1), P.eye);
  // Where it's heading: a point further along the path, a little lower
  const la = a + LEAD;
  if (la <= total) curve.getPointAt(la / total, ahead);
  else { curve.getPointAt(1, ahead); curve.getTangentAt(1, tangent); ahead.addScaledVector(tangent, la - total); }
  ahead.y = P.eye.y + clamp(ahead.y - .8 - P.eye.y, -4.5, 2.5); // along the way, but never staring at the sky or the floor
  // Where it's arriving: each stop's subject takes over through the half of the stretch nearest it
  const yy = clamp(y, stopY[0], stopY[LAST]);
  const i = segAt(yy), f = clamp((yy - stopY[i]) / (stopY[i + 1] - stopY[i]), 0, 1);
  // (at speed it keeps its eyes on the way ahead, and turns to a pane as it slows for it)
  let wa = 1 - smooth(clamp(f / stops[i].reach, 0, 1)), wb = 1 - smooth(clamp((1 - f) / stops[i + 1].reach, 0, 1));
  const sum = wa + wb;
  if (sum > 1) { wa /= sum; wb /= sum; }
  wa *= attend; wb *= attend;
  P.target.copy(ahead).multiplyScalar(1 - wa - wb).addScaledVector(stops[i].focus, wa).addScaledVector(stops[i + 1].focus, wb);
  const e = smooth(f);
  P.kx = lerp(stops[i].kx, stops[i + 1].kx, e) * (.35 + .65 * attend);
  P.ky = lerp(stops[i].ky, stops[i + 1].ky, e);
  P.fov = lerp(stops[i].fov, stops[i + 1].fov, e);
  return P;
}

/* ───────── Scroll ───────── */
function sFromY(y) {
  if (y <= stopY[0]) return 0;
  for (let i = 0; i < LAST; i++) if (y < stopY[i + 1]) return i + (y - stopY[i]) / (stopY[i + 1] - stopY[i]);
  return LAST;
}
function yFromS(s) {
  if (s >= LAST) return stopY[LAST];
  const i = Math.max(0, Math.floor(s));
  return stopY[i] + (s - i) * (stopY[i + 1] - stopY[i]);
}
// The camera's place in the scroll, and how fast it's moving through it (px, px/s), followed by a spring
const cam = { y: 0, v: 0, breath: 0, roll: 0, attend: 1 };
const lead = { y: 0, v: 0 }; // the scroll, lightly smoothed, which the camera then follows
function spring(state, target, dt, w) {
  // exact step of a critically damped spring, so it behaves the same at any frame rate
  const c1 = state.y - target, c2 = state.v + w * c1, e = Math.exp(-w * dt);
  state.y = target + (c1 + c2 * dt) * e;
  state.v = (c2 - w * (c1 + c2 * dt)) * e;
}
let yTarget = 0, sCam = 0, shown = 0, clock = 0;
let lastInput = -1e9, settled = true, touching = false, landed = 0, anim = null, expectY = -1, lastY = 0, dir = 1;
function readScroll() { yTarget = window.scrollY; }
// Moving the page ourselves (settling, or travelling to a stop). The page has nothing to see in it but the
// fixed canvas, so moving it is invisible; the camera does the travelling.
function toScroll(y) { window.scrollTo(0, y); expectY = window.scrollY; readScroll(); }
addEventListener('scroll', () => {
  const y = window.scrollY;
  if (Math.abs(y - expectY) > 1.5) {
    // someone scrolled: they're driving now
    if (Math.abs(y - lastY) > .5) dir = Math.sign(y - lastY);
    lastInput = clock; settled = false; anim = null; expectY = -1;
  }
  lastY = y;
  readScroll();
}, { passive: true });
addEventListener('touchstart', () => { touching = true; anim = null; }, { passive: true });
addEventListener('touchend', () => { touching = false; lastInput = clock; }, { passive: true });
addEventListener('touchcancel', () => { touching = false; lastInput = clock; }, { passive: true });
addEventListener('wheel', () => { anim = null; }, { passive: true });

// A glide to a stop: a quintic that leaves from wherever the camera is, at the speed and acceleration it
// already has, and comes to rest on the stop. Used for settling, keys, buttons and taps, so nothing ever stops and starts.
// If the camera is already nearly there, or heading the other way, the springs bring it in instead.
function glide(i, seconds) {
  const y1 = stopY[i], span = y1 - cam.y, v = cam.v;
  settled = true;
  if (Math.abs(span) < 1) return false;
  const rate = v / span; // above 0: already heading there
  let T = seconds;
  if (rate > 0) T = Math.min(T, 2.2 / rate);        // arriving fast: brake within the glide, never faster in
  else if (rate < 0) T = Math.min(T, 1.2 / -rate);  // heading away: turn round within the glide
  if (T < .3) return false;
  const acc = OMEGA * OMEGA * (lead.y - cam.y) - 2 * OMEGA * v; // what the spring was doing to it this instant
  const A0 = clamp(acc * T * T, -3 * Math.abs(span), 3 * Math.abs(span));
  anim = { y0: cam.y, m0: v * T, A0, y1, i, t0: clock, T: T * 1000 }; // clock: the frame cam was last worked out for
  return true;
}
function glideOrLand(i, seconds) {
  if (glide(i, seconds)) return;
  anim = null; landed = i;
  if (Math.abs(stopY[i] - window.scrollY) > .5) toScroll(stopY[i]);
}
function stepGlide(now) {
  const a = anim, t = clamp((now - a.t0) / a.T, 0, 1), t2 = t * t, t3 = t2 * t, t4 = t3 * t, t5 = t4 * t;
  // quintic Hermite: start position, speed and acceleration; rest at the stop with no acceleration left
  const h0 = 1 - 10 * t3 + 15 * t4 - 6 * t5, h1 = t - 6 * t3 + 8 * t4 - 3 * t5, h2 = .5 * t2 - 1.5 * t3 + 1.5 * t4 - .5 * t5, h5 = 10 * t3 - 15 * t4 + 6 * t5;
  const d0 = -30 * t2 + 60 * t3 - 30 * t4, d1 = 1 - 18 * t2 + 32 * t3 - 15 * t4, d2 = t - 4.5 * t2 + 6 * t3 - 2.5 * t4;
  cam.y = h0 * a.y0 + h1 * a.m0 + h2 * a.A0 + h5 * a.y1;
  cam.v = (d0 * a.y0 + d1 * a.m0 + d2 * a.A0 - d0 * a.y1) / (a.T / 1000);
  toScroll(cam.y);
  lead.y = cam.y; lead.v = cam.v; // if someone takes over mid-glide, the springs carry on from here
  if (t >= 1) { cam.y = lead.y = a.y1; cam.v = lead.v = 0; landed = a.i; anim = null; toScroll(a.y1); }
}

// Once the scrolling stops (and any fling has run out), it carries on to the next stop the way it was going.
// A small overshoot past a stop falls back to it. With reduced motion it lands on a stop straight away.
function settleCheck(now) {
  if (settled || anim || touching || now - lastInput < (reduced ? 90 : 160)) return;
  settled = true;
  const y = window.scrollY;
  const i = Math.min(Math.floor(sFromY(y)), LAST - 1), f = clamp((y - stopY[i]) / (stopY[i + 1] - stopY[i]), 0, 1);
  if (reduced) {
    let best = 0;
    for (let k = 1; k < N; k++) if (Math.abs(stopY[k] - y) < Math.abs(stopY[best] - y)) best = k;
    const off = y - stopY[landed];
    const target = best !== landed ? best : Math.abs(off) > 40 ? clamp(landed + Math.sign(off), 0, LAST) : landed;
    landed = target;
    toScroll(stopY[target]);
    return;
  }
  let target;
  if (f < .02) target = i; else if (f > .98) target = i + 1;
  else if (dir > 0) target = f < .12 ? i : i + 1;
  else target = f > .88 ? i + 1 : i;
  if (Math.abs(stopY[target] - y) < 1) { landed = target; return; } // the page is already there: the springs finish it
  glideOrLand(target, clamp(.45 + .75 * Math.abs(sFromY(stopY[target]) - sFromY(cam.y)), .5, 1.25));
}

// Keys, buttons and taps: a glide, longer for further. Across more than a couple of stops (Home, End, a far dash)
// flying would be a blur, so it cuts softly through the page colour to just short of the stop and glides in.
let cutTo = null;
function go(i) {
  i = clamp(Math.round(i), 0, LAST);
  if (Math.abs(stopY[i] - window.scrollY) < 1 && !anim) return;
  if (reduced) { settled = true; landed = i; toScroll(stopY[i]); return; }
  const n = Math.abs(sFromY(stopY[i]) - sFromY(cam.y));
  if (n <= 2.2) { cutTo = null; glideOrLand(i, clamp(.7 + .45 * n, .8, 2)); return; }
  if (cutTo !== null) { cutTo = i; return; }
  cutTo = i; anim = null; settled = true;
  veil.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 170, easing: 'ease-in', fill: 'forwards' }).finished.then(() => {
    const k = cutTo, from = sFromY(cam.y);
    cutTo = null;
    cam.y = lead.y = yFromS(clamp(k - Math.sign(k - from) * .45, 0, LAST)); cam.v = lead.v = 0; cam.roll = 0;
    toScroll(cam.y);
    glide(k, 1.15);
    veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: 'ease-out', fill: 'forwards' });
  });
}
const here = () => (cutTo !== null ? cutTo : anim ? anim.i : Math.round(sFromY(window.scrollY)));

/* ───────── Layout ───────── */
function measure() {
  const w = window.innerWidth, h = stage.clientHeight || window.innerHeight;
  const changed = w !== view.w || Math.abs(h - view.h) > 1;
  const keep = path && stopY[LAST] > 0 ? sFromY(cam.y) : null;
  view.w = w; view.h = h;
  if (changed) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    buildPath();
    setSegments();
    capFor = -1;
  }
  stopY = sections.map((el) => el.offsetTop);
  buildPacing();
  readScroll();
  if (keep !== null) { cam.y = lead.y = yFromS(keep); cam.v = lead.v = 0; }
}
addEventListener('resize', measure);

/* ───────── The words on top ───────── */
const ARROW_IN = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6h7M6.5 3l3 3-3 3"/></svg>';
const ARROW_OUT = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5l5-5M4.5 3.5h4v4"/></svg>';
// The homepage's second buttons, where it has one
const EXTRA = { snapshot: { label: 'Open live site', href: 'https://snapshot.smokingendshere.com/' } };
const verb = (p) => (p.external ? 'Open live site' : 'View case study');

let capFor = -1;
function captionHeights() {
  const out = [];
  for (let k = 1; k < LAST; k++) { fillCaption(k); out[k] = cap.offsetHeight; }
  capFor = -1;
  return out;
}
function fillCaption(k) {
  capFor = k;
  const pane = STOPS[k].pane, p = pane.def;
  cap.style.setProperty('--tone', p.tone);
  cap.classList.toggle('is-right', !view.portrait && pane.side < 0);
  $('#c-label').textContent = `${p.label} · ${p.status}`;
  $('#c-name').textContent = p.name;
  $('#c-line').textContent = p.line;
  const extra = EXTRA[p.id];
  $('#c-actions').innerHTML =
    `<a class="btn is-primary" href="${p.href}"${p.external ? ' target="_blank" rel="noopener"' : ''}>${verb(p)}${p.external ? ARROW_OUT : ARROW_IN}</a>` +
    (extra ? `<a class="btn" href="${extra.href}" target="_blank" rel="noopener">${extra.label}${ARROW_OUT}</a>` : '');
}

const dashes = $('#dashes');
dashes.innerHTML = STOPS.map((s, i) => `<li><button type="button" data-i="${i}" aria-label="${s.name}"></button></li>`).join('');
const dashButtons = [...dashes.querySelectorAll('button')];
dashes.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) go(+b.dataset.i); });
$('#prev').addEventListener('click', () => go(here() - 1));
$('#next').addEventListener('click', () => go(here() + 1));

const last = new Map();
function setStyle(el, prop, value) {
  const key = el.id + prop;
  if (last.get(key) === value) return;
  last.set(key, value);
  el.style[prop] = value;
}
function show(el, v, lift = 14) {
  setStyle(el, 'opacity', v.toFixed(3));
  setStyle(el, 'translate', el === talk ? `-50% calc(-50% + ${((1 - v) * lift).toFixed(1)}px)` : el === intro ? `-50% ${((1 - v) * lift).toFixed(1)}px` : `0 ${((1 - v) * lift).toFixed(1)}px`);
  setStyle(el, 'visibility', v < .01 ? 'hidden' : 'visible');
  const live = v > .6;
  if (el.classList.contains('is-live') !== live) el.classList.toggle('is-live', live);
}

let current = -1, capShown = 0;
function hud(near, v) {
  show(intro, near === 0 ? v : 0);
  const onPane = near >= 1 && near < LAST;
  // Swap the caption's words only while it's out of sight (or straight away, when there's no fade)
  if (onPane && near !== capFor && (capShown < .03 || capFor === -1 || reduced)) fillCaption(near);
  capShown = onPane && near === capFor ? v : 0;
  show(cap, capShown);
  show(talk, near === LAST ? v : 0);
  const at = Math.round(sCam);
  if (at !== current) {
    current = at;
    dashButtons.forEach((b, i) => { if (i === at) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
    walk.style.setProperty('--tone', STOPS[at].pane ? STOPS[at].pane.def.tone : 'var(--ink)');
    $('#prev').disabled = at === 0;
    $('#next').disabled = at === LAST;
  }
}

/* ───────── Pointing and tapping ───────── */
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const hits = panes.map((p) => p.hit);
const pointer = { x: 0, y: 0, nx: 0, ny: 0, sx: 0, sy: 0, seen: false };
let hovered = null;
const tip = $('#tip'), tipText = tip.querySelector('.tip-text');
const overUI = (el) => el && el.closest && el.closest('a, button, .cap, .talk, .walk, .bar, .intro');

function pick(x, y) {
  ndc.set(x / view.w * 2 - 1, -(y / view.h) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(hits, false)[0];
  return hit ? panes.find((p) => p.hit === hit.object) : null;
}
function stopOf(pane) { return panes.indexOf(pane) + 1; }
function atStop(pane) { return Math.abs(sCam - stopOf(pane)) < .2; }
function open(p) {
  if (p.external) window.open(p.href, '_blank', 'noopener');
  else location.href = p.href;
}

addEventListener('pointermove', (e) => {
  pointer.x = e.clientX; pointer.y = e.clientY; pointer.seen = true;
  pointer.nx = clamp(e.clientX / view.w * 2 - 1, -1, 1);
  pointer.ny = clamp(e.clientY / view.h * 2 - 1, -1, 1);
  if (!fine) return;
  hovered = overUI(e.target) ? null : pick(e.clientX, e.clientY);
  document.body.classList.toggle('is-pointing', !!hovered);
  if (hovered) {
    tipText.textContent = atStop(hovered) ? verb(hovered.def) : hovered.def.name;
    tip.classList.toggle('is-out', atStop(hovered) && !!hovered.def.external);
    tip.classList.add('is-on');
  } else tip.classList.remove('is-on');
}, { passive: true });
root.addEventListener('pointerleave', () => { hovered = null; tip.classList.remove('is-on'); document.body.classList.remove('is-pointing'); });

let down = null;
addEventListener('pointerdown', (e) => { down = overUI(e.target) ? null : { x: e.clientX, y: e.clientY, t: performance.now() }; }, { passive: true });
addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10 || performance.now() - down.t > 700) return;
  down = null;
  const pane = pick(e.clientX, e.clientY);
  if (!pane) return;
  if (atStop(pane)) open(pane.def); else go(stopOf(pane));
});

addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  const onControl = e.target.closest && e.target.closest('a, button, input, textarea');
  const step = { ArrowDown: 1, ArrowRight: 1, PageDown: 1, ArrowUp: -1, ArrowLeft: -1, PageUp: -1 }[e.key]
    ?? (e.key === ' ' && !onControl ? (e.shiftKey ? -1 : 1) : 0);
  if (step) { e.preventDefault(); go(here() + step); }
  else if (e.key === 'Home') { e.preventDefault(); go(0); }
  else if (e.key === 'End') { e.preventDefault(); go(LAST); }
});

// Copy the address, like the homepage
const copyBtn = $('#copy');
copyBtn.addEventListener('click', async () => {
  const label = copyBtn.querySelector('.copy-label');
  try { await navigator.clipboard.writeText(copyBtn.dataset.email); label.textContent = 'Copied'; copyBtn.classList.add('is-copied'); }
  catch (e) { location.href = `mailto:${copyBtn.dataset.email}`; return; }
  setTimeout(() => { label.textContent = 'Copy'; copyBtn.classList.remove('is-copied'); }, 1800);
});

/* ───────── Daylight and eclipse ───────── */
const themeBtn = $('#theme');
const metaTheme = document.querySelector('meta[name="theme-color"]');
function applyTheme(on) {
  dark = on;
  if (on) root.dataset.theme = 'dark'; else delete root.dataset.theme;
  const t = THEME[on ? 'dark' : 'light'];
  shared.uFogColor.value.copy(rgb(t.horizon));
  sky.theme(t);
  eclipse.theme(t, on);
  ground.theme(t, on);
  headline.theme(t);
  panes.forEach((p) => p.theme(t, on));
  themeBtn.setAttribute('aria-pressed', String(on));
  themeBtn.setAttribute('aria-label', on ? 'Switch to light mode' : 'Switch to dark mode');
  metaTheme.setAttribute('content', on ? '#05070b' : '#ffffff');
}
themeBtn.addEventListener('click', (e) => {
  const next = !dark;
  const r = themeBtn.getBoundingClientRect();
  root.style.setProperty('--vx', `${e.clientX || r.left + r.width / 2}px`);
  root.style.setProperty('--vy', `${e.clientY || r.top + r.height / 2}px`);
  const swap = () => {
    applyTheme(next);
    try { localStorage.setItem('theme', next ? 'dark' : 'light'); } catch (err) {}
    frame(performance.now(), true);
  };
  if (!document.startViewTransition || reduced) { swap(); return; }
  root.classList.add('theme-switching');
  document.startViewTransition(swap).finished.finally(() => root.classList.remove('theme-switching'));
});

/* ───────── Heart Health plays its recording when you're near it ───────── */
const heartPane = panes.find((p) => p.heart);
function heartTick(dt) {
  if (!heartPane) return;
  const h = heartPane.heart;
  const near = Math.abs(sCam - stopOf(heartPane)) < 1.1 && !reduced;
  if (near !== h.want) {
    h.want = near;
    if (near) {
      if (!h.started) { h.started = true; h.video.preload = 'auto'; h.video.load(); }
      h.video.play().catch(() => {}); // if it's not allowed to play, the photo's own screen stays
    } else h.video.pause();
  }
  const ready = h.video.readyState >= 2 && !h.video.paused;
  h.on += ((ready ? 1 : 0) - h.on) * (1 - Math.exp(-dt * 4));
  h.screen.uniforms.uOpacity.value = h.on;
}

/* ───────── Frame ───────── */
const right = new V3(), up = new V3(), fwd = new V3(), base = new V3(), b0 = new V3(), b2 = new V3();
let lastT = performance.now(), veilBusy = false;

function follow(dt) {
  if (reduced) {
    // No gliding: land on the nearest stop, with a quick fade between them
    const r = Math.round(sFromY(yTarget));
    if (r !== shown && !veilBusy) {
      veilBusy = true;
      veil.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 110, fill: 'forwards' }).finished.then(() => {
        shown = r;
        veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }).finished.then(() => { veilBusy = false; });
      });
    }
    cam.y = stopY[shown]; cam.v = 0;
    return;
  }
  spring(lead, yTarget, dt, PRE);
  spring(cam, lead.y, dt, OMEGA);
  if (Math.abs(cam.y - yTarget) < .01 && Math.abs(cam.v) < .5 && Math.abs(lead.v) < .5) { cam.y = lead.y = yTarget; cam.v = lead.v = 0; }
}

// Lean a little into the bends, more the faster it's going (none at rest, so a pane never sits crooked)
function bank(dt, a, speed) {
  const { curve, total } = path;
  curve.getPointAt(clamp((a - 2.5) / total, 0, 1), b0);
  curve.getPointAt(clamp((a + 2.5) / total, 0, 1), b2);
  const ux = base.x - b0.x, uz = base.z - b0.z, vx = b2.x - base.x, vz = b2.z - base.z;
  const L = Math.hypot(ux, uz) * Math.hypot(vx, vz) * Math.hypot(b2.x - b0.x, b2.z - b0.z);
  const kappa = L > 1e-6 ? 2 * (uz * vx - ux * vz) / L : 0; // signed curvature of the path, positive bending left
  const want = clamp(speed * speed * kappa * .006, -.035, .035);
  cam.roll += (want - cam.roll) * (1 - Math.exp(-dt / .18));
  return cam.roll;
}

function frame(now, force = false) {
  const dt = force ? 0 : Math.min((now - lastT) / 1000, 1 / 15);
  lastT = now;
  settleCheck(now);
  clock = now;
  if (anim && !reduced) stepGlide(now); else follow(dt);
  sCam = sFromY(cam.y);
  const speed = (arcAt(cam.y + 2) - arcAt(cam.y - 2)) / 4 * cam.v; // metres a second along the path
  cam.attend += (1 / (1 + (speed / 14) ** 2) - cam.attend) * (1 - Math.exp(-dt / .12));

  const p = poseAtY(cam.y, cam.attend);
  base.copy(p.eye);
  camera.position.copy(p.eye);
  camera.up.set(0, 1, 0);
  camera.lookAt(p.target);
  // A little life: the view drifts, and on a desktop it leans with the pointer
  if (!reduced) {
    cam.breath += dt;
    pointer.sx += ((fine && pointer.seen ? pointer.nx : 0) - pointer.sx) * (1 - Math.exp(-dt * 3));
    pointer.sy += ((fine && pointer.seen ? pointer.ny : 0) - pointer.sy) * (1 - Math.exp(-dt * 3));
    camera.matrixWorld.extractBasis(right, up, fwd);
    const k = 1 + p.eye.y * .02;
    camera.position.addScaledVector(right, (pointer.sx * .2 + Math.sin(cam.breath * .23) * .05) * k);
    camera.position.addScaledVector(up, (-pointer.sy * .1 + Math.sin(cam.breath * .31) * .035) * k);
    camera.lookAt(p.target);
    camera.rotateZ(bank(dt, p.arc, speed));
  }
  camera.fov = p.fov;
  camera.setViewOffset(view.w, view.h, -p.kx / 2 * view.w, p.ky / 2 * view.h, view.w, view.h);
  sky.follow(camera);
  ground.follow(camera);
  shared.uSpin.value = reduced ? 0 : now / 1000 / 90; // one turn every ninety seconds, like the homepage

  // Which stop we're at, and how settled
  const near = Math.round(sCam);
  const v = band(Math.abs(sCam - near), .05, near === LAST ? .3 : .24);
  panes.forEach((pane, k) => {
    pane.tick(dt, near === k + 1 ? v : 0, hovered === pane ? 1 : 0);
    ground.uniforms.uPaneK.value[k].y = .6 + .4 * pane.state.hot;
  });
  // Far things first, so the light behind each pane blends over what's beyond it
  const order = panes.map((pane) => [pane, pane.group.position.distanceToSquared(camera.position)]);
  order.push([{ group: head }, headline.mesh.position.distanceToSquared(camera.position)]);
  order.sort((a, b) => b[1] - a[1]).forEach(([o], k) => { o.group.renderOrder = k + 1; });
  // The headline thins out as you come down under it
  headline.uniforms.uOpacity.value = band(sCam, .25, .8);
  heartTick(dt);
  hud(near, v);

  if (hovered && fine && pointer.seen) tip.style.transform = `translate3d(${pointer.x + 14}px, ${pointer.y - 40}px, 0)`;
  renderer.render(scene, camera);
}

/* ───────── Start ───────── */
applyTheme(dark);
measure();
cam.y = lead.y = yTarget; cam.v = lead.v = 0; shown = landed = Math.round(sFromY(yTarget));
if (reduced) cam.y = stopY[shown];
// Upload everything before the first frame so nothing hitches on the way
scene.traverse((o) => {
  const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
  for (const m of mats) for (const u of Object.values(m.uniforms || {})) if (u.value && u.value.isTexture && !u.value.isVideoTexture) renderer.initTexture(u.value);
});
try { await renderer.compileAsync(scene, camera); } catch (e) { /* compiles on first render instead */ }
frame(performance.now(), true);
const loop = (t) => frame(t);
renderer.setAnimationLoop(loop);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { renderer.setAnimationLoop(null); if (heartPane) { heartPane.heart.video.pause(); heartPane.heart.want = false; } }
  else { lastT = performance.now(); renderer.setAnimationLoop(loop); }
});
requestAnimationFrame(() => {
  $('#loader').classList.add('is-done');
  root.dataset.ready = '1';
  // Then, quietly, the pictures for the other theme
  setTimeout(async () => {
    for (const pane of panes) for (const t of await pane.preload()) renderer.initTexture(t);
  }, 1200);
});

// For the screenshot tool and the console (and a way to step frames by hand when testing motion)
window.__world = {
  THREE, scene, camera, renderer, panes, STOPS,
  jump(s) {
    s = clamp(s, 0, LAST); anim = null; settled = true;
    toScroll(yFromS(s)); cam.y = lead.y = yTarget; cam.v = lead.v = 0; cam.roll = 0; cam.attend = 1; shown = landed = Math.round(s);
    frame(performance.now(), true);
    return { s, y: window.scrollY };
  },
  go, get s() { return sCam; }, get cam() { return { ...cam }; }, get stopY() { return stopY.slice(); }, get clock() { return clock; },
  pause() { renderer.setAnimationLoop(null); }, resume() { lastT = performance.now(); renderer.setAnimationLoop(loop); },
  frame, get arcs() { return path.arc.slice(); },
};

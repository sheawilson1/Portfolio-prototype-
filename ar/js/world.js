// Walk through it: the homepage as a place you move through. The page scrolls a tall, empty track and the camera
// follows a path through the world: from high over the headline and the disc, down to eye level past each pane of
// work, and on to the disc itself, where the page ends the way the homepage does.
import * as THREE from '../vendor/three/three.module.js';
import { fontsReady } from './kit.js';
import { THEME, TEX, MOTION, shared, rgb, DISC, buildSky, buildGround, buildEclipse, buildType, buildPane, placeWorks, pathX } from './world-scene.js';
import { createLab } from './world-lab.js';
import { createSound } from './world-sound.js';

const q = new URLSearchParams(location.search);
const root = document.documentElement;
const $ = (s) => document.querySelector(s);
const reduced = q.has('reduced') || matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const smoothstep = (a, b, x) => smooth(clamp((x - a) / (b - a), 0, 1));
const band = (x, a, b) => 1 - smooth(clamp((x - a) / (b - a), 0, 1));
const D2R = Math.PI / 180;
const V3 = THREE.Vector3;

let dark = q.has('theme') ? q.get('theme') === 'dark' : root.dataset.theme === 'dark';
if (dark) root.dataset.theme = 'dark'; else delete root.dataset.theme;
MOTION.on = !reduced;

// The lab's choices (what's live, unless the lab is on and says otherwise), and sound to go with them
const sound = createSound();
const lab = createLab({ onChange: (k, v) => labChange(k, v), onTap: () => sound.wake() });
const opts = lab.settings;
if (reduced) lab.lock('motion', 'Reduced motion is on, so it steps from stop to stop with a fade whichever you pick.');
let ready = false; // (the lab's switches wait for the world to exist)
const openCards = () => opts.card === 'open';
const glassLock = () => { if (openCards()) lab.lock('glass', 'Open cards have no glass. Pick another card to try these.'); else lab.unlock('glass'); };
glassLock();
// someone trying it in the lab chose to hear it, so on an iPhone it plays even with the ringer switch off
sound.session(lab.on ? 'playback' : 'ambient');

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
const buildPanes = (card) => Promise.all(placeWorks(card).map((p) => buildPane(p, dark, opts.glass)));
const built = { card: opts.card, glass: opts.glass }; // (anything flipped in the lab while it loads is caught up at the start)
let panes = await buildPanes(opts.card);
const sky = buildSky();
const eclipse = buildEclipse();
const ground = buildGround(panes);
ground.setPanes(panes);
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

/* ───────── Motion, picked in the lab ───────── */
// glide   what's live: a swipe, a key or a tap is one stop, and the camera flies a gentle arc to it (see Flights)
// swoop, sweep, dive: the same, each on its own more dramatic curve
// spring  the first live version: two springs follow the scroll, then it rolls on to a stop
// With reduced motion it's always spring, which then lands on stops with a fade and never glides.
const FLIGHTS = ['glide', 'swoop', 'sweep', 'dive'];
const PACE = { brisk: .8, steady: 1, slow: 1.3 };
let motion = reduced ? 'spring' : opts.motion;
const flies = () => FLIGHTS.includes(motion);
const steps = () => motion !== 'spring' && !reduced;

// How the words about each project are shown: phones keep the caption as it is, whatever the lab says
const info = () => (view.portrait || view.w <= 700 ? 'corner' : opts.info);

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

// A camera at eye that looks up just far enough that the top of the disc sits at apex on screen (-1 bottom, 1 top),
// the way the homepage shows it: low in the frame, the sky above it for the words
function skyward(eye, fov, apex) {
  const top = Math.atan2(DISC.y + DISC.r - eye.y, eye.z - DISC.z);
  const pitch = top - Math.atan(apex * Math.tan(fov * D2R / 2));
  return { pitch, focus: eye.clone().add(new V3(0, Math.sin(pitch), -Math.cos(pitch)).multiplyScalar(eye.z - DISC.z)) };
}

function buildPath() {
  const { w, h } = view;
  const aspect = w / h;
  const portrait = view.portrait = aspect < .9;
  // How tall a screen it is, from a phone held upright (0) to a wide desktop (1)
  const wide = clamp((aspect - .46) / (1.2 - .46), 0, 1);
  const walkFov = portrait ? lerp(46, 60, clamp((.9 - aspect) / .45, 0, 1)) : 38;
  const tv = Math.tan(walkFov * D2R / 2), th = tv * aspect;
  const stops = [], mids = [];

  // The opening: a long lens from high over the path. On the disc (live): the disc fills the frame from the horizon
  // up and the headline hangs in front of its face, the intro under it. Above it: the camera looks up a little, so
  // the eclipse sits low like the homepage's and the headline hangs in the sky over it.
  const startFov = lerp(22, 19, wide);
  const eye0 = new V3(0, 15, 30);
  const t0 = Math.tan(startFov * D2R / 2);
  const D = 56; // headline distance from the opening eye
  const hw = lerp(.84, h < 520 ? .36 : .42, wide) * 2 * D * t0 * aspect;
  const scale = hw / headline.width;
  const halfH = headline.height * scale / 2 / D / t0; // in NDC
  headline.mesh.scale.setScalar(scale);
  let cy;
  if (opts.opening === 'sky') {
    const { pitch, focus } = skyward(eye0, startFov, portrait ? -.36 : -.3);
    stops.push(stopPose(eye0, focus, 0, 0, startFov));
    cy = portrait ? .5 : lerp(.46, .44, wide);
    // on the camera's own axis, turned to face it
    const up = Math.atan(cy * t0);
    headline.mesh.position.copy(eye0).add(new V3(0, Math.sin(pitch + up), -Math.cos(pitch + up)).multiplyScalar(D / Math.cos(up)));
    headline.mesh.rotation.x = pitch;
  } else {
    const ky0 = lerp(-.64, -.66, wide);
    stops.push(stopPose(eye0, new V3(0, 15, -100), 0, ky0, startFov));
    cy = lerp(0, -.04, wide);
    headline.mesh.position.set(0, eye0.y + D * (cy - ky0) * t0, eye0.z - D);
    headline.mesh.rotation.x = 0;
  }
  view.introTop = (1 - (cy - halfH * .78)) / 2 * 100 + (portrait ? 2.6 : 2.2);

  // On an upright screen the caption sits under the pane, so each pane is framed into the room above its caption.
  // Close (in the lab) brings the camera in, so the pane fills more of a wide screen.
  const capH = portrait ? captionHeights() : [];
  const capBottom = parseFloat(getComputedStyle(cap).bottom) || 90;
  const topSafe = 74;
  const close = info() === 'close';

  panes.forEach((pane, i) => {
    const { w: pw, h: ph, main } = pane.def;
    let fillH = main ? .6 : .5, fillW = .44, kyStop = .02, kx = pane.side * .4;
    if (portrait) {
      const room = Math.max(h - capBottom - capH[i + 1] - topSafe - 18, h * .2);
      fillH = room / h * (main ? .9 : .78);
      fillW = main ? .9 : .74;
      kyStop = 1 - 2 * (topSafe + room / 2) / h;
      kx = 0;
    } else if (h < 520) {
      fillH = main ? .66 : .56; // a short landscape screen: the caption is compact, the pane can be taller
    }
    if (close && !portrait) { fillH = main ? .78 : .68; fillW = .56; kx = pane.side * .46; kyStop = .05; }
    const d = Math.max(ph / fillH / (2 * tv), pw / fillW / (2 * th));
    const focus = pane.centre.clone(); focus.y = ph * .47;
    // eye level, or just under the top of a shorter frame, so frames further back never show over its edge
    const eyeY = Math.min(EYE, ph - .12);
    // stand a little back along the path, so the way on shows beside it; on a wide screen, far enough round
    // that a slice of the next pane shows at the far edge, to see where it goes next and tap it
    let a = pane.yaw + pane.side * .2;
    if (!portrait && panes[i + 1]) a = peekAngle(pane, panes[i + 1], focus, d, eyeY, kx, kyStop, walkFov, a);
    const eye = focus.clone().addScaledVector(new V3(Math.sin(a), 0, Math.cos(a)), d);
    eye.y = eyeY;
    // Between stops the path runs down the middle of the way, so it weaves from one side to the other
    const prev = stops[stops.length - 1];
    const mz = (prev.eye.z + eye.z) / 2;
    mids.push(new V3(pathX(mz), i === 0 ? 4.6 : EYE + .05, mz));
    stops.push(stopPose(eye, focus, kx, kyStop, walkFov));
  });

  // The end. On the disc (live): facing it, close enough that it fills the view with the ring round it.
  // Above it: further back and lower, looking up, so the eclipse sits low and "Let's talk." is in the sky.
  // Overview: back at the way in, looking down the whole walk to the eclipse on the horizon.
  const lastEye = stops[stops.length - 1].eye;
  let end, lastMid;
  if (opts.ending === 'sky') {
    const tanH = Math.tan(walkFov * D2R / 2) * aspect;
    const eye = new V3(0, portrait ? 10 : 14, DISC.z + DISC.r / ((portrait ? 1.75 : 1.28) * tanH));
    end = stopPose(eye, skyward(eye, walkFov, portrait ? -.34 : -.3).focus, 0, 0, walkFov, .85);
    lastMid = new V3(pathX(lastEye.z - 30) * .5, 9, lastEye.z - 30);
  } else if (opts.ending === 'overview') {
    // standing back at the way in, a little above eye level, so every pane recedes along the way to the eclipse
    const eye = portrait ? new V3(0, 4.4, 5) : new V3(0, 3.5, -2);
    end = stopPose(eye, new V3(0, portrait ? 2 : 1.7, -60), 0, portrait ? .1 : 0, portrait ? walkFov : 42, .7);
    lastMid = new V3(pathX(lastEye.z + 8) * .5, 9, lastEye.z + 8);
  } else {
    const dz = portrait ? 150 : 240;
    const ey = portrait ? 50 : 45;
    end = stopPose(new V3(0, ey, DISC.z + dz), new V3(0, ey, DISC.z), 0, 0, walkFov, .85); // the disc draws the eye most of the way there
    lastMid = new V3(pathX(lastEye.z - 30) * .5, 12, lastEye.z - 30);
  }
  mids.push(lastMid);
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

// Where a pane's pictures are on screen for a camera, in NDC
const corner = new V3();
function ndcBox(pane, cam) {
  const b = pane.box;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]]) {
    pane.group.localToWorld(corner.set(x, y, 0)).project(cam);
    x0 = Math.min(x0, corner.x); x1 = Math.max(x1, corner.x); y0 = Math.min(y0, corner.y); y1 = Math.max(y1, corner.y);
  }
  return { x0, x1, y0, y1 };
}
// How far round its pane a stop stands, so the next pane's near edge is PEEK of the screen in from the far side
// (it tries from looking square on to well along the path, keeping the pane itself whole, and stays near a0)
const PEEK = .13;
const peekCam = new THREE.PerspectiveCamera();
function peekAngle(pane, next, focus, d, eyeY, kx, ky, fov, a0) {
  peekCam.fov = fov; peekCam.aspect = view.w / view.h; peekCam.near = .2; peekCam.far = 5000;
  peekCam.setViewOffset(view.w, view.h, -kx / 2 * view.w, ky / 2 * view.h, view.w, view.h);
  pane.group.updateMatrixWorld(true); next.group.updateMatrixWorld(true);
  const want = pane.side > 0 ? -1 + 2 * PEEK : 1 - 2 * PEEK;
  let best = a0, bestErr = Infinity, bestMiss = Infinity;
  for (let k = 0; k <= 28; k++) {
    const a = pane.yaw + pane.side * k * .025;
    peekCam.position.copy(focus).addScaledVector(new V3(Math.sin(a), 0, Math.cos(a)), d);
    peekCam.position.y = eyeY;
    peekCam.lookAt(focus);
    peekCam.updateMatrixWorld();
    const own = ndcBox(pane, peekCam), nb = ndcBox(next, peekCam);
    if (own.x0 < -.97 || own.x1 > .97) continue;
    const miss = Math.abs((pane.side > 0 ? nb.x1 : nb.x0) - want), err = miss + Math.abs(a - a0) * .2;
    if (err < bestErr) { bestErr = err; best = a; bestMiss = miss; }
  }
  // if no angle gets the next pane to the edge (JumpStart, whose wide pane would be cut), turning round only
  // leaves you looking past this one: keep the ordinary view, where the next pane shows further in
  return bestMiss > .25 ? a0 : best;
}

// Where "Let's talk." goes at the end. On the disc: on its face, between the top of the disc and where its base starts
// to sink into the haze. Above it: in the sky over the eclipse. Overview: over the far end of the world, above the
// panes. Scaled down if a short screen doesn't have the room.
const fitCam = new THREE.PerspectiveCamera();
function fitTalk(end) {
  fitCam.fov = end.fov; fitCam.aspect = view.w / view.h; fitCam.near = .2; fitCam.far = 5000;
  fitCam.position.copy(end.eye);
  fitCam.lookAt(end.focus);
  fitCam.setViewOffset(view.w, view.h, -end.kx / 2 * view.w, end.ky / 2 * view.h, view.w, view.h);
  fitCam.updateMatrixWorld();
  const toY = (y) => (1 - new V3(0, y, DISC.z).project(fitCam).y) / 2 * view.h;
  let top, base;
  if (opts.ending === 'face') { top = Math.max(toY(DISC.y + DISC.r), 64); base = Math.min(toY(12), view.h - 90); }
  else if (opts.ending === 'sky') { top = 70; base = Math.min(toY(DISC.y + DISC.r) - 24, view.h - 90); }
  else { top = 70; base = Math.max(Math.min(toY(12) + 30, view.h * .46), top + 200); }
  const room = base - top;
  const k = clamp(room * .9 / Math.max(talk.offsetHeight, 1), .6, 1);
  talk.style.top = `${((top + base) / 2).toFixed(1)}px`;
  talk.style.scale = k.toFixed(3);
}

// How much scrolling each stretch takes, from how long it is: roughly steady metres per scroll, so passing a
// stop is a gentle ease rather than a brake, compressed a little so the long flight to the disc isn't endless
function setSegments() {
  const a = path.arc;
  sections.forEach((el, i) => el.style.setProperty('--len', i < LAST ? clamp(.28 * Math.sqrt(Math.abs(a[i + 1] - a[i])), .78, 3.2).toFixed(3) : '1'));
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
  const i = segAt(y), h = Math.max(stopY[i + 1] - stopY[i], 1e-3), t = (y - stopY[i]) / h, t2 = t * t, t3 = t2 * t;
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
  const i = segAt(yy), f = clamp((yy - stopY[i]) / Math.max(stopY[i + 1] - stopY[i], 1e-3), 0, 1);
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
  for (let i = 0; i < LAST; i++) if (y < stopY[i + 1]) return i + (y - stopY[i]) / Math.max(stopY[i + 1] - stopY[i], 1e-3);
  return LAST;
}
function yFromS(s) {
  if (s >= LAST) return stopY[LAST];
  const i = Math.max(0, Math.floor(s));
  return stopY[i] + (s - i) * (stopY[i + 1] - stopY[i]);
}
// The camera's place in the scroll, and how fast it's moving through it (px, px/s, px/s²), followed by a spring
const cam = { y: 0, v: 0, a: 0, breath: 0, roll: 0, attend: 1 };
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
    lastInput = performance.now(); settled = false; anim = null; expectY = -1;
  }
  lastY = y;
  readScroll();
}, { passive: true });
// Someone's hands are on it: whatever glide was running stops, and it settles again once they let go.
// (The first live version stopped the glide without asking to settle again, so a stray flick or a tap could
// leave the camera parked between two stops.)
function handsOn() { lastInput = performance.now(); settled = false; anim = null; }
addEventListener('touchstart', () => { touching = true; if (!steps()) handsOn(); }, { passive: true });
addEventListener('touchend', () => { touching = false; lastInput = performance.now(); }, { passive: true });
addEventListener('touchcancel', () => { touching = false; lastInput = performance.now(); }, { passive: true });
addEventListener('wheel', (e) => { if (!lab.isOver(e.target) && !steps()) handsOn(); }, { passive: true });

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
  // what's pushing it this instant: the glide it's already on, or the springs
  const acc = anim ? cam.a : OMEGA * OMEGA * (lead.y - cam.y) - 2 * OMEGA * v;
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
  const a = anim, t = clamp((now - a.t0) / a.T, 0, 1), t2 = t * t, t3 = t2 * t, t4 = t3 * t, t5 = t4 * t, T = a.T / 1000;
  // quintic Hermite: start position, speed and acceleration; rest at the stop with no acceleration left
  const h0 = 1 - 10 * t3 + 15 * t4 - 6 * t5, h1 = t - 6 * t3 + 8 * t4 - 3 * t5, h2 = .5 * t2 - 1.5 * t3 + 1.5 * t4 - .5 * t5, h5 = 10 * t3 - 15 * t4 + 6 * t5;
  const d0 = -30 * t2 + 60 * t3 - 30 * t4, d1 = 1 - 18 * t2 + 32 * t3 - 15 * t4, d2 = t - 4.5 * t2 + 6 * t3 - 2.5 * t4;
  const e0 = -60 * t + 180 * t2 - 120 * t3, e1 = -36 * t + 96 * t2 - 60 * t3, e2 = 1 - 9 * t + 18 * t2 - 10 * t3;
  cam.y = h0 * a.y0 + h1 * a.m0 + h2 * a.A0 + h5 * a.y1;
  cam.v = (d0 * a.y0 + d1 * a.m0 + d2 * a.A0 - d0 * a.y1) / T;
  cam.a = (e0 * a.y0 + e1 * a.m0 + e2 * a.A0 - e0 * a.y1) / (T * T); // so a new glide can start from it without a jolt
  toScroll(cam.y);
  lead.y = cam.y; lead.v = cam.v; // if someone takes over mid-glide, the springs carry on from here
  if (t >= 1) { cam.y = lead.y = a.y1; cam.v = lead.v = cam.a = 0; landed = a.i; anim = null; toScroll(a.y1); }
}

// Once the scrolling stops (and any fling has run out), it goes to a stop. Spring carries on to the next stop
// the way it was going, and a small overshoot past a stop falls back to it. The others go to the nearest (they
// only get here if someone drags the scroll bar). With reduced motion it lands on a stop straight away.
function settleCheck(now) {
  if (settled || anim || flight || touching || now - lastInput < (reduced ? 90 : 160)) return;
  settled = true;
  const y = window.scrollY;
  const i = Math.min(Math.floor(sFromY(y)), LAST - 1), f = clamp((y - stopY[i]) / Math.max(stopY[i + 1] - stopY[i], 1e-3), 0, 1);
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
  if (motion !== 'spring') target = f < .5 ? i : i + 1;
  else if (f < .02) target = i; else if (f > .98) target = i + 1;
  else if (dir > 0) target = f < .12 ? i : i + 1;
  else target = f > .88 ? i + 1 : i;
  if (Math.abs(stopY[target] - y) < 1) { landed = target; return; } // the page is already there: the springs finish it
  glideOrLand(target, clamp(.45 + .75 * Math.abs(sFromY(stopY[target]) - sFromY(cam.y)), .5, 1.25));
}

/* ───────── Flights: a swipe means "take me to the next one" ───────── */
// Swoop, Sweep and Dive don't follow the path: each flies its own curve from wherever the camera is to the stop,
// and turns to look at it on the way, so how far anyone scrolls never decides how far they go. A new swipe
// mid-flight sets off again from where it is, at the speed it's already going, so nothing jolts. Tapping a dash
// or a pane further off flies straight there.
// A timing curve like CSS's cubic-bezier()
function bezierEase(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t, dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let k = 0; k < 8; k++) { const e = X(t) - x, d = dX(t); if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break; t -= e / d; }
    if (Math.abs(X(t) - x) > 1e-4) { let lo = 0, hi = 1; for (let k = 0; k < 30; k++) { t = (lo + hi) / 2; if (X(t) < x) lo = t; else hi = t; } }
    return ((ay * t + by) * t + cy) * t;
  };
}
const STYLE = {
  glide: { ease: bezierEase(.45, 0, .22, 1), time: (L) => clamp(1.35 + .1 * Math.sqrt(L), 1.65, 2.8) },
  swoop: { ease: bezierEase(.55, 0, .16, 1), time: (L) => clamp(1.45 + .14 * Math.sqrt(L), 1.8, 3.2) },
  sweep: { ease: bezierEase(.5, 0, .2, 1), time: (L) => clamp(1.55 + .14 * Math.sqrt(L), 1.9, 3.3) },
  dive: { ease: bezierEase(.62, 0, .14, 1), time: (L) => clamp(1.8 + .16 * Math.sqrt(L), 2.2, 3.6) },
};
const UP = new V3(0, 1, 0);
let flight = null, pendingTo = null;
const pose = { eye: new V3(), target: new V3(), kx: 0, ky: 0, fov: 38 }; // where the camera was last put (before its drift)
const h1q = (t) => t - 6 * t ** 3 + 8 * t ** 4 - 3 * t ** 5; // leaves at speed 1, arrives at rest
const glideTurn = (t) => smoothstep(0, .8, t);

function fly(i) {
  i = clamp(Math.round(i), 0, LAST);
  const now = clock; // the time of the frame the camera was last put for, so the new flight starts exactly there
  if (!flight && i === landed && Math.abs(cam.y - stopY[i]) < 1) return;
  if (flight && flight.to === i) { pendingTo = null; return; }
  // clicks in quick succession are gathered up: the camera sets off once for where they add up to, not once per click
  if (flight && now - flight.t0 < 260) { pendingTo = i; return; }
  pendingTo = null;
  const A = { eye: pose.eye.clone(), target: pose.target.clone(), kx: pose.kx, ky: pose.ky, fov: pose.fov };
  const v0 = new V3(), vt0 = new V3();
  // already flying: carry on from how it's moving (where it looks moves with the eye, so only its own turn is added)
  if (flight) { flightVelocity(flight, now, v0, vt0); vt0.sub(v0); }
  const B = path.stops[i];
  const L = A.eye.distanceTo(B.eye);
  const style = STYLE[motion];
  const f = {
    style: motion, ease: style.ease, T: style.time(L) * (PACE[opts.pace] || 1) * 1000, t0: now, to: i, B, A, L, v0, vt0, u: 0,
    from: flight ? (flight.u < .5 ? flight.from : flight.to) : landed, midAir: !!flight,
    dirA: new V3().subVectors(A.target, A.eye).normalize(), distA: A.target.distanceTo(A.eye), distB: B.focus.distanceTo(B.eye),
  };
  const a = A.eye, b = B.eye, d = new V3().subVectors(b, a);
  const inB = new V3().subVectors(B.focus, b).normalize(); // the way it looks once it's there
  if (motion === 'glide') {
    // a gentle arc at eye height, bowed a little towards the middle of the way: it eases back from the pane it's
    // leaving (never brushing past it), travels, and pushes in towards the next along the way it'll look at it
    const m = new V3().lerpVectors(a, b, .5);
    const bow = new V3(clamp((pathX(m.z) - m.x) * .45, -1.6, 1.6), 0, 0);
    const k = clamp(.3 * L, 1, 4.5);
    const back = !flight && STOPS[f.from].pane ? f.dirA.clone().setY(0).normalize().multiplyScalar(-k) : new V3();
    // past more than one pane it rises over the ones between, and comes down into the last
    const over = Math.abs(i - f.from) > 1 ? new V3(0, clamp(1.4 + .06 * L, 2.6, 6), 0) : new V3();
    f.c1 = a.clone().addScaledVector(d, .26).add(bow).add(back).add(over);
    // going on, it pushes in towards the next pane; going back, it comes in from the far side of the way,
    // clear of the pane it's returning to
    const into = i > f.from ? inB.clone().setY(0).normalize().multiplyScalar(-k)
      : new V3(STOPS[i].pane ? -STOPS[i].pane.side * clamp(.1 * L, .5, 1.6) : 0, 0, 0);
    f.c2 = b.clone().addScaledVector(d, -.22).add(into).add(bow).add(over);
    // it turns from how it was looking to how it'll look there, evenly, rather than chasing the pane
    f.dirB = inB.clone();
  } else if (motion === 'swoop') {
    // up over the way, turning early to the next pane, then down into its frame along the way it'll look
    const h = clamp(1 + .16 * L, 1.6, 9);
    f.c1 = a.clone().addScaledVector(d, .3).addScaledVector(UP, h);
    f.c2 = b.clone().addScaledVector(inB, -.26 * L).addScaledVector(UP, h * .6);
  } else if (motion === 'dive') {
    // high enough to see the way ahead, looking down at it, then down to the pane
    const h = clamp(3 + .34 * L, 6, 28);
    const inA = f.dirA.clone().setY(0).normalize();
    f.c1 = a.clone().addScaledVector(inA, -.1 * L).addScaledVector(UP, h);
    f.c2 = b.clone().addScaledVector(inB, -.34 * L).addScaledVector(UP, h * .7);
    // (a point on the floor a little past the pane, so it's always ahead and never swings past underneath)
    f.mid = new V3().lerpVectors(a, b, 1.25).setY(0);
  } else {
    // round the pane it's going to, keeping it in view, in a wide arc that rises a little in the middle
    const c = B.focus;
    f.c = c;
    f.r0 = Math.hypot(a.x - c.x, a.z - c.z); f.r1 = Math.hypot(b.x - c.x, b.z - c.z);
    f.th0 = Math.atan2(a.x - c.x, a.z - c.z);
    let dth = Math.atan2(b.x - c.x, b.z - c.z) - f.th0;
    dth = Math.atan2(Math.sin(dth), Math.cos(dth));
    f.dth = dth;
    // if it would barely turn, it swings out anyway, towards the middle of the way
    const toward = Math.sign(dth) || -(STOPS[i].pane ? STOPS[i].pane.side : 1);
    // (never more than a third of the way across, however far off the thing it circles is)
    f.swing = toward * Math.min(Math.max(0, .62 - Math.abs(dth)), .3 * L / Math.max(f.r0, f.r1, 1));
    f.bulge = Math.min(.12 * L, 4);
    f.lift = clamp(.4 + .07 * L, .6, 6);
  }
  flight = f;
  settled = true; anim = null; cutTo = null;
  // the page waits at the stop; the camera catches up
  toScroll(stopY[i]);
}

const fe = new V3(), fl = new V3(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), dirTmp = new V3(), dirMid = new V3();
// Where a flight has the camera at time t (0 to 1): the eye, where it looks, and its lens
function flightPose(f, t, out) {
  const u = f.ease(t);
  const a = f.A.eye, b = f.B.eye;
  if (f.c1) {
    const k = 1 - u;
    out.eye.copy(a).multiplyScalar(k * k * k).addScaledVector(f.c1, 3 * k * k * u).addScaledVector(f.c2, 3 * k * u * u).addScaledVector(b, u * u * u);
  } else {
    const th = f.th0 + f.dth * u + f.swing * Math.sin(Math.PI * u);
    const r = lerp(f.r0, f.r1, u) + f.bulge * Math.sin(Math.PI * u);
    out.eye.set(f.c.x + Math.sin(th) * r, lerp(a.y, b.y, u) + f.lift * Math.sin(Math.PI * u), f.c.z + Math.cos(th) * r);
  }
  // already moving when it set off: that speed carries on and dies away through the flight
  if (f.midAir) out.eye.addScaledVector(f.v0, f.T / 1000 * h1q(t));
  // Where it looks: from the way it was looking to the pane it's going to, turning early
  const toB = f.dirB ? dirTmp.copy(f.dirB) : dirTmp.subVectors(f.B.focus, out.eye).normalize();
  let dir;
  if (f.style === 'dive') {
    dirMid.subVectors(f.mid, out.eye).normalize();
    // (looks most of the way down at the route, never straight down)
    const w1 = .7 * smoothstep(0, .45, u), w2 = smoothstep(.38, .96, u);
    qa.setFromUnitVectors(f.dirA, dirMid); qb.identity().slerp(qa, w1);
    dir = fl.copy(f.dirA).applyQuaternion(qb);
    qa.setFromUnitVectors(dir.clone(), toB); qb.identity().slerp(qa, w2);
    dir.applyQuaternion(qb);
  } else {
    // Glide looks first, then moves: it starts turning to the next pane as soon as it sets off, while it's still
    // easing away, and has finished turning just before it lands, so it never looks away or swings round late
    const w = f.style === 'glide' ? glideTurn(t) : f.style === 'sweep' ? smoothstep(0, .62, u) : smoothstep(0, .8, u);
    qa.setFromUnitVectors(f.dirA, toB); qb.identity().slerp(qa, w);
    dir = fl.copy(f.dirA).applyQuaternion(qb);
  }
  // the lens shift, the zoom and how far off it looks move with the turn (for Glide, exactly with it)
  const wl = f.style === 'glide' ? glideTurn(t) : smoothstep(.05, .95, u);
  out.target.copy(out.eye).addScaledVector(dir, lerp(f.distA, f.distB, wl));
  if (f.midAir) out.target.addScaledVector(f.vt0, f.T / 1000 * h1q(t));
  out.kx = lerp(f.A.kx, f.B.kx, wl); out.ky = lerp(f.A.ky, f.B.ky, wl);
  out.fov = lerp(f.A.fov, f.B.fov, wl) + ({ dive: 7, swoop: 2.5, sweep: 1.5 }[f.style] || 0) * Math.sin(Math.PI * u);
  f.u = u;
  return out;
}
const fa = { eye: new V3(), target: new V3() }, fb = { eye: new V3(), target: new V3() };
function flightVelocity(f, now, v, vt) {
  const t = clamp((now - f.t0) / f.T, 0, 1), e = .004, T = f.T / 1000;
  const t1 = Math.max(0, t - e), t2 = Math.min(1, t + e);
  const u = f.u;
  flightPose(f, t1, fa); flightPose(f, t2, fb);
  f.u = u;
  const dt = (t2 - t1) * T || 1;
  v.subVectors(fb.eye, fa.eye).divideScalar(dt);
  vt.subVectors(fb.target, fa.target).divideScalar(dt);
}
// The lean into a turn: how hard it's being pushed sideways
const acc = new V3(), pm = { eye: new V3(), target: new V3() }, pp = { eye: new V3(), target: new V3() };
function flightLean(f, t) {
  const e = .01, T = f.T / 1000, u = f.u;
  const t1 = Math.max(0, t - e), t2 = Math.min(1, t + e);
  flightPose(f, t1, pm); flightPose(f, t2, pp);
  f.u = u;
  // second difference about the current point (P.eye), per second²
  acc.copy(pm.eye).add(pp.eye).addScaledVector(P.eye, -2).divideScalar(((t2 - t1) / 2 * T) ** 2 || 1);
  return f.style === 'glide' ? clamp(-acc.dot(right) * .0015, -.025, .025) : clamp(-acc.dot(right) * .0035, -.07, .07);
}

/* ───────── Steps: a swipe, a key or a tap is one stop ───────── */
// The wheel and touch are caught before the page can scroll. A trackpad flick keeps sending smaller and smaller
// wheel events for a second or more after the fingers leave, so after a step it waits for a pause, or for a
// fresh push on top of the dying one, before it takes another.
const flick = { acc: 0, t: -1e9, a: 0, armed: true, fired: -1e9, y: null, done: false };
let moves = 0; // how many times someone's moved on themselves (the hint stops nudging once they've got it)
function stepWheel(e) {
  if (e.ctrlKey || lab.isOver(e.target)) return; // a trackpad pinch, or scrolling the lab
  e.preventDefault();
  const d = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? view.h : 1);
  const t = e.timeStamp, a = Math.abs(d);
  if (t - flick.t > 240) { flick.armed = true; flick.acc = 0; }
  else if (!flick.armed && t - flick.fired > 450 && a > 20 && a > flick.a * 2.5) { flick.armed = true; flick.acc = 0; }
  flick.t = t; flick.a = a;
  if (!flick.armed || !d) return;
  flick.acc += d;
  if (Math.abs(flick.acc) >= 18) { flick.armed = false; flick.acc = 0; flick.fired = t; moves++; go(here() + Math.sign(d)); }
}
function stepTouchStart(e) {
  flick.y = e.touches.length === 1 && !lab.isOver(e.target) ? e.touches[0].clientY : null;
  flick.done = false;
}
function stepTouchMove(e) {
  if (flick.y === null || e.touches.length !== 1) return;
  e.preventDefault();
  const dy = flick.y - e.touches[0].clientY;
  if (!flick.done && Math.abs(dy) > 28) { flick.done = true; moves++; go(here() + Math.sign(dy)); }
}
let stepOn = false;
function stepInput(on) {
  if (on === stepOn) return;
  stepOn = on;
  const f = on ? addEventListener : removeEventListener;
  f('wheel', stepWheel, { passive: false });
  f('touchstart', stepTouchStart, { passive: true });
  f('touchmove', stepTouchMove, { passive: false });
}

// Keys, buttons and taps. Flights fly straight there. Spring glides along the path, longer for further; across
// more than a couple of stops (Home, End, a far dash) that would be a blur, so it cuts softly through the page
// colour to just short of the stop and glides in.
let cutTo = null;
const glideTime = (n) => clamp(.7 + .45 * n, .8, 2);
function go(i) {
  i = clamp(Math.round(i), 0, LAST);
  if (reduced) { if (Math.abs(stopY[i] - window.scrollY) >= 1) { settled = true; landed = i; toScroll(stopY[i]); } return; }
  if (flies()) { fly(i); return; }
  if (Math.abs(stopY[i] - window.scrollY) < 1 && !anim) return;
  const n = Math.abs(sFromY(stopY[i]) - sFromY(cam.y));
  if (n <= 2.2) { cutTo = null; glideOrLand(i, glideTime(n)); return; }
  if (cutTo !== null) { cutTo = i; return; }
  cutTo = i; anim = null; settled = true;
  veil.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 170, easing: 'ease-in', fill: 'forwards' }).finished.then(() => {
    const k = cutTo, from = sFromY(cam.y);
    cutTo = null;
    cam.y = lead.y = yFromS(clamp(k - Math.sign(k - from) * .45, 0, LAST)); cam.v = lead.v = cam.a = 0; cam.roll = 0;
    toScroll(cam.y);
    glide(k, 1.15);
    veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: 'ease-out', fill: 'forwards' });
  });
}
const here = () => (pendingTo !== null ? pendingTo : flight ? flight.to : cutTo !== null ? cutTo : anim ? anim.i : Math.round(sFromY(window.scrollY)));

/* ───────── Layout ───────── */
function measure(force = false) {
  // innerWidth can include overflow on iOS. Measure the layout viewport instead,
  // and ignore toolbar/visual-viewport events that don't change the scene.
  const w = root.clientWidth, h = stage.clientHeight || window.innerHeight;
  const changed = w !== view.w || Math.abs(h - view.h) > 1;
  if (!changed && !force) return;
  const keep = path && stopY[LAST] > 0 ? sFromY(cam.y) : null;
  const to = flight ? flight.to : null;
  view.w = w; view.h = h;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  buildPath();
  setSegments();
  capFor = -1;
  stopY = sections.map((el) => el.offsetTop);
  buildPacing();
  readScroll();
  if (keep !== null) { cam.y = lead.y = yFromS(keep); cam.v = lead.v = cam.a = 0; }
  if (to !== null) place(to); // a flight's curve was made for the old shape of the screen
}
addEventListener('resize', () => measure());
// Resize events don't always come: styles can arrive after the first measure, and a phone settles its viewport
// late. Once it's running, whenever the stage or the track really changes size, measure again (and if it was at
// rest, put it back on its stop).
let trackH = 0;
function watchSizes() {
  const check = () => {
    const th = track.offsetHeight;
    if (Math.abs(th - trackH) <= 1) { measure(); return; }
    trackH = th;
    measure(true);
    if (!flight && !anim && settled) place(landed);
  };
  const ro = new ResizeObserver(check);
  ro.observe(stage); ro.observe(track);
}
// Put the page and the camera on a stop, at rest
function place(s) {
  s = clamp(Math.round(s), 0, LAST);
  anim = null; cutTo = null; flight = null; pendingTo = null; settled = true;
  toScroll(stopY[s]);
  cam.y = lead.y = yTarget; cam.v = lead.v = cam.a = 0; cam.roll = 0; cam.attend = 1;
  shown = landed = s;
  frame(performance.now(), true);
}

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

// On a computer the intro says the arrow keys work too
if (fine) intro.querySelector('.hint').lastChild.textContent = 'Scroll, or use the arrow keys, to walk through';

const dashes = $('#dashes');
dashes.innerHTML = STOPS.map((s, i) => `<li><button type="button" data-i="${i}" aria-label="${s.name}"></button></li>`).join('');
const dashButtons = [...dashes.querySelectorAll('button')];
dashes.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) go(+b.dataset.i); });
const nextBtn = $('#next'), nextName = nextBtn.querySelector('.next-name');
$('#prev').addEventListener('click', () => go(here() - 1));
nextBtn.addEventListener('click', () => go(here() + 1));
$('#restart').addEventListener('click', () => go(0));

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

// Beside (in the lab): the caption sits next to the pane, wherever the pane is on screen
function besidePane(pane) {
  const n = ndcBox(pane, camera);
  const x0 = (n.x0 + 1) / 2 * view.w, x1 = (n.x1 + 1) / 2 * view.w, y0 = (1 - n.y1) / 2 * view.h, y1 = (1 - n.y0) / 2 * view.h;
  const w = cap.offsetWidth, h = cap.offsetHeight, gap = Math.max(40, view.w * .035);
  const left = (x0 + x1) / 2 > view.w / 2 ? x0 - gap - w : x1 + gap;
  setStyle(cap, 'left', `${clamp(left, 24, view.w - w - 24).toFixed(1)}px`);
  setStyle(cap, 'top', `${clamp((y0 + y1) / 2 - h / 2, 84, view.h - h - 96).toFixed(1)}px`);
}

let current = -1, capShown = 0;
function hud(near, v) {
  show(intro, near === 0 ? v : 0);
  const onPane = near >= 1 && near < LAST;
  // Swap the caption's words only while it's out of sight (or straight away, when there's no fade)
  if (onPane && near !== capFor && (capShown < .03 || capFor === -1 || reduced)) fillCaption(near);
  capShown = onPane && near === capFor ? v : 0;
  const beside = info() === 'beside';
  if (cap.classList.contains('is-beside') !== beside) { cap.classList.toggle('is-beside', beside); if (!beside) { setStyle(cap, 'left', ''); setStyle(cap, 'top', ''); } }
  if (beside && capShown > 0) besidePane(STOPS[capFor].pane);
  show(cap, capShown);
  show(talk, near === LAST ? v : 0);
  const at = Math.round(sCam);
  if (at !== current) {
    if (current !== -1) sound.pass(at);
    current = at;
    dashButtons.forEach((b, i) => { if (i === at) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
    walk.style.setProperty('--tone', STOPS[at].pane ? STOPS[at].pane.def.tone : 'var(--ink)');
    lab.dodge(STOPS[at].pane ? STOPS[at].pane.side : 0);
    $('#prev').disabled = at === 0;
    nextBtn.disabled = at === LAST;
  }
}

// Hint (in the lab): once it's been still at a stop for a moment, the next arrow pulses (Nudge) or opens up to
// say where it goes (Next up)
let stillSince = 0, hintFor = -1;
function hint(now, near, v) {
  const mode = opts.hint;
  const still = !flight && !anim && cutTo === null && Math.abs(cam.v) < 2 && v > .95 && !root.classList.contains('lab-open');
  if (!still) stillSince = now;
  const on = mode !== 'off' && still && now - stillSince > 2200 && near < LAST && !(mode === 'nudge' && moves >= 2);
  if (on && mode === 'next' && hintFor !== near) { hintFor = near; nextName.textContent = STOPS[near + 1].name; }
  nextBtn.classList.toggle('is-nudge', on && mode === 'nudge');
  nextBtn.classList.toggle('is-up', on && mode === 'next');
}

/* ───────── Pointing and tapping ───────── */
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let hits = panes.map((p) => p.hit);
const pointer = { x: 0, y: 0, nx: 0, ny: 0, sx: 0, sy: 0, seen: false };
let hovered = null;
const tip = $('#tip'), tipText = tip.querySelector('.tip-text');
const overUI = (el) => el && el.closest && (el.closest('a, button, .cap, .talk, .walk, .bar, .intro') || lab.isOver(el));

function pick(x, y) {
  ndc.set(x / view.w * 2 - 1, -(y / view.h) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(hits, false)[0];
  return hit ? panes.find((p) => p.hit === hit.object) : null;
}
function stopOf(pane) { return panes.indexOf(pane) + 1; }
function atStop(pane) { return !flight && Math.abs(sCam - stopOf(pane)) < .2; }
function open(p) {
  if (p.external) window.open(p.href, '_blank', 'noopener');
  else location.href = p.href;
}

addEventListener('pointermove', (e) => {
  pointer.x = e.clientX; pointer.y = e.clientY; pointer.seen = true;
  pointer.nx = clamp(e.clientX / view.w * 2 - 1, -1, 1);
  pointer.ny = clamp(e.clientY / view.h * 2 - 1, -1, 1);
  if (!fine) return;
  const was = hovered;
  hovered = overUI(e.target) ? null : pick(e.clientX, e.clientY);
  if (hovered && hovered !== was) sound.hover();
  document.body.classList.toggle('is-pointing', !!hovered);
  if (hovered) {
    tipText.textContent = atStop(hovered) ? verb(hovered.def) : hovered.def.name;
    tip.classList.toggle('is-out', atStop(hovered) && !!hovered.def.external);
    tip.classList.add('is-on');
  } else tip.classList.remove('is-on');
}, { passive: true });
root.addEventListener('pointerleave', () => { hovered = null; tip.classList.remove('is-on'); document.body.classList.remove('is-pointing'); });

let down = null;
addEventListener('pointerdown', (e) => { sound.wake(); down = overUI(e.target) ? null : { x: e.clientX, y: e.clientY, t: performance.now() }; }, { passive: true });
addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10 || performance.now() - down.t > 700) return;
  down = null;
  const pane = pick(e.clientX, e.clientY);
  if (!pane) return;
  sound.tap();
  if (atStop(pane)) open(pane.def); else go(stopOf(pane));
});
// A tap for every button and link on top of the world (the lab's own, the theme and the sound switch have theirs)
addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('a, button');
  if (b && b !== themeBtn && b !== sndBtn && !lab.isOver(b)) sound.tap();
});

addEventListener('keydown', (e) => {
  sound.wake();
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  const onControl = e.target.closest && e.target.closest('a, button, input, textarea');
  const step = { ArrowDown: 1, ArrowRight: 1, PageDown: 1, ArrowUp: -1, ArrowLeft: -1, PageUp: -1 }[e.key]
    ?? (e.key === ' ' && !onControl ? (e.shiftKey ? -1 : 1) : 0);
  if (step) { e.preventDefault(); moves++; go(here() + step); }
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

/* ───────── Sound on and off ───────── */
// The walk has sound unless someone switches it off here; that choice is kept in this browser
const sndBtn = $('#snd');
function paintSound() {
  sndBtn.hidden = sound.pack === 'off';
  sndBtn.setAttribute('aria-pressed', String(!sound.muted));
  sndBtn.setAttribute('aria-label', sound.muted ? 'Sound on' : 'Sound off');
  sndBtn.classList.toggle('is-muted', sound.muted);
}
let wasMuted = null;
try { wasMuted = localStorage.getItem('world-sound') === 'off'; } catch (e) {}
if (wasMuted) sound.mute(true);
sndBtn.addEventListener('click', () => {
  sound.mute(!sound.muted);
  try { localStorage.setItem('world-sound', sound.muted ? 'off' : 'on'); } catch (e) {}
  paintSound();
  if (!sound.muted) setTimeout(() => sound.arrive(Math.round(sCam)), 250);
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
  sound.theme(next);
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
let heartPane = panes.find((p) => p.heart);
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

/* ───────── The lab's switches ───────── */
// Upload every picture a group uses before it's seen, so nothing hitches when it comes into view
function upload(obj) {
  obj.traverse((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) for (const u of Object.values(m.uniforms || {})) if (u.value && u.value.isTexture && !u.value.isVideoTexture) renderer.initTexture(u.value);
  });
}
const fade = (to, duration) => veil.animate([{ opacity: +!to }, { opacity: to }], { duration, easing: to ? 'ease-in' : 'ease-out', fill: 'forwards' }).finished;
let cardBuild = 0;
async function setCard(card) {
  const n = ++cardBuild;
  const next = await buildPanes(card);
  if (n !== cardBuild) { next.forEach((p) => p.dispose()); return; }
  const t = THEME[dark ? 'dark' : 'light'];
  next.forEach((p) => { p.theme(t, dark); upload(p.group); });
  await fade(1, 160);
  if (n !== cardBuild) { next.forEach((p) => p.dispose()); return; }
  const s = Math.round(sCam);
  panes.forEach((p) => { scene.remove(p.group); p.dispose(); });
  panes = next;
  scene.add(...panes.map((p) => p.group));
  panes.forEach((p, k) => { STOPS[k + 1].pane = p; p.flown = false; });
  hits = panes.map((p) => p.hit);
  heartPane = panes.find((p) => p.heart);
  hovered = null; tip.classList.remove('is-on'); document.body.classList.remove('is-pointing');
  ground.setPanes(panes);
  measure(true); // the frames can change size, so every stop is framed again
  place(s);
  fade(0, 380);
}
// Changes that move the stops themselves: put the camera back on the same stop, through a quick fade
async function reframe(change) {
  const s = flight ? flight.to : Math.round(sCam);
  await fade(1, 120);
  change();
  measure(true);
  place(s);
  fade(0, 300);
}
function labChange(k, v) {
  if (!ready) return;
  if (k === 'motion') {
    if (reduced || v === motion) return;
    reframe(() => { motion = v; stepInput(steps()); });
  } else if (k === 'card') { glassLock(); setCard(v); }
  else if (k === 'glass') { panes.forEach((p) => p.glass(v)); frame(performance.now(), true); }
  else if (k === 'edge') { eclipse.edge(v === 'lit' ? 'lit' : 'sharp'); ground.reflect(v !== 'plain'); frame(performance.now(), true); }
  else if (k === 'shadow') { ground.shadows(v); frame(performance.now(), true); }
  else if (k === 'info' || k === 'opening' || k === 'ending') reframe(() => {});
  else if (k === 'pace') { /* the next flight picks it up */ }
  else if (k === 'sound') {
    sound.set(v);
    if (sound.muted && v !== 'off') { sound.mute(false); try { localStorage.setItem('world-sound', 'on'); } catch (e) {} }
    paintSound();
    // a taste of it straight away: something passing, then arriving
    const at = Math.round(sCam);
    setTimeout(() => sound.flyby(.8, .6, .12), 200);
    setTimeout(() => sound.arrive(at), 850);
  }
}

/* ───────── Frame ───────── */
const right = new V3(), up = new V3(), fwd = new V3(), base = new V3(), b0 = new V3(), b2 = new V3();
const was = { eye: new V3(), yaw: 0, ok: false }, vel = new V3(), rel = new V3();
let lastT = performance.now(), veilBusy = false, arrived = -1;

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
  cam.a = 0;
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
  return clamp(speed * speed * kappa * .006, -.035, .035);
}

// What the sound hears: how fast the eye is moving, which way it's turning, and the panes it's about to pass
function listen(dt, p, near, v) {
  if (!sound.on) { was.ok = false; return; }
  const yaw = Math.atan2(p.target.x - p.eye.x, -(p.target.z - p.eye.z));
  if (!was.ok || dt <= 0) { was.eye.copy(p.eye); was.yaw = yaw; was.ok = dt > 0; return; }
  vel.subVectors(p.eye, was.eye).divideScalar(dt);
  const metres = was.eye.distanceTo(p.eye), speed = metres / dt;
  let turn = yaw - was.yaw; turn = Math.atan2(Math.sin(turn), Math.cos(turn)) / dt;
  if (!Number.isFinite(speed + turn)) { was.ok = false; return; }
  was.eye.copy(p.eye); was.yaw = yaw;
  sound.frame(speed, turn, metres);
  // a whoosh just before the camera passes each pane, from its side
  const v2 = vel.lengthSq();
  for (const pane of panes) {
    rel.subVectors(pane.centre, p.eye);
    const tStar = v2 > 25 ? rel.dot(vel) / v2 : -1;
    if (tStar < 0 || tStar > 1) { pane.flown = false; continue; }
    if (pane.flown || tStar > .3) continue;
    const miss = rel.addScaledVector(vel, -tStar).length();
    if (miss > 7) continue;
    pane.flown = true;
    rel.subVectors(pane.centre, p.eye);
    sound.flyby(Math.min(1, Math.sqrt(v2) / 26) * (1 - miss / 9), clamp(rel.dot(right) / Math.max(rel.length(), 1), -1, 1), tStar);
  }
  // and something as it comes to rest on a stop
  if (v > .92 && speed < 1.2 && arrived !== near) { arrived = near; sound.arrive(near); }
  else if (v < .3) arrived = -1;
}

function frame(now, force = false) {
  const dt = force ? 0 : Math.min((now - lastT) / 1000, 1 / 15);
  lastT = now;
  // gathered-up clicks set off from where the camera was last frame (clock still says when that was)
  if (pendingTo !== null && flight && now - flight.t0 >= 260) fly(pendingTo);
  settleCheck(now);
  clock = now;
  let p, speed = 0, lean = 0, near, v;
  if (flight) {
    const t = clamp((now - flight.t0) / flight.T, 0, 1);
    p = flightPose(flight, t, P);
    const u = flight.u;
    sCam = lerp(flight.from, flight.to, u);
    // the caption of where it left fades as it goes, the next one's as it arrives (none if it left mid-air)
    if (u < .5) { near = flight.from; v = flight.midAir ? 0 : band(u, .02, .18); }
    else { near = flight.to; v = band(1 - u, .02, .2); }
    if (t >= 1) {
      landed = flight.to; flight = null;
      cam.y = lead.y = stopY[landed]; cam.v = lead.v = cam.a = 0; cam.attend = 1;
      toScroll(stopY[landed]);
    }
  } else {
    if (anim && !reduced) stepGlide(now); else follow(dt);
    sCam = sFromY(cam.y);
    speed = (arcAt(cam.y + 2) - arcAt(cam.y - 2)) / 4 * cam.v; // metres a second along the path
    cam.attend += (1 / (1 + (speed / 14) ** 2) - cam.attend) * (1 - Math.exp(-dt / .12));
    p = poseAtY(cam.y, cam.attend);
    near = Math.round(sCam);
    v = band(Math.abs(sCam - near), .05, near === LAST ? .3 : .24);
  }
  pose.eye.copy(p.eye); pose.target.copy(p.target); pose.kx = p.kx; pose.ky = p.ky; pose.fov = p.fov;
  base.copy(p.eye);
  camera.position.copy(p.eye);
  camera.up.set(0, 1, 0);
  camera.lookAt(p.target);
  // A little life: the view drifts, and on a desktop it moves with the pointer the way your head does at a
  // window: reach towards an edge and you see further round that way, so the next pane comes into view as
  // you go to tap it (it used to lean the other way, which slid the next pane off the screen)
  if (!reduced) {
    cam.breath += dt;
    pointer.sx += ((fine && pointer.seen ? pointer.nx : 0) - pointer.sx) * (1 - Math.exp(-dt * 3));
    pointer.sy += ((fine && pointer.seen ? pointer.ny : 0) - pointer.sy) * (1 - Math.exp(-dt * 3));
    camera.matrixWorld.extractBasis(right, up, fwd);
    const k = 1 + p.eye.y * .02;
    camera.position.addScaledVector(right, (-pointer.sx * .24 + Math.sin(cam.breath * .23) * .05) * k);
    camera.position.addScaledVector(up, (pointer.sy * .1 + Math.sin(cam.breath * .31) * .035) * k);
    camera.lookAt(p.target);
    // lean into the turns: along the path's bends, or against how hard a flight is swinging it round
    lean = flight ? flightLean(flight, clamp((now - flight.t0) / flight.T, 0, 1)) : bank(dt, p.arc, speed);
    cam.roll += (lean - cam.roll) * (1 - Math.exp(-dt / (flight ? .14 : .18)));
    camera.rotateZ(cam.roll);
  }
  camera.fov = p.fov;
  camera.setViewOffset(view.w, view.h, -p.kx / 2 * view.w, p.ky / 2 * view.h, view.w, view.h);
  sky.follow(camera);
  ground.follow(camera);
  shared.uSpin.value = reduced ? 0 : now / 1000 / 90; // one turn every ninety seconds, like the homepage

  // Which stop we're at, and how settled
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
  camera.updateMatrixWorld();
  hud(near, v);
  hint(now, near, v);
  listen(dt, p, near, v);

  if (hovered && fine && pointer.seen) tip.style.transform = `translate3d(${pointer.x + 14}px, ${pointer.y - 40}px, 0)`;
  renderer.render(scene, camera);
}

/* ───────── Start ───────── */
// The walk is measured from its own styles (the stage fills the screen, each stretch of track has its length);
// a slow stylesheet can land after this script starts, so wait for it
for (let k = 0; k < 300 && getComputedStyle(stage).position !== 'fixed'; k++) await new Promise((r) => setTimeout(r, 16));
applyTheme(dark);
eclipse.edge(opts.edge === 'lit' ? 'lit' : 'sharp');
ground.reflect(opts.edge !== 'plain');
ground.shadows(opts.shadow);
stepInput(steps());
measure();
trackH = track.offsetHeight;
cam.y = lead.y = yTarget; cam.v = lead.v = 0; shown = landed = Math.round(sFromY(yTarget));
if (reduced) cam.y = stopY[shown];
// Upload everything before the first frame so nothing hitches on the way
upload(scene);
try { await renderer.compileAsync(scene, camera); } catch (e) { /* compiles on first render instead */ }
frame(performance.now(), true);
watchSizes();
// (three.js stops asking for frames if one throws, so a single bad frame would freeze the whole walk)
let loopErrors = 0;
const loop = (t) => { try { frame(t); } catch (e) { if (loopErrors++ < 3) console.error(e); } };
renderer.setAnimationLoop(loop);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { renderer.setAnimationLoop(null); sound.pause(); if (heartPane) { heartPane.heart.video.pause(); heartPane.heart.want = false; } }
  else { lastT = performance.now(); renderer.setAnimationLoop(loop); sound.resume(); }
});
if (opts.sound !== 'off') sound.set(opts.sound); // it starts on the first tap or key press
paintSound();
ready = true;
if (opts.card !== built.card) setCard(opts.card);
if (opts.glass !== built.glass) labChange('glass', opts.glass);
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
  THREE, scene, camera, renderer, STOPS, lab, sound,
  get panes() { return panes; },
  get motion() { return motion; },
  get flight() { return flight ? { to: flight.to, u: flight.u, style: flight.style } : null; },
  jump(s) {
    s = clamp(s, 0, LAST); anim = null; settled = true; cutTo = null; flight = null;
    toScroll(yFromS(s));
    cam.y = lead.y = yTarget; cam.v = lead.v = cam.a = 0; cam.roll = 0; cam.attend = 1; shown = landed = Math.round(s);
    frame(performance.now(), true);
    return { s, y: window.scrollY };
  },
  go, get s() { return sCam; }, get cam() { return { ...cam }; }, get stopY() { return stopY.slice(); }, get clock() { return clock; },
  pause() { renderer.setAnimationLoop(null); }, resume() { lastT = performance.now(); renderer.setAnimationLoop(loop); },
  frame, get arcs() { return path.arc.slice(); },
};

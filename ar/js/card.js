// The card in AR. The camera feed sits behind a transparent WebGL canvas; MindAR finds the card in each frame
// and we place the scene on it. Without a camera (or a card) the same scene sits on a virtual card instead.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildHorizon } from './horizon.js';
import { CARD, asset, environment, loadTexture, squircleShape, squirclePlane, buildShadow } from './kit.js';
import { projectPanel } from './project-panel.js';

const q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const stage = $('stage');
const body = document.body;

/* ───────── Renderer and scene, shared by both modes ───────── */
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, stencil: true, powerPreference: 'high-performance', preserveDrawingBuffer: q.has('shot') });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.localClippingEnabled = true;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.setClearColor(0x000000, 0);
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.environment = environment(renderer, RoomEnvironment);
scene.environmentIntensity = .9;
const camera = new THREE.PerspectiveCamera(35, 1, 1, 4000);

let dark = q.has('disc') ? q.get('disc') === 'dark' : (() => { try { return localStorage.getItem('theme') === 'dark'; } catch (e) { return false; } })();
const horizon = await buildHorizon({ dark });
const cardSpace = new THREE.Group(); // millimetres, y up out of the card
cardSpace.add(horizon.root);
const key = new THREE.DirectionalLight('#ffffff', 1.6);
key.position.set(-40, 120, 90);
cardSpace.add(key, key.target);
cardSpace.add(new THREE.HemisphereLight('#ffffff', '#d8d4cc', .6));

let mode = 'idle'; // 'ar' | 'preview'
let fitPreview = false;
let lastShape = null;
let controls = null;
let virtualCard = null;

/* ───────── Hints and the project sheet ───────── */
const hint = $('hint'), hintText = $('hint-text');
function say(text) {
  if (!text) { hint.classList.add('is-hidden'); return; }
  hintText.textContent = text;
  hint.classList.remove('is-hidden');
}

// Tapping a project opens the panel; the piece comes forward and the rest dim
const TAP_HINT = 'Tap a project to find out more';
const panel = projectPanel({
  onChange(id) {
    horizon.select(id);
    if (id) say('');
    else if (horizon.settled) say(mode === 'preview' ? `${TAP_HINT}. Drag to look around.` : TAP_HINT);
  },
});
const openSheet = (p) => panel.open(p.id);
const closeSheet = () => panel.close();

/* ───────── Taps: a tap on a piece opens it, a drag does nothing ───────── */
const ray = new THREE.Raycaster();
let down = null;
renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8 || performance.now() - down.t > 500) return;
  const r = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  const p = horizon.pick(ray);
  if (p) openSheet(p); else if (panel.isOpen) closeSheet();
});

/* ───────── AR: camera, tracker, anchor ───────── */
const anchor = new THREE.Group();
anchor.matrixAutoUpdate = false;
anchor.visible = false;
let video = null, stream = null, controller = null, post = null;
let lastSeen = -1e9, tracking = false;
const LOST_GRACE = 700; // ms to hold the last pose before hiding

// Pro iPhones hand web pages a virtual back camera that hops to the ultra wide lens when you get close, which
// looks like a sudden zoom and throws the tracking's sense of scale. Once we're allowed the camera (so the
// labels are readable), switch to the plain wide lens, which stays put.
async function openCamera() {
  const size = { width: { ideal: 1280 }, height: { ideal: 720 } };
  let s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'environment', ...size } });
  try {
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    const wide = cams.find((d) => /^back camera$/i.test(d.label.trim()))
      || cams.find((d) => /back/i.test(d.label) && !/ultra|tele|dual|triple|desk/i.test(d.label));
    const current = s.getVideoTracks()[0]?.getSettings?.().deviceId;
    if (wide?.deviceId && wide.deviceId !== current) {
      s.getTracks().forEach((t) => t.stop());
      s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: { exact: wide.deviceId }, ...size } });
    }
  } catch (e) {
    if (!s.active) s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'environment', ...size } });
  }
  return s;
}

async function startAR() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera api');
  stream = await openCamera();
  video = document.createElement('video');
  Object.assign(video, { muted: true, playsInline: true, autoplay: true });
  video.setAttribute('playsinline', ''); video.setAttribute('muted', '');
  video.srcObject = stream;
  stage.prepend(video);
  await new Promise((res) => (video.readyState >= 1 ? res() : video.addEventListener('loadedmetadata', res, { once: true })));
  await video.play().catch(() => {});

  // The tracker reads frames at a smaller size than the preview: sharp picture, quick tracking
  const { Controller } = await import('../vendor/mindar/mindar-image.prod.js');
  await setupTracker(Controller);
  mode = 'ar';
  body.classList.add('is-ar', 'is-live', 'is-scanning');
  cardSpace.rotation.set(Math.PI / 2, 0, 0); // card space y (up) becomes the anchor's z (towards you)
  cardSpace.scale.setScalar(1 / CARD.w);
  cardSpace.position.set(0, 0, 0);
  anchor.add(cardSpace);
  scene.add(anchor);
  layout();
  await controller.dummyRun(video);
  controller.processVideo(video);
  say('Point at the side with the four projects');
}

// The tracker is built for one frame size; turning the phone swaps it, so build it again
let trackerPortrait = null, rebuilding = false;
async function setupTracker(Controller) {
  const vw = video.videoWidth, vh = video.videoHeight;
  trackerPortrait = vh > vw;
  const k = Math.min(1, (+q.get('input') || 720) / Math.max(vw, vh));
  const iw = Math.round(vw * k), ih = Math.round(vh * k);
  video.width = iw; video.height = ih; // MindAR draws the frame at the element's width and height
  controller = new Controller({
    inputWidth: iw, inputHeight: ih, maxTrack: 1,
    filterMinCF: q.has('mincf') ? +q.get('mincf') : .0005, // lower is steadier when still
    filterBeta: q.has('beta') ? +q.get('beta') : 1000, // higher keeps up when the card moves
    warmupTolerance: 3, missTolerance: 8,
    onUpdate: onTrack,
  });
  const { dimensions } = await controller.addImageTargets(asset('ar/assets/card.mind'));
  const [tw, th] = dimensions[0];
  post = new THREE.Matrix4().compose(new THREE.Vector3(tw / 2, th / 2, 0), new THREE.Quaternion(), new THREE.Vector3(tw, tw, tw));
}

async function rebuildTracker() {
  if (rebuilding || !controller || !video) return;
  rebuilding = true;
  controller.stopProcessVideo();
  tracking = false;
  anchor.visible = false;
  const { Controller } = await import('../vendor/mindar/mindar-image.prod.js');
  await setupTracker(Controller);
  layout();
  await controller.dummyRun(video);
  controller.processVideo(video);
  rebuilding = false;
}

const m4 = new THREE.Matrix4();
function onTrack(data) {
  if (data.type !== 'updateMatrix') return;
  if (data.worldMatrix) {
    m4.fromArray(data.worldMatrix).multiply(post);
    anchor.matrix.copy(m4);
    anchor.matrixWorldNeedsUpdate = true;
    lastSeen = performance.now();
    if (!tracking) found();
    tracking = true;
  } else {
    tracking = false;
  }
}

function found() {
  body.classList.remove('is-scanning');
  anchor.visible = true;
  if (!horizon.started) {
    horizon.start();
    horizon.videos.forEach((v) => v.play().catch(() => {}));
    say('');
    setTimeout(() => { if (!panel.isOpen) say(TAP_HINT); }, 2600);
  } else if (!panel.isOpen) {
    say(horizon.settled ? TAP_HINT : '');
  }
}

function stopAR() {
  controller?.stopProcessVideo();
  stream?.getTracks().forEach((t) => t.stop());
  video?.remove();
  controller = null; video = null; stream = null;
}

/* ───────── Preview: the same scene on a virtual card you can turn ───────── */
async function startPreview() {
  mode = 'preview';
  body.classList.add('is-preview', 'is-live');
  body.classList.remove('is-scanning');
  stage.style.background = 'var(--bg)';
  renderer.setClearColor(0xffffff, 0);
  cardSpace.rotation.set(0, 0, 0);
  cardSpace.scale.setScalar(1);
  scene.add(cardSpace);
  virtualCard = await buildVirtualCard();
  cardSpace.add(virtualCard);

  camera.fov = 32; camera.near = 5; camera.far = 4000;
  camera.position.set(0, 118, 196);
  fitPreview = true;
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 14, 0);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 110;
  controls.maxDistance = 420;
  controls.minPolarAngle = .35;
  controls.maxPolarAngle = 1.36;
  controls.autoRotate = !q.has('still');
  controls.autoRotateSpeed = .5;
  controls.zoomSpeed = .6;
  controls.rotateSpeed = .7;
  controls.addEventListener('start', () => { controls.autoRotate = false; });
  controls.update();
  layout();
  setTimeout(() => {
    horizon.start({ skip: q.has('settled') });
    horizon.videos.forEach((v) => v.play().catch(() => {}));
    setTimeout(() => { if (!panel.isOpen) say(`${TAP_HINT}. Drag to look around.`); }, q.has('settled') ? 0 : 2600);
  }, q.has('settled') ? 0 : 500);
}

// A card with its artwork on both faces. The top face skips the pockets (stencil), so they read as holes.
async function buildVirtualCard() {
  const g = new THREE.Group();
  const [back, front] = await Promise.all([loadTexture('ar/print/card-back.webp'), loadTexture('ar/print/card-front.webp')]);
  const T = .45, R = 3.2;
  const top = new THREE.Mesh(squirclePlane(CARD.w, CARD.h, R), new THREE.MeshStandardMaterial({
    map: back, roughness: .85, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp,
  }));
  top.rotation.x = -Math.PI / 2;
  top.renderOrder = -9.5;
  const under = new THREE.Mesh(squirclePlane(CARD.w, CARD.h, R), new THREE.MeshStandardMaterial({ map: front, roughness: .85 }));
  under.rotation.x = Math.PI / 2;
  under.rotation.z = Math.PI;
  under.position.y = -T;
  // The edge only: no top face, so nothing hides the pockets from above
  const edgeGeo = new THREE.ExtrudeGeometry(squircleShape(CARD.w, CARD.h, R), { depth: T, bevelEnabled: false, curveSegments: 1 });
  const edge = new THREE.Mesh(edgeGeo, [new THREE.MeshBasicMaterial({ visible: false }), new THREE.MeshStandardMaterial({ color: '#f4f2ee', roughness: .9 })]);
  edge.rotation.x = Math.PI / 2;
  const shadow = buildShadow({ w: 150, h: 110, strength: .2 });
  shadow.position.y = -T - .3;
  g.add(top, under, edge, shadow);
  return g;
}

/* ───────── Layout: the video covers the screen and the camera matches what's shown ───────── */
function layout() {
  const W = stage.clientWidth, H = stage.clientHeight;
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  if (mode === 'ar' && controller && video) {
    if (trackerPortrait !== null && (video.videoHeight > video.videoWidth) !== trackerPortrait) { rebuildTracker(); return; }
    const va = video.videoWidth / video.videoHeight;
    let dw, dh;
    if (va > W / H) { dh = H; dw = H * va; } else { dw = W; dh = W / va; }
    Object.assign(video.style, { width: dw + 'px', height: dh + 'px', left: (W - dw) / 2 + 'px', top: (H - dh) / 2 + 'px' });
    const p = controller.getProjectionMatrix();
    camera.fov = 2 * Math.atan((1 / p[5]) * (H / dh)) * 180 / Math.PI;
    camera.near = p[14] / (p[10] - 1);
    camera.far = p[14] / (p[10] + 1);
  }
  // Refit only when the screen's shape really changes (turning the phone), never for a toolbar sliding
  // or it jumps in and out while you look
  const shape = Math.round(W / 40);
  if (mode === 'preview' && fitPreview && controls && shape !== lastShape) {
    lastShape = shape;
    // Keep the whole scene in frame whatever the screen's shape: fit a sphere round it
    const v = THREE.MathUtils.degToRad(camera.fov) / 2;
    const h = Math.atan(Math.tan(v) * camera.aspect);
    const halfW = camera.aspect < 1 ? 58 : 74; // on a tall screen let the outer pieces touch the edges
    const dist = Math.max(halfW / Math.tan(h), 50 / Math.tan(v));
    const dir = camera.position.clone().sub(controls.target).normalize();
    camera.position.copy(controls.target).addScaledVector(dir, dist);
    controls.minDistance = dist * .55;
    controls.maxDistance = dist * 1.6;
  }
  camera.updateProjectionMatrix();
}
addEventListener('resize', layout);
addEventListener('orientationchange', () => setTimeout(layout, 400));

// Off the camera, move the picture out from under the panel: left of it on wide screens, above it on phones
const shift = { x: 0, y: 0, cam: null, v: null };
function shiftForPanel(dt) {
  if (mode !== 'preview') return;
  const W = stage.clientWidth, H = stage.clientHeight;
  const wide = W >= 760;
  let tx = panel.isOpen && wide ? 218 : 0;
  // On a phone, also slide sideways so the chosen piece sits in the middle above the sheet
  if (panel.isOpen && !wide) {
    const sel = horizon.pieces.find((p) => p.project.id === panel.current);
    if (sel) {
      if (!shift.cam) shift.cam = camera.clone();
      shift.cam.copy(camera); shift.cam.clearViewOffset();
      const v = sel.holder.getWorldPosition(shift.v || (shift.v = new THREE.Vector3())).project(shift.cam);
      tx = THREE.MathUtils.clamp(v.x * W / 2 * .85, -W * .3, W * .3);
    }
  }
  const ty = panel.isOpen && !wide ? Math.min(panel.el.offsetHeight, H * .74) * .5 : 0;
  const k = Math.min(1, dt * 6);
  shift.x += (tx - shift.x) * k;
  shift.y += (ty - shift.y) * k;
  if (Math.abs(shift.x) + Math.abs(shift.y) < .5) { if (camera.view?.enabled) camera.clearViewOffset(); return; }
  camera.setViewOffset(W, H, shift.x, shift.y, W, H);
}

/* ───────── Loop ───────── */
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  if (mode === 'ar') {
    const gone = performance.now() - lastSeen > LOST_GRACE;
    if (anchor.visible && !tracking && gone) {
      anchor.visible = false;
      body.classList.add('is-scanning');
      say(horizon.started ? 'Point back at the card' : 'Point at the side with the four projects');
    }
  }
  controls?.update();
  shiftForPanel(dt);
  horizon.tick(dt, camera);
  renderer.render(scene, camera);
});

/* ───────── Buttons ───────── */
const intro = $('intro');
// Once the 3D is up, put the page back to its normal size: a pinch on the intro can't leave you stuck
function unzoom() {
  document.querySelector('meta[name=viewport]').content = 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover';
}
async function go() {
  const btn = $('go');
  btn.disabled = true;
  try {
    await startAR();
    intro.classList.add('is-gone');
    unzoom();
    // Nothing found after a while: offer the card-free version
    setTimeout(() => { if (!horizon.started) body.classList.add('has-waited'); }, 8000);
  } catch (err) {
    console.warn(err);
    stopAR();
    intro.classList.remove('is-starting');
    intro.classList.add('has-error');
    btn.disabled = false;
  }
}
$('go').addEventListener('click', go);
function noCard() {
  stopAR();
  body.classList.remove('is-ar', 'is-scanning', 'has-waited');
  anchor.visible = false;
  intro.classList.add('is-gone');
  unzoom();
  startPreview();
}
$('nocard').addEventListener('click', noCard);
$('nocard-live').addEventListener('click', noCard);
$('close').addEventListener('click', () => { location.href = q.get('back') || '../'; });
// The site's own theme toggle: a white disc by day, an eclipse by night
const themeBtn = $('theme');
const showTheme = () => { themeBtn.setAttribute('aria-pressed', String(dark)); themeBtn.setAttribute('aria-label', dark ? 'Switch to a white disc' : 'Switch to an eclipse'); };
showTheme();
themeBtn.addEventListener('click', () => {
  dark = !dark;
  horizon.setDark(dark);
  try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch (e) {}
  showTheme();
});
$('replay').addEventListener('click', () => {
  closeSheet();
  horizon.reset();
  horizon.start();
  say('');
  setTimeout(() => { if (!panel.isOpen) say(TAP_HINT); }, 2600);
});

if (q.has('preview')) { intro.classList.add('is-gone'); startPreview(); }
// Arriving from the code on the card: you've got the card and you've just used the camera, so go straight to it
else if (q.has('scan')) { intro.classList.add('is-starting'); go(); }
window.__lab = { THREE, scene, camera, horizon, renderer };
document.documentElement.dataset.ready = '1';

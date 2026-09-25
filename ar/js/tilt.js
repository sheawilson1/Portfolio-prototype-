// The card, on your phone: the printed card rebuilt from real layers. Tilting the phone (or moving the pointer)
// turns it, so the layers separate in depth and the light slides across the stock. A tap turns it over.
// One rAF loop runs springs for the tilt, the flip and the hover lift. It only writes transforms, opacity and the
// light's position, and it sleeps when nothing is moving.

const root = document.documentElement;
const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const soft = Math.tanh; // eases into the limits instead of hitting them
const wrap = (d) => ((d % 360) + 540) % 360 - 180;
const RAD = Math.PI / 180;

const object = $('#object');
const lift = $('.lift');
const card = $('#card');
const hit = $('#hit');
const front = $('.face.front');
const back = $('.face.back');
const glows = [$('.glow.is-front'), $('.glow.is-back')];
const near = $('.shadow.is-near');
const far = $('.shadow.is-far');
const hint = $('#hint');
const motionBtn = $('#motion');
const status = $('#status');
// Each light lobe and where its surface starts on the card, in mm: the tiles sit in a row on the back
const lights = [...document.querySelectorAll('.lit')].map((el) => {
  const tile = el.closest('.tile');
  const i = tile ? +tile.style.getPropertyValue('--i') : 0;
  return { el, ox: tile ? 6 + i * 18.8 : 0, oy: tile ? 13.6 : 0 };
});

const reducedQ = matchMedia('(prefers-reduced-motion: reduce)');
const fineQ = matchMedia('(hover: hover) and (pointer: fine)');
let reduced = reducedQ.matches;

// How far it turns at full tilt, in degrees. x turns the right edge away from you, y the top edge.
const TURN = { x: 17, y: 13 };

const s = { x: 0, y: 0, vx: 0, vy: 0, a: 0, va: 0, ta: 0, h: 0, vh: 0, th: 0 };
const input = {
  pointer: false, px: 0, py: 0,
  gyro: false, gx: 0, gy: 0, at: 0, base: null,
  drag: null, dx: 0, dy: 0,
};
let box = { w: 1, h: 1, cx: 0, cy: 0 };
let side = 0;
let lastDepth = -1;
let landing = false;

function measure() {
  const r = object.getBoundingClientRect();
  box = { w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}

/* ───────── The loop ───────── */

function step(p, v, to, k, damping, dt) {
  v += (k * (to - p) - 2 * Math.sqrt(k) * damping * v) * dt;
  return [p + v * dt, v];
}

const gyroLive = (now) => input.gyro && now - input.at < 700;

function aim(now) {
  if (reduced) return [0, 0];
  if (input.drag?.on) return [input.dx, input.dy];
  if (gyroLive(now)) return [input.gx, input.gy];
  if (input.pointer) return [input.px, input.py];
  // Left alone it drifts a little, like a card in a hand
  const t = now / 1000;
  return [.26 * Math.sin(t * .5), .2 * Math.sin(t * .36 + 1.1)];
}

let running = false;
let last = 0;
function wake() {
  if (running) return;
  running = true;
  last = performance.now();
  requestAnimationFrame(frame);
}

function frame(now) {
  const dt = clamp((now - last) / 1000, .001, .034);
  last = now;
  const [tx, ty] = aim(now);
  const k = input.drag?.on ? 320 : gyroLive(now) ? 150 : input.pointer ? 110 : 60;
  [s.x, s.vx] = step(s.x, s.vx, tx, k, .78, dt);
  [s.y, s.vy] = step(s.y, s.vy, ty, k, .78, dt);
  [s.a, s.va] = step(s.a, s.va, s.ta, 130, .66, dt);
  [s.h, s.vh] = step(s.h, s.vh, s.th, 180, .8, dt);
  render();
  const settling = Math.abs(s.vx) + Math.abs(s.vy) + Math.abs(s.vh) + Math.abs(s.va) / 60 > .001
    || Math.abs(tx - s.x) + Math.abs(ty - s.y) + Math.abs(s.th - s.h) + Math.abs(s.ta - s.a) / 60 > .001;
  const drifting = !reduced && !input.pointer && !input.drag?.on;
  if (settling || drifting) requestAnimationFrame(frame);
  else running = false;
}

let lastFacing = null;
function render() {
  const a = s.a;
  const edge = Math.abs(Math.sin(a * RAD)); // 0 face on, 1 side on
  const depth = Math.abs(Math.cos(a * RAD)) ** 2.5;
  const up = Math.min(1, edge + s.h * .3);
  // It hops towards you as it turns, and lifts a touch under the pointer
  lift.style.transform = `translate3d(0, ${(-box.h * .03 * up).toFixed(2)}px, ${(box.w * (.16 * edge + .04 * s.h)).toFixed(2)}px) `
    + `rotateX(${(s.y * TURN.y).toFixed(3)}deg) rotateY(${(s.x * TURN.x).toFixed(3)}deg)`;
  card.style.transform = `rotateY(${a.toFixed(3)}deg)`;
  if (Math.abs(depth - lastDepth) > .002) { card.style.setProperty('--depth', depth.toFixed(3)); lastDepth = depth; }

  // The lamp is above and in front of you, so its light slides towards whichever edge comes closer
  const lx = (.42 - s.x * .46) * box.w, ly = (.1 + s.y * .56) * box.h, mm = box.w / 85;
  for (const l of lights) l.el.style.translate = `${(lx - l.ox * mm).toFixed(1)}px ${(ly - l.oy * mm).toFixed(1)}px`;

  near.style.transform = `translate3d(${(-s.x * box.w * .02).toFixed(1)}px, ${(box.h * .05 * up).toFixed(1)}px, 0) scale(${(1 + .05 * up).toFixed(3)})`;
  near.style.opacity = (1 - .85 * up).toFixed(3);
  far.style.transform = `translate3d(${(-s.x * box.w * .05).toFixed(1)}px, ${(box.h * (.1 * up + .05 * s.y)).toFixed(1)}px, 0) scale(${(1 + .12 * up).toFixed(3)})`;
  far.style.opacity = (.75 - .3 * up).toFixed(3);
  const g = `translate3d(${(s.x * box.w * .035).toFixed(1)}px, ${(-s.y * box.h * .035).toFixed(1)}px, 0)`;
  glows[0].style.transform = g;
  glows[1].style.transform = g;

  // Hide whichever face is turned away. Depth sorting does this on a GPU, but not every renderer sorts 3D
  // layers, and a mirrored back showing through is the one thing this card must never do.
  const facing = Math.cos(a * RAD) >= 0;
  if (facing !== lastFacing) {
    front.style.visibility = facing ? '' : 'hidden';
    back.style.visibility = facing ? 'hidden' : '';
    lastFacing = facing;
  }
  const n = ((Math.round(a / 180) % 2) + 2) % 2;
  if (n !== side) setSide(n);
  if (landing && Math.abs(s.a - s.ta) < 8) {
    landing = false;
    try { navigator.vibrate?.(8); } catch (e) { /* not everywhere */ }
  }
}

function setSide(n) {
  side = n;
  front.setAttribute('aria-hidden', String(n === 1));
  back.setAttribute('aria-hidden', String(n === 0));
  glows[0].classList.toggle('is-on', n === 0);
  glows[1].classList.toggle('is-on', n === 1);
  hit.setAttribute('aria-label', n ? 'Turn the card back over' : 'Turn the card over');
  status.textContent = n ? 'Showing the back of the card' : 'Showing the front of the card';
}

/* ───────── Turning it over ───────── */

function flip(dir) {
  if (reduced) {
    // No spin with reduced motion: a quick fade to the other side
    object.classList.add('is-fading');
    setTimeout(() => { s.ta += 180; s.a = s.ta; s.va = 0; render(); object.classList.remove('is-fading'); }, 170);
    return;
  }
  s.ta += 180 * dir;
  s.va += 200 * dir; // start it like a flick, not a slide
  landing = true;
  wake();
}

// Tap the right half and it goes over to the left, like pushing that edge down. Keyboard presses go one way.
hit.addEventListener('click', (e) => {
  const d = input.drag;
  input.drag = null;
  if (d && d.moved) return; // that was a drag, not a tap
  flip(e.detail === 0 ? 1 : e.clientX < box.cx ? -1 : 1);
});

/* ───────── Inputs: the phone's tilt, a finger, the pointer ───────── */

// Pointer: the side under the pointer goes away from you, like the cards on the homepage
addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  input.px = soft((e.clientX - box.cx) / (innerWidth * .36));
  input.py = soft((box.cy - e.clientY) / (innerHeight * .36));
  input.pointer = true;
  wake();
}, { passive: true });
document.addEventListener('pointerout', (e) => { if (!e.relatedTarget && e.pointerType !== 'touch') { input.pointer = false; wake(); } });
addEventListener('blur', () => { input.pointer = false; wake(); });
hit.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') { s.th = 1; wake(); } });
hit.addEventListener('pointerleave', () => { s.th = 0; wake(); });

// A finger: drag to turn it, let go and it settles back
hit.addEventListener('pointerdown', (e) => {
  input.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false, moved: false, touch: e.pointerType === 'touch' };
  if (input.drag.touch) { try { hit.setPointerCapture(e.pointerId); } catch (err) { /* fine without */ } }
});
hit.addEventListener('pointermove', (e) => {
  const d = input.drag;
  if (!d || d.id !== e.pointerId || !d.touch || reduced) return;
  const mx = e.clientX - d.x, my = e.clientY - d.y;
  if (!d.on && Math.hypot(mx, my) > 10) { d.on = true; d.moved = true; }
  if (!d.on) return;
  input.dx = soft(mx / (box.w * .42));
  input.dy = soft(-my / (box.h * .6));
  wake();
});
const release = (e) => { const d = input.drag; if (d && d.id === e.pointerId) { d.on = false; wake(); } };
hit.addEventListener('pointerup', release);
hit.addEventListener('pointercancel', (e) => { release(e); input.drag = null; });

// The phone's tilt. iOS asks first, and only from a tap, so it gets a small button.
const needsAsk = typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
let asked = false;
let granted = false;
let gaveUp = false;

const screenAngle = () => {
  const a = screen.orientation?.angle ?? window.orientation ?? 0;
  return ((a % 360) + 360) % 360;
};

function onOrient(e) {
  if (e.beta == null || e.gamma == null) return;
  const b = e.beta, g = e.gamma, o = screenAngle();
  // The phone's axes, turned into the screen's
  const x = o === 90 ? b : o === 180 ? -g : o === 270 ? -b : g;
  const y = o === 90 ? g : o === 180 ? b : o === 270 ? -g : -b;
  const now = performance.now();
  const dt = Math.min(.1, (now - input.at) / 1000);
  if (!input.base || now - input.at > 600) input.base = { x, y };
  input.at = now;
  const base = input.base;
  let dx = wrap(x - base.x), dy = wrap(y - base.y);
  // Near upright the angles can jump; start again from here rather than swing
  if (Math.abs(dx) > 75 || Math.abs(dy) > 75) { base.x = x; base.y = y; dx = 0; dy = 0; }
  // The resting angle follows you slowly, so it answers to how you move the phone, not how you hold it
  const f = 1 - Math.exp(-dt / 2.4);
  base.x += dx * f;
  base.y += dy * f;
  input.gx = soft(dx / 15);
  input.gy = soft(dy / 12);
  if (!input.gyro) { input.gyro = true; syncHint(); }
  wake();
}
addEventListener('deviceorientation', onOrient);
// Turning the phone on its side swaps the axes; start from wherever it's held now instead of lurching
const recentre = () => { input.base = null; };
screen.orientation?.addEventListener?.('change', recentre);
addEventListener('orientationchange', recentre);
setTimeout(() => { if (!input.gyro) { gaveUp = true; syncHint(); } }, 1400);

motionBtn.addEventListener('click', async () => {
  asked = true;
  try { granted = (await DeviceOrientationEvent.requestPermission()) === 'granted'; } catch (e) { granted = false; }
  syncHint();
  // Allowed, but nothing arrives: there's no sensor, so dragging is the way in
  if (granted) setTimeout(() => { if (!input.gyro) { granted = false; gaveUp = true; syncHint(); } }, 1200);
});

/* ───────── The one line of help, which depends on what you're holding ───────── */

function syncHint() {
  const touch = !fineQ.matches;
  let text;
  if (reduced) text = touch ? 'Tap the card to turn it over.' : 'Click the card to turn it over.';
  else if (input.gyro || granted) text = 'Tilt your phone to look around it. Tap to turn it over.';
  else if (!touch) text = 'Move your pointer to look around it. Click to turn it over.';
  else if (needsAsk && !asked) text = 'Tap the card to turn it over.';
  else if (!needsAsk && !gaveUp) text = 'Tilt your phone to look around it. Tap to turn it over.';
  else text = 'Drag the card to look around it. Tap to turn it over.';
  setHint(text);
  motionBtn.hidden = !(needsAsk && touch && !asked && !input.gyro && !reduced);
}

let hintTimer = 0;
function setHint(text) {
  if (hint.textContent === text) return;
  clearTimeout(hintTimer);
  if (!root.classList.contains('is-in')) { hint.textContent = text; return; }
  hint.classList.add('is-swapping');
  hintTimer = setTimeout(() => { hint.textContent = text; hint.classList.remove('is-swapping'); }, 240);
}

reducedQ.addEventListener?.('change', (e) => { reduced = e.matches; syncHint(); wake(); });
fineQ.addEventListener?.('change', syncHint);

/* ───────── Theme: the homepage's toggle and its soft umbra ───────── */

const themeBtn = $('.theme');
const metaTheme = $('meta[name="theme-color"]');
function syncTheme() {
  const dark = root.dataset.theme === 'dark';
  themeBtn.setAttribute('aria-pressed', String(dark));
  themeBtn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  metaTheme.setAttribute('content', dark ? '#05070b' : '#ffffff');
}
syncTheme();
themeBtn.addEventListener('click', (e) => {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  const apply = () => {
    if (next === 'dark') root.dataset.theme = 'dark'; else delete root.dataset.theme;
    try { localStorage.setItem('theme', next); } catch (err) { /* private mode */ }
    syncTheme();
  };
  const r = themeBtn.getBoundingClientRect();
  root.style.setProperty('--vx', `${e.clientX || r.left + r.width / 2}px`);
  root.style.setProperty('--vy', `${e.clientY || r.top + r.height / 2}px`);
  if (!document.startViewTransition || reduced) { apply(); return; }
  root.classList.add('theme-switching');
  document.startViewTransition(apply).finished.finally(() => root.classList.remove('theme-switching'));
});

/* ───────── Save contact ─────────
   The button is a plain link to the vCard, so the platform does the saving:
   - iPhone: Safari (and Chrome, Firefox and Edge there) shows the contact card with Create New Contact when it opens a
     text/vcard file, so it gets no download attribute, which would file the card away in Downloads instead.
   - Android: Chrome downloads it and Open imports it into Contacts. Web Share isn't used: Chrome's share allowlist has
     no .vcf, so share() would fail after the tap, and the share sheet is a step longer anyway.
   - Apps' own browsers (Instagram, LinkedIn and the like) often can't open it at all, so they also get a note saying
     how to open the page in Safari or Chrome. */
const save = $('#save');
const saveNote = $('#save-note');
const ua = navigator.userAgent;
const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
const android = /Android/.test(ua);
const inApp = /Instagram|FBAN|FBAV|FB_IAB|FB4A|FBIOS|LinkedInApp|Snapchat|musical_ly|BytedanceWebview|TikTok|Twitter|Barcelona|Pinterest|MicroMessenger|\bLine\//.test(ua)
  || (android && /; wv\)/.test(ua))
  || (iOS && !/Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua));
if (iOS && !inApp) save.removeAttribute('download');
const busyText = android && !inApp ? 'Open the download to add it' : iOS || inApp ? 'Opening your contacts' : 'Downloaded';
save.querySelector('.busy-text').textContent = busyText;
if (inApp) saveNote.textContent = `If nothing opens, use the app’s menu to open this page in ${iOS ? 'Safari' : android ? 'Chrome' : 'your browser'}.`;
let saveTimer = 0;
const rest = () => save.classList.remove('is-busy');
save.addEventListener('click', () => {
  // No preventDefault: the tap itself follows the link, which is what the platforms trust
  save.classList.add('is-busy');
  status.textContent = busyText;
  if (inApp) saveNote.hidden = false;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(rest, android && !inApp ? 4200 : 2600);
});
// Coming back to the page from the contact card
addEventListener('pageshow', (e) => { if (e.persisted) { clearTimeout(saveTimer); rest(); } });

/* ───────── Arriving ───────── */

measure();
addEventListener('resize', measure);
addEventListener('scroll', measure, { passive: true });
if ('ResizeObserver' in window) new ResizeObserver(measure).observe(object);
syncHint();
render();

const FONTS = ['italic 400 20px Spectral', '300 20px Spectral', 'italic 300 20px Spectral', '400 16px "DM Sans"', '500 16px "DM Sans"'];
const fontsIn = document.fonts
  ? Promise.all(FONTS.map((f) => document.fonts.load(f).catch(() => null))).then(() => document.fonts.ready)
  : Promise.resolve();
const imagesIn = Promise.all([...document.images]
  .filter((img) => getComputedStyle(img).display !== 'none')
  .map((img) => (img.complete ? Promise.resolve() : new Promise((r) => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); }))));

function enter() {
  if (root.classList.contains('is-in')) return;
  measure();
  // It settles into place from a slight angle, as if it had just been put down
  if (!reduced) { s.x = .34; s.y = -.62; }
  root.classList.add('is-in');
  syncHint();
  wake();
}
// Wait for the type so the name never swaps font in front of you, but never hold the card back for long
Promise.race([fontsIn, new Promise((r) => setTimeout(r, 1500))]).then(enter);
Promise.all([fontsIn, imagesIn]).then(() => { root.dataset.ready = '1'; });

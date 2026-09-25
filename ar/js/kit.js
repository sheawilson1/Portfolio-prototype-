// Shared pieces for the 3D and AR versions of the site: the palette, the work, and the objects they're built from.
// Units are millimetres of the printed card (85 x 55), so the same scene sits on the card, on a desk or in the world.
import * as THREE from 'three';

import { asset, SITE, CARD, CORONA, SPECTRUM, PROJECTS, MORE } from './projects.js';
export { asset, SITE, CARD, CORONA, SPECTRUM, PROJECTS, MORE };

export async function fontsReady() {
  if (!document.fonts) return;
  await Promise.all(['300 40px Spectral', 'italic 300 40px Spectral', '200 40px Spectral', '400 20px "DM Sans"', '500 20px "DM Sans"']
    .map((f) => document.fonts.load(f).catch(() => null)));
}

/* ───────── Canvas textures ───────── */

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

export function toTexture(c, { srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// The ring of colour. `inner` and `outer` are fractions of the radius: fully lit at inner, gone at outer.
export function coronaCanvas({ size = 1024, inner = 0.62, outer = 1, stops = CORONA, soft = true, hole = 0 } = {}) {
  const [c, g] = canvas(size, size);
  const r = size / 2;
  const cg = g.createConicGradient(-Math.PI / 2, r, r);
  for (const [deg, col] of stops) cg.addColorStop(deg / 360, col);
  g.fillStyle = cg;
  g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'destination-in';
  const rg = g.createRadialGradient(r, r, 0, r, r, r * outer);
  const i = inner / outer;
  if (soft) {
    rg.addColorStop(0, 'rgba(0,0,0,1)');
    rg.addColorStop(i, 'rgba(0,0,0,1)');
    rg.addColorStop(i + (1 - i) * 0.2, 'rgba(0,0,0,.84)');
    rg.addColorStop(i + (1 - i) * 0.42, 'rgba(0,0,0,.52)');
    rg.addColorStop(i + (1 - i) * 0.66, 'rgba(0,0,0,.24)');
    rg.addColorStop(i + (1 - i) * 0.86, 'rgba(0,0,0,.07)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
  } else {
    rg.addColorStop(0, 'rgba(0,0,0,1)');
    rg.addColorStop(1, 'rgba(0,0,0,1)');
  }
  g.fillStyle = rg;
  g.fillRect(0, 0, size, size);
  // The middle sits behind the disc; cut it out so the ring doesn't read as a solid wheel from behind
  if (hole) {
    g.globalCompositeOperation = 'destination-out';
    const hg = g.createRadialGradient(r, r, 0, r, r, r * hole);
    hg.addColorStop(0, 'rgba(0,0,0,1)'); hg.addColorStop(.96, 'rgba(0,0,0,1)'); hg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = hg;
    g.fillRect(0, 0, size, size);
  }
  return c;
}

// A soft round light: white in the middle, nothing at the edge. Tint it with the material colour.
export function glowCanvas({ size = 256, falloff = [1, .62, .3, .1, .025, 0] } = {}) {
  const [c, g] = canvas(size, size);
  const r = size / 2;
  const rg = g.createRadialGradient(r, r, 0, r, r, r);
  falloff.forEach((a, k) => rg.addColorStop(k / (falloff.length - 1), `rgba(255,255,255,${a})`));
  g.fillStyle = rg;
  g.fillRect(0, 0, size, size);
  return c;
}

// The site's bleed: three coloured blobs, as one soft texture that fades to nothing well inside its edges
export function bleedCanvas(colors, { w = 512, h = 512 } = {}) {
  const [c, g] = canvas(w, h);
  const spots = [[.5, .45, .34], [.62, .6, .26], [.38, .62, .24]];
  const m = Math.min(w, h);
  colors.forEach((col, k) => {
    const [x, y, s] = spots[k % spots.length];
    const rg = g.createRadialGradient(x * w, y * h, 0, x * w, y * h, s * m);
    rg.addColorStop(0, hexA(col, .9)); rg.addColorStop(.3, hexA(col, .55)); rg.addColorStop(.62, hexA(col, .18)); rg.addColorStop(1, hexA(col, 0));
    g.fillStyle = rg;
    g.fillRect(0, 0, w, h);
  });
  return c;
}

export function shadowCanvas({ size = 256, strength = .5 } = {}) {
  const [c, g] = canvas(size, size);
  const r = size / 2;
  const rg = g.createRadialGradient(r, r, 0, r, r, r);
  rg.addColorStop(0, `rgba(0,0,0,${strength})`); rg.addColorStop(.45, `rgba(0,0,0,${strength * .55})`); rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, size, size);
  return c;
}

export function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
}

// Type set on a canvas. `runs` is a list of [text, font] so a line can mix upright and italic.
export function textCanvas(lines, { color = '#0a0a0a', lineHeight = 1.1, pad = 8, scale = 2, align = 'left', tracking = 0 } = {}) {
  const [probe, pg] = canvas(4, 4);
  const measured = lines.map((runs) => {
    let w = 0, size = 0;
    for (const [text, font] of runs) { pg.font = font; w += pg.measureText(text).width + tracking * text.length; size = Math.max(size, parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)[1])); }
    return { runs, w, size };
  });
  const width = Math.ceil(Math.max(...measured.map((m) => m.w)) + pad * 2);
  const height = Math.ceil(measured.reduce((s, m) => s + m.size * lineHeight, 0) + pad * 2);
  const [c, g] = canvas(width * scale, height * scale);
  g.scale(scale, scale);
  g.fillStyle = color;
  g.textBaseline = 'alphabetic';
  let y = pad;
  for (const m of measured) {
    y += m.size * lineHeight * .82;
    let x = align === 'center' ? (width - m.w) / 2 : pad;
    for (const [text, font] of m.runs) {
      g.font = font;
      if (tracking) { for (const ch of text) { g.fillText(ch, x, y); x += g.measureText(ch).width + tracking; } }
      else { g.fillText(text, x, y); x += g.measureText(text).width; }
    }
    y += m.size * lineHeight * .18;
  }
  void probe;
  return c;
}

/* ───────── Geometry ───────── */

// Continuous corners, like the site's squircle cards: a superellipse in each corner
export function squircleShape(w, h, r, n = 4.2) {
  const s = new THREE.Shape();
  const x0 = -w / 2, y0 = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  const steps = 14;
  const corner = (cx, cy, a0) => {
    for (let k = 0; k <= steps; k++) {
      const t = a0 + (k / steps) * (Math.PI / 2);
      const ct = Math.cos(t), st = Math.sin(t);
      const px = cx + Math.sign(ct) * Math.pow(Math.abs(ct), 2 / n) * r;
      const py = cy + Math.sign(st) * Math.pow(Math.abs(st), 2 / n) * r;
      if (k === 0 && a0 === 0) s.moveTo(px, py); else s.lineTo(px, py);
    }
  };
  corner(x0 + w - r, y0 + h - r, 0);
  corner(x0 + r, y0 + h - r, Math.PI / 2);
  corner(x0 + r, y0 + r, Math.PI);
  corner(x0 + w - r, y0 + r, Math.PI * 1.5);
  s.closePath();
  return s;
}

// UVs from 0 to 1 across the shape's box, so a picture fills it
function normaliseUVs(geo, w, h) {
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let k = 0; k < pos.count; k++) uv.setXY(k, pos.getX(k) / w + .5, pos.getY(k) / h + .5);
  uv.needsUpdate = true;
  return geo;
}

export function squirclePlane(w, h, r) {
  return normaliseUVs(new THREE.ShapeGeometry(squircleShape(w, h, r), 1), w, h);
}

// A slab with softened edges. Group 0 is the two faces, group 1 the sides.
export function squircleSlab(w, h, r, depth, bevel = Math.min(depth * .45, r * .3)) {
  const geo = new THREE.ExtrudeGeometry(squircleShape(w - bevel * 2, h - bevel * 2, Math.max(r - bevel, .01)), {
    depth: Math.max(depth - bevel * 2, 0.0001), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 1,
  });
  geo.translate(0, 0, -depth / 2 + bevel);
  normaliseUVs(geo, w, h);
  geo.computeVertexNormals();
  return geo;
}

/* ───────── Textures from files ───────── */

const loader = new THREE.TextureLoader();
const cache = new Map();
export function loadTexture(path, { srgb = true } = {}) {
  const key = path + srgb;
  if (!cache.has(key)) {
    cache.set(key, new Promise((resolve, reject) => loader.load(asset(path), (t) => {
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      resolve(t);
    }, undefined, reject)));
  }
  return cache.get(key);
}

export function videoTexture(sources) {
  const v = document.createElement('video');
  Object.assign(v, { muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous', preload: 'auto' });
  v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
  for (const [src, type] of sources) { const s = document.createElement('source'); s.src = asset(src); s.type = type; v.appendChild(s); }
  const t = new THREE.VideoTexture(v);
  t.colorSpace = THREE.SRGBColorSpace;
  return { texture: t, video: v };
}

export function environment(renderer, RoomEnvironment) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return env;
}

/* ───────── The objects ───────── */

// The white disc with its lit rim, standing upright, and the ring of colour behind it
export function buildEclipse({ radius = 26, thickness = 3, dark = false, glow = true } = {}) {
  const group = new THREE.Group();
  group.name = 'eclipse';

  // A coin with a rounded edge, turned on a lathe so the rim catches light
  const profile = [];
  const e = thickness / 2;
  profile.push(new THREE.Vector2(0, -e));
  for (let k = 0; k <= 10; k++) {
    const a = -Math.PI / 2 + (k / 10) * Math.PI;
    profile.push(new THREE.Vector2(radius - e + Math.cos(a) * e, Math.sin(a) * e));
  }
  profile.push(new THREE.Vector2(0, e));
  const discGeo = new THREE.LatheGeometry(profile, 96);
  discGeo.rotateX(Math.PI / 2);
  const discMat = new THREE.MeshPhysicalMaterial({
    color: dark ? '#05070b' : '#ffffff', roughness: dark ? .32 : .55, metalness: 0, clearcoat: dark ? .8 : .25, clearcoatRoughness: .3,
    sheen: dark ? 0 : .4, sheenColor: new THREE.Color('#fff4ea'), sheenRoughness: .6,
  });
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.name = 'disc';
  group.add(disc);

  // The ring of colour, a little larger than the disc, just behind it
  const coronaTex = toTexture(coronaCanvas({ size: 1024, inner: .74, outer: 1, hole: .69 }));
  const coronaMat = new THREE.MeshBasicMaterial({ map: coronaTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const corona = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.42, 96), coronaMat);
  corona.position.z = -thickness * .5 - .4;
  corona.name = 'corona';
  corona.renderOrder = -1;
  group.add(corona);

  // Extra light for dark rooms and camera feeds: the same ring added on top, softer and wider
  let halo = null;
  if (glow) {
    const haloTex = toTexture(coronaCanvas({ size: 512, inner: .5, outer: 1, hole: .5 }));
    halo = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.9, 64),
      new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    halo.position.z = -thickness * .5 - .8;
    halo.renderOrder = -2;
    halo.name = 'halo';
    group.add(halo);
  }

  // A thin line of colour round the rim, like the lit border on the cards
  const rimTex = toTexture(ringStripCanvas());
  rimTex.wrapS = THREE.RepeatWrapping;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius - .1, .34, 8, 160),
    new THREE.MeshBasicMaterial({ map: rimTex, transparent: true, opacity: .9, toneMapped: false }));
  rim.position.z = -e * .55;
  rim.name = 'rim';
  group.add(rim);

  // Daylight or eclipse: the same switch as the site's theme toggle
  const setDark = (on) => {
    discMat.color.set(on ? '#05070b' : '#ffffff');
    discMat.roughness = on ? .32 : .55;
    discMat.clearcoat = on ? .8 : .25;
    discMat.sheen = on ? 0 : .4;
    if (halo) halo.userData.boost = on ? 1.6 : 1;
  };
  setDark(dark);

  return { group, disc, corona, halo, rim, radius, setDark, spin(dt) { corona.rotation.z -= dt * .07; if (halo) halo.rotation.z -= dt * .05; rim.rotation.z -= dt * .07; } };
}

// The corona's colours laid out in a strip, for anything that wraps round (the rim torus)
function ringStripCanvas() {
  const [c, g] = canvas(1024, 4);
  const lg = g.createLinearGradient(0, 0, 1024, 0);
  for (const [deg, col] of CORONA) lg.addColorStop(deg / 360, col);
  g.fillStyle = lg;
  g.fillRect(0, 0, 1024, 4);
  return c;
}

// A pane of glass for a product: frosted, with a bright edge and the project's light behind it
export function buildPane({ w, h, r = 3.2, depth = 1.2, tone = '#ffffff', map = null, opacity = .5, dark = false } = {}) {
  const group = new THREE.Group();
  const faceMat = new THREE.MeshPhysicalMaterial({
    color: dark ? '#141821' : '#ffffff', map, roughness: .18, metalness: 0, transparent: true, opacity, clearcoat: 1, clearcoatRoughness: .08,
    envMapIntensity: 1.2, depthWrite: false,
  });
  const edgeMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(tone).lerp(new THREE.Color('#ffffff'), .55), roughness: .12, transparent: true, opacity: .95, clearcoat: 1 });
  const slab = new THREE.Mesh(squircleSlab(w, h, r, depth), [faceMat, edgeMat]);
  slab.renderOrder = 1;
  group.add(slab);
  return { group, slab, faceMat, edgeMat };
}

// A flat picture with its own alpha (a phone, a screen) that floats in front of a pane
// `back` gives it a reverse side for when you walk round it: 'phone' is the device's dark silhouette,
// 'screen' a plain satin back. Without one the picture shows on both sides.
export function buildPicture(tex, { w, h, r = 0, back = null } = {}) {
  const geo = r ? squirclePlane(w, h, r) : new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: .02, side: back ? THREE.FrontSide : THREE.DoubleSide, toneMapped: false });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 3;
  if (back) {
    const bm = back === 'phone'
      ? new THREE.MeshBasicMaterial({ color: '#16171c', map: tex, transparent: true, alphaTest: .02 })
      : new THREE.MeshStandardMaterial({ color: '#d9d6d0', roughness: .45, metalness: 0 });
    const b = new THREE.Mesh(geo, bm);
    b.rotation.y = Math.PI;
    b.position.z = -.06;
    b.renderOrder = 3;
    b.userData.isBack = true;
    m.add(b);
  }
  return m;
}

export function buildGlow(colors, { w, h, opacity = .7, additive = false } = {}) {
  const tex = toTexture(bleedCanvas(colors, { w: 512, h: Math.round(512 * h / w) }));
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, toneMapped: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.renderOrder = 0;
  return m;
}

export function buildLabel(lines, { height, color = '#0a0a0a', align = 'center', ...opts } = {}) {
  const c = textCanvas(lines, { color, align, ...opts });
  const tex = toTexture(c);
  const w = height * c.width / c.height;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, height), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  m.renderOrder = 4;
  m.userData.width = w;
  return m;
}

export function buildShadow({ w, h, strength = .45 } = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: toTexture(shadowCanvas({ strength }), { srgb: false }), transparent: true, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = -3;
  return m;
}

/* ───────── The work, as miniatures ───────── */
// Each returns a Group about 30 mm tall, standing on y = 0, facing +z, with userData.project for taps.

export async function buildPiece(project, { dark = false, video = true, backs = true } = {}) {
  const B = (kind) => (backs ? kind : null);
  const group = new THREE.Group();
  group.name = project.id;
  group.userData.project = project;
  const layers = [];
  const add = (obj, depth) => { obj.userData.depth = depth; obj.userData.baseZ = obj.position.z; layers.push(obj); group.add(obj); return obj; };

  if (project.id === 'snapshot') {
    const [phone, results] = await Promise.all([loadTexture('assets/media/home/snapshot-phone.webp'), loadTexture('assets/media/home/snapshot-results.webp')]);
    const res = add(buildPicture(results, { w: 30, h: 22.5, r: 2.2, back: B('screen') }), -1);
    res.position.set(-6, 17, -3); res.rotation.z = THREE.MathUtils.degToRad(-5);
    const ph = add(buildPicture(phone, { w: 14.5, h: 30, back: B('phone') }), 1);
    ph.position.set(7, 16, 3);
  } else if (project.id === 'jumpstart') {
    const [back, front, exp] = await Promise.all([
      loadTexture(dark ? 'assets/media/home/jumpstart-agency-dark.webp' : 'assets/media/home/jumpstart-agency.webp'),
      loadTexture(dark ? 'assets/media/home/jumpstart-report-dark.webp' : 'assets/media/home/jumpstart-report.webp'),
      loadTexture(dark ? 'assets/media/home/jumpstart-export-dark.webp' : 'assets/media/home/jumpstart-export.webp'),
    ]);
    const a = add(buildPicture(back, { w: 30, h: 18.75, r: 1.6, back: B('screen') }), -1.2);
    a.position.set(-5, 20, -4); a.rotation.z = THREE.MathUtils.degToRad(-4);
    const b = add(buildPicture(front, { w: 23, h: 17.85, r: 1.6, back: B('screen') }), .3);
    b.position.set(3, 15, 0); b.rotation.z = THREE.MathUtils.degToRad(1.5);
    const c = add(buildPicture(exp, { w: 14, h: 10.1, r: 1.2, back: B('screen') }), 1.4);
    c.position.set(10, 8.5, 4); c.rotation.z = THREE.MathUtils.degToRad(4);
  } else if (project.id === 'heart') {
    // The iPad screen plays the real recording; the tablet is a dark slab with a thin bezel
    const tab = buildPane({ w: 32, h: 24, r: 2.6, depth: 1.4, tone: '#1b2a33', opacity: 1, dark: true });
    tab.faceMat.color.set('#0b0d12'); tab.faceMat.opacity = 1; tab.faceMat.transparent = false; tab.faceMat.depthWrite = true;
    tab.group.position.set(0, 16, 0);
    tab.group.rotation.z = THREE.MathUtils.degToRad(-7);
    add(tab.group, 0);
    let tex;
    if (video) {
      const v = videoTexture([['assets/media/heart/heart-screen.mp4', 'video/mp4'], ['assets/media/heart/heart-screen.webm', 'video/webm']]);
      tex = v.texture;
      group.userData.video = v.video;
    } else {
      tex = await loadTexture('ar/assets/heart-frame.webp');
    }
    const screen = buildPicture(tex, { w: 29.4, h: 21.8, r: 1.4 });
    screen.material.alphaTest = 0;
    screen.material.transparent = false;
    screen.position.z = .75;
    tab.group.add(screen);
  } else if (project.id === 'brain') {
    const [home, voice] = await Promise.all([loadTexture('assets/media/home/brain-home.webp'), loadTexture('assets/media/home/brain-voice.webp')]);
    const v = add(buildPicture(voice, { w: 13, h: 26.9, back: B('phone') }), -1);
    v.position.set(-6, 15, -3); v.rotation.z = THREE.MathUtils.degToRad(-8);
    const hm = add(buildPicture(home, { w: 14.5, h: 30, back: B('phone') }), 1);
    hm.position.set(4, 16, 2); hm.rotation.z = THREE.MathUtils.degToRad(3);
  }

  const glow = buildGlow(project.colors, { w: 64, h: 52, opacity: dark ? .9 : .62 });
  glow.position.set(0, 16, -7);
  group.add(glow);
  group.userData.glow = glow;
  group.userData.layers = layers;

  // An invisible box that catches taps anywhere on the piece
  const hit = new THREE.Mesh(new THREE.BoxGeometry(40, 34, 10), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(0, 16, 0);
  hit.userData.project = project;
  group.add(hit);
  group.userData.hit = hit;
  return group;
}

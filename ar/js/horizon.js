// The pop-up scene for the card. Everything is in millimetres on the printed card: x to the right, y up out
// of the card, z towards the card's bottom edge. The card itself is not drawn here (in AR it's the real one).
//
// What happens: the four printed tiles peel off the paper, turn into the layered product shots and float in an
// arc, leaving lit pockets in the card. The eclipse rises out of a slot behind them.
//
// It leans towards whoever's looking: from low down everything stands up; from overhead (a card held up to the
// camera) the pieces tip back to face you, so it never collapses into a view of the tops of things.
import * as THREE from 'three';
import {
  PROJECTS, CARD, buildEclipse, buildPiece, buildLabel, buildShadow, squircleShape, squirclePlane, bleedCanvas,
  toTexture, loadTexture, fontsReady,
} from './kit.js';

// Where things are printed on the back of the card, from print/card.html (mm from the top left)
const TILE = { left: 6, top: 13.6, size: 16.6, gap: 2.2, radius: 3.1 };
const printed = (i) => ({
  x: TILE.left + i * (TILE.size + TILE.gap) + TILE.size / 2 - CARD.w / 2,
  z: TILE.top + TILE.size / 2 - CARD.h / 2,
});

const ease = {
  out: (t) => 1 - Math.pow(1 - t, 3),
  back: (t) => { const c = 1.35; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
};
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const span = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const D2R = Math.PI / 180;

// The work's colours run together into one soft light, for the floor of each pocket
function softLight(colors) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.filter = 'blur(18px)';
  g.drawImage(bleedCanvas(colors, { w: 256, h: 256 }), -24, -24, 304, 304);
  g.globalAlpha = .65;
  g.drawImage(bleedCanvas([...colors].reverse(), { w: 256, h: 256 }), 12, 12, 232, 232);
  return c;
}

// Fade a whole group without losing each material's own opacity
function fade(group, a) {
  group.traverse((o) => {
    if (!o.material || o.userData.noFade) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m.userData.base === undefined) m.userData.base = { opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite };
      m.opacity = m.userData.base.opacity * a;
      const see = a < .999;
      m.transparent = m.userData.base.transparent || see;
      m.depthWrite = see ? false : m.userData.base.depthWrite;
    }
    o.visible = a > .002;
  });
}

export async function buildHorizon({ cardImage = 'ar/print/card-back.webp', pockets = true, headline = true, haloStrength = .28, dark = true } = {}) {
  await fontsReady();
  const root = new THREE.Group();
  root.name = 'horizon';
  const clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  /* The eclipse, rising out of a slot behind the work. It hinges on the slot, so it can lean back. */
  const DISC = { r: 20, z: -14, y: 10 };
  const hinge = new THREE.Group();
  hinge.position.set(0, 0, DISC.z);
  root.add(hinge);
  const eclipse = buildEclipse({ radius: DISC.r, thickness: 2.4, dark });
  eclipse.group.position.y = -DISC.r - 3;
  hinge.add(eclipse.group);
  eclipse.group.traverse((o) => { if (o.material) o.material.clippingPlanes = [clip]; });

  // Light from the ring on the paper round the slot
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(90, 44), new THREE.MeshBasicMaterial({
    map: toTexture(bleedCanvas(['#ff6a1a', '#ed1652', '#8a3cff'], { w: 512, h: 256 })), transparent: true, opacity: 0,
    depthWrite: false, toneMapped: false,
  }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, .06, DISC.z + 2);
  pool.renderOrder = -4;
  root.add(pool);

  /* Pockets: a stencil the shape of each opening, and the inside of a box that only draws through it */
  const pocketGroup = new THREE.Group();
  root.add(pocketGroup);
  const stencilTest = { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc,
    stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp };
  const makePocket = ({ w, h, r, x, z, depth, colors }) => {
    const shape = squircleShape(w, h, r);
    const mask = new THREE.Mesh(new THREE.ShapeGeometry(shape, 1), new THREE.MeshBasicMaterial({
      colorWrite: false, depthWrite: false, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc,
      stencilZPass: THREE.ReplaceStencilOp,
    }));
    mask.rotation.x = -Math.PI / 2;
    mask.position.set(x, .03, z);
    mask.renderOrder = -10;
    mask.userData.noFade = true;

    // Darker the deeper it goes: vertex colours from the rim down
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k++) {
      const v = THREE.MathUtils.lerp(.62, .05, Math.pow(pos.getZ(k) / depth, .7));
      col.set([v, v, v * 1.04], k * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const inside = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, ...stencilTest }));
    inside.rotation.x = Math.PI / 2; // extrude downwards
    inside.position.set(x, 0, z);
    inside.renderOrder = -9;

    // The work's own light, down in the pocket
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.3, h * 1.3), new THREE.MeshBasicMaterial({
      map: toTexture(softLight(colors)), transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: false, toneMapped: false, ...stencilTest,
    }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(x, -depth + .2, z);
    glow.renderOrder = -8;
    pocketGroup.add(mask, inside, glow);
    return { mask, inside, glow };
  };
  const chord = 2 * Math.sqrt(DISC.r ** 2 - (DISC.r - DISC.y) ** 2);
  const slot = pockets ? makePocket({ w: chord + 3, h: 4, r: 2, x: 0, z: DISC.z, depth: 7, colors: ['#ff6a1a', '#ed1652', '#8a3cff'] }) : null;

  /* The work: a flat copy of each printed tile that lifts off, and the miniature it turns into */
  const cardTex = await loadTexture(cardImage);
  const FINAL = [
    { x: -44, z: 4, y: 5, ry: .42 },
    { x: -15, z: 12, y: 5, ry: .13 },
    { x: 15, z: 12, y: 5, ry: -.13 },
    { x: 44, z: 4, y: 5, ry: -.42 },
  ];
  const pieces = [];
  for (let i = 0; i < PROJECTS.length; i++) {
    const project = PROJECTS[i];
    const at = printed(i);
    const piece = await buildPiece(project);
    piece.position.y = -16; // the miniature's middle sits on the holder
    const holder = new THREE.Group();
    holder.rotation.order = 'YXZ'; // turn to face, then lean back
    holder.add(piece);
    root.add(holder);

    // The flat tile: the card's own artwork cut to the tile, so the lift starts from exactly what's printed
    const tex = cardTex.clone();
    tex.repeat.set(TILE.size / CARD.w, TILE.size / CARD.h);
    tex.offset.set((at.x - TILE.size / 2 + CARD.w / 2) / CARD.w, 1 - (at.z + TILE.size / 2 + CARD.h / 2) / CARD.h);
    tex.needsUpdate = true;
    const flat = new THREE.Mesh(squirclePlane(TILE.size, TILE.size, TILE.radius), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, side: THREE.DoubleSide }));
    flat.renderOrder = 2;
    const flatHolder = new THREE.Group();
    flatHolder.rotation.order = 'YXZ';
    flatHolder.add(flat);
    root.add(flatHolder);

    const pocket = pockets ? makePocket({ w: TILE.size, h: TILE.size, r: TILE.radius, x: at.x, z: at.z, depth: 5, colors: project.colors }) : null;
    const shadow = buildShadow({ w: 30, h: 16, strength: .34 });
    root.add(shadow);
    const label = buildLabel([[[project.name, '400 40px "DM Sans"']]], { height: 5.2, color: '#0a0a0a' });
    label.position.set(0, -1.8, 6);
    piece.add(label);

    pieces.push({ project, piece, holder, flat, flatHolder, pocket, shadow, at, final: FINAL[i], scale: .7, i, hover: 0 });
  }

  /* The line from the homepage, set in the air above the disc, hinged with it */
  let head = null;
  if (headline) {
    head = buildLabel([[['Always making ', '300 64px Spectral'], ['something.', 'italic 300 64px Spectral']]], { height: 6.4, color: '#0a0a0a', tracking: -1.2 });
    head.position.set(0, 38, 1);
    hinge.add(head);
  }

  /* Where the viewer is, in card space, smoothed so tracking jitter doesn't shake the lean */
  const view = { elev: 40 * D2R, az: 0, ready: false };
  const camLocal = new THREE.Vector3(), up = new THREE.Vector3(), origin = new THREE.Vector3();
  function watch(camera, dt) {
    if (!camera) return;
    root.updateWorldMatrix(true, false);
    camLocal.setFromMatrixPosition(camera.matrixWorld);
    root.worldToLocal(camLocal);
    const elev = Math.atan2(camLocal.y, Math.hypot(camLocal.x, camLocal.z));
    const az = Math.atan2(camLocal.x, Math.max(camLocal.z, 1));
    const k = view.ready ? Math.min(1, dt * 4) : 1;
    view.elev += (elev - view.elev) * k;
    view.az += (az - view.az) * k;
    view.ready = true;
  }

  /* Timeline */
  let t = -1; // seconds since the intro started; -1 means waiting
  let played = false;
  let selected = null;

  function pose(time) {
    pocketGroup.visible = time >= 0;
    const elevDeg = view.elev / D2R;
    const pieceLean = clamp(elevDeg - 24, 0, 66) * D2R; // tip back once you're looking from above
    const discLean = clamp(elevDeg - 38, 0, 36) * D2R;
    const turnToViewer = clamp(view.az * .3, -.4, .4);

    for (const s of pieces) {
      const p = span(time, .25 + s.i * .14, 1.55 + s.i * .14);
      const lift = ease.back(p);
      const turn = ease.out(span(p, .05, .85));
      const bob = played ? Math.sin((time + s.i * 1.3) * 1.4) * .9 : 0;
      const sel = s.hover;
      const fin = s.final;
      const mid = fin.y + 16 * s.scale; // height of the miniature's middle when it's standing
      const x = s.at.x + (fin.x - s.at.x) * lift, z = s.at.z + (fin.z - s.at.z) * lift, y = .12 + (mid - .12) * lift;
      const rx = -Math.PI / 2 + (Math.PI / 2 - pieceLean * (1 - sel * .5)) * turn;
      const ry = (fin.ry * (1 - sel) + turnToViewer) * turn;
      // The flat tile rises and turns to face you, handing over to the miniature on the way
      s.flatHolder.position.set(x, y, z);
      s.flatHolder.rotation.set(rx, ry, 0);
      s.flatHolder.scale.setScalar(1 + .45 * ease.out(p));
      fade(s.flatHolder, time < 0 ? 0 : 1 - span(p, .35, .7));
      s.holder.position.set(x, y + bob + sel * 3, z + sel * 5);
      s.holder.rotation.set(rx, ry, 0);
      s.holder.scale.setScalar(THREE.MathUtils.lerp(.34, s.scale, ease.out(p)) * (1 + sel * .18));
      fade(s.holder, span(p, .4, .75) * (selected && !sel ? .55 : 1));
      // The shadow on the card under each piece, and light in its pocket
      s.shadow.position.set(x, .05, z + 1);
      s.shadow.material.opacity = span(p, .3, .9) * (1 - sel * .3) * (1 - pieceLean / 2);
      if (s.pocket) s.pocket.glow.material.opacity = span(p, .2, .8) * (.8 + .2 * Math.sin(time * 2 + s.i));
    }

    // The disc rises, the ring comes up with it and its light spreads on the paper
    const d = ease.out(span(time, .45, 1.9));
    eclipse.group.position.y = THREE.MathUtils.lerp(-DISC.r - 3, DISC.y, d);
    hinge.rotation.x = -discLean * d;
    const ring = span(time, .7, 1.9);
    eclipse.corona.material.opacity = ring;
    if (eclipse.halo) eclipse.halo.material.opacity = haloStrength * (eclipse.halo.userData.boost || 1) * ring;
    eclipse.rim.material.opacity = .9 * ring;
    pool.material.opacity = .3 * ring;
    if (slot) slot.glow.material.opacity = .9 * span(time, .3, 1);
    if (head) {
      const h = ease.out(span(time, 1.5, 2.3));
      fade(head, h);
      head.position.y = 35 + 3 * h;
    }
  }

  function tick(dt, camera) {
    watch(camera, dt);
    if (t >= 0) {
      t += dt;
      if (t > 2.4) played = true;
      for (const s of pieces) s.hover += ((selected === s ? 1 : 0) - s.hover) * Math.min(1, dt * 8);
      eclipse.spin(dt);
    }
    pose(t);
    // Keep the cut at the card's surface wherever the card is
    root.updateWorldMatrix(true, false);
    up.set(0, 1, 0).transformDirection(root.matrixWorld);
    origin.setFromMatrixPosition(root.matrixWorld);
    clip.setFromNormalAndCoplanarPoint(up, origin);
  }

  return {
    root,
    pieces,
    eclipse,
    view,
    setDark: (on) => eclipse.setDark(on),
    get started() { return t >= 0; },
    get settled() { return played; },
    start({ skip = false } = {}) { t = skip ? 3 : 0; played = skip; },
    reset() { t = -1; played = false; selected = null; pose(-1); },
    tick,
    select(id) { selected = pieces.find((s) => s.project.id === id) || null; },
    pick(raycaster) {
      const hits = raycaster.intersectObjects(pieces.map((s) => s.piece.userData.hit), false);
      return hits.length ? hits[0].object.userData.project : null;
    },
    videos: pieces.map((s) => s.piece.userData.video).filter(Boolean),
  };
}

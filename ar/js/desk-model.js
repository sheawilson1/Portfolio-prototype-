// The desk version: the card's scene as a small sculpture, about 25 cm across, built for export to GLB (web,
// Android) and USDZ (iPhone Quick Look). Quick Look has no stencils, clipping, additive light or double-sided
// materials, so everything here is real geometry: the pockets are holes in the base, the disc stands in a slot,
// and every picture has a back. Built in millimetres, returned in metres.
import * as THREE from 'three';
import { PROJECTS, buildEclipse, buildPiece, squircleShape, toTexture, textCanvas, bleedCanvas, fontsReady } from './kit.js';

const BASE = { w: 250, d: 170, h: 20, r: 24 };
const POCKET = { size: 46, r: 9, z: 18, depth: 13, xs: [-84, -28, 28, 84] };
const DISC = { r: 56, y: 38, z: -46, t: 7 };

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// What's printed on the base: the line from the homepage along the front, a name under each pocket
function baseTopCanvas(dark) {
  const k = 10; // px per mm
  const [c, g] = canvas(BASE.w * k, BASE.d * k);
  g.fillStyle = dark ? '#0c0d11' : '#f8f7f4';
  g.fillRect(0, 0, c.width, c.height);
  const X = (mm) => (mm + BASE.w / 2) * k, Y = (mm) => (mm + BASE.d / 2) * k; // z grows towards the front
  g.fillStyle = dark ? 'rgba(242,240,235,.62)' : 'rgba(10,10,10,.62)';
  g.font = '400 50px "DM Sans"';
  g.textAlign = 'center';
  PROJECTS.forEach((p, i) => g.fillText(p.name, X(POCKET.xs[i]), Y(POCKET.z + POCKET.size / 2 + 8)));
  const head = textCanvas([[['Always making ', '300 150px Spectral'], ['something.', 'italic 300 150px Spectral']]], { color: dark ? '#f2f0eb' : '#0a0a0a', scale: 1, tracking: -3 });
  g.drawImage(head, X(0) - head.width / 2, Y(67) - head.height * .72);
  g.fillStyle = dark ? 'rgba(242,240,235,.44)' : 'rgba(10,10,10,.46)';
  g.font = 'italic 400 46px Spectral';
  g.fillText('Shea Wilson', X(0), Y(79));
  return c;
}

// The inside of a pocket: the base's own colour at the rim, going dark, with the work's light coming up
// from the floor so the walls and the glow blend into one
function linerCanvas(tone, dark) {
  const [c, g] = canvas(8, 256);
  const lg = g.createLinearGradient(0, 0, 0, 256);
  if (dark) { lg.addColorStop(0, '#2a2b31'); lg.addColorStop(.45, '#141519'); }
  else { lg.addColorStop(0, '#bdbab4'); lg.addColorStop(.4, '#6d6a66'); }
  lg.addColorStop(.78, mix(tone, '#101014', .72));
  lg.addColorStop(1, mix(tone, '#101014', .4));
  g.fillStyle = lg;
  g.fillRect(0, 0, 8, 256);
  return c;
}
function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

// The light on a pocket's floor: the project's colours run together, soft to the edges
function floorCanvas(colors) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#0c0c10';
  g.fillRect(0, 0, 256, 256);
  g.filter = 'blur(22px)';
  g.drawImage(bleedCanvas(colors, { w: 256, h: 256 }), -30, -30, 316, 316);
  g.globalAlpha = .7;
  g.drawImage(bleedCanvas([...colors].reverse(), { w: 256, h: 256 }), 10, 10, 236, 236);
  g.filter = 'none';
  return c;
}

// Walls facing inwards round a closed outline, from y = 0 down to -depth. v runs 0 at the rim to 1 at the floor.
function linerGeometry(points, depth) {
  const pos = [], uv = [], idx = [];
  const n = points.length;
  let len = 0;
  const along = [0];
  for (let i = 1; i <= n; i++) { len += points[i % n].distanceTo(points[i - 1]); along.push(len); }
  for (let i = 0; i <= n; i++) {
    const p = points[i % n];
    pos.push(p.x, 0, p.y, p.x, -depth, p.y);
    uv.push(along[i] / len, 1, along[i] / len, 0);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d); // wound so the faces point inwards for an outline running this way
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Quick Look adds emission without fading it by the alpha, so soft light turns into hard-edged discs.
// For the USDZ, bake the fade in: colour times alpha, worked out in linear light and stored as sRGB.
const premultiplied = new Map();
const toLin = (c) => (c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4));
const toSrgb = (c) => (c <= .0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - .055);
function overBlack(tex) {
  if (!tex?.image) return tex;
  if (!premultiplied.has(tex)) {
    const img = tex.image;
    const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
    const [c, g] = canvas(w, h);
    g.drawImage(img, 0, 0, w, h);
    const data = g.getImageData(0, 0, w, h);
    const px = data.data;
    for (let k = 0; k < px.length; k += 4) {
      const a = px[k + 3] / 255;
      for (let j = 0; j < 3; j++) px[k + j] = Math.round(toSrgb(toLin(px[k + j] / 255) * a) * 255);
      px[k + 3] = 255;
    }
    g.putImageData(data, 0, 0);
    const t = toTexture(c);
    t.userData.mimeType = 'image/jpeg';
    premultiplied.set(tex, t);
  }
  return premultiplied.get(tex);
}

// Unlit look that survives export: black diffuse, the picture as emission, its alpha as opacity
let quickLook = false;
function glowing(src) {
  const see = src.transparent || src.alphaTest > 0;
  const m = new THREE.MeshStandardMaterial({
    color: 0x000000, map: src.map, emissive: 0xffffff, emissiveMap: see && quickLook ? overBlack(src.map) : src.map, roughness: 1, metalness: 0,
    transparent: src.transparent, opacity: src.opacity, alphaTest: src.alphaTest || 0, depthWrite: src.depthWrite,
  });
  m.name = src.name;
  return m;
}

// Pictures without transparency go out as JPEG, which keeps the files small enough for a phone
function preferJpeg(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      const opaque = !m.transparent && !(m.alphaTest > 0);
      for (const key of ['map', 'emissiveMap']) if (m[key] && opaque) m[key].userData.mimeType = 'image/jpeg';
    }
  });
}

// One material per mesh: Quick Look's validator rejects the subsets three.js writes for multi-material meshes
function splitGroups(root) {
  const todo = [];
  root.traverse((o) => { if (o.isMesh && Array.isArray(o.material)) todo.push(o); });
  for (const o of todo) {
    const src = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    const parts = new THREE.Group();
    parts.name = o.name;
    parts.position.copy(o.position); parts.quaternion.copy(o.quaternion); parts.scale.copy(o.scale);
    src.groups.forEach((grp, gi) => {
      const mat = o.material[grp.materialIndex ?? gi];
      if (!mat || mat.visible === false) return;
      const g = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(src.attributes)) {
        const size = attr.itemSize;
        g.setAttribute(name, new THREE.BufferAttribute(attr.array.slice(grp.start * size, (grp.start + grp.count) * size), size, attr.normalized));
      }
      const m = new THREE.Mesh(g, mat);
      m.name = `${o.name || 'part'}_${mat.name || gi}`;
      m.renderOrder = o.renderOrder;
      parts.add(m);
    });
    [...o.children].forEach((c) => parts.add(c));
    o.parent.add(parts);
    o.parent.remove(o);
  }
}

// Soft light (the corona, the glows) doesn't need big textures; redraw those canvases smaller
function shrinkSoftTextures(root, max = 384) {
  const done = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      for (const key of ['map', 'emissiveMap']) {
        const t = m[key];
        const img = t?.image;
        if (!t || done.has(t) || !(img instanceof HTMLCanvasElement) || !/Corona|light|Glow/.test(m.name)) continue;
        if (Math.max(img.width, img.height) <= max) continue;
        const k = max / Math.max(img.width, img.height);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        t.image = c;
        t.needsUpdate = true;
        done.add(t);
      }
    }
  });
}

export async function buildDeskModel({ dark = false, forQuickLook = false } = {}) {
  await fontsReady();
  quickLook = forQuickLook;
  premultiplied.clear();
  const model = new THREE.Group();
  model.name = 'SheaWilsonDesk';
  const mm = new THREE.Group(); // everything in millimetres, lifted so the base sits on the floor
  mm.position.y = BASE.h;
  model.add(mm);

  /* The base, with the pockets and the slot cut through it */
  const shape = squircleShape(BASE.w, BASE.d, BASE.r);
  const pocketShapes = POCKET.xs.map((x) => ({ x, z: POCKET.z, shape: squircleShape(POCKET.size, POCKET.size, POCKET.r) }));
  const chord = 2 * Math.sqrt(DISC.r ** 2 - (DISC.r - DISC.y) ** 2);
  const slotShape = { x: 0, z: DISC.z, shape: squircleShape(chord + 8, DISC.t + 5, 3.5) };
  for (const { x, z, shape: s } of [...pocketShapes, slotShape]) {
    const hole = new THREE.Path(s.getPoints(8).map((p) => new THREE.Vector2(p.x + x, p.y - z)).reverse());
    shape.holes.push(hole);
  }
  const bevel = 1.4;
  const baseGeo = new THREE.ExtrudeGeometry(shape, { depth: BASE.h - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 6 });
  baseGeo.translate(0, 0, -(BASE.h - bevel)); // top face at z = 0 before turning flat, bottom at -h
  baseGeo.rotateX(-Math.PI / 2); // shape y becomes -z, extrusion becomes up
  // Caps get UVs across the base so the print lands in the right place
  const uvs = baseGeo.attributes.uv, P = baseGeo.attributes.position;
  const capCount = baseGeo.groups[0].count;
  const capIndex = baseGeo.index ? baseGeo.index.array : null;
  const seen = new Set();
  for (let k = 0; k < capCount; k++) {
    const vi = capIndex ? capIndex[k] : k;
    if (seen.has(vi)) continue;
    seen.add(vi);
    uvs.setXY(vi, P.getX(vi) / BASE.w + .5, 1 - (P.getZ(vi) / BASE.d + .5));
  }
  uvs.needsUpdate = true;
  const topTex = toTexture(baseTopCanvas(dark));
  const base = new THREE.Mesh(baseGeo, [
    new THREE.MeshStandardMaterial({ name: 'BasePrint', color: 0xffffff, map: topTex, roughness: dark ? .62 : .82 }),
    new THREE.MeshStandardMaterial({ name: 'BaseEdge', color: dark ? '#111217' : '#f1efea', roughness: dark ? .6 : .85 }),
  ]);
  base.name = 'Base';
  mm.add(base);

  /* Inside the pockets: dark walls and the work's own colour at the floor */
  const linerMat = (tone, name) => new THREE.MeshStandardMaterial({ name, color: 0xffffff, map: toTexture(linerCanvas(tone, dark)), roughness: .9 });
  PROJECTS.forEach((p, i) => {
    const s = squircleShape(POCKET.size - .6, POCKET.size - .6, POCKET.r);
    const pts = s.getPoints(8);
    pts.pop();
    const liner = new THREE.Mesh(linerGeometry(pts.map((q) => new THREE.Vector2(q.x, -q.y)), POCKET.depth), linerMat(p.tone, `Pocket_${p.id}`));
    liner.position.set(POCKET.xs[i], 0, POCKET.z);
    liner.name = `Pocket_${p.id}`;
    mm.add(liner);

    const floorGeo = new THREE.ShapeGeometry(s, 1);
    const fp = floorGeo.attributes.position, fu = floorGeo.attributes.uv;
    for (let k = 0; k < fp.count; k++) fu.setXY(k, fp.getX(k) / POCKET.size + .5, fp.getY(k) / POCKET.size + .5);
    const floorTex = toTexture(floorCanvas(p.colors));
    const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ name: `Glow_${p.id}`, color: 0x000000, emissive: 0xffffff, emissiveMap: floorTex, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(POCKET.xs[i], -POCKET.depth + .2, POCKET.z);
    mm.add(floor);
  });

  // The slot's inside, dark, so the disc goes down into shadow
  {
    const pts = slotShape.shape.getPoints(8);
    pts.pop();
    const liner = new THREE.Mesh(linerGeometry(pts.map((q) => new THREE.Vector2(q.x, -q.y)), BASE.h - 2), linerMat('#ff6a1a', 'Slot'));
    liner.position.set(0, 0, DISC.z);
    mm.add(liner);
  }

  /* The eclipse, standing in its slot */
  const eclipse = buildEclipse({ radius: DISC.r, thickness: DISC.t, dark, glow: false });
  eclipse.group.position.set(0, DISC.y, DISC.z);
  // Cut the ring flat where it meets the base, so none of it hangs below the plinth
  {
    const g = new THREE.CircleGeometry(DISC.r * 1.42, 160);
    const cp = g.attributes.position;
    for (let k = 0; k < cp.count; k++) if (cp.getY(k) < -DISC.y) cp.setY(k, -DISC.y);
    eclipse.corona.geometry.dispose();
    eclipse.corona.geometry = g;
  }
  eclipse.corona.material = glowing(eclipse.corona.material);
  eclipse.corona.material.name = 'Corona';
  eclipse.rim.material = glowing(eclipse.rim.material);
  eclipse.rim.material.transparent = false;
  eclipse.rim.material.name = 'Rim';
  eclipse.disc.material.name = dark ? 'Eclipse' : 'Disc';
  // The ring's back, so it isn't a hole from behind
  const back = new THREE.Mesh(eclipse.corona.geometry, glowing(eclipse.corona.material));
  back.rotation.y = Math.PI;
  back.position.z = eclipse.corona.position.z - .3;
  eclipse.group.add(back);
  mm.add(eclipse.group);

  /* The work, hovering over the pockets it came out of */
  const turn = [.2, .07, -.07, -.2];
  for (let i = 0; i < PROJECTS.length; i++) {
    const p = PROJECTS[i];
    const piece = await buildPiece(p, { video: false, dark, backs: false });
    piece.remove(piece.userData.hit);
    piece.scale.setScalar(1.5);
    piece.position.set(POCKET.xs[i], 10, POCKET.z - 2);
    piece.rotation.y = turn[i];
    const extra = [];
    piece.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      if (Array.isArray(m)) return;
      if (m.isMeshBasicMaterial) {
        // Screenshots are opaque (their corners are geometry); only the phones and canvases carry alpha
        const src = m.map?.image?.src || '';
        if (src && !/snapshot-phone|brain-home|brain-voice/.test(src)) { m.transparent = false; m.alphaTest = 0; m.depthWrite = true; }
        o.material = glowing(m);
        o.material.name = `${p.id}_${o === piece.userData.glow ? 'light' : 'picture'}`;
        if (o !== piece.userData.glow && m.map) {
          // A back for every picture: its silhouette, in a dark satin
          const b = new THREE.Mesh(o.geometry, new THREE.MeshStandardMaterial({ name: `${p.id}_back`, color: dark ? '#1a1c22' : '#2a2c33', map: m.map, transparent: m.transparent, alphaTest: m.alphaTest, roughness: .45 }));
          b.rotation.y = Math.PI;
          b.position.z = -.25;
          extra.push([o, b]);
        }
      }
    });
    for (const [o, b] of extra) o.add(b);
    mm.add(piece);
  }

  preferJpeg(model);
  // Exporters write userData into the file; ours holds references to other objects, so clear it
  model.traverse((o) => {
    o.userData = {};
    if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.userData = {};
  });
  shrinkSoftTextures(model);
  splitGroups(model);
  model.scale.setScalar(.001);
  model.updateMatrixWorld(true);
  return model;
}

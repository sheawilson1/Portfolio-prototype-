// The pieces of the world: a pale sky over an endless floor, the eclipse standing on the horizon, the headline
// hanging in the air, and the work standing on the floor as panes of glass lit from behind by their own colours.
//
// Units are metres. The walk heads towards -z, where the disc stands on the horizon.
// Every material is unlit and works in the site's own colour space: textures are sampled raw and colours are
// mixed the way the browser mixes them, so a hex value here looks the same as it does in site.css.
import * as THREE from '../vendor/three/three.module.js';
import { CORONA, PROJECTS, MORE, squircleSlab, squirclePlane, hexA, asset } from './kit.js';

const D2R = Math.PI / 180;
export const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return new THREE.Vector3((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255);
};
const setRgb = (v, hex) => v.copy(rgb(hex));

/* ───────── Daylight and eclipse ───────── */
export const THEME = {
  light: {
    zenith: '#e8ebf0', horizon: '#f5f4f1', near: '#eeede9', far: '#f3f2ee', disc: '#ffffff', ink: '#0a0a0a', sheen: '#ffffff',
    shadowK: .34, poolMix: .3, poolAdd: 0, reflK: .75, ringK: .75, discReflK: .55,
    coronaK: 1, coronaW: 1.15, haloK: .1, rimK: .45, hazeK: 1,
    glowRest: .56, glowHot: 1, layerShadow: .18, sheenK: .5,
    glass: 1, smoke: '#131820', smokeA: .3, sky: '#f4f6fa',
  },
  dark: {
    zenith: '#04060a', horizon: '#0e1118', near: '#07090d', far: '#0b0e13', disc: '#030409', ink: '#f2f0eb', sheen: '#7d8699',
    shadowK: .6, poolMix: 0, poolAdd: .42, reflK: .95, ringK: .9, discReflK: 0,
    coronaK: .96, coronaW: 1.45, haloK: .26, rimK: .9, hazeK: 1,
    glowRest: .6, glowHot: 1, layerShadow: .6, sheenK: .35,
    glass: 0, smoke: '#131820', smokeA: .3, sky: '#8a93a6',
  },
};

// Whether things may move on their own (off with reduced motion)
export const MOTION = { on: true };

// Uniforms every material shares: the haze, and the slow turn of the corona
export const shared = {
  uFogColor: { value: rgb(THEME.light.horizon) },
  uFogDensity: { value: .0064 },
  uSpin: { value: 0 },
};

const CHUNK = /* glsl */`
uniform vec3 uFogColor;
uniform float uFogDensity;
vec3 fogMix(vec3 c, float d) { float k = d * uFogDensity; return mix(c, uFogColor, 1.0 - exp(-k * k)); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;
const VS = /* glsl */`
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vTangentW;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vTangentW = normalize(mat3(modelMatrix) * vec3(1.0, 0.0, 0.0));
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

/* ───────── Textures, raw ───────── */
const loader = new THREE.ImageLoader();
const cache = new Map();
// Pictures are drawn down to maxSize on their long side first, so a phone isn't holding desktop-sized textures
export const TEX = { maxSize: 1600 };
export function rawTexture(path) {
  const key = path + '@' + TEX.maxSize;
  if (!cache.has(key)) {
    cache.set(key, new Promise((resolve, reject) => loader.load(asset(path), (img) => {
      let src = img;
      const k = TEX.maxSize / Math.max(img.width, img.height);
      if (k < 1) {
        const [c, g] = canvas(img.width * k, img.height * k);
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, c.width, c.height);
        src = c;
      }
      const t = new THREE.Texture(src);
      t.colorSpace = THREE.NoColorSpace;
      t.premultiplyAlpha = true;
      t.anisotropy = 8;
      t.needsUpdate = true;
      resolve(t);
    }, undefined, reject)));
  }
  return cache.get(key);
}
function canvasTexture(c, { mips = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.premultiplyAlpha = true;
  t.anisotropy = 4;
  if (!mips) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
  return t;
}
function rrect(g, x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) { g.roundRect(x, y, w, h, r); return; }
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return [c, c.getContext('2d')];
}

// The corona's colours laid out in a strip, looked up by angle. In the dark the pale stops turn dark, as on the site.
function lutTexture(dark) {
  const [c, g] = canvas(512, 2);
  const lg = g.createLinearGradient(0, 0, 512, 0);
  for (const [deg, col] of CORONA) lg.addColorStop(deg / 360, dark ? ({ '#fde9cf': '#3a2a22', '#e3ebff': '#1c2436' }[col] || col) : col);
  g.fillStyle = lg;
  g.fillRect(0, 0, 512, 2);
  const t = canvasTexture(c, { mips: false });
  t.premultiplyAlpha = false;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
const LUT = { light: null, dark: null };
function lut(dark) {
  const k = dark ? 'dark' : 'light';
  return LUT[k] || (LUT[k] = lutTexture(dark));
}

/* ───────── Sky ───────── */
export function buildSky() {
  const uniforms = { uZenith: { value: rgb(THEME.light.zenith) }, uHorizon: { value: rgb(THEME.light.horizon) } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vDir = wp.xyz - cameraPosition;
        gl_Position = (projectionMatrix * viewMatrix * wp).xyww;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uZenith, uHorizon;
      varying vec3 vDir;
      ${CHUNK}
      void main() {
        float e = normalize(vDir).y;
        vec3 col = mix(uHorizon, uZenith, pow(smoothstep(0.0, 0.6, e), 0.8));
        gl_FragColor = vec4(col + (hash12(gl_FragCoord.xy) - 0.5) / 255.0, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1000; // last of the solid things, so it only fills what nothing else covered
  return {
    mesh,
    follow(camera) { mesh.position.copy(camera.position); },
    theme(t) { setRgb(uniforms.uZenith.value, t.zenith); setRgb(uniforms.uHorizon.value, t.horizon); },
  };
}

/* ───────── The eclipse: the disc and its ring of colour, drawn in one pass ───────── */
export const DISC = { x: 0, y: -55, z: -440, r: 150 };
const EXTENT = 1.9; // the quad reaches this many radii from the centre

export function buildEclipse() {
  const uniforms = {
    ...shared,
    uDiscCol: { value: rgb(THEME.light.disc) },
    uLut: { value: lut(false) },
    uCoronaK: { value: 1 }, uCoronaW: { value: 1.15 }, uHaloK: { value: .1 }, uRimK: { value: .45 },
    uHazeK: { value: .9 }, uHazeH: { value: 22 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: VS,
    fragmentShader: /* glsl */`
      uniform vec3 uDiscCol;
      uniform sampler2D uLut;
      uniform float uSpin, uCoronaK, uCoronaW, uHaloK, uRimK, uHazeK, uHazeH;
      varying vec2 vUv;
      varying vec3 vWorld;
      ${CHUNK}
      // The site's corona mask, in disc radii: solid under the disc, gone a little past its edge
      float coronaA(float r) {
        if (r < .885) return 1.0;
        if (r < .93) return mix(1.0, .86, (r - .885) / .045);
        if (r < .99) return mix(.86, .58, (r - .93) / .06);
        if (r < 1.05) return mix(.58, .3, (r - .99) / .06);
        if (r < 1.11) return mix(.3, .11, (r - 1.05) / .06);
        if (r < 1.18) return mix(.11, 0.0, (r - 1.11) / .07);
        return 0.0;
      }
      void main() {
        vec2 p = (vUv - 0.5) * 2.0 * ${EXTENT.toFixed(2)};
        float r = length(p);
        float ang = atan(p.x, p.y);
        vec3 cc = texture2D(uLut, vec2(fract(ang / 6.2831853 - uSpin), 0.5)).rgb;
        float a = coronaA(1.0 + (r - 1.0) / uCoronaW) * uCoronaK;
        a += uHaloK * exp(-pow(max(r - 1.0, 0.0) / 0.42, 2.0));
        a = clamp(a, 0.0, 1.0);
        float aa = fwidth(r) * 1.25;
        float inside = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
        float rim = exp(-pow((r - 0.993) / max(0.006, aa), 2.0)) * uRimK;
        vec3 face = mix(uDiscCol, min(cc * 1.25 + 0.04, 1.0), rim);
        vec3 col = mix(cc, face, inside);
        float alpha = max(a, inside);
        // where it meets the floor it sinks into the haze
        float haze = pow(1.0 - smoothstep(0.0, uHazeH, vWorld.y), 1.6) * uHazeK;
        col = mix(col, uFogColor, haze);
        gl_FragColor = vec4(col * alpha, alpha);
      }`,
    transparent: true, premultipliedAlpha: true, depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(DISC.r * EXTENT * 2, DISC.r * EXTENT * 2), mat);
  mesh.position.set(DISC.x, DISC.y, DISC.z);
  mesh.renderOrder = -10;
  return {
    mesh, uniforms,
    theme(t, dark) {
      setRgb(uniforms.uDiscCol.value, t.disc);
      uniforms.uLut.value = lut(dark);
      uniforms.uCoronaK.value = t.coronaK; uniforms.uCoronaW.value = t.coronaW; uniforms.uHaloK.value = t.haloK;
      uniforms.uRimK.value = t.rimK; uniforms.uHazeK.value = t.hazeK;
    },
  };
}

/* ───────── The floor: soft contact shadows, each pane's light, and the eclipse reflected ───────── */
export function buildGround(panes) {
  const n = panes.length;
  const uniforms = {
    ...shared,
    uNear: { value: rgb(THEME.light.near) }, uFar: { value: rgb(THEME.light.far) },
    uPane: { value: panes.map((p) => new THREE.Vector4(p.x, p.z, Math.cos(p.yaw), Math.sin(p.yaw))) },
    uPaneK: { value: panes.map((p) => new THREE.Vector4(p.def.w / 2, .7, 1, 0)) },
    uPaneA: { value: panes.map((p) => rgb(p.def.colors[0])) },
    uPaneB: { value: panes.map((p) => rgb(p.def.colors[1])) },
    uPaneC: { value: panes.map((p) => rgb(p.def.colors[2])) },
    uShadowK: { value: .34 }, uPoolMix: { value: .3 }, uPoolAdd: { value: 0 },
    uReflK: { value: .75 }, uRingK: { value: .75 }, uDiscReflK: { value: .55 },
    uDisc: { value: new THREE.Vector4(DISC.x, DISC.y, DISC.z, DISC.r) },
    uDiscCol: { value: rgb(THEME.light.disc) },
    uLut: { value: lut(false) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: VS,
    fragmentShader: /* glsl */`
      #define NP ${n}
      uniform vec3 uNear, uFar, uDiscCol;
      uniform vec4 uPane[NP];
      uniform vec4 uPaneK[NP];
      uniform vec3 uPaneA[NP];
      uniform vec3 uPaneB[NP];
      uniform vec3 uPaneC[NP];
      uniform float uShadowK, uPoolMix, uPoolAdd, uReflK, uRingK, uDiscReflK, uSpin;
      uniform vec4 uDisc;
      uniform sampler2D uLut;
      varying vec3 vWorld;
      ${CHUNK}
      float band(float x, float h, float s) { return 1.0 - smoothstep(h - s, h + s, abs(x)); }
      void main() {
        vec3 P = vWorld;
        vec3 toP = P - cameraPosition;
        float dist = length(toP);
        vec3 col = mix(uNear, uFar, smoothstep(4.0, 150.0, dist));

        float shadow = 0.0;
        vec3 light = vec3(0.0);
        float lightA = 0.0;
        for (int i = 0; i < NP; i++) {
          vec2 rel = P.xz - uPane[i].xy;
          float d2 = dot(rel, rel);
          if (d2 > 90.0) continue;
          float c = uPane[i].z, s = uPane[i].w, hw = uPaneK[i].x;
          float u = rel.x * c - rel.y * s;   // along the pane
          float v = rel.x * s + rel.y * c;   // out of its face, towards the viewer (the disc lights it from behind)
          float core = exp(-pow(v / 0.075, 2.0)) * band(u, hw - 0.02, 0.05);
          float soft = exp(-pow((v - 0.45) / 0.95, 2.0)) * band(u, hw + 0.1, 0.6);
          float amb = exp(-d2 / (hw * hw * 2.4 + 1.5));
          shadow += (core * 0.85 + soft * 0.32 + amb * 0.1) * uPaneK[i].z;
          float t = clamp(u / hw * 0.5 + 0.5, 0.0, 1.0);
          vec3 lc = t < 0.5 ? mix(uPaneA[i], uPaneB[i], t * 2.0) : mix(uPaneB[i], uPaneC[i], t * 2.0 - 1.0);
          float li = band(u, hw * 0.8, hw * 0.45) * (exp(-pow((v - 0.75) / 0.95, 2.0)) + 0.4 * exp(-pow((v + 0.5) / 0.7, 2.0)));
          li *= uPaneK[i].y;
          light += lc * li;
          lightA += li;
        }
        col *= 1.0 - clamp(shadow, 0.0, 1.0) * uShadowK;
        if (lightA > 0.001) {
          vec3 lc = light / lightA;
          float a = clamp(lightA, 0.0, 1.0);
          col = mix(col, lc, a * uPoolMix);
          col += lc * a * uPoolAdd;
        }

        // The eclipse, softly reflected: follow the view ray up off the floor to the disc's plane
        vec3 V = toP / max(dist, 1e-4);
        vec3 R = vec3(V.x, -V.y, V.z);
        if (R.z < -0.001) {
          float tt = (uDisc.z - P.z) / R.z;
          vec3 Q = P + R * tt;
          vec2 d = (Q.xy - uDisc.xy) / uDisc.w;
          d.y = (d.y - 0.3) * 0.7 + 0.3; // reflections stretch towards you
          float r = length(d);
          float ang = atan(d.x, d.y);
          vec3 cc = texture2D(uLut, vec2(fract(ang / 6.2831853 - uSpin), 0.5)).rgb;
          float ring = exp(-pow((r - 1.03) / 0.17, 2.0));
          float disc = 1.0 - smoothstep(0.8, 1.04, r);
          float fres = pow(1.0 - abs(V.y), 10.0);
          col = mix(col, cc, clamp(ring * uRingK * fres * uReflK, 0.0, 1.0));
          col = mix(col, uDiscCol, clamp(disc * uDiscReflK * fres * uReflK, 0.0, 1.0));
        }

        col = fogMix(col, dist);
        gl_FragColor = vec4(col + (hash12(gl_FragCoord.xy) - 0.5) / 255.0, 1.0);
      }`,
  });
  const geo = new THREE.CircleGeometry(1800, 96);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 900;
  return {
    mesh, uniforms,
    follow(camera) { mesh.position.set(camera.position.x, 0, camera.position.z); },
    theme(t, dark) {
      setRgb(uniforms.uNear.value, t.near); setRgb(uniforms.uFar.value, t.far); setRgb(uniforms.uDiscCol.value, t.disc);
      uniforms.uShadowK.value = t.shadowK; uniforms.uPoolMix.value = t.poolMix; uniforms.uPoolAdd.value = t.poolAdd;
      uniforms.uReflK.value = t.reflK; uniforms.uRingK.value = t.ringK; uniforms.uDiscReflK.value = t.discReflK;
      uniforms.uLut.value = lut(dark);
    },
  };
}

/* ───────── Type in the air ───────── */
// lines: [[text, italic], ...] per line. White on clear; the material tints it with the ink colour.
function typeCanvas(lines, { size = 200, lineHeight = 1.08, pad = .16 } = {}) {
  const [, probe] = canvas(4, 4);
  const tracked = 'letterSpacing' in probe;
  const font = (g, italic) => {
    g.font = `${italic ? 'italic ' : ''}300 ${size}px Spectral`;
    if (tracked) { g.letterSpacing = `${(italic ? -.022 : -.03) * size}px`; g.wordSpacing = `${-.04 * size}px`; }
  };
  const widths = lines.map((runs) => runs.reduce((w, [text, italic]) => { font(probe, italic); return w + probe.measureText(text).width; }, 0));
  const W = Math.ceil(Math.max(...widths) + size * pad * 2);
  const lh = size * lineHeight;
  const H = Math.ceil(lh * lines.length + size * pad * 2);
  const [c, g] = canvas(W, H);
  g.fillStyle = '#ffffff';
  g.textBaseline = 'alphabetic';
  lines.forEach((runs, k) => {
    let x = (W - widths[k]) / 2;
    const y = size * pad + lh * k + lh * .8;
    for (const [text, italic] of runs) { font(g, italic); g.fillText(text, x, y); x += g.measureText(text).width; }
  });
  return c;
}

export function buildType(lines, { height, size = 200 } = {}) {
  const c = typeCanvas(lines, { size });
  const uniforms = { ...shared, uMap: { value: canvasTexture(c) }, uInk: { value: rgb(THEME.light.ink) }, uOpacity: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: VS,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      uniform vec3 uInk;
      uniform float uOpacity;
      varying vec2 vUv;
      varying vec3 vWorld;
      ${CHUNK}
      void main() {
        float a = texture2D(uMap, vUv).a * uOpacity;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uInk * a, a);
      }`,
    transparent: true, premultipliedAlpha: true, depthWrite: false,
  });
  const width = height * c.width / c.height;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  return { mesh, uniforms, width, height, theme(t) { setRgb(uniforms.uInk.value, t.ink); } };
}

/* ───────── The work ───────── */
const IMG = (n) => `assets/media/home/${n}.webp`;
const MORE_COLORS = { cipher: ['#0ec980', '#1ab796', '#7cf0c0'], amp: ['#ff6a2b', '#c33f1f', '#ffb347'], captr: ['#0f88f0', '#0a5fd0', '#5ab4ff'] };

// Each pane: its size, the site's colour blobs (x, y are the centre as fractions of the pane from the top left,
// w the width as a fraction of the pane, ar the aspect, rot in degrees) and the pictures in front of the glass.
// Pictures are placed from the pane's centre in metres; z is how far they stand off the glass.
const COMPOSE = {
  snapshot: {
    w: 3.1, h: 2.7,
    blobs: [{ x: .36, y: .3, w: .9, ar: 1.5, rot: -18 }, { x: .72, y: .52, w: .78, ar: 1.8, rot: 24 }, { x: .44, y: .78, w: .66, ar: 1.3, rot: -8 }],
    layers: [
      { src: IMG('snapshot-results'), w: 1.96, x: -.4, y: .14, rot: -5, z: .08, r: .06 },
      { src: IMG('snapshot-phone'), h: 2.02, x: .74, y: -.07, rot: 0, z: .24, alpha: true },
    ],
  },
  jumpstart: {
    w: 3.3, h: 2.6,
    blobs: [{ x: .3, y: .34, w: .9, ar: 1.5, rot: -14 }, { x: .58, y: .6, w: .72, ar: 1.7, rot: 18 }, { x: .76, y: .3, w: .56, ar: 1.3, rot: -6 }],
    layers: [
      { src: IMG('jumpstart-agency'), dark: IMG('jumpstart-agency-dark'), w: 2.04, x: -.52, y: .37, rot: -4, z: .07, r: .05 },
      { src: IMG('jumpstart-report'), dark: IMG('jumpstart-report-dark'), w: 1.56, x: .38, y: -.13, rot: 1.5, z: .16, r: .05 },
      { src: IMG('jumpstart-export'), dark: IMG('jumpstart-export-dark'), w: .98, x: 1.1, y: -.68, rot: 4, z: .26, r: .04 },
    ],
  },
  heart: {
    w: 2.5, h: 2.9,
    blobs: [{ x: .56, y: .38, w: 1.0, ar: 1.5, rot: -22 }, { x: .64, y: .52, w: .62, ar: 1.4, rot: 16 }, { x: .3, y: .7, w: .8, ar: 1.9, rot: 8 }],
    layers: [{ src: IMG('heart-health-hand'), w: 2.28, x: .06, bottom: 0.015, z: .16, alpha: true, fade: .1, heart: true }],
  },
  brain: {
    w: 2.2, h: 2.9,
    blobs: [{ x: .5, y: .44, w: 1.1, ar: 1.5, rot: -12 }, { x: .3, y: .66, w: .7, ar: 1.8, rot: 20 }, { x: .72, y: .58, w: .6, ar: 1.3, rot: -24 }],
    layers: [
      { src: IMG('brain-voice'), h: 1.76, x: -.42, y: .1, rot: -8, z: .08, alpha: true },
      { src: IMG('brain-home'), h: 2.02, x: .3, y: -.06, rot: 3, z: .2, alpha: true, cycle: [IMG('brain-ai-input'), IMG('brain-card-selection')] },
    ],
  },
  // the photos are 4:3 (Captr's 3:2 is extended to 4:3 with its own backdrop), 1.62 m wide, with 0.14 m all round
  small: {
    w: 1.9, h: 1.495, radius: .22,
    blobs: [{ x: .5, y: .5, w: 1.15, ar: 1.3, rot: -12 }, { x: .28, y: .7, w: .72, ar: 1.7, rot: 18 }, { x: .74, y: .62, w: .62, ar: 1.3, rot: -20 }],
  },
};

export const WORKS = [
  ...PROJECTS.map((p) => ({ ...p, ...COMPOSE[p.id], main: true })),
  ...MORE.map((p) => ({
    ...p, colors: MORE_COLORS[p.id], ...COMPOSE.small, main: false,
    layers: [{ src: p.img, w: 1.62, x: 0, y: 0, z: .035, r: .08, aspect: 4 / 3 }],
  })),
];

// Where they stand: alternating either side of a path that bends gently on its way to the disc
export const pathX = (z) => 2.2 * Math.sin((z + 6) / 26);
const PLACE = { snapshot: -18, jumpstart: -34, heart: -50, brain: -65, cipher: -79, amp: -86, captr: -93 };
export function placeWorks() {
  return WORKS.map((def, i) => {
    const side = i % 2 === 0 ? 1 : -1;
    const z = PLACE[def.id];
    const off = def.main ? 4.3 : 3.5;
    return { def, side, z, x: pathX(z) + side * off, yaw: -side * .42 };
  });
}

// The glass: the site's card, baked. Its colour, the light behind it and the frosting, composited like the CSS.
function drawBlob(g, { c, x, y, w, ar = 1.5, rot = 0 }, W, H, k = 1) {
  const rx = w * W / 2, ry = rx / ar;
  g.save();
  g.translate(x * W, y * H);
  g.rotate(rot * D2R);
  g.scale(1, ry / rx);
  const rg = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  [[0, .78], [.26, .54], [.48, .3], [.7, .12], [.88, .03], [1, 0]].forEach(([s, a]) => rg.addColorStop(s, hexA(c, a * k)));
  g.fillStyle = rg;
  g.fillRect(-rx, -rx, rx * 2, rx * 2);
  g.restore();
}
function washCanvas(def, dark) {
  const ppm = 120;
  const W = def.w * ppm, H = def.h * ppm;
  const [c, g] = canvas(W, H);
  g.fillStyle = dark ? '#05070b' : '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  // the shared wash under the blobs (the site's blurred conic), then the blobs
  const wash = g.createLinearGradient(0, 0, c.width, c.height);
  wash.addColorStop(0, hexA(def.colors[0], dark ? .2 : .1));
  wash.addColorStop(.5, hexA(def.colors[1], dark ? .16 : .07));
  wash.addColorStop(1, hexA(def.colors[2], dark ? .2 : .1));
  g.fillStyle = wash;
  g.fillRect(0, 0, c.width, c.height);
  def.blobs.forEach((b, k) => drawBlob(g, { ...b, w: b.w * .74, c: def.colors[k % 3] }, c.width, c.height, dark ? 1.15 : 1.08));
  g.fillStyle = dark ? 'rgba(18, 21, 28, .38)' : 'rgba(255, 255, 255, .44)';
  g.fillRect(0, 0, c.width, c.height);
  return c;
}
// In daylight the glass is see-through, so it holds only the project's light: the blobs, on nothing
function tintCanvas(def) {
  const ppm = 90;
  const [c, g] = canvas(def.w * ppm, def.h * ppm);
  def.blobs.forEach((b, k) => drawBlob(g, { ...b, w: b.w * .8, c: def.colors[k % 3] }, c.width, c.height, .95));
  return c;
}
// The light behind the glass, bigger than the pane so it spills round the edges
function glowCanvas(def, gw, gh) {
  const ppm = 64;
  const [c, g] = canvas(gw * ppm, gh * ppm);
  const map = (b) => ({ ...b, x: (b.x - .5) * def.w / gw + .5, y: (b.y - .5) * def.h / gh + .5, w: b.w * def.w / gw * 1.35 });
  def.blobs.forEach((b, k) => drawBlob(g, { ...map(b), c: def.colors[k % 3] }, c.width, c.height, 1));
  // a soft box of light just bigger than the glass, so light spills round every edge
  const [pc, pg] = canvas(28, 28);
  const lg = pg.createLinearGradient(8, 8, 20, 20);
  def.colors.forEach((col, k) => lg.addColorStop(k / 2, hexA(col, .62)));
  pg.fillStyle = lg;
  rrect(pg, 8, 8, 12, 12, 3);
  pg.fill();
  g.imageSmoothingQuality = 'high';
  const pw = (def.w + .1) / gw * c.width * 28 / 12, ph = (def.h + .1) / gh * c.height * 28 / 12;
  g.drawImage(pc, (c.width - pw) / 2, (c.height - ph) / 2, pw, ph);
  return c;
}
// A soft shadow shaped like a picture: its own alpha for cut-outs, a rounded box for screens
function shadowCanvas(img, { rounded = 0, blur = 16, pad = .32 } = {}) {
  const base = 200;
  const aspect = img.width / img.height;
  const cw = aspect >= 1 ? base : base * aspect, ch = aspect >= 1 ? base / aspect : base;
  const px = base * pad;
  const [c, g] = canvas(cw + px * 2, ch + px * 2);
  const off = c.width * 3;
  g.shadowColor = '#000';
  g.shadowBlur = blur;
  g.shadowOffsetX = off;
  if (rounded) {
    rrect(g, px - off, px, cw, ch, rounded * Math.min(cw, ch));
    g.fill();
  } else {
    g.drawImage(img, px - off, px, cw, ch);
  }
  return { canvas: c, sx: c.width / cw, sy: c.height / ch };
}

// A photo that's a different shape from its frame is extended with its own backdrop (its edge rows drawn
// outwards), never cropped, so every frame can have the same padding all round
function extendTo(tex, aspect) {
  const img = tex.image, w = img.width, h = img.height;
  if (Math.abs(w / h - aspect) < .01) return tex;
  const W = w / h > aspect ? w : Math.round(h * aspect), H = w / h > aspect ? Math.round(w / aspect) : h;
  const [c, g] = canvas(W, H);
  const x = (W - w) / 2, y = (H - h) / 2;
  // each edge, softened along its length first so the stretch doesn't streak
  const edge = (sx, sy, sw, sh, dx, dy, dw, dh, alongX) => {
    const [e, eg] = canvas(alongX ? Math.max(8, sw / 10) : 1, alongX ? 1 : Math.max(8, sh / 10));
    eg.imageSmoothingQuality = 'high';
    eg.drawImage(img, sx, sy, sw, sh, 0, 0, e.width, e.height);
    g.imageSmoothingQuality = 'high';
    g.drawImage(e, dx, dy, dw, dh);
  };
  if (H > h) { edge(0, 0, w, 3, 0, 0, W, y + 3, true); edge(0, h - 3, w, 3, 0, y + h - 3, W, H - y - h + 3, true); }
  else { edge(0, 0, 3, h, 0, 0, x + 3, H, false); edge(w - 3, 0, 3, h, x + w - 3, 0, W - x - w + 3, H, false); }
  g.drawImage(img, x, y, w, h);
  const t = new THREE.Texture(c);
  t.colorSpace = THREE.NoColorSpace; t.premultiplyAlpha = true; t.anisotropy = 8; t.needsUpdate = true;
  return t;
}

function imageMaterial(map, { opaque = false, fade = 0 } = {}) {
  const uniforms = { ...shared, uMap: { value: map }, uMap2: { value: map }, uMix: { value: 0 }, uOpacity: { value: 1 }, uFade: { value: fade } };
  return new THREE.ShaderMaterial({
    uniforms, vertexShader: VS,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap, uMap2;
      uniform float uOpacity, uFade, uMix;
      varying vec2 vUv;
      varying vec3 vWorld;
      ${CHUNK}
      void main() {
        vec4 t = texture2D(uMap, vUv);
        if (uMix > 0.0) t = mix(t, texture2D(uMap2, vUv), uMix); // both premultiplied, so this is a clean cross-fade
        float a = t.a * uOpacity * (uFade > 0.0 ? smoothstep(0.0, uFade, vUv.y) : 1.0);
        if (a < 0.01) discard;
        vec3 c = fogMix(t.rgb / max(t.a, 1e-4), length(vWorld - cameraPosition));
        gl_FragColor = vec4(c * a, a);
      }`,
    transparent: !opaque, premultipliedAlpha: true, depthWrite: true,
  });
}
function tintMaterial(map, strength) {
  const uniforms = { ...shared, uMap: { value: map }, uK: { value: strength }, uTint: { value: rgb('#0a1030') } };
  return new THREE.ShaderMaterial({
    uniforms, vertexShader: VS,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      uniform float uK;
      uniform vec3 uTint;
      varying vec2 vUv;
      varying vec3 vWorld;
      ${CHUNK}
      void main() {
        float a = texture2D(uMap, vUv).a * uK;
        if (a < 0.004) discard;
        gl_FragColor = vec4(fogMix(uTint, length(vWorld - cameraPosition)) * a, a);
      }`,
    transparent: true, premultipliedAlpha: true, depthWrite: false,
  });
}

// The iPad in the hand plays the site's own recording, warped onto its screen like the homepage does it
// (the same matrix3d, inverted, so each pixel of the photo looks up the frame it shows).
const HEART = { w: 1300, h: 1459, vw: 1074, vh: 798, m: [.8004473027, .4951110373, -2.213186288e-06, -.5043599205, .8130808222, -3.831731488e-06, 420.6205963, 16.46801333, 1] };
function heartScreenMaterial(video) {
  const [a1, b1, d1, a2, b2, d2, a4, b4, d4] = HEART.m;
  const inv = new THREE.Matrix3().set(a1, a2, a4, b1, b2, b4, d1, d2, d4).invert();
  const uniforms = { ...shared, uMap: { value: video }, uInv: { value: inv }, uOpacity: { value: 0 } };
  return new THREE.ShaderMaterial({
    uniforms, vertexShader: VS,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      uniform mat3 uInv;
      uniform float uOpacity;
      varying vec2 vUv;
      varying vec3 vWorld;
      ${CHUNK}
      void main() {
        vec3 p = uInv * vec3(vUv.x * ${HEART.w}.0, (1.0 - vUv.y) * ${HEART.h}.0, 1.0);
        vec2 s = p.xy / p.z / vec2(${HEART.vw}.0, ${HEART.vh}.0);
        if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0 || uOpacity < 0.01) discard;
        vec3 c = texture2D(uMap, vec2(s.x, 1.0 - s.y)).rgb;
        c = fogMix(c, length(vWorld - cameraPosition));
        gl_FragColor = vec4(c * uOpacity, uOpacity);
      }`,
    transparent: true, premultipliedAlpha: true, depthWrite: false,
  });
}

export async function buildPane(place, dark) {
  const { def } = place;
  const group = new THREE.Group();
  group.name = def.id;
  group.position.set(place.x, 0, place.z);
  group.rotation.y = place.yaw;
  const holder = new THREE.Group();
  holder.position.y = def.h / 2;
  group.add(holder);

  // The slab of glass
  const depth = def.main ? .07 : .06;
  const radius = def.radius ?? Math.min(def.w, def.h) * .1;
  const wash = { dark: canvasTexture(washCanvas(def, true)) }; // daylight glass is drawn live, not baked
  const faceU = {
    ...shared, uWash: { value: wash.dark }, uTint: { value: canvasTexture(tintCanvas(def)) },
    uSheen: { value: rgb('#ffffff') }, uSheenK: { value: .5 }, uGlass: { value: dark ? 0 : 1 },
    uSmoke: { value: rgb(THEME.light.smoke) }, uSmokeA: { value: THEME.light.smokeA }, uSky: { value: rgb(THEME.light.sky) },
    uSize: { value: new THREE.Vector2(def.w, def.h) }, uRadius: { value: radius }, uBevel: { value: .014 },
  };
  const faceMat = new THREE.ShaderMaterial({
    uniforms: faceU, vertexShader: VS,
    fragmentShader: /* glsl */`
      uniform sampler2D uWash, uTint;
      uniform vec3 uSheen, uSmoke, uSky;
      uniform float uSheenK, uGlass, uSmokeA, uRadius, uBevel;
      uniform vec2 uSize;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying vec3 vTangentW;
      ${CHUNK}
      // distance to the pane's outline (continuous corners, like the geometry), negative inside
      float sdPane(vec2 p, vec2 b, float r) {
        vec2 q = abs(p) - b + r;
        if (q.x > 0.0 && q.y > 0.0) return pow(pow(q.x, 4.2) + pow(q.y, 4.2), 1.0 / 4.2) - r;
        return max(q.x, q.y) - r;
      }
      void main() {
        vec3 V = normalize(cameraPosition - vWorld);
        float ndv = abs(dot(normalize(vNormalW), V));
        float fres = pow(1.0 - ndv, 3.0);
        // a soft diagonal sheen that slides across as you pass
        float slide = 0.55 + dot(V, normalize(vTangentW)) * 1.6;
        float band = exp(-pow((vUv.x * 0.8 + vUv.y * 0.55 - slide) / 0.16, 2.0));
        float dist = length(vWorld - cameraPosition);

        // Eclipse: smoked glass over the project's colour, baked like the site's card
        vec3 card = texture2D(uWash, vUv).rgb;
        card = mix(card, uSheen, fres * uSheenK);
        card = mix(card, uSheen, smoothstep(0.35, 1.0, vUv.y) * 0.06 * uSheenK);
        card = mix(card, uSheen, band * 0.16 * uSheenK);
        card = fogMix(card, dist);

        // Daylight: tinted glass you can see the world through, the project's light held in it,
        // more reflective at a glancing angle, and a crisp lit line just inside its edge
        float edge = -(sdPane((vUv - 0.5) * uSize, uSize * 0.5, uRadius) + uBevel);
        float rim = 1.0 - smoothstep(0.004, 0.016, edge);
        vec4 tint = texture2D(uTint, vUv);
        float top = smoothstep(0.2, 1.0, vUv.y);
        float a = uSmokeA + fres * 0.34 + top * 0.04 + band * 0.06 + tint.a * 0.16 + rim * 0.5;
        vec3 c = uSmoke * uSmokeA + uSky * (fres * 0.34 + top * 0.04) + vec3(band * 0.06) + tint.rgb * 0.62 + vec3(rim * 0.62);
        a = clamp(a, 0.0, 1.0);
        float k = dist * uFogDensity;
        float f = 1.0 - exp(-k * k);
        c = mix(c, uFogColor * a, f);

        gl_FragColor = mix(vec4(card, 1.0), vec4(c, a), uGlass);
      }`,
    transparent: true, premultipliedAlpha: true, depthWrite: true,
  });
  const tone = rgb(def.tone);
  const edgeU = { ...shared, uEdge: { value: rgb('#ffffff') }, uTone: { value: tone }, uHot: { value: 0 }, uLow: { value: .9 }, uTint: { value: .05 } };
  const edgeMat = new THREE.ShaderMaterial({
    uniforms: edgeU, vertexShader: VS,
    fragmentShader: /* glsl */`
      uniform vec3 uEdge, uTone;
      uniform float uHot, uLow, uTint;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      ${CHUNK}
      void main() {
        vec3 N = normalize(vNormalW);
        vec3 V = normalize(cameraPosition - vWorld);
        float lit = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 c = mix(uEdge * uLow, uEdge, lit);
        c = mix(c, uTone, uTint + uHot * 0.22);
        c = mix(c, uEdge, pow(1.0 - abs(dot(N, V)), 2.0) * 0.35);
        gl_FragColor = vec4(fogMix(c, length(vWorld - cameraPosition)), 1.0);
      }`,
  });
  const slab = new THREE.Mesh(squircleSlab(def.w, def.h, radius, depth, .014), [faceMat, edgeMat]);
  slab.renderOrder = .5; // after the light behind it, before the pictures in front
  holder.add(slab);

  // The light behind it
  const gw = def.w + 2.6, gh = def.h + 2.0;
  const glowU = { ...shared, uMap: { value: canvasTexture(glowCanvas(def, gw, gh)) }, uK: { value: .5 } };
  const glowMat = new THREE.ShaderMaterial({
    uniforms: glowU, vertexShader: VS,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      uniform float uK;
      varying vec2 vUv;
      varying vec3 vWorld;
      ${CHUNK}
      void main() {
        vec4 t = texture2D(uMap, vUv);
        float a = t.a * uK * smoothstep(0.0, 0.7, vWorld.y); // fades before it reaches the floor
        if (a < 0.002) discard;
        vec3 c = fogMix(t.rgb / max(t.a, 1e-4), length(vWorld - cameraPosition));
        gl_FragColor = vec4(c * a, a);
      }`,
    transparent: true, premultipliedAlpha: true, depthWrite: false,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(gw, gh), glowMat);
  glow.position.z = -.32;
  glow.renderOrder = 0;
  holder.add(glow);

  // The pictures, each with a soft shadow on the glass
  const face = depth / 2 + .004;
  const pictures = [];
  let heart = null;
  let cycler = null;
  for (const L of def.layers) {
    const startDark = dark && !!L.dark;
    let tex = await rawTexture(startDark ? L.dark : L.src);
    if (L.aspect) tex = extendTo(tex, L.aspect);
    const aspect = tex.image.width / tex.image.height;
    const w = L.w ?? L.h * aspect, h = L.h ?? L.w / aspect;
    const y = L.bottom !== undefined ? -def.h / 2 + L.bottom + h / 2 : L.y;
    const opaque = !L.alpha;
    const mat = imageMaterial(tex, { opaque, fade: L.fade || 0 });
    const geo = L.r ? squirclePlane(w, h, L.r) : new THREE.PlaneGeometry(w, h);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(L.x, y, face + L.z);
    mesh.rotation.z = (L.rot || 0) * D2R;
    mesh.renderOrder = 2;
    holder.add(mesh);

    const sh = shadowCanvas(tex.image, { rounded: L.alpha ? 0 : L.r / Math.min(w, h), blur: L.alpha ? 14 : 18 });
    const smat = tintMaterial(canvasTexture(sh.canvas), .3);
    const smesh = new THREE.Mesh(new THREE.PlaneGeometry(w * sh.sx, h * sh.sy), smat);
    const drop = .05 + L.z * .35;
    smesh.position.set(L.x + L.z * .12, y - drop, face + .002);
    smesh.rotation.z = mesh.rotation.z;
    smesh.renderOrder = 1;
    holder.add(smesh);
    pictures.push({ mesh, mat, shadow: smat, src: { light: L.src, dark: L.dark || null }, tex: { light: startDark ? null : tex, dark: startDark ? tex : null } });
    if (L.cycle) cycler = { mat, frames: [tex, ...(await Promise.all(L.cycle.map(rawTexture)))], i: 0, t: 0, fade: 0 };

    if (L.heart) {
      // the recording on the screen, and the fingers and bezel over it
      const front = await rawTexture('assets/media/heart/heart-front.webp');
      const video = document.createElement('video');
      Object.assign(video, { muted: true, loop: true, playsInline: true, preload: 'none' });
      video.setAttribute('muted', ''); video.setAttribute('playsinline', '');
      for (const [src, type] of [['assets/media/heart/heart-screen.mp4', 'video/mp4'], ['assets/media/heart/heart-screen.webm', 'video/webm']]) {
        const s = document.createElement('source'); s.src = asset(src); s.type = type; video.appendChild(s);
      }
      const vtex = new THREE.VideoTexture(video);
      vtex.colorSpace = THREE.NoColorSpace;
      vtex.generateMipmaps = false;
      vtex.minFilter = THREE.LinearFilter;
      const smat2 = heartScreenMaterial(vtex);
      const screen = new THREE.Mesh(geo, smat2);
      screen.position.copy(mesh.position); screen.position.z += .002;
      screen.renderOrder = 3;
      const fmat = imageMaterial(front, { fade: L.fade });
      const fmesh = new THREE.Mesh(geo, fmat);
      fmesh.position.copy(mesh.position); fmesh.position.z += .004;
      fmesh.renderOrder = 4;
      holder.add(screen, fmesh);
      heart = { video, screen: smat2, front: fmat, started: false, on: 0 };
    }
  }

  // Something to catch taps and pointers
  const hit = new THREE.Mesh(new THREE.BoxGeometry(def.w + .2, def.h + .2, .6), new THREE.MeshBasicMaterial({ visible: false }));
  hit.userData.pane = def.id;
  holder.add(hit);

  const state = { hot: 0, hover: 0 };
  return {
    ...place, group, holder, hit, glow, faceMat, edgeMat, pictures, heart, state,
    centre: new THREE.Vector3(place.x, def.h / 2, place.z),
    normal: new THREE.Vector3(Math.sin(place.yaw), 0, Math.cos(place.yaw)),
    theme(t, isDark) {
      faceU.uGlass.value = t.glass; setRgb(faceU.uSmoke.value, t.smoke); faceU.uSmokeA.value = t.smokeA; setRgb(faceU.uSky.value, t.sky);
      setRgb(faceU.uSheen.value, t.sheen);
      faceU.uSheenK.value = t.sheenK;
      setRgb(edgeU.uEdge.value, isDark ? '#2a303c' : '#ffffff');
      edgeU.uLow.value = isDark ? .6 : .9;
      edgeU.uTint.value = isDark ? .18 : .05;
      this.dark = isDark;
      for (const p of pictures) {
        if (p.src.dark) {
          const k = isDark ? 'dark' : 'light';
          if (p.tex[k]) p.mat.uniforms.uMap.value = p.tex[k];
          else rawTexture(p.src[k]).then((tx) => { p.tex[k] = tx; if (this.dark === isDark) p.mat.uniforms.uMap.value = tx; });
        }
        p.shadow.uniforms.uK.value = t.layerShadow;
      }
      this.t = t;
    },
    // Fetch the pictures for the other theme, so switching later doesn't wait on the network
    async preload() {
      const out = [];
      for (const p of pictures) {
        if (!p.src.dark) continue;
        for (const k of ['light', 'dark']) if (!p.tex[k]) out.push(p.tex[k] = await rawTexture(p.src[k]));
      }
      return out;
    },
    tick(dt, hot, hover) {
      const k = 1 - Math.exp(-dt * 5);
      state.hot += (hot - state.hot) * k;
      state.hover += (hover - state.hover) * (1 - Math.exp(-dt * 8));
      const t = this.t || THEME.light;
      glowU.uK.value = THREE.MathUtils.lerp(t.glowRest, t.glowHot, Math.max(state.hot, state.hover * .7));
      edgeU.uHot.value = Math.max(state.hot * .6, state.hover);
      if (cycler) {
        const c = cycler, u = c.mat.uniforms;
        if (c.fade > 0) {
          c.fade = Math.min(1, c.fade + dt / .9);
          u.uMix.value = c.fade * c.fade * (3 - 2 * c.fade);
          if (c.fade >= 1) { c.i = (c.i + 1) % c.frames.length; u.uMap.value = c.frames[c.i]; u.uMix.value = 0; c.fade = 0; }
        } else if (MOTION.on && hot > .9) {
          c.t += dt;
          if (c.t > 2.6) { c.t = 0; u.uMap2.value = c.frames[(c.i + 1) % c.frames.length]; c.fade = 1e-4; }
        } else if (hot < .1 && c.i !== 0) { c.i = 0; c.t = 0; u.uMap.value = c.frames[0]; } // back to the home screen when you've gone
      }
    },
  };
}

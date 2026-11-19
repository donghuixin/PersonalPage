// News Flight — the world: sky, clouds, distant cliffs, an endless flower meadow and the petals
// the broom tears out of it. Everything is procedural (no textures or models to download).
// Visual ideas after Petalwake by Jacob Miller (MIT): https://github.com/jjcm/petalwake
import * as THREE from '../vendor/three/three.module.min.js';

// ------------------------------------------------------------------------------------------
// Noise shared by every shader
// ------------------------------------------------------------------------------------------
const GLSL_NOISE = /* glsl */`
float nf_hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float nf_noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(nf_hash(i), nf_hash(i + vec2(1.0, 0.0)), u.x),
             mix(nf_hash(i + vec2(0.0, 1.0)), nf_hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float nf_fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * nf_noise(p); p *= 2.03; a *= 0.5; }
  return s;
}
`;

// GLSL's smoothstep and mix, for the CPU copies of the terrain
const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ------------------------------------------------------------------------------------------
// Terrains. Each one has the same height function on the CPU (flight, balloons, particles) and
// in GLSL (ground, grass, flowers, water), plus where the coast is and where plants grow.
// ------------------------------------------------------------------------------------------
function meadowH(x, z) {
  return 1.6 * Math.sin(x * 0.013 + 1.3) * Math.cos(z * 0.011)
    + 0.9 * Math.sin((x + z) * 0.027)
    + 0.5 * Math.sin(x * 0.051 - z * 0.043);
}
const GLSL_MEADOW = /* glsl */`
float meadowH(vec2 p) {
  return 1.6 * sin(p.x * 0.013 + 1.3) * cos(p.y * 0.011)
       + 0.9 * sin((p.x + p.y) * 0.027)
       + 0.5 * sin(p.x * 0.051 - p.y * 0.043);
}
`;

// The bay: meadow inland, a band of dunes, a long beach, wide turquoise shallows and three
// sandbars out at sea. The coast runs roughly east-west; the sea is ahead of the start (-z).
const ISLETS = [[-70, -318, 27], [32, -352, 22], [118, -282, 25]];
function shoreZ(x) { return -120 + 28 * Math.sin(x * 0.011 + 0.6) + 9 * Math.sin(x * 0.037 + 2.0); }
function seaFloor(s) { return -3.0 * (1 - Math.exp(-s / 30)) - Math.max(0, s - 45) * 0.085; }
function bayH(x, z) {
  const s = shoreZ(x) - z;                       // > 0 out at sea, < 0 inland
  const inland = 2.4 + 0.5 * meadowH(x, z);
  const dune = 1.25 + 0.55 * Math.sin(x * 0.11 + 0.3) * Math.cos(z * 0.09) + 0.25 * Math.sin(x * 0.31 + z * 0.17);
  let h = lerp(inland, dune, ss(-34, -20, s));
  const b = s < 0 ? -0.11 * s : seaFloor(s);
  h = lerp(h, b, ss(-16, -8, s));
  for (const [cx, cz, r] of ISLETS) h = Math.max(h, 0.75 - 1.4 * ((x - cx) ** 2 + (z - cz) ** 2) / (r * r));
  return h;
}
const GLSL_BAY = /* glsl */`
#define NF_BAY 1
float shoreZ(float x) { return -120.0 + 28.0 * sin(x * 0.011 + 0.6) + 9.0 * sin(x * 0.037 + 2.0); }
float coastS(vec2 p) { return shoreZ(p.x) - p.y; }
float seaFloor(float s) { return -3.0 * (1.0 - exp(-s / 30.0)) - max(0.0, s - 45.0) * 0.085; }
float isletH(vec2 p, vec2 c, float r, float h) { vec2 d = p - c; return max(h, 0.75 - 1.4 * dot(d, d) / (r * r)); }
float groundH(vec2 p) {
  float s = coastS(p);
  float inland = 2.4 + 0.5 * meadowH(p);
  float dune = 1.25 + 0.55 * sin(p.x * 0.11 + 0.3) * cos(p.y * 0.09) + 0.25 * sin(p.x * 0.31 + p.y * 0.17);
  float h = mix(inland, dune, smoothstep(-34.0, -20.0, s));
  float b = s < 0.0 ? -0.11 * s : seaFloor(s);
  h = mix(h, b, smoothstep(-16.0, -8.0, s));
  h = isletH(p, vec2(${ISLETS[0][0].toFixed(1)}, ${ISLETS[0][1].toFixed(1)}), ${ISLETS[0][2].toFixed(1)}, h);
  h = isletH(p, vec2(${ISLETS[1][0].toFixed(1)}, ${ISLETS[1][1].toFixed(1)}), ${ISLETS[1][2].toFixed(1)}, h);
  h = isletH(p, vec2(${ISLETS[2][0].toFixed(1)}, ${ISLETS[2][1].toFixed(1)}), ${ISLETS[2][2].toFixed(1)}, h);
  return h;
}
float vegGrass(vec2 p) { return 1.0 - smoothstep(-15.0, -9.0, coastS(p)); }
float vegFlower(vec2 p) { return 1.0 - smoothstep(-30.0, -21.0, coastS(p)); }
`;

export function makeTerrain(kind) {
  if (kind === 'bay') {
    return {
      kind, water: true, islets: ISLETS,
      h: bayH,
      surface: (x, z) => Math.max(bayH(x, z), 0),          // what you can fly over: sand, grass or sea
      coast: (x, z) => shoreZ(x) - z,
      shoreZ,
      flowers: (x, z) => 1 - ss(-30, -21, shoreZ(x) - z),
      glsl: GLSL_MEADOW + GLSL_BAY,
    };
  }
  return {
    kind: 'meadow', water: false, islets: [],
    h: meadowH, surface: meadowH, coast: () => -1000, shoreZ: () => 1e6, flowers: () => 1,
    glsl: GLSL_MEADOW + /* glsl */`
float coastS(vec2 p) { return -1000.0; }
float groundH(vec2 p) { return meadowH(p); }
float vegGrass(vec2 p) { return 1.0; }
float vegFlower(vec2 p) { return 1.0; }
`,
  };
}

// The broom's wake: grass and flowers near the rider lean away from it, more when low and fast.
const GLSL_WAKE = /* glsl */`
uniform vec4 uRider;      // xyz = rider position, w = wake strength (0..1, grows with speed)
vec2 wakePush(vec2 base, float hgt, out float k) {
  vec2 d = base - uRider.xz;
  float dist2 = dot(d, d);
  float alt = uRider.y - hgt;
  k = uRider.w * exp(-dist2 / 7.0) * (1.0 - smoothstep(1.2, 7.5, alt));
  return d * inversesqrt(dist2 + 0.09) * k;
}
`;

const C = (hex) => new THREE.Color(hex); // sRGB hex -> linear working colour

// ------------------------------------------------------------------------------------------
// Light: a clear noon, or a low golden evening sun ahead of you
// ------------------------------------------------------------------------------------------
export function makeLighting(kind) {
  const common = {
    grassBase: C('#1f5a12'), grassTip: C('#7fcf3c'), grassTip2: C('#a8dc58'),
    groundGreen: C('#2f7a1c'), groundGreen2: C('#5ea52c'),
    pink: C('#f08cbc'), pink2: C('#fbd0e2'),
    sand: C('#ecdcb4'), sandWet: C('#c2a77c'), seabed: C('#d9c79c'),
  };
  if (kind === 'golden') {
    return {
      ...common, kind,
      zenith: C('#30589a'), mid: C('#9c9fc0'), horizon: C('#f7c597'),
      sun: C('#ffcf8a'), sunDir: new THREE.Vector3(-0.3, 0.13, -0.95).normalize(),
      sunLight: C('#ffb470'), sunIntensity: 2.7, hemiSky: C('#ffd8b4'), hemiGround: C('#6d6a3a'), hemiIntensity: 1.15,
      exposure: 1.0, fog: C('#f2caa4'), tint: new THREE.Vector3(1.1, 0.9, 0.76), cloudTint: C('#ffdcc6'),
      shallow: C('#5cc6bd'), deep: C('#21507c'), foam: C('#fff3e4'),
    };
  }
  return {
    ...common, kind: 'noon',
    zenith: C('#2c69bd'), mid: C('#5f9bdc'), horizon: C('#d5e6f3'),
    sun: C('#fff3dd'), sunDir: new THREE.Vector3(-0.45, 0.62, 0.64).normalize(),
    sunLight: C('#fff1d8'), sunIntensity: 2.4, hemiSky: C('#cfe3ff'), hemiGround: C('#6e9a45'), hemiIntensity: 1.35,
    exposure: 1.05, fog: C('#d5e6f3'), tint: new THREE.Vector3(1, 1, 1), cloudTint: C('#ffffff'),
    shallow: C('#46d0c6'), deep: C('#176aa8'), foam: C('#ffffff'),
  };
}

// A plane whose vertices crowd around its centre: fine detail where you fly, coarse at the horizon.
function focusedPlane(half, seg) {
  const geo = new THREE.PlaneGeometry(2, 2, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position.array;
  const f = (u) => Math.sign(u) * (0.15 * Math.abs(u) + 0.85 * u * u) * half;
  for (let i = 0; i < p.length; i += 3) { p[i] = f(p[i]); p[i + 2] = f(p[i + 2]); }
  geo.attributes.position.needsUpdate = true;
  return geo;
}

// ------------------------------------------------------------------------------------------
// Sky dome
// ------------------------------------------------------------------------------------------
export function makeSky(L) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uZenith: { value: L.zenith }, uMid: { value: L.mid }, uHorizon: { value: L.horizon },
      uSunDir: { value: L.sunDir }, uSunCol: { value: L.sun },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uZenith, uMid, uHorizon, uSunDir, uSunCol;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uMid, smoothstep(-0.02, 0.16, h));
        col = mix(col, uZenith, smoothstep(0.16, 0.8, h));
        float s = max(dot(d, uSunDir), 0.0);
        col += uSunCol * (pow(s, 900.0) * 8.0 + pow(s, 14.0) * 0.22);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(3500, 32, 16), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

// ------------------------------------------------------------------------------------------
// Clouds: canvas-painted cumulus and cirrus on sprites, drifting slowly with parallax
// ------------------------------------------------------------------------------------------
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function cumulusTexture(seed) {
  const W = 512, H = 256, r = rng(seed);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const puffs = [];
  const n = 26 + Math.floor(r() * 10);
  for (let i = 0; i < n; i++) {
    const t = r();
    const x = W * (0.12 + 0.76 * t);
    const hump = Math.sin(Math.PI * t);                      // taller in the middle
    const rad = 24 + 58 * hump * (0.6 + 0.4 * r());
    const y = H * 0.74 - rad * (0.35 + 0.5 * r()) * hump;
    puffs.push([x, y, rad]);
  }
  const blob = (x, y, rad, inner, outer) => {
    const gr = g.createRadialGradient(x, y, rad * 0.15, x, y, rad);
    gr.addColorStop(0, inner); gr.addColorStop(0.65, inner); gr.addColorStop(1, outer);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  };
  for (const [x, y, rad] of puffs) blob(x, y + rad * 0.22, rad, 'rgba(178,196,222,0.95)', 'rgba(178,196,222,0)');
  for (const [x, y, rad] of puffs) blob(x - rad * 0.12, y - rad * 0.14, rad * 0.86, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)');
  // flatten the base a little
  g.globalCompositeOperation = 'destination-out';
  const fade = g.createLinearGradient(0, H * 0.78, 0, H);
  fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = fade; g.fillRect(0, 0, W, H);
  edgeFade(g, W, H);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function edgeFade(g, W, H) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'destination-in';
  const gx = g.createLinearGradient(0, 0, W, 0);
  gx.addColorStop(0, 'rgba(0,0,0,0)'); gx.addColorStop(0.1, '#000'); gx.addColorStop(0.9, '#000'); gx.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gx; g.fillRect(0, 0, W, H);
  const gy = g.createLinearGradient(0, 0, 0, H);
  gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(0.08, '#000'); gy.addColorStop(0.92, '#000'); gy.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gy; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
}

function cirrusTexture(seed) {
  const W = 512, H = 128, r = rng(seed);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.translate(W / 2, H / 2);
  for (let i = 0; i < 22; i++) {
    g.save();
    g.rotate((r() - 0.5) * 0.12);
    g.scale(1, 0.08 + r() * 0.08);
    const x = (r() - 0.5) * W * 0.6, y = (r() - 0.5) * H * 4;
    const rad = 80 + r() * 140;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(255,255,255,0.32)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  edgeFade(g, W, H);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeClouds(L) {
  const group = new THREE.Group();
  const texs = [cumulusTexture(7), cumulusTexture(19), cumulusTexture(43), cumulusTexture(88)];
  const cir = [cirrusTexture(5), cirrusTexture(13)];
  const r = rng(2024);
  const items = [];
  const add = (tex, dist, ang, y, w, h, op) => {
    const m = new THREE.SpriteMaterial({ map: tex, color: L.cloudTint, transparent: true, depthWrite: false, fog: false, opacity: op });
    const s = new THREE.Sprite(m);
    s.scale.set(w, h, 1);
    s.renderOrder = -5;
    const base = new THREE.Vector3(Math.cos(ang) * dist, y, Math.sin(ang) * dist);
    items.push({ s, base });
    group.add(s);
  };
  for (let i = 0; i < 26; i++) {
    const dist = 650 + r() * 900, ang = r() * Math.PI * 2;
    const w = 260 + r() * 520;
    add(texs[i % texs.length], dist, ang, 90 + r() * 220 + dist * 0.06, w, w * 0.5, 0.95);
  }
  for (let i = 0; i < 10; i++) {
    const dist = 900 + r() * 900, ang = r() * Math.PI * 2;
    const w = 700 + r() * 600;
    add(cir[i % 2], dist, ang, 420 + r() * 300, w, w * 0.18, 0.9);
  }
  group.userData.update = (camPos, t) => {
    for (const { s, base } of items) {
      // drift with the wind, and follow the camera at 92% so they always stay on the horizon
      s.position.set(base.x + camPos.x * 0.92 + t * 2.2, base.y, base.z + camPos.z * 0.92 + t * 0.8);
    }
  };
  return group;
}

// ------------------------------------------------------------------------------------------
// Distant sea cliffs: a ring of plateaus that always stays on the horizon
// ------------------------------------------------------------------------------------------
export function makeCliffs() {
  const SEG = 360, R0 = 760, R1 = 860;
  const pos = [], col = [];
  const face = C('#55665a'), faceDark = C('#3d4c44'), top = C('#6aa443'), topFar = C('#8cbf5a');
  const plateau = (a) => {
    // a few headlands around the compass
    const bumps = [[0.35, 0.5], [2.1, 0.32], [3.6, 0.42], [5.0, 0.28]];
    let m = 0;
    for (const [c, w] of bumps) {
      let d = Math.abs(((a - c + Math.PI) % (Math.PI * 2)) - Math.PI);
      m = Math.max(m, THREE.MathUtils.smoothstep(w, w * 0.55, d));
    }
    return m;
  };
  const height = (a) => {
    const m = plateau(a);
    return m * (26 + 9 * Math.sin(a * 23.0) + 5 * Math.sin(a * 61.0 + 1.0)) - 3;
  };
  const push = (p, c) => { pos.push(p.x, p.y, p.z); col.push(c.r, c.g, c.b); };
  for (let i = 0; i < SEG; i++) {
    const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
    const h0 = height(a0), h1 = height(a1);
    if (h0 < -2.5 && h1 < -2.5) continue;
    const v = (a, r, y) => new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    // cliff face (facing inward)
    const fc = (i % 7 < 3) ? faceDark : face;
    const a = v(a0, R0, -6), b = v(a1, R0, -6), c = v(a1, R0, h1), d = v(a0, R0, h0);
    push(a, fc); push(b, fc); push(c, fc); push(a, fc); push(c, fc); push(d, fc);
    // grassy top sloping away
    const e = v(a0, R1, h0 * 0.6), f = v(a1, R1, h1 * 0.6);
    push(d, top); push(c, top); push(f, topFar); push(d, top); push(f, topFar); push(e, topFar);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true }));
  mesh.frustumCulled = false;
  return mesh;
}

// ------------------------------------------------------------------------------------------
// Ground: a big displaced plane that follows the camera; the shader paints grass + a pink wash
// that becomes a solid sea of flowers towards the horizon
// ------------------------------------------------------------------------------------------
export function makeGround(T, L) {
  const geo = focusedPlane(1800, 220);
  const mat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uCam: { value: new THREE.Vector3() },
      uG1: { value: L.groundGreen }, uG2: { value: L.groundGreen2 },
      uP1: { value: L.pink }, uP2: { value: L.pink2 },
      uSand: { value: L.sand }, uSandWet: { value: L.sandWet }, uSeabed: { value: L.seabed },
      uSun: { value: L.sunDir }, uTint: { value: L.tint },
    }]),
    vertexShader: /* glsl */`
      ${GLSL_NOISE}
      ${T.glsl}
      #include <fog_pars_vertex>
      varying vec2 vW;
      varying vec3 vN;
      varying float vH;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        w.y = groundH(w.xz);
        vW = w.xz; vH = w.y;
        float e = 0.8;
        vN = normalize(vec3(groundH(w.xz - vec2(e, 0.0)) - groundH(w.xz + vec2(e, 0.0)), 2.0 * e,
                            groundH(w.xz - vec2(0.0, e)) - groundH(w.xz + vec2(0.0, e))));
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      ${GLSL_NOISE}
      ${T.glsl}
      #include <fog_pars_fragment>
      uniform vec3 uCam, uG1, uG2, uP1, uP2, uSun, uSand, uSandWet, uSeabed, uTint;
      varying vec2 vW;
      varying vec3 vN;
      varying float vH;
      void main() {
        float patchN = nf_fbm(vW * 0.035);
        float patchK = smoothstep(0.34, 0.62, patchN);
        float dist = length(vW - uCam.xz);
        float far = smoothstep(30.0, 110.0, dist);
        float speck = nf_noise(vW * 7.0) * 0.7 + nf_noise(vW * 1.9) * 0.3;
        float nearPink = step(0.66 - 0.2 * patchK, speck);
        float farPink = 0.72 + 0.26 * patchK;
        float pinkAmt = mix(nearPink, farPink, far);
        vec3 green = mix(uG1, uG2, nf_fbm(vW * 0.18));
        vec3 pink = mix(uP1, uP2, nf_noise(vW * 0.6 + 3.0) * 0.7 + speck * 0.3);
        vec3 col = mix(green, pink, clamp(pinkAmt, 0.0, 1.0));
        #ifdef NF_BAY
          float s = coastS(vW);
          float grain = nf_noise(vW * 3.1) * 0.5 + nf_noise(vW * 0.45) * 0.5;
          // dunes: pale sand with tufts of marram grass, then the beach
          vec3 dune = mix(uSand, uSandWet, 0.12 * grain);
          dune = mix(dune, green * 1.15, step(0.6, nf_noise(vW * 0.85)) * 0.6 * (1.0 - smoothstep(-15.0, -9.0, s)));
          float duneK = smoothstep(-27.0, -18.0, s);
          col = mix(col, dune, duneK);
          // wet sand just above the waterline, seabed under the water, sand on the sandbars
          float wet = 1.0 - smoothstep(0.05, 0.45, vH);
          col = mix(col, mix(uSandWet, uSand, 0.25 * grain), wet * duneK);
          if (vH < 0.0) col = mix(uSandWet, uSeabed * 0.9, smoothstep(0.0, 5.0, -vH)) * (0.92 + 0.12 * grain);
          if (s > 0.0 && vH >= 0.0) col = mix(uSand, uSandWet, wet * 0.9);
        #endif
        float lit = 0.72 + 0.38 * max(dot(normalize(vN), uSun), 0.0);
        gl_FragColor = vec4(col * lit * uTint, 1.0);
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.userData.update = (camPos) => {
    mesh.position.set(Math.round(camPos.x / 4) * 4, 0, Math.round(camPos.z / 4) * 4);
    mat.uniforms.uCam.value.copy(camPos);
  };
  return mesh;
}

// ------------------------------------------------------------------------------------------
// Grass tufts and flowers, instanced in a square that wraps around the camera (so the world is
// endless but the instances never move in world space)
// ------------------------------------------------------------------------------------------
function tuftGeometry() {
  const pos = [], t = [], idx = [];
  const r = rng(11);
  const BLADES = 7;
  for (let b = 0; b < BLADES; b++) {
    const ang = r() * Math.PI * 2, rad = r() * 0.14;
    const ox = Math.cos(ang) * rad, oz = Math.sin(ang) * rad;
    const h = 0.26 + r() * 0.24, w = 0.022 + r() * 0.01;
    const face = r() * Math.PI;
    const dx = Math.cos(face), dz = Math.sin(face);
    const lean = (r() - 0.5) * 0.18, leanA = r() * Math.PI * 2;
    const lx = Math.cos(leanA) * lean, lz = Math.sin(leanA) * lean;
    const base = pos.length / 3;
    pos.push(ox - dx * w, 0, oz - dz * w); t.push(0);
    pos.push(ox + dx * w, 0, oz + dz * w); t.push(0);
    pos.push(ox + lx, h, oz + lz); t.push(1);
    idx.push(base, base + 1, base + 2);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(t, 1));
  g.setIndex(idx);
  return g;
}

export function makeGrass(count, R, T, L) {
  const geo = tuftGeometry();
  const off = new Float32Array(count * 4);
  const r = rng(77);
  for (let i = 0; i < count; i++) {
    off[i * 4] = r() * R; off[i * 4 + 1] = r() * R;
    off[i * 4 + 2] = r() * Math.PI * 2; off[i * 4 + 3] = 0.7 + r() * 0.75;
  }
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
  geo.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uCenter: { value: new THREE.Vector2() }, uR: { value: R },
      uRider: { value: new THREE.Vector4() },
      uBase: { value: L.grassBase }, uTip: { value: L.grassTip }, uTip2: { value: L.grassTip2 }, uTint: { value: L.tint },
    }]),
    vertexShader: /* glsl */`
      ${GLSL_NOISE}
      ${T.glsl}
      ${GLSL_WAKE}
      #include <fog_pars_vertex>
      uniform float uTime, uR;
      uniform vec2 uCenter;
      attribute vec4 aOff;
      attribute float aT;
      varying float vT, vVar, vK;
      void main() {
        vec2 org = uCenter - uR * 0.5;
        vec2 base = org + mod(aOff.xy - org, uR);
        float edge = (1.0 - smoothstep(uR * 0.34, uR * 0.49, length(base - uCenter))) * vegGrass(base);
        float hgt = groundH(base);
        float c = cos(aOff.z), s = sin(aOff.z);
        vec3 p = position * vec3(aOff.w * step(0.01, edge), aOff.w * edge, aOff.w * step(0.01, edge));
        p.xz = mat2(c, -s, s, c) * p.xz;
        float bend = aT * aT;
        float gust = nf_noise(base * 0.045 + vec2(uTime * 0.32, uTime * 0.12));
        vec2 wind = vec2(0.55, 0.22) * (0.2 + 0.8 * gust)
                  + 0.07 * vec2(sin(uTime * 2.3 + base.x * 0.7), cos(uTime * 1.9 + base.y * 0.6));
        float k;
        vec2 push = wakePush(base, hgt, k);
        vec2 off = (wind * 0.32 + push * 1.25) * bend * 0.85;
        p.xz += off;
        p.y -= dot(off, off) * 0.5 * aT;
        vec3 wp = vec3(base.x, hgt, base.y) + p;
        vT = aT; vVar = fract(aOff.z * 7.13); vK = k;
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <fog_pars_fragment>
      uniform vec3 uBase, uTip, uTip2, uTint;
      varying float vT, vVar, vK;
      void main() {
        vec3 tip = mix(uTip, uTip2, vVar);
        vec3 col = mix(uBase, tip, smoothstep(0.0, 1.0, vT));
        col *= 0.78 + 0.32 * vT + vK * 0.25 * vT;   // blades laid over by the wake catch more light
        gl_FragColor = vec4(col * uTint, 1.0);
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

export function makeFlowers(count, R, T, L, seed = 99, sizeMul = 1) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const off = new Float32Array(count * 4), col = new Float32Array(count * 3);
  const r = rng(seed);
  const cols = ['#f48fb8', '#f7a8c9', '#fbcfe1', '#ffffff', '#ec6fa6', '#f9b6d2', '#fde7f0'].map(C);
  for (let i = 0; i < count; i++) {
    off[i * 4] = r() * R; off[i * 4 + 1] = r() * R;
    off[i * 4 + 2] = 0.3 + r() * 0.4;            // stem height
    off[i * 4 + 3] = (0.18 + r() * 0.22) * sizeMul; // head size
    const c = cols[Math.floor(r() * cols.length)];
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
  geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(col, 3));
  geo.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uCenter: { value: new THREE.Vector2() }, uR: { value: R },
      uRider: { value: new THREE.Vector4() }, uTint: { value: L.tint },
    }]),
    vertexShader: /* glsl */`
      ${GLSL_NOISE}
      ${T.glsl}
      ${GLSL_WAKE}
      #include <fog_pars_vertex>
      uniform float uTime, uR;
      uniform vec2 uCenter;
      attribute vec4 aOff;
      attribute vec3 aCol;
      varying vec2 vUv;
      varying vec3 vCol;
      void main() {
        vec2 org = uCenter - uR * 0.5;
        vec2 base = org + mod(aOff.xy - org, uR);
        float hgt = groundH(base);
        float patchN = nf_fbm(base * 0.035) + 0.3 * (nf_hash(aOff.xy) - 0.5);
        float mask = smoothstep(0.26, 0.42, patchN) * vegFlower(base);
        float edge = 1.0 - smoothstep(uR * 0.34, uR * 0.49, length(base - uCenter));
        float k;
        vec2 push = wakePush(base, hgt, k);
        float gust = nf_noise(base * 0.045 + vec2(uTime * 0.32, uTime * 0.12));
        vec2 sway = vec2(0.55, 0.22) * (0.2 + 0.8 * gust) * 0.12
                  + 0.04 * vec2(sin(uTime * 2.1 + base.x), cos(uTime * 1.7 + base.y));
        vec2 lean = (sway + push * 0.75) * aOff.z;
        vec3 head = vec3(base.x + lean.x, hgt + aOff.z * (1.0 - 0.55 * k), base.y + lean.y);
        float size = aOff.w * mask * edge * (1.0 - 0.45 * k);
        float a = fract(aOff.x * 3.17) * 6.2831;
        mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
        vec4 mvPosition = viewMatrix * vec4(head, 1.0);
        mvPosition.xy += rot * position.xy * size;
        vUv = position.xy * 2.0;
        vCol = aCol;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <fog_pars_fragment>
      uniform vec3 uTint;
      varying vec2 vUv;
      varying vec3 vCol;
      void main() {
        float r = length(vUv);
        float a = atan(vUv.y, vUv.x);
        float edge = 0.55 + 0.45 * abs(cos(a * 4.0));
        if (r > edge) discard;
        vec3 col = vCol * (0.82 + 0.25 * (1.0 - r));
        col = mix(vec3(0.95, 0.68, 0.12), col, smoothstep(0.13, 0.2, r));
        gl_FragColor = vec4(col * uTint, 1.0);
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

// ------------------------------------------------------------------------------------------
// Petals: a CPU particle pool drawn as tumbling billboards. Also balloon confetti (kind 1) and
// sea spray / kicked-up sand (kind 2).
// ------------------------------------------------------------------------------------------
export class Petals {
  constructor(max, T) {
    this.max = max;
    this.T = T;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.aP = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aR = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aC = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aP', this.aP); geo.setAttribute('aR', this.aR); geo.setAttribute('aC', this.aC);
    geo.instanceCount = max;
    this.vel = new Float32Array(max * 3);
    this.spin = new Float32Array(max * 2);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.kind = new Uint8Array(max);   // 0 petal, 1 confetti, 2 droplet
    this.cursor = 0;
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide, transparent: true, depthWrite: false, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
      vertexShader: /* glsl */`
        #include <fog_pars_vertex>
        attribute vec4 aP;   // xyz, size
        attribute vec4 aR;   // rotation, flip, alpha, kind
        attribute vec3 aC;
        varying vec2 vUv; varying vec3 vCol; varying float vA, vKind, vFlip;
        void main() {
          vec4 mvPosition = viewMatrix * vec4(aP.xyz, 1.0);
          vec2 c = position.xy * vec2(0.62 * aR.y, 1.0);
          float s = sin(aR.x), co = cos(aR.x);
          mvPosition.xy += mat2(co, -s, s, co) * c * aP.w;
          vUv = position.xy * 2.0; vCol = aC; vA = aR.z; vKind = aR.w; vFlip = aR.y;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        #include <fog_pars_fragment>
        varying vec2 vUv; varying vec3 vCol; varying float vA, vKind, vFlip;
        void main() {
          vec2 p = vUv;
          float shade;
          if (vKind < 0.5) {
            // a petal: rounded at the tip, pinched at the base, with a small notch
            float w = mix(0.25, 1.0, smoothstep(-1.0, 0.25, p.y)) * (1.0 - 0.18 * smoothstep(0.7, 1.0, p.y));
            if (abs(p.x) > w || p.y < -1.0 || length(p * vec2(1.0, 0.95)) > 1.02) discard;
            if (p.y > 0.86 && abs(p.x) < 0.1) discard;
            shade = 0.78 + 0.3 * smoothstep(-1.0, 0.8, p.y) + 0.1 * abs(vFlip);
          } else if (vKind < 1.5) {
            if (abs(p.x) > 0.95 || abs(p.y) > 0.7) discard;   // confetti: little paper rectangles
            shade = 0.85 + 0.25 * abs(vFlip);
          } else {
            float r = length(p * vec2(1.6, 1.0));               // a droplet, round and soft
            if (r > 1.0) discard;
            shade = 0.9 + 0.25 * (1.0 - r);
            gl_FragColor = vec4(vCol * shade, vA * (1.0 - r * r) * 0.9);
            #include <fog_fragment>
            return;
          }
          gl_FragColor = vec4(vCol * shade, vA);
          #include <fog_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  spawn(x, y, z, vx, vy, vz, color, size, life, kind = 0) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
    const P = this.aP.array, R = this.aR.array, Cc = this.aC.array;
    P[i * 4] = x; P[i * 4 + 1] = y; P[i * 4 + 2] = z; P[i * 4 + 3] = size;
    R[i * 4] = Math.random() * 6.28; R[i * 4 + 1] = 1; R[i * 4 + 2] = 1; R[i * 4 + 3] = kind;
    Cc[i * 3] = color.r; Cc[i * 3 + 1] = color.g; Cc[i * 3 + 2] = color.b;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.spin[i * 2] = (Math.random() - 0.5) * 7; this.spin[i * 2 + 1] = 2 + Math.random() * 7;
    this.life[i] = life; this.maxLife[i] = life; this.kind[i] = kind;
  }

  update(dt, t, wind, rider, riderVel) {
    const P = this.aP.array, R = this.aR.array, V = this.vel;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { if (P[i * 4 + 3] !== 0) P[i * 4 + 3] = 0; continue; }
      this.life[i] -= dt;
      const x = P[i * 4], y = P[i * 4 + 1], z = P[i * 4 + 2];
      const kind = this.kind[i];
      if (kind === 2) {
        // spray and sand: thrown up, falls fast, barely cares about the wind
        V[i * 3] *= 1 - 0.6 * dt; V[i * 3 + 2] *= 1 - 0.6 * dt; V[i * 3 + 1] -= 9.0 * dt;
      } else {
        // air drag towards the wind, a little flutter, gravity
        const drag = kind === 1 ? 1.6 : 1.1;
        const fl = Math.sin(t * 3.1 + i * 1.7) * 0.9;
        V[i * 3] += ((wind.x + fl) - V[i * 3]) * drag * dt;
        V[i * 3 + 2] += ((wind.z + Math.cos(t * 2.7 + i) * 0.9) - V[i * 3 + 2]) * drag * dt;
        V[i * 3 + 1] += (-(kind === 1 ? 1.6 : 0.85) - V[i * 3 + 1]) * drag * 0.9 * dt;
      }
      // the wake: petals near the broom get pulled along behind it and lifted
      const dx = x - rider.x, dy = y - rider.y, dz = z - rider.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 30 && kind !== 2) {
        const k = (1 - d2 / 30) * dt * 2.2;
        V[i * 3] += riderVel.x * k * 0.35; V[i * 3 + 2] += riderVel.z * k * 0.35;
        V[i * 3 + 1] += k * 2.5;
      }
      let ny = y + V[i * 3 + 1] * dt;
      const g = this.T.surface(x, z) + 0.05;
      if (ny < g) { ny = g; V[i * 3] *= 0.5; V[i * 3 + 2] *= 0.5; V[i * 3 + 1] = 0; this.life[i] = Math.min(this.life[i], kind === 2 ? 0.05 : 0.6); }
      P[i * 4] = x + V[i * 3] * dt; P[i * 4 + 1] = ny; P[i * 4 + 2] = z + V[i * 3 + 2] * dt;
      R[i * 4] += this.spin[i * 2] * dt;
      R[i * 4 + 1] = Math.cos(t * this.spin[i * 2 + 1] + i);
      const lifeK = this.life[i] / this.maxLife[i];
      R[i * 4 + 2] = Math.min(1, this.life[i] / 0.5) * Math.min(1, (1 - lifeK) * 12 + 0.2);
    }
    this.aP.needsUpdate = true; this.aR.needsUpdate = true; this.aC.needsUpdate = true;
  }
}

// ------------------------------------------------------------------------------------------
// Sea (bay only): a few long swells rolling in to the beach, sky reflections and the sun's glint,
// turquoise shallows over the sand, foam where the waves break and a churn under the broom
// ------------------------------------------------------------------------------------------
export function makeWater(T, L) {
  const geo = focusedPlane(1800, 240);
  const WAVES = [[0.15, 34, 0.30], [-0.42, 21, 0.17], [0.55, 13, 0.085], [-0.12, 7.5, 0.04]];
  const waveA = [], waveW = [];
  WAVES.forEach(([dx, len, amp]) => {
    const d = new THREE.Vector2(dx, 1).normalize();     // rolling towards the shore (+z)
    const k = (2 * Math.PI) / len;
    waveA.push(new THREE.Vector4(d.x, d.y, k, amp));
    waveW.push(Math.sqrt(9.81 * k));
  });
  const mat = new THREE.ShaderMaterial({
    fog: true, transparent: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uRider: { value: new THREE.Vector4() },
      uSunDir: { value: L.sunDir }, uSunCol: { value: L.sun },
      uZenith: { value: L.zenith }, uHorizon: { value: L.horizon },
      uShallow: { value: L.shallow }, uDeep: { value: L.deep }, uFoam: { value: L.foam }, uTint: { value: L.tint },
      uWaveA: { value: waveA }, uWaveW: { value: waveW },
    }]),
    vertexShader: /* glsl */`
      ${GLSL_NOISE}
      ${T.glsl}
      #include <fog_pars_vertex>
      uniform float uTime;
      uniform vec4 uWaveA[4];
      uniform float uWaveW[4];
      varying vec3 vW;
      varying vec3 vN;
      varying float vWave;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vec2 p = w.xz;
        float depth = -groundH(p);
        float calm = 0.3 + 0.7 * smoothstep(0.0, 4.0, depth);   // swells flatten as they reach the beach
        float y = 0.0;
        vec2 slope = vec2(0.0);
        for (int i = 0; i < 4; i++) {
          vec4 a = uWaveA[i];
          float ph = a.z * dot(a.xy, p) - uWaveW[i] * uTime + float(i) * 1.7;
          float A = a.w * calm;
          y += A * sin(ph);
          slope += a.xy * a.z * A * cos(ph);
        }
        w.y = y;
        vWave = y; vW = w.xyz;
        vN = normalize(vec3(-slope.x, 1.0, -slope.y));
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      ${GLSL_NOISE}
      ${T.glsl}
      #include <fog_pars_fragment>
      uniform float uTime;
      uniform vec4 uRider;
      uniform vec3 uSunDir, uSunCol, uZenith, uHorizon, uShallow, uDeep, uFoam, uTint;
      varying vec3 vW;
      varying vec3 vN;
      varying float vWave;
      void main() {
        float depth = vW.y - groundH(vW.xz);
        if (depth < -0.05) discard;                         // under the beach
        // small ripples on top of the swell
        vec2 q = vW.xz * 0.45 + vec2(uTime * 0.35, uTime * 0.22);
        vec2 q2 = vW.xz * 1.3 - vec2(uTime * 0.5, -uTime * 0.3);
        float e = 0.15;
        float n0 = nf_noise(q), m0 = nf_noise(q2);
        vec3 n = normalize(vN + vec3((n0 - nf_noise(q + vec2(e, 0.0))) * 0.8 + (m0 - nf_noise(q2 + vec2(e, 0.0))) * 0.45, 0.0,
                                     (n0 - nf_noise(q + vec2(0.0, e))) * 0.8 + (m0 - nf_noise(q2 + vec2(0.0, e))) * 0.45));
        vec3 v = normalize(cameraPosition - vW);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
        vec3 r = reflect(-v, n);
        vec3 sky = mix(uHorizon, uZenith, smoothstep(0.0, 0.55, r.y));
        float sd = max(dot(r, uSunDir), 0.0);
        vec3 spec = uSunCol * (pow(sd, 600.0) * 6.0 + pow(sd, 60.0) * 0.35);
        vec3 body = mix(uShallow, uDeep, smoothstep(0.3, 9.0, depth));
        vec3 col = mix(body, sky, fres * 0.85) + spec;
        // foam: the swash on the sand, bands of breaking surf, crests, and the broom's churn
        float lace = nf_noise(vW.xz * 1.1 + vec2(uTime * 0.25, -uTime * 0.4));
        float swash = 0.45 + 0.3 * sin(uTime * 0.8 + vW.x * 0.035);
        float shore = 1.0 - smoothstep(0.0, swash, depth);
        float band = smoothstep(0.82, 1.0, sin(depth * 2.6 - uTime * 1.6)) * (1.0 - smoothstep(0.3, 2.0, depth));
        float crest = smoothstep(0.28, 0.42, vWave) * 0.45;
        vec2 dr = vW.xz - uRider.xz;
        float churn = uRider.w * exp(-dot(dr, dr) / 5.0) * (1.0 - smoothstep(0.8, 4.0, uRider.y));
        float foam = clamp((shore * 1.1 + band * 0.9 + crest) * smoothstep(0.2, 0.65, lace + shore * 0.35)
                           + churn * smoothstep(0.3, 0.7, lace), 0.0, 1.0);
        col = mix(col, uFoam, foam);
        float alpha = max(mix(0.38, 0.97, smoothstep(0.05, 4.5, depth)), foam);
        gl_FragColor = vec4(col * uTint, alpha);
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.userData.update = (camPos, t, rider, wake) => {
    mesh.position.set(Math.round(camPos.x / 4) * 4, 0, Math.round(camPos.z / 4) * 4);
    mat.uniforms.uTime.value = t;
    mat.uniforms.uRider.value.set(rider.x, rider.y, rider.z, wake);
  };
  return mesh;
}

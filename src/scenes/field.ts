import * as THREE from 'three';
import { ATMOS_GLSL, type AtmosUniforms } from '../blackhole/atmosphere';
import { getNoiseTexture } from '../blackhole/noiseTexture';

// Ground plane and instanced vegetation (flowers, wheat). All use custom shaders with
// a shared light model: low back-light from the black hole, sky ambient, the shared
// atmosphere fog, and one optional local warm light (house windows).

export interface LightUniforms {
  uLightDir: THREE.IUniform<THREE.Vector3>; // toward the light
  uLightColor: THREE.IUniform<THREE.Color>;
  uAmbTop: THREE.IUniform<THREE.Color>;
  uAmbBottom: THREE.IUniform<THREE.Color>;
  uLocalPos: THREE.IUniform<THREE.Vector3>;
  uLocalColor: THREE.IUniform<THREE.Color>;
  uLocalRadius: THREE.IUniform<number>;
  uTime: THREE.IUniform<number>;
  uWind: THREE.IUniform<number>;
}

export function createLightUniforms(): LightUniforms {
  return {
    uLightDir: { value: new THREE.Vector3(0, 0.2, -1).normalize() },
    uLightColor: { value: new THREE.Color(1, 0.9, 0.7) },
    uAmbTop: { value: new THREE.Color(0.1, 0.1, 0.12) },
    uAmbBottom: { value: new THREE.Color(0.02, 0.02, 0.03) },
    uLocalPos: { value: new THREE.Vector3(0, -100, 0) },
    uLocalColor: { value: new THREE.Color(0, 0, 0) },
    uLocalRadius: { value: 1 },
    uTime: { value: 0 },
    uWind: { value: 0.03 },
  };
}

const LIGHT_GLSL = /* glsl */ `
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uAmbTop;
uniform vec3 uAmbBottom;
uniform vec3 uLocalPos;
uniform vec3 uLocalColor;
uniform float uLocalRadius;
uniform float uTime;
uniform float uWind;
vec3 localLight(vec3 p) {
  float d = length(p - uLocalPos);
  return uLocalColor * exp(-d / uLocalRadius);
}
`;

// ---------------------------------------------------------------- ground

export interface GroundParams {
  colorA: string;
  colorB: string;
  noiseScale: number;
  stretchX: number; // >1 gives horizontal striations
  reflColor: string; // fake glossy reflection of the horizon glow
  reflWidth: number;
  reflAz: number;
  sparkle: number;
  sparkleColor: string;
}

export function createGround(atmos: AtmosUniforms, light: LightUniforms, p: GroundParams) {
  const uniforms = {
    ...atmos,
    ...light,
    tNoise: { value: getNoiseTexture() },
    uColA: { value: new THREE.Color(p.colorA) },
    uColB: { value: new THREE.Color(p.colorB) },
    uNoiseScale: { value: p.noiseScale },
    uStretch: { value: p.stretchX },
    uReflColor: { value: new THREE.Color(p.reflColor) },
    uReflWidth: { value: p.reflWidth },
    uReflAz: { value: p.reflAz },
    uSparkle: { value: p.sparkle },
    uSparkleColor: { value: new THREE.Color(p.sparkleColor) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld;
      uniform sampler2D tNoise;
      uniform vec3 uColA, uColB, uReflColor, uSparkleColor;
      uniform float uNoiseScale, uStretch, uReflWidth, uReflAz, uSparkle;
      ${ATMOS_GLSL}
      ${LIGHT_GLSL}
      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      void main() {
        vec2 uv = vWorld.xz * uNoiseScale * vec2(1.0 / uStretch, 1.0);
        float n1 = texture2D(tNoise, uv).r;
        float n2 = texture2D(tNoise, uv * vec2(3.0, 9.0) + 0.37).g;
        float n = n1 * 0.55 + n2 * 0.45;
        vec3 col = mix(uColA, uColB, smoothstep(0.2, 0.8, n));
        vec3 vd = normalize(vWorld - cameraPosition);
        float e = max(-vd.y, 0.0);
        vec2 hb = normalize(uBhDirW.xz + 1e-6);
        vec2 hd = normalize(vd.xz + 1e-6);
        float az = acos(clamp(dot(hb, hd), -1.0, 1.0));
        col += uReflColor * exp(-e / uReflWidth) * exp(-az * az / (uReflAz * uReflAz)) * (0.5 + n2);
        col += localLight(vWorld) * (0.4 + n);
        if (uSparkle > 0.0) {
          vec2 g = floor(vWorld.xz * 6.0);
          float h = hash12(g);
          float tw = 0.5 + 0.5 * sin(uTime * (1.0 + h * 3.0) + h * 60.0);
          col += uSparkleColor * step(1.0 - uSparkle, h) * tw * exp(-length(vWorld - cameraPosition) * 0.02);
        }
        gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
      }`,
  });
  const geo = new THREE.CircleGeometry(4000, 96);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

// ---------------------------------------------------------------- scatter

export interface ScatterParams {
  count: number;
  rMin: number;
  rMax: number;
  halfAngle: number; // degrees around -Z
  yaw: number; // degrees, wedge center
  seed: number;
  exclude?: { x: number; z: number; r: number }[]; // keep these circles clear
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform-area scatter in a wedge in front of the camera at the origin. */
function scatter(p: ScatterParams, origin: THREE.Vector3) {
  const rand = rng(p.seed);
  const offsets = new Float32Array(p.count * 4);
  const params = new Float32Array(p.count * 4);
  const ha = THREE.MathUtils.degToRad(p.halfAngle);
  const yaw = THREE.MathUtils.degToRad(p.yaw);
  for (let i = 0; i < p.count; i++) {
    let x = 0;
    let z = 0;
    for (let tries = 0; tries < 8; tries++) {
      const r = Math.sqrt(p.rMin * p.rMin + rand() * (p.rMax * p.rMax - p.rMin * p.rMin));
      const a = yaw + (rand() * 2 - 1) * ha;
      x = origin.x - Math.sin(a) * r;
      z = origin.z - Math.cos(a) * r;
      if (!p.exclude?.some((e) => (x - e.x) ** 2 + (z - e.z) ** 2 < e.r * e.r)) break;
      x = z = 1e5; // give up: park it out of view
    }
    offsets[i * 4] = x;
    offsets[i * 4 + 1] = 0;
    offsets[i * 4 + 2] = z;
    offsets[i * 4 + 3] = rand() * Math.PI * 2;
    params[i * 4] = 0.75 + rand() * 0.5;
    params[i * 4 + 1] = rand();
    params[i * 4 + 2] = rand();
    params[i * 4 + 3] = rand();
  }
  return { offsets, params };
}

function instanced(base: THREE.BufferGeometry, p: ScatterParams, origin: THREE.Vector3) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  for (const [name, attr] of Object.entries(base.attributes)) geo.setAttribute(name, attr);
  const { offsets, params } = scatter(p, origin);
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 4));
  geo.setAttribute('aParams', new THREE.InstancedBufferAttribute(params, 4));
  geo.instanceCount = p.count;
  return geo;
}

// ---------------------------------------------------------------- flowers

/** far: a cheap 4-petal head without stem or leaves, for distant instances. */
function flowerGeometry(far: boolean): THREE.BufferGeometry {
  const pos: number[] = [];
  const part: number[] = [];
  const tri = (a: number[], b: number[], c: number[], ta: number, tb: number, tc: number, kind: number) => {
    pos.push(...a, ...b, ...c);
    part.push(kind, ta, kind, tb, kind, tc);
  };
  const h = 0.4;
  // Leaves.
  for (let k = 0; k < (far ? 0 : 2); k++) {
    const a = (k / 2) * Math.PI * 2 + 0.4;
    const y = 0.16 + k * 0.08;
    const L = 0.09;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const tip = [ca * L, y + 0.03, sa * L];
    const m1 = [ca * L * 0.5 - sa * 0.025, y + 0.03, sa * L * 0.5 + ca * 0.025];
    const m2 = [ca * L * 0.5 + sa * 0.025, y + 0.03, sa * L * 0.5 - ca * 0.025];
    tri([0, y, 0], m1, tip, 0, 0.5, 1, 1);
    tri([0, y, 0], tip, m2, 0, 1, 0.5, 1);
  }
  // Petals: a shallow cup of kites.
  const n = far ? 4 : 6;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + (k % 2) * 0.2;
    const L = (0.05 + (k % 2) * 0.012) * (far ? 1.25 : 1);
    const tilt = 0.45 + (k % 3) * 0.12;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const c = [0, h, 0];
    const tip = [ca * L * Math.cos(tilt), h + L * Math.sin(tilt), sa * L * Math.cos(tilt)];
    const mr = L * 0.55;
    const w = far ? 0.03 : 0.022;
    const m1 = [ca * mr - sa * w, h + mr * 0.35, sa * mr + ca * w];
    const m2 = [ca * mr + sa * w, h + mr * 0.35, sa * mr - ca * w];
    tri(c, m1, tip, 0, 0.6, 1, 0);
    tri(c, tip, m2, 0, 1, 0.6, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 2));
  g.computeVertexNormals();
  return g;
}

export interface FlowerParams {
  petalA: string;
  petalB: string;
  leaf: string;
  backLight: number;
  sparkleRate: number;
  sparkleBright: number;
  sparkleColor: string;
  height: number; // scales the whole flower
}

const PLANT_VERT_HEAD = /* glsl */ `
attribute vec4 aOffset;
attribute vec4 aParams;
attribute vec2 aPart;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vPart;
varying vec4 vRand;
`;

export function createFlowers(
  atmos: AtmosUniforms,
  light: LightUniforms,
  p: FlowerParams,
  s: ScatterParams,
  origin: THREE.Vector3,
  far = false,
) {
  const uniforms = {
    ...atmos,
    ...light,
    uPetalA: { value: new THREE.Color(p.petalA) },
    uPetalB: { value: new THREE.Color(p.petalB) },
    uLeaf: { value: new THREE.Color(p.leaf) },
    uBackLight: { value: p.backLight },
    uSparkleRate: { value: p.sparkleRate },
    uSparkleBright: { value: p.sparkleBright },
    uSparkleColor: { value: new THREE.Color(p.sparkleColor) },
    uHeight: { value: p.height },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${PLANT_VERT_HEAD}
      ${LIGHT_GLSL}
      uniform float uHeight;
      void main() {
        float sc = aParams.x * uHeight;
        vec3 p = position * sc;
        float c = cos(aOffset.w), s = sin(aOffset.w);
        p = vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
        vec3 wp = aOffset.xyz + p;
        float h = clamp(position.y / 0.45, 0.0, 1.0);
        float w = sin(uTime * 1.1 + wp.x * 0.35 + wp.z * 0.21) * 0.65
                + sin(uTime * 2.3 + aParams.y * 6.283 + wp.x * 1.3) * 0.35;
        wp.xz += vec2(1.0, 0.35) * w * uWind * h * h;
        vWorld = wp;
        vNormal = vec3(c * normal.x - s * normal.z, normal.y, s * normal.x + c * normal.z);
        vPart = aPart;
        vRand = aParams;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec2 vPart;
      varying vec4 vRand;
      uniform vec3 uPetalA, uPetalB, uLeaf, uSparkleColor;
      uniform float uBackLight, uSparkleRate, uSparkleBright, uHeight;
      ${ATMOS_GLSL}
      ${LIGHT_GLSL}
      void main() {
        vec3 N = normalize(vNormal);
        if (!gl_FrontFacing) N = -N;
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 L = normalize(uLightDir);
        bool petal = vPart.x < 0.5;
        vec3 base = petal ? mix(uPetalA, uPetalB, vRand.z) : uLeaf;
        float ndl = max(dot(N, L), 0.0);
        float wrap = max(dot(N, L) * 0.5 + 0.5, 0.0);
        vec3 amb = mix(uAmbBottom, uAmbTop, N.y * 0.5 + 0.5);
        float back = pow(max(dot(-V, L), 0.0), 3.0) * (petal ? 1.0 : 0.35);
        vec3 col = base * (amb + uLightColor * (ndl * 0.5 + wrap * 0.15));
        col += base * uLightColor * back * uBackLight * (0.3 + vPart.y);
        float rim = pow(1.0 - abs(dot(N, V)), 3.0);
        col += uLightColor * rim * 0.04 * vPart.y * (petal ? 1.0 : 0.3);
        if (petal && vRand.w > 1.0 - uSparkleRate) {
          float tw = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (0.8 + vRand.y * 2.5) + vRand.y * 50.0), 3.0);
          col += uSparkleColor * smoothstep(0.7, 1.0, vPart.y) * tw * uSparkleBright;
        }
        col *= mix(0.25, 1.0, smoothstep(0.0, 0.42 * uHeight, vWorld.y));
        col += localLight(vWorld) * base;
        gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(instanced(flowerGeometry(far), s, origin), mat);
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

// ---------------------------------------------------------------- wheat

function wheatGeometry(): THREE.BufferGeometry {
  // One stalk: a ribbon with a thin stem, a wider head and fine awns. aPart = (kind, t)
  // where kind 0 = stem, 1 = head, 2 = awns and t = height 0..1.
  const rows: [number, number, number][] = [
    [0.0, 0.004, 0],
    [0.7, 0.003, 0],
    [0.72, 0.008, 1],
    [0.8, 0.013, 1],
    [0.9, 0.011, 1],
    [0.96, 0.004, 2],
    [1.1, 0.0005, 2],
  ];
  const pos: number[] = [];
  const part: number[] = [];
  const idx: number[] = [];
  rows.forEach(([y, w, k], i) => {
    pos.push(-w, y, 0, w, y, 0);
    part.push(k, y, k, y);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 2));
  g.setIndex(idx);
  return g;
}

export interface WheatParams {
  stem: string;
  head: string;
  backLight: number;
  height: number;
  widthScale: number;
}

export function createWheat(
  atmos: AtmosUniforms,
  light: LightUniforms,
  p: WheatParams,
  s: ScatterParams,
  origin: THREE.Vector3,
) {
  const uniforms = {
    ...atmos,
    ...light,
    uStem: { value: new THREE.Color(p.stem) },
    uHead: { value: new THREE.Color(p.head) },
    uBackLight: { value: p.backLight },
    uHeight: { value: p.height },
    uWidthScale: { value: p.widthScale },
    tNoise: { value: getNoiseTexture() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${PLANT_VERT_HEAD}
      ${LIGHT_GLSL}
      uniform float uHeight, uWidthScale;
      uniform sampler2D tNoise;
      varying float vTint;
      void main() {
        // Large patches and long horizontal bands across the field.
        float band = textureLod(tNoise, aOffset.xz * vec2(0.004, 0.06), 0.0).r;
        float patchN = textureLod(tNoise, aOffset.xz * 0.02 + 0.3, 0.0).g;
        vTint = smoothstep(0.2, 0.8, band * 0.6 + patchN * 0.4);
        float sc = aParams.x * uHeight * (0.8 + 0.4 * patchN);
        float y = position.y;
        // Widen far stalks a little so they do not vanish into sub-pixel noise.
        float dist = length(aOffset.xz - cameraPosition.xz);
        vec3 p = vec3(position.x * uWidthScale * (1.0 + dist * 0.015), y * sc, 0.0);
        float c = cos(aOffset.w), s = sin(aOffset.w);
        // Lean and bend: the head droops.
        float lean = (aParams.y - 0.5) * 0.25;
        p.x += lean * y * y * sc;
        p = vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
        vec3 wp = aOffset.xyz + p;
        float w = sin(uTime * 0.9 + wp.x * 0.15 + wp.z * 0.08) * 0.6
                + sin(uTime * 1.9 + aParams.z * 6.283 + wp.x * 0.9) * 0.4;
        wp.xz += vec2(1.0, 0.3) * w * uWind * y * y;
        vWorld = wp;
        vNormal = vec3(-s, 0.0, c);
        vPart = aPart;
        vRand = aParams;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec2 vPart;
      varying vec4 vRand;
      uniform vec3 uStem, uHead;
      uniform float uBackLight;
      varying float vTint;
      ${ATMOS_GLSL}
      ${LIGHT_GLSL}
      void main() {
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 L = normalize(uLightDir);
        float headK = smoothstep(0.5, 1.0, vPart.x) ;
        vec3 base = mix(uStem, uHead, headK) * (0.55 + 0.5 * vRand.z) * (0.45 + 1.1 * vTint);
        float back = pow(max(dot(-V, L), 0.0), 2.0);
        vec3 amb = mix(uAmbBottom, uAmbTop, vPart.y);
        vec3 col = base * amb;
        col += base * uLightColor * back * uBackLight * smoothstep(0.55, 1.0, vPart.y);
        col *= mix(0.3, 1.0, vPart.y);
        col += localLight(vWorld) * base * (0.5 + vPart.y);
        gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(instanced(wheatGeometry(), s, origin), mat);
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

// ---------------------------------------------------------------- live updates

type U = Record<string, THREE.IUniform>;
const col = (u: U, k: string, v: string) => (u[k].value as THREE.Color).set(v);

export function applyGround(u: U, p: GroundParams) {
  col(u, 'uColA', p.colorA);
  col(u, 'uColB', p.colorB);
  u.uNoiseScale.value = p.noiseScale;
  u.uStretch.value = p.stretchX;
  col(u, 'uReflColor', p.reflColor);
  u.uReflWidth.value = p.reflWidth;
  u.uReflAz.value = p.reflAz;
  u.uSparkle.value = p.sparkle;
  col(u, 'uSparkleColor', p.sparkleColor);
}

export function applyFlowers(u: U, p: FlowerParams) {
  col(u, 'uPetalA', p.petalA);
  col(u, 'uPetalB', p.petalB);
  col(u, 'uLeaf', p.leaf);
  u.uBackLight.value = p.backLight;
  u.uSparkleRate.value = p.sparkleRate;
  u.uSparkleBright.value = p.sparkleBright;
  col(u, 'uSparkleColor', p.sparkleColor);
  u.uHeight.value = p.height;
}

export function applyWheat(u: U, p: WheatParams) {
  col(u, 'uStem', p.stem);
  col(u, 'uHead', p.head);
  u.uBackLight.value = p.backLight;
  u.uHeight.value = p.height;
  u.uWidthScale.value = p.widthScale;
}

import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { ATMOS_GLSL, type AtmosUniforms } from './atmosphere';
import { getNoiseTexture } from './noiseTexture';

// Black hole sky. Each pixel traces a light ray backwards through a Schwarzschild
// metric (units: Schwarzschild radius = 1) and collects emission from a thin disk
// (plane crossings) and a thick volumetric disk. The result is composited with the
// shared atmosphere and rendered to its own HDR target, which the 3D scene shows
// as its background.

export interface SkyParams {
  bhU: number; // black hole center in the reference frame, 0..1 from the left
  bhV: number; // 0..1 from the top
  dist: number; // observer distance (r_s)
  incl: number; // observer height above the disk plane (degrees)
  roll: number; // image roll (degrees)
  mag: number; // angular magnification (telephoto) around the black hole
  inner: number;
  outer: number;
  falloff: number;
  thinBright: number;
  thinOpacity: number;
  thinNA: number; // noise repeats around the disk (streak length, integer)
  thinNR: number; // noise frequency along the radius (ring density)
  thinContrast: number;
  secondary: number; // brightness of second and later disk crossings (photon ring)
  farOuter: number; // artistic: outer radius of the far (lensed arc) side of the thin disk
  volDensity: number;
  volThick: number; // half thickness / radius at the outer edge
  volFlare: number; // thickness grows as (r / outer)^flare: thin inside, puffy outside
  volTwist: number; // spiral twist of the streaks (radial noise offset per turn)
  nearFade: number; // artistic: hide the disk part between the observer and the hole
  volAbsorb: number;
  volNA: number;
  volNR: number;
  volContrast: number;
  colorHot: string;
  colorCool: string;
  doppler: number;
  rotSpeed: number;
  sparkle: number;
  sparkleBright: number;
  sparkleLen: number;
  backSky: string;
  stars: number;
  starBright: number;
  haloColor: string;
  haloWidth: number;
  haloInside: number;
  transmit: number;
  scale: number; // render scale of the sky target
}

const SKY_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform vec3 uBhRight;
uniform vec3 uBhUp;
uniform vec3 uBhFwd;
uniform float uDist;
uniform float uIncl;
uniform float uRoll;
uniform float uMag;
uniform float uTime;
uniform sampler2D tNoise;
uniform float uInner;
uniform float uOuter;
uniform float uFalloff;
uniform float uThinBright;
uniform float uThinOpacity;
uniform float uThinNA;
uniform float uThinNR;
uniform float uThinContrast;
uniform float uFarOuter;
uniform float uSecondary;
uniform float uVolDensity;
uniform float uVolThick;
uniform float uVolFlare;
uniform float uNearFade;
uniform float uVolTwist;
uniform vec2 uObsDir;
uniform float uVolAbsorb;
uniform float uVolNA;
uniform float uVolNR;
uniform float uVolContrast;
uniform vec3 uColHot;
uniform vec3 uColCool;
uniform float uDoppler;
uniform float uRotSpeed;
uniform float uSparkle;
uniform float uSparkleBright;
uniform float uSparkleLen;
uniform vec3 uBackSky;
uniform float uStars;
uniform float uStarBright;
uniform vec3 uHaloColor;
uniform float uHaloWidth;
uniform float uHaloInside;
uniform float uTransmit;

#define STEPS 280

${ATMOS_GLSL}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}

vec3 starField(vec3 d) {
  vec3 col = vec3(0.0);
  for (int k = 0; k < 2; k++) {
    float sc = k == 0 ? 140.0 : 300.0;
    vec3 p = d * sc;
    vec3 c = floor(p);
    vec3 h = hash33(c + float(k) * 17.0);
    if (h.x < uStars) {
      vec3 sp = normalize(c + 0.2 + 0.6 * hash33(c + 3.1)) * sc;
      float dd = length(p - sp);
      float b = pow(h.y, 5.0) * (k == 0 ? 1.0 : 0.45);
      float tw = 0.75 + 0.25 * sin(uTime * (1.0 + 3.0 * h.z) + h.z * 40.0);
      col += mix(vec3(1.0, 0.85, 0.7), vec3(0.8, 0.88, 1.0), h.z) * b * tw * exp(-dd * dd / 0.012);
    }
  }
  return col;
}

vec3 diskColor(float r) {
  float t = pow(clamp(uInner / r, 0.0, 1.0), 0.75);
  return mix(uColCool, uColHot, t);
}

float radialProfile(float r) {
  float x = (r - uInner) / (uOuter - uInner);
  if (x < 0.0 || x > 1.0) return 0.0;
  return smoothstep(0.0, 0.05, x) * (1.0 - smoothstep(0.5, 1.0, x)) * pow(uInner / r, uFalloff);
}

float dopplerFactor(vec3 p, vec3 v, float r) {
  vec3 tang = normalize(vec3(-p.z, 0.0, p.x)) * (uRotSpeed < 0.0 ? -1.0 : 1.0);
  float beta = clamp(sqrt(0.5 / max(r - 1.0, 0.05)), 0.0, 0.92);
  float cosT = dot(tang, -normalize(v));
  float g = sqrt(1.0 - beta * beta) / (1.0 - beta * cosT);
  return mix(1.0, min(g * g * g, 2.0), uDoppler);
}

// x: angle around the disk in turns (rotated by Keplerian motion), y: radius
vec2 polarUV(vec3 p, float r) {
  float phi = atan(p.z, p.x);
  float rot = uTime * uRotSpeed * pow(r, -1.5);
  return vec2((phi - rot) / 6.2831853, r);
}

vec4 thinDisk(vec3 p, vec3 v) {
  float r = length(p.xz);
  float prof = radialProfile(r);
  if (prof <= 0.0) return vec4(0.0);
  // Keep the far side (the lensed arc) compact while the near side stays wide.
  float far = smoothstep(0.1, -0.6, dot(p.xz / r, uObsDir));
  prof *= 1.0 - far * smoothstep(uFarOuter * 0.6, uFarOuter, r);
  vec2 pu = polarUV(p, r);
  float n1 = textureLod(tNoise, vec2(pu.x * uThinNA, pu.y * uThinNR), 0.0).r;
  float n2 = textureLod(tNoise, vec2(pu.x * uThinNA * 3.0 + 0.31, pu.y * uThinNR * 2.7), 0.0).g;
  float n = smoothstep(0.15, 0.85, n1 * 0.6 + n2 * 0.4);
  float dens = prof * mix(1.0, n * 1.8, uThinContrast);
  float a = clamp(dens * uThinOpacity, 0.0, 1.0);
  return vec4(diskColor(r) * dens * uThinBright * dopplerFactor(p, v, r), a);
}

float volH(float r) {
  return uVolThick * r * pow(clamp(r / uOuter, 0.0, 1.0), uVolFlare) + 0.01;
}

void volumeSample(vec3 p, vec3 v, float dt, inout vec3 col, inout float T) {
  float r = length(p.xz);
  float prof = radialProfile(r);
  if (prof <= 0.0) return;
  float H = volH(r);
  float y = p.y / H;
  if (abs(y) > 3.5) return;
  float vert = exp(-y * y);
  vec2 pu = polarUV(p, r);
  float sv = pu.y * uVolNR + pu.x * uVolTwist;
  float n1 = textureLod(tNoise, vec2(pu.x * uVolNA, sv + y * 0.08), 0.0).r;
  float n2 = textureLod(tNoise, vec2(pu.x * uVolNA * 2.0 + 0.5, sv * 2.1 - y * 0.12), 0.0).g;
  float n = smoothstep(0.25, 0.9, n1 * 0.55 + n2 * 0.45);
  float dens = prof * vert * mix(1.0, n * n * 3.0, uVolContrast);

  // Fade the near side so the shadow stays clean (the reference keeps it hidden).
  float toObs = dot(p.xz / r, uObsDir);
  dens *= 1.0 - uNearFade * smoothstep(-0.45, 0.4, toObs);
  vec3 em = diskColor(r) * dens;

  if (uSparkle > 0.0) {
    vec2 g = vec2(pu.x * 900.0, pu.y * 6.0 + y * 0.8);
    vec2 c = floor(g);
    float h = hash12(c);
    if (h < uSparkle) {
      vec2 o = vec2(hash12(c + 7.7), hash12(c + 3.3)) * 0.6 + 0.2;
      vec2 d = (g - c - o) * vec2(1.0 / uSparkleLen, 1.0);
      em += diskColor(r) * uSparkleBright * exp(-dot(d, d) * 18.0) * prof * exp(-y * y * 0.3);
    }
  }

  col += T * em * uVolDensity * dopplerFactor(p, v, r) * dt;
  T *= exp(-dens * uVolAbsorb * dt);
}

void main() {
  vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vp /= vp.w;
  vec3 dirW = normalize((uCamWorld * vec4(vp.xyz, 0.0)).xyz);

  // Direction in the black-hole view frame, with telephoto magnification and roll.
  vec3 l = vec3(dot(dirW, uBhRight), dot(dirW, uBhUp), dot(dirW, uBhFwd));
  float thS = acos(clamp(l.z, -1.0, 1.0));
  float ps = atan(l.y, l.x) + uRoll;
  float th = thS / uMag;
  vec3 ll = vec3(sin(th) * cos(ps), sin(th) * sin(ps), cos(th));

  float si = sin(uIncl);
  float ci = cos(uIncl);
  vec3 F = vec3(0.0, -si, ci);
  vec3 U = vec3(0.0, ci, si);
  vec3 R = vec3(1.0, 0.0, 0.0);
  vec3 p = -uDist * F;
  vec3 v = normalize(ll.x * R + ll.y * U + ll.z * F);
  vec3 hv = cross(p, v);
  float h2 = dot(hv, hv);

  vec3 col = vec3(0.0);
  float T = 1.0;
  bool captured = false;
  float crossings = 0.0;
  float reach = uOuter * 1.4;
  bool trace = reach >= uDist || th < asin(reach / uDist) + 0.02;

  if (trace) {
    for (int i = 0; i < STEPS; i++) {
      float r = length(p);
      if (r < 1.0) { captured = true; break; }
      if (r > uDist * 1.3 && dot(p, v) > 0.0) break;
      float dt = clamp(0.07 * r, 0.012, 3.0);
      if (uVolDensity > 0.0) {
        float rx = length(p.xz);
        float H = volH(rx);
        if (rx > uInner * 0.8 && rx < uOuter * 1.05 && abs(p.y) < 3.5 * H) dt = min(dt, max(0.3 * H, 0.03));
      }
      vec3 p0 = p;
      v += (-1.5 * h2 * p / pow(r, 5.0)) * dt * 0.5;
      p += v * dt;
      float r1 = length(p);
      v += (-1.5 * h2 * p / pow(r1, 5.0)) * dt * 0.5;

      if (uThinOpacity > 0.0 && p0.y * p.y < 0.0) {
        vec3 pc = mix(p0, p, p0.y / (p0.y - p.y));
        vec4 d = thinDisk(pc, v);
        float k = crossings > 0.5 ? uSecondary : 1.0;
        col += T * d.rgb * k;
        T *= 1.0 - d.a * k;
        crossings += 1.0;
      }
      if (uVolDensity > 0.0) volumeSample(p, v, dt, col, T);
      if (T < 0.01) break;
    }
  }

  vec3 bg = vec3(0.0);
  if (!captured) bg = uBackSky + starField(normalize(v)) * uStarBright;
  vec3 bh = col + T * bg;

  float shadowAng = asin(min(2.598 / uDist, 1.0)) * uMag;
  float halo = exp(-max(thS - shadowAng, 0.0) / uHaloWidth) * (captured ? uHaloInside : 1.0);

  gl_FragColor = vec4(bh * uTransmit + atmosphere(dirW) + uHaloColor * halo, 1.0);
}
`;

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export class SkyPass {
  readonly rt: THREE.WebGLRenderTarget;
  readonly uniforms: Record<string, THREE.IUniform>;
  private readonly quad: FullScreenQuad;
  private readonly bgUniforms = {
    tSky: { value: null as THREE.Texture | null },
    uRes: { value: new THREE.Vector2(1, 1) },
  };
  private width = 1;
  private height = 1;

  constructor(
    public params: SkyParams,
    readonly atmos: AtmosUniforms,
  ) {
    this.rt = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.uniforms = {
      ...atmos,
      uInvProj: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
      uBhRight: { value: new THREE.Vector3(1, 0, 0) },
      uBhUp: { value: new THREE.Vector3(0, 1, 0) },
      uBhFwd: { value: new THREE.Vector3(0, 0, -1) },
      uTime: { value: 0 },
      uObsDir: { value: new THREE.Vector2(0, -1) },
      tNoise: { value: getNoiseTexture() },
      uColHot: { value: new THREE.Color() },
      uColCool: { value: new THREE.Color() },
      uBackSky: { value: new THREE.Color() },
      uHaloColor: { value: new THREE.Color() },
    };
    const scalar = [
      'dist', 'mag', 'inner', 'outer', 'falloff', 'thinBright', 'thinOpacity', 'thinNA', 'thinNR',
      'thinContrast', 'farOuter', 'secondary', 'volDensity', 'volThick', 'volFlare', 'volTwist', 'nearFade', 'volAbsorb', 'volNA', 'volNR', 'volContrast', 'doppler',
      'rotSpeed', 'sparkle', 'sparkleBright', 'sparkleLen', 'stars', 'starBright', 'haloWidth',
      'haloInside', 'transmit', 'incl', 'roll',
    ];
    for (const k of scalar) this.uniforms['u' + k[0].toUpperCase() + k.slice(1)] = { value: 0 };
    this.applyParams();
    this.quad = new FullScreenQuad(
      new THREE.ShaderMaterial({
        vertexShader: QUAD_VERT,
        fragmentShader: SKY_FRAG,
        uniforms: this.uniforms,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.bgUniforms.tSky.value = this.rt.texture;
  }

  /** Copy params into uniforms. Call after any param change. */
  applyParams() {
    const p = this.params;
    const u = this.uniforms;
    const set = (name: string, v: number) => (u[name].value = v);
    set('uDist', p.dist);
    set('uIncl', THREE.MathUtils.degToRad(p.incl));
    set('uRoll', THREE.MathUtils.degToRad(p.roll));
    set('uMag', p.mag);
    set('uInner', p.inner);
    set('uOuter', p.outer);
    set('uFalloff', p.falloff);
    set('uThinBright', p.thinBright);
    set('uThinOpacity', p.thinOpacity);
    set('uThinNA', Math.round(p.thinNA));
    set('uThinNR', p.thinNR);
    set('uThinContrast', p.thinContrast);
    set('uFarOuter', p.farOuter);
    set('uSecondary', p.secondary);
    set('uVolDensity', p.volDensity);
    set('uVolThick', p.volThick);
    set('uVolFlare', p.volFlare);
    set('uNearFade', p.nearFade);
    set('uVolTwist', Math.round(p.volTwist));
    set('uVolAbsorb', p.volAbsorb);
    set('uVolNA', Math.round(p.volNA));
    set('uVolNR', p.volNR);
    set('uVolContrast', p.volContrast);
    set('uDoppler', p.doppler);
    set('uRotSpeed', p.rotSpeed);
    set('uSparkle', p.sparkle);
    set('uSparkleBright', p.sparkleBright);
    set('uSparkleLen', p.sparkleLen);
    set('uStars', p.stars);
    set('uStarBright', p.starBright);
    set('uHaloWidth', p.haloWidth);
    set('uHaloInside', p.haloInside);
    set('uTransmit', p.transmit);
    (u.uColHot.value as THREE.Color).set(p.colorHot);
    (u.uColCool.value as THREE.Color).set(p.colorCool);
    (u.uBackSky.value as THREE.Color).set(p.backSky);
    (u.uHaloColor.value as THREE.Color).set(p.haloColor);
    this.updateSize();
  }

  setSize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.bgUniforms.uRes.value.set(width, height);
    this.updateSize();
  }

  private updateSize() {
    const s = this.params.scale;
    const w = Math.max(1, Math.round(this.width * s));
    const h = Math.max(1, Math.round(this.height * s));
    if (w !== this.rt.width || h !== this.rt.height) this.rt.setSize(w, h);
  }

  /** Point the black hole frame at a world direction. */
  setDirection(dir: THREE.Vector3) {
    const fwd = this.uniforms.uBhFwd.value as THREE.Vector3;
    const right = this.uniforms.uBhRight.value as THREE.Vector3;
    const up = this.uniforms.uBhUp.value as THREE.Vector3;
    fwd.copy(dir).normalize();
    right.crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    up.crossVectors(right, fwd).normalize();
    this.atmos.uBhDirW.value.copy(fwd);
  }

  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, time: number) {
    this.uniforms.uTime.value = time;
    (this.uniforms.uInvProj.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
    (this.uniforms.uCamWorld.value as THREE.Matrix4).copy(camera.matrixWorld);
    renderer.setRenderTarget(this.rt);
    this.quad.render(renderer);
  }

  /** Full-screen mesh at the far plane that shows the sky target behind the scene. */
  createBackground(): THREE.Mesh {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: this.bgUniforms,
      vertexShader: /* glsl */ `void main() { gl_Position = vec4(position.xy, 1.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSky;
        uniform vec2 uRes;
        void main() { gl_FragColor = texture2D(tSky, gl_FragCoord.xy / uRes); }`,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -1000;
    return mesh;
  }
}

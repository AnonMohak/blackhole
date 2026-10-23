import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// Per-scene post chain: render (shared MSAA target) -> bokeh DOF -> bloom -> grade (tone map, color, grain).
// Output stays in a target (sRGB encoded) so the app can cross-fade two scenes.

export interface PostParams {
  dof: boolean;
  focus: number; // metres
  aperture: number; // CoC scale
  maxBlur: number; // pixels at 1080p
  farBlur: number; // multiplier for blur behind the focus plane
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  exposure: number;
  contrast: number;
  saturation: number;
  lift: string;
  gain: string;
  vignette: number;
  grain: number;
  aberration: number;
}

// Bokeh DOF (single-pass gather, after Dennis Gustafsson) run at half resolution,
// then composited over the sharp full-resolution image by circle of confusion.
const DOF_COMMON = /* glsl */ `
  #include <packing>
  varying vec2 vUv;
  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform float uNear, uFar, uFocus, uAperture, uMaxBlur, uFarBlur;
  uniform vec2 uPixel; // full-resolution texel
  float viewDist(vec2 uv) {
    return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar);
  }
  // Blur radius in full-resolution pixels.
  float blurSize(float d) {
    float coc = (1.0 / uFocus - 1.0 / d) * uAperture;
    if (coc > 0.0) coc *= uFarBlur;
    return clamp(abs(coc), 0.0, 1.0) * uMaxBlur;
  }
`;

const DOF_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const DOF_GATHER = /* glsl */ `
  ${DOF_COMMON}
  const float GOLDEN = 2.39996323;
  void main() {
    // Work in half-resolution pixels.
    float maxB = uMaxBlur * 0.5;
    vec2 px = uPixel * 2.0;
    float cd = viewDist(vUv);
    float cs = blurSize(cd) * 0.5;
    vec3 col = texture2D(tDiffuse, vUv).rgb;
    float tot = 1.0;
    float cov = cs;
    float radius = 0.7;
    for (int i = 0; i < 120; i++) {
      if (radius >= maxB) break;
      float ang = float(i) * GOLDEN;
      vec2 tc = vUv + vec2(cos(ang), sin(ang)) * px * radius;
      vec3 sc = texture2D(tDiffuse, tc).rgb;
      float sd = viewDist(tc);
      float ss = blurSize(sd) * 0.5;
      if (sd > cd) ss = clamp(ss, 0.0, cs * 2.0);
      float m = smoothstep(radius - 0.5, radius + 0.5, ss);
      col += mix(col / tot, sc, m);
      cov = max(cov, m * ss);
      tot += 1.0;
      radius += 0.9 / radius;
    }
    // Alpha: how far blur reaches this pixel (full-res pixels / uMaxBlur).
    gl_FragColor = vec4(col / tot, cov * 2.0 / max(uMaxBlur, 1e-3));
  }`;

const DOF_COMPOSE = /* glsl */ `
  ${DOF_COMMON}
  uniform sampler2D tDof;
  uniform float uDofOn;
  void main() {
    vec3 sharp = texture2D(tDiffuse, vUv).rgb;
    if (uDofOn < 0.5) { gl_FragColor = vec4(sharp, 1.0); return; }
    vec4 blur = texture2D(tDof, vUv);
    float b = max(blurSize(viewDist(vUv)), blur.a * uMaxBlur);
    gl_FragColor = vec4(mix(sharp, blur.rgb, smoothstep(0.6, 2.2, b)), 1.0);
  }`;

class DofPass extends Pass {
  readonly uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    tDof: { value: null as THREE.Texture | null },
    uNear: { value: 0.05 },
    uFar: { value: 8000 },
    uFocus: { value: 5 },
    uAperture: { value: 1 },
    uMaxBlur: { value: 16 },
    uFarBlur: { value: 1 },
    uPixel: { value: new THREE.Vector2() },
    uDofOn: { value: 1 },
  };
  private readonly half = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  private readonly gather = new FullScreenQuad(
    new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: DOF_VERT, fragmentShader: DOF_GATHER, depthTest: false, depthWrite: false }),
  );
  private readonly compose = new FullScreenQuad(
    new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: DOF_VERT, fragmentShader: DOF_COMPOSE, depthTest: false, depthWrite: false }),
  );

  setSize(width: number, height: number) {
    this.half.setSize(Math.ceil(width / 2), Math.ceil(height / 2));
    this.uniforms.uPixel.value.set(1 / width, 1 / height);
  }

  dofOn = true;

  /** Reads the shared scene target (not readBuffer) and writes the first composer buffer. */
  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget) {
    const src = getSceneTarget();
    this.uniforms.tDiffuse.value = src.texture;
    this.uniforms.tDepth.value = src.depthTexture;
    this.uniforms.uDofOn.value = this.dofOn ? 1 : 0;
    if (this.dofOn) {
      renderer.setRenderTarget(this.half);
      this.gather.render(renderer);
      this.uniforms.tDof.value = this.half.texture;
    }
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.compose.render(renderer);
  }
}

// One multisampled HDR target with depth, shared by every pipeline: each pipeline renders
// its scene into it and immediately consumes it in the source pass, so scenes never need
// their own (large) MSAA buffers.
let sceneTarget: THREE.WebGLRenderTarget | null = null;
function getSceneTarget(): THREE.WebGLRenderTarget {
  sceneTarget ??= new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: 4,
    depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType),
  });
  return sceneTarget;
}

const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uExposure: { value: 1 },
    uContrast: { value: 1 },
    uSaturation: { value: 1 },
    uLift: { value: new THREE.Color(0, 0, 0) },
    uGain: { value: new THREE.Color(1, 1, 1) },
    uVignette: { value: 0.3 },
    uGrain: { value: 0.03 },
    uAberration: { value: 0.0 },
    uTime: { value: 0 },
    uAspect: { value: 16 / 9 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uExposure, uContrast, uSaturation, uVignette, uGrain, uAberration, uTime, uAspect;
    uniform vec3 uLift, uGain;

    vec3 aces(vec3 x) {
      const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    vec3 toSRGB(vec3 c) {
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }

    void main() {
      vec2 dc = vUv - 0.5;
      vec3 col;
      if (uAberration > 0.0) {
        vec2 off = dc * uAberration * 0.01;
        col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      } else {
        col = texture2D(tDiffuse, vUv).rgb;
      }
      col = aces(col * uExposure);
      // Grade in display space.
      col = toSRGB(col);
      col = uLift + col * (uGain - uLift);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;
      vec2 vd = dc * vec2(1.0, 1.0 + 0.25 / uAspect) * 1.5;
      col *= mix(1.0, smoothstep(1.05, 0.25, length(vd)), uVignette);
      col += (hash(vUv * 1000.0 + fract(uTime) * 100.0) - 0.5) * uGrain;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

export class Pipeline {
  readonly composer: EffectComposer;
  private readonly dof: DofPass;
  private readonly bloom: UnrealBloomPass;
  private readonly grade: ShaderPass;
  private height = 1080;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    public params: PostParams,
  ) {
    this.composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false }));
    this.composer.renderToScreen = false;
    this.dof = new DofPass();
    this.composer.addPass(this.dof);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 1, 0.5, 1);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GRADE_SHADER);
    this.composer.addPass(this.grade);
    this.applyParams();
  }

  applyParams() {
    const p = this.params;
    const du = this.dof.uniforms;
    this.dof.dofOn = p.dof;
    du.uFocus.value = p.focus;
    du.uAperture.value = p.aperture;
    du.uMaxBlur.value = p.maxBlur * (this.height / 1080);
    du.uFarBlur.value = p.farBlur;
    this.bloom.strength = p.bloomStrength;
    this.bloom.radius = p.bloomRadius;
    this.bloom.threshold = p.bloomThreshold;
    const g = this.grade.uniforms;
    g.uExposure.value = p.exposure;
    g.uContrast.value = p.contrast;
    g.uSaturation.value = p.saturation;
    (g.uLift.value as THREE.Color).set(p.lift);
    (g.uGain.value as THREE.Color).set(p.gain);
    g.uVignette.value = p.vignette;
    g.uGrain.value = p.grain;
    g.uAberration.value = p.aberration;
  }

  setSize(width: number, height: number, pixelRatio: number) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    const st = getSceneTarget();
    const w = Math.round(width * pixelRatio);
    const h = Math.round(height * pixelRatio);
    if (st.width !== w || st.height !== h) st.setSize(w, h);
    this.height = height * pixelRatio;
    this.grade.uniforms.uAspect.value = width / height;
    this.applyParams();
  }

  render(dt: number, time: number): THREE.Texture {
    this.dof.uniforms.uNear.value = this.camera.near;
    this.dof.uniforms.uFar.value = this.camera.far;
    this.grade.uniforms.uTime.value = time;
    this.renderer.setRenderTarget(getSceneTarget());
    this.renderer.render(this.scene, this.camera);
    this.composer.render(dt);
    return this.composer.readBuffer.texture;
  }
}

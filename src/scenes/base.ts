import * as THREE from 'three';
import type GUI from 'lil-gui';
import { applyAtmos, atmosphereJS, createAtmosUniforms, type AtmosParams, type AtmosUniforms } from '../blackhole/atmosphere';
import { SkyPass, type SkyParams } from '../blackhole/sky';
import { Pipeline, type PostParams } from '../post/pipeline';
import { addParams } from '../dev/gui';
import { CameraRig, type RigParams } from './rig';
import { applyGround, createGround, createLightUniforms, type GroundParams, type LightUniforms } from './field';

// Parts every scene shares: camera rig, atmosphere, black hole sky, ground, the light
// model for custom shaders, three.js lights for regular materials, and the post chain.

export interface LightParams {
  elevation: number; // degrees above the horizon, in the black hole's azimuth
  color: string;
  intensity: number;
  ambTop: string;
  ambBottom: string;
  wind: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  sunIntensity: number;
  localColor: string;
  localIntensity: number;
  localRadius: number;
  localX: number;
  localY: number;
  localZ: number;
}

export interface BasePreset {
  rig: RigParams;
  atmos: AtmosParams;
  sky: SkyParams;
  post: PostParams;
  ground: GroundParams;
  light: LightParams;
}

const SKY_RANGES: Record<string, [number, number, number?]> = {
  bhU: [0, 1, 0.001],
  bhV: [0, 1, 0.001],
  dist: [4, 80],
  incl: [-30, 30, 0.1],
  roll: [-30, 30, 0.1],
  mag: [0.3, 4],
  inner: [1.5, 8],
  outer: [3, 60],
  farOuter: [2, 60],
  secondary: [0, 1],
  falloff: [0, 3],
  thinNA: [1, 16, 1],
  volNA: [1, 16, 1],
  thinOpacity: [0, 2],
  thinContrast: [0, 1],
  volContrast: [0, 1],
  volThick: [0.005, 0.6],
  volFlare: [0, 3],
  nearFade: [0, 1],
  volTwist: [-40, 40, 1],
  doppler: [0, 1],
  rotSpeed: [-3, 3],
  sparkle: [0, 0.5],
  stars: [0, 0.6],
  haloWidth: [0.005, 0.6],
  haloInside: [0, 1],
  transmit: [0, 2],
  scale: [0.25, 1, 0.05],
};

export class SceneBase {
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly atmos: AtmosUniforms;
  readonly sky: SkyPass;
  readonly light: LightUniforms;
  readonly ground: ReturnType<typeof createGround>;
  readonly post: Pipeline;
  readonly hemi = new THREE.HemisphereLight();
  readonly sun = new THREE.DirectionalLight();
  readonly bhDir = new THREE.Vector3(0, 0, -1);
  private readonly fog = new THREE.FogExp2(0x000000, 0.01);

  constructor(
    renderer: THREE.WebGLRenderer,
    readonly P: BasePreset,
  ) {
    this.rig = new CameraRig(P.rig);
    this.atmos = createAtmosUniforms(P.atmos);
    this.sky = new SkyPass(P.sky, this.atmos);
    this.scene.add(this.sky.createBackground());
    this.light = createLightUniforms();
    this.ground = createGround(this.atmos, this.light, P.ground);
    this.scene.add(this.ground.mesh);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.scene.fog = this.fog;
    this.post = new Pipeline(renderer, this.scene, this.rig.camera, P.post);
    this.applyBase();
    this.updateBase(0, 0);
  }

  applyBase() {
    const P = this.P;
    applyAtmos(this.atmos, P.atmos);
    this.sky.applyParams();
    this.post.applyParams();
    applyGround(this.ground.uniforms, P.ground);
    const L = P.light;
    this.light.uLightColor.value.set(L.color).multiplyScalar(L.intensity);
    this.light.uAmbTop.value.set(L.ambTop);
    this.light.uAmbBottom.value.set(L.ambBottom);
    this.light.uWind.value = L.wind;
    this.light.uLocalColor.value.set(L.localColor).multiplyScalar(L.localIntensity);
    this.light.uLocalRadius.value = L.localRadius;
    this.light.uLocalPos.value.set(L.localX, L.localY, L.localZ);
    this.hemi.color.set(L.hemiSky);
    this.hemi.groundColor.set(L.hemiGround);
    this.hemi.intensity = L.hemiIntensity;
    this.sun.color.set(L.color);
    this.sun.intensity = L.sunIntensity;
    this.fog.density = P.atmos.fogDensity;
    this.rig.setAspect(this.rig.camera.aspect);
  }

  updateBase(dt: number, time: number) {
    this.rig.update(dt, time);
    this.rig.dirFromRef(this.P.sky.bhU, this.P.sky.bhV, this.bhDir);
    this.sky.setDirection(this.bhDir);
    // Key light: the black hole's azimuth, raised to the given elevation.
    const flat = new THREE.Vector3(this.bhDir.x, 0, this.bhDir.z).normalize();
    const e = THREE.MathUtils.degToRad(this.P.light.elevation);
    const ld = flat.multiplyScalar(Math.cos(e)).setY(Math.sin(e));
    this.light.uLightDir.value.copy(ld);
    this.sun.position.copy(ld).multiplyScalar(100);
    this.light.uTime.value = time;
    // Fog color for regular materials: the horizon straight ahead.
    atmosphereJS(this.atmos, new THREE.Vector3(0, 0, -1), this.fog.color);
  }

  setSize(width: number, height: number, pixelRatio: number) {
    this.rig.setAspect(width / height);
    this.sky.setSize(width * pixelRatio, height * pixelRatio);
    this.post.setSize(width, height, pixelRatio);
  }

  render(renderer: THREE.WebGLRenderer, dt: number, time: number): THREE.Texture {
    this.sky.render(renderer, this.rig.camera, time);
    return this.post.render(dt, time);
  }

  baseGui(gui: GUI, onChange: () => void) {
    const apply = () => {
      this.applyBase();
      onChange();
    };
    addParams(gui.addFolder('Camera').close(), this.P.rig, apply, { pitch: [-20, 30, 0.05], yaw: [-30, 30, 0.05], fov: [10, 70] });
    addParams(gui.addFolder('Black hole').close(), this.P.sky, apply, SKY_RANGES);
    addParams(gui.addFolder('Atmosphere').close(), this.P.atmos, apply, {
      skyGradH: [0.01, 1],
      glowWidth: [0.001, 0.3, 0.001],
      glowAz: [0.05, 3],
      fogDensity: [0, 0.05, 0.0001],
    });
    addParams(gui.addFolder('Light').close(), this.P.light, apply, { elevation: [-10, 80] });
    addParams(gui.addFolder('Ground').close(), this.P.ground, apply, {
      noiseScale: [0.001, 1, 0.001],
      stretchX: [1, 40],
      reflWidth: [0.001, 0.2, 0.001],
      reflAz: [0.05, 3],
      sparkle: [0, 0.2, 0.001],
    });
    addParams(gui.addFolder('Post').close(), this.P.post, apply, {
      focus: [0.5, 100],
      aperture: [0, 10],
      maxBlur: [1, 40],
      farBlur: [0, 2],
      bloomThreshold: [0, 4],
      vignette: [0, 1],
      grain: [0, 0.2, 0.001],
      aberration: [0, 3],
    });
  }
}


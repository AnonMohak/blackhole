import * as THREE from 'three';
import type GUI from 'lil-gui';
import { addParams } from '../dev/gui';
import { SceneBase, type BasePreset } from './base';
import { addModel, createGradientEnv } from './models';
import { createJoshuaTree } from './props';
import { applyTerrain, createTerrain, type TerrainParams } from './terrain';
import type { BlackholeScene } from './types';

// Scene IV: rose-violet twilight over wind-carved dunes. A silver trailer glows under its
// string lights next to a Joshua tree; a red-gold swirling black hole sinks into the sand.

type Placement = { x: number; z: number; rotY: number; scale: number };

const PRESET: BasePreset & { terrain: TerrainParams; trailer: Placement; tree: Placement } = {
  rig: { x: 0, y: 1.7, z: 0, yaw: 0, pitch: 3, fov: 38, parallax: 1.0, drift: 0.2 },
  atmos: {
    skyTop: '#0e0820',
    skyHorizon: '#5a2a50',
    skyGradH: 0.35,
    glowColor: '#ff9a6a',
    glowIntensity: 0.5,
    glowWidth: 0.03,
    glowAz: 0.9,
    fogDensity: 0.0018,
  },
  sky: {
    bhU: 0.56,
    bhV: 0.42,
    dist: 18,
    incl: 12,
    roll: 0,
    mag: 1.5,
    inner: 2.2,
    outer: 9,
    falloff: 1.4,
    thinBright: 3,
    thinOpacity: 1.2,
    thinNA: 2,
    thinNR: 2,
    thinContrast: 0.5,
    secondary: 0.4,
    farOuter: 60,
    volDensity: 0.45,
    volThick: 0.12,
    volFlare: 1,
    volTwist: 10,
    nearFade: 1,
    volAbsorb: 0.2,
    volNA: 1,
    volNR: 10,
    volContrast: 0.85,
    colorHot: '#fff2d8',
    colorCool: '#ff7048',
    doppler: 0.4,
    rotSpeed: 0.7,
    sparkle: 0.05,
    sparkleBright: 3,
    sparkleLen: 4,
    backSky: '#000000',
    stars: 0.15,
    starBright: 0.8,
    haloColor: '#2a0a10',
    haloWidth: 0.12,
    haloInside: 0,
    transmit: 1,
    scale: 0.85,
  },
  post: {
    dof: false,
    focus: 30,
    aperture: 0.5,
    maxBlur: 8,
    farBlur: 0.2,
    bloomStrength: 0.4,
    bloomRadius: 0.6,
    bloomThreshold: 1.6,
    exposure: 1.0,
    contrast: 1.08,
    saturation: 1.05,
    lift: '#0a0410',
    gain: '#fff0e8',
    vignette: 0.45,
    grain: 0.05,
    aberration: 0.3,
  },
  ground: {
    colorA: '#3a1e1c',
    colorB: '#6a3a32',
    noiseScale: 0.05,
    stretchX: 4,
    reflColor: '#000000',
    reflWidth: 0.02,
    reflAz: 1,
    sparkle: 0,
    sparkleColor: '#ffffff',
  },
  light: {
    elevation: 6,
    color: '#ffa890',
    intensity: 1.0,
    ambTop: '#3a2440',
    ambBottom: '#120810',
    wind: 0,
    hemiSky: '#8a5a7a',
    hemiGround: '#2a1418',
    hemiIntensity: 0.7,
    sunIntensity: 2.2,
    localColor: '#000000',
    localIntensity: 0,
    localRadius: 1,
    localX: 0,
    localY: 0,
    localZ: 0,
  },
  terrain: {
    height: 16,
    scale: 1,
    clearRadius: 10,
    colorLow: '#3a2030',
    colorHigh: '#c47a66',
    rim: 1.2,
    ripple: 0.4,
    sparkle: 0,
    flatX: -7,
    flatZ: -24,
    flatR: 9,
  },
  trailer: { x: -7, z: -24, rotY: 0.35, scale: 1 },
  tree: { x: 10, z: -19, rotY: 0, scale: 1.0 },
};

export function createDunesScene(renderer: THREE.WebGLRenderer): BlackholeScene {
  const P = structuredClone(PRESET);
  const base = new SceneBase(renderer, P);
  base.ground.mesh.visible = false;

  const terrain = createTerrain(base.atmos, base.light, P.terrain, 'dunes', 2400, 640, new THREE.Vector2(0, -1100));
  base.scene.add(terrain.mesh);

  const env = createGradientEnv(renderer, new THREE.Color('#3a2a50'), new THREE.Color('#f0a0a0'), new THREE.Color('#5a3040'), new THREE.Color(4, 2.2, 1.4), base.bhDir);
  const trailer = new THREE.Group();
  base.scene.add(trailer);
  addModel(trailer, 'trailer', env).then((m) =>
    // The exported window and bulb emission is tuned for Blender; tone it down here.
    m?.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (mat?.emissiveIntensity) mat.emissiveIntensity *= 0.3;
    }),
  );
  const porch = new THREE.PointLight(0xffa060, 25, 14, 2);
  porch.position.set(0, 2.4, 2.4);
  trailer.add(porch);

  const tree = createJoshuaTree();
  base.scene.add(tree);

  const place = (o: THREE.Object3D, p: Placement) => {
    o.position.set(p.x, 0, p.z);
    o.rotation.y = p.rotY;
    o.scale.setScalar(p.scale);
  };
  const apply = () => {
    P.terrain.flatX = P.trailer.x;
    P.terrain.flatZ = P.trailer.z;
    applyTerrain(terrain.uniforms, P.terrain);
    place(trailer, P.trailer);
    place(tree, P.tree);
  };
  apply();

  return {
    id: 'dunes',
    label: 'Dunes',
    base,
    params: P,
    update: (dt, time) => base.updateBase(dt, time),
    buildGui(gui: GUI) {
      base.baseGui(gui, apply);
      addParams(gui.addFolder('Dunes').close(), P.terrain, apply, { height: [0, 60], scale: [0.2, 3], clearRadius: [0, 80] });
      addParams(gui.addFolder('Trailer').close(), P.trailer, apply, { x: [-60, 60, 0.1], z: [-120, -5, 0.1], rotY: [-3.2, 3.2] });
      addParams(gui.addFolder('Tree').close(), P.tree, apply, { x: [-60, 60, 0.1], z: [-120, -5, 0.1], rotY: [-3.2, 3.2] });
    },
  };
}

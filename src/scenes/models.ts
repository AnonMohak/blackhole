import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Procedural stand-ins for the astronaut, the farmhouse and the pickup. Each one can be
// replaced by a GLB in public/models/ (see loadOptionalModel); the GLB is scaled to the
// stand-in's height and placed at the same spot.

/** Loads /models/<name>.glb if it exists. Returns null when the file is missing. */
export async function loadOptionalModel(name: string): Promise<THREE.Object3D | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}models/${name}.glb`);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    // The dev server answers missing files with index.html; check the glTF magic.
    if (buf.byteLength < 4 || new TextDecoder().decode(buf.slice(0, 4)) !== 'glTF') return null;
    const gltf = await new GLTFLoader().parseAsync(buf, '');
    return gltf.scene;
  } catch {
    return null;
  }
}

/** Give a loaded model's PBR materials an environment map for reflections. */
export function applyEnv(model: THREE.Object3D, envMap: THREE.Texture | null, intensity = 1) {
  model.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m && 'envMap' in m) {
      m.envMap = envMap;
      m.envMapIntensity = intensity;
    }
  });
}

/** Load /models/<name>.glb at its authored size (metres) into parent. */
export async function addModel(parent: THREE.Object3D, name: string, envMap: THREE.Texture | null = null) {
  const model = await loadOptionalModel(name);
  if (!model) return null;
  model.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).frustumCulled = false;
  });
  if (envMap) applyEnv(model, envMap);
  parent.add(model);
  return model;
}

/**
 * Replace a stand-in's meshes with /models/<name>.glb at its authored size (metres).
 * Lights inside the stand-in group stay. Emissive parts can be scaled for this scene.
 */
export async function swapIn(group: THREE.Object3D, name: string, envMap: THREE.Texture | null = null, envIntensity = 1, emissive = 1) {
  const model = await loadOptionalModel(name);
  if (!model) return null;
  for (const c of [...group.children]) if (!(c as THREE.Light).isLight) group.remove(c);
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    const m = mesh.material as THREE.MeshStandardMaterial;
    if (m.emissiveIntensity !== undefined) m.emissiveIntensity *= emissive;
  });
  if (envMap) applyEnv(model, envMap, envIntensity);
  group.add(model);
  return model;
}

/** Swap a stand-in for a loaded model with the same height and ground contact. */
export function replaceWith(standIn: THREE.Object3D, model: THREE.Object3D, envMap: THREE.Texture | null = null) {
  if (envMap) applyEnv(model, envMap, 0.8);
  const target = new THREE.Box3().setFromObject(standIn);
  const box = new THREE.Box3().setFromObject(model);
  const s = (target.max.y - target.min.y) / Math.max(box.max.y - box.min.y, 1e-4);
  model.scale.multiplyScalar(s);
  box.setFromObject(model);
  model.position.y -= box.min.y;
  model.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).frustumCulled = false;
  });
  standIn.clear();
  standIn.add(model);
}

// ---------------------------------------------------------------- astronaut

export function createAstronaut(envMap: THREE.Texture | null): THREE.Group {
  const g = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: 0x6c7488, roughness: 0.42, metalness: 0.1, envMap, envMapIntensity: 1.4 });
  const suitDark = new THREE.MeshStandardMaterial({ color: 0x6e7380, roughness: 0.55, metalness: 0.2, envMap });
  const visor = new THREE.MeshPhysicalMaterial({
    color: 0x05060a,
    roughness: 0.06,
    metalness: 0.9,
    clearcoat: 1,
    envMap,
    envMapIntensity: 1.6,
  });
  const led = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.25, 0.15) });

  // The figure sits facing +X (to the right of the frame), slightly away from the camera.
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.3, 8, 24), suit);
  torso.scale.set(1.0, 1.0, 0.88);
  torso.position.set(0, 0.62, 0);
  torso.rotation.z = -0.12;
  g.add(torso);


  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.032, 12, 32), suitDark);
  ring.rotation.x = Math.PI / 2;
  ring.rotation.y = -0.15;
  ring.position.set(0.03, 0.88, 0);
  g.add(ring);
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.15 - i * 0.004, 0.012, 8, 32), suitDark);
    r.rotation.x = Math.PI / 2;
    r.position.set(0.03, 0.835 + i * 0.022, 0);
    g.add(r);
  }

  const shell = new THREE.MeshPhysicalMaterial({ color: 0x5c6274, roughness: 0.28, metalness: 0.15, clearcoat: 0.8, envMap, envMapIntensity: 1.6 });
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.17, 48, 32), shell);
  helmet.position.set(0.04, 1.02, 0);
  g.add(helmet);
  // Visor: the front cap of a slightly bigger sphere, facing +X.
  const vis = new THREE.Mesh(new THREE.SphereGeometry(0.173, 48, 32, -0.95, 1.9, 0.62, 1.25), visor);
  vis.rotation.y = Math.PI - 0.2;
  vis.position.copy(helmet.position);
  g.add(vis);

  // Arms: the near (left) arm hangs, the far arm rests forward.
  const armGeo = new THREE.CapsuleGeometry(0.075, 0.26, 6, 16);
  const shoulderL = new THREE.Group();
  shoulderL.position.set(0.05, 0.78, 0.2);
  const upperL = new THREE.Mesh(armGeo, suit);
  upperL.position.y = -0.15;
  shoulderL.add(upperL);
  for (let i = 0; i < 4; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.083, 0.012, 8, 24), suitDark);
    rib.rotation.x = Math.PI / 2;
    rib.position.y = -0.04 - i * 0.045;
    shoulderL.add(rib);
  }
  shoulderL.rotation.z = 0.35;
  shoulderL.rotation.x = -0.15;
  g.add(shoulderL);

  const shoulderR = shoulderL.clone();
  shoulderR.position.z = -0.2;
  shoulderR.rotation.x = 0.15;
  g.add(shoulderR);

  const lowerL = new THREE.Mesh(armGeo, suit);
  lowerL.position.set(0.22, 0.5, 0.2);
  lowerL.rotation.z = 1.2;
  g.add(lowerL);

  // Hips and legs, mostly hidden by the flowers.
  const hips = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.12, 6, 16), suit);
  hips.position.set(0.04, 0.32, 0);
  hips.rotation.x = Math.PI / 2;
  g.add(hips);
  for (const z of [-0.1, 0.1]) {
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.32, 6, 16), suit);
    thigh.position.set(0.26, 0.3, z);
    thigh.rotation.z = Math.PI / 2 - 0.25;
    g.add(thigh);
  }

  // Red status light on the chest, on the side that faces the camera.
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 8), led);
  light.position.set(-0.06, 0.74, 0.19);
  g.add(light);

  return g;
}

// ---------------------------------------------------------------- house

function gableRoof(width: number, depth: number, rise: number, overhang: number, mat: THREE.Material) {
  // Ridge along Z. Two slabs meeting at the top.
  const g = new THREE.Group();
  const half = width / 2 + overhang;
  const slope = Math.hypot(half, rise);
  const ang = Math.atan2(rise, half);
  for (const side of [-1, 1]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(slope, 0.12, depth + overhang * 2), mat);
    slab.position.set((side * half) / 2, rise / 2, 0);
    slab.rotation.z = -side * ang;
    g.add(slab);
  }
  return g;
}

function gableWall(width: number, rise: number, mat: THREE.Material) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0);
  s.lineTo(width / 2, 0);
  s.lineTo(0, rise);
  s.closePath();
  return new THREE.Mesh(new THREE.ShapeGeometry(s), mat);
}

function windowPane(w: number, h: number, glow: THREE.Material, frame: THREE.Material) {
  const g = new THREE.Group();
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glow);
  g.add(pane);
  const t = 0.05;
  const bars: [number, number, number, number][] = [
    [0, h / 2, w + t, t],
    [0, -h / 2, w + t, t],
    [-w / 2, 0, t, h],
    [w / 2, 0, t, h],
    [0, 0, t * 0.6, h],
    [0, 0, w, t * 0.6],
  ];
  for (const [x, y, bw, bh] of bars) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), frame);
    b.position.set(x, y, 0.01);
    g.add(b);
  }
  return g;
}

export function createHouse(): THREE.Group {
  const house = new THREE.Group();
  const wall = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.92 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x5c5650, roughness: 0.8 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x1c140e, roughness: 0.9 });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.95, 0.3) });
  const glowDim = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.55, 0.16) });

  // Main block, front gable facing the camera (+Z).
  const A = { w: 6.2, d: 8, h: 4.4, rise: 2.7, x: 2.2 };
  const blockA = new THREE.Mesh(new THREE.BoxGeometry(A.w, A.h, A.d), wall);
  blockA.position.set(A.x, A.h / 2, 0);
  house.add(blockA);
  const gA = gableWall(A.w, A.rise, wall);
  gA.position.set(A.x, A.h, A.d / 2);
  house.add(gA);
  const gA2 = gA.clone();
  gA2.position.z = -A.d / 2;
  gA2.rotation.y = Math.PI;
  house.add(gA2);
  const roofA = gableRoof(A.w, A.d, A.rise, 0.35, roof);
  roofA.position.set(A.x, A.h, 0);
  house.add(roofA);

  // Left wing, ridge along X, lower, with two dormers.
  const B = { w: 6.5, d: 6, h: 3.7, rise: 2.2, x: -3.9, z: 0.6 };
  const blockB = new THREE.Mesh(new THREE.BoxGeometry(B.w, B.h, B.d), wall);
  blockB.position.set(B.x, B.h / 2, B.z);
  house.add(blockB);
  const roofB = gableRoof(B.d, B.w, B.rise, 0.3, roof);
  roofB.rotation.y = Math.PI / 2;
  roofB.position.set(B.x, B.h, B.z);
  house.add(roofB);
  const gB = gableWall(B.d, B.rise, wall);
  gB.rotation.y = -Math.PI / 2;
  gB.position.set(B.x - B.w / 2, B.h, B.z);
  house.add(gB);
  for (const dx of [-1.6, 0.9]) {
    const dormer = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 1.6), wall);
    body.position.y = 0.55;
    dormer.add(body);
    const dg = gableWall(1.3, 0.7, wall);
    dg.position.set(0, 1.1, 0.8);
    dormer.add(dg);
    const dr = gableRoof(1.3, 1.6, 0.7, 0.12, roof);
    dr.position.y = 1.1;
    dormer.add(dr);
    const win = windowPane(0.55, 0.7, glow, trim);
    win.position.set(0, 0.55, 0.81);
    dormer.add(win);
    dormer.position.set(B.x + dx, B.h + 0.15, B.z + 1.4);
    house.add(dormer);
  }

  // Chimney.
  const chim = new THREE.Mesh(new THREE.BoxGeometry(0.55, 2.4, 0.55), new THREE.MeshStandardMaterial({ color: 0x4a2a1e, roughness: 0.9 }));
  chim.position.set(B.x + 2.2, B.h + 1.5, B.z - 0.6);
  house.add(chim);

  // Front porch along the wing, and a side porch on the right of the main block.
  const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(B.w + 0.4, 0.1, 2.2), roof);
  porchRoof.position.set(B.x, 2.75, B.z + B.d / 2 + 1.0);
  porchRoof.rotation.x = 0.18;
  house.add(porchRoof);
  const sideRoof = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 6.5), roof);
  sideRoof.position.set(A.x + A.w / 2 + 1.25, 2.85, 0.3);
  sideRoof.rotation.z = -0.22;
  house.add(sideRoof);
  const postGeo = new THREE.BoxGeometry(0.14, 2.7, 0.14);
  for (const x of [-6.9, -4.9, -2.9, -1.0]) {
    const post = new THREE.Mesh(postGeo, trim);
    post.position.set(x, 1.35, B.z + B.d / 2 + 2.0);
    house.add(post);
  }
  for (const z of [3.3, 0.3, -2.7]) {
    const post = new THREE.Mesh(postGeo, trim);
    post.position.set(A.x + A.w / 2 + 2.4, 1.35, z);
    house.add(post);
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(B.w + 0.4, 0.35, 2.2), trim);
  deck.position.set(B.x, 0.17, B.z + B.d / 2 + 1.0);
  house.add(deck);

  // Windows (front faces +Z).
  const fz = B.z + B.d / 2 + 0.02;
  for (const [x, y, w, h, bright] of [
    [-6.0, 1.7, 0.9, 1.3, 1],
    [-4.6, 1.7, 0.9, 1.3, 1],
    [-2.0, 1.7, 0.9, 1.3, 0],
  ] as const) {
    const win = windowPane(w, h, bright ? glow : glowDim, trim);
    win.position.set(x, y, fz);
    house.add(win);
  }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 2.1), glow);
  door.position.set(-3.3, 1.05, fz);
  house.add(door);
  const az = A.d / 2 + 0.02;
  for (const [x, y] of [
    [A.x - 1.6, 1.7],
    [A.x + 1.6, 1.7],
    [A.x, 5.2],
  ] as const) {
    const win = windowPane(0.9, y > 4 ? 1.0 : 1.3, glow, trim);
    win.position.set(x, y, az);
    house.add(win);
  }
  // Side windows on the right wall, under the side porch.
  for (const z of [1.6, -1.6]) {
    const win = windowPane(0.9, 1.3, glowDim, trim);
    win.rotation.y = Math.PI / 2;
    win.position.set(A.x + A.w / 2 + 0.02, 1.7, z);
    house.add(win);
  }

  // Interior light spilling out of the front and the porch.
  const spill = new THREE.PointLight(0xff9a4a, 30, 18, 2);
  spill.position.set(-2, 1.8, B.z + B.d / 2 + 2.5);
  house.add(spill);
  const spill2 = new THREE.PointLight(0xff9a4a, 15, 12, 2);
  spill2.position.set(A.x, 2, A.d / 2 + 1.5);
  house.add(spill2);

  return house;
}

// ---------------------------------------------------------------- pickup

export function createPickup(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x15100c, roughness: 0.45, metalness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.1, metalness: 0.8 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x080706, roughness: 0.95 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0x8a7a6a, roughness: 0.3, metalness: 1 });

  // Facing -X (to the left of the frame). Length along X.
  const lower = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.7, 1.9), body);
  lower.position.set(0, 0.8, 0);
  g.add(lower);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 1.85), body);
  hood.position.set(-1.65, 1.25, 0);
  g.add(hood);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.75, 1.8), body);
  cab.position.set(-0.15, 1.52, 0);
  g.add(cab);
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.6), glass);
  ws.rotation.set(0, -Math.PI / 2, 0);
  ws.rotateX(-0.5);
  ws.position.set(-0.93, 1.55, 0);
  g.add(ws);
  for (const z of [0.905, -0.905]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5), glass);
    side.position.set(-0.1, 1.6, z);
    if (z < 0) side.rotation.y = Math.PI;
    g.add(side);
  }
  // Bed walls.
  for (const z of [0.9, -0.9]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.42, 0.08), body);
    wall.position.set(1.5, 1.35, z);
    g.add(wall);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 1.88), body);
  tail.position.set(2.48, 1.35, 0);
  g.add(tail);
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 1.95), chrome);
  bumper.position.set(-2.55, 0.6, 0);
  g.add(bumper);

  const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 24);
  wheelGeo.rotateX(Math.PI / 2);
  for (const x of [-1.65, 1.6]) {
    for (const z of [0.85, -0.85]) {
      const w = new THREE.Mesh(wheelGeo, tire);
      w.position.set(x, 0.4, z);
      g.add(w);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 16).rotateX(Math.PI / 2), chrome);
      hub.position.set(x, 0.4, z + Math.sign(z) * 0.16);
      g.add(hub);
    }
  }
  return g;
}

/** Simple gradient environment for reflections, made from the scene's sky colors. */
export function createGradientEnv(
  renderer: THREE.WebGLRenderer,
  top: THREE.Color,
  horizon: THREE.Color,
  ground: THREE.Color,
  band: THREE.Color,
  bandDir: THREE.Vector3,
): THREE.Texture {
  const scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      uTop: { value: top },
      uHorizon: { value: horizon },
      uGround: { value: ground },
      uBand: { value: band },
      uBandDir: { value: bandDir.clone().setY(0).normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 uTop, uHorizon, uGround, uBand, uBandDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 c = d.y > 0.0 ? mix(uHorizon, uTop, pow(d.y, 0.5)) : mix(uHorizon, uGround, pow(-d.y, 0.3));
        float az = max(dot(normalize(vec3(d.x, 0.0, d.z)), uBandDir), 0.0);
        c += uBand * exp(-abs(d.y) * 25.0) * (0.3 + 0.7 * pow(az, 2.0));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0);
  pmrem.dispose();
  mat.dispose();
  return rt.texture;
}

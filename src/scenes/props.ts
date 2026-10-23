import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Small procedural props for the extra scenes. Shapes are merged per material so each
// prop is a handful of draw calls.

function merged(parts: THREE.BufferGeometry[], material: THREE.Material) {
  const geo = mergeGeometries(parts.map((g) => g.toNonIndexed()));
  return new THREE.Mesh(geo, material);
}

function boxAt(w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

// ---------------------------------------------------------------- pier

/** A wooden pier from the camera toward -Z, with a lantern post at its end. */
export function createPier(length: number, seed = 1): { group: THREE.Group; lanternPos: THREE.Vector3 } {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.9 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x1c140e, roughness: 0.95 });
  const planks: THREE.BufferGeometry[] = [];
  const posts: THREE.BufferGeometry[] = [];
  const W = 2.4;
  const deckY = 1.0;
  for (let z = 0; z > -length; z -= 0.28) {
    const g = boxAt(W + (rand() - 0.5) * 0.15, 0.06, 0.24, (rand() - 0.5) * 0.05, deckY + (rand() - 0.5) * 0.02, z, (rand() - 0.5) * 0.03);
    planks.push(g);
  }
  for (let z = 0; z > -length; z -= 3) {
    for (const x of [-W / 2 + 0.1, W / 2 - 0.1]) {
      posts.push(boxAt(0.18, 3.0, 0.18, x, deckY - 1.4, z));
      posts.push(boxAt(0.12, 0.9, 0.12, x, deckY + 0.45, z)); // rail posts
    }
    posts.push(boxAt(W, 0.12, 0.16, 0, deckY - 0.12, z)); // cross beam
  }
  for (const x of [-W / 2 + 0.1, W / 2 - 0.1]) posts.push(boxAt(0.08, 0.08, length, x, deckY + 0.88, -length / 2)); // rails
  group.add(merged(planks, wood), merged(posts, darkWood));

  // Lantern post at the end.
  const z = -length + 0.5;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.6, 8), darkWood);
  post.position.set(W / 2 - 0.25, deckY + 1.3, z);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 4.5, 1.8) }));
  const lanternPos = new THREE.Vector3(W / 2 - 0.25, deckY + 2.55, z);
  lamp.position.copy(lanternPos);
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.34, 6, 1, true), new THREE.MeshStandardMaterial({ color: 0x111111, wireframe: true }));
  cage.position.copy(lanternPos);
  const glow = new THREE.PointLight(0xffa860, 6, 14, 2);
  glow.position.copy(lanternPos);
  group.add(post, lamp, cage, glow);
  // A coiled rope and a small bollard for scale.
  const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.4, 10), darkWood);
  bollard.position.set(-W / 2 + 0.35, deckY + 0.2, z + 1.2);
  group.add(bollard);
  return { group, lanternPos };
}

// ---------------------------------------------------------------- Joshua tree

/** A branching Joshua tree silhouette with spiky leaf clusters. */
export function createJoshuaTree(seed = 7): THREE.Group {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const bark = new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 1 });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x2c3420, roughness: 0.9, side: THREE.DoubleSide });
  const wood: THREE.BufferGeometry[] = [];
  const leaves: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const grow = (from: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number) => {
    const to = from.clone().addScaledVector(dir, len);
    const g = new THREE.CylinderGeometry(r * 0.8, r, len, 7);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
    g.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    wood.push(g);
    if (depth === 0 || len < 0.4) {
      // Spiky ball: thin cones in all directions.
      for (let i = 0; i < 26; i++) {
        const d = new THREE.Vector3(rand() - 0.5, rand() * 0.9 - 0.2, rand() - 0.5).normalize();
        const c = new THREE.ConeGeometry(0.035, 0.55, 3);
        c.translate(0, 0.27, 0);
        c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, d));
        c.translate(to.x, to.y, to.z);
        leaves.push(c);
      }
      return;
    }
    const n = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const nd = new THREE.Vector3(Math.cos(a) * 0.8, 0.6 + rand() * 0.5, Math.sin(a) * 0.8).add(dir.clone().multiplyScalar(0.4)).normalize();
      grow(to, nd, len * (0.55 + rand() * 0.25), r * 0.7, depth - 1);
    }
  };
  grow(new THREE.Vector3(), up.clone(), 2.6, 0.22, 3);
  const group = new THREE.Group();
  group.add(merged(wood, bark), merged(leaves, leaf));
  return group;
}

// ---------------------------------------------------------------- cabin + pines

/** A-frame cabin with a glowing gable window, facing +Z. */
export function createCabin(): THREE.Group {
  const g = new THREE.Group();
  const roof = new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.85 });
  const snow = new THREE.MeshStandardMaterial({ color: 0xdfe8f2, roughness: 0.7 });
  const wall = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.9 });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.25, 0.45), side: THREE.DoubleSide });
  const W = 7;
  const H = 6.5;
  const D = 8;
  const slope = Math.hypot(W / 2, H);
  const ang = Math.atan2(H, W / 2);
  for (const side of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(slope, 0.25, D), roof);
    r.position.set((side * W) / 4, H / 2, 0);
    r.rotation.z = -side * ang;
    g.add(r);
    const sn = new THREE.Mesh(new THREE.BoxGeometry(slope * 0.92, 0.12, D + 0.2), snow);
    sn.position.set((side * W) / 4 + side * 0.08, H / 2 + 0.12, 0);
    sn.rotation.z = -side * ang;
    g.add(sn);
  }
  const tri = new THREE.Shape();
  tri.moveTo(-W / 2 + 0.3, 0);
  tri.lineTo(W / 2 - 0.3, 0);
  tri.lineTo(0, H - 0.4);
  tri.closePath();
  const front = new THREE.Mesh(new THREE.ShapeGeometry(tri), wall);
  front.position.z = D / 2 - 0.4;
  g.add(front);
  const win = new THREE.Shape();
  win.moveTo(-1.6, 0.4);
  win.lineTo(1.6, 0.4);
  win.lineTo(0, 4.6);
  win.closePath();
  const w = new THREE.Mesh(new THREE.ShapeGeometry(win), glow);
  w.position.z = D / 2 - 0.35;
  g.add(w);
  // Mullions over the window.
  const trim = new THREE.MeshStandardMaterial({ color: 0x140c08 });
  for (const [x, y, bw, bh] of [
    [0, 1.7, 3.0, 0.08],
    [0, 3.0, 1.6, 0.08],
    [0, 2.4, 0.08, 4.2],
  ] as const) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), trim);
    b.position.set(x, y, D / 2 - 0.3);
    g.add(b);
  }
  const spill = new THREE.PointLight(0xff9a50, 40, 30, 2);
  spill.position.set(0, 2, D / 2 + 2);
  g.add(spill);
  return g;
}

/** Instanced snowy pines scattered in a ring sector: jagged, drooping branch tiers with patchy snow. */
export function createPines(count: number, rMin: number, rMax: number, aMin: number, aMax: number, seed = 5): THREE.Group {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const needles = new THREE.MeshStandardMaterial({ color: 0x0b1714, roughness: 0.95 });
  const snow = new THREE.MeshStandardMaterial({ color: 0xc8d4e2, roughness: 0.8 });
  // A tier: a cone whose bottom rim is jagged (branch tips) and drooping.
  const tier = (r: number, h: number, y: number, snowy: boolean) => {
    const g = new THREE.ConeGeometry(r, h, 18, 3, true);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vy = pos.getY(i);
      const t = (h / 2 - vy) / h; // 0 at the tip, 1 at the rim
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      const k = 1 + (t > 0.6 ? (Math.sin(a * 9 + y * 3) * 0.5 + 0.5) * 0.28 * t : 0) + (rand() - 0.5) * 0.08 * t;
      pos.setX(i, pos.getX(i) * k);
      pos.setZ(i, pos.getZ(i) * k);
      pos.setY(i, vy - t * t * 0.25 * r + (snowy ? 0.06 : 0));
    }
    g.rotateY(rand() * Math.PI);
    g.translate(0, y, 0);
    g.computeVertexNormals();
    return g;
  };
  const tiers: THREE.BufferGeometry[] = [];
  const caps: THREE.BufferGeometry[] = [];
  const N = 7;
  for (let i = 0; i < N; i++) {
    const r = 1.9 * (1 - i / N) + 0.2;
    const y = 1.3 + i * 1.05;
    tiers.push(tier(r, 1.9, y, false));
    if (i % 2 === 0 || i === N - 1) caps.push(tier(r * 0.8, 1.2, y + 0.42, true));
  }
  const trunk = new THREE.CylinderGeometry(0.12, 0.22, 1.6, 8);
  trunk.translate(0, 0.8, 0);
  tiers.push(trunk);
  const tree = mergeGeometries(tiers.map((g) => g.toNonIndexed()));
  const cap = mergeGeometries(caps.map((g) => g.toNonIndexed()));
  const a = new THREE.InstancedMesh(tree, needles, count);
  const b = new THREE.InstancedMesh(cap, snow, count);
  needles.side = THREE.DoubleSide;
  snow.side = THREE.DoubleSide;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < count; i++) {
    const r = rMin + rand() * (rMax - rMin);
    const ang = THREE.MathUtils.degToRad(aMin + rand() * (aMax - aMin));
    const sc = 0.7 + rand() * 0.8;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
    m.compose(new THREE.Vector3(Math.sin(ang) * r, 0, -Math.cos(ang) * r), q, new THREE.Vector3(sc, sc * (0.9 + rand() * 0.4), sc));
    a.setMatrixAt(i, m);
    b.setMatrixAt(i, m);
  }
  const g = new THREE.Group();
  g.add(a, b);
  return g;
}

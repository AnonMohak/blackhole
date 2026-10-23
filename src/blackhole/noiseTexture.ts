import * as THREE from 'three';

// Tileable fBm value noise, two independent channels (R, G).
// Sampled by the sky shader in polar disk coordinates and by the ground shaders.

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fbmChannel(size: number, seed: number, basePeriod: number, octaves: number): Float32Array {
  const rand = mulberry32(seed);
  const out = new Float32Array(size * size);
  let amp = 1;
  for (let o = 0; o < octaves; o++) {
    const period = basePeriod << o;
    const grid = new Float32Array(period * period);
    for (let i = 0; i < grid.length; i++) grid[i] = rand();
    for (let y = 0; y < size; y++) {
      const gy = (y / size) * period;
      const y0 = Math.floor(gy);
      const fy = gy - y0;
      const sy = fy * fy * (3 - 2 * fy);
      const r0 = (y0 % period) * period;
      const r1 = ((y0 + 1) % period) * period;
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * period;
        const x0 = Math.floor(gx);
        const fx = gx - x0;
        const sx = fx * fx * (3 - 2 * fx);
        const c0 = x0 % period;
        const c1 = (x0 + 1) % period;
        const a = grid[r0 + c0] + (grid[r0 + c1] - grid[r0 + c0]) * sx;
        const b = grid[r1 + c0] + (grid[r1 + c1] - grid[r1 + c0]) * sx;
        out[y * size + x] += (a + (b - a) * sy) * amp;
      }
    }
    amp *= 0.5;
  }
  let min = Infinity;
  let max = -Infinity;
  for (const v of out) {
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - min) / (max - min);
  return out;
}

let cached: THREE.DataTexture | null = null;

export function getNoiseTexture(): THREE.DataTexture {
  if (cached) return cached;
  const size = 512;
  const r = fbmChannel(size, 1337, 4, 7);
  const g = fbmChannel(size, 4242, 8, 6);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = r[i] * 255;
    data[i * 4 + 1] = g[i] * 255;
    data[i * 4 + 2] = 0;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  cached = tex;
  return tex;
}

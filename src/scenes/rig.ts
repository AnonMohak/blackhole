import * as THREE from 'three';

// Fixed "wallpaper" camera framed like the reference image, with slow pointer
// parallax and a slight idle drift.

export const REF_ASPECT = 1311 / 736;

export interface RigParams {
  x: number;
  y: number;
  z: number;
  yaw: number; // degrees
  pitch: number; // degrees
  fov: number; // vertical FOV at the reference aspect (degrees)
  parallax: number; // max pointer rotation (degrees)
  drift: number; // idle drift amplitude (degrees)
}

export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(30, REF_ASPECT, 0.05, 8000);
  private pointer = new THREE.Vector2();
  private smooth = new THREE.Vector2();

  constructor(public params: RigParams) {
    this.camera.rotation.order = 'YXZ';
    this.apply(0);
  }

  setPointer(x: number, y: number) {
    this.pointer.set(x, y);
  }

  setAspect(aspect: number) {
    const p = this.params;
    this.camera.aspect = aspect;
    // Wider than the reference: keep vertical FOV. Narrower: keep horizontal FOV.
    if (aspect >= REF_ASPECT) this.camera.fov = p.fov;
    else {
      const t = Math.tan(THREE.MathUtils.degToRad(p.fov) / 2) * (REF_ASPECT / aspect);
      this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(t));
    }
    this.camera.updateProjectionMatrix();
  }

  update(dt: number, time: number) {
    const k = 1 - Math.exp(-dt * 1.8);
    this.smooth.lerp(this.pointer, k);
    this.apply(time);
  }

  private apply(time: number) {
    const p = this.params;
    const d2r = THREE.MathUtils.degToRad;
    const dy = this.smooth.x * p.parallax + Math.sin(time * 0.07) * p.drift;
    const dp = this.smooth.y * p.parallax * 0.5 + Math.sin(time * 0.05 + 1.3) * p.drift * 0.5;
    this.camera.position.set(p.x, p.y, p.z);
    this.camera.rotation.set(d2r(p.pitch + dp), d2r(p.yaw - dy), 0);
    this.camera.updateMatrixWorld();
  }

  /** World direction of a point in the reference image (u, v from the top left), without parallax. */
  dirFromRef(u: number, v: number, out = new THREE.Vector3()): THREE.Vector3 {
    const p = this.params;
    const t = Math.tan(THREE.MathUtils.degToRad(p.fov) / 2);
    out.set((u * 2 - 1) * t * REF_ASPECT, (1 - 2 * v) * t, -1).normalize();
    const e = new THREE.Euler(THREE.MathUtils.degToRad(p.pitch), THREE.MathUtils.degToRad(p.yaw), 0, 'YXZ');
    return out.applyEuler(e);
  }
}

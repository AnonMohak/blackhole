import { ZERO_OFFSET, type CamOffset } from '../scenes/rig';
import type { Shot } from '../scenes/types';

// Plays a scene's cinematic shots in a loop, with a short dip to black at each cut.
// When switched off, the camera eases back to the base framing.

const KEYS = Object.keys(ZERO_OFFSET) as (keyof CamOffset)[];
const CUT = 0.6; // seconds of fade on each side of a cut

const ease = (t: number) => t * t * (3 - 2 * t);

export class Director {
  enabled = true;
  private index = 0;
  private t = 0;
  private current: CamOffset = { ...ZERO_OFFSET };
  private intro = 1; // fade in from black on load

  constructor(private fade: HTMLElement) {}

  reset() {
    this.index = 0;
    this.t = 0;
  }

  /** Jump to a shot and time (debug and screenshots). */
  seek(index: number, t: number) {
    this.index = index;
    this.t = t;
    this.intro = 0;
  }

  update(dt: number, shots: Shot[], out: CamOffset) {
    let target: CamOffset = ZERO_OFFSET;
    let black = 0;
    if (this.enabled && shots.length) {
      const shot = shots[this.index % shots.length];
      this.t += dt;
      if (this.t >= shot.d) {
        this.t = 0;
        this.index = (this.index + 1) % shots.length;
      }
      const s = shots[this.index % shots.length];
      const k = ease(Math.min(this.t / s.d, 1));
      target = { ...ZERO_OFFSET };
      for (const key of KEYS) target[key] = (s.from[key] ?? 0) + ((s.to[key] ?? 0) - (s.from[key] ?? 0)) * k;
      if (shots.length > 1) black = Math.max(1 - this.t / CUT, 1 - (s.d - this.t) / CUT, 0);
      // During a shot the camera follows the path exactly; jumps happen under the fade.
      Object.assign(this.current, target);
    } else {
      const k = 1 - Math.exp(-dt * 1.5);
      for (const key of KEYS) this.current[key] += (target[key] - this.current[key]) * k;
    }
    Object.assign(out, this.current);
    this.intro = Math.max(0, this.intro - dt / 1.4);
    this.fade.style.opacity = String(Math.max(Math.min(black, 1) * 0.92, this.intro));
  }
}

import type GUI from 'lil-gui';
import type { SceneBase } from './base';
import type { CamOffset } from './rig';

/** One cinematic camera move: offsets from the base framing, eased from `from` to `to`. */
export interface Shot {
  d: number; // seconds
  from: Partial<CamOffset>;
  to: Partial<CamOffset>;
}

export interface BlackholeScene {
  id: string;
  label: string;
  base: SceneBase;
  params: object; // the live preset, edited by the dev GUI
  shots: Shot[];
  update(dt: number, time: number): void;
  buildGui(gui: GUI): void;
}

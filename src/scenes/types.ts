import type GUI from 'lil-gui';
import type { SceneBase } from './base';

export interface BlackholeScene {
  id: string;
  label: string;
  base: SceneBase;
  params: object; // the live preset, edited by the dev GUI
  update(dt: number, time: number): void;
  buildGui(gui: GUI): void;
}

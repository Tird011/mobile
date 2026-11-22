import type { Snapshot } from '../../engine/types';
import * as THREE from 'three';
import { loadModel } from '../assets';
import { Character } from '../Character';
import { toonify } from '../toon';
import { Room } from './Room';

/** Menu: the lomi house exterior with Mang Kaloy waving in front. */
export class TitleRoom extends Room {
  private kaloy!: Character;
  private neon?: THREE.Object3D;
  constructor() { super(0xbfe6f7); }
  async build() {
    await this.env('lomi_house', /^(Ground|Path|Platform)/);
    this.kaloy = await Character.create('mang_kaloy');
    this.kaloy.place(0.6, 0, 3.0, 0.2);
    this.scene.add(this.kaloy.root);
    this.neon = (await loadModel('neon')).scene.clone(true);
    toonify(this.neon, { outline: 0.01 });
    this.neon.position.set(0, 4.35, 1.95);
    this.neon.visible = false;
    this.scene.add(this.neon);
    this.ready = true;
  }
  update(s: Snapshot | null, dt: number, t: number) {
    if (this.neon) { this.neon.visible = (s?.perks?.sign ?? 0) > 0; this.neon.scale.setScalar(1 + Math.sin(t * 4) * 0.02); }
    const a = Math.sin(t * 0.25) * 0.35;
    const r = this.portrait ? 14 : 10.5;
    this.camera.position.set(Math.sin(a) * r, this.portrait ? 3.0 : 3.4, Math.cos(a) * r);
    this.camera.lookAt(0, this.portrait ? 3.6 : 1.7, 0);
    if (Math.floor(t) % 6 === 0 && this.kaloy.pose === 'idle') this.kaloy.setPose('wave');
    this.kaloy.update(dt, t);
  }
}

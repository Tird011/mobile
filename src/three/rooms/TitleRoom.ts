import type { Snapshot } from '../../engine/types';
import { Character } from '../Character';
import { Room } from './Room';

/** Menu: the lomi house exterior with Mang Kaloy waving in front. */
export class TitleRoom extends Room {
  private kaloy!: Character;
  constructor() { super(0xbfe6f7); }
  async build() {
    await this.env('lomi_house', /^(Ground|Path|Platform)/);
    this.kaloy = await Character.create('mang_kaloy');
    this.kaloy.place(0.6, 0, 3.0, 0.2);
    this.scene.add(this.kaloy.root);
    this.ready = true;
  }
  update(_s: Snapshot | null, dt: number, t: number) {
    const a = Math.sin(t * 0.25) * 0.35;
    const r = this.portrait ? 14 : 10.5;
    this.camera.position.set(Math.sin(a) * r, this.portrait ? 3.0 : 3.4, Math.cos(a) * r);
    this.camera.lookAt(0, this.portrait ? 3.6 : 1.7, 0);
    if (Math.floor(t) % 6 === 0 && this.kaloy.pose === 'idle') this.kaloy.setPose('wave');
    this.kaloy.update(dt, t);
  }
}

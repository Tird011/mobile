import type * as THREE from 'three';
import type { Snapshot } from '../../engine/types';
import { Character } from '../Character';
import { Room } from './Room';

/** Back of the shop: the delivery scooter and the palengke stall. */
export class HubRoom extends Room {
  private kaloy!: Character;
  private box?: THREE.Object3D;
  constructor() { super(0xffd6d8); }
  async build() {
    const env = await this.env('hub', /^(Ground|Wall)/);
    this.box = env.getObjectByName('Scooter') ?? undefined;
    this.kaloy = await Character.create('mang_kaloy');
    this.kaloy.place(-0.4, 0, 1.2, 0.3);
    this.scene.add(this.kaloy.root);
    this.setCameras([[0.4, 2.9, 6.6], [0.2, 0.9, -0.6]], [[0.2, 4.6, 9.0], [0.0, -0.6, -0.6]]);
    this.ready = true;
  }
  update(s: Snapshot, dt: number, t: number) {
    const ready = s.orders.some((o) => o.delivery && o.status === 'READY');
    this.kaloy.walkTo(ready ? -1.0 : 0.9, 0, ready ? 1.0 : 0.6, ready ? -0.6 : 0.4);
    if (this.box) this.box.position.y = ready ? Math.abs(Math.sin(t * 4)) * 0.04 : 0;
    this.kaloy.setEmote(s.kaloy.atlasCol, s.kaloy.atlasRow);
    this.kaloy.update(dt, t);
  }
}

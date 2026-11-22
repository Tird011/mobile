import * as THREE from 'three';
import type { Snapshot } from '../../engine/types';
import { Character } from '../Character';
import { StaffCrew } from './Crowd';
import { Room } from './Room';

const SCOOTER = new THREE.Vector3(-1.8, 0.8, 0.3);

/** Back of the shop: the delivery scooter, the palengke stall and (once hired) Mang Tonyo. */
export class HubRoom extends Room {
  private kaloy!: Character;
  private crew!: StaffCrew;
  private scooter?: THREE.Object3D;
  constructor() { super(); }
  async build() {
    const env = await this.env('hub', /^(Ground|Wall)/);
    this.scooter = env.getObjectByName('Scooter') ?? undefined;
    this.kaloy = await Character.create('mang_kaloy');
    this.kaloy.place(-0.4, 0, 1.2, 0.3);
    this.scene.add(this.kaloy.root);
    this.crew = new StaffCrew(this.scene, (c) => c.place(-2.6, 0, 1.2, 0.6));
    this.setCameras([[0.4, 2.9, 6.6], [0.2, 0.9, -0.6]], [[0.2, 4.6, 9.0], [0.0, -0.6, -0.6]]);
    this.rig = { azimuth: -35, center: [0, 0, 0], extent: 9, lamps: [[2, 2.6, -1.0], [0.6, 2.6, 3.6]], fog: [45, 260] };
    await this.world('hub', new THREE.Box3(new THREE.Vector3(-6, 0.3, -3), new THREE.Vector3(6, 3, 5)), true);
    this.ready = true;
  }
  update(s: Snapshot, dt: number, t: number) {
    const ready = s.orders.some((o) => o.delivery && o.status === 'READY');
    this.kaloy.walkTo(ready ? -1.0 : 0.9, 0, ready ? 1.0 : 0.6, ready ? -0.6 : 0.4);
    const rider = s.staff.find((w) => w.role === 'RIDER' && w.hired && !w.resting);
    this.crew.sync(rider && !rider.out ? [rider] : []);
    if (this.scooter) {
      this.scooter.visible = !(rider?.out);          // Mang Tonyo took it out
      this.scooter.position.y = ready ? Math.abs(Math.sin(t * 4)) * 0.04 : 0;
    }
    if (ready && !this.holdingFocus) this.focus(SCOOTER, 2.6, 1.4, 1.0); else if (!this.holdingFocus) this.wide();
    this.crew.update(dt, t);
    this.kaloy.setEmote(s.kaloy.atlasCol, s.kaloy.atlasRow);
    this.kaloy.update(dt, t);
    this.updateCamera(dt, t);
  }
}

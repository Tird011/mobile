import * as THREE from 'three';
import type { GameEvent, Snapshot } from '../../engine/types';
import { Character } from '../Character';
import { Crowd } from './Crowd';
import { Room } from './Room';

const DOOR = new THREE.Vector3(0, 0, -4.0);
const EXIT = new THREE.Vector3(-3.6, 0, 0.2);
const slot = (i: number) => new THREE.Vector3(-0.2 + (i % 2) * 0.12, 0, 1.55 - i * 0.95);

/** The hub: queue in front of the counter, Mang Kaloy behind it, ready plates on the counter top. */
export class CounterRoom extends Room {
  private kaloy!: Character;
  private crowd!: Crowd;
  private plates = new Map<string, THREE.Object3D>();
  constructor() { super(0xffd6d8); }

  async build() {
    await this.env('counter');
    this.kaloy = await Character.create('mang_kaloy');
    this.kaloy.place(0.2, 0, 3.35, Math.PI - 0.5);
    this.scene.add(this.kaloy.root);
    this.crowd = new Crowd(this.scene, (c) => { c.place(DOOR.x, 0, DOOR.z, 0); });
    this.setCameras([[4.2, 3.4, 5.6], [-0.4, 0.9, 0.2]], [[2.6, 6.2, 8.6], [-0.4, -0.4, 0.3]]);
    this.ready = true;
  }

  update(s: Snapshot, dt: number, t: number) {
    const visible = s.customers.filter((c) => !c.remote && (c.action === 'ARRIVING' || c.action === 'IN_LINE' || c.action === 'WAITING_FOR_FOOD'));
    this.crowd.sync(visible);
    let i = 0;
    for (const v of visible) {
      const c = this.crowd.get(v.id);
      if (!c) { if (v.action !== 'WAITING_FOR_FOOD') i++; continue; }
      if (v.action === 'WAITING_FOR_FOOD') {
        c.walkTo(EXIT.x, 0, EXIT.z);           // heads to their table in the diner
        c.showBubble(false);
      } else {
        const p = slot(i++);
        c.walkTo(p.x, 0, p.z, 0.25);
        c.showBubble(true);
        c.setMood(v.emotion, v.patience, true);
      }
    }
    this.crowd.update(dt, t);
    this.syncPlates(s);
    this.kaloy.setEmote(s.kaloy.atlasCol, s.kaloy.atlasRow);
    this.kaloy.update(dt, t);
  }

  private syncPlates(s: Snapshot) {
    const ready = s.orders.filter((o) => o.status === 'READY' && !o.delivery);
    const ids = new Set(ready.map((o) => o.id));
    ready.forEach((o, k) => {
      if (this.plates.has(o.id)) { this.plates.get(o.id)!.position.x = -1.6 + k * 0.9; return; }
      this.plates.set(o.id, new THREE.Group());
      this.food(o.lines[0].dish).then((f) => {
        const g = this.plates.get(o.id);
        if (f && g) { g.add(f); g.scale.setScalar(0.8); g.position.set(-1.6 + k * 0.9, 1.13, 2.6); this.scene.add(g); }
      });
    });
    for (const [id, g] of this.plates) if (!ids.has(id)) { g.removeFromParent(); this.plates.delete(id); }
  }

  onEvent(e: GameEvent) {
    if (!this.ready) return;
    if (e.type === 'CUSTOMER_ORDERED' || e.type === 'CUSTOMER_SERVED') this.kaloy.setPose('wave');
  }
}

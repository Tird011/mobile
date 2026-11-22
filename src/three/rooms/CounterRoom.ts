import * as THREE from 'three';
import type { GameEvent, Snapshot } from '../../engine/types';
import { Character } from '../Character';
import { Crowd, StaffCrew } from './Crowd';
import { Room } from './Room';

const DOOR = new THREE.Vector3(0, 0, -4.0);
const EXIT = new THREE.Vector3(-3.6, 0, 0.2);
const slot = (i: number) => new THREE.Vector3(-0.2 + (i % 2) * 0.12, 0, 1.55 - i * 0.95);
const COUNTER_TOP = new THREE.Vector3(0, 1.13, 2.6);

/** The hub: queue in front of the counter, Mang Kaloy (and Ate Joy) behind it, ready plates on the counter. */
export class CounterRoom extends Room {
  private kaloy!: Character;
  private crowd!: Crowd;
  private crew!: StaffCrew;
  private plates = new Map<string, THREE.Object3D>();
  private door?: THREE.Object3D;
  private doorOpen = 0;
  constructor() { super(0xffd6d8); }

  async build() {
    const env = await this.env('counter');
    this.door = env.getObjectByName('DoorGlass') ?? undefined;
    this.kaloy = await Character.create('mang_kaloy');
    this.kaloy.place(0.2, 0, 3.35, Math.PI - 0.5);
    this.scene.add(this.kaloy.root);
    this.crowd = new Crowd(this.scene, (c) => { c.place(DOOR.x, 0, DOOR.z, 0); this.doorOpen = 1; });
    this.crew = new StaffCrew(this.scene, (c) => {
      c.place(-1.3, 0, 3.35, Math.PI + 0.3);
      this.prop('Tray').then((p) => p && c.hold(p));
    });
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
        c.walkTo(p.x, 0, p.z, 0.25 + Math.sin(t * 0.7 + i) * 0.15);   // fidgeting in line
        c.showBubble(true);
        c.setMood(v.emotion, v.patience, true);
      }
    }
    this.crowd.update(dt, t);
    this.syncPlates(s, t);

    // Ate Joy behind the counter when she's not out serving
    const joy = s.staff.filter((w) => w.role === 'SERVER' && w.hired && !w.resting && w.where === 'COUNTER');
    this.crew.sync(joy);
    for (const w of joy) this.crew.get(w.id)?.setPose(w.activity.startsWith('Taking') ? 'wave' : 'idle');
    this.crew.update(dt, t);

    // the door swings when someone comes in
    this.doorOpen = Math.max(0, this.doorOpen - dt * 0.8);
    if (this.door) { this.door.userData.x ??= this.door.position.x; this.door.position.x = this.door.userData.x + Math.sin(Math.min(1, this.doorOpen) * Math.PI) * 1.0; }

    if (!this.holdingFocus) this.wide();
    this.kaloy.setEmote(s.kaloy.atlasCol, s.kaloy.atlasRow);
    this.kaloy.update(dt, t);
    this.updateCamera(dt, t);
  }

  private syncPlates(s: Snapshot, t: number) {
    const ready = s.orders.filter((o) => o.status === 'READY' && !o.delivery);
    const ids = new Set(ready.map((o) => o.id));
    ready.forEach((o, k) => {
      if (this.plates.has(o.id)) { const g = this.plates.get(o.id)!; g.position.x = -1.6 + k * 0.9; g.position.y = 1.13 + Math.abs(Math.sin(t * 3 + k)) * 0.02; return; }
      const g = new THREE.Group(); g.scale.setScalar(0.8); g.position.set(-1.6 + k * 0.9, 1.13, 2.6);
      this.plates.set(o.id, g); this.scene.add(g);
      this.food(o.lines[0].dish).then((f) => { if (f) g.add(f); });
    });
    for (const [id, g] of this.plates) if (!ids.has(id)) { g.removeFromParent(); this.plates.delete(id); }
  }

  onEvent(e: GameEvent) {
    if (!this.ready) return;
    if (e.type === 'CUSTOMER_ORDERED') { this.kaloy.setPose('wave'); this.focus(slot(0).setY(1.0), 2.4, 1.3, 1.2, 2.2); }
    if (e.type === 'CUSTOMER_SERVED') { this.kaloy.setPose('wave'); this.focus(COUNTER_TOP.clone(), 2.2, 1.2, 0.8, 1.8); }
    if (e.type === 'CUSTOMER_ARRIVED') this.doorOpen = 1;
  }
}

import * as THREE from 'three';
import type { GameEvent, Snapshot } from '../../engine/types';
import { Character } from '../Character';
import { Crowd } from './Crowd';
import { Room } from './Room';

// Same table layout as blender/environments.py (Blender x,y -> three x,-y)
const TABLES: Record<number, THREE.Vector3> = {
  1: new THREE.Vector3(-2.0, 0, -0.6), 2: new THREE.Vector3(2.0, 0, -0.6), 3: new THREE.Vector3(-2.0, 0, -3.0), 4: new THREE.Vector3(2.0, 0, -3.0),
};
const ENTRY = new THREE.Vector3(3.8, 0, 3.0);
const SINK = new THREE.Vector3(-3.1, 0, 2.2);

/** Dining area: seated customers, food on tables, messes to clean. */
export class DinerRoom extends Room {
  private kaloy!: Character;
  private crowd!: Crowd;
  private tableFood = new Map<number, THREE.Object3D>();
  private tableMess = new Map<number, THREE.Object3D>();
  private dishPile = new THREE.Group();
  private dust = new THREE.Group();
  private broom?: THREE.Object3D;
  constructor() { super(0xffd6d8); }

  async build() {
    const env = await this.env('diner');
    this.broom = env.getObjectByName('Walis') ?? undefined;
    this.kaloy = await Character.create('mang_kaloy');
    this.kaloy.place(0, 0, 1.6, 0);
    this.scene.add(this.kaloy.root);
    this.crowd = new Crowd(this.scene, (c) => c.place(ENTRY.x, 0, ENTRY.z));
    this.scene.add(this.dishPile, this.dust);
    this.dishPile.position.set(-3.95, 0.93, 2.2);
    const dustMat = new THREE.MeshBasicMaterial({ color: 0x9a7650 });
    for (let k = 0; k < 40; k++) {
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.05 + Math.random() * 0.06, 8), dustMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(-3.5 + Math.random() * 7, 0.012, -3.5 + Math.random() * 6);
      this.dust.add(d);
    }
    this.setCameras([[0, 5.6, 6.4], [0, 0.3, -1.0]], [[0, 7.4, 7.6], [0, -1.0, -1.2]]);
    this.ready = true;
  }

  update(s: Snapshot, dt: number, t: number) {
    const seated = s.customers.filter((c) => c.tableId > 0 && (c.action === 'WAITING_FOR_FOOD' || c.action === 'EATING' || c.action === 'PAYING'));
    this.crowd.sync(seated);
    for (const v of seated) {
      const c = this.crowd.get(v.id);
      const tp = TABLES[v.tableId];
      if (!c || !tp) continue;
      c.walkTo(tp.x, 0, tp.z - 0.85, 0);
      if (c.arrived) c.setPose('sit');
      c.showBubble(v.action === 'WAITING_FOR_FOOD');
      c.setMood(v.emotion, v.patience, v.action === 'WAITING_FOR_FOOD');
    }
    this.crowd.update(dt, t);

    // food on tables while eating
    const eating = new Map<number, string>();
    for (const v of seated) if (v.action === 'EATING') {
      const o = s.orders.find((x) => x.id === v.orderId);
      if (o) eating.set(v.tableId, o.lines[0].dish);
    }
    for (const [tid, tp] of Object.entries(TABLES)) {
      const id = Number(tid);
      const dish = eating.get(id);
      if (dish && !this.tableFood.has(id)) {
        const g = new THREE.Group(); g.position.set(tp.x, 0.8, tp.z - 0.25); this.tableFood.set(id, g); this.scene.add(g);
        this.food(dish).then((f) => { if (f) { f.scale.setScalar(0.75); g.add(f); } });
      } else if (!dish && this.tableFood.has(id)) { this.tableFood.get(id)!.removeFromParent(); this.tableFood.delete(id); }
      // mess left behind
      const table = s.shop.tables.find((x) => x.id === id);
      const dirty = !!table && table.dirt > 0.001 && !table.occupant;
      if (dirty && !this.tableMess.has(id)) {
        const g = new THREE.Group(); g.position.set(tp.x + 0.1, 0.8, tp.z); this.tableMess.set(id, g); this.scene.add(g);
        this.food('DirtyPlate').then((f) => { if (f) { f.scale.setScalar(0.8); g.add(f); } });
      } else if (!dirty && this.tableMess.has(id)) { this.tableMess.get(id)!.removeFromParent(); this.tableMess.delete(id); }
      if (dirty) this.tableMess.get(id)!.scale.setScalar(0.4 + 0.6 * Math.min(1, table!.dirt));
    }

    // dish pile + floor dirt
    const want = Math.min(10, s.shop.dirtyDishes);
    while (this.dishPile.children.length < want) {
      const k = this.dishPile.children.length;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.03, 20), new THREE.MeshToonMaterial({ color: 0xf6f3ea }));
      p.position.set((k % 2) * 0.05, 0.03 + k * 0.035, 0); this.dishPile.add(p);
    }
    while (this.dishPile.children.length > want) this.dishPile.children[this.dishPile.children.length - 1].removeFromParent();
    const nDust = Math.round(s.shop.floorDirt * this.dust.children.length);
    this.dust.children.forEach((d, k) => { d.visible = k < nDust; });

    // Mang Kaloy goes to whatever chore is active
    const active = s.tasks.find((x) => x.status === 'ACTIVE');
    if (active?.type === 'CleanTableTask' && active.tableId) {
      const tp = TABLES[active.tableId as number]; this.kaloy.walkTo(tp.x + 0.9, 0, tp.z + 0.4, -Math.PI / 2 - 0.4); this.kaloy.setPose('work');
    } else if (active?.type === 'WashDishesTask') {
      this.kaloy.walkTo(SINK.x, 0, SINK.z, -Math.PI / 2); this.kaloy.setPose('work');
    } else if (active?.type === 'SweepFloorTask') {
      this.kaloy.walkTo(Math.sin(t * 0.6) * 1.2, 0, 0.9, 0); this.kaloy.setPose('work');
    } else { this.kaloy.walkTo(0, 0, 1.6, 0); if (this.kaloy.pose === 'work') this.kaloy.setPose('idle'); }
    if (this.broom) this.broom.visible = active?.type !== 'SweepFloorTask';
    this.kaloy.setEmote(s.kaloy.atlasCol, s.kaloy.atlasRow);
    this.kaloy.update(dt, t);
  }

  onEvent(e: GameEvent) {
    if (this.ready && e.type === 'TASK_PROGRESS') this.kaloy.pulse();
  }
  onLocalInput() { if (this.ready) this.kaloy.pulse(); }
}

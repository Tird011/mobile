import * as THREE from 'three';
import type { GameEvent, Snapshot, StaffView } from '../../engine/types';
import { loadModel } from '../assets';
import { Character } from '../Character';
import { toonify } from '../toon';
import { Crowd, StaffCrew } from './Crowd';
import { MeshPool } from '../Particles';
import { Room } from './Room';

// Six table spots, same as blender/environments.py TABLES (Blender x,y -> three x,-y). Bought tables fill them in order.
export const TABLE_SPOTS = [
  new THREE.Vector3(-1.5, 0, -0.5), new THREE.Vector3(1.5, 0, -0.5), new THREE.Vector3(-1.5, 0, -2.8),
  new THREE.Vector3(1.5, 0, -2.8), new THREE.Vector3(-3.5, 0, -1.65), new THREE.Vector3(3.5, 0, -1.65),
];
const ENTRY = new THREE.Vector3(3.8, 0, 3.0);
const SINK = new THREE.Vector3(-3.95, 0.92, 2.2);
const SINK_STAND = new THREE.Vector3(-3.15, 0, 2.2);
const TOP_Y = 0.8;

interface Spark { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }

/** Dining area: tables (as many as bought), decor, eating customers, messes, and helpers doing chores. */
export class DinerRoom extends Room {
  private pool = new MeshPool(this.scene);
  private kaloy!: Character;
  private crowd!: Crowd;
  private crew!: StaffCrew;
  private tableObjs: THREE.Object3D[] = [];
  private tableFood = new Map<number, THREE.Object3D>();
  private mess = new Map<number, THREE.Group>();
  private dishPile = new THREE.Group();
  private dust = new THREE.Group();
  private decor: THREE.Object3D[] = [];
  private broom?: THREE.Object3D;
  private tv?: THREE.Mesh;
  private sparks: Spark[] = [];
  private props: Record<string, THREE.Object3D | null> = {};
  constructor() { super(); }

  async build() {
    const env = await this.env('diner');
    this.broom = env.getObjectByName('Walis') ?? undefined;
    this.tv = (env.getObjectByName('TV') as THREE.Mesh) ?? undefined;
    const decor = (await loadModel('decor')).scene.clone(true);
    toonify(decor, { outline: 0.008, skipOutline: (n) => /String|LampCord/.test(n) });
    this.scene.add(decor);
    for (let i = 1; i <= 4; i++) { const d = decor.getObjectByName(`Decor${i}`); if (d) { d.visible = false; this.decor.push(d); } }
    this.kaloy = await Character.create('mang_kaloy');
    this.kaloy.place(0, 0, 1.6, 0);
    this.scene.add(this.kaloy.root);
    for (const p of ['Rag', 'Sponge', 'HandBroom', 'Tray']) this.props[p] = await this.prop(p);
    this.crowd = new Crowd(this.scene, (c) => c.place(ENTRY.x, 0, ENTRY.z));
    this.crew = new StaffCrew(this.scene, (c, w) => {
      c.place(ENTRY.x - 0.5, 0, ENTRY.z, 0);
      const name = w.role === 'CLEANER' ? 'Rag' : 'Tray';
      this.prop(name).then((p) => p && c.hold(p));
    });
    this.scene.add(this.dishPile, this.dust);
    this.dishPile.position.copy(SINK);
    const dustMat = new THREE.MeshBasicMaterial({ color: 0x9a7650 });
    for (let k = 0; k < 40; k++) {
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.05 + Math.random() * 0.06, 8), dustMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(-3.5 + Math.random() * 7, 0.012, -3.5 + Math.random() * 6);
      this.dust.add(d);
    }
    this.setCameras([[0, 5.6, 6.4], [0, 0.3, -1.0]], [[0, 7.6, 7.8], [0, -1.0, -1.3]]);
    this.rig = { azimuth: 15, center: [0, 0, -0.6], extent: 8, lamps: [[-1.5, 2.2, -0.6], [1.5, 2.2, -2.6]], fog: [35, 230], interior: true };
    await this.world('diner', new THREE.Box3(new THREE.Vector3(-4.4, 0.3, -4.5), new THREE.Vector3(4.4, 3, 3.2)), false);
    this.ready = true;
  }

  private async ensureTables(n: number) {
    while (this.tableObjs.length < Math.min(n, TABLE_SPOTS.length)) {
      const i = this.tableObjs.length;
      const placeholder = new THREE.Group();
      this.tableObjs.push(placeholder);
      const set = (await loadModel('table_set')).scene.clone(true);
      toonify(set, { outline: 0.012 });
      set.position.copy(TABLE_SPOTS[i]);
      this.scene.add(set);
      this.tableObjs[i] = set;
      this.burst(TABLE_SPOTS[i].clone().setY(1), 0xffd25a, 20);   // a new table pops in
    }
  }

  update(s: Snapshot, dt: number, t: number) {
    this.ensureTables(s.shop.tables.length);
    this.decor.forEach((d, i) => { d.visible = s.perks.decor > i; });
    if (this.tv) (this.tv.material as THREE.MeshToonMaterial).color.setHSL(0.6, 0.4, 0.15 + 0.1 * Math.abs(Math.sin(t * 2.3) * Math.sin(t * 5.1)));

    // ---- customers at tables
    const seated = s.customers.filter((c) => c.tableId > 0 && (c.action === 'WAITING_FOR_FOOD' || c.action === 'EATING' || c.action === 'PAYING'));
    this.crowd.sync(seated);
    for (const v of seated) {
      const c = this.crowd.get(v.id);
      const tp = TABLE_SPOTS[v.tableId - 1];
      if (!c || !tp) continue;
      c.walkTo(tp.x, 0, tp.z - 0.85, 0);
      if (c.arrived) c.setPose(v.action === 'EATING' ? 'eat' : 'sit');
      c.showBubble(v.action === 'WAITING_FOR_FOOD');
      c.setMood(v.emotion, v.patience, v.action === 'WAITING_FOR_FOOD');
    }
    this.crowd.update(dt, t);

    const eating = new Map<number, string>();
    for (const v of seated) if (v.action === 'EATING') { const o = s.orders.find((x) => x.id === v.orderId); if (o) eating.set(v.tableId, o.lines[0].dish); }
    s.shop.tables.forEach((table) => {
      const id = table.id, tp = TABLE_SPOTS[id - 1];
      if (!tp) return;
      const dish = eating.get(id);
      if (dish && !this.tableFood.has(id)) {
        const g = new THREE.Group(); g.position.set(tp.x, TOP_Y, tp.z - 0.25); this.tableFood.set(id, g); this.scene.add(g);
        this.food(dish).then((f) => { if (f) { f.scale.setScalar(0.75); g.add(f); } });
      } else if (!dish && this.tableFood.has(id)) { this.tableFood.get(id)!.removeFromParent(); this.tableFood.delete(id); }
      if (dish && Math.random() < dt * 2) this.steam(tp.x, TOP_Y + 0.25, tp.z - 0.25);
      this.syncMess(id, tp, table.dirt, !table.occupant);
    });

    // ---- dish pile + floor dust
    const want = Math.min(10, s.shop.dirtyDishes);
    while (this.dishPile.children.length < want) {
      const k = this.dishPile.children.length;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.03, 20), new THREE.MeshToonMaterial({ color: 0xf6f3ea }));
      p.position.set((k % 2) * 0.05, 0.03 + k * 0.035, 0); this.dishPile.add(p);
    }
    while (this.dishPile.children.length > want) this.dishPile.children[this.dishPile.children.length - 1].removeFromParent();
    const nDust = Math.round(s.shop.floorDirt * this.dust.children.length);
    this.dust.children.forEach((d, k) => { d.visible = k < nDust; });

    // ---- Mang Kaloy and the camera follow the active chore
    const active = s.tasks.find((x) => x.status === 'ACTIVE');
    let held: string | null = null;
    if (active?.type === 'CleanTableTask' && active.tableId) {
      const tp = TABLE_SPOTS[(active.tableId as number) - 1];
      this.kaloy.walkTo(tp.x + 0.75, 0, tp.z + 0.35, -2.2); this.kaloy.setPose('wipe'); held = 'Rag';
      this.focus(tp.clone().setY(TOP_Y), 1.6, 1.4, 0.6);
    } else if (active?.type === 'WashDishesTask') {
      this.kaloy.walkTo(SINK_STAND.x, 0, SINK_STAND.z, -Math.PI / 2); this.kaloy.setPose('scrub'); held = 'Sponge';
      this.focus(SINK.clone(), 1.6, 1.2, 1.0);
      if (Math.random() < dt * 10) this.bubbles();
    } else if (active?.type === 'SweepFloorTask') {
      this.kaloy.walkTo(Math.sin(t * 0.6) * 1.6, 0, 0.9 + Math.cos(t * 0.4) * 0.5, 0); this.kaloy.setPose('sweep'); held = 'HandBroom';
      this.focus(this.kaloy.root.position.clone().setY(0.6), 2.4, 1.8, 0);
      if (Math.random() < dt * 6) this.burst(this.kaloy.root.position.clone().setY(0.05), 0x9a7650, 2, 0.6);
    } else {
      this.kaloy.walkTo(0, 0, 1.6, 0);
      if (['wipe', 'scrub', 'sweep'].includes(this.kaloy.pose)) this.kaloy.setPose('idle');
      if (!this.holdingFocus) this.wide();
    }
    this.kaloy.hold(held ? this.props[held] ?? null : null);
    if (this.broom) this.broom.visible = active?.type !== 'SweepFloorTask';

    // ---- helpers working in the diner
    const crew = s.staff.filter((w) => w.hired && !w.resting && (w.role === 'CLEANER' || (w.role === 'SERVER' && w.where === 'MAIN_DINER')));
    this.crew.sync(crew);
    for (const w of crew) this.staffAt(w, s, dt);
    this.crew.update(dt, t);

    this.updateSparks(dt);
    this.kaloy.setEmote(s.kaloy.atlasCol, s.kaloy.atlasRow);
    this.kaloy.update(dt, t);
    this.updateCamera(dt, t);
  }

  private staffAt(w: StaffView, s: Snapshot, dt: number) {
    const c = this.crew.get(w.id);
    if (!c) return;
    if (w.role === 'CLEANER') {
      if (w.target.startsWith('table')) {
        const tp = TABLE_SPOTS[Number(w.target.slice(5)) - 1];
        if (tp) { c.walkTo(tp.x - 0.75, 0, tp.z + 0.35, 2.2); c.setPose(c.arrived ? 'wipe' : 'walk'); }
      } else if (w.target === 'sink') {
        c.walkTo(SINK_STAND.x, 0, SINK_STAND.z - 0.6, -Math.PI / 2); c.setPose('scrub');
        if (Math.random() < dt * 6) this.bubbles();
      } else if (w.target === 'floor') {
        c.walkTo(-1 + Math.sin(Date.now() / 1500) * 1.5, 0, -1.6, 0); c.setPose('sweep');
      } else { c.walkTo(3.2, 0, 2.2, -0.6); c.setPose('idle'); }
    } else {
      // Ate Joy brings food to the table
      const o = s.orders.find((x) => x.id === w.target);
      const cust = o ? s.customers.find((x) => x.id === o.customerId) : undefined;
      const tp = cust && cust.tableId > 0 ? TABLE_SPOTS[cust.tableId - 1] : undefined;
      if (tp) { c.walkTo(tp.x + 0.7, 0, tp.z + 0.1, -1.6); c.setPose('carry'); }
      else { c.walkTo(ENTRY.x - 0.5, 0, ENTRY.z, 0); c.setPose('idle'); }
    }
  }

  /** Brown splotches and a dirty plate on the table, fading as it gets wiped. */
  private syncMess(id: number, tp: THREE.Vector3, dirt: number, free: boolean) {
    let g = this.mess.get(id);
    if (!g) {
      g = new THREE.Group(); g.position.set(tp.x, TOP_Y + 0.005, tp.z);
      const mat = new THREE.MeshBasicMaterial({ color: 0x8a5a30 });
      for (let k = 0; k < 6; k++) {
        const sp = new THREE.Mesh(new THREE.CircleGeometry(0.05 + Math.random() * 0.06, 10), mat);
        sp.rotation.x = -Math.PI / 2; sp.position.set((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8);
        g.add(sp);
      }
      this.food('DirtyPlate').then((f) => { if (f && g) { f.scale.setScalar(0.7); f.position.set(0.15, 0.01, -0.1); f.name = 'plate'; g.add(f); } });
      this.mess.set(id, g); this.scene.add(g);
    }
    const show = free && dirt > 0.001;
    g.visible = show;
    const n = Math.ceil(dirt * 6);
    g.children.forEach((c, k) => { c.visible = c.name === 'plate' ? dirt > 0.35 : k < n; });
    if (g.userData.wasDirty && !show) this.burst(new THREE.Vector3(tp.x, TOP_Y + 0.2, tp.z), 0xffe680, 16);
    g.userData.wasDirty = show;
  }

  private steam(x: number, y: number, z: number) {
    const m = this.pool.get('sphere', 0xffffff, 0.04, { opacity: 0.55 });
    m.position.set(x + (Math.random() - 0.5) * 0.15, y, z);
    this.sparks.push({ mesh: m, vel: new THREE.Vector3(0, 0.35, 0), life: 1.3 });
  }
  private bubbles() {
    const m = this.pool.get('sphere', 0xe8f6ff, 0.03 + Math.random() * 0.03, { opacity: 0.8 });
    m.position.set(SINK.x + (Math.random() - 0.5) * 0.4, SINK.y + 0.05, SINK.z + (Math.random() - 0.5) * 0.6);
    this.sparks.push({ mesh: m, vel: new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.4, 0), life: 1.0 });
  }
  private burst(at: THREE.Vector3, color: number, n: number, speed = 1.6) {
    for (let k = 0; k < n; k++) {
      const m = this.pool.get('octa', color, 0.035);
      m.position.copy(at);
      this.sparks.push({ mesh: m, vel: new THREE.Vector3((Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed), life: 0.8 });
    }
  }
  private updateSparks(dt: number) {
    for (const p of this.sparks) {
      p.life -= dt; p.mesh.position.addScaledVector(p.vel, dt); p.vel.y -= 1.2 * dt; p.mesh.rotation.y += dt * 4;
      const m = p.mesh.material as THREE.MeshBasicMaterial;
      if (m.transparent) m.opacity = Math.max(0, Math.min(m.opacity, p.life));
    }
    for (const p of this.sparks) if (p.life <= 0) this.pool.release(p.mesh);
    this.sparks = this.sparks.filter((p) => p.life > 0);
  }

  onLocalInput() { if (this.ready) this.kaloy.pulse(); }
  onEvent(e: GameEvent) {
    if (!this.ready) return;
    if (e.type === 'TASK_PROGRESS') this.kaloy.pulse();
    if (e.type === 'CUSTOMER_SERVED' && typeof e.tableId === 'number') {
      const tp = TABLE_SPOTS[(e.tableId as number) - 1];
      if (tp) { this.focus(tp.clone().setY(TOP_Y), 1.8, 1.4, 0.4, 2.5); this.burst(tp.clone().setY(1.1), 0xff8fb0, 10); }
    }
    if (e.type === 'UPGRADE_BOUGHT' && e.id === 'decor') this.burst(new THREE.Vector3(0, 2.2, -1), 0xffd25a, 40, 3);
  }
}

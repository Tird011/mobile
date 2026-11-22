import * as THREE from 'three';
import type { GameEvent, Snapshot, StepView } from '../../engine/types';
import { Character } from '../Character';
import { StaffCrew } from './Crowd';
import { Room } from './Room';

const KAWALI = new THREE.Vector3(0.45, 1.27, -0.8);
const STOCKPOT = new THREE.Vector3(1.35, 1.27, -0.8);
const BOARD = new THREE.Vector3(-1.3, 1.07, -0.6);
const PLATE_SPOT = new THREE.Vector3(-0.35, 0.98, -0.35);

const COLOR: Record<string, number> = {
  noodles: 0xf6d696, pork_broth: 0xb07034, cornstarch: 0xffffff, egg: 0xffdc5a, quail_egg: 0xf5ecd0, pork: 0xe39a8a, liver: 0x602e22,
  chicken: 0xf1c9a0, tapa: 0x8a4a2a, ground_pork: 0xd08878, onion: 0xd9b8d8, garlic: 0xfaf3e0, green_onion: 0x60be4a, cabbage: 0x9ad07a,
  carrot: 0xf08a2c, soy_sauce: 0x3a2218, patis: 0xc08a3a, oyster_sauce: 0x4a2a1a, vinegar: 0xeef0f0, chicharon: 0xe8aa50,
  kikiam: 0xaa5630, fish_ball: 0xf0e0c0, squid_ball: 0xf8e8d8, fried_garlic: 0xd8a040, rice: 0xfbf8ef, oil: 0xf0d060, lumpia_wrapper: 0xf3e0b0,
  calamansi: 0x78b43c, sili: 0xd22828, atsara: 0xf0b040, salt: 0xffffff, paminta: 0x333333, sugar: 0xffffff, chili_flakes: 0xd22828,
};
const CHOP_PROP: Record<string, string> = { onion: 'Onion', liver: 'LiverSlab', chicken: 'ChickenPiece', cabbage: 'Cabbage', carrot: 'Carrot' };
const LIQUIDS = ['pork_broth', 'soy_sauce', 'oyster_sauce', 'oil'];

interface Particle { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; max: number; kind: 'drop' | 'steam' | 'spark' | 'bubble' }

/**
 * The cooking station, alive: the camera moves to the board while chopping (the onion actually gets cut),
 * to the stove while fanning, stirring and seasoning, and to the bowl while plating.
 */
export class KitchenRoom extends Room {
  private kaloy!: Character;
  private crew!: StaffCrew;
  private kawali?: THREE.Object3D;
  private knife?: THREE.Object3D;
  private flames = new THREE.Group();
  private particles: Particle[] = [];
  private boardItem: THREE.Object3D | null = null;
  private boardKey = '';
  private slices = new THREE.Group();
  private pot = new THREE.Group();          // what's inside the kawali
  private potKey = '';
  private contents: string[] = [];
  private fried: THREE.Object3D | null = null;
  private friedFlip = 0;
  private plate = new THREE.Group();
  private plateDish = '';
  private plateExtras = '';
  private fan: THREE.Object3D | null = null;
  private ladle: THREE.Object3D | null = null;
  private shaker: THREE.Object3D | null = null;
  private stepKey = '';
  private lastRemaining = '';
  private lastProgress = 0;
  private stir = 0; private chop = 0; private fanPulse = 0; private shake = 0;
  private heat = 0;
  private sessionKey = '';
  constructor() { super(0xffd6d8); }

  async build() {
    const env = await this.env('kitchen', /^(Floor|BackWall|Splash)/);
    this.kawali = env.getObjectByName('Kawali') ?? undefined;
    this.knife = env.getObjectByName('Knife') ?? undefined;
    const outer = new THREE.MeshBasicMaterial({ color: 0xff8a1e });
    const inner = new THREE.MeshBasicMaterial({ color: 0xffe250 });
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 6).translate(0, 0.11, 0), outer);
      const g = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.13, 6).translate(0, 0.065, 0), inner);
      f.position.set(Math.cos(a) * 0.14, 0, Math.sin(a) * 0.14); g.position.copy(f.position);
      this.flames.add(f, g);
    }
    this.flames.position.set(KAWALI.x, 1.22, KAWALI.z);
    this.pot.position.copy(KAWALI);
    this.plate.position.copy(PLATE_SPOT);
    this.scene.add(this.flames, this.slices, this.pot, this.plate);
    this.fan = await this.food('Pamaypay');
    if (this.fan) { this.fan.scale.setScalar(0.8); this.fan.position.set(-0.25, 1.5, -0.45); this.fan.visible = false; this.scene.add(this.fan); }
    this.ladle = await this.prop('Ladle');
    if (this.ladle) { this.ladle.visible = false; this.scene.add(this.ladle); }
    this.shaker = await this.prop('Shaker');
    if (this.shaker) { this.shaker.visible = false; this.scene.add(this.shaker); }
    this.kaloy = await Character.create('mang_kaloy');
    this.kaloy.place(-2.55, 0, 0.35, Math.PI * 0.7);
    this.scene.add(this.kaloy.root);
    this.crew = new StaffCrew(this.scene, (c) => {
      c.place(1.95, 0, 0.1, -2.3);
      this.prop('Ladle').then((l) => l && c.hold(l));
    });
    this.setCameras([[0.1, 2.55, 2.1], [-0.1, 1.05, -0.65]], [[-0.45, 3.9, 3.9], [-0.45, 0.35, -0.55]]);
    this.ready = true;
  }

  update(s: Snapshot, dt: number, t: number) {
    const ck = s.cooking;
    const step = ck?.step;
    const sess = ck ? `${ck.orderId}:${ck.dish}` : '';
    if (sess !== this.sessionKey) { this.sessionKey = sess; this.contents = []; this.potKey = ''; this.slices.clear(); this.setFried(null); }
    const key = ck ? `${ck.orderId}:${ck.stepIndex}` : '';
    if (key !== this.stepKey) { this.stepKey = key; this.lastRemaining = ''; this.lastProgress = 0; }

    // ---- heat & flames
    const targetHeat = step?.step === 'FanFireStep' ? Number(step.heat ?? 0) : ck ? 0.45 : 0;
    this.heat += (targetHeat - this.heat) * Math.min(1, dt * 8);
    this.flames.visible = this.heat > 0.02;
    this.flames.children.forEach((f, i) => f.scale.set(1, (0.3 + this.heat * 1.6) * (0.75 + 0.25 * Math.sin(t * 20 + i * 1.7)), 1));

    if (step) this.react(step, ck!.dish, dt, t);
    else {
      this.setBoard(null);
      this.kaloy.walkTo(-2.55, 0, 0.35, Math.PI * 0.7);
      this.kaloy.setPose('idle');
      this.wide();
    }

    // ---- what's in the kawali
    const pk = this.contents.join(',');
    if (pk !== this.potKey) { this.potKey = pk; this.rebuildPot(); }
    this.pot.children.forEach((c, i) => { if (c.userData.bits) c.rotation.y += dt * (0.3 + this.stir * 6) * (i % 2 ? 1 : -1); });

    // ---- plated dish
    const dish = step?.step === 'PlateStep' && ck ? ck.dish : '';
    if (dish !== this.plateDish) {
      this.plateDish = dish; this.plateExtras = ''; this.plate.clear();
      if (dish) this.food(dish).then((f) => { if (f && this.plateDish === dish) { f.scale.setScalar(0.7); this.plate.add(f); } });
    }

    // ---- animations
    this.stir = Math.max(0, this.stir - dt * 1.5);
    this.chop = Math.max(0, this.chop - dt * 4);
    this.fanPulse = Math.max(0, this.fanPulse - dt * 1.5);
    this.shake = Math.max(0, this.shake - dt * 3);
    if (this.kawali) {
      this.kawali.rotation.z = Math.sin(t * 18) * 0.035 * this.stir;
      this.kawali.position.y = KAWALI.y + Math.abs(Math.sin(t * 18)) * 0.02 * this.stir;
    }
    this.animateKnife(t);
    if (this.fan) {
      this.fan.visible = step?.step === 'FanFireStep';
      const speed = step?.blowing ? 1 : this.fanPulse;
      this.fan.rotation.set(-0.3 + Math.sin(t * 18) * 0.5 * speed, 0.6, Math.sin(t * 18) * 0.25 * speed);
    }
    if (this.ladle) {
      const on = step?.step === 'StirStep' || (step?.step === 'AddIngredientsStep' && this.contents.length > 0);
      this.ladle.visible = !!on;
      const a = t * (1.5 + this.stir * 8);
      this.ladle.position.set(KAWALI.x + Math.cos(a) * 0.15, KAWALI.y + 0.12, KAWALI.z + Math.sin(a) * 0.12);
      this.ladle.rotation.set(0.35, 0, -0.35);
    }
    if (this.shaker) {
      this.shaker.visible = step?.step === 'SeasonStep';
      this.shaker.position.set(KAWALI.x - 0.05, KAWALI.y + 0.55 + Math.sin(t * 30) * 0.03 * this.shake, KAWALI.z + 0.05);
      this.shaker.rotation.z = Math.PI * 0.85 + Math.sin(t * 30) * 0.3 * this.shake;
    }
    if (this.fried) {
      this.friedFlip = Math.max(0, this.friedFlip - dt * 2.5);
      this.fried.rotation.x = Math.PI * (1 - this.friedFlip) * (this.fried.userData.flipped ? 1 : 0);
      this.fried.position.y = 0.08 + Math.sin(this.friedFlip * Math.PI) * 0.25;
    }
    // ambient: the stock pot always simmers, the kawali steams while boiling
    if (Math.random() < dt * 2.5) this.puff(STOCKPOT.x, STOCKPOT.y + 0.62, STOCKPOT.z, 0.25);
    if ((step?.step === 'BoilStep' || step?.step === 'FryStep' || this.heat > 0.5) && Math.random() < dt * 9) this.puff(KAWALI.x, KAWALI.y + 0.25, KAWALI.z, 0.4);
    if (step?.step === 'BoilStep' && Math.random() < dt * 14) this.bubble();
    this.updateParticles(dt);

    // ---- Inday at the second stove
    const cook = s.staff.filter((w) => w.role === 'COOK' && w.hired && !w.resting);
    this.crew.sync(cook);
    for (const w of cook) {
      const c = this.crew.get(w.id);
      if (!c) continue;
      c.setPose((w.progress ?? 0) > 0 ? 'stir' : 'idle');
      if ((w.progress ?? 0) > 0 && Math.random() < dt * 3) this.puff(STOCKPOT.x, STOCKPOT.y + 0.62, STOCKPOT.z, 0.3);
    }
    this.crew.update(dt, t);

    this.kaloy.setEmote(s.kaloy.atlasCol, s.kaloy.atlasRow);
    this.kaloy.update(dt, t);
    this.updateCamera(dt, t);
  }

  /** Per-step staging: where Mang Kaloy stands, what's on the board, where the camera looks. */
  private react(step: StepView, dish: string, dt: number, t: number) {
    const kind = step.step;
    if (kind === 'ChopStep') {
      this.setBoard(String(step.ingredient));
      this.kaloy.walkTo(-2.05, 0, 0.1, 2.33); this.kaloy.setPose('chop');
      this.focus(BOARD, 1.05, 0.85, 0.25);
      const cuts = Number(step.cuts ?? 0), need = Number(step.cutsNeeded ?? 1);
      if (step.progress > this.lastProgress) { this.chop = 1; this.kaloy.pulse(); this.addSlice(String(step.ingredient), cuts); }
      if (this.boardItem) this.boardItem.scale.x = this.boardItem.userData.baseScale * Math.max(0.25, 1 - (cuts / need) * 0.75);
    } else {
      this.setBoard(null);
    }
    if (kind === 'PlateStep') {
      this.kaloy.walkTo(-0.95, 0, 0.2, 2.6); this.kaloy.setPose('work');
      this.focus(PLATE_SPOT.clone().add(new THREE.Vector3(0, 0.1, 0)), 0.95, 0.75, 0);
      const req = String(step.requested ?? '').split(',').filter(Boolean);
      const missing = String(step.missing ?? '').split(',').filter(Boolean);
      const added = req.filter((x) => !missing.includes(x)).join(',');
      if (added !== this.plateExtras) {
        const now = added.split(',').filter(Boolean), before = this.plateExtras.split(',').filter(Boolean);
        now.filter((x) => !before.includes(x)).forEach((id, k) => {
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshToonMaterial({ color: COLOR[id] ?? 0xcccccc }));
          m.position.set(0.32 + k * 0.08, 0.06, 0.12); this.plate.add(m);
        });
        this.plateExtras = added;
      }
    } else if (kind !== 'ChopStep') {
      this.kaloy.walkTo(-0.4, 0, 0.2, 2.44);
      this.kaloy.setPose(kind === 'StirStep' ? 'stir' : kind === 'FanFireStep' ? 'fan' : 'work');
      this.focus(KAWALI.clone().add(new THREE.Vector3(0, 0.18, 0)), 1.15, 0.95, 0.35);
    }
    if (kind === 'AddIngredientsStep') {
      const rem = String(step.remaining ?? '');
      const req = String(step.required ?? '').split(',').filter(Boolean);
      const remList = rem.split(',').filter(Boolean);
      for (const id of req) if (!remList.includes(id) && !this.contents.includes(id)) { this.contents.push(id); this.drop(id); }
      this.lastRemaining = rem;
    }
    if (kind === 'StirStep' && step.progress > this.lastProgress) this.stir = 1;
    if (kind === 'SeasonStep' && step.progress > this.lastProgress) { this.shake = 1; for (let k = 0; k < 5; k++) this.drop(String(step.spice), 0.01); }
    if (kind === 'FryStep') {
      if (!this.fried) this.setFried(dish);
      if (step.flipped && this.fried && !this.fried.userData.flipped) { this.fried.userData.flipped = true; this.friedFlip = 1; }
    }
    if (kind === 'FanFireStep' && step.blowing) this.fanPulse = 1;
    this.lastProgress = step.progress;
  }

  private setBoard(ingredient: string | null) {
    const k = ingredient ?? '';
    if (k === this.boardKey) return;
    this.boardKey = k;
    if (this.boardItem) { this.boardItem.removeFromParent(); this.boardItem = null; }
    if (!ingredient) return;
    this.prop(CHOP_PROP[ingredient] ?? 'Onion').then((o) => {
      if (!o || this.boardKey !== k) return;
      o.scale.setScalar(1.3); o.userData.baseScale = 1.3;
      o.position.set(BOARD.x - 0.05, BOARD.y, BOARD.z + 0.02);
      this.boardItem = o; this.scene.add(o);
    });
  }

  private addSlice(ingredient: string, n: number) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.025, 14), new THREE.MeshToonMaterial({ color: COLOR[ingredient] ?? 0xdddddd }));
    m.position.set(BOARD.x + 0.18 + n * 0.035, BOARD.y + 0.015, BOARD.z + 0.05 + (n % 2) * 0.03);
    m.rotation.set(Math.PI / 2 - 0.3, 0, 0.2 * (n % 2 ? 1 : -1));
    this.slices.add(m);
    for (let k = 0; k < 4; k++) this.spark(BOARD.x + 0.05, BOARD.y + 0.05, BOARD.z, COLOR[ingredient] ?? 0xdddddd);
  }

  private animateKnife(t: number) {
    if (!this.knife) return;
    if (this.boardItem) {
      this.knife.position.set(BOARD.x + 0.12, BOARD.y + 0.12 + 0.18 * (1 - this.chop) + Math.sin(t * 3) * 0.01, BOARD.z + 0.02);
      this.knife.rotation.set(0, 0, -0.15 - 0.5 * this.chop);
    } else {
      this.knife.position.set(-1.0, 1.07, -0.45);
      this.knife.rotation.set(0, 0, 0);
    }
  }

  private rebuildPot() {
    this.pot.clear();
    if (!this.contents.length) return;
    const liquid = [...this.contents].reverse().find((c) => LIQUIDS.includes(c));
    const deep = this.contents.includes('pork_broth');
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(deep ? 0.36 : 0.26, deep ? 0.3 : 0.22, 0.02, 28),
      new THREE.MeshToonMaterial({ color: liquid ? COLOR[liquid] : 0xd8b070 }));
    disc.position.y = deep ? 0.16 : 0.09;
    this.pot.add(disc);
    const bits = new THREE.Group(); bits.userData.bits = true; bits.position.y = disc.position.y + 0.015;
    if (this.contents.includes('noodles')) {
      for (let k = 0; k < 7; k++) {
        const n = new THREE.Mesh(new THREE.TorusGeometry(0.05 + Math.random() * 0.04, 0.012, 6, 14), new THREE.MeshToonMaterial({ color: COLOR.noodles }));
        n.position.set((Math.random() - 0.5) * 0.4, 0.005, (Math.random() - 0.5) * 0.4); n.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.4;
        bits.add(n);
      }
    }
    if (this.contents.includes('rice')) {
      const r = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 10), new THREE.MeshToonMaterial({ color: COLOR.rice }));
      r.scale.y = 0.4; bits.add(r);
    }
    for (const id of this.contents) {
      if (LIQUIDS.includes(id) || id === 'noodles' || id === 'rice' || id === 'cornstarch') continue;
      for (let k = 0; k < 2; k++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), new THREE.MeshToonMaterial({ color: COLOR[id] ?? 0xcccccc }));
        const a = Math.random() * Math.PI * 2, r = Math.random() * 0.22;
        b.position.set(Math.cos(a) * r, 0.01, Math.sin(a) * r); b.scale.y = 0.6;
        bits.add(b);
      }
    }
    this.pot.add(bits);
  }

  private setFried(dish: string | null) {
    if (this.fried) { this.fried.removeFromParent(); this.fried = null; }
    if (!dish) return;
    let m: THREE.Mesh;
    if (dish === 'lumpiang_shanghai') {
      m = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.22, 6, 10), new THREE.MeshToonMaterial({ color: 0xe8aa50 }));
      m.rotation.z = Math.PI / 2;
    } else {
      m = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.025, 0.14), new THREE.MeshToonMaterial({ color: dish === 'tapsilog' ? 0x8a4a2a : 0xffffff }));
    }
    const g = new THREE.Group(); g.add(m); g.position.set(0, 0.08, 0);
    this.fried = g; this.pot.add(g);
  }

  private drop(id: string, size = 0.035) {
    const n = size > 0.02 ? 3 : 1;
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 6), new THREE.MeshToonMaterial({ color: COLOR[id] ?? 0xcccccc }));
      m.position.set(KAWALI.x + (Math.random() - 0.5) * 0.2, KAWALI.y + 0.6 + Math.random() * 0.2, KAWALI.z + (Math.random() - 0.5) * 0.2);
      this.scene.add(m);
      this.particles.push({ mesh: m, vel: new THREE.Vector3(0, -0.4, 0), life: 1.0, max: 1.0, kind: 'drop' });
    }
  }
  private puff(x: number, y: number, z: number, spread: number) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.05 + Math.random() * 0.04, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
    m.position.set(x + (Math.random() - 0.5) * spread, y, z + (Math.random() - 0.5) * spread * 0.7);
    this.scene.add(m);
    this.particles.push({ mesh: m, vel: new THREE.Vector3((Math.random() - 0.5) * 0.1, 0.45, 0), life: 1.6, max: 1.6, kind: 'steam' });
  }
  private bubble() {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff6e0 }));
    const a = Math.random() * Math.PI * 2, r = Math.random() * 0.25;
    m.position.set(KAWALI.x + Math.cos(a) * r, KAWALI.y + 0.2, KAWALI.z + Math.sin(a) * r);
    this.scene.add(m);
    this.particles.push({ mesh: m, vel: new THREE.Vector3(0, 0.05, 0), life: 0.5, max: 0.5, kind: 'bubble' });
  }
  private spark(x: number, y: number, z: number, color: number) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.02), new THREE.MeshBasicMaterial({ color }));
    m.position.set(x, y, z);
    this.scene.add(m);
    this.particles.push({ mesh: m, vel: new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.8 + Math.random(), (Math.random() - 0.5) * 0.6), life: 0.5, max: 0.5, kind: 'spark' });
  }
  private updateParticles(dt: number) {
    for (const p of this.particles) {
      p.life -= dt;
      if (p.kind === 'drop') { p.vel.y -= 6 * dt; if (p.mesh.position.y < KAWALI.y + 0.15) p.life = Math.min(p.life, 0.05); }
      if (p.kind === 'spark') p.vel.y -= 5 * dt;
      if (p.kind === 'steam') { p.mesh.scale.multiplyScalar(1 + dt * 0.8); (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (p.life / p.max) * 0.6); }
      if (p.kind === 'bubble') p.mesh.scale.setScalar(1 + (1 - p.life / p.max) * 1.5);
      p.mesh.position.addScaledVector(p.vel, dt);
    }
    for (const p of this.particles) if (p.life <= 0) { p.mesh.removeFromParent(); p.mesh.geometry.dispose(); }
    this.particles = this.particles.filter((x) => x.life > 0);
    if (this.particles.length > 140) this.particles.splice(0, this.particles.length - 140).forEach((p) => p.mesh.removeFromParent());
  }

  onLocalInput(type: string) {
    if (!this.ready) return;
    this.kaloy.pulse();
    if (type === 'SWIPE') this.fanPulse = 1;
    if (type === 'CIRCLE') this.stir = Math.min(1, this.stir + 0.5);
    if (type === 'TAP') this.shake = 1;
  }
  onEvent(e: GameEvent) {
    if (!this.ready) return;
    if (e.type === 'COOKING_FINISHED' && !e.byStaff) {
      this.kaloy.setPose('wave');
      for (let k = 0; k < 18; k++) this.spark(PLATE_SPOT.x, PLATE_SPOT.y + 0.3, PLATE_SPOT.z, [0xffd25a, 0xffffff, 0xff8fb0][k % 3]);
    }
  }
}

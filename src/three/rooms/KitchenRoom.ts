import * as THREE from 'three';
import type { GameEvent, Snapshot } from '../../engine/types';
import { Character } from '../Character';
import { Room } from './Room';

const KAWALI = new THREE.Vector3(0.45, 1.27, -0.8);
const BOARD = new THREE.Vector3(-1.3, 1.05, -0.6);
const PLATE_SPOT = new THREE.Vector3(-0.35, 0.98, -0.35);

const INGREDIENT_COLOR: Record<string, number> = {
  noodles: 0xf6d696, pork_broth: 0xb07034, cornstarch: 0xffffff, egg: 0xffdc5a, quail_egg: 0xf5ecd0, pork: 0xe39a8a, liver: 0x602e22,
  chicken: 0xf1c9a0, tapa: 0x8a4a2a, ground_pork: 0xd08878, onion: 0xf2e6f0, garlic: 0xfaf3e0, green_onion: 0x60be4a, cabbage: 0x9ad07a,
  carrot: 0xf08a2c, soy_sauce: 0x2a1a12, patis: 0xc08a3a, oyster_sauce: 0x4a2a1a, vinegar: 0xeef0f0, chicharon: 0xe8aa50,
  kikiam: 0xaa5630, fish_ball: 0xf0e0c0, squid_ball: 0xf8e8d8, fried_garlic: 0xd8a040, rice: 0xfbf8ef, oil: 0xf0d060, lumpia_wrapper: 0xf3e0b0,
  calamansi: 0x78b43c, sili: 0xd22828, atsara: 0xf0b040,
};

interface Particle { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; kind: 'drop' | 'steam' | 'spark' }

/** The cooking station: the stove's flame follows the heat, ingredients drop into the kawali, the knife chops. */
export class KitchenRoom extends Room {
  private kaloy!: Character;
  private kawali?: THREE.Object3D;
  private knife?: THREE.Object3D;
  private flames = new THREE.Group();
  private particles: Particle[] = [];
  private pieces = new THREE.Group();          // chopped bits on the board
  private plate = new THREE.Group();
  private plateDish = '';
  private lastStepKey = '';
  private lastRemaining = '';
  private lastProgress = 0;
  private stirSpin = 0;
  private chopAnim = 0;
  private heat = 0;
  constructor() { super(0xffd6d8); }

  async build() {
    const env = await this.env('kitchen', /^(Floor|BackWall|Splash)/);
    this.kawali = env.getObjectByName('Kawali') ?? undefined;
    this.knife = env.getObjectByName('Knife') ?? undefined;
    const outer = new THREE.MeshBasicMaterial({ color: 0xff8a1e });
    const inner = new THREE.MeshBasicMaterial({ color: 0xffe250 });
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 6), outer);
      const g = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.13, 6), inner);
      f.position.set(Math.cos(a) * 0.14, 0, Math.sin(a) * 0.14); g.position.copy(f.position);
      f.geometry.translate(0, 0.11, 0); g.geometry.translate(0, 0.065, 0);
      this.flames.add(f, g);
    }
    this.flames.position.set(KAWALI.x, 1.22, KAWALI.z);
    this.scene.add(this.flames, this.pieces, this.plate);
    this.plate.position.copy(PLATE_SPOT);
    this.kaloy = await Character.create('mang_kaloy');
    this.kaloy.place(-2.55, 0, 0.35, Math.PI * 0.7);
    this.scene.add(this.kaloy.root);
    this.setCameras([[0.1, 2.55, 2.1], [-0.1, 1.05, -0.65]], [[-0.45, 3.9, 3.9], [-0.45, 0.35, -0.55]]);
    this.ready = true;
  }

  update(s: Snapshot, dt: number, t: number) {
    const ck = s.cooking;
    const step = ck?.step;
    const key = ck ? `${ck.orderId}:${ck.stepIndex}` : '';
    if (key !== this.lastStepKey) { this.lastStepKey = key; this.lastRemaining = ''; this.lastProgress = 0; }

    // heat / flame size
    const targetHeat = step?.step === 'FanFireStep' ? Number(step.heat ?? 0) : ck ? 0.45 : 0;
    this.heat += (targetHeat - this.heat) * Math.min(1, dt * 8);
    this.flames.visible = this.heat > 0.02;
    this.flames.children.forEach((f, i) => {
      const flick = 0.75 + 0.25 * Math.sin(t * 20 + i * 1.7);
      f.scale.set(1, (0.3 + this.heat * 1.6) * flick, 1);
    });

    if (step) {
      // ingredients just added -> drop them into the kawali
      if (step.step === 'AddIngredientsStep' || step.step === 'PlateStep') {
        const rem = String(step.remaining ?? step.missing ?? '');
        const req = String(step.required ?? step.requested ?? '').split(',').filter(Boolean);
        if (this.lastRemaining && rem !== this.lastRemaining) {
          const before = this.lastRemaining.split(',').filter(Boolean);
          const now = rem.split(',').filter(Boolean);
          for (const id of before) if (!now.includes(id)) this.drop(id, step.step === 'PlateStep' ? PLATE_SPOT : KAWALI);
        } else if (!this.lastRemaining && req.length && rem.split(',').filter(Boolean).length < req.length) {
          // first drop of this step
          for (const id of req) if (!rem.split(',').includes(id)) this.drop(id, KAWALI);
        }
        this.lastRemaining = rem || '-';
      }
      if (step.step === 'ChopStep' && step.progress > this.lastProgress) {
        this.chopAnim = 1;
        this.kaloy.pulse();
        const n = Number(step.cuts ?? 0);
        const piece = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 0.06), new THREE.MeshToonMaterial({ color: INGREDIENT_COLOR[String(step.ingredient)] ?? 0xdddddd }));
        piece.position.set(BOARD.x - 0.25 + n * 0.09, BOARD.y + 0.02, BOARD.z + (Math.random() - 0.5) * 0.15);
        this.pieces.add(piece);
      }
      if (step.step === 'StirStep' && step.progress > this.lastProgress) this.stirSpin = 1;
      if ((step.step === 'BoilStep' || step.step === 'FryStep') && Math.random() < dt * 8) this.puff();
      if (step.step === 'SeasonStep' && step.progress > this.lastProgress) for (let k = 0; k < 6; k++) this.drop('salt', KAWALI, 0.004, 0xffffff);
      this.lastProgress = step.progress;
      this.kaloy.setPose(step.step === 'ChopStep' ? 'chop' : step.step === 'StirStep' ? 'stir' : step.step === 'FanFireStep' ? 'fan' : 'work');
    } else {
      this.kaloy.setPose('idle');
      if (this.pieces.children.length) this.pieces.clear();
    }

    // the plated dish appears during the plating step
    const dish = step?.step === 'PlateStep' && ck ? ck.dish : '';
    if (dish !== this.plateDish) {
      this.plateDish = dish;
      this.plate.clear();
      if (dish) this.food(dish).then((f) => { if (f && this.plateDish === dish) { f.scale.setScalar(0.7); this.plate.add(f); } });
    }

    // kawali + knife animation
    this.stirSpin = Math.max(0, this.stirSpin - dt * 2);
    this.chopAnim = Math.max(0, this.chopAnim - dt * 5);
    if (this.kawali) {
      this.kawali.rotation.z = Math.sin(t * 18) * 0.04 * this.stirSpin;
      this.kawali.position.y = KAWALI.y + Math.abs(Math.sin(t * 18)) * 0.02 * this.stirSpin;
    }
    if (this.knife) this.knife.rotation.x = -this.chopAnim * 0.9;

    this.updateParticles(dt);
    this.kaloy.setEmote(s.kaloy.atlasCol, s.kaloy.atlasRow);
    this.kaloy.update(dt, t);
  }

  private drop(id: string, at: THREE.Vector3, size = 0.035, color?: number) {
    const n = size > 0.01 ? 4 : 1;
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 6), new THREE.MeshToonMaterial({ color: color ?? INGREDIENT_COLOR[id] ?? 0xcccccc }));
      m.position.set(at.x + (Math.random() - 0.5) * 0.2, at.y + 0.7 + Math.random() * 0.2, at.z + (Math.random() - 0.5) * 0.2);
      this.scene.add(m);
      this.particles.push({ mesh: m, vel: new THREE.Vector3(0, -0.5, 0), life: 1.2, kind: 'drop' });
    }
  }
  private puff() {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.05 + Math.random() * 0.04, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
    m.position.set(KAWALI.x + (Math.random() - 0.5) * 0.4, KAWALI.y + 0.25, KAWALI.z + (Math.random() - 0.5) * 0.3);
    this.scene.add(m);
    this.particles.push({ mesh: m, vel: new THREE.Vector3((Math.random() - 0.5) * 0.1, 0.5, 0), life: 1.4, kind: 'steam' });
  }
  private updateParticles(dt: number) {
    for (const p of this.particles) {
      p.life -= dt;
      if (p.kind === 'drop') { p.vel.y -= 6 * dt; if (p.mesh.position.y < KAWALI.y + 0.12 && p.mesh.position.y > KAWALI.y - 0.1) p.life = Math.min(p.life, 0.15); }
      if (p.kind === 'steam') { p.mesh.scale.multiplyScalar(1 + dt * 0.8); (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.life / 1.4 * 0.7); }
      p.mesh.position.addScaledVector(p.vel, dt);
    }
    for (const p of this.particles.filter((x) => x.life <= 0)) p.mesh.removeFromParent();
    this.particles = this.particles.filter((x) => x.life > 0);
  }

  onLocalInput(type: string) { if (this.ready && (type === 'SWIPE' || type === 'TAP')) this.kaloy.pulse(); }
  onEvent(e: GameEvent) { if (this.ready && e.type === 'COOKING_FINISHED') this.kaloy.setPose('wave'); }
}

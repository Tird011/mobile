import * as THREE from 'three';
import type { GameEvent, Snapshot } from '../../engine/types';
import { loadModel, type ModelId } from '../assets';
import { Character } from '../Character';
import { toonify } from '../toon';
import { buildFarRoad, buildRoadside } from '../world/Surroundings';
import { Room } from './Room';

const SEG = 30;
const laneX = (lane: number) => (1 - lane) * 2.2;     // camera looks down +Z, so +X is screen-left
const OBSTACLE_MODEL: Record<string, ModelId> = { JEEPNEY: 'jeepney', TRICYCLE: 'tricycle', POTHOLE: 'pothole', ASO: 'aso', CHICKEN: 'chicken' };

/** The delivery run: endless Batangas road, Mang Kaloy on the scooter, traffic to dodge. */
export class RoadRoom extends Room {
  private segments: THREE.Object3D[] = [];
  private rider = new THREE.Group();
  private kaloy!: Character;
  private pool = new Map<string, THREE.Object3D[]>();
  private active: THREE.Object3D[] = [];
  private x = 0;
  private dist = 0;
  private shake = 0;
  private far?: THREE.Object3D;
  constructor() { super(); }

  async build() {
    const road = (await loadModel('road')).scene;
    for (let k = 0; k < 4; k++) {
      const s = road.clone(true);
      toonify(s, { outline: 0.012, skipOutline: (n) => /^(Asphalt|Grass|Sidewalk|Dash)/.test(n) });
      this.scene.add(s);
      this.segments.push(s);
      await buildRoadside(s, k);
    }
    const scooter = (await loadModel('scooter')).scene.clone(true);
    toonify(scooter, { outline: 0.01 });
    this.kaloy = await Character.create('mang_kaloy');
    this.kaloy.place(0, 0.8, -0.3, 0);
    this.kaloy.setPose('ride');
    this.rider.add(scooter, this.kaloy.root);
    this.scene.add(this.rider);
    for (const [type, id] of Object.entries(OBSTACLE_MODEL)) {
      const src = (await loadModel(id)).scene;
      const list: THREE.Object3D[] = [];
      for (let k = 0; k < 4; k++) { const o = src.clone(true); toonify(o, { outline: 0.012 }); o.visible = false; this.scene.add(o); list.push(o); }
      this.pool.set(type, list);
    }
    this.far = await buildFarRoad();
    this.scene.add(this.far);
    this.rig = { azimuth: 150, center: [0, 0, 0], extent: 14, fog: [45, 230] };
    await this.world(null, new THREE.Box3(), true);
    this.ready = true;
  }

  update(s: Snapshot, dt: number, t: number) {
    const d = s.delivery;
    if (!d) return;
    // smooth toward the latest snapshot
    this.dist += (d.distance - this.dist) * Math.min(1, dt * 10);
    this.x += (laneX(d.lane) - this.x) * Math.min(1, dt * 9);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sx = Math.sin(t * 50) * 0.08 * this.shake;
    this.rider.position.set(this.x + sx, 0, this.dist);
    this.rig.center[2] = this.dist + 6;
    if (this.far) this.far.position.z = this.dist;
    this.rider.rotation.z = (laneX(d.lane) - this.x) * 0.12;
    // recycle road tiles under the rider (the road model runs along +Z from 0 to 30)
    const base = Math.floor(this.dist / SEG) * SEG;
    this.segments.forEach((seg, k) => seg.position.set(0, 0, base + (k - 1) * SEG));
    // obstacles
    this.active.forEach((o) => { o.visible = false; });
    this.active = [];
    const used = new Map<string, number>();
    for (const ob of d.obstacles) {
      const list = this.pool.get(ob.type);
      const n = used.get(ob.type) ?? 0;
      if (!list || n >= list.length) continue;
      used.set(ob.type, n + 1);
      const o = list[n];
      o.visible = true;
      o.position.set(laneX(ob.lane), 0, d.distance + ob.ahead + (this.dist - d.distance));
      o.rotation.y = ob.type === 'JEEPNEY' || ob.type === 'TRICYCLE' ? Math.PI : Math.sin(t * 2) * 0.4;
      this.active.push(o);
    }
    if (this.portrait) {
      this.camera.position.set(this.x * 0.6, 4.2, this.dist - 6.5);
      this.camera.lookAt(this.x * 0.6, -1.2, this.dist + 6);
    } else {
      this.camera.position.set(this.x * 0.7, 2.6, this.dist - 5.2);
      this.camera.lookAt(this.x * 0.7, 0.9, this.dist + 6);
    }
    this.kaloy.setEmote(s.kaloy.atlasCol, s.kaloy.atlasRow);
    this.kaloy.update(dt, t);
  }

  onEvent(e: GameEvent) { if (e.type === 'DELIVERY_BUMP') this.shake = 1; }
}

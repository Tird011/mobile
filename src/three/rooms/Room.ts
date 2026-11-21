import * as THREE from 'three';
import type { GameEvent, Snapshot } from '../../engine/types';
import { loadModel, type ModelId } from '../assets';
import { addLights, toonify } from '../toon';

const FOOD_NODE: Record<string, string> = {
  lomi_batangas: 'LomiBowl', lomi_overload: 'LomiBowl', tapsilog: 'TapsilogPlate', chicken_chami: 'ChamiPlate', lumpiang_shanghai: 'ShanghaiPlate',
};

/**
 * One 3D room. Each subclass loads its Blender environment, places characters and props from the
 * latest Java snapshot, and animates between snapshots.
 */
export abstract class Room {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.05, 200);
  ready = false;

  constructor(background: number) {
    this.scene.background = new THREE.Color(background);
    addLights(this.scene);
  }

  abstract build(): Promise<void>;
  abstract update(s: Snapshot, dt: number, t: number): void;
  onEvent(_e: GameEvent): void {}
  /** The player just made a gesture (for instant feedback before the next snapshot arrives). */
  onLocalInput(_type: string): void {}

  private cams: { land?: [THREE.Vector3, THREE.Vector3]; port?: [THREE.Vector3, THREE.Vector3] } = {};
  protected portrait = false;

  /** Camera for landscape and for portrait phones (where the bottom panel covers ~40% of the screen). */
  protected setCameras(land: [number[], number[]], port: [number[], number[]]) {
    const v = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2]);
    this.cams = { land: [v(land[0]), v(land[1])], port: [v(port[0]), v(port[1])] };
    this.applyCamera();
  }
  private applyCamera() {
    const c = this.portrait ? this.cams.port : this.cams.land;
    if (!c) return;
    this.camera.position.copy(c[0]);
    this.camera.lookAt(c[1]);
  }

  setAspect(aspect: number) {
    this.camera.aspect = aspect;
    this.portrait = aspect < 0.8;
    this.camera.fov = this.portrait ? 60 : 45;
    this.camera.updateProjectionMatrix();
    this.applyCamera();
  }

  protected async env(id: ModelId, skip: RegExp = /^(Floor|Ground|Asphalt|Grass|Sidewalk|BackWall|Wall)/) {
    const g = (await loadModel(id)).scene.clone(true);
    toonify(g, { outline: 0.012, skipOutline: (n) => skip.test(n) });
    this.scene.add(g);
    return g;
  }

  /** A fresh copy of a food prop from food.glb, centred at the origin. */
  protected async food(dish: string): Promise<THREE.Object3D | null> {
    const node = FOOD_NODE[dish] ?? dish;
    const src = (await loadModel('food')).scene.getObjectByName(node);
    if (!src) return null;
    const o = src.clone(true);
    o.position.set(0, 0, 0);
    toonify(o, { outline: 0.006 });
    return o;
  }
}

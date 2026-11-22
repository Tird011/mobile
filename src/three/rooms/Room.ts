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

  // ------------------------------------------------------------------ camera director
  // Each room has an overview shot plus close-ups that follow the action. The camera glides between
  // them (and breathes a little) so the room always feels alive.
  private overview?: { land: [THREE.Vector3, THREE.Vector3]; port: [THREE.Vector3, THREE.Vector3] };
  private wantPos = new THREE.Vector3(0, 3, 6);
  private wantLook = new THREE.Vector3();
  private curLook = new THREE.Vector3();
  private camInit = false;
  private focusUntil = 0;
  protected portrait = false;

  /** The wide shot for landscape and for portrait phones (where the bottom panel covers ~40% of the screen). */
  protected setCameras(land: [number[], number[]], port: [number[], number[]]) {
    const v = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2]);
    this.overview = { land: [v(land[0]), v(land[1])], port: [v(port[0]), v(port[1])] };
    this.wide();
  }

  /** Go back to the wide shot. */
  protected wide() {
    if (!this.overview) return;
    const c = this.portrait ? this.overview.port : this.overview.land;
    this.wantPos.copy(c[0]); this.wantLook.copy(c[1]);
  }

  /**
   * Close-up on a point. dist/height/side are the camera offset in landscape; portrait backs off a bit
   * and aims lower so the subject sits above the control panel.
   */
  protected focus(p: THREE.Vector3, dist = 1.6, height = 1.2, side = 0, holdSeconds = 0) {
    if (this.portrait) {
      this.wantPos.set(p.x + side * 0.6, p.y + height * 1.5 + 0.4, p.z + dist * 1.35 + 0.4);
      this.wantLook.set(p.x, p.y - (height + dist) * 0.38, p.z);
    } else {
      this.wantPos.set(p.x + side, p.y + height, p.z + dist);
      this.wantLook.copy(p);
    }
    if (holdSeconds > 0) this.focusUntil = this.clock + holdSeconds;
  }
  /** True while a timed close-up (e.g. "customer ordered") is still playing. */
  protected get holdingFocus() { return this.clock < this.focusUntil; }
  private clock = 0;

  protected updateCamera(dt: number, t: number) {
    this.clock = t;
    const k = this.camInit ? 1 - Math.exp(-dt * 2.6) : 1;
    this.camInit = true;
    this.camera.position.lerp(this.wantPos, k);
    this.curLook.lerp(this.wantLook, k);
    const breathe = new THREE.Vector3(Math.sin(t * 0.37) * 0.06, Math.sin(t * 0.53) * 0.04, 0);
    this.camera.position.add(breathe);
    this.camera.lookAt(this.curLook);
    this.camera.position.sub(breathe);
  }

  setAspect(aspect: number) {
    this.camera.aspect = aspect;
    this.portrait = aspect < 0.8;
    this.camera.fov = this.portrait ? 60 : 45;
    this.camera.updateProjectionMatrix();
    this.wide();
  }

  /** A copy of a prop from props.glb (onion, ladle, rag...), centred. */
  protected async prop(name: string): Promise<THREE.Object3D | null> {
    const src = (await loadModel('props')).scene.getObjectByName(name);
    if (!src) return null;
    const o = src.clone(true);
    o.position.set(0, 0, 0);
    toonify(o, { outline: 0.006 });
    return o;
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

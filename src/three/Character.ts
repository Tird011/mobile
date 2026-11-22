import * as THREE from 'three';
import { FACE_ATLAS, loadModel, loadTexture, type ModelId } from './assets';
import { FACE_MATERIALS, mergeStatic, toonify } from './toon';

const EMOTION_COLORS: Record<string, number> = {
  DELIGHTED: 0x3fbf5f, HAPPY: 0x8fd16a, NEUTRAL: 0xf5c84a, IMPATIENT: 0xf08a2c, ANGRY: 0xe0413d,
};

let atlas: Promise<THREE.Texture> | null = null;
function faceAtlas() { return (atlas ??= loadTexture(FACE_ATLAS)); }

export type Pose = 'idle' | 'walk' | 'sit' | 'eat' | 'wave' | 'work' | 'stir' | 'chop' | 'fan' | 'ride' | 'wipe' | 'scrub' | 'sweep' | 'carry';

/**
 * One animated character: a clone of a Blender GLB with procedural animation (bobbing, walking,
 * arm swings) because the models are rigid parts. Mang Kaloy also gets his drawn face swapped from the atlas.
 */
export class Character {
  readonly root = new THREE.Group();
  private model!: THREE.Object3D;
  private head?: THREE.Object3D;
  private armL?: THREE.Object3D;
  private armR?: THREE.Object3D;
  private faceTex?: THREE.Texture;
  private bubble?: THREE.Group;
  private bubbleBall?: THREE.Mesh;
  private patienceBar?: THREE.Mesh;
  private target = new THREE.Vector3();
  private tmpD = new THREE.Vector3();
  private facing = 0;
  pose: Pose = 'idle';
  private poseTime = 0;
  private workPulse = 0;
  speed = 1.8;
  arrived = true;

  static async create(id: ModelId, opts: { bubble?: boolean } = {}) {
    const c = new Character();
    const gltf = await loadModel(id);
    c.model = gltf.scene.clone(true);
    mergeStatic(c.model, /^(Head|ArmL|ArmR|Face|Hand|Leg)/, /^$/);   // one draw call per colour for the body
    toonify(c.model, { outline: 0.012 });
    c.root.add(c.model);
    c.head = c.model.getObjectByName('Head') ?? undefined;
    c.armL = c.model.getObjectByName('ArmL') ?? undefined;
    c.armR = c.model.getObjectByName('ArmR') ?? undefined;
    const face = c.model.getObjectByName('Face') as THREE.Mesh | undefined;
    if (face) {
      const base = await faceAtlas();
      const t = base.clone();
      t.flipY = false;
      t.repeat.set(0.25, 0.5);
      t.needsUpdate = true;
      c.faceTex = t;
      const fm = new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.5 });
      FACE_MATERIALS.add(fm);
      face.material = fm;
      face.renderOrder = 2;
      c.setEmote(1, 0);
    }
    if (opts.bubble) c.makeBubble();
    return c;
  }

  private makeBubble() {
    const g = new THREE.Group();
    this.bubbleBall = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshBasicMaterial({ color: EMOTION_COLORS.HAPPY }));
    const bg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.02), new THREE.MeshBasicMaterial({ color: 0x3a2a2a }));
    this.patienceBar = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.045, 0.03), new THREE.MeshBasicMaterial({ color: 0x8fd16a }));
    bg.position.y = -0.16; this.patienceBar.position.y = -0.16;
    g.add(this.bubbleBall, bg, this.patienceBar);
    g.position.y = 1.55;
    this.bubble = g;
    this.root.add(g);
  }

  private held: THREE.Object3D | null = null;
  /** Put a prop (rag, ladle, broom, tray...) in the right hand. Props are modelled in metres. */
  hold(prop: THREE.Object3D | null) {
    if (this.held === prop) return;
    if (this.held) this.held.removeFromParent();
    this.held = prop;
    if (!prop || !this.armR) return;
    this.root.updateMatrixWorld(true);
    const ws = new THREE.Vector3();
    this.armR.getWorldScale(ws);
    prop.scale.setScalar(1 / Math.max(ws.x, 1e-3));
    prop.position.set(-0.26, -0.85, 0.25);
    this.armR.add(prop);
  }
  get holding() { return this.held; }

  setEmote(col: number, row: number) {
    if (this.faceTex) this.faceTex.offset.set(col * 0.25, row * 0.5);
  }

  setMood(emotion: string, patience: number, showBar: boolean) {
    if (!this.bubble) return;
    (this.bubbleBall!.material as THREE.MeshBasicMaterial).color.setHex(EMOTION_COLORS[emotion] ?? 0xffffff);
    const p = Math.max(0.02, Math.min(1, patience));
    this.patienceBar!.scale.x = p;
    this.patienceBar!.position.x = -0.24 * (1 - p);
    (this.patienceBar!.material as THREE.MeshBasicMaterial).color.setHex(p > 0.5 ? 0x8fd16a : p > 0.25 ? 0xf5c84a : 0xe0413d);
    this.patienceBar!.visible = showBar;
    this.patienceBar!.parent!.children[1].visible = showBar;
  }
  showBubble(v: boolean) { if (this.bubble) this.bubble.visible = v; }

  place(x: number, y: number, z: number, facing?: number) {
    this.root.position.set(x, y, z);
    this.target.set(x, y, z);
    if (facing !== undefined) { this.facing = facing; this.root.rotation.y = facing; }
    this.arrived = true;
  }
  walkTo(x: number, y: number, z: number, faceWhenArrived?: number) {
    if ((this.target.x - x) ** 2 + (this.target.y - y) ** 2 + (this.target.z - z) ** 2 < 1e-4) return;
    this.target.set(x, y, z);
    this.arrived = false;
    if (faceWhenArrived !== undefined) this.facing = faceWhenArrived;
  }
  setPose(p: Pose) { if (p !== this.pose) { this.pose = p; this.poseTime = 0; } }
  /** A quick motion burst (chop, wipe, scrub) on player input. */
  pulse() { this.workPulse = 1; }

  update(dt: number, t: number) {
    this.poseTime += dt;
    this.workPulse = Math.max(0, this.workPulse - dt * 3);
    const pos = this.root.position;
    const d = this.tmpD.subVectors(this.target, pos);
    const dist = d.length();
    let walking = false;
    if (dist > 0.02) {
      const step = Math.min(dist, this.speed * dt);
      pos.addScaledVector(d.normalize(), step);
      const want = Math.atan2(d.x, d.z);
      this.root.rotation.y = lerpAngle(this.root.rotation.y, want, Math.min(1, dt * 10));
      walking = true;
    } else {
      this.arrived = true;
      this.root.rotation.y = lerpAngle(this.root.rotation.y, this.facing, Math.min(1, dt * 6));
    }
    const pose = walking ? 'walk' : this.pose;
    const m = this.model;
    m.position.y = 0;
    m.rotation.z = 0;
    let al = 0, ar = 0, headTilt = Math.sin(t * 1.3) * 0.04;
    switch (pose) {
      case 'walk':
        m.position.y = Math.abs(Math.sin(t * 9)) * 0.05;
        m.rotation.z = Math.sin(t * 9) * 0.05;
        al = Math.sin(t * 9) * 0.6; ar = -al;
        break;
      case 'idle':
        m.position.y = Math.sin(t * 2.2) * 0.012;
        break;
      case 'sit':
        m.position.y = -0.18;
        break;
      case 'eat':
        m.position.y = -0.18;
        ar = -1.0 - Math.max(0, Math.sin(t * 3.2)) * 0.8; al = -0.5;
        headTilt = Math.sin(t * 3.2) * 0.06;
        break;
      case 'wipe':
        ar = -1.3 + Math.sin(t * 9) * 0.35 - this.workPulse * 0.3; al = -0.6;
        if (this.armR) this.armR.rotation.z = Math.cos(t * 9) * 0.35;
        break;
      case 'scrub':
        ar = -1.2 + Math.sin(t * 14) * 0.25; al = -1.1 + Math.cos(t * 14) * 0.2;
        break;
      case 'sweep':
        ar = -0.5 + Math.sin(t * 4) * 0.5; al = -0.4 + Math.sin(t * 4) * 0.5;
        m.rotation.y = Math.sin(t * 4) * 0.15;
        break;
      case 'carry':
        ar = -1.5; al = -1.5;
        m.position.y = Math.abs(Math.sin(t * 9)) * 0.03;
        break;
      case 'wave':
        ar = 0; al = -2.4 + Math.sin(t * 12) * 0.4;
        if (this.poseTime > 1.6) this.pose = 'idle';
        break;
      case 'work':
        al = -0.9 - this.workPulse * 0.9 + Math.sin(t * 3) * 0.1; ar = -0.9 + this.workPulse * 0.6;
        break;
      case 'chop':
        ar = -1.2 - this.workPulse * 1.0; al = -0.4;
        break;
      case 'stir':
        ar = -1.1 + Math.sin(t * 8) * 0.25; al = -0.5 + Math.cos(t * 8) * 0.15;
        break;
      case 'fan':
        al = -1.6 + Math.sin(t * 16) * 0.5 * (0.3 + this.workPulse); ar = -0.4;
        break;
      case 'ride':
        al = -1.2; ar = -1.2; m.position.y = Math.sin(t * 20) * 0.01;
        break;
    }
    if (pose !== 'wipe' && this.armR) this.armR.rotation.z = 0;
    if (pose !== 'sweep') m.rotation.y = 0;
    if (this.armL) this.armL.rotation.x = al;
    if (this.armR) this.armR.rotation.x = ar;
    if (this.head) this.head.rotation.z = headTilt;
    if (this.bubble) this.bubble.position.y = 1.55 + Math.sin(t * 3) * 0.03;
  }

  dispose() { this.root.removeFromParent(); }
}

function lerpAngle(a: number, b: number, k: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

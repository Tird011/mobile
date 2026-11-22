import * as THREE from 'three';

type Shape = 'sphere' | 'box' | 'octa';
const GEO: Record<Shape, THREE.BufferGeometry> = {
  sphere: new THREE.SphereGeometry(1, 8, 6), box: new THREE.BoxGeometry(1, 1, 1), octa: new THREE.OctahedronGeometry(1),
};

/**
 * Object pool for little effect meshes (steam, sparks, bubbles, dropped ingredients). Meshes and their
 * materials are created once and recycled, so cooking at full speed never allocates or compiles anything.
 * `size` is stored in userData.s; scale the mesh relative to it.
 */
export class MeshPool {
  private free: THREE.Mesh[] = [];
  private live = 0;
  constructor(private scene: THREE.Object3D, private cap = 180) {}

  get(shape: Shape, color: number, size: number, opts: { lit?: boolean; opacity?: number } = {}): THREE.Mesh {
    const lit = !!opts.lit;
    let i = this.free.findIndex((m) => m.userData.shape === shape && m.userData.lit === lit);
    let m: THREE.Mesh;
    if (i >= 0) { m = this.free[i]; this.free.splice(i, 1); }
    else {
      const mat = lit ? new THREE.MeshToonMaterial({ color }) : new THREE.MeshBasicMaterial({ color, transparent: true });
      m = new THREE.Mesh(GEO[shape], mat);
      m.userData.shape = shape; m.userData.lit = lit;
      m.frustumCulled = false;
    }
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.color.setHex(color);
    mat.opacity = opts.opacity ?? 1;
    mat.transparent = !lit;
    m.userData.s = size;
    m.scale.setScalar(size); m.rotation.set(0, 0, 0);
    m.visible = true;
    this.scene.add(m);
    this.live++;
    return m;
  }

  release(m: THREE.Mesh) {
    m.visible = false;
    m.removeFromParent();
    this.live--;
    if (this.free.length < this.cap) this.free.push(m);
    else (m.material as THREE.Material).dispose();
  }
}

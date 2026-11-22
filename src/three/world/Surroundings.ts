import * as THREE from 'three';
import { glowMaterial, toonMaterial } from '../toon';
import { FOLIAGE, loadKit, type KitPiece } from './Kit';

export type RoomName = 'title' | 'counter' | 'kitchen' | 'diner' | 'hub';
type Rect = [number, number, number, number];   // x0, z0, x1, z1

function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const inside = (r: Rect, x: number, z: number, pad = 0) => x > r[0] - pad && x < r[2] + pad && z > r[1] - pad && z < r[3] + pad;

/**
 * Collects placements of kit pieces, then builds one InstancedMesh per piece (plus its night glow).
 * Wires between power poles are generated as sagging catenaries.
 */
export class Scatter {
  private items = new Map<KitPiece, THREE.Matrix4[]>();
  private wires: number[] = [];
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private up = new THREE.Vector3(0, 1, 0);

  add(piece: KitPiece, x: number, z: number, rotY = 0, s = 1, y = 0) {
    const list = this.items.get(piece) ?? [];
    this.q.setFromAxisAngle(this.up, rotY);
    list.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(s, s, s)));
    this.items.set(piece, list);
    return this;
  }

  /** A row of power poles with drooping wires between them: the most Filipino street detail there is. */
  poles(x0: number, x1: number, z: number, step = 9, along: 'x' | 'z' = 'x') {
    const tops: THREE.Vector3[] = [];
    for (let a = x0; a <= x1 + 0.01; a += step) {
      const [x, zz] = along === 'x' ? [a, z] : [z, a];
      this.add('PowerPole', x, zz, along === 'x' ? 0 : Math.PI / 2);
      tops.push(new THREE.Vector3(x, 0, zz));
    }
    const offs = [-0.95, -0.35, 0.35, 0.95];
    for (let i = 0; i < tops.length - 1; i++) {
      for (const [k, o] of offs.entries()) {
        const a = tops[i], b = tops[i + 1];
        const h = 7.14 - (k % 2) * 0.05, sag = 0.55 + (k % 3) * 0.15;
        const dx = along === 'x' ? 0 : o, dz = along === 'x' ? o : 0;
        for (let s = 0; s < 10; s++) {
          const u0 = s / 10, u1 = (s + 1) / 10;
          const y0 = h - sag * 4 * u0 * (1 - u0), y1 = h - sag * 4 * u1 * (1 - u1);
          this.wires.push(a.x + (b.x - a.x) * u0 + (along === 'x' ? 0 : dx), y0, a.z + (b.z - a.z) * u0 + dz,
            a.x + (b.x - a.x) * u1 + (along === 'x' ? 0 : dx), y1, a.z + (b.z - a.z) * u1 + dz);
        }
      }
    }
    return this;
  }

  /** Only pieces within this radius of the room cast shadows (the shadow map only covers the room anyway). */
  shadowRadius = 16;
  shadowCenter = new THREE.Vector3();

  async build(parent: THREE.Object3D) {
    const kit = await loadKit();
    const glowMat = glowMaterial(0xffffff, 0.6); glowMat.vertexColors = true;
    const p = new THREE.Vector3();
    for (const [piece, all] of this.items) {
      const b = kit.get(piece);
      if (!b) continue;
      const foliage = FOLIAGE.has(piece);
      const mat = toonMaterial(new THREE.Color(1, 1, 1), 'kit', { vertexColors: true, foliage, rim: foliage ? 1.3 : 1 });
      const casts = piece !== 'Grass' && piece !== 'Flowers' && piece !== 'Taal' && piece !== 'Hill';
      // split into near (casts shadows) and far (doesn't): fewer shadow-pass triangles, tighter culling spheres
      const near = all.filter((m) => p.setFromMatrixPosition(m).distanceTo(this.shadowCenter) < this.shadowRadius);
      const far = all.filter((m) => !near.includes(m));
      for (const [list, cast] of [[near, casts], [far, false]] as [THREE.Matrix4[], boolean][]) {
        if (!list.length) continue;
        const im = new THREE.InstancedMesh(b.body, mat, list.length);
        list.forEach((m, i) => im.setMatrixAt(i, m));
        im.castShadow = cast;
        im.receiveShadow = true;
        im.computeBoundingSphere();
        im.name = 'kit_' + piece;
        parent.add(im);
      }
      const list = all;
      if (b.glow) {
        const g = new THREE.InstancedMesh(b.glow, glowMat, list.length);
        list.forEach((m, i) => g.setMatrixAt(i, m));
        g.computeBoundingSphere();
        parent.add(g);
      }
    }
    if (this.wires.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.wires, 3));
      parent.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2a2630 })));
    }
    return parent;
  }
}

// ------------------------------------------------------------------------------------------- shared helpers
function flat(color: string, w: number, d: number, x: number, z: number, y = -0.03, rotY = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), toonMaterial(new THREE.Color(color), 'flat' + color, { rim: 0 }));
  m.rotation.set(-Math.PI / 2, 0, rotY); m.position.set(x, y, z);
  m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix();
  return m;
}

/** A barangay street along X at depth z: asphalt, sidewalk, centre dashes, houses across, poles and wires near side. */
function street(g: THREE.Group, sc: Scatter, R: () => number, z: number, x0: number, x1: number, opts: { houses?: boolean; facing?: 1 | -1 } = {}) {
  const w = x1 - x0, cx = (x0 + x1) / 2;
  const f = opts.facing ?? 1;            // +1: the far side is at -Z (houses face +Z toward us)
  g.add(flat('#5d6070', w, 6.2, cx, z, -0.035), flat('#c9c2b6', w, 1.6, cx, z + 3.9 * f, -0.025), flat('#c9c2b6', w, 1.6, cx, z - 3.9 * f, -0.025));
  for (let x = x0 + 1; x < x1; x += 3) g.add(flat('#efe6c8', 1.4, 0.14, x, z, -0.02));
  sc.poles(x0 + 4, x1 - 4, z + 3.6 * f, 9);
  if (opts.houses !== false) {
    const kinds: KitPiece[] = ['HouseMint', 'HousePeach', 'SariSari', 'HouseBlue', 'HouseBato', 'HousePeach', 'HouseMint'];
    let x = x0 + 3 + R() * 2, i = Math.floor(R() * kinds.length);
    while (x < x1 - 3) {
      const k = kinds[i++ % kinds.length];
      const hz = z - (6.6 + R() * 0.6) * f;
      sc.add(k, x, hz, f > 0 ? 0 : Math.PI);
      if (k !== 'SariSari' && R() < 0.75) sc.add('Parol', x + 0.1, hz + 2.3 * f, 0, 1, 1.75);
      if (R() < 0.6) sc.add(R() < 0.5 ? 'Bougainvillea' : 'Santan', x + 2.6, hz + 1.9 * f, R() * 6, 0.9 + R() * 0.3);
      // backyard trees peeking over the roofs
      if (R() < 0.7) sc.add(R() < 0.5 ? 'TreeMango' : 'Palm', x + (R() - 0.5) * 4, hz - (4 + R() * 3) * f, R() * 6, 0.9 + R() * 0.4);
      x += 5.2 + R() * 1.6;
    }
    for (let x = x0 + 6; x < x1 - 6; x += 14 + R() * 6) sc.add('LampPost', x, z - 3.5 * f, f > 0 ? Math.PI / 2 : -Math.PI / 2);
  }
}

/** Fill a band with trees, bushes, flowers and grass, avoiding the given rectangles. */
function nature(sc: Scatter, R: () => number, area: Rect, avoid: Rect[], n: number, tall = true) {
  const kinds: [KitPiece, number, number][] = tall
    ? [['TreeMango', 0.12, 1.0], ['TreeAcacia', 0.05, 0.9], ['Palm', 0.12, 1.0], ['Banana', 0.12, 1.0], ['BushBig', 0.12, 1.0], ['Bush', 0.14, 1.0], ['Bougainvillea', 0.06, 1.0], ['Rock', 0.06, 1.0], ['Grass', 0.15, 1.2], ['Flowers', 0.06, 1.0]]
    : [['Bush', 0.25, 0.9], ['Santan', 0.12, 1.0], ['Rock', 0.1, 0.8], ['Grass', 0.35, 1.2], ['Flowers', 0.18, 1.0]];
  const total = kinds.reduce((a, k) => a + k[1], 0);
  for (let i = 0; i < n; i++) {
    const x = area[0] + R() * (area[2] - area[0]), z = area[1] + R() * (area[3] - area[1]);
    if (avoid.some((r) => inside(r, x, z, 0.8))) continue;
    let pick = R() * total, k = kinds[0];
    for (const kk of kinds) { pick -= kk[1]; if (pick <= 0) { k = kk; break; } }
    sc.add(k[0], x, z, R() * Math.PI * 2, k[2] * (0.8 + R() * 0.45));
  }
}

function lake(x: number, z: number, r: number) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 48), toonMaterial(new THREE.Color('#5f9fd2'), 'lake', { rim: 2.5 }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, -0.045, z);
  m.receiveShadow = false; m.matrixAutoUpdate = false; m.updateMatrix();
  return m;
}

/**
 * The world outside each room. Coordinates are three.js room space (see blender/environments.py for the rooms).
 * The aim is "no dead space": wherever the camera can see past a wall or through a window there is a street,
 * a garden, houses with parols, power lines, trees, the hills, and Taal volcano on its lake far away.
 */
export async function buildSurroundings(room: RoomName, scene: THREE.Object3D) {
  const g = new THREE.Group(); g.name = 'Surroundings';
  const sc = new Scatter();
  const R = rng({ title: 1, counter: 2, kitchen: 3, diner: 4, hub: 5 }[room]);
  switch (room) {
    case 'counter':
    case 'diner': {
      const back = room === 'counter' ? -4.6 : -4.7, half = room === 'counter' ? 4.4 : 4.7, front = room === 'counter' ? 4.7 : 3.6;
      const bldg: Rect = [-half - 0.3, back - 0.3, half + 0.3, front + 0.3];
      street(g, sc, R, back - 7, -46, 46);
      // side gardens with a bamboo fence, and low flowers in front (the camera is there)
      for (const s of [-1, 1]) {
        for (let z = back + 1; z < front; z += 2) sc.add('Fence', s * (half + 3.6), z, Math.PI / 2);
        nature(sc, R, s < 0 ? [-26, back - 2.5, -half - 0.5, front + 6] : [half + 0.5, back - 2.5, 26, front + 6], [bldg], 45);
      }
      nature(sc, R, [-12, front + 0.6, 12, front + 14], [bldg], 50, false);
      nature(sc, R, [-60, back - 30, 60, back - 16], [], 55);
      sc.add('TreeAcacia', -half - 4.5, back - 1.2, 0.4, 1.1).add('Palm', half + 2.2, back - 0.8, 2, 1.05).add('Banana', half + 1.4, front - 1, 1).add('Hoop', -half - 2.3, front + 2.5, -0.6);
      const y = room === 'counter' ? 3.2 : 3.05;
      // pendant lamps hang only where they don't block the camera
      const pend: [number, number][] = room === 'counter' ? [[-3.2, 3.6], [3.1, -3.3]] : [[-1.5, -2.8], [1.5, -2.8]];
      for (const [x, z] of pend) sc.add('Pendant', x, z, 0, 0.75, y);
      break;
    }
    case 'kitchen': {
      // the yard behind the kitchen window: banana plants, laundry, a mango tree, a kubo and the hills
      const bldg: Rect = [-3.8, -1.8, 3.8, 3];
      sc.add('Banana', 2.0, -3.2, 0.3, 1.15).add('Banana', 3.6, -4.0, 2.0, 0.95).add('Clothesline', 1.8, -6.2, 0.15)
        .add('TreeMango', 5.0, -9.5, 0.5, 1.2).add('Kubo', -2.0, -10.5, 0.4).add('Palm', -5.5, -6.5, 1.0, 1.1).add('Bougainvillea', 4.8, -2.6, 0, 1.1)
        .add('Pendant', 0.9, -0.8, 0, 1, 3.05).add('Pendant', -1.4, -0.6, 0, 1, 3.05);
      nature(sc, R, [-30, -40, 30, -2.4], [bldg, [0, -7, 3.8, -5.5]], 110);
      nature(sc, R, [-14, -2, 14, 8], [bldg], 50);
      sc.poles(-30, 30, -14, 10);
      break;
    }
    case 'hub': {
      const yard: Rect = [-5.2, -3.6, 5.2, 4.2];
      street(g, sc, R, -12, -50, 50);
      sc.add('TreeAcacia', 3.8, -5.0, 2.6, 1.15).add('Palm', -4.2, -4.6, 0.4, 1.1).add('Banana', -6.0, -2.2, 1).add('Banana', 6.2, 1.5, 2)
        .add('Kubo', -9.5, -1.0, 1.2).add('SariSari', 9.0, 1.0, -Math.PI / 2).add('Clothesline', -8.0, 3.5, 1.4).add('LampPost', 5.6, 3.6, Math.PI)
        .add('StringLights', 0.6, 3.8, 0, 0.82, -0.3);
      nature(sc, R, [-30, -8, 30, 16], [yard, [6.5, -1, 12, 3], [-12, -3, -7, 1]], 110);
      g.add(flat('#d8c9a6', 4.0, 30, 0, 18, -0.03));   // dirt path toward the camera
      sc.add('Taal', -28, -118, 0.3, 6.5); g.add(lake(-28, -118, 64));
      break;
    }
    case 'title': {
      const lot: Rect = [-6.2, -5.2, 6.2, 5.2];
      g.add(flat('#5d6070', 90, 6.2, 0, 9.4, -0.035), flat('#c9c2b6', 90, 1.4, 0, 5.9, -0.03));
      for (let x = -44; x < 44; x += 3) g.add(flat('#efe6c8', 1.4, 0.14, x, 9.4, -0.02));
      sc.poles(-40, 40, -9.5, 10).add('LampPost', -3.6, 3.2, Math.PI / 2).add('LampPost', 3.7, 2.6, -Math.PI / 2)
        .add('StringLights', 0, 3.4, 0, 1.15, -0.1)
        .add('TreeAcacia', -5.4, -4.6, 0.6, 1.35).add('Palm', 5.2, -3.6, 2.2, 1.15).add('Palm', 6.4, -1.2, 0.9, 1.0).add('Bougainvillea', -5.2, 3.6, 0, 1.2)
        .add('Banana', 5.3, 3.1, 1.7).add('Santan', 3.8, 4.4, 0.7).add('Flowers', -3.6, 4.4, 0).add('Flowers', 1.6, 4.5, 2).add('Parol', -2.25, 2.2, 0, 0.75, 2.05).add('Parol', 2.25, 2.2, 0.3, 0.75, 2.05);
      for (const [x, z, k] of [[-14, -7, 'HouseBato'], [-8, -16, 'HouseMint'], [10, -12, 'HousePeach'], [16, -5, 'SariSari'], [-17, 2, 'HouseBlue']] as [number, number, KitPiece][]) sc.add(k, x, z, Math.atan2(-x, -z) * 0.2);
      nature(sc, R, [-40, -45, 40, 4], [lot, [-16, -9, -12, -5], [-10, -18, -6, -14], [8, -14, 12, -10], [14, -7, 18, -3], [-19, 0, -15, 4]], 160);
      nature(sc, R, [-30, 12.5, 30, 30], [], 60);
      sc.add('Taal', 34, -122, 0.2, 7); g.add(lake(34, -122, 70));
      sc.add('Hill', -40, -70, 0.5, 2.6).add('Hill', 55, -60, 2.0, 2.2);
      break;
    }
  }
  await sc.build(g);
  g.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); });
  g.updateMatrixWorld(true);
  scene.add(g);
  return g;
}

/** Roadside scenery for one 30 m road tile of the delivery run (it recycles with the tile). */
export async function buildRoadside(tile: THREE.Object3D, seed: number) {
  const g = new THREE.Group();
  const sc = new Scatter();
  const R = rng(100 + seed);
  for (const s of [-1, 1]) {
    for (let z = 2; z < 30; z += 6 + R() * 4) {
      const pick = R();
      const x = s * (12 + R() * 6);
      if (pick < 0.35) sc.add((['HouseMint', 'HousePeach', 'HouseBlue', 'HouseBato', 'Kubo'] as KitPiece[])[Math.floor(R() * 5)], x, z, s > 0 ? -Math.PI / 2 : Math.PI / 2);
      else if (pick < 0.6) sc.add('TreeAcacia', x + s * 3, z, R() * 6, 0.9 + R() * 0.4);
      else sc.add('TreeMango', x, z, R() * 6, 0.9 + R() * 0.3);
    }
    nature(sc, R, s < 0 ? [-40, 0, -11, 30] : [11, 0, 40, 30], [], 40);
    sc.add('Grass', s * 7.6, R() * 30, 0, 1.2).add('Flowers', s * 7.8, R() * 30, 0);
  }
  sc.poles(2, 29, 5.7, 9, 'z');
  await sc.build(g);
  // the road tile runs along +Z from 0 to 30 in Blender's -Y; the tile model was authored to sit at z 0..30
  tile.add(g);
  return g;
}

/** Things so far away they should never get closer while riding: Taal on its lake and a few big hills. */
export async function buildFarRoad() {
  const g = new THREE.Group();
  const sc = new Scatter();
  sc.add('Taal', 40, 160, 3.1, 7.5).add('Hill', -60, 120, 0.4, 2.8).add('Hill', 80, 110, 1.4, 2.4);
  g.add(lake(40, 160, 72));
  await sc.build(g);
  return g;
}

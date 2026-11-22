import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadModel } from '../assets';

export type KitPiece =
  | 'TreeAcacia' | 'TreeMango' | 'Palm' | 'Banana' | 'Bush' | 'BushBig' | 'Bougainvillea' | 'Santan' | 'Flowers' | 'Grass'
  | 'Rock' | 'RockBig' | 'HouseMint' | 'HousePeach' | 'HouseBlue' | 'HouseBato' | 'Kubo' | 'SariSari' | 'PowerPole'
  | 'LampPost' | 'StringLights' | 'Parol' | 'Fence' | 'Hoop' | 'Clothesline' | 'Taal' | 'Hill' | 'Pendant';

export const FOLIAGE = new Set<KitPiece>(['TreeAcacia', 'TreeMango', 'Palm', 'Banana', 'Bush', 'BushBig', 'Bougainvillea', 'Santan', 'Flowers', 'Grass', 'Clothesline']);

export type BakedPiece = { body: THREE.BufferGeometry; glow: THREE.BufferGeometry | null; height: number };

/**
 * world_kit.glb, baked for instancing: every piece becomes ONE geometry with its material colours stored as
 * vertex colours (so a whole forest of acacias is a single draw call), plus an optional "glow" geometry for
 * the bulb parts that light up at night.
 */
let baked: Promise<Map<KitPiece, BakedPiece>> | null = null;
export function loadKit() {
  return (baked ??= loadModel('world_kit').then((gltf) => {
    const out = new Map<KitPiece, BakedPiece>();
    gltf.scene.updateMatrixWorld(true);
    for (const node of gltf.scene.children) {
      const body: THREE.BufferGeometry[] = [], glow: THREE.BufferGeometry[] = [];
      const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
      node.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        let g = mesh.geometry.clone();
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld));
        if (g.index) g = g.toNonIndexed();
        for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
        const n = g.attributes.position.count, c = new Float32Array(n * 3), col = mat.color ?? new THREE.Color(1, 1, 1);
        for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
        g.setAttribute('color', new THREE.BufferAttribute(c, 3));
        (/^bulb/i.test(mat.name ?? '') ? glow : body).push(g);
      });
      if (!body.length) continue;
      const b = mergeGeometries(body)!;
      b.computeBoundingBox();
      out.set(node.name as KitPiece, { body: b, glow: glow.length ? mergeGeometries(glow) : null, height: b.boundingBox!.max.y });
    }
    return out;
  }));
}

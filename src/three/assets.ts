import { Asset } from 'expo-asset';
import { Platform } from 'react-native';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** Every model the game uses, built in Blender (see /blender in the repo). */
export const MODELS = {
  mang_kaloy: require('../../assets/models/mang_kaloy.glb'),
  customer_suki: require('../../assets/models/customer_suki.glb'),
  customer_student: require('../../assets/models/customer_student.glb'),
  customer_tita: require('../../assets/models/customer_tita.glb'),
  customer_driver: require('../../assets/models/customer_driver.glb'),
  lomi_house: require('../../assets/models/lomi_house.glb'),
  counter: require('../../assets/models/counter.glb'),
  kitchen: require('../../assets/models/kitchen.glb'),
  diner: require('../../assets/models/diner.glb'),
  hub: require('../../assets/models/hub.glb'),
  road: require('../../assets/models/road.glb'),
  scooter: require('../../assets/models/scooter.glb'),
  jeepney: require('../../assets/models/jeepney.glb'),
  tricycle: require('../../assets/models/tricycle.glb'),
  pothole: require('../../assets/models/pothole.glb'),
  aso: require('../../assets/models/aso.glb'),
  chicken: require('../../assets/models/chicken.glb'),
  food: require('../../assets/models/food.glb'),
  table_set: require('../../assets/models/table_set.glb'),
  decor: require('../../assets/models/decor.glb'),
  neon: require('../../assets/models/neon.glb'),
  props: require('../../assets/models/props.glb'),
  world_kit: require('../../assets/models/world_kit.glb'),
  worker_server: require('../../assets/models/worker_server.glb'),
  worker_cleaner: require('../../assets/models/worker_cleaner.glb'),
  worker_rider: require('../../assets/models/worker_rider.glb'),
  worker_cook: require('../../assets/models/worker_cook.glb'),
} as const;
export type ModelId = keyof typeof MODELS;

export const FACE_ATLAS = require('../../assets/textures/face_atlas.png');

async function readBytes(mod: number): Promise<ArrayBuffer> {
  const asset = Asset.fromModule(mod);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (Platform.OS === 'web' || uri.startsWith('http')) {
    const r = await fetch(uri);
    return r.arrayBuffer();
  }
  const { File } = await import('expo-file-system');
  return new File(uri).arrayBuffer();
}

const cache = new Map<ModelId, Promise<GLTF>>();
const loader = new GLTFLoader();

export function loadModel(id: ModelId): Promise<GLTF> {
  let p = cache.get(id);
  if (!p) {
    p = readBytes(MODELS[id]).then((buf) => new Promise<GLTF>((res, rej) => loader.parse(buf, '', res, rej)));
    cache.set(id, p);
  }
  return p;
}

/** Loads a PNG as a texture. On Android/iOS expo-gl uploads straight from the file (no DOM Image there). */
export async function loadTexture(mod: number): Promise<THREE.Texture> {
  const asset = Asset.fromModule(mod);
  await asset.downloadAsync();
  if (Platform.OS === 'web') {
    const t = await new THREE.TextureLoader().loadAsync(asset.localUri ?? asset.uri);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const t = new THREE.Texture();
  // expo-gl understands { localUri } as pixel data for texImage2D.
  (t as any).image = { data: asset, width: asset.width ?? 2048, height: asset.height ?? 1024 };
  (t as any).isDataTexture = true;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export async function preloadAll(onProgress?: (done: number, total: number) => void) {
  const ids = Object.keys(MODELS) as ModelId[];
  let done = 0;
  await Promise.all(ids.map((id) => loadModel(id).then(() => onProgress?.(++done, ids.length))));
}

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The game's "look": one shared set of uniforms that the day/night cycle drives, and the toon material
 * every mesh uses. The toon shading is a soft two-step terminator (modern Nintendo style rather than hard
 * cel bands), shadows pick up the sky colour from the hemisphere light (so they read blue/purple, never
 * grey), there's a fresnel rim that glows gold at sunset, and foliage sways in the wind.
 */
export const LOOK = {
  uTime: { value: 0 },
  uRimColor: { value: new THREE.Color(1, 0.9, 0.75) },
  uRimStrength: { value: 0.35 },
  uWind: { value: 1 },
  /** Soft shadows of drifting clouds sliding over the ground (0 = off). */
  uCloudShadow: { value: 0.3 },
  uCloudOffset: { value: new THREE.Vector2() },
};

/** Materials that glow at night (lamps, bulbs, capiz, neon, lit windows). Their intensity follows the night factor. */
export const GLOW_MATERIALS = new Set<THREE.MeshBasicMaterial>();
/** Drawn faces (MeshBasic decals) are tinted by the ambient light so they don't stay full-bright at night. */
export const FACE_MATERIALS = new Set<THREE.MeshBasicMaterial>();

type ToonOpts = { vertexColors?: boolean; foliage?: boolean; rim?: number };

function patch(m: THREE.MeshToonMaterial, o: ToonOpts) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = LOOK.uTime;
    sh.uniforms.uRimColor = LOOK.uRimColor;
    sh.uniforms.uRimStrength = LOOK.uRimStrength;
    sh.uniforms.uWind = LOOK.uWind;
    sh.uniforms.uRimScale = { value: o.rim ?? 1 };
    sh.uniforms.uCloudShadow = LOOK.uCloudShadow;
    sh.uniforms.uCloudOffset = LOOK.uCloudOffset;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLkWorld;')
      .replace('#include <fog_vertex>', /* glsl */`
        #include <fog_vertex>
        vec4 lkW = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          lkW = instanceMatrix * lkW;
        #endif
        vLkWorld = ( modelMatrix * lkW ).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', /* glsl */`#include <common>
        varying vec3 vLkWorld; uniform float uCloudShadow; uniform vec2 uCloudOffset;
        float lkHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
        float lkNoise( vec2 p ) {
          vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
          return mix( mix( lkHash( i ), lkHash( i + vec2( 1, 0 ) ), f.x ), mix( lkHash( i + vec2( 0, 1 ) ), lkHash( i + vec2( 1, 1 ) ), f.x ), f.y );
        }
        float lkClouds( vec2 xz ) {
          vec2 p = xz * 0.045 + uCloudOffset;
          float n = lkNoise( p ) * 0.65 + lkNoise( p * 2.3 + 7.1 ) * 0.35;
          return smoothstep( 0.48, 0.72, n );
        }`)
      .replace('#include <lights_fragment_end>', /* glsl */`
        reflectedLight.directDiffuse *= 1.0 - uCloudShadow * lkClouds( vLkWorld.xz );
        #include <lights_fragment_end>`)
      .replace('#include <gradientmap_pars_fragment>', /* glsl */`
        uniform vec3 uRimColor; uniform float uRimStrength; uniform float uRimScale;
        vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
          float d = dot( normal, lightDirection );
          float a = smoothstep( -0.04, 0.08, d );          // the terminator, slightly soft
          float b = smoothstep( 0.42, 0.58, d );           // a second, brighter band facing the light
          return vec3( 0.72 * a + 0.28 * b );
        }`)
      .replace('#include <opaque_fragment>', /* glsl */`
        float rimF = 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );
        rimF = smoothstep( 0.62, 0.92, rimF );
        outgoingLight += uRimColor * rimF * uRimStrength * uRimScale * ( 0.35 + 0.65 * diffuseColor.rgb );
        #include <opaque_fragment>`);
    if (o.foliage) {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;')
        // (runs after the vLkWorld line above was added, so sway also moves the cloud-shadow lookup)
        .replace('#include <begin_vertex>', /* glsl */`
          #include <begin_vertex>
          vec3 swayBase = modelMatrix[3].xyz;
          #ifdef USE_INSTANCING
            swayBase += instanceMatrix[3].xyz;
          #endif
          float swayH = max( position.y, 0.0 );
          float swayK = swayH * swayH * 0.012 * uWind;
          transformed.x += sin( uTime * 1.3 + swayBase.x * 0.7 + swayBase.z * 0.4 + position.y * 0.6 ) * swayK;
          transformed.z += cos( uTime * 1.05 + swayBase.z * 0.6 + position.x * 0.5 ) * swayK * 0.7;`);
    }
  };
  m.customProgramCacheKey = () => `lk-toon-${o.foliage ? 1 : 0}`;
  return m;
}

const toonCache = new Map<string, THREE.MeshToonMaterial>();
export function toonMaterial(color: THREE.Color, key?: string, o: ToonOpts = {}) {
  const k = (key ?? color.getHexString()) + (o.foliage ? ':f' : '') + (o.vertexColors ? ':v' : '') + (o.rim ?? '');
  let m = toonCache.get(k);
  if (!m) {
    m = patch(new THREE.MeshToonMaterial({ color: color.clone(), vertexColors: !!o.vertexColors }), o);
    toonCache.set(k, m);
  }
  return m;
}

/** An emissive-looking material for bulbs and lanterns: dim by day, glowing (and blooming) at night. */
export function glowMaterial(color: THREE.ColorRepresentation, day = 0.55) {
  const m = new THREE.MeshBasicMaterial({ color });
  m.userData.base = new THREE.Color(color);
  m.userData.day = day;
  GLOW_MATERIALS.add(m);
  return m;
}

let glass: THREE.MeshToonMaterial | null = null;
/** Window glass: see-through with a sky-tinted sheen, so the barangay outside shows through. */
function glassMaterial() {
  if (!glass) {
    glass = patch(new THREE.MeshToonMaterial({ color: new THREE.Color('#cfe8ff'), transparent: true, opacity: 0.22, depthWrite: false }), { rim: 2.2 });
  }
  return glass;
}

const outlineCache = new Map<string, THREE.ShaderMaterial>();
export function outlineMaterial(thickness: number) {
  const k = thickness.toFixed(4);
  let m = outlineCache.get(k);
  if (!m) {
    m = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { thickness: { value: thickness }, uInk: LOOK_INK },
      vertexShader: /* glsl */`
        uniform float thickness;
        void main(){
          vec3 p = position + normal * thickness;
          #ifdef USE_INSTANCING
            gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
          #else
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          #endif
        }`,
      fragmentShader: 'uniform vec3 uInk; void main(){ gl_FragColor = vec4(uInk, 1.0); }',
    });
    outlineCache.set(k, m);
  }
  return m;
}
/** Ink colour: warm brown by day, deep indigo at night (black outlines look harsh in a dark scene). */
export const LOOK_INK = { value: new THREE.Color(0.16, 0.1, 0.1) };

const GLOW_NAMES = /^(bulb|capiz|neon|lamp)/i;
const FLOOR_NAMES = /^(Floor|Ground|Asphalt|Grass|Sidewalk|Path|Platform|Dash|Splash|Rug|Mess|Tile)/;

/**
 * Turns the Blender PBR materials into the game's toon look, adds an inverted-hull outline, and sets up
 * shadows (everything receives, solid things cast). Meshes named in `skipOutline` (floors etc.) get no outline.
 */
export function toonify(root: THREE.Object3D, opts: { outline?: number; skipOutline?: (name: string) => boolean; shadows?: boolean } = {}) {
  const outlineWorld = opts.outline ?? 0.009;
  const shadows = opts.shadows ?? true;
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  for (const mesh of meshes) {
    const src = mesh.material as THREE.MeshStandardMaterial;
    if (src.name === 'face') continue;        // handled by the character rig
    const name = src.name ?? '';
    const isFloor = FLOOR_NAMES.test(mesh.name);
    mesh.receiveShadow = shadows;
    mesh.castShadow = shadows && !isFloor;
    if (/^glass/i.test(name)) {
      mesh.material = glassMaterial(); mesh.castShadow = false; mesh.renderOrder = 1;
      continue;
    }
    if (GLOW_NAMES.test(name)) {
      mesh.material = glowMaterial(src.color ?? 0xffffff, /^neon/i.test(name) ? 0.9 : 0.75);
      mesh.castShadow = false;
    } else {
      mesh.material = toonMaterial(src.color ?? new THREE.Color('#ffffff'), name + src.color?.getHexString());
    }
    if (outlineWorld > 0 && !(opts.skipOutline?.(mesh.name) ?? false) && !isFloor) {
      const ws = new THREE.Vector3();
      mesh.getWorldScale(ws);
      const ol = new THREE.Mesh(mesh.geometry, outlineMaterial(outlineWorld / Math.max(ws.x, 1e-3)));
      ol.name = mesh.name + '_outline';
      ol.raycast = () => {};
      ol.castShadow = false; ol.receiveShadow = false;
      mesh.add(ol);
    }
  }
  return root;
}

/** Static scenery never moves: skip its per-frame matrix work. */
export function freeze(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  root.traverse((o) => { o.matrixAutoUpdate = false; });
}

/**
 * Draw-call diet: merges every static mesh of an environment that shares a material into one mesh.
 * Objects matching `keep` (things the game animates or looks up by name, and window panes) stay separate.
 * Rooms go from ~150 meshes (x2 with outlines, x2 again in the shadow pass) to a few dozen.
 */
export function mergeStatic(root: THREE.Object3D, keep: RegExp, skip: RegExp) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; prefix: string; meshes: THREE.Mesh[] }>();
  const kept = (o: THREE.Object3D) => { for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (keep.test(p.name)) return true; return false; };
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material) || kept(m)) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    if (mat.name === 'face' || !m.geometry.attributes.normal) return;
    const floor = FLOOR_NAMES.test(m.name), sk = skip.test(m.name);
    const prefix = floor ? 'Floor~' : sk ? 'Skip~' : 'M~';
    const key = mat.uuid + prefix;
    let g = groups.get(key);
    if (!g) { g = { mat, geos: [], prefix, meshes: [] }; groups.set(key, g); }
    let geo = m.geometry.clone();
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    if (geo.index) geo = geo.toNonIndexed();
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
    g.geos.push(geo); g.meshes.push(m);
  });
  for (const g of groups.values()) {
    if (g.meshes.length < 2) continue;
    const merged = mergeGeometries(g.geos);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, g.mat);
    mesh.name = g.prefix + (g.mat.name || 'mat');
    root.add(mesh);
    for (const m of g.meshes) m.removeFromParent();
  }
  return root;
}

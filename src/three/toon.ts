import * as THREE from 'three';

let gradient: THREE.DataTexture | null = null;
function toonGradient() {
  if (!gradient) {
    gradient = new THREE.DataTexture(new Uint8Array([95, 95, 95, 255, 175, 175, 175, 255, 255, 255, 255, 255]), 3, 1);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
  }
  return gradient;
}

const toonCache = new Map<string, THREE.MeshToonMaterial>();
export function toonMaterial(color: THREE.Color, key?: string) {
  const k = key ?? color.getHexString();
  let m = toonCache.get(k);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color: color.clone(), gradientMap: toonGradient() });
    toonCache.set(k, m);
  }
  return m;
}

const outlineCache = new Map<string, THREE.ShaderMaterial>();
function outlineMaterial(thickness: number) {
  const k = thickness.toFixed(4);
  let m = outlineCache.get(k);
  if (!m) {
    m = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { thickness: { value: thickness } },
      vertexShader: 'uniform float thickness; void main(){ vec3 p = position + normal * thickness; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
      fragmentShader: 'void main(){ gl_FragColor = vec4(0.16, 0.1, 0.1, 1.0); }',
    });
    outlineCache.set(k, m);
  }
  return m;
}

/**
 * Turns the Blender PBR materials into cel-shaded ones and adds an inverted-hull outline,
 * the same look as the concept renders. Meshes named in `skipOutline` (floors etc.) get no outline.
 */
export function toonify(root: THREE.Object3D, opts: { outline?: number; skipOutline?: (name: string) => boolean } = {}) {
  const outlineWorld = opts.outline ?? 0.009;
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  for (const mesh of meshes) {
    const src = mesh.material as THREE.MeshStandardMaterial;
    if (src.name === 'face') continue;        // handled by the character rig
    mesh.material = toonMaterial(src.color ?? new THREE.Color('#ffffff'), src.name + src.color?.getHexString());
    if (outlineWorld > 0 && !(opts.skipOutline?.(mesh.name) ?? false)) {
      const ws = new THREE.Vector3();
      mesh.getWorldScale(ws);
      const ol = new THREE.Mesh(mesh.geometry, outlineMaterial(outlineWorld / Math.max(ws.x, 1e-3)));
      ol.name = mesh.name + '_outline';
      ol.raycast = () => {};
      mesh.add(ol);
    }
  }
  return root;
}

export function addLights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0xffe0d0, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-3, 6, 5);
  scene.add(sun);
}

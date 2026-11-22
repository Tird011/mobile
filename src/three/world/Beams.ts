import * as THREE from 'three';
import type { Lighting } from './DayCycle';

const SHAFT_VS = /* glsl */`
  uniform vec3 uCenter, uRight, uUp, uDir;
  varying vec3 vUVW;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    vUVW = position;
    vec3 w = uCenter + uRight * position.x * ( 1.0 + position.z * 0.25 ) + uUp * position.y * ( 1.0 + position.z * 0.25 ) + uDir * position.z;
    vec4 mvPosition = viewMatrix * vec4( w, 1.0 );
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const SHAFT_FS = /* glsl */`
  uniform vec3 uColor; uniform float uStrength, uTime;
  varying vec3 vUVW;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    float along = 1.0 - vUVW.z;
    float edge = smoothstep( 0.5, 0.28, max( abs( vUVW.x ), abs( vUVW.y ) ) );
    float streak = 0.8 + 0.2 * sin( vUVW.x * 23.0 + vUVW.y * 9.0 + uTime * 0.6 );
    float a = pow( along, 1.6 ) * edge * streak * uStrength;
    gl_FragColor = vec4( uColor * a, 1.0 );
    #include <fog_fragment>
  }`;

const MOTE_VS = /* glsl */`
  uniform float uTime, uSize; attribute float aSeed; varying float vSeed;
  void main() {
    vSeed = aSeed;
    vec3 p = position;
    p.y += mod( uTime * ( 0.04 + aSeed * 0.05 ) + aSeed * 7.0, 2.4 ) - 1.2;
    p.x += sin( uTime * 0.5 + aSeed * 40.0 ) * 0.25;
    p.z += cos( uTime * 0.4 + aSeed * 23.0 ) * 0.25;
    vec4 mv = modelViewMatrix * vec4( p, 1.0 );
    gl_PointSize = uSize * ( 0.6 + aSeed ) / max( 0.5, -mv.z );
    gl_Position = projectionMatrix * mv;
  }`;
const MOTE_FS = /* glsl */`
  uniform vec3 uColor; uniform float uAlpha, uTime, uBlink; varying float vSeed;
  void main() {
    float d = length( gl_PointCoord - 0.5 );
    float a = smoothstep( 0.5, 0.0, d );
    float blink = mix( 1.0, max( 0.0, sin( uTime * ( 1.2 + vSeed * 2.0 ) + vSeed * 50.0 ) ), uBlink );
    gl_FragColor = vec4( uColor * a * uAlpha * blink, 1.0 );
  }`;

/**
 * "God rays" through the windows (additive light prisms that follow the sun) and floating dust motes.
 * Outdoors at night the motes turn into blinking fireflies. All of it is a handful of vertices.
 */
export class Beams {
  private shafts: { mesh: THREE.Mesh; u: Record<string, THREE.IUniform>; outward: THREE.Vector3 }[] = [];
  private motes: THREE.Points;
  private moteU: Record<string, THREE.IUniform>;

  constructor(scene: THREE.Scene, windows: THREE.Object3D[], volume: THREE.Box3, private outdoor = false, moteCount = 90) {
    const geo = Beams.prism();
    for (const w of windows) {
      const box = new THREE.Box3().setFromObject(w);
      const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      // windows are thin panes: the thin axis is the outward normal; outside is away from the room centre
      const thinX = size.x < size.z;
      const outward = thinX ? new THREE.Vector3(Math.sign(c.x) || 1, 0, 0) : new THREE.Vector3(0, 0, Math.sign(c.z) || -1);
      const u: Record<string, THREE.IUniform> = {
        uCenter: { value: c }, uRight: { value: thinX ? new THREE.Vector3(0, 0, size.z) : new THREE.Vector3(size.x, 0, 0) },
        uUp: { value: new THREE.Vector3(0, size.y, 0) }, uDir: { value: new THREE.Vector3(0, -2, 3) },
        uColor: { value: new THREE.Color() }, uStrength: { value: 0 }, uTime: { value: 0 },
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      };
      const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: SHAFT_VS, fragmentShader: SHAFT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true });
      const mesh = new THREE.Mesh(geo, m);
      mesh.frustumCulled = false; mesh.renderOrder = 5;
      scene.add(mesh);
      this.shafts.push({ mesh, u, outward });
    }
    const n = volume.isEmpty() ? 0 : moteCount, pos = new Float32Array(n * 3), seed = new Float32Array(n);
    const sz = volume.getSize(new THREE.Vector3());
    for (let i = 0; i < n; i++) {
      pos[i * 3] = volume.min.x + Math.random() * sz.x; pos[i * 3 + 1] = volume.min.y + Math.random() * sz.y; pos[i * 3 + 2] = volume.min.z + Math.random() * sz.z;
      seed[i] = Math.random();
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.moteU = { uTime: { value: 0 }, uSize: { value: 26 }, uColor: { value: new THREE.Color() }, uAlpha: { value: 0 }, uBlink: { value: 0 } };
    this.motes = new THREE.Points(mg, new THREE.ShaderMaterial({ uniforms: this.moteU, vertexShader: MOTE_VS, fragmentShader: MOTE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.motes.frustumCulled = false; this.motes.renderOrder = 6;
    scene.add(this.motes);
  }

  private static prism() {
    // a box open at both ends: 4 side quads, unit-sized; the shader stretches it along the light
    const p: number[] = [];
    const quad = (a: number[], b: number[], c: number[], d: number[]) => p.push(...a, ...b, ...c, ...a, ...c, ...d);
    const s = 0.5;
    quad([-s, -s, 0], [s, -s, 0], [s, -s, 1], [-s, -s, 1]);
    quad([-s, s, 0], [s, s, 0], [s, s, 1], [-s, s, 1]);
    quad([-s, -s, 0], [-s, s, 0], [-s, s, 1], [-s, -s, 1]);
    quad([s, -s, 0], [s, s, 0], [s, s, 1], [s, -s, 1]);
    quad([-s * 0.6, 0, 0], [s * 0.6, 0, 0], [s * 0.6, 0, 1], [-s * 0.6, 0, 1]);   // a core sheet so it reads from straight on
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    return g;
  }

  update(L: Lighting, sunDir: THREE.Vector3, t: number) {
    for (const s of this.shafts) {
      const facing = THREE.MathUtils.smoothstep(sunDir.dot(s.outward), 0.05, 0.45);
      (s.u.uDir.value as THREE.Vector3).copy(sunDir).multiplyScalar(-5.5);
      (s.u.uColor.value as THREE.Color).copy(L.sun);
      s.u.uStrength.value = 0.22 * L.beams * facing;
      s.u.uTime.value = t;
      s.mesh.visible = s.u.uStrength.value > 0.003;
    }
    const night = L.night;
    this.moteU.uTime.value = t;
    if (this.outdoor && night > 0.5) {
      (this.moteU.uColor.value as THREE.Color).setRGB(0.75, 1.0, 0.45);
      this.moteU.uAlpha.value = (night - 0.5) * 2 * 1.4; this.moteU.uBlink.value = 1; this.moteU.uSize.value = 34;
    } else {
      (this.moteU.uColor.value as THREE.Color).copy(L.sun);
      this.moteU.uAlpha.value = (this.outdoor ? 0.25 : 0.4 + 0.6 * L.beams) * (1 - night) * 0.55; this.moteU.uBlink.value = 0.2; this.moteU.uSize.value = 20;
    }
  }
}

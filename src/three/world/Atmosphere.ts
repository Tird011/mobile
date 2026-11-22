import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FACE_MATERIALS, GLOW_MATERIALS, LOOK, LOOK_INK, toonMaterial } from '../toon';
import { Lighting, sampleDay } from './DayCycle';

/** How a room wants to be lit. Every room uses the same lights (moved between scenes), so shaders never recompile. */
export type LightRig = {
  /** Where the sun comes from, in degrees: 0 = from behind the back wall (-Z), 90 = from +X. Backlight reads as cinematic. */
  azimuth: number;
  /** Centre and half-size of the shadow box. */
  center: [number, number, number];
  extent: number;
  /** Warm night lamps (up to 2). */
  lamps?: [number, number, number][];
  fog?: [number, number];
  interior?: boolean;
};

const SKY_VS = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize( position );
    vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    gl_Position = p.xyww;   // always at the far plane
  }`;
const SKY_FS = /* glsl */`
  uniform vec3 uTop, uHor, uGround, uSun, uSunDir, uMoonDir; uniform float uNight, uTime, uSunUp;
  varying vec3 vDir;
  float h3( vec3 p ) { return fract( sin( dot( p, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 ); }
  void main() {
    vec3 d = normalize( vDir );
    float y = d.y;
    vec3 col = mix( uHor, uTop, pow( smoothstep( -0.02, 0.62, y ), 0.75 ) );
    col = mix( col, uGround, smoothstep( 0.0, -0.18, y ) );
    // a warm haze band hugging the horizon
    col += uSun * 0.12 * exp( -abs( y ) * 14.0 ) * uSunUp;
    // sun: wide glow + soft disc
    float s = max( dot( d, uSunDir ), 0.0 );
    col += uSun * ( pow( s, 6.0 ) * 0.35 + pow( s, 64.0 ) * 0.6 ) * uSunUp;
    col = mix( col, vec3( 1.0, 0.97, 0.88 ) * 1.6, smoothstep( 0.9985, 0.9992, s ) * uSunUp );
    // moon: pale disc with a cool halo, and a twinkling star field
    float m = max( dot( d, uMoonDir ), 0.0 );
    col += vec3( 0.55, 0.65, 1.0 ) * pow( m, 24.0 ) * 0.35 * uNight;
    float disc = smoothstep( 0.9990, 0.9994, m );
    float crescent = 1.0 - smoothstep( 0.9990, 0.9994, max( dot( d, normalize( uMoonDir + vec3( 0.012, 0.008, 0.0 ) ) ), 0.0 ) );
    col = mix( col, vec3( 0.95, 0.96, 1.0 ) * 1.4, disc * max( crescent, 0.25 ) * uNight );
    vec3 sp = d * 160.0; vec3 cell = floor( sp );
    float st = h3( cell );
    float star = step( 0.9965, st ) * smoothstep( 0.5, 0.1, length( fract( sp ) - 0.5 ) );
    star *= 0.55 + 0.45 * sin( uTime * ( 1.5 + st * 4.0 ) + st * 30.0 );
    col += vec3( 0.9, 0.92, 1.0 ) * star * uNight * smoothstep( 0.02, 0.25, y );
    gl_FragColor = vec4( col, 1.0 );
  }`;

const CLOUD_VS = /* glsl */`
  varying vec3 vN; varying float vH;
  void main() {
    vec4 w = modelMatrix * instanceMatrix * vec4( position, 1.0 );
    vec3 nn = mat3( modelMatrix ) * mat3( instanceMatrix ) * normal; vN = dot( nn, nn ) > 1e-8 ? normalize( nn ) : vec3( 0.0, 1.0, 0.0 );
    vH = position.y;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const CLOUD_FS = /* glsl */`
  uniform vec3 uLit, uShade, uHor, uSunDir; uniform float uNight;
  varying vec3 vN; varying float vH;
  void main() {
    float l = dot( vN, uSunDir ) * 0.5 + 0.5;
    vec3 col = mix( uShade, uLit, smoothstep( 0.35, 0.75, l ) );
    col = mix( uHor, col, smoothstep( -1.5, 2.0, vH ) * 0.75 + 0.25 );   // bellies melt into the sky
    gl_FragColor = vec4( col, 1.0 );
  }`;

const HAZE_VS = /* glsl */`
  attribute float aShade; varying float vShade; varying float vY;
  void main() { vShade = aShade; vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`;
const HAZE_FS = /* glsl */`
  uniform vec3 uBase, uHor, uTop; uniform float uHaze;
  varying float vShade; varying float vY;
  void main() {
    vec3 c = uBase * ( 0.75 + 0.35 * vShade );
    c = mix( c, uHor, uHaze );
    c = mix( c, mix( uHor, uTop, 0.35 ), smoothstep( 10.0, 40.0, vY ) * 0.35 );
    gl_FragColor = vec4( c, 1.0 );
  }`;

function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/**
 * Sky, sun & moon, clouds, the far hills around Batangas, the ground, and all the lights. One instance is
 * shared by every room: when the room changes, Stage re-parents it into that room's scene.
 */
export class Atmosphere {
  readonly lighting = new Lighting();
  readonly group = new THREE.Group();
  /** Things at "infinity" (clouds, ridgelines) follow the camera so they never get closer. */
  private far = new THREE.Group();
  private ground!: THREE.Mesh;
  readonly sun = new THREE.DirectionalLight(0xffffff, 2);
  readonly hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
  readonly lamps = [new THREE.PointLight(0xffb36b, 0, 8, 1.5), new THREE.PointLight(0xffb36b, 0, 8, 1.5)];
  readonly fog = new THREE.Fog(0xcfe6fb, 30, 220);
  private sky: THREE.Mesh;
  private skyU: Record<string, THREE.IUniform>;
  private clouds = new THREE.Group();
  private cloudU: Record<string, THREE.IUniform>;
  private hazeMats: THREE.ShaderMaterial[] = [];
  private rig: LightRig = { azimuth: 20, center: [0, 0, 0], extent: 9 };
  readonly dir = new THREE.Vector3();
  private moonDir = new THREE.Vector3();
  private tmp = new THREE.Color();
  private white = new THREE.Color(1, 1, 1);
  private bounce = new THREE.Color('#ffe6c4');
  private lampTint = new THREE.Color(1, 0.82, 0.62);
  private shadowSize = 1024;

  constructor() {
    // ----- sky dome
    this.skyU = {
      uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGround: { value: new THREE.Color() }, uSun: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(0, 1, 0) }, uNight: { value: 0 }, uTime: LOOK.uTime, uSunUp: { value: 1 },
    };
    this.sky = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3),
      new THREE.ShaderMaterial({ uniforms: this.skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false }));
    this.sky.frustumCulled = false; this.sky.renderOrder = -10;
    this.group.add(this.sky);

    // ----- clouds: chunky cumulus made of faceted puffs, instanced
    this.cloudU = { uLit: { value: new THREE.Color() }, uShade: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSunDir: this.skyU.uSunDir, uNight: { value: 0 } };
    const cloudMat = new THREE.ShaderMaterial({ uniforms: this.cloudU, vertexShader: CLOUD_VS, fragmentShader: CLOUD_FS, fog: false });
    const R = rng(7);
    for (let v = 0; v < 4; v++) {
      const puffs: THREE.BufferGeometry[] = [];
      const n = 5 + Math.floor(R() * 4);
      for (let k = 0; k < n; k++) {
        const r = 2.4 + R() * 2.6 - Math.abs(k - n / 2) * 0.35;
        const g = new THREE.IcosahedronGeometry(Math.max(1.4, r), 1);
        g.scale(1, 0.72, 0.9);
        g.translate((k - n / 2) * 2.6 + R(), Math.max(0, r - 2.4) * 0.6 + R() * 0.8, (R() - 0.5) * 3);
        puffs.push(g);
      }
      const geo = mergeGeometries(puffs); geo.computeVertexNormals();
      const count = 6;
      const im = new THREE.InstancedMesh(geo, cloudMat, count);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
      for (let i = 0; i < count; i++) {
        const a = R() * Math.PI * 2, d = 70 + R() * 80;
        p.set(Math.cos(a) * d, 26 + R() * 22, Math.sin(a) * d);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + Math.PI / 2 + (R() - 0.5));
        const s = 1.4 + R() * 1.6; sc.set(s, s * (0.8 + R() * 0.4), s);
        im.setMatrixAt(i, m.compose(p, q, sc));
      }
      im.frustumCulled = false;
      this.clouds.add(im);
    }
    this.far.add(this.clouds);
    this.group.add(this.far);

    // ----- far scenery: two hazy ridgelines (layers of blue like a landscape painting) and the ground
    this.far.add(this.ridge(105, 4, 16, 0x6fa86a, 0.38, 3), this.ridge(165, 10, 34, 0x5d7fb0, 0.62, 9));
    this.ground = new THREE.Mesh(this.groundGeometry(), toonMaterial(new THREE.Color(1, 1, 1), 'ground', { vertexColors: true, rim: 0 }));
    this.ground.receiveShadow = true; this.ground.position.y = -0.07; this.ground.name = 'WorldGround';
    this.group.add(this.ground);

    // ----- lights (same set in every room so materials compile once)
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.radius = 3;
    this.setShadowQuality(1024);
    this.group.add(this.hemi);
    for (const l of this.lamps) { l.castShadow = false; this.group.add(l); }
    this.group.add(this.sun, this.sun.target);
  }

  setShadowQuality(size: number) {
    this.shadowSize = size;
    this.sun.castShadow = size > 0;
    if (size > 0 && this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose(); (this.sun.shadow as { map: unknown }).map = null;
    }
  }

  private ridge(radius: number, minH: number, maxH: number, color: number, haze: number, seed: number) {
    const R = rng(seed), N = 120;
    const pos: number[] = [], shade: number[] = [];
    const hs: number[] = [];
    for (let i = 0; i <= N; i++) {
      const a = i / N;
      hs.push(minH + (maxH - minH) * (0.5 + 0.3 * Math.sin(a * 13 + seed) + 0.2 * Math.sin(a * 37 + seed * 2)) * (0.75 + R() * 0.25));
    }
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
      const x0 = Math.cos(a0) * radius, z0 = Math.sin(a0) * radius, x1 = Math.cos(a1) * radius, z1 = Math.sin(a1) * radius;
      const h0 = hs[i], h1 = hs[i + 1];
      const lit = i % 2 ? 1 : 0.4;   // alternating facets catch the light like a painted ridge
      pos.push(x0, -3, z0, x1, -3, z1, x1, h1, z1, x0, -3, z0, x1, h1, z1, x0, h0, z0);
      for (let k = 0; k < 6; k++) shade.push(lit);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aShade', new THREE.Float32BufferAttribute(shade, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uBase: { value: new THREE.Color(color) }, uHor: { value: new THREE.Color() }, uTop: { value: new THREE.Color() }, uHaze: { value: haze } },
      vertexShader: HAZE_VS, fragmentShader: HAZE_FS, side: THREE.DoubleSide, fog: false,
    });
    m.userData.haze = haze;
    this.hazeMats.push(m);
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = -5;
    return mesh;
  }

  private groundGeometry() {
    const g = new THREE.CircleGeometry(190, 72, 0, Math.PI * 2);
    g.rotateX(-Math.PI / 2);
    // more rings near the middle would be nicer, but colour patches carry the detail
    const p = g.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(p.count * 3);
    const a = new THREE.Color('#8cc463'), b = new THREE.Color('#a7cf5a'), c = new THREE.Color('#6fae5b'), tmp = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const K = Math.PI * 2 / 40;   // period 40 m, so the ground can snap along with the camera seamlessly
      const n = Math.sin(x * K) * Math.cos(z * K * 2) + Math.sin((x + z) * K) * 0.6;
      tmp.copy(a).lerp(n > 0 ? b : c, Math.min(1, Math.abs(n) * 0.6));
      col.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }

  attach(scene: THREE.Scene, rig: LightRig) {
    this.rig = rig;
    scene.add(this.group);
    scene.fog = this.fog;
    scene.background = null;
    const e = rig.extent;
    const cam = this.sun.shadow.camera;
    cam.left = -e; cam.right = e; cam.top = e; cam.bottom = -e; cam.near = 1; cam.far = 80;
    cam.updateProjectionMatrix();
    this.lamps.forEach((l, i) => {
      const p = rig.lamps?.[i];
      l.visible = true;
      if (p) l.position.set(p[0], p[1], p[2]); else l.position.set(0, -50, 0);
    });
    this.fog.near = rig.fog?.[0] ?? 40; this.fog.far = rig.fog?.[1] ?? 240;
  }

  update(hour: number, t: number, camera: THREE.Camera) {
    const L = sampleDay(hour, this.lighting);
    const rig = this.rig;
    // light direction: room azimuth, swept east->west through the day
    const az = THREE.MathUtils.degToRad(rig.azimuth + L.sweep * 55);
    const el = THREE.MathUtils.degToRad(10 + L.elevation * 58);
    this.dir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    const c = rig.center;
    this.sun.position.set(c[0] + this.dir.x * 40, c[1] + this.dir.y * 40, c[2] + this.dir.z * 40);
    this.sun.target.position.set(c[0], c[1], c[2]);
    this.sun.target.updateMatrixWorld();
    this.sun.color.copy(L.sun);
    this.sun.intensity = L.sunI * (rig.interior ? 0.95 : 1);
    this.hemi.color.copy(L.hemiS); this.hemi.groundColor.copy(L.hemiG);
    this.hemi.intensity = L.hemiI;
    if (rig.interior) {
      // indoors the sky light has bounced off warm walls and floors: warmer and a little brighter
      this.hemi.color.lerp(this.bounce, 0.35 * (1 - L.night)); this.hemi.groundColor.lerp(this.bounce, 0.25);
      this.hemi.intensity *= 1.08;
    }
    for (const l of this.lamps) l.intensity = L.lamps * 3.4 * (0.95 + 0.05 * Math.sin(t * 7.3 + l.position.x));

    // sky: real sun/moon directions in world space (sky azimuth independent of the room so they line up with the light)
    this.skyU.uTop.value.copy(L.top); this.skyU.uHor.value.copy(L.hor); this.skyU.uGround.value.copy(L.ground);
    this.skyU.uSun.value.copy(L.sun);
    this.skyU.uSunUp.value = L.moon ? 0 : 1;
    this.skyU.uNight.value = L.night;
    (this.skyU.uSunDir.value as THREE.Vector3).copy(this.dir);
    if (L.moon) this.moonDir.copy(this.dir); else this.moonDir.set(-this.dir.x, 0.6, -this.dir.z).normalize();
    (this.skyU.uMoonDir.value as THREE.Vector3).copy(this.moonDir);
    this.sky.position.copy(camera.position);
    this.far.position.set(camera.position.x, 0, camera.position.z);
    this.ground.position.set(Math.round(camera.position.x / 40) * 40, -0.07, Math.round(camera.position.z / 40) * 40);
    this.sky.scale.setScalar(400);

    this.cloudU.uLit.value.copy(L.sun).lerp(this.tmp.set(1, 1, 1), L.moon ? 0.2 : 0.55).multiplyScalar(L.moon ? 0.35 : 1);
    this.cloudU.uShade.value.copy(L.hemiS).lerp(L.top, 0.35).multiplyScalar(L.moon ? 0.55 : 0.9);
    this.cloudU.uHor.value.copy(L.hor);
    this.clouds.rotation.y = t * 0.0035;
    for (const m of this.hazeMats) {
      (m.uniforms.uHor.value as THREE.Color).copy(L.fog).lerp(L.hor, 0.5);
      (m.uniforms.uTop.value as THREE.Color).copy(L.top);
      m.uniforms.uHaze.value = Math.min(0.92, (m.userData.haze as number) + L.night * 0.25);
    }
    this.fog.color.copy(L.fog);

    // global look uniforms
    LOOK.uRimColor.value.copy(L.rim);
    LOOK.uRimStrength.value = L.rimI;
    LOOK.uCloudShadow.value = L.moon ? 0 : 0.28 * L.elevation;
    LOOK.uCloudOffset.value.set(t * 0.012, t * 0.005);
    LOOK_INK.value.setRGB(0.16, 0.1, 0.1).lerp(this.tmp.setRGB(0.07, 0.07, 0.17), L.night);
    for (const m of GLOW_MATERIALS) {
      const base = m.userData.base as THREE.Color;
      const k = (m.userData.day as number) * (1 - L.lamps) + L.lamps * 1.45;
      m.color.copy(base).multiplyScalar(k);
    }
    this.tmp.copy(L.hemiS).lerp(L.sun, 0.5).multiplyScalar(0.55 + 0.45 * (1 - L.night)).lerp(this.white, 0.45 * (1 - L.night));
    if (L.lamps > 0) this.tmp.lerp(this.lampTint, L.lamps * 0.35);
    for (const m of FACE_MATERIALS) m.color.copy(this.tmp);
    return L;
  }
}

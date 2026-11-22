import * as THREE from 'three';
import type { Lighting } from './world/DayCycle';

export type Quality = 'low' | 'medium' | 'high';
export const QUALITY: Record<Quality, { scale: number; bloom: boolean; shadow: number; msaa: number; motes: boolean }> = {
  low: { scale: 0.62, bloom: false, shadow: 0, msaa: 0, motes: false },
  medium: { scale: 0.8, bloom: true, shadow: 1024, msaa: 2, motes: true },
  high: { scale: 1.0, bloom: true, shadow: 2048, msaa: 4, motes: true },
};

const TRI_VS = 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4( position.xy, 0.0, 1.0 ); }';
const BRIGHT_FS = /* glsl */`
  uniform sampler2D tSrc; uniform float uThreshold; varying vec2 vUv;
  void main() {
    vec3 c = texture2D( tSrc, vUv ).rgb;
    if ( any( isnan( c ) ) || any( isinf( c ) ) ) c = vec3( 0.0 );   // one bad pixel must never smear through the blur
    c = min( c, vec3( 24.0 ) );
    float l = max( c.r, max( c.g, c.b ) );
    gl_FragColor = vec4( c * smoothstep( uThreshold, uThreshold + 0.45, l ), 1.0 );
  }`;
const BLUR_FS = /* glsl */`
  uniform sampler2D tSrc; uniform vec2 uStep; varying vec2 vUv;
  void main() {
    vec3 c = texture2D( tSrc, vUv ).rgb * 0.227;
    c += ( texture2D( tSrc, vUv + uStep * 1.385 ).rgb + texture2D( tSrc, vUv - uStep * 1.385 ).rgb ) * 0.316;
    c += ( texture2D( tSrc, vUv + uStep * 3.231 ).rgb + texture2D( tSrc, vUv - uStep * 3.231 ).rgb ) * 0.070;
    gl_FragColor = vec4( c, 1.0 );
  }`;
const FINAL_FS = /* glsl */`
  uniform sampler2D tScene, tBloomA, tBloomB;
  uniform float uBloom, uExposure, uWarm, uNight, uVignette, uSat, uAspect, uHdr;
  varying vec2 vUv;
  vec3 neutral( vec3 color ) {
    const float start = 0.76; const float desat = 0.15;
    float x = min( color.r, min( color.g, color.b ) );
    float off = x < 0.08 ? x - 6.25 * x * x : 0.04;
    color -= off;
    float peak = max( color.r, max( color.g, color.b ) );
    if ( peak < start ) return color;
    float d = 1.0 - start;
    float np = 1.0 - d * d / ( peak + d - start );
    color *= np / peak;
    float g = 1.0 - 1.0 / ( desat * ( peak - np ) + 1.0 );
    return mix( color, vec3( np ), g );
  }
  vec3 toSRGB( vec3 c ) { return mix( c * 12.92, 1.055 * pow( c, vec3( 0.41666 ) ) - 0.055, step( 0.0031308, c ) ); }
  float hash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
  void main() {
    vec3 c = texture2D( tScene, vUv ).rgb * uExposure;
    if ( any( isnan( c ) ) ) c = vec3( 0.0 );
    vec3 b = texture2D( tBloomA, vUv ).rgb * 0.7 + texture2D( tBloomB, vUv ).rgb * 0.9;
    c += b * uBloom;
    c = neutral( c );
    float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
    // split toning: cool violet shadows, warm highlights (stronger at golden hour)
    vec3 shadowTint = mix( vec3( 0.0, 0.018, 0.05 ), vec3( 0.012, 0.0, 0.06 ), uNight );
    vec3 hiTint = vec3( 0.045, 0.02, -0.02 ) * uWarm;
    c += shadowTint * ( 1.0 - smoothstep( 0.0, 0.5, l ) ) + hiTint * smoothstep( 0.35, 1.0, l );
    c = mix( vec3( l ), c, uSat );
    // a soft S-curve for contrast
    c = clamp( c, 0.0, 1.0 );
    c = mix( c, c * c * ( 3.0 - 2.0 * c ), 0.22 );
    vec2 q = ( vUv - 0.5 ) * vec2( uAspect, 1.0 );
    c *= mix( 1.0 - uVignette, 1.0, smoothstep( 0.95, 0.25, length( q ) ) );
    c = toSRGB( c );
    c += ( hash( gl_FragCoord.xy ) - 0.5 ) / 255.0;   // dither: no banding in night skies
    gl_FragColor = vec4( c, 1.0 );
  }`;

/**
 * A small hand-built post pipeline (cheaper than EffectComposer on phones):
 * scene -> offscreen target at a render scale -> bloom at 1/4 and 1/8 res -> one final pass doing
 * tone mapping, split-tone colour grading, saturation, contrast, vignette and dithering.
 * If the GPU can't do offscreen targets it falls back to drawing straight to the screen.
 */
export class PostFX {
  private sceneRT: THREE.WebGLRenderTarget | null = null;
  private bloomRT: THREE.WebGLRenderTarget[] = [];
  private quad = new THREE.Mesh(new THREE.BufferGeometry());
  private quadScene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private bright: THREE.ShaderMaterial; private blur: THREE.ShaderMaterial; private final: THREE.ShaderMaterial;
  private w = 1; private h = 1;
  private hdr = false;
  private broken = false;
  quality: Quality = 'medium';
  sceneCalls = 0; sceneTris = 0;

  constructor(private renderer: THREE.WebGLRenderer) {
    const g = this.quad.geometry;
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    this.bright = new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null }, uThreshold: { value: 1 } }, vertexShader: TRI_VS, fragmentShader: BRIGHT_FS, depthTest: false, depthWrite: false });
    this.blur = new THREE.ShaderMaterial({ uniforms: { tSrc: { value: null }, uStep: { value: new THREE.Vector2() } }, vertexShader: TRI_VS, fragmentShader: BLUR_FS, depthTest: false, depthWrite: false });
    this.final = new THREE.ShaderMaterial({
      uniforms: { tScene: { value: null }, tBloomA: { value: null }, tBloomB: { value: null }, uBloom: { value: 0.8 }, uExposure: { value: 1 }, uWarm: { value: 0 },
        uNight: { value: 0 }, uVignette: { value: 0.22 }, uSat: { value: 1.08 }, uAspect: { value: 1 }, uHdr: { value: 0 } },
      vertexShader: TRI_VS, fragmentShader: FINAL_FS, depthTest: false, depthWrite: false,
    });
    const ext = renderer.extensions;
    this.hdr = !!(ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float'));
  }

  setQuality(q: Quality) { this.quality = q; this.alloc(); }
  setSize(w: number, h: number) { this.w = Math.max(1, w); this.h = Math.max(1, h); this.alloc(); }

  private alloc() {
    this.sceneRT?.dispose(); this.bloomRT.forEach((r) => r.dispose()); this.bloomRT = [];
    const Q = QUALITY[this.quality];
    const type = this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const sw = Math.round(this.w * Q.scale), sh = Math.round(this.h * Q.scale);
    this.sceneRT = new THREE.WebGLRenderTarget(sw, sh, { type, samples: Q.msaa, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    if (Q.bloom) {
      const mk = (d: number) => new THREE.WebGLRenderTarget(Math.max(1, Math.round(this.w / d)), Math.max(1, Math.round(this.h / d)), { type, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      this.bloomRT = [mk(4), mk(4), mk(8), mk(8)];
    }
    this.final.uniforms.uAspect.value = this.w / this.h;
    this.bright.uniforms.uThreshold.value = this.hdr ? 0.95 : 0.8;
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.cam);
  }

  render(scene: THREE.Scene, camera: THREE.Camera, L: Lighting) {
    const r = this.renderer;
    if (this.broken || !this.sceneRT) {
      r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = L.exposure;
      r.setRenderTarget(null); r.render(scene, camera); return;
    }
    try {
      r.toneMapping = THREE.NoToneMapping;
      r.setRenderTarget(this.sceneRT);
      r.render(scene, camera);
      this.sceneCalls = r.info.render.calls; this.sceneTris = r.info.render.triangles;
      const F = this.final.uniforms;
      if (this.bloomRT.length) {
        const [a, b, c, d] = this.bloomRT;
        this.bright.uniforms.tSrc.value = this.sceneRT.texture; this.pass(this.bright, a);
        this.blur.uniforms.tSrc.value = a.texture; this.blur.uniforms.uStep.value.set(1 / a.width, 0); this.pass(this.blur, b);
        this.blur.uniforms.tSrc.value = b.texture; this.blur.uniforms.uStep.value.set(0, 1 / a.height); this.pass(this.blur, a);
        this.blur.uniforms.tSrc.value = a.texture; this.blur.uniforms.uStep.value.set(1 / c.width, 0); this.pass(this.blur, c);
        this.blur.uniforms.tSrc.value = c.texture; this.blur.uniforms.uStep.value.set(0, 1 / c.height); this.pass(this.blur, d);
        F.tBloomA.value = a.texture; F.tBloomB.value = d.texture;
        F.uBloom.value = 0.45 + 0.3 * L.night;
      } else {
        F.tBloomA.value = this.sceneRT.texture; F.tBloomB.value = this.sceneRT.texture; F.uBloom.value = 0;
      }
      F.tScene.value = this.sceneRT.texture;
      F.uExposure.value = L.exposure;
      F.uWarm.value = Math.max(0, L.warm) * 1.4 + 0.2;
      F.uNight.value = L.night;
      F.uSat.value = 1.07 + 0.06 * Math.max(0, L.warm);
      F.uVignette.value = 0.18 + 0.14 * L.night;
      this.pass(this.final, null);
    } catch (e) {
      console.warn('post fx disabled', e);
      this.broken = true;
    }
  }

  dispose() { this.sceneRT?.dispose(); this.bloomRT.forEach((r) => r.dispose()); }
}

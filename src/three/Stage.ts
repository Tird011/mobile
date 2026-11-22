import * as THREE from 'three';
import { AppState, Platform } from 'react-native';
import type { ExpoWebGLRenderingContext } from 'expo-gl';
import type { GameClient } from '../engine/GameClient';
import { getPrefs, onPrefs } from '../engine/prefs';
import type { GameEvent, Snapshot } from '../engine/types';
import { PostFX, QUALITY, type Quality } from './PostFX';
import { CounterRoom } from './rooms/CounterRoom';
import { DinerRoom } from './rooms/DinerRoom';
import { HubRoom } from './rooms/HubRoom';
import { KitchenRoom } from './rooms/KitchenRoom';
import { RoadRoom } from './rooms/RoadRoom';
import type { Room } from './rooms/Room';
import { TitleRoom } from './rooms/TitleRoom';
import { LOOK } from './toon';
import { Atmosphere } from './world/Atmosphere';
import { gameHour } from './world/DayCycle';

type RoomKey = 'title' | 'counter' | 'kitchen' | 'diner' | 'hub' | 'road';
const FACTORIES: Record<RoomKey, () => Room> = {
  title: () => new TitleRoom(), counter: () => new CounterRoom(), kitchen: () => new KitchenRoom(),
  diner: () => new DinerRoom(), hub: () => new HubRoom(), road: () => new RoadRoom(),
};

export function roomFor(s: Snapshot | null): RoomKey {
  if (!s || s.state === 'MENU') return 'title';
  if (s.delivery) return 'road';
  switch (s.scene.id) {
    case 'KITCHEN': return 'kitchen';
    case 'MAIN_DINER': return 'diner';
    case 'DELIVERY_HUB': return 'hub';
    default: return 'counter';
  }
}

/** Test hooks for the browser build: ?hour=18.2 freezes the clock, ?q=low|medium|high forces quality. */
function urlParam(name: string): string | null {
  if (Platform.OS !== 'web') return null;
  try { return new URLSearchParams(globalThis.location?.search ?? '').get(name); } catch { return null; }
}

/**
 * Owns the three.js renderer on the expo-gl context. Draws whichever room the Java state says we're in,
 * lit by one shared Atmosphere whose sun follows the shop's clock, through the PostFX pipeline.
 * Watches its own frame time and lowers quality on phones that can't keep up.
 */
export class Stage {
  private renderer: THREE.WebGLRenderer;
  private post: PostFX;
  private atmo = new Atmosphere();
  private rooms = new Map<RoomKey, Room>();
  private building = new Set<RoomKey>();
  private current: Room | null = null;
  private attached: Room | null = null;
  private raf = 0;
  private lastT = 0;
  private aspect = 1;
  private w = 1; private h = 1;
  private unsub: (() => void)[] = [];
  private hour = 7;
  private frameAvg = 16;
  private slowFor = 0;
  private quality: Quality = 'medium';
  private auto = true;
  private running = false;
  onRoomReady?: (key: RoomKey) => void;

  constructor(private gl: ExpoWebGLRenderingContext, private client: GameClient | null) {
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const canvas = (gl as unknown as { canvas?: HTMLCanvasElement }).canvas ?? ({
      width: w, height: h, style: {}, clientWidth: w, clientHeight: h,
      addEventListener: () => {}, removeEventListener: () => {}, getContext: () => gl,
    } as unknown as HTMLCanvasElement);
    this.renderer = new THREE.WebGLRenderer({ canvas, context: gl as unknown as WebGL2RenderingContext, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.w = w; this.h = h; this.aspect = w / h;
    this.post = new PostFX(this.renderer);
    this.post.setSize(w, h);
    this.applyPrefs();
    this.unsub.push(onPrefs(() => this.applyPrefs()));
    if (Platform.OS === 'web') (globalThis as { __lkStage?: Stage }).__lkStage = this;   // test hook
    if (client) this.unsub.push(client.onEvent((e) => this.forward(e)));
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') this.start(); else this.pause(); });
    this.unsub.push(() => sub.remove());
    // warm up the rooms in the background so switching is instant
    (['title', 'counter', 'kitchen', 'diner', 'hub', 'road'] as RoomKey[]).forEach((k) => this.ensure(k));
  }

  private applyPrefs() {
    const forced = urlParam('q') as Quality | null;
    const pref = getPrefs().quality;
    this.auto = !forced && pref === 'auto';
    const q: Quality = forced && forced in QUALITY ? forced : pref !== 'auto' ? pref : (Platform.OS === 'web' ? 'high' : 'medium');
    this.setQuality(q);
  }

  setQuality(q: Quality) {
    this.quality = q;
    const Q = QUALITY[q];
    this.post.setQuality(q);
    this.atmo.setShadowQuality(Q.shadow);
    this.renderer.shadowMap.enabled = Q.shadow > 0;
    this.slowFor = 0;
  }

  private ensure(key: RoomKey) {
    if (this.rooms.has(key) || this.building.has(key)) return;
    this.building.add(key);
    const r = FACTORIES[key]();
    r.setAspect(this.aspect);
    r.build().then(() => {
      this.rooms.set(key, r); this.building.delete(key);
      // compile the room's shaders now (behind the scenes) rather than on the first frame it is shown
      try { this.atmo.attach(r.scene, r.rig); this.renderer.compile(r.scene, r.camera); this.attached = null; } catch { /* compile is an optimisation */ }
      this.onRoomReady?.(key);
    }).catch((e) => { this.building.delete(key); console.warn('room failed', key, e); });
  }

  private forward(e: GameEvent) { for (const r of this.rooms.values()) r.onEvent(e); this.current?.feelEvent(e); }
  localInput(type: string) { this.current?.onLocalInput(type); }

  /** The sun follows the shop's clock; on the title screen it follows the phone's real clock. */
  private targetHour(s: Snapshot | null) {
    const forced = Number(urlParam('hour'));
    if (forced) return forced;
    if (!s || s.state === 'MENU') { const d = new Date(); return d.getHours() + d.getMinutes() / 60; }
    if (s.state === 'DAY_OVER') return 21;
    return gameHour(s.time, s.dayLength);
  }

  private stepHour(target: number, dt: number) {
    let diff = target - this.hour;
    if (diff < -3) diff += 24;           // new day: roll forward through the night into the morning
    if (Math.abs(diff) > 6) { this.hour = target; return; }
    this.hour = (this.hour + diff * Math.min(1, dt * (diff > 1 ? 0.8 : 4)) + 24) % 24;
  }

  start() {
    if (this.running) return;
    this.running = true; this.lastT = 0;
    const frame = (ms: number) => {
      if (!this.running) return;
      const t = ms / 1000;
      const dt = this.lastT ? Math.min(0.1, t - this.lastT) : 0.016;
      this.lastT = t;
      this.watchPerformance(dt);
      const snap = this.client?.getSnapshot() ?? null;
      const key = roomFor(snap);
      this.ensure(key);
      const room = this.rooms.get(key);
      if (room) this.current = room;
      if (this.current) {
        if (this.attached !== this.current) { this.atmo.attach(this.current.scene, this.current.rig); this.attached = this.current; }
        this.stepHour(this.targetHour(snap), dt);
        LOOK.uTime.value = t;
        try {
          if (snap || this.current instanceof TitleRoom) this.current.update(snap as Snapshot, dt, t);
        } catch (e) { console.warn(e); }
        const L = this.atmo.update(this.hour, t, this.current.camera);
        this.current.updateWorld(L, this.atmo.dir, t);
        this.post.render(this.current.scene, this.current.camera, L);
      } else {
        this.renderer.setRenderTarget(null);
        this.renderer.setClearColor(0xffd6d8); this.renderer.clear();
      }
      this.gl.endFrameEXP?.();
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  /** Battery: nothing is drawn while the app is in the background. */
  pause() { this.running = false; cancelAnimationFrame(this.raf); }

  /** Drop a quality tier if frames stay slow (>28 ms, i.e. under ~35 fps) for 3 seconds. */
  private watchPerformance(dt: number) {
    this.frameAvg += (dt * 1000 - this.frameAvg) * 0.05;
    if (!this.auto || this.quality === 'low') return;
    this.slowFor = this.frameAvg > 28 ? this.slowFor + dt : 0;
    if (this.slowFor > 3) this.setQuality(this.quality === 'high' ? 'medium' : 'low');
  }

  /** For a debug overlay / tests. */
  stats() { return { fps: Math.round(1000 / this.frameAvg), quality: this.quality, calls: this.post.sceneCalls, tris: this.post.sceneTris, hdr: (this.post as unknown as { hdr: boolean }).hdr }; }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.w = w; this.h = h; this.aspect = w / h;
    this.post.setSize(w, h);
    for (const r of this.rooms.values()) r.setAspect(this.aspect);
  }

  dispose() {
    this.pause();
    this.unsub.forEach((u) => u());
    this.post.dispose();
    this.renderer.dispose();
  }
}

import * as THREE from 'three';
import type { ExpoWebGLRenderingContext } from 'expo-gl';
import type { GameClient } from '../engine/GameClient';
import type { GameEvent, Snapshot } from '../engine/types';
import { CounterRoom } from './rooms/CounterRoom';
import { DinerRoom } from './rooms/DinerRoom';
import { HubRoom } from './rooms/HubRoom';
import { KitchenRoom } from './rooms/KitchenRoom';
import { RoadRoom } from './rooms/RoadRoom';
import type { Room } from './rooms/Room';
import { TitleRoom } from './rooms/TitleRoom';

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

/** Owns the three.js renderer on the expo-gl context and draws whichever room the Java state says we're in. */
export class Stage {
  private renderer: THREE.WebGLRenderer;
  private rooms = new Map<RoomKey, Room>();
  private building = new Set<RoomKey>();
  private current: Room | null = null;
  private raf = 0;
  private lastT = 0;
  private aspect = 1;
  private unsub: (() => void) | null = null;
  onRoomReady?: (key: RoomKey) => void;

  constructor(private gl: ExpoWebGLRenderingContext, private client: GameClient | null) {
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const canvas = (gl as unknown as { canvas?: HTMLCanvasElement }).canvas ?? ({
      width: w, height: h, style: {}, clientWidth: w, clientHeight: h,
      addEventListener: () => {}, removeEventListener: () => {}, getContext: () => gl,
    } as unknown as HTMLCanvasElement);
    this.renderer = new THREE.WebGLRenderer({ canvas, context: gl as unknown as WebGL2RenderingContext, antialias: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.aspect = w / h;
    if (client) this.unsub = client.onEvent((e) => this.forward(e));
    // warm up the rooms in the background so switching is instant
    (['title', 'counter', 'kitchen', 'diner', 'hub', 'road'] as RoomKey[]).forEach((k) => this.ensure(k));
  }

  private ensure(key: RoomKey) {
    if (this.rooms.has(key) || this.building.has(key)) return;
    this.building.add(key);
    const r = FACTORIES[key]();
    r.setAspect(this.aspect);
    r.build().then(() => { this.rooms.set(key, r); this.building.delete(key); this.onRoomReady?.(key); })
      .catch((e) => { this.building.delete(key); console.warn('room failed', key, e); });
  }

  private forward(e: GameEvent) { for (const r of this.rooms.values()) r.onEvent(e); }
  localInput(type: string) { this.current?.onLocalInput(type); }

  start() {
    const frame = (ms: number) => {
      const t = ms / 1000;
      const dt = this.lastT ? Math.min(0.1, t - this.lastT) : 0.016;
      this.lastT = t;
      const snap = this.client?.getSnapshot() ?? null;
      const key = roomFor(snap);
      this.ensure(key);
      const room = this.rooms.get(key);
      if (room) this.current = room;
      if (this.current) {
        try {
          if (snap || this.current instanceof TitleRoom) this.current.update(snap as Snapshot, dt, t);
        } catch (e) { console.warn(e); }
        this.renderer.render(this.current.scene, this.current.camera);
      } else {
        this.renderer.setClearColor(0xffd6d8); this.renderer.clear();
      }
      this.gl.endFrameEXP?.();
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.aspect = w / h;
    for (const r of this.rooms.values()) r.setAspect(this.aspect);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.unsub?.();
    this.renderer.dispose();
  }
}

import { createBridge, type CoreBridge } from './bridge';
import type { Catalog, Command, CommandResult, GameEvent, InputType, Snapshot } from './types';

type Listener = () => void;
type EventListener = (e: GameEvent) => void;

/**
 * Runs the logic loop: every ~50 ms it sends the queued player commands plus the elapsed time to the
 * Java core and stores the snapshot it gets back. React components subscribe to snapshots;
 * the three.js stage reads the latest snapshot every frame and animates in between.
 */
export class GameClient {
  static readonly TICK_MS = 50;
  readonly bridge: CoreBridge;
  private queue: Command[] = [];
  private snapshot: Snapshot | null = null;
  private catalogData: Catalog | null = null;
  private listeners = new Set<Listener>();
  private eventListeners = new Set<EventListener>();
  private resultListeners = new Set<(r: CommandResult) => void>();
  private running = false;
  private last = 0;
  private lastEmit = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  error: string | null = null;
  snapshotAt = 0;

  constructor(bridge: CoreBridge = createBridge()) { this.bridge = bridge; }

  async connect(): Promise<void> {
    try {
      await this.bridge.reset();
      this.catalogData = await this.bridge.catalog();
      const first = await this.bridge.step(0, []);
      this.snapshot = first.snapshot;
      this.snapshotAt = Date.now();
      this.error = null;
    } catch (e) {
      this.error = `Can't reach the Java game core (${this.bridge.label}). ${String((e as Error).message ?? e)}`;
      throw e;
    } finally {
      this.emit();
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = Date.now();
    this.loop();
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
  }

  private loop = async () => {
    if (!this.running) return;
    const now = Date.now();
    const dt = Math.min((now - this.last) / 1000, 0.25);
    this.last = now;
    const commands = this.queue;
    this.queue = [];
    try {
      const r = await this.bridge.step(dt, commands);
      this.snapshot = r.snapshot;
      this.snapshotAt = Date.now();
      for (const res of r.results) this.resultListeners.forEach((l) => l(res));
      for (const ev of r.events) this.eventListeners.forEach((l) => l(ev));
      this.error = null;
      // React UI refreshes at most ~10x a second (or right away when something happened);
      // the 3D stage reads getSnapshot() every frame anyway.
      if (r.events.length || r.results.length || now - this.lastEmit > 100) { this.lastEmit = now; this.emit(); }
    } catch (e) {
      this.error = `Lost connection to the Java game core: ${String((e as Error).message ?? e)}`;
      this.emit();
    }
    const spent = Date.now() - now;
    this.timer = setTimeout(this.loop, Math.max(0, GameClient.TICK_MS - spent));
  };

  send(c: Command) { this.queue.push(c); }
  input(type: InputType, extra: { value?: number; itemId?: string; dx?: number; dy?: number } = {}) {
    this.send({ cmd: 'input', type, ...extra });
  }

  getSnapshot = () => this.snapshot;
  get catalog() { return this.catalogData; }

  subscribe = (l: Listener) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  onEvent(l: EventListener) { this.eventListeners.add(l); return () => { this.eventListeners.delete(l); }; }
  onResult(l: (r: CommandResult) => void) { this.resultListeners.add(l); return () => { this.resultListeners.delete(l); }; }
  private emit() { this.listeners.forEach((l) => l()); }
}

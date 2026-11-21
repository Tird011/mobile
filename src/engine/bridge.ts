import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { Catalog, Command, StepResult } from './types';

/**
 * How the app reaches the Java game core. Two implementations, same contract:
 *  - NativeCoreBridge: the Java core runs inside the Android app (TurboModule "LomiCore").
 *  - HttpCoreBridge:   the Java core runs on your PC (devserver/) and the app talks to it over HTTP.
 *    Used on web, and in Expo Go on a phone while developing (no Android build needed).
 */
export interface CoreBridge {
  readonly kind: 'native' | 'http';
  readonly label: string;
  step(dt: number, commands: Command[]): Promise<StepResult>;
  catalog(): Promise<Catalog>;
  reset(seed?: number, dayLength?: number): Promise<void>;
}

class NativeCoreBridge implements CoreBridge {
  readonly kind = 'native' as const;
  readonly label = 'Java core (in app)';
  constructor(private mod: { step(dt: number, c: string): string; catalog(): string; reset(s: number, d: number): void }) {}
  async step(dt: number, commands: Command[]) { return JSON.parse(this.mod.step(dt, JSON.stringify(commands))) as StepResult; }
  async catalog() { return JSON.parse(this.mod.catalog()) as Catalog; }
  async reset(seed = Date.now() % 100000, dayLength = 0) { this.mod.reset(seed, dayLength); }
}

class HttpCoreBridge implements CoreBridge {
  readonly kind = 'http' as const;
  get label() { return 'Java core @ ' + this.base; }
  constructor(private base: string) {}
  private async post<T>(path: string, body: unknown): Promise<T> {
    const r = await fetch(this.base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`${path} failed: ${r.status}`);
    return r.json() as Promise<T>;
  }
  step(dt: number, commands: Command[]) { return this.post<StepResult>('/step', { dt, commands }); }
  async catalog() { const r = await fetch(this.base + '/catalog'); return r.json() as Promise<Catalog>; }
  async reset(seed = Date.now() % 100000, dayLength = 0) {
    await this.post('/reset', dayLength > 0 ? { seed, dayLength } : { seed });
  }
}

/** Where the dev server is: EXPO_PUBLIC_LOGIC_URL, else the same machine that serves the JS bundle, port 8787. */
export function devServerUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_LOGIC_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.search).get('logic');
    if (q) return q.replace(/\/$/, '');
    return `${window.location.protocol}//${window.location.hostname}:8787`;
  }
  const hostUri = Constants.expoConfig?.hostUri ?? '';
  const host = hostUri.split(':')[0];
  return `http://${host || 'localhost'}:8787`;
}

export function createBridge(): CoreBridge {
  if (Platform.OS === 'android') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const native = require('lomi-core').default;
      if (native) return new NativeCoreBridge(native);
    } catch {
      // not linked (e.g. running in Expo Go): fall back to the dev server
    }
  }
  return new HttpCoreBridge(devServerUrl());
}

import { Platform } from 'react-native';
import type { Quality } from '../three/PostFX';

/** Player settings (sound, music, vibration, graphics), stored next to the save file. */
export type Prefs = { music: number; sfx: number; haptics: boolean; quality: 'auto' | Quality };
const NAME = 'lomiking-prefs.json';
const DEFAULTS: Prefs = { music: 0.7, sfx: 0.9, haptics: true, quality: 'auto' };

let current: Prefs = { ...DEFAULTS };
const listeners = new Set<(p: Prefs) => void>();

export function getPrefs() { return current; }
export function onPrefs(fn: (p: Prefs) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

export async function loadPrefs() {
  try {
    let raw: string | null = null;
    if (Platform.OS === 'web') raw = typeof localStorage !== 'undefined' ? localStorage.getItem(NAME) : null;
    else {
      const { File, Paths } = await import('expo-file-system');
      const f = new File(Paths.document, NAME);
      raw = f.exists ? await f.text() : null;
    }
    if (raw) current = { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* defaults */ }
  listeners.forEach((l) => l(current));
  return current;
}

export async function setPrefs(patch: Partial<Prefs>) {
  current = { ...current, ...patch };
  listeners.forEach((l) => l(current));
  try {
    const json = JSON.stringify(current);
    if (Platform.OS === 'web') { if (typeof localStorage !== 'undefined') localStorage.setItem(NAME, json); return; }
    const { File, Paths } = await import('expo-file-system');
    await new File(Paths.document, NAME).write(json);
  } catch { /* best effort */ }
}

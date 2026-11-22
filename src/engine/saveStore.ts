import { Platform } from 'react-native';

/** Where progress lives on the device: a JSON file in the app's documents folder (localStorage on web). */
const NAME = 'lomiking-save.json';

export async function readSave(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return typeof localStorage !== 'undefined' ? localStorage.getItem(NAME) : null;
    const { File, Paths } = await import('expo-file-system');
    const f = new File(Paths.document, NAME);
    return f.exists ? await f.text() : null;
  } catch {
    return null;
  }
}

export async function writeSave(json: string): Promise<void> {
  try {
    if (Platform.OS === 'web') { if (typeof localStorage !== 'undefined') localStorage.setItem(NAME, json); return; }
    const { File, Paths } = await import('expo-file-system');
    const f = new File(Paths.document, NAME);
    await f.write(json);
  } catch {
    // saving is best-effort; the game keeps going
  }
}

export async function clearSave(): Promise<void> {
  try {
    if (Platform.OS === 'web') { localStorage.removeItem(NAME); return; }
    const { File, Paths } = await import('expo-file-system');
    const f = new File(Paths.document, NAME);
    if (f.exists) f.delete();
  } catch { /* nothing to clear */ }
}

export interface SaveSummary { day: number; level: number; money: number }
export function summarize(json: string | null): SaveSummary | null {
  if (!json) return null;
  try {
    const m = JSON.parse(json);
    return { day: Number(m.day ?? 1), level: Number(m.progress?.level ?? 1), money: Math.floor(Number(m.money ?? 0)) };
  } catch { return null; }
}

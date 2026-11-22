import * as THREE from 'three';

/**
 * Colour script for one Batangas day, 6 AM to 9 PM (the shop's hours), and the night around it.
 * Keyframes were picked like a film's colour script: cool blue dawn, clean bright noon, honey-gold
 * afternoon, peach-and-violet sunset (the cat-island reference), then indigo moonlight.
 * Everything is interpolated into one reusable Lighting object, so nothing is allocated per frame.
 */
type Key = {
  h: number; top: string; hor: string; sun: string; sunI: number; hemiS: string; hemiG: string; hemiI: number;
  fog: string; rim: string; rimI: number; night: number; warm: number; exposure: number;
};
const KEYS: Key[] = [
  { h: 0.0, top: '#0b1230', hor: '#27305f', sun: '#9fb6ff', sunI: 0.5, hemiS: '#4656a2', hemiG: '#2a2340', hemiI: 0.55, fog: '#1f274d', rim: '#8ea6ff', rimI: 0.45, night: 1, warm: -0.5, exposure: 1.05 },
  { h: 5.2, top: '#16204a', hor: '#5d4f86', sun: '#a9b8ff', sunI: 0.45, hemiS: '#5664ad', hemiG: '#3d2f4d', hemiI: 0.6, fog: '#3a3866', rim: '#a89bff', rimI: 0.45, night: 0.85, warm: -0.35, exposure: 1.05 },
  { h: 6.0, top: '#6d8ccf', hor: '#ffbc92', sun: '#ffa66a', sunI: 1.1, hemiS: '#a3b2ea', hemiG: '#e2a883', hemiI: 0.9, fog: '#f1c2a6', rim: '#ffb380', rimI: 0.55, night: 0.15, warm: 0.25, exposure: 1.0 },
  { h: 7.5, top: '#4b9be8', hor: '#d6ecff', sun: '#fff0d2', sunI: 2.1, hemiS: '#c9dcff', hemiG: '#efd1b0', hemiI: 1.1, fog: '#cfe6fb', rim: '#fff1d6', rimI: 0.3, night: 0, warm: 0.05, exposure: 1.0 },
  { h: 12.0, top: '#3a91ea', hor: '#bfe2ff', sun: '#ffffff', sunI: 2.5, hemiS: '#d4e6ff', hemiG: '#eadcc4', hemiI: 1.15, fog: '#c6e3fb', rim: '#ffffff', rimI: 0.22, night: 0, warm: 0.0, exposure: 1.0 },
  { h: 15.5, top: '#4a96e6', hor: '#ffe6c2', sun: '#ffe9c4', sunI: 2.35, hemiS: '#d0defa', hemiG: '#f2d9b7', hemiI: 1.1, fog: '#e9e5d8', rim: '#ffe0b0', rimI: 0.35, night: 0, warm: 0.15, exposure: 1.0 },
  { h: 17.3, top: '#6489d6', hor: '#ffbf86', sun: '#ffab60', sunI: 2.05, hemiS: '#b9c3f0', hemiG: '#f6c49a', hemiI: 0.98, fog: '#f7cfa8', rim: '#ffb060', rimI: 0.62, night: 0, warm: 0.45, exposure: 1.0 },
  { h: 18.2, top: '#5a5cae', hor: '#ff8f73', sun: '#ff7448', sunI: 1.15, hemiS: '#a69ad8', hemiG: '#f0a58c', hemiI: 0.85, fog: '#e9a58f', rim: '#ff8a5a', rimI: 0.68, night: 0.3, warm: 0.5, exposure: 1.02 },
  { h: 18.9, top: '#2d2f6e', hor: '#b2638c', sun: '#b9c6ff', sunI: 0.4, hemiS: '#6f74c0', hemiG: '#8a5a78', hemiI: 0.62, fog: '#7d5f8f', rim: '#c9a0ff', rimI: 0.5, night: 0.75, warm: 0.0, exposure: 1.04 },
  { h: 19.8, top: '#0e1636', hor: '#2b3468', sun: '#a8bcff', sunI: 0.55, hemiS: '#4a5aa8', hemiG: '#2d2440', hemiI: 0.55, fog: '#222a52', rim: '#8fa8ff', rimI: 0.45, night: 1, warm: -0.45, exposure: 1.05 },
  { h: 24.0, top: '#0b1230', hor: '#27305f', sun: '#9fb6ff', sunI: 0.5, hemiS: '#4656a2', hemiG: '#2a2340', hemiI: 0.55, fog: '#1f274d', rim: '#8ea6ff', rimI: 0.45, night: 1, warm: -0.5, exposure: 1.05 },
];
type CKey = { [K in keyof Key]: Key[K] extends string ? THREE.Color : number };
const CK: CKey[] = KEYS.map((k) => {
  const o: Record<string, unknown> = {};
  for (const [n, v] of Object.entries(k)) o[n] = typeof v === 'string' ? new THREE.Color(v) : v;
  return o as CKey;
});

export class Lighting {
  hour = 12;
  top = new THREE.Color(); hor = new THREE.Color(); ground = new THREE.Color();
  sun = new THREE.Color(); sunI = 2;
  hemiS = new THREE.Color(); hemiG = new THREE.Color(); hemiI = 1;
  fog = new THREE.Color(); rim = new THREE.Color(); rimI = 0.3;
  night = 0; warm = 0; exposure = 1;
  /** 0..1, how high the sun (or moon, at night) is: drives shadow direction and light-shaft strength. */
  elevation = 1;
  /** -1 (morning, east) .. 1 (evening, west) */
  sweep = 0;
  moon = false;
  /** Interior lamps / bulbs / lanterns: 0 by day, 1 after dark. */
  lamps = 0;
  /** How strong the sunbeams through windows should be. */
  beams = 0;
}

export function sampleDay(hour: number, out: Lighting): Lighting {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < CK.length - 2 && CK[i + 1].h <= h) i++;
  const a = CK[i], b = CK[i + 1];
  const f = THREE.MathUtils.clamp((h - a.h) / Math.max(1e-4, b.h - a.h), 0, 1);
  const s = f * f * (3 - 2 * f);   // smoothstep between keys: no visible "kinks"
  out.hour = h;
  out.top.copy(a.top).lerp(b.top, s); out.hor.copy(a.hor).lerp(b.hor, s);
  out.sun.copy(a.sun).lerp(b.sun, s); out.sunI = a.sunI + (b.sunI - a.sunI) * s;
  out.hemiS.copy(a.hemiS).lerp(b.hemiS, s); out.hemiG.copy(a.hemiG).lerp(b.hemiG, s); out.hemiI = a.hemiI + (b.hemiI - a.hemiI) * s;
  out.fog.copy(a.fog).lerp(b.fog, s); out.rim.copy(a.rim).lerp(b.rim, s); out.rimI = a.rimI + (b.rimI - a.rimI) * s;
  out.night = a.night + (b.night - a.night) * s; out.warm = a.warm + (b.warm - a.warm) * s; out.exposure = a.exposure + (b.exposure - a.exposure) * s;
  out.ground.copy(out.hemiG).lerp(out.fog, 0.5);

  // sun from 5:50 to 18:40, then the moon takes over the same light
  const SUNRISE = 5.85, SUNSET = 18.65;
  if (h >= SUNRISE && h <= SUNSET) {
    const p = (h - SUNRISE) / (SUNSET - SUNRISE);
    out.moon = false;
    out.elevation = Math.sin(Math.PI * p);
    out.sweep = p * 2 - 1;
  } else {
    const nh = h > SUNSET ? h - SUNSET : h + 24 - SUNSET;
    const p = Math.min(1, nh / (24 - SUNSET + SUNRISE));
    out.moon = true;
    out.elevation = 0.35 + 0.45 * Math.sin(Math.PI * p);
    out.sweep = 0.6 - p * 1.2;
  }
  out.lamps = THREE.MathUtils.smoothstep(out.night, 0.15, 0.7);
  out.beams = out.moon ? 0 : THREE.MathUtils.smoothstep(out.elevation, 0.05, 0.3) * (1 - 0.45 * Math.max(0, out.elevation - 0.7) / 0.3);
  return out;
}

/** The in-game clock: the shop is open 6:00 AM to 9:00 PM over one day's real-time length. */
export function gameHour(time: number, dayLength: number) {
  return 6 + Math.min(1, Math.max(0, time / Math.max(1, dayLength))) * 15;
}

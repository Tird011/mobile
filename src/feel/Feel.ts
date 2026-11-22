import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { getPrefs, onPrefs } from '../engine/prefs';
import type { GameEvent, Snapshot } from '../engine/types';

const MUSIC = {
  menu: require('../../assets/sound/music/intro-menu-music.m4a'),
  shop: require('../../assets/sound/music/background-music.m4a'),
  cleaning: require('../../assets/sound/music/cleaning-music.m4a'),
  delivery: require('../../assets/sound/music/delivery-music.m4a'),
};
const SFX = {
  click: require('../../assets/sound/effect/click.mp3'),
  collect: require('../../assets/sound/effect/collect.mp3'),
  points: require('../../assets/sound/effect/points.mp3'),
  bonus: require('../../assets/sound/effect/bonus.mp3'),
  levelUp: require('../../assets/sound/effect/level-up.mp3'),
  hired: require('../../assets/sound/effect/hired.mp3'),
  upgrade: require('../../assets/sound/effect/upgrade.mp3'),
  mistake: require('../../assets/sound/effect/mistake.mp3'),
  spike: require('../../assets/sound/effect/spike.mp3'),
  dayDone: require('../../assets/sound/effect/day-finished.mp3'),
};
export type Track = keyof typeof MUSIC;
export type Sfx = keyof typeof SFX;
/** How many copies of each effect can overlap (rapid chopping needs several). */
const VOICES: Partial<Record<Sfx, number>> = { click: 4, spike: 4, collect: 3, points: 2 };

/**
 * Duolingo-style vibration vocabulary. Every haptic goes through here so they're throttled
 * (no buzzing mush when actions come fast) and respect the Vibration setting.
 */
type Buzz = 'tick' | 'tap' | 'thud' | 'good' | 'bad' | 'warn' | 'party' | 'bump';
let lastBuzz = 0;
async function buzz(kind: Buzz) {
  if (!getPrefs().haptics) return;
  const now = Date.now();
  if (now - lastBuzz < (kind === 'tick' ? 45 : 70) && kind !== 'party') return;
  lastBuzz = now;
  try {
    if (Platform.OS === 'web') {
      const v = (globalThis.navigator as Navigator | undefined)?.vibrate?.bind(globalThis.navigator);
      v?.({ tick: 8, tap: 12, thud: 25, good: [14, 60, 22], bad: [40, 50, 40], warn: 30, party: [20, 70, 20, 70, 60], bump: 45 }[kind]);
      return;
    }
    const AH = Haptics.AndroidHaptics;
    const android = Platform.OS === 'android' && AH;
    switch (kind) {
      case 'tick': return android ? Haptics.performAndroidHapticsAsync(AH.Segment_Tick) : Haptics.selectionAsync();
      case 'tap': return android ? Haptics.performAndroidHapticsAsync(AH.Virtual_Key) : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      case 'thud': return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      case 'bump': return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      case 'good': return android ? Haptics.performAndroidHapticsAsync(AH.Confirm) : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      case 'bad': return android ? Haptics.performAndroidHapticsAsync(AH.Reject) : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      case 'warn': return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      case 'party': {   // level up: thump, double tap, big thump
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 110);
        setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 200);
        setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 330);
        return;
      }
    }
  } catch {
    // older Android without the newer haptic constants: fall back to a short vibration
    try { await Haptics.impactAsync(kind === 'bad' || kind === 'bump' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light); } catch { /* no vibrator */ }
  }
}

/**
 * Sound + touch feedback for the whole game: music that changes with where you are (crossfaded),
 * effects for every action, and a matching vibration. One instance, owned by App.
 */
class FeelEngine {
  private pools = new Map<Sfx, { players: AudioPlayer[]; next: number }>();
  private music = new Map<Track, AudioPlayer>();
  private current: Track | null = null;
  private wanted: Track | null = null;
  private duck = 1;
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  private ready = false;
  private unlocked = Platform.OS !== 'web';   // browsers only allow audio after the first tap

  async init() {
    if (this.ready) return;
    this.ready = true;
    try { await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers', shouldPlayInBackground: false }); } catch { /* defaults */ }
    for (const [k, src] of Object.entries(SFX) as [Sfx, number][]) {
      const n = VOICES[k] ?? 1;
      const players: AudioPlayer[] = [];
      for (let i = 0; i < n; i++) { try { players.push(createAudioPlayer(src)); } catch { /* skip */ } }
      this.pools.set(k, { players, next: 0 });
    }
    onPrefs(() => this.applyVolumes());
  }

  /** Call from the first user tap (web autoplay rule). */
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    if (this.wanted) { const w = this.wanted; this.current = null; this.setTrack(w); }
  }

  play(name: Sfx, vol = 1) {
    const vol0 = getPrefs().sfx;
    if (!this.ready || vol0 <= 0) return;
    const pool = this.pools.get(name);
    if (!pool || !pool.players.length) return;
    const p = pool.players[pool.next];
    pool.next = (pool.next + 1) % pool.players.length;
    try { p.volume = Math.min(1, vol0 * vol); p.seekTo(0); p.play(); } catch { /* ignore */ }
  }

  private player(track: Track) {
    let p = this.music.get(track);
    if (!p) { p = createAudioPlayer(MUSIC[track]); p.loop = true; p.volume = 0; this.music.set(track, p); }
    return p;
  }

  /** Crossfade to a music track (no-op if it's already playing). */
  setTrack(track: Track | null) {
    this.wanted = track;
    if (!this.ready || !this.unlocked || track === this.current) return;
    const from = this.current ? this.player(this.current) : null;
    const to = track ? this.player(track) : null;
    this.current = track;
    if (to) { to.volume = 0; try { to.play(); } catch { /* */ } }
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    let k = 0;
    this.fadeTimer = setInterval(() => {
      k = Math.min(1, k + 0.08);
      const target = getPrefs().music * this.duck * 0.8;
      if (to) to.volume = target * k;
      if (from && from !== to) from.volume = target * (1 - k);
      if (k >= 1) {
        if (this.fadeTimer) clearInterval(this.fadeTimer);
        this.fadeTimer = null;
        if (from && from !== to) { try { from.pause(); } catch { /* */ } }
      }
    }, 80);
  }

  /** Softer music while paused or reading the day summary. */
  setDuck(d: number) { if (Math.abs(d - this.duck) > 0.01) { this.duck = d; this.applyVolumes(); } }

  private applyVolumes() {
    if (this.fadeTimer || !this.current) return;
    const p = this.music.get(this.current);
    if (p) p.volume = getPrefs().music * this.duck * 0.8;
  }

  /** Music follows the game: menu theme, shop theme, the cleaning song in the diner, the riding song on deliveries. */
  follow(s: Snapshot | null) {
    let t: Track = 'menu';
    if (s && s.state !== 'MENU') t = s.delivery ? 'delivery' : s.scene.id === 'MAIN_DINER' ? 'cleaning' : 'shop';
    this.setTrack(t);
    this.setDuck(s?.state === 'PAUSED' || s?.state === 'DAY_OVER' ? 0.45 : 1);
  }

  /** UI buttons: a click and a crisp tick, every time. */
  press() { this.unlock(); this.play('click', 0.55); buzz('tap'); }

  /** Player gestures in the mini-games. */
  gesture(type: string, step?: string) {
    this.unlock();
    if (type === 'SWIPE') {
      if (step === 'ChopStep' || step === 'CleanTableTask') { this.play('spike', 0.5); buzz('tick'); }
      else buzz('tick');
    } else if (type === 'CIRCLE') buzz('tick');
    else if (type === 'TAP') { this.play('click', 0.45); buzz('tap'); }
  }

  onEvent(e: GameEvent) {
    switch (e.type) {
      case 'ORDER_CREATED': if (!e.delivery) { this.play('click', 0.5); buzz('tap'); } break;
      case 'COOKING_STEP_COMPLETED': this.play('collect', 0.55); buzz('thud'); break;
      case 'COOKING_FINISHED':
        if (e.byStaff) break;
        if (Number(e.stars) >= 2) { this.play('bonus', 0.8); buzz('good'); } else { this.play('mistake', 0.5); buzz('warn'); }
        break;
      case 'COOKING_MISTAKE': case 'FOOD_BURNT': this.play('mistake', 0.7); buzz('bad'); break;
      case 'CUSTOMER_SERVED': this.play('collect', 0.8); buzz('thud'); break;
      case 'CUSTOMER_PAID': this.play('points', 0.65); buzz('good'); break;
      case 'CUSTOMER_LEFT_ANGRY': this.play('mistake', 0.6); buzz('warn'); break;
      case 'TASK_COMPLETED': this.play('collect', 0.5); buzz('tick'); break;
      case 'DELIVERY_BUMP': this.play('spike', 0.9); buzz('bump'); break;
      case 'DELIVERY_FINISHED': this.play('bonus', 0.9); buzz('good'); break;
      case 'DELIVERY_FAILED': this.play('mistake', 0.8); buzz('bad'); break;
      case 'ITEM_BOUGHT': this.play('collect', 0.45); buzz('tick'); break;
      case 'GOAL_COMPLETED': this.play('points', 0.9); buzz('good'); break;
      case 'STREAK': this.play('bonus', 0.6); buzz('good'); break;
      case 'ACHIEVEMENT_UNLOCKED': this.play('bonus', 1); buzz('party'); break;
      case 'LEVEL_UP': this.play('levelUp', 1); buzz('party'); break;
      case 'UPGRADE_BOUGHT': this.play('upgrade', 1); buzz('party'); break;
      case 'WORKER_HIRED': this.play('hired', 0.9); buzz('party'); break;
      case 'WORKER_TRAINED': this.play('upgrade', 0.8); buzz('good'); break;
      case 'DAY_ENDED': this.play('dayDone', 1); buzz('good'); break;
      case 'COMMAND_REJECTED': case 'OUT_OF_STOCK': this.play('mistake', 0.4); buzz('warn'); break;
    }
  }
}

export const Feel = new FeelEngine();
export { buzz };

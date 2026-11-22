import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Snapshot } from '../engine/types';
import { KaloyFace } from './KaloyFace';
import { Bar } from './Bar';
import { C, R } from './theme';

export function clock(s: Snapshot) {
  const mins = 6 * 60 + Math.min(1, s.time / s.dayLength) * 15 * 60;   // 6:00 AM .. 9:00 PM
  const h = Math.floor(mins / 60), m = Math.floor(mins % 60);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Top bar: face, day + clock, money, pause; second row: level + XP, streak, goals, shop. */
export function Hud({ s, onPause, onShop }: { s: Snapshot; onPause: () => void; onShop: (tab?: string) => void }) {
  const stars = Math.round(s.reputation * 2) / 2;
  const p = s.progress;
  const goalsDone = s.goals.filter((g) => g.done).length;
  return (
    <View style={styles.wrap}>
      <View style={styles.bar} accessibilityRole="header">
        <KaloyFace col={s.kaloy.atlasCol} row={s.kaloy.atlasRow} size={50} />
        <View style={{ flex: 1, marginHorizontal: 10 }}>
          <Text style={styles.day}>Day {s.day} · {s.closed ? 'Closing time' : clock(s)}</Text>
          <Bar value={s.time} max={s.dayLength} color={s.closed ? C.orange : C.teal} height={10} />
          <Text style={styles.rep} accessibilityLabel={`Reputation ${s.reputation.toFixed(1)} of 5`}>
            {'★'.repeat(Math.floor(stars))}{stars % 1 ? '½' : ''}<Text style={{ opacity: 0.3 }}>{'★'.repeat(5 - Math.ceil(stars))}</Text>
          </Text>
        </View>
        <View style={styles.money}><Text style={styles.moneyText}>₱{Math.floor(s.money)}</Text></View>
        <Pressable onPress={onPause} accessibilityRole="button" accessibilityLabel="Pause" style={styles.pause} hitSlop={8}>
          <View style={styles.pauseBar} /><View style={styles.pauseBar} />
        </Pressable>
      </View>
      <View style={styles.row2}>
        <Pressable onPress={() => onShop('goals')} style={styles.level} accessibilityLabel={`Level ${p.level}, ${p.xp} of ${p.xpToNext} XP`} testID="hud-level">
          <View style={styles.lvBadge}><Text style={styles.lvText}>Lv {p.level}</Text></View>
          <View style={{ flex: 1, marginLeft: 6 }}><Bar value={p.xp} max={p.xpToNext} color={C.yellow} height={9} /></View>
        </Pressable>
        {p.streak >= 2 ? <View style={styles.streak}><Text style={styles.chipText}>Sarap x{p.streak} +{Math.round(p.streakBonus * 100)}%</Text></View> : null}
        <Pressable onPress={() => onShop('goals')} style={[styles.chip, goalsDone === s.goals.length && s.goals.length ? { backgroundColor: C.green } : null]} testID="hud-goals">
          <Text style={styles.chipText}>Goals {goalsDone}/{s.goals.length}</Text>
        </Pressable>
        <Pressable onPress={() => onShop('upgrades')} style={[styles.chip, { backgroundColor: C.red }]} accessibilityRole="button" testID="hud-shop">
          <Text style={[styles.chipText, { color: C.white }]}>Shop</Text>
          {s.upgrades.some((u) => u.canBuy) || s.staff.some((w) => w.canHire) ? <View style={styles.dot} /> : null}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 10, gap: 6 },
  bar: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.cream, borderRadius: R.lg, borderWidth: 2.5, borderColor: C.brown, padding: 8 },
  day: { color: C.brown, fontWeight: '900', fontSize: 14, marginBottom: 4 },
  rep: { color: C.yellowDark, fontSize: 14, marginTop: 2, fontWeight: '900' },
  money: { backgroundColor: C.yellow, borderRadius: R.md, borderWidth: 2.5, borderColor: C.brown, paddingHorizontal: 10, paddingVertical: 6 },
  moneyText: { color: C.brown, fontWeight: '900', fontSize: 17 },
  pause: { width: 44, height: 44, marginLeft: 8, borderRadius: 22, backgroundColor: C.red, borderWidth: 2.5, borderColor: C.brown, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  pauseBar: { width: 6, height: 16, borderRadius: 2, backgroundColor: C.white },
  row2: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  level: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.cream, borderRadius: 99, borderWidth: 2.5, borderColor: C.brown, paddingRight: 8, minHeight: 40 },
  lvBadge: { backgroundColor: C.yellow, borderRadius: 99, borderWidth: 2.5, borderColor: C.brown, paddingHorizontal: 9, paddingVertical: 6, marginLeft: -2 },
  lvText: { color: C.brown, fontWeight: '900', fontSize: 14 },
  chip: { backgroundColor: C.cream, borderRadius: 99, borderWidth: 2.5, borderColor: C.brown, paddingHorizontal: 12, minHeight: 40, justifyContent: 'center' },
  streak: { backgroundColor: C.orange, borderRadius: 99, borderWidth: 2.5, borderColor: C.brown, paddingHorizontal: 10, minHeight: 40, justifyContent: 'center' },
  chipText: { color: C.brown, fontWeight: '900', fontSize: 13 },
  dot: { position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: 7, backgroundColor: C.yellow, borderWidth: 2, borderColor: C.brown },
});

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

/** Top bar: Mang Kaloy's face, day + clock, money, reputation, pause. */
export function Hud({ s, onPause }: { s: Snapshot; onPause: () => void }) {
  const stars = Math.round(s.reputation * 2) / 2;
  return (
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
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.cream, borderRadius: R.lg, borderWidth: 2.5, borderColor: C.brown, padding: 8, marginHorizontal: 10 },
  day: { color: C.brown, fontWeight: '900', fontSize: 14, marginBottom: 4 },
  rep: { color: C.yellowDark, fontSize: 14, marginTop: 2, fontWeight: '900' },
  money: { backgroundColor: C.yellow, borderRadius: R.md, borderWidth: 2.5, borderColor: C.brown, paddingHorizontal: 10, paddingVertical: 6 },
  moneyText: { color: C.brown, fontWeight: '900', fontSize: 17 },
  pause: { width: 44, height: 44, marginLeft: 8, borderRadius: 22, backgroundColor: C.red, borderWidth: 2.5, borderColor: C.brown, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  pauseBar: { width: 6, height: 16, borderRadius: 2, backgroundColor: C.white },
});

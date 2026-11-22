import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Snapshot } from '../engine/types';
import { Bar } from './Bar';
import { Button } from './Button';
import { C, R } from './theme';

/** End of day: how it went, rewards earned, and a nudge to spend on upgrades before opening again. */
export function DaySummary({ s, onNext, onShop }: { s: Snapshot; onNext: () => void; onShop: () => void }) {
  const r = s.report;
  const stars = r.goalsDone;
  const lines: [string, string][] = [
    ['Customers served', String(r.served)], ['Walked out', String(r.angry)], ['Deliveries', `${r.deliveries}${r.deliveriesFailed ? ` (${r.deliveriesFailed} failed)` : ''}`],
    ['Perfect dishes', String(r.perfectDishes)], ['Sales + tips', `₱${r.revenue + r.tips}`], ['Goal & album rewards', `₱${r.bonuses}`],
    ['Supplies & upgrades', `-₱${r.spent - r.wages}`], ['Helpers\' wages', `-₱${r.wages}`], ['Profit', `₱${r.profit}`], ['XP earned', `${r.xpGained}`],
  ];
  const affordable = s.upgrades.filter((u) => u.canBuy).length + s.staff.filter((w) => w.canHire).length;
  return (
    <View style={styles.backdrop} accessibilityViewIsModal>
      <View style={styles.card}>
        <Text style={styles.title}>Day {r.day} done!</Text>
        <Text style={styles.stars} accessibilityLabel={`${stars} of 3 goals`}>{'★'.repeat(stars)}<Text style={{ opacity: 0.25 }}>{'★'.repeat(3 - stars)}</Text></Text>
        <View style={styles.level}>
          <Text style={styles.k}>Level {s.progress.level}</Text>
          <View style={{ flex: 1, marginLeft: 8 }}><Bar value={s.progress.xp} max={s.progress.xpToNext} color={C.yellow} /></View>
        </View>
        <ScrollView style={{ maxHeight: 260 }}>
          {lines.map(([k, v]) => <View key={k} style={styles.row}><Text style={styles.k}>{k}</Text><Text style={styles.v}>{v}</Text></View>)}
          <View style={styles.row}><Text style={[styles.k, { fontWeight: '900' }]}>Cash box</Text><Text style={[styles.v, { color: C.greenDark }]}>₱{Math.floor(s.money)}</Text></View>
        </ScrollView>
        <Button testID="summary-shop" label={affordable ? `Shop: ${affordable} thing${affordable > 1 ? 's' : ''} you can afford` : 'Shop'} tone="yellow" onPress={onShop} style={{ marginTop: 12 }} />
        <Button testID="next-day" label="Open shop: next day" tone="red" onPress={onNext} style={{ marginTop: 8 }} />
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: C.shade, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 420, backgroundColor: C.cream, borderRadius: R.lg, borderWidth: 3, borderColor: C.brown, padding: 18 },
  title: { fontSize: 26, fontWeight: '900', color: C.red, textAlign: 'center' },
  stars: { fontSize: 34, color: C.yellowDark, textAlign: 'center', marginBottom: 6 },
  level: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderColor: C.creamDark },
  k: { color: C.brown, fontWeight: '700', fontSize: 15 }, v: { color: C.brown, fontWeight: '900', fontSize: 15 },
});

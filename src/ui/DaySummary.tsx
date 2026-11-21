import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ReportView } from '../engine/types';
import { Button } from './Button';
import { C, R } from './theme';

export function DaySummary({ r, money, onNext }: { r: ReportView; money: number; onNext: () => void }) {
  const lines: [string, string][] = [
    ['Customers served', String(r.served)], ['Walked out', String(r.angry)], ['Deliveries', `${r.deliveries}${r.deliveriesFailed ? ` (${r.deliveriesFailed} failed)` : ''}`],
    ['Dishes cooked', String(r.dishesCooked)], ['Chores done', String(r.tasksDone)], ['Sales', `₱${r.revenue}`], ['Tips', `₱${r.tips}`],
    ['Spent at palengke', `₱${r.spent}`], ['Profit', `₱${r.profit}`], ['Average rating', `${r.avgRating.toFixed(1)} ★`],
  ];
  return (
    <View style={styles.backdrop} accessibilityViewIsModal>
      <View style={styles.card}>
        <Text style={styles.title}>Day {r.day} done!</Text>
        {lines.map(([k, v]) => (
          <View key={k} style={styles.row}><Text style={styles.k}>{k}</Text><Text style={styles.v}>{v}</Text></View>
        ))}
        <View style={styles.row}><Text style={[styles.k, { fontWeight: '900' }]}>Cash box</Text><Text style={[styles.v, { color: C.greenDark }]}>₱{Math.floor(money)}</Text></View>
        <Button testID="next-day" label="Open shop: next day" tone="red" onPress={onNext} style={{ marginTop: 12 }} />
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: C.shade, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 420, backgroundColor: C.cream, borderRadius: R.lg, borderWidth: 3, borderColor: C.brown, padding: 18 },
  title: { fontSize: 26, fontWeight: '900', color: C.red, textAlign: 'center', marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderColor: C.creamDark },
  k: { color: C.brown, fontWeight: '700', fontSize: 15 }, v: { color: C.brown, fontWeight: '900', fontSize: 15 },
});

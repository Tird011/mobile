import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SceneId, Snapshot } from '../engine/types';
import { C, R, TOUCH } from './theme';

const ROOMS: { id: SceneId; label: string; color: string }[] = [
  { id: 'COUNTER', label: 'Counter', color: C.red },
  { id: 'KITCHEN', label: 'Kitchen', color: C.orange },
  { id: 'MAIN_DINER', label: 'Diner', color: C.teal },
  { id: 'DELIVERY_HUB', label: 'Delivery', color: C.blue },
];

/** Bottom bar (thumb zone). The counter is the hub, so other rooms route through it automatically. */
export function RoomNav({ s, go }: { s: Snapshot; go: (target: SceneId) => void }) {
  const badge = (id: SceneId) => s.tasks.filter((t) => t.sector === (id === 'MAIN_DINER' ? 'MAIN_DINER' : id) && t.status !== 'DONE').length
    + (id === 'COUNTER' ? s.customers.filter((c) => c.action === 'IN_LINE').length + s.orders.filter((o) => o.status === 'READY' && !o.delivery).length : 0);
  return (
    <View style={styles.nav}>
      {ROOMS.map((r) => {
        const here = s.scene.id === r.id;
        const n = badge(r.id);
        return (
          <Pressable key={r.id} onPress={() => go(r.id)} accessibilityRole="tab" accessibilityState={{ selected: here }}
            accessibilityLabel={`${r.label}${n ? `, ${n} waiting` : ''}`} testID={`nav-${r.id}`}
            style={[styles.tab, { backgroundColor: here ? r.color : C.cream }]}>
            <Text style={[styles.label, { color: here ? C.white : C.brown }]}>{r.label}</Text>
            {n > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{n}</Text></View> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingTop: 6, paddingBottom: 10 },
  tab: { flex: 1, minHeight: TOUCH + 4, borderRadius: R.md, borderWidth: 2.5, borderColor: C.brown, alignItems: 'center', justifyContent: 'center' },
  label: { fontWeight: '900', fontSize: 14 },
  badge: { position: 'absolute', top: -8, right: -4, minWidth: 22, height: 22, borderRadius: 11, backgroundColor: C.red, borderWidth: 2, borderColor: C.brown, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: C.white, fontWeight: '900', fontSize: 12 },
});

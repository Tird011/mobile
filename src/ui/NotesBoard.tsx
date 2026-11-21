import React, { memo, useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { TaskView } from '../engine/types';
import { C, R } from './theme';

const SECTOR_LABEL: Record<string, string> = { KITCHEN: 'Kitchen', MAIN_DINER: 'Diner', DELIVERY_HUB: 'Delivery', COUNTER: 'Counter' };

const Note = memo(function Note({ t, onPress, index }: { t: TaskView; onPress: (t: TaskView) => void; index: number }) {
  const tilt = ((index % 3) - 1) * 2;
  return (
    <Pressable onPress={() => onPress(t)} accessibilityRole="button" accessibilityLabel={`Note: ${t.title}, ${SECTOR_LABEL[t.sector]}`}
      style={[styles.note, { transform: [{ rotate: `${tilt}deg` }], backgroundColor: t.status === 'ACTIVE' ? C.noteActive : C.note }]}>
      <View style={styles.pin} />
      <Text style={styles.sector}>{SECTOR_LABEL[t.sector]}</Text>
      <Text style={styles.title} numberOfLines={2}>{t.title}</Text>
      <View style={styles.progress}><View style={[styles.fill, { width: `${Math.round(t.progress * 100)}%` }]} /></View>
    </Pressable>
  );
});

/** The hanging notes (missions) as a horizontal strip of sticky notes. */
export function NotesBoard({ tasks, onPick }: { tasks: TaskView[]; onPick: (t: TaskView) => void }) {
  const render = useCallback(({ item, index }: { item: TaskView; index: number }) => <Note t={item} index={index} onPress={onPick} />, [onPick]);
  if (!tasks.length) return null;
  return (
    <FlatList horizontal data={tasks} keyExtractor={(t) => t.id} renderItem={render} showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 8, gap: 8 }} />
  );
}

const styles = StyleSheet.create({
  note: { width: 120, minHeight: 70, borderRadius: R.sm, padding: 8, paddingTop: 10, borderWidth: 2, borderColor: C.brownSoft },
  pin: { position: 'absolute', top: -5, alignSelf: 'center', width: 12, height: 12, borderRadius: 6, backgroundColor: C.red, borderWidth: 2, borderColor: C.brown },
  sector: { fontSize: 10, fontWeight: '900', color: C.brownSoft, textTransform: 'uppercase' },
  title: { fontSize: 12, fontWeight: '800', color: C.brown },
  progress: { height: 5, borderRadius: 3, backgroundColor: 'rgba(74,36,16,0.15)', marginTop: 4, overflow: 'hidden' },
  fill: { height: 5, backgroundColor: C.green },
});

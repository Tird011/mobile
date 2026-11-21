import React from 'react';
import { StyleSheet, View } from 'react-native';
import { C } from './theme';

/** Progress / meter bar. Optional green zone and target marker (for heat and timing). */
export function Bar({ value, color = C.green, height = 12, zone, marker, max = 1 }: {
  value: number; color?: string; height?: number; zone?: [number, number]; marker?: number; max?: number;
}) {
  const pct = (v: number) => `${Math.max(0, Math.min(1, v / max)) * 100}%` as const;
  return (
    <View style={[styles.track, { height }]}>
      {zone ? <View style={[styles.zone, { left: pct(zone[0]), width: pct(zone[1] - zone[0]) }]} /> : null}
      <View style={[styles.fill, { width: pct(value), backgroundColor: color }]} />
      {marker !== undefined ? <View style={[styles.marker, { left: pct(marker) }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { backgroundColor: C.creamDark, borderRadius: 99, borderWidth: 2, borderColor: C.brown, overflow: 'hidden', justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 99 },
  zone: { position: 'absolute', top: 0, bottom: 0, backgroundColor: 'rgba(63,191,95,0.35)' },
  marker: { position: 'absolute', top: -2, bottom: -2, width: 3, marginLeft: -1.5, backgroundColor: C.brown },
});

import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { C, R } from '../theme';

export function Panel({ title, children, style, right }: { title?: string; children: React.ReactNode; style?: ViewStyle; right?: React.ReactNode }) {
  return (
    <View style={[styles.panel, style]}>
      {title ? <View style={styles.head}><Text style={styles.title}>{title}</Text>{right}</View> : null}
      {children}
    </View>
  );
}
export function Empty({ text }: { text: string }) { return <Text style={styles.empty}>{text}</Text>; }
export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8 }, style]}>{children}</View>;
}
export const T = StyleSheet.create({
  name: { color: C.brown, fontWeight: '900', fontSize: 15 },
  small: { color: C.brownSoft, fontWeight: '700', fontSize: 12 },
  say: { color: C.brown, fontStyle: 'italic', fontSize: 13 },
  big: { color: C.brown, fontWeight: '900', fontSize: 18 },
});
const styles = StyleSheet.create({
  panel: { backgroundColor: 'rgba(255,246,228,0.94)', borderRadius: R.lg, borderWidth: 2.5, borderColor: C.brown, padding: 12, marginHorizontal: 10, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: C.brown, fontWeight: '900', fontSize: 17 },
  empty: { color: C.brownSoft, fontWeight: '700', fontSize: 14, textAlign: 'center', paddingVertical: 8 },
});

import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Feel } from '../feel/Feel';
import { C, R, TOUCH } from './theme';

type Tone = 'red' | 'yellow' | 'green' | 'teal' | 'cream';
const TONES: Record<Tone, [string, string, string]> = {
  red: [C.red, C.redDark, C.white], yellow: [C.yellow, C.yellowDark, C.brown], green: [C.green, C.greenDark, C.white],
  teal: [C.teal, C.tealDark, C.white], cream: [C.cream, C.creamDark, C.brown],
};

/** Chunky toy-like button with a pressed-down state. */
export function Button({ label, onPress, tone = 'yellow', disabled, small, style, sub, onPressIn, onPressOut, testID }: {
  label: string; onPress?: () => void; tone?: Tone; disabled?: boolean; small?: boolean; style?: StyleProp<ViewStyle>; sub?: string;
  onPressIn?: () => void; onPressOut?: () => void; testID?: string;
}) {
  const [bg, edge, fg] = TONES[tone];
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress ? () => { Feel.press(); onPress(); } : undefined}
      onPressIn={onPressIn} onPressOut={onPressOut} hitSlop={6} style={({ pressed }) => [{ opacity: disabled ? 0.45 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] }, style]}>
      {({ pressed }) => (
        <View style={[styles.base, { backgroundColor: edge, minHeight: small ? 40 : TOUCH, paddingBottom: pressed ? 2 : 5 }]}>
          <View style={[styles.face, { backgroundColor: bg, paddingVertical: small ? 6 : 10, marginTop: pressed ? 3 : 0 }]}>
            <Text style={[styles.label, { color: fg, fontSize: small ? 14 : 17 }]} numberOfLines={1}>{label}</Text>
            {sub ? <Text style={[styles.sub, { color: fg }]} numberOfLines={1}>{sub}</Text> : null}
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: R.md, borderWidth: 2.5, borderColor: C.brown, overflow: 'hidden' },
  face: { borderRadius: R.md - 3, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  label: { fontWeight: '900', letterSpacing: 0.3 },
  sub: { fontSize: 11, fontWeight: '700', opacity: 0.85 },
});

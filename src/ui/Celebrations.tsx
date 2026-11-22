import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useClient } from '../engine/useGame';
import { Button } from './Button';
import { C, R } from './theme';

type Party = { id: number; kind: 'level' | 'achievement' | 'hire'; title: string; lines: string[] };

/** Big rewarding moments: level-ups, achievements, new helpers. Queued so none get lost. */
export function Celebrations({ onOpenShop }: { onOpenShop: () => void }) {
  const client = useClient();
  const [queue, setQueue] = useState<Party[]>([]);
  const next = useRef(1);
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => client.onEvent((e) => {
    let p: Party | null = null;
    if (e.type === 'LEVEL_UP') p = { id: next.current++, kind: 'level', title: `Level ${e.level}!`, lines: String(e.unlocks).split('|') };
    if (e.type === 'ACHIEVEMENT_UNLOCKED') p = { id: next.current++, kind: 'achievement', title: String(e.title), lines: [String(e.description), `Reward: ₱${e.reward}`] };
    if (e.type === 'WORKER_HIRED') p = { id: next.current++, kind: 'hire', title: `${e.name} joined!`, lines: ['Your new helper starts working right away.'] };
    if (!p) return;
    setQueue((q) => [...q, p!]);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }), [client]);

  const cur = queue[0];
  useEffect(() => {
    if (!cur) return;
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 90, useNativeDriver: true }).start();
  }, [cur?.id]);
  if (!cur) return null;
  const done = () => setQueue((q) => q.slice(1));
  const color = cur.kind === 'level' ? C.yellow : cur.kind === 'achievement' ? C.orange : C.teal;
  return (
    <View style={styles.backdrop} accessibilityViewIsModal accessibilityLiveRegion="assertive">
      <Burst />
      <Animated.View style={[styles.card, { transform: [{ scale: pop }] }]}>
        <View style={[styles.ribbon, { backgroundColor: color }]}>
          <Text style={styles.kicker}>{cur.kind === 'level' ? 'LEVEL UP' : cur.kind === 'achievement' ? 'ACHIEVEMENT' : 'NEW HELPER'}</Text>
        </View>
        <Text style={styles.title}>{cur.title}</Text>
        {cur.lines.map((l) => <Text key={l} style={styles.line}>{cur.kind === 'level' ? '• ' : ''}{l}</Text>)}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          {cur.kind === 'level' ? <Button style={{ flex: 1 }} tone="yellow" label="See shop" onPress={() => { done(); onOpenShop(); }} /> : null}
          <Button testID="celebrate-ok" style={{ flex: 1 }} tone="green" label="Yehey!" onPress={done} />
        </View>
      </Animated.View>
    </View>
  );
}

/** Simple confetti made of rotating squares. */
function Burst() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(anim, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(); }, []);
  const bits = useRef(Array.from({ length: 22 }, (_, i) => ({
    x: (Math.random() - 0.5) * 340, y: -120 - Math.random() * 260, r: Math.random() * 720, c: [C.yellow, C.red, C.teal, C.green, C.orange][i % 5],
  }))).current;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {bits.map((b, i) => (
        <Animated.View key={i} style={[styles.bit, { backgroundColor: b.c, transform: [
          { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [0, b.x] }) },
          { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, b.y] }) },
          { rotate: anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${b.r}deg`] }) },
        ], opacity: anim.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }) }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: C.shade, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 380, backgroundColor: C.cream, borderRadius: R.lg, borderWidth: 3, borderColor: C.brown, padding: 18, paddingTop: 26, alignItems: 'center' },
  ribbon: { position: 'absolute', top: -18, borderRadius: 99, borderWidth: 3, borderColor: C.brown, paddingHorizontal: 18, paddingVertical: 6 },
  kicker: { color: C.brown, fontWeight: '900', letterSpacing: 2, fontSize: 13 },
  title: { color: C.red, fontWeight: '900', fontSize: 28, textAlign: 'center', marginBottom: 6 },
  line: { color: C.brown, fontWeight: '800', fontSize: 15, textAlign: 'center', marginTop: 2 },
  bit: { position: 'absolute', left: '50%', top: '50%', width: 12, height: 12, borderRadius: 2, borderWidth: 1.5, borderColor: C.brown },
});

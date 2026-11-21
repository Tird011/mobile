import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useClient } from '../engine/useGame';
import type { GameEvent } from '../engine/types';
import { C, R } from './theme';

type Toast = { id: number; text: string; tone: 'good' | 'bad' | 'info' };

function describe(e: GameEvent): Toast['text'] | [string, Toast['tone']] | null {
  switch (e.type) {
    case 'CUSTOMER_PAID': return [`+₱${Number(e.price) + Number(e.tip)}  ${'★'.repeat(Number(e.stars))}  "${e.comment}"`, 'good'];
    case 'CUSTOMER_LEFT_ANGRY': return [`${e.name} walked out angry!`, 'bad'];
    case 'COMMAND_REJECTED': return [String(e.reason), 'bad'];
    case 'ORDER_READY': return [e.delivery ? 'Delivery order ready: take it to the scooter' : 'Order ready: serve it at the counter', 'info'];
    case 'COOKING_FINISHED': return [`Cooked! ${'★'.repeat(Number(e.stars))}${e.burnt ? ' (burnt...)' : ''}`, Number(e.stars) >= 2 ? 'good' : 'bad'];
    case 'COOKING_MISTAKE': return [String(e.reason), 'bad'];
    case 'FOOD_BURNT': return ['It burnt!', 'bad'];
    case 'DELIVERY_FINISHED': return ['Delivered! Mainit pa!', 'good'];
    case 'DELIVERY_FAILED': return [`Delivery failed: ${e.reason}`, 'bad'];
    case 'TASK_COMPLETED': return [`Done: ${e.title}${Number(e.reward) ? `  +₱${e.reward}` : ''}`, 'good'];
    case 'OUT_OF_STOCK': return ['Out of stock! Buy more at the Delivery hub', 'bad'];
    case 'CUSTOMER_ARRIVED': return e.remote ? ['Phone order! Check the Kitchen notes', 'info'] : null;
    default: return null;
  }
}

/** Pop-up messages for things that just happened, with a little haptic buzz on phones. */
export function Toasts() {
  const client = useClient();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  useEffect(() => client.onEvent((e) => {
    const d = describe(e);
    if (!d) return;
    const [text, tone] = Array.isArray(d) ? d : [d, 'info' as const];
    const id = next.current++;
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
    if (Platform.OS !== 'web') {
      if (tone === 'good') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (tone === 'bad') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }
  }), [client]);
  return (
    <View pointerEvents="none" style={styles.wrap} accessibilityLiveRegion="polite">
      {toasts.map((t) => (
        <View key={t.id} style={[styles.toast, { backgroundColor: t.tone === 'good' ? C.green : t.tone === 'bad' ? C.red : C.teal }]}>
          <Text style={styles.text} numberOfLines={2}>{t.text}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 150, left: 16, right: 16, alignItems: 'center', gap: 6 },
  toast: { borderRadius: R.md, borderWidth: 2.5, borderColor: C.brown, paddingHorizontal: 14, paddingVertical: 8, maxWidth: 420 },
  text: { color: C.white, fontWeight: '900', fontSize: 14, textAlign: 'center' },
});

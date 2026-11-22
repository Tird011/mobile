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
    case 'COOKING_FINISHED': return e.byStaff ? ['Inday finished a dish', 'info'] : [`Cooked! ${'★'.repeat(Number(e.stars))}${e.burnt ? ' (burnt...)' : ''}`, Number(e.stars) >= 2 ? 'good' : 'bad'];
    case 'COOKING_MISTAKE': return [String(e.reason), 'bad'];
    case 'FOOD_BURNT': return ['It burnt!', 'bad'];
    case 'DELIVERY_FINISHED': return [e.byRider ? 'Mang Tonyo delivered an order' : 'Delivered! Mainit pa!', 'good'];
    case 'DELIVERY_FAILED': return [`Delivery failed: ${e.reason}`, 'bad'];
    case 'TASK_COMPLETED': return [`Done: ${e.title}${Number(e.reward) ? `  +₱${e.reward}` : ''}`, 'good'];
    case 'OUT_OF_STOCK': return ['Out of stock! Buy more at the Delivery hub', 'bad'];
    case 'CUSTOMER_ARRIVED': return e.remote ? ['Phone order! Check the Kitchen notes', 'info'] : null;
    case 'GOAL_COMPLETED': return [`Goal done: ${e.title}  +₱${e.money} +${e.xp} XP`, 'good'];
    case 'STREAK': return [`Sarap streak x${e.streak}! Tips +${Math.round(Number(e.bonus) * 100)}%`, 'good'];
    case 'STREAK_BROKEN': return ['Streak ended. Keep cooking!', 'info'];
    case 'UPGRADE_BOUGHT': return [`${e.name} level ${e.level}: ${e.effect}`, 'good'];
    case 'WORKER_TRAINED': return [`${e.name} is now level ${e.level}`, 'good'];
    case 'SUPPLIER_DELIVERY': return Number(e.items) > 0 ? [`Morning delivery: ${e.items} ingredients (₱${e.bill})`, 'info'] : null;
    case 'WAGES_PAID': return [`Paid your helpers ₱${e.amount}`, 'info'];
    case 'GAME_LOADED': return [`Welcome back! Day ${e.day}, level ${e.level}`, 'good'];
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
  wrap: { position: 'absolute', top: 175, left: 16, right: 16, alignItems: 'center', gap: 6 },
  toast: { borderRadius: R.md, borderWidth: 2.5, borderColor: C.brown, paddingHorizontal: 14, paddingVertical: 8, maxWidth: 420 },
  text: { color: C.white, fontWeight: '900', fontSize: 14, textAlign: 'center' },
});

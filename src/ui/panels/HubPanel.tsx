import React, { memo, useCallback } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { GameClient } from '../../engine/GameClient';
import type { Catalog, IngredientInfo, Snapshot } from '../../engine/types';
import { Bar } from '../Bar';
import { Button } from '../Button';
import { GesturePad } from '../GesturePad';
import { C, R } from '../theme';
import { Panel, Row, T } from './Panel';

const BUY_QTY = 10;

const MarketRow = memo(function MarketRow({ item, stock, low, money, onBuy }: { item: IngredientInfo; stock: number; low: boolean; money: number; onBuy: (id: string) => void }) {
  const price = Math.round(item.cost * BUY_QTY * 0.9);
  return (
    <Row style={[styles.item, low ? { borderColor: C.red } : null]}>
      <View style={{ flex: 1 }}>
        <Text style={T.name} numberOfLines={1}>{item.name}</Text>
        <Text style={[T.small, low ? { color: C.red } : null]}>In stock: {stock}{low ? ' · running low!' : ''}</Text>
      </View>
      <Button testID={`buy-${item.id}`} small tone="green" label={`+${BUY_QTY}  ₱${price}`} disabled={money < price} onPress={() => onBuy(item.id)} />
    </Row>
  );
});

/** Delivery hub: ride out with ready orders, or restock at the palengke. During a ride, swipe to change lanes. */
export function HubPanel({ s, client, catalog, onLocal }: { s: Snapshot; client: GameClient; catalog: Catalog | null; onLocal: (t: string) => void }) {
  const d = s.delivery;
  const onBuy = useCallback((id: string) => client.send({ cmd: 'buy', ingredientId: id, qty: BUY_QTY }), [client]);
  if (d) {
    return (
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Panel title="Deliver it hot!">
          <Row><Text style={[T.small, { width: 64 }]}>Distance</Text><View style={{ flex: 1 }}><Bar value={d.distance} max={d.length} color={C.blue} height={10} /></View></Row>
          <Row>
            <Text style={[T.small, { width: 64 }]}>Food</Text><View style={{ flex: 1 }}><Bar value={d.condition} color={d.condition > 0.5 ? C.green : C.red} height={10} /></View>
            <Text style={[T.small, { width: 52, textAlign: 'right' }]}>Warm</Text><View style={{ flex: 1 }}><Bar value={d.warmth} color={C.orange} height={10} /></View>
          </Row>
          <GesturePad testID="gesture-pad" mode="swipe" height={110} hint="Swipe left / right to change lanes" onGesture={(g) => {
            if (g.type === 'SWIPE' && g.dx !== 0) { onLocal('SWIPE'); client.input('SWIPE', { value: g.value, dx: g.dx, dy: 0 }); }
          }} />
          <Button testID="boost" tone="red" label="Hold to speed up" onPressIn={() => client.input('HOLD', { value: 1.5 })} />
        </Panel>
      </View>
    );
  }
  const ready = s.orders.filter((o) => o.delivery && o.status === 'READY');
  const lowIds = new Set(s.tasks.filter((t) => t.type === 'RestockTask').map((t) => String(t.ingredientId)));
  const items = (catalog?.ingredients ?? []).slice().sort((a, b) => Number(lowIds.has(b.id)) - Number(lowIds.has(a.id)) || (s.inventory[a.id] ?? 0) - (s.inventory[b.id] ?? 0));
  return (
    <Panel title="Delivery hub" style={{ maxHeight: 360 }}>
      {ready.length ? ready.map((o) => (
        <Button key={o.id} testID={`deliver-${o.id}`} tone="red" label="Ride out!" sub={o.summary} onPress={() => client.send({ cmd: 'deliver', orderId: o.id })} />
      )) : <Text style={T.small}>No delivery orders ready. Cook phone orders in the Kitchen first.</Text>}
      <Text style={[T.name, { marginTop: 4 }]}>Palengke</Text>
      <FlatList data={items} keyExtractor={(i) => i.id} style={{ maxHeight: 220 }} contentContainerStyle={{ gap: 6 }}
        renderItem={({ item }) => <MarketRow item={item} stock={s.inventory[item.id] ?? 0} low={lowIds.has(item.id)} money={s.money} onBuy={onBuy} />} />
    </Panel>
  );
}
const styles = StyleSheet.create({ item: { backgroundColor: C.white, borderRadius: R.md, padding: 8, borderWidth: 2, borderColor: C.creamDark } });

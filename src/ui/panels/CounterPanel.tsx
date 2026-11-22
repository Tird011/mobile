import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { GameClient } from '../../engine/GameClient';
import type { Snapshot } from '../../engine/types';
import { Bar } from '../Bar';
import { Button } from '../Button';
import { C, R } from '../theme';
import { Empty, Panel, Row, T } from './Panel';

/** Take orders from the line and serve plates that are ready. */
export function CounterPanel({ s, client }: { s: Snapshot; client: GameClient }) {
  const line = s.customers.filter((c) => c.action === 'IN_LINE');
  const ready = s.orders.filter((o) => o.status === 'READY' && !o.delivery);
  const readyDelivery = s.orders.filter((o) => o.status === 'READY' && o.delivery).length;
  const freeTables = s.shop.tables.filter((t) => !t.occupant && t.dirt <= 0.001).length;
  const first = line[0];
  const joy = s.staff.find((w) => w.role === 'SERVER' && w.hired && !w.resting);
  return (
    <Panel title="Counter" right={<Text style={T.small}>{freeTables} clean table{freeTables === 1 ? '' : 's'} free</Text>}>
      {first ? (
        <View style={styles.customer}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={T.name}>{first.name} <Text style={T.small}>· {first.type}</Text></Text>
              <Text style={T.say}>"{first.say}"</Text>
            </View>
            <Button testID="take-order" label="Take order" tone="green" onPress={() => client.send({ cmd: 'takeOrder', customerId: first.id })} />
          </Row>
          <Bar value={first.patience} color={first.patience > 0.5 ? C.green : first.patience > 0.25 ? C.yellow : C.red} height={8} />
          {line.length > 1 ? <Text style={T.small}>+{line.length - 1} more in line</Text> : null}
        </View>
      ) : <Empty text={s.closed ? 'Closed for today: finish up the last orders' : 'Waiting for customers...'} />}
      {ready.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {ready.map((o) => (
            <Button key={o.id} testID={`serve-${o.id}`} label="Serve" sub={o.summary} tone="yellow" onPress={() => client.send({ cmd: 'serve', orderId: o.id })} />
          ))}
        </ScrollView>
      ) : null}
      {joy ? <Text style={[T.small, { color: C.tealDark }]}>{joy.name}: {joy.activity}</Text> : null}
      {readyDelivery ? <Text style={[T.small, { color: C.blue }]}>{readyDelivery} delivery order{readyDelivery > 1 ? 's' : ''} ready: go to Delivery</Text> : null}
    </Panel>
  );
}
const styles = StyleSheet.create({ customer: { gap: 6, backgroundColor: C.white, borderRadius: R.md, padding: 10, borderWidth: 2, borderColor: C.creamDark } });

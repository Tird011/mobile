import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { GameClient } from '../../engine/GameClient';
import type { Snapshot } from '../../engine/types';
import { Bar } from '../Bar';
import { Button } from '../Button';
import { GesturePad } from '../GesturePad';
import { C, R } from '../theme';
import { Empty, Panel, Row, T } from './Panel';

const HOW: Record<string, { mode: 'swipe' | 'tap' | 'circle'; hint: string }> = {
  CleanTableTask: { mode: 'swipe', hint: 'Swipe back and forth to wipe' },
  WashDishesTask: { mode: 'tap', hint: 'Tap to scrub each plate' },
  SweepFloorTask: { mode: 'circle', hint: 'Sweep in circles with the walis' },
};

/** Chores: wipe tables, wash dishes, sweep. */
export function DinerPanel({ s, client, onLocal }: { s: Snapshot; client: GameClient; onLocal: (t: string) => void }) {
  const chores = s.tasks.filter((t) => t.sector === 'MAIN_DINER');
  const active = chores.find((t) => t.status === 'ACTIVE');
  const eating = s.customers.filter((c) => c.action === 'EATING').length;
  const waiting = s.customers.filter((c) => c.action === 'WAITING_FOR_FOOD' && !c.remote).length;
  if (active) {
    const how = HOW[active.type] ?? { mode: 'swipe', hint: 'Work!' };
    return (
      <Panel title={active.title}>
        <GesturePad testID="gesture-pad" mode={how.mode} hint={how.hint} height={160} onGesture={(g) => {
          onLocal(g.type);
          if (g.type === 'TAP') client.input('TAP');
          else if (g.type === 'SWIPE') client.input('SWIPE', { value: g.value, dx: g.dx, dy: g.dy });
          else client.input('CIRCLE', { value: g.value });
        }} />
        <Bar value={active.progress} color={C.teal} />
      </Panel>
    );
  }
  return (
    <Panel title="Diner" right={<Text style={T.small}>{waiting} waiting · {eating} eating</Text>}>
      {chores.length ? chores.map((t) => (
        <Row key={t.id} style={styles.chore}>
          <Text style={[T.name, { flex: 1 }]}>{t.title}{t.timeLeft > 0 ? <Text style={T.small}>  · {Math.ceil(t.timeLeft)}s</Text> : null}</Text>
          <Button testID={`chore-${t.id}`} small label="Start" tone="teal" onPress={() => client.send({ cmd: 'startTask', taskId: t.id })} />
        </Row>
      )) : <Empty text="All clean! Sarap ng hangin." />}
      <View style={styles.tables}>
        {s.shop.tables.map((t) => (
          <View key={t.id} style={[styles.table, { backgroundColor: t.occupant ? C.yellow : t.dirt > 0.001 ? C.orange : C.green }]}>
            <Text style={styles.tableText}>T{t.id}</Text>
          </View>
        ))}
        <Text style={T.small}>  yellow = seated, orange = messy, green = free</Text>
      </View>
    </Panel>
  );
}
const styles = StyleSheet.create({
  chore: { backgroundColor: C.white, borderRadius: R.md, padding: 8, borderWidth: 2, borderColor: C.creamDark },
  tables: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  table: { width: 34, height: 28, borderRadius: 8, borderWidth: 2, borderColor: C.brown, alignItems: 'center', justifyContent: 'center' },
  tableText: { fontWeight: '900', color: C.brown, fontSize: 12 },
});

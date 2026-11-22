import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useClient, useSnapshot } from '../engine/useGame';
import type { SceneId, TaskView } from '../engine/types';
import { Button } from './Button';
import { Celebrations } from './Celebrations';
import { ShopScreen, type ShopTab } from './ShopScreen';
import { DaySummary } from './DaySummary';
import { Hud } from './Hud';
import { NotesBoard } from './NotesBoard';
import { CounterPanel } from './panels/CounterPanel';
import { DinerPanel } from './panels/DinerPanel';
import { HubPanel } from './panels/HubPanel';
import { KitchenPanel } from './panels/KitchenPanel';
import { RoomNav } from './RoomNav';
import { C, R } from './theme';
import { Toasts } from './Toasts';

/** Everything drawn on top of the 3D view while playing. */
export function GameScreen({ onLocalInput, topInset }: { onLocalInput: (t: string) => void; topInset: number }) {
  const client = useClient();
  const s = useSnapshot();
  const [shop, setShop] = useState<ShopTab | null>(null);
  const [pausedForShop, setPausedForShop] = useState(false);
  const openShop = useCallback((tab: string = 'upgrades') => {
    if (s?.state === 'PLAYING') { client.send({ cmd: 'pause' }); setPausedForShop(true); }   // cozy: time stops while shopping
    setShop(tab as ShopTab);
  }, [client, s?.state]);
  const closeShop = useCallback(() => {
    setShop(null);
    if (pausedForShop) { client.send({ cmd: 'resume' }); setPausedForShop(false); }
  }, [client, pausedForShop]);
  const go = useCallback((target: SceneId) => {
    if (!s || target === s.scene.id) return;
    if (s.scene.id !== 'COUNTER' && target !== 'COUNTER') client.send({ cmd: 'goTo', scene: 'COUNTER' });
    client.send({ cmd: 'goTo', scene: target });
  }, [client, s?.scene.id]);
  const pickNote = useCallback((t: TaskView) => {
    const scene: SceneId = t.sector === 'COUNTER' ? 'COUNTER' : t.sector;
    go(scene);
    if (t.interactive) client.send({ cmd: 'startTask', taskId: t.id });
  }, [go, client]);
  if (!s) return null;
  const riding = !!s.delivery;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={{ paddingTop: topInset + 6 }} pointerEvents="box-none">
        <Hud s={s} onPause={() => client.send({ cmd: 'pause' })} onShop={openShop} />
        {!riding ? <NotesBoard tasks={s.tasks} onPick={pickNote} /> : null}
      </View>
      <View style={{ flex: 1 }} pointerEvents="none" />
      <View pointerEvents="box-none">
        {s.scene.id === 'COUNTER' ? <CounterPanel s={s} client={client} /> : null}
        {s.scene.id === 'KITCHEN' ? <KitchenPanel s={s} client={client} catalog={client.catalog} onLocal={onLocalInput} /> : null}
        {s.scene.id === 'MAIN_DINER' ? <DinerPanel s={s} client={client} onLocal={onLocalInput} /> : null}
        {s.scene.id === 'DELIVERY_HUB' ? <HubPanel s={s} client={client} catalog={client.catalog} onLocal={onLocalInput} /> : null}
        {!riding ? <RoomNav s={s} go={go} /> : <View style={{ height: 14 }} />}
      </View>
      <Toasts />
      {s.state === 'PAUSED' && !shop ? (
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <Text style={styles.title}>Paused</Text>
            <Button testID="resume" label="Resume" tone="green" onPress={() => client.send({ cmd: 'resume' })} />
          </View>
        </View>
      ) : null}
      {s.state === 'DAY_OVER' && !shop ? <DaySummary s={s} onShop={() => openShop('upgrades')} onNext={() => client.send({ cmd: 'nextDay' })} /> : null}
      {shop ? <ShopScreen s={s} tab={shop} onClose={closeShop} /> : null}
      {!shop ? <Celebrations onOpenShop={() => openShop('upgrades')} /> : null}
      {client.error ? <View style={styles.err}><Text style={styles.errText}>{client.error}</Text></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: C.shade, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: C.cream, borderRadius: R.lg, borderWidth: 3, borderColor: C.brown, padding: 20, gap: 12, minWidth: 240 },
  title: { fontSize: 26, fontWeight: '900', color: C.brown, textAlign: 'center' },
  err: { position: 'absolute', bottom: 90, left: 10, right: 10, backgroundColor: C.red, borderRadius: R.md, padding: 10, borderWidth: 2, borderColor: C.brown },
  errText: { color: C.white, fontWeight: '800', textAlign: 'center' },
});

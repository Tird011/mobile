import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMicLevel } from '../../audio/useMicLevel';
import type { GameClient } from '../../engine/GameClient';
import { dishName, ingredientName } from '../../engine/names';
import type { Catalog, Snapshot, StepView } from '../../engine/types';
import { Bar } from '../Bar';
import { Button } from '../Button';
import { GesturePad, type PadGesture } from '../GesturePad';
import { C, R } from '../theme';
import { Empty, Panel, Row, T } from './Panel';

const EXTRAS = ['calamansi', 'sili', 'soy_sauce', 'vinegar', 'atsara'];
const DECOYS = ['tapa', 'cabbage', 'sugar', 'kikiam', 'rice', 'chicken', 'carrot', 'patis', 'egg', 'oil', 'green_onion', 'liver', 'noodles'];

function seededShuffle<T>(arr: T[], seed: string): T[] {
  let h = 0; for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { h = (h * 1103515245 + 12345) | 0; const j = Math.abs(h) % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function friendlyHint(st: StepView, catalog: Catalog | null) {
  const names = (v: unknown) => String(v ?? '').split(',').filter(Boolean).map((id) => ingredientName(catalog, id).replace(/ \(.*\)/, '')).join(', ');
  if (st.step === 'AddIngredientsStep') return `Add to the pot: ${names(st.remaining)}`;
  if (st.step === 'PlateStep') return String(st.missing ?? '') ? `Add on the side: ${names(st.missing)}, then plate it` : 'Plate it!';
  return st.hint;
}

/** The cooking mini-games. Shows the right control for whatever step the Java core says is current. */
export function KitchenPanel({ s, client, catalog, onLocal }: { s: Snapshot; client: GameClient; catalog: Catalog | null; onLocal: (t: string) => void }) {
  const ck = s.cooking;
  if (!ck) {
    const todo = s.orders.filter((o) => o.status !== 'CANCELLED' && o.lines.some((l) => !l.cooked && !l.cooking) && ['PENDING', 'COOKING'].includes(o.status));
    return (
      <Panel title="Kitchen">
        {todo.length ? todo.slice(0, 4).map((o) => (
          <Row key={o.id} style={styles.ticket}>
            <View style={{ flex: 1 }}>
              <Text style={T.name}>{o.delivery ? 'Delivery · ' : ''}{o.summary}</Text>
              <Text style={T.small}>{o.lines.filter((l) => l.cooked).length}/{o.lines.length} cooked</Text>
            </View>
            <Button testID={`cook-${o.id}`} label="Cook" tone="red" onPress={() => client.send({ cmd: 'cook', orderId: o.id })} />
          </Row>
        )) : <Empty text="No tickets. Take orders at the counter." />}
      </Panel>
    );
  }
  const st = ck.step;
  return (
    <Panel title={`${dishName(catalog, ck.dish)} · step ${ck.stepIndex + 1}/${ck.stepCount}`}>
      <Text style={T.big}>{st.title}</Text>
      <Text style={T.small}>{friendlyHint(st, catalog)}</Text>
      <StepControl key={`${ck.orderId}:${ck.stepIndex}`} st={st} client={client} catalog={catalog} onLocal={onLocal} stepKey={`${ck.orderId}:${ck.stepIndex}`} />
      {st.mistakes > 0 ? <Text style={[T.small, { color: C.red }]}>Mistakes: {st.mistakes}</Text> : null}
    </Panel>
  );
}

function StepControl({ st, client, catalog, onLocal, stepKey }: { st: StepView; client: GameClient; catalog: Catalog | null; onLocal: (t: string) => void; stepKey: string }) {
  const pad = (mode: 'swipe' | 'circle' | 'tap' | 'any', hint: string) => (
    <GesturePad testID="gesture-pad" mode={mode} hint={hint} onGesture={(g: PadGesture) => {
      onLocal(g.type);
      if (g.type === 'TAP') client.input('TAP');
      else if (g.type === 'SWIPE') client.input('SWIPE', { value: g.value, dx: g.dx, dy: g.dy });
      else client.input('CIRCLE', { value: g.value });
    }} />
  );
  switch (st.step) {
    case 'ChopStep':
      return <>{pad('swipe', `Swipe across to chop  (${st.cuts}/${st.cutsNeeded})`)}<Bar value={st.progress} color={C.orange} /></>;
    case 'StirStep':
      return <>{pad('circle', 'Draw circles to stir')}<Bar value={st.progress} color={C.orange} /></>;
    case 'AddIngredientsStep':
      return <Tray stepKey={stepKey} required={String(st.required).split(',')} remaining={String(st.remaining).split(',').filter(Boolean)} client={client} catalog={catalog} />;
    case 'PlateStep':
      return <PlateControl st={st} client={client} catalog={catalog} />;
    case 'FanFireStep':
      return <FanFire st={st} client={client} onLocal={onLocal} />;
    case 'BoilStep':
    case 'FryStep':
      return <Timed st={st} client={client} onLocal={onLocal} />;
    case 'SeasonStep':
      return (
        <Row>
          <Button testID="shake" style={{ flex: 1 }} label={`Shake  ${st.shakes}/${st.target}`} tone="yellow" onPress={() => { onLocal('TAP'); client.input('TAP'); }} />
          <Button testID="done" label="Done" tone="green" onPress={() => client.input('CONFIRM')} />
        </Row>
      );
    default:
      return <Button label="Continue" onPress={() => client.input('CONFIRM')} />;
  }
}

function Tray({ required, remaining, client, catalog, stepKey }: { required: string[]; remaining: string[]; client: GameClient; catalog: Catalog | null; stepKey: string }) {
  const options = useMemo(() => {
    const decoys = seededShuffle(DECOYS.filter((d) => !required.includes(d)), stepKey).slice(0, Math.min(3, Math.max(2, 6 - required.length)));
    return seededShuffle([...required, ...decoys], stepKey + 'x');
  }, [stepKey, required.join(',')]);
  return (
    <View style={styles.tray}>
      {options.map((id) => {
        const added = required.includes(id) && !remaining.includes(id);
        return (
          <Button key={id} testID={`ing-${id}`} small tone={added ? 'green' : 'cream'} disabled={added} label={ingredientName(catalog, id).replace(/ \(.*\)/, '')}
            onPress={() => client.input('DRAG_DROP', { itemId: id })} style={{ minWidth: '30%' }} />
        );
      })}
    </View>
  );
}

function PlateControl({ st, client, catalog }: { st: StepView; client: GameClient; catalog: Catalog | null }) {
  const requested = String(st.requested ?? '').split(',').filter(Boolean);
  const missing = String(st.missing ?? '').split(',').filter(Boolean);
  return (
    <>
      <Text style={T.small}>{requested.length ? 'The customer asked for these on the side:' : 'No extras asked. Plate it!'}</Text>
      <View style={styles.tray}>
        {EXTRAS.map((id) => {
          const done = requested.includes(id) && !missing.includes(id);
          return <Button key={id} testID={`extra-${id}`} small tone={done ? 'green' : 'cream'} disabled={done} label={ingredientName(catalog, id).replace(/ \(.*\)/, '')} onPress={() => client.input('DRAG_DROP', { itemId: id })} style={{ minWidth: '30%' }} />;
        })}
      </View>
      <Button testID="done" label="Plate it!" tone="green" onPress={() => client.input('CONFIRM')} />
    </>
  );
}

function FanFire({ st, client, onLocal }: { st: StepView; client: GameClient; onLocal: (t: string) => void }) {
  const [micOn, setMicOn] = useState(false);
  const { level, error } = useMicLevel(micOn);
  const lastSent = useRef(0);
  useEffect(() => {
    if (level === null) return;
    const now = Date.now();
    if (now - lastSent.current > 120) { lastSent.current = now; client.input('MIC_LEVEL', { value: level }); if (level > 0.3) onLocal('MIC'); }
  }, [level]);
  const heat = Number(st.heat ?? 0);
  return (
    <>
      <Text style={T.small}>Heat: keep it in the green zone</Text>
      <Bar value={heat} zone={[Number(st.zoneLow), Number(st.zoneHigh)]} color={heat > 0.95 ? C.red : C.orange} height={18} />
      <Bar value={st.progress} color={C.green} height={8} />
      <Row>
        <Button testID="mic" style={{ flex: 1 }} tone={micOn ? 'red' : 'teal'} label={micOn ? `Blowing... ${level !== null ? Math.round(level * 100) + '%' : ''}` : 'Use mic: blow!'} onPress={() => setMicOn((v) => !v)} />
      </Row>
      {error ? <Text style={[T.small, { color: C.red }]}>{error}</Text> : null}
      <GesturePad testID="gesture-pad" mode="swipe" height={90} hint="...or swipe fast to fan with the pamaypay" onGesture={(g) => {
        if (g.type === 'SWIPE') { onLocal('SWIPE'); client.input('SWIPE', { value: Math.max(0.5, g.value), dx: g.dx, dy: g.dy }); }
      }} />
    </>
  );
}

function Timed({ st, client, onLocal }: { st: StepView; client: GameClient; onLocal: (t: string) => void }) {
  const target = Number(st.target), elapsed = Number(st.elapsed);
  const flipPending = st.step === 'FryStep' && st.needsFlip && !st.flipped;
  const markAt = flipPending ? target / 2 : target;
  return (
    <>
      <Bar value={elapsed} max={target * 2} marker={markAt} color={elapsed > target * 1.3 ? C.red : C.orange} height={18} />
      <Text style={T.small}>Tap when the bar reaches the line</Text>
      <Button testID="timed-tap" tone="red" label={flipPending ? 'Flip!' : st.step === 'BoilStep' ? 'Take it out!' : 'Lift it!'} onPress={() => { onLocal('TAP'); client.input('TAP'); }} />
    </>
  );
}

const styles = StyleSheet.create({
  ticket: { backgroundColor: C.white, borderRadius: R.md, padding: 8, borderWidth: 2, borderColor: C.creamDark },
  tray: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});

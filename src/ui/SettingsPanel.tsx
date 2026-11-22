import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getPrefs, onPrefs, setPrefs, type Prefs } from '../engine/prefs';
import { buzz } from '../feel/Feel';
import { Button } from './Button';
import { C } from './theme';

const QUALITIES: Prefs['quality'][] = ['auto', 'low', 'medium', 'high'];
const QLABEL: Record<Prefs['quality'], string> = { auto: 'Auto', low: 'Battery saver', medium: 'Balanced', high: 'Cinematic' };

/** Music, sound, vibration and graphics toggles (pause menu and title screen). */
export function SettingsPanel() {
  const [p, setP] = useState<Prefs>(getPrefs());
  useEffect(() => onPrefs(setP), []);
  return (
    <View style={styles.wrap}>
      <Row label="Music"><Button small testID="set-music" tone={p.music > 0 ? 'green' : 'cream'} label={p.music > 0 ? 'On' : 'Off'} onPress={() => setPrefs({ music: p.music > 0 ? 0 : 0.7 })} /></Row>
      <Row label="Sounds"><Button small testID="set-sfx" tone={p.sfx > 0 ? 'green' : 'cream'} label={p.sfx > 0 ? 'On' : 'Off'} onPress={() => setPrefs({ sfx: p.sfx > 0 ? 0 : 0.9 })} /></Row>
      <Row label="Vibration"><Button small testID="set-haptics" tone={p.haptics ? 'green' : 'cream'} label={p.haptics ? 'On' : 'Off'}
        onPress={() => { const on = !p.haptics; setPrefs({ haptics: on }).then(() => { if (on) buzz('good'); }); }} /></Row>
      <Row label="Graphics"><Button small testID="set-quality" tone="teal" label={QLABEL[p.quality]}
        onPress={() => setPrefs({ quality: QUALITIES[(QUALITIES.indexOf(p.quality) + 1) % QUALITIES.length] })} /></Row>
    </View>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={styles.row}><Text style={styles.label}>{label}</Text><View style={{ minWidth: 130 }}>{children}</View></View>;
}
const styles = StyleSheet.create({
  wrap: { gap: 8, marginTop: 12, alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: C.brown, fontWeight: '800', fontSize: 15 },
});

import React from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { Button } from './Button';
import { SettingsPanel } from './SettingsPanel';
import { C, R } from './theme';

const LOGO = require('../../assets/logo.png');

export function TitleScreen({ status, error, onStart, onContinue, save, onRetry, bridgeLabel, topInset }: {
  status: 'connecting' | 'ready' | 'error'; error: string | null; onStart: () => void; onContinue: () => void;
  save: { day: number; level: number; money: number } | null; onRetry: () => void; bridgeLabel: string; topInset: number;
}) {
  const [confirmNew, setConfirmNew] = React.useState(false);
  const [settings, setSettings] = React.useState(false);
  return (
    <View style={[StyleSheet.absoluteFill, { paddingTop: topInset }]} pointerEvents="box-none">
      <Image source={LOGO} style={styles.logo} resizeMode="contain" accessibilityLabel="LomiKing" />
      <Text style={styles.sub}>Batangas Rush</Text>
      <View style={{ flex: 1 }} pointerEvents="none" />
      <View style={styles.bottom}>
        {status === 'connecting' ? <ActivityIndicator size="large" color={C.red} /> : null}
        {status === 'ready' && save ? (
          <Button testID="continue" label="Continue" sub={`Day ${save.day} · Level ${save.level} · ₱${save.money}`} tone="red" onPress={onContinue} style={{ width: 260 }} />
        ) : null}
        {status === 'ready' ? (
          <Button testID="start" label={save ? (confirmNew ? 'Tap again: erase progress' : 'New game') : 'Start'} tone={save ? 'cream' : 'red'}
            onPress={() => { if (save && !confirmNew) { setConfirmNew(true); return; } onStart(); }} style={{ width: save ? 220 : 240 }} />
        ) : null}
        {status === 'ready' ? <Button small testID="settings" tone="cream" label={settings ? 'Close settings' : 'Settings'} onPress={() => setSettings((v) => !v)} style={{ width: 160 }} /> : null}
        {settings ? <View style={styles.settingsCard}><SettingsPanel /></View> : null}
        {status === 'error' ? (
          <View style={styles.errCard}>
            <Text style={styles.errTitle}>Can't reach the game logic</Text>
            <Text style={styles.errText}>{error}</Text>
            <Text style={styles.errText}>Start it on your PC with <Text style={{ fontWeight: '900' }}>run-devserver.bat</Text> (same Wi-Fi), or install the Android build.</Text>
            <Button label="Try again" tone="yellow" onPress={onRetry} />
          </View>
        ) : null}
        <Text style={styles.small}>{bridgeLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { width: '80%', maxWidth: 380, height: 260, alignSelf: 'center', marginTop: 8 },
  sub: { textAlign: 'center', color: C.brown, fontWeight: '900', fontSize: 20, marginTop: -8, letterSpacing: 2,
    textShadowColor: 'rgba(255,244,220,0.95)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 0 } },
  settingsCard: { backgroundColor: C.cream, borderRadius: 16, borderWidth: 2.5, borderColor: C.brown, padding: 12, width: 300 },
  bottom: { alignItems: 'center', gap: 10, paddingBottom: 40, paddingHorizontal: 20 },
  small: { color: C.brown, opacity: 0.6, fontSize: 11 },
  errCard: { backgroundColor: C.cream, borderRadius: R.lg, borderWidth: 2.5, borderColor: C.brown, padding: 14, gap: 8, maxWidth: 420 },
  errTitle: { color: C.red, fontWeight: '900', fontSize: 17 },
  errText: { color: C.brown, fontSize: 13 },
});

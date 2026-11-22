import './src/polyfills';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { GameClient } from './src/engine/GameClient';
import { GameContext, useSnapshot } from './src/engine/useGame';
import { clearSave, readSave, summarize, type SaveSummary } from './src/engine/saveStore';
import { Stage } from './src/three/Stage';
import { GameScreen } from './src/ui/GameScreen';
import { TitleScreen } from './src/ui/TitleScreen';
import { C } from './src/ui/theme';

export default function App() {
  const client = useMemo(() => new GameClient(), []);
  const stage = useRef<Stage | null>(null);
  const [status, setStatus] = useState<'connecting' | 'ready' | 'error'>('connecting');
  const [saveJson, setSaveJson] = useState<string | null>(null);
  const [save, setSave] = useState<SaveSummary | null>(null);
  useEffect(() => { readSave().then((j) => { setSaveJson(j); setSave(summarize(j)); }); }, []);

  const connect = useCallback(() => {
    setStatus('connecting');
    client.connect().then(() => { setStatus('ready'); client.start(); }).catch(() => setStatus('error'));
  }, [client]);

  useEffect(() => { connect(); return () => { client.stop(); stage.current?.dispose(); }; }, [connect, client]);

  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    stage.current = new Stage(gl, client);
    stage.current.start();
  }, [client]);

  const onLocalInput = useCallback((t: string) => stage.current?.localInput(t), []);

  return (
    <GameContext.Provider value={client}>
      <View style={styles.root} onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        stage.current?.resize(Math.round(width), Math.round(height));
      }}>
        <StatusBar style="dark" />
        <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} msaaSamples={4} />
        <Screens client={client} status={status} onRetry={connect} save={save} saveJson={saveJson} onLocalInput={onLocalInput} />
      </View>
    </GameContext.Provider>
  );
}

/** Lives outside App so App re-renders don't remount the game screen (and close the shop). */
function Screens({ client, status, onRetry, save, saveJson, onLocalInput }: {
  client: GameClient; status: 'connecting' | 'ready' | 'error'; onRetry: () => void;
  save: SaveSummary | null; saveJson: string | null; onLocalInput: (t: string) => void;
}) {
  const s = useSnapshot();
  const top = Constants.statusBarHeight ?? 0;
  if (!s || s.state === 'MENU') {
    return <TitleScreen status={status} error={client.error} onRetry={onRetry} save={save} bridgeLabel={client.bridge.label} topInset={top}
      onStart={() => { clearSave(); client.send({ cmd: 'start' }); }}
      onContinue={async () => { if (saveJson) await client.load(saveJson); client.send({ cmd: 'start' }); }} />;
  }
  return <GameScreen topInset={top} onLocalInput={onLocalInput} />;
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: C.pink } });

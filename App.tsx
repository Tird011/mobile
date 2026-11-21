import './src/polyfills';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { GameClient } from './src/engine/GameClient';
import { GameContext, useSnapshot } from './src/engine/useGame';
import { Stage } from './src/three/Stage';
import { GameScreen } from './src/ui/GameScreen';
import { TitleScreen } from './src/ui/TitleScreen';
import { C } from './src/ui/theme';

export default function App() {
  const client = useMemo(() => new GameClient(), []);
  const stage = useRef<Stage | null>(null);
  const [status, setStatus] = useState<'connecting' | 'ready' | 'error'>('connecting');

  const connect = useCallback(() => {
    setStatus('connecting');
    client.connect().then(() => { setStatus('ready'); client.start(); }).catch(() => setStatus('error'));
  }, [client]);

  useEffect(() => { connect(); return () => { client.stop(); stage.current?.dispose(); }; }, [connect, client]);

  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    stage.current = new Stage(gl, client);
    stage.current.start();
  }, [client]);

  return (
    <GameContext.Provider value={client}>
      <View style={styles.root} onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        stage.current?.resize(Math.round(width), Math.round(height));
      }}>
        <StatusBar style="dark" />
        <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} msaaSamples={4} />
        <Screens status={status} onRetry={connect} />
      </View>
    </GameContext.Provider>
  );

  function Screens({ status, onRetry }: { status: 'connecting' | 'ready' | 'error'; onRetry: () => void }) {
    const s = useSnapshot();
    const top = Constants.statusBarHeight ?? 0;
    if (!s || s.state === 'MENU') {
      return <TitleScreen status={status} error={client.error} onRetry={onRetry} onStart={() => client.send({ cmd: 'start' })} bridgeLabel={client.bridge.label} topInset={top} />;
    }
    return <GameScreen topInset={top} onLocalInput={(t) => stage.current?.localInput(t)} />;
  }
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: C.pink } });

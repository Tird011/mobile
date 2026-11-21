import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { C } from './theme';

const ATLAS = require('../../assets/textures/face_atlas.png');

/** Mang Kaloy's current expression, cropped from the same atlas the 3D head uses. */
export function KaloyFace({ col, row, size = 52 }: { col: number; row: number; size?: number }) {
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size / 2 }]}>
      <Image source={ATLAS} style={{ width: size * 4, height: size * 2, transform: [{ translateX: -col * size }, { translateY: -row * size }] }} />
    </View>
  );
}
const styles = StyleSheet.create({ wrap: { overflow: 'hidden', backgroundColor: '#E8A867', borderWidth: 2.5, borderColor: C.brown } });

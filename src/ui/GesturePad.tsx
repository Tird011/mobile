import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { C, R } from './theme';

export type PadGesture =
  | { type: 'TAP' }
  | { type: 'SWIPE'; value: number; dx: number; dy: number }
  | { type: 'CIRCLE'; value: number };

/**
 * A touch area that turns finger movement into game gestures:
 * tap, swipe (length 0..1 of the pad width + direction) and circles (rotations, streamed while drawing).
 */
export function GesturePad({ hint, onGesture, mode = 'any', height = 150, testID }: {
  hint: string; onGesture: (g: PadGesture) => void; mode?: 'any' | 'swipe' | 'circle' | 'tap'; height?: number; testID?: string;
}) {
  const size = useRef({ w: 300, h: height });
  const origin = useRef({ x: 0, y: 0 });
  const st = useRef({ x0: 0, y0: 0, t0: 0, lastAngle: 0, angleSum: 0, sent: 0, path: 0, lx: 0, ly: 0 });
  const [flash, setFlash] = useState(0);
  const cb = useRef(onGesture); cb.current = onGesture;

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e, g) => {
      const { locationX: x, locationY: y } = e.nativeEvent;
      origin.current = { x: g.x0 - x, y: g.y0 - y };
      const cx = size.current.w / 2, cy = size.current.h / 2;
      st.current = { x0: x, y0: y, t0: Date.now(), lastAngle: Math.atan2(y - cy, x - cx), angleSum: 0, sent: 0, path: 0, lx: x, ly: y };
    },
    onPanResponderMove: (_e, g) => {
      // page coordinates minus the pad's origin: immune to which child view is under the finger
      const x = g.moveX - origin.current.x, y = g.moveY - origin.current.y;
      const s = st.current;
      s.path += Math.hypot(x - s.lx, y - s.ly); s.lx = x; s.ly = y;
      const cx = size.current.w / 2, cy = size.current.h / 2;
      const a = Math.atan2(y - cy, x - cx);
      let d = a - s.lastAngle;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      s.angleSum += d; s.lastAngle = a;
      if (mode === 'circle' || mode === 'any') {
        const turns = Math.abs(s.angleSum) / (2 * Math.PI);
        // stream every quarter turn so stirring feels immediate
        while (turns - s.sent >= 0.25) { s.sent += 0.25; cb.current({ type: 'CIRCLE', value: 0.25 }); setFlash((f) => f + 1); }
      }
    },
    onPanResponderRelease: (_e, g) => {
      const s = st.current;
      const dx = g.dx, dy = g.dy, dist = Math.hypot(dx, dy), dur = Date.now() - s.t0;
      if (s.sent > 0) return;                                 // it was a circle
      if (dist < 14 && s.path < 24 && dur < 450) { if (mode !== 'circle') { cb.current({ type: 'TAP' }); setFlash((f) => f + 1); } return; }
      if (mode === 'tap' || mode === 'circle') return;
      const value = Math.min(1, dist / Math.max(120, size.current.w * 0.8));
      cb.current({ type: 'SWIPE', value, dx: Math.sign(dx) * (Math.abs(dx) > 8 ? 1 : 0), dy: Math.sign(dy) * (Math.abs(dy) > 8 ? 1 : 0) });
      setFlash((f) => f + 1);
    },
  }), [mode]);

  const onLayout = (e: LayoutChangeEvent) => { size.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height }; };
  return (
    <View testID={testID} onLayout={onLayout} {...responder.panHandlers} accessibilityLabel={hint}
      style={[styles.pad, { height, borderColor: flash % 2 ? C.orange : C.brownSoft }]}>
      <View pointerEvents="none"><Text style={styles.hint} selectable={false}>{hint}</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { borderRadius: R.lg, borderWidth: 3, borderStyle: 'dashed', backgroundColor: 'rgba(255,246,228,0.55)', alignItems: 'center', justifyContent: 'center' },
  hint: { userSelect: 'none', color: C.brown, fontWeight: '800', fontSize: 15, textAlign: 'center', paddingHorizontal: 16, opacity: 0.85 },
});

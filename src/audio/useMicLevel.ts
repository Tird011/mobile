import { useEffect, useRef, useState } from 'react';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';

/**
 * Microphone loudness 0..1 while `enabled` (for blowing on the stove). Uses recording metering (dBFS)
 * and never saves the recording. Returns null when the mic isn't available or permission was denied.
 */
export function useMicLevel(enabled: boolean): { level: number | null; error: string | null } {
  const recorder = useAudioRecorder({ ...RecordingPresets.LOW_QUALITY, isMeteringEnabled: true });
  const [level, setLevel] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    async function begin() {
      try {
        const perm = await requestRecordingPermissionsAsync();
        if (!perm.granted) { setError('Microphone permission denied: fan with swipes instead'); return; }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        started.current = true;
        timer = setInterval(() => {
          const db = recorder.getStatus().metering;
          if (typeof db === 'number' && !cancelled) setLevel(Math.max(0, Math.min(1, (db + 50) / 42)));
        }, 100);
      } catch (e) {
        setError('Microphone unavailable: fan with swipes instead');
      }
    }
    if (enabled) begin();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (started.current) { started.current = false; recorder.stop().catch(() => {}); }
      setLevel(null);
    };
  }, [enabled, recorder]);

  return { level, error };
}

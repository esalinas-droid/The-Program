/**
 * SpeakerButton — Prompt 9B
 *
 * Renders a small speaker icon that fetches TTS audio from POST /api/coach/speak,
 * writes the MP3 to the device cache, then plays it via expo-audio.
 *
 * 4 states: idle → loading → playing → (idle | error)
 *
 * Guarantees:
 *   - Only ONE SpeakerButton plays audio at a time (module-level lock).
 *   - Auto-play fires at most once per message (autoPlayFiredRef guard).
 *   - Temp file and sound are cleaned up on unmount or nav-away.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { getAuthToken } from '../utils/auth';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL ?? '';

// ── Module-level one-at-a-time lock ──────────────────────────────────────────
// The currently active SpeakerButton registers its stop callback here.
// A new speaker overwrites + calls the old one before starting playback.
const _activeSpeaker: { stop: (() => void) | null } = { stop: null };

// ── Types ─────────────────────────────────────────────────────────────────────
type SpeakerState = 'idle' | 'loading' | 'playing' | 'error';

interface Props {
  /** The text to synthesise. */
  text: string;
  /** When true, triggers playback once (guarded by autoPlayFiredRef). */
  autoPlay?: boolean;
}

// ── ArrayBuffer → base64 helper (chunked to avoid stack overflow) ─────────────
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes  = new Uint8Array(buf);
  const CHUNK  = 8192;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    chunks.push(String.fromCharCode(...Array.from(bytes.subarray(i, i + CHUNK))));
  }
  return btoa(chunks.join(''));
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SpeakerButton({ text, autoPlay = false }: Props) {
  // Use a ref for state so startPlayback doesn't need speakerState in its deps
  const stateRef            = useRef<SpeakerState>('idle');
  const [visState, setVisState] = useState<SpeakerState>('idle');

  const soundRef         = useRef<AudioPlayer | null>(null);
  const tempUriRef       = useRef<string | null>(null);
  const isMountedRef     = useRef(true);
  const autoPlayFiredRef = useRef(false);

  const setS = (s: SpeakerState) => {
    stateRef.current = s;
    if (isMountedRef.current) setVisState(s);
  };

  // ── Internal stop + clean ─────────────────────────────────────────────────
  const stopAndClean = useCallback(() => {
    if (soundRef.current) {
      // remove() both stops playback and frees the native player, replacing the
      // old stopAsync + unloadAsync pair. It throws if called twice, and the
      // finish listener can race a tap on the button, so it is guarded.
      try { soundRef.current.remove(); } catch { /* already released */ }
      soundRef.current = null;
    }
    if (tempUriRef.current) {
      FileSystem.deleteAsync(tempUriRef.current, { idempotent: true }).catch(() => {});
      tempUriRef.current = null;
    }
    setS('idle');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Unmount cleanup ───────────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (_activeSpeaker.stop === stopAndClean) _activeSpeaker.stop = null;
      // Stop without setState (component is gone)
      try { soundRef.current?.remove(); } catch { /* already released */ }
      soundRef.current = null;
      if (tempUriRef.current) {
        FileSystem.deleteAsync(tempUriRef.current, { idempotent: true }).catch(() => {});
        tempUriRef.current = null;
      }
    };
  }, [stopAndClean]);

  // ── Fetch + play ──────────────────────────────────────────────────────────
  const startPlayback = useCallback(async () => {
    if (!isMountedRef.current) return;
    if (stateRef.current === 'loading' || stateRef.current === 'playing') return;

    // Pre-empt any other playing speaker
    _activeSpeaker.stop?.();
    _activeSpeaker.stop = stopAndClean;

    setS('loading');

    try {
      const token    = await getAuthToken();
      const response = await fetch(`${BASE}/api/coach/speak`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text, voice: 'onyx' }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!isMountedRef.current) return;

      // Read MP3 bytes and write to cache
      const arrayBuf = await response.arrayBuffer();
      const base64   = arrayBufferToBase64(arrayBuf);
      const localUri = `${FileSystem.cacheDirectory}coach_tts_${Date.now()}.mp3`;
      await FileSystem.writeAsStringAsync(localUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      tempUriRef.current = localUri;

      if (!isMountedRef.current) {
        FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => {});
        return;
      }

      // Switch audio session to playback
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });

      // createAudioPlayer is the imperative counterpart to the useAudioPlayer
      // hook — needed here because the source is fetched at runtime and this
      // player's lifetime is owned by the module-level one-at-a-time lock
      // rather than by the render cycle.
      const player = createAudioPlayer({ uri: localUri });
      soundRef.current = player;

      if (!isMountedRef.current) {
        try { player.remove(); } catch { /* already released */ }
        soundRef.current = null;
        return;
      }

      // Auto-transition to idle when playback finishes
      player.addListener('playbackStatusUpdate', (status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) {
          if (_activeSpeaker.stop === stopAndClean) _activeSpeaker.stop = null;
          stopAndClean();
        }
      });

      player.play();
      setS('playing');

    } catch (err) {
      console.warn('[TTS] playback error:', err);
      if (_activeSpeaker.stop === stopAndClean) _activeSpeaker.stop = null;
      setS('error');
      setTimeout(() => { if (isMountedRef.current) setS('idle'); }, 2500);
    }
  }, [text, stopAndClean]);

  // ── Auto-play: fires exactly once per message when autoPlay becomes true ──
  useEffect(() => {
    if (autoPlay && !autoPlayFiredRef.current) {
      autoPlayFiredRef.current = true;
      // Short delay so the list render settles before audio fetch starts
      const t = setTimeout(startPlayback, 500);
      return () => clearTimeout(t);
    }
  }, [autoPlay, startPlayback]);

  // ── Tap handler ───────────────────────────────────────────────────────────
  const handlePress = () => {
    if (visState === 'idle' || visState === 'error') {
      startPlayback();
    } else if (visState === 'playing') {
      if (_activeSpeaker.stop === stopAndClean) _activeSpeaker.stop = null;
      stopAndClean();
    }
    // loading → no-op
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <TouchableOpacity
      style={[
        s.btn,
        visState === 'playing' && s.btnPlaying,
        visState === 'error'   && s.btnError,
        visState === 'loading' && s.btnLoading,
      ]}
      onPress={handlePress}
      disabled={visState === 'loading'}
      activeOpacity={0.75}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityLabel={
        visState === 'playing' ? 'Stop voice playback' :
        visState === 'loading' ? 'Loading audio' : 'Play voice response'
      }
    >
      {visState === 'loading' ? (
        <ActivityIndicator size="small" color={COLORS.accent} style={s.spinner} />
      ) : visState === 'error' ? (
        <MaterialCommunityIcons name="volume-off" size={14} color="#EF5350" />
      ) : visState === 'playing' ? (
        <MaterialCommunityIcons name="volume-high" size={14} color={COLORS.accent} />
      ) : (
        <MaterialCommunityIcons name="volume-medium" size={14} color={COLORS.text.muted} />
      )}
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const BTN = 28;
const s = StyleSheet.create({
  btn: {
    width:           BTN,
    height:          BTN,
    borderRadius:    BTN / 2,
    backgroundColor: '#1E1E24',
    borderWidth:     1,
    borderColor:     '#2A2A30',
    justifyContent:  'center',
    alignItems:      'center',
  },
  btnPlaying: {
    backgroundColor: 'rgba(201,168,76,0.12)',
    borderColor:     'rgba(201,168,76,0.4)',
  },
  btnError: {
    backgroundColor: 'rgba(239,83,80,0.1)',
    borderColor:     'rgba(239,83,80,0.3)',
  },
  btnLoading: {
    opacity: 0.7,
  },
  spinner: {
    transform: [{ scale: 0.75 }],
  },
});

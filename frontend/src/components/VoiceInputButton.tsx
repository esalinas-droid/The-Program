/**
 * VoiceInputButton — Prompt 9A
 *
 * Tap-to-start / tap-to-stop voice input using expo-av (Whisper transcription).
 * Transcribed text is passed to `onTranscribed` so the parent fills its input.
 *
 * States: idle → recording → processing → (idle | error)
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Animated,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, RADIUS, SPACING, FONTS } from '../constants/theme';
import { getAuthToken } from '../utils/auth';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL ?? '';

// ── Types ─────────────────────────────────────────────────────────────────────
type VoiceState = 'idle' | 'recording' | 'processing' | 'error';

interface Props {
  onTranscribed: (text: string) => void;
  disabled?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function VoiceInputButton({ onTranscribed, disabled = false }: Props) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [elapsed, setElapsed]       = useState(0);

  const recordingRef  = useRef<Audio.Recording | null>(null);
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const errorTimeout  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pulse animation — used during RECORDING state
  const pulseScale   = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;
  const pulseAnim    = useRef<Animated.CompositeAnimation | null>(null);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopTimer();
      if (errorTimeout.current) clearTimeout(errorTimeout.current);
      pulseAnim.current?.stop();
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, []);

  // ── Pulse animation control ──────────────────────────────────────────────
  const startPulse = useCallback(() => {
    pulseScale.setValue(1);
    pulseOpacity.setValue(0.6);
    pulseAnim.current = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale,   { toValue: 1.5, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0,   duration: 700, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(pulseScale,   { toValue: 1,   duration: 0,   useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.6, duration: 0,   useNativeDriver: true }),
        ]),
      ]),
    );
    pulseAnim.current.start();
  }, [pulseScale, pulseOpacity]);

  const stopPulse = useCallback(() => {
    pulseAnim.current?.stop();
    pulseScale.setValue(1);
    pulseOpacity.setValue(0);
  }, [pulseScale, pulseOpacity]);

  // ── Timer control ────────────────────────────────────────────────────────
  const startTimer = useCallback(() => {
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed(prev => prev + 1), 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // ── Show transient error then auto-reset ─────────────────────────────────
  const showError = useCallback(() => {
    setVoiceState('error');
    errorTimeout.current = setTimeout(() => setVoiceState('idle'), 2000);
  }, []);

  // ── Start recording ──────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      // Check / request permission
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Microphone Access Required',
          'Voice input needs microphone access. Open Settings to enable, or type your message instead.',
          [{ text: 'OK', style: 'default' }],
        );
        return;
      }

      // Configure audio session for recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      await recording.startAsync();

      recordingRef.current = recording;
      setVoiceState('recording');
      startTimer();
      startPulse();
    } catch (err) {
      console.warn('[Voice] startRecording error:', err);
      showError();
    }
  }, [startTimer, startPulse, showError]);

  // ── Stop recording and upload ────────────────────────────────────────────
  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return;

    stopTimer();
    stopPulse();

    // Guard: too short (< 0.5 s) → silent reset
    if (elapsed < 1) {
      try { await recordingRef.current.stopAndUnloadAsync(); } catch {}
      recordingRef.current = null;
      setVoiceState('idle');
      setElapsed(0);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
      return;
    }

    setVoiceState('processing');

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      // Restore audio session
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});

      if (!uri) throw new Error('No audio URI after recording');

      const token = await getAuthToken();

      // Upload via multipart form
      const uploadResult = await FileSystem.uploadAsync(
        `${BASE}/api/coach/transcribe`,
        uri,
        {
          httpMethod:  'POST',
          uploadType:  FileSystem.FileSystemUploadType.MULTIPART,
          fieldName:   'audio',
          mimeType:    'audio/m4a',
          headers:     token ? { Authorization: `Bearer ${token}` } : {},
        },
      );

      // Clean up temp file
      FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});

      if (uploadResult.status === 413) {
        Alert.alert('Recording Too Long', 'Please keep under 25 minutes.');
        setVoiceState('idle');
        return;
      }

      if (uploadResult.status !== 200) {
        throw new Error(`HTTP ${uploadResult.status}`);
      }

      const data = JSON.parse(uploadResult.body);
      const transcript = (data.transcript ?? '').trim();

      if (transcript) {
        onTranscribed(transcript);
      }
      setVoiceState('idle');
      setElapsed(0);
    } catch (err: any) {
      console.warn('[Voice] stopRecording/upload error:', err);

      const msg = (err?.message ?? '').toLowerCase();
      if (msg.includes('network') || msg.includes('fetch')) {
        Alert.alert('Connection Error', "Couldn't reach the server. Try again.");
      } else if (msg.includes('transcription')) {
        Alert.alert('Transcription Failed', 'Please try again or type your message.');
      } else {
        Alert.alert('Voice Error', 'Please try again or type your message.');
      }
      showError();
    }
  }, [elapsed, stopTimer, stopPulse, onTranscribed, showError]);

  // ── Tap handler ──────────────────────────────────────────────────────────
  const handlePress = useCallback(() => {
    if (disabled) return;
    if (voiceState === 'idle')      { startRecording(); return; }
    if (voiceState === 'recording') { stopRecording();  return; }
    // processing / error — no-op
  }, [disabled, voiceState, startRecording, stopRecording]);

  // ── Render ───────────────────────────────────────────────────────────────
  const isRecording  = voiceState === 'recording';
  const isProcessing = voiceState === 'processing';
  const isError      = voiceState === 'error';

  return (
    <View style={s.wrapper}>
      {/* Pulsing ring — only visible during recording */}
      {isRecording && (
        <Animated.View
          style={[
            s.pulseRing,
            { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
          ]}
        />
      )}

      <TouchableOpacity
        style={[
          s.btn,
          isRecording  && s.btnRecording,
          isProcessing && s.btnProcessing,
          isError      && s.btnError,
          (disabled || isProcessing) && s.btnDisabled,
        ]}
        onPress={handlePress}
        disabled={disabled || isProcessing}
        activeOpacity={0.75}
        accessibilityLabel={
          isRecording ? 'Stop recording' : isProcessing ? 'Transcribing' : 'Start voice input'
        }
      >
        {isProcessing ? (
          <MaterialCommunityIcons name="loading" size={20} color="#fff" />
        ) : isError ? (
          <MaterialCommunityIcons name="alert-circle" size={20} color="#fff" />
        ) : (
          <MaterialCommunityIcons
            name={isRecording ? 'microphone' : 'microphone-outline'}
            size={20}
            color={isRecording ? '#fff' : COLORS.text.secondary}
          />
        )}
      </TouchableOpacity>

      {/* Elapsed time label — only while recording */}
      {isRecording && (
        <Text style={s.timer}>{formatElapsed(elapsed)}</Text>
      )}

      {/* Transcribing label */}
      {isProcessing && (
        <Text style={s.processingLabel}>Transcribing…</Text>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const BTN_SIZE = 44;

const s = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  pulseRing: {
    position: 'absolute',
    width:  BTN_SIZE + 16,
    height: BTN_SIZE + 16,
    borderRadius: (BTN_SIZE + 16) / 2,
    backgroundColor: 'rgba(239,83,80,0.35)',
  },
  btn: {
    width:  BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: BTN_SIZE / 2,
    backgroundColor: '#2A2A30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnRecording: {
    backgroundColor: '#EF5350',
    shadowColor:     '#EF5350',
    shadowOpacity:   0.45,
    shadowRadius:    8,
    shadowOffset:    { width: 0, height: 2 },
    elevation:       4,
  },
  btnProcessing: {
    backgroundColor: COLORS.accent,
  },
  btnError: {
    backgroundColor: '#EF5350',
  },
  btnDisabled: {
    opacity: 0.55,
  },
  timer: {
    position: 'absolute',
    bottom: -16,
    fontSize: FONTS.sizes.xs,
    color: '#EF5350',
    fontWeight: '600' as const,
    letterSpacing: 0.5,
  },
  processingLabel: {
    position: 'absolute',
    bottom: -16,
    fontSize: FONTS.sizes.xs,
    color: COLORS.accent,
    fontWeight: '500' as const,
  },
});

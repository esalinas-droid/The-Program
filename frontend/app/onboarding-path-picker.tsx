import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  StatusBar, Platform, ToastAndroid, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { profileApi } from '../src/utils/api';

// ── Design tokens (inline to keep the file self-contained) ────────────────────
const BG      = '#0A0A0C';
const SURFACE = '#111115';
const ACCENT  = '#C9A84C';
const MUTED   = '#555560';
const TEXT    = '#F2F2F7';
const TEXT2   = '#A0A0B0';
const BORDER  = '#1E1E26';
const TEAL    = '#2A9D8F';

const FONTS = {
  heavy:    '800' as const,
  bold:     '700' as const,
  semibold: '600' as const,
  regular:  '400' as const,
};

// ── Toast helper (cross-platform) ─────────────────────────────────────────────
function showToast(msg: string) {
  if (Platform.OS === 'android') {
    ToastAndroid.show(msg, ToastAndroid.LONG);
  } else {
    Alert.alert('', msg, [{ text: 'OK' }]);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
export default function OnboardingPathPicker() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  // mode === 'switch' → shown from Settings "Switch to a program";
  // hides "Just track my training" since the user is already tracking.
  const isSwitchMode = mode === 'switch';
  const [choosingPrograms, setChoosingPrograms] = useState(false);

  const handleBuild = () => {
    // In switch mode the athlete already has a profile and training history, so
    // send them down the rebuild path: their answers are pre-filled, the name
    // step is skipped, and the plan is rebuilt rather than created from scratch.
    // Without this, "+ New Program" treated an existing athlete as a brand new
    // user and re-asked every onboarding question.
    router.push(isSwitchMode
      ? { pathname: '/onboarding-intake', params: { mode: 'rebuild' } }
      : '/onboarding-intake');
  };

  const handleImport = () => {
    router.push('/import-document' as any);
  };

  const handleFree = () => {
    router.push({ pathname: '/onboarding-intake', params: { path: 'free' } });
  };

  /** A3: user picks an existing program — flip mode then send to program library */
  const handleChooseExisting = async () => {
    if (choosingPrograms) return;
    setChoosingPrograms(true);
    try {
      await profileApi.switchMode('program');
    } catch (e) {
      console.warn('[PathPicker] switchMode error', e);
    }
    setChoosingPrograms(false);
    router.replace('/programs' as any);
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />
      <View style={s.container}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={s.header}>
          {/* A2: Close button — switch mode only */}
          {isSwitchMode && (
            <TouchableOpacity
              style={s.closeBtn}
              onPress={() => router.back()}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="close" size={22} color={MUTED} />
            </TouchableOpacity>
          )}
          <Text style={s.eyebrow}>THE PROGRAM</Text>
          <Text style={s.headline}>How do you want{'\n'}to train?</Text>
          <Text style={s.sub}>
            Pick the setup that matches how you actually work. You can switch later in Settings.
          </Text>
        </View>

        {/* ── Cards ──────────────────────────────────────────────────────── */}
        <View style={s.cards}>

          {/* CARD 1 — Build me a program */}
          <TouchableOpacity style={s.card} onPress={handleBuild} activeOpacity={0.82}>
            <View style={s.cardLeft}>
              <View style={[s.iconWrap, { backgroundColor: 'rgba(201,168,76,0.12)' }]}>
                <MaterialCommunityIcons name="brain" size={26} color={ACCENT} />
              </View>
              <View style={s.cardText}>
                <Text style={s.cardTitle}>Build me a program</Text>
                <Text style={s.cardDesc}>
                  I'll generate a personalized 52-week plan from your goals, lifts, and injuries
                </Text>
              </View>
            </View>
            <View style={s.cardFooter}>
              <View style={[s.pill, s.pillGold]}>
                <Text style={[s.pillText, { color: ACCENT }]}>Most popular</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={MUTED} />
            </View>
          </TouchableOpacity>

          {/* CARD 2 — Import my program */}
          <TouchableOpacity style={s.card} onPress={handleImport} activeOpacity={0.82}>
            <View style={s.cardLeft}>
              <View style={[s.iconWrap, { backgroundColor: 'rgba(42,157,143,0.12)' }]}>
                <MaterialCommunityIcons name="upload-outline" size={26} color={TEAL} />
              </View>
              <View style={s.cardText}>
                <Text style={s.cardTitle}>Import my program</Text>
                <Text style={s.cardDesc}>
                  I have a coach-built program (PDF, doc, screenshot) — upload it and the app will extract the text
                </Text>
              </View>
            </View>
            <View style={s.cardFooter}>
              <View style={[s.pill, { backgroundColor: 'rgba(42,157,143,0.12)', borderColor: 'rgba(42,157,143,0.25)' }]}>
                <Text style={[s.pillText, { color: TEAL }]}>Upload & extract</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={MUTED} />
            </View>
          </TouchableOpacity>

          {/* A3: CARD — Choose from existing programs (switch mode only) */}
          {isSwitchMode && (
            <TouchableOpacity
              style={[s.card, choosingPrograms && { opacity: 0.6 }]}
              onPress={handleChooseExisting}
              activeOpacity={0.82}
              disabled={choosingPrograms}
            >
              <View style={s.cardLeft}>
                <View style={[s.iconWrap, { backgroundColor: 'rgba(201,168,76,0.12)' }]}>
                  {choosingPrograms
                    ? <ActivityIndicator size="small" color={ACCENT} />
                    : <MaterialCommunityIcons name="bookmark-multiple-outline" size={26} color={ACCENT} />
                  }
                </View>
                <View style={s.cardText}>
                  <Text style={s.cardTitle}>Choose from my programs</Text>
                  <Text style={s.cardDesc}>
                    Pick a program you've imported or built before.
                  </Text>
                </View>
              </View>
              <View style={s.cardFooter}>
                <View style={[s.pill, s.pillGold]}>
                  <Text style={[s.pillText, { color: ACCENT }]}>My library</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={MUTED} />
              </View>
            </TouchableOpacity>
          )}

          {/* CARD 3 — Just track (hidden in switch mode) */}
          {!isSwitchMode && (
            <TouchableOpacity style={s.card} onPress={handleFree} activeOpacity={0.82}>
              <View style={s.cardLeft}>
                <View style={[s.iconWrap, { backgroundColor: 'rgba(42,157,143,0.1)' }]}>
                  <MaterialCommunityIcons name="notebook-outline" size={26} color={TEAL} />
                </View>
                <View style={s.cardText}>
                  <Text style={s.cardTitle}>Just track my training</Text>
                  <Text style={s.cardDesc}>
                    I do my own programming. Skip plan generation — log sessions, track PRs, talk to the coach
                  </Text>
                </View>
              </View>
              <View style={s.cardFooter}>
                <View style={[s.pill, { backgroundColor: 'rgba(42,157,143,0.12)', borderColor: 'rgba(42,157,143,0.25)' }]}>
                  <Text style={[s.pillText, { color: TEAL }]}>Power users</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={MUTED} />
              </View>
            </TouchableOpacity>
          )}

        </View>

        {/* ── Footer note ─────────────────────────────────────────────────── */}
        <Text style={s.footerNote}>
          You can switch modes anytime from Settings → Account
        </Text>

      </View>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: BG },
  container:   { flex: 1, paddingHorizontal: 24, justifyContent: 'center', paddingBottom: 32 },

  header:      { marginBottom: 32 },
  closeBtn: {
    position: 'absolute', top: 0, left: -6, zIndex: 10,
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  eyebrow:     { fontSize: 11, fontWeight: FONTS.bold, color: ACCENT, letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 10, marginTop: 32 },
  headline:    { fontSize: 34, fontWeight: FONTS.heavy, color: TEXT, lineHeight: 40, marginBottom: 12 },
  sub:         { fontSize: 15, color: TEXT2, lineHeight: 22 },

  cards:       { gap: 12 },

  card: {
    backgroundColor: SURFACE,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 20,
    gap: 14,
  },
  cardDisabled: { opacity: 0.65 },
  cardLeft:    { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  iconWrap:    { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardText:    { flex: 1, gap: 4 },
  cardTitle:   { fontSize: 17, fontWeight: FONTS.bold, color: TEXT },
  cardDesc:    { fontSize: 13, color: TEXT2, lineHeight: 19 },

  cardFooter:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4, borderTopWidth: 1, borderTopColor: BORDER },

  pill:        { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100, borderWidth: 1 },
  pillGold:    { backgroundColor: 'rgba(201,168,76,0.1)', borderColor: 'rgba(201,168,76,0.3)' },
  pillMuted:   { backgroundColor: 'rgba(80,80,90,0.15)', borderColor: 'rgba(80,80,90,0.25)' },
  pillText:    { fontSize: 11, fontWeight: FONTS.semibold, letterSpacing: 0.3 },

  footerNote:  { textAlign: 'center', fontSize: 12, color: MUTED, marginTop: 24 },
});

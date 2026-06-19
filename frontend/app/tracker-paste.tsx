/**
 * tracker-paste.tsx — Paste workout text → AI parse → /tracker-review
 *
 * FREE path: no image credits, no Supabase storage.
 * The user pastes (or types) their workout; we POST to
 * /api/tracker/parse-session-text and hand the result to
 * tracker-review exactly like the image-scan flow does.
 */

import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, FONTS, RADIUS } from '../src/constants/theme';
import { logApi } from '../src/utils/api';
import { setParsedSession } from '../src/utils/parsedSessionStore';

const GOLD    = COLORS.accent;
const MAX_LEN = 4000;          // must mirror TEXT_PARSE_MAX_CHARS in backend

export default function TrackerPasteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [text,    setText]    = useState('');
  const [parsing, setParsing] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const handleParse = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      Alert.alert('Nothing to parse', 'Paste or type your workout first.');
      return;
    }
    if (trimmed.length > MAX_LEN) {
      Alert.alert(
        'Text too long',
        `Your workout text is ${trimmed.length} characters. Please trim it to ${MAX_LEN} characters or fewer.`,
      );
      return;
    }

    setParsing(true);
    try {
      const data: any = await logApi.parseWorkoutText(trimmed);

      // ── Empty-guard — same pattern as image scan ──────────────────────────
      if (!data.exercises || data.exercises.length === 0) {
        Alert.alert(
          'No exercises found',
          data.error
            ? `Parse error: ${data.error}`
            : "We couldn't find any exercises in that text. Try pasting a more structured workout (e.g., \"Squat 3x5 @ 225 lbs\").",
        );
        return;
      }

      // ── Hand off to tracker-review (same as image scan) ───────────────────
      setParsedSession({
        session_title: data.session_title || null,
        session_date:  data.session_date  || null,
        confidence:    data.confidence    || 'low',
        exercises:     data.exercises     || [],
        image_id:      undefined,          // no image for text parse
      });

      router.push({
        pathname: '/tracker-review',
        params: {
          source:                  'tracker_upload',
          imageId:                 '',
          userHasActiveProgram:    'false',
        },
      } as any);

    } catch (err: any) {
      Alert.alert(
        'Parse failed',
        err?.message || 'Could not parse the workout text. Please try again.',
      );
    } finally {
      setParsing(false);
    }
  };

  const charCount  = text.length;
  const nearLimit  = charCount > MAX_LEN * 0.85;
  const overLimit  = charCount > MAX_LEN;
  const canSubmit  = text.trim().length > 0 && !overLimit && !parsing;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 56 : 0}
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.headerBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={COLORS.text.primary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Paste Workout</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[s.body, { paddingBottom: 120 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Subtitle ──────────────────────────────────────────────── */}
          <Text style={s.subtitle}>
            Paste or type your workout below. AI will parse it into exercises you can log — completely free.
          </Text>

          {/* ── Examples chip row ─────────────────────────────────────── */}
          <View style={s.exampleRow}>
            <MaterialCommunityIcons name="lightbulb-outline" size={13} color={GOLD} />
            <Text style={s.exampleText}>
              e.g.{' '}
              <Text style={s.exampleCode}>Squat 3×5 @ 225</Text>
              {'  '}
              <Text style={s.exampleCode}>Bench 4×8 @ 135 RPE 8</Text>
              {'  '}
              <Text style={s.exampleCode}>Plank 3×60s</Text>
            </Text>
          </View>

          {/* ── Text input ────────────────────────────────────────────── */}
          <View style={[s.inputCard, overLimit && s.inputCardError]}>
            <TextInput
              ref={inputRef}
              style={s.input}
              value={text}
              onChangeText={setText}
              placeholder={"Paste your workout here…\n\ne.g.:\nSquat 3×5 @ 225 lbs\nBench press 4×8 @ 135 lbs\nRDL 3×10 @ 155 lbs\nPlank 3×60 sec"}
              placeholderTextColor={COLORS.text.muted}
              multiline
              textAlignVertical="top"
              autoFocus
              autoCorrect={false}
              autoCapitalize="sentences"
            />
          </View>

          {/* ── Char counter ──────────────────────────────────────────── */}
          <Text style={[s.charCount, nearLimit && s.charCountNear, overLimit && s.charCountOver]}>
            {charCount} / {MAX_LEN}
            {overLimit ? '  — please trim to continue' : ''}
          </Text>
        </ScrollView>

        {/* ── Sticky footer ─────────────────────────────────────────────── */}
        <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, SPACING.md) }]}>
          <TouchableOpacity
            style={[s.parseBtn, !canSubmit && s.parseBtnDisabled]}
            onPress={handleParse}
            disabled={!canSubmit}
            activeOpacity={0.85}
          >
            {parsing ? (
              <>
                <ActivityIndicator size="small" color="#000" />
                <Text style={s.parseBtnText}>Parsing…</Text>
              </>
            ) : (
              <>
                <MaterialCommunityIcons name="brain" size={18} color={canSubmit ? '#000' : COLORS.text.muted} />
                <Text style={[s.parseBtnText, !canSubmit && s.parseBtnTextDisabled]}>Parse Workout</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: COLORS.background },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', height: 56,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  headerBack:  { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1, textAlign: 'center',
    color: COLORS.text.primary, fontSize: FONTS.sizes.lg,
    fontWeight: FONTS.weights.semibold,
  },

  // Body
  body: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },

  subtitle: {
    color: COLORS.text.secondary, fontSize: FONTS.sizes.sm,
    lineHeight: 20, marginBottom: SPACING.md,
  },

  // Example row
  exampleRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: GOLD + '10', borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: GOLD + '30',
    padding: SPACING.sm + 2, marginBottom: SPACING.md,
  },
  exampleText: { flex: 1, fontSize: FONTS.sizes.xs, color: COLORS.text.secondary, lineHeight: 18 },
  exampleCode: { color: GOLD, fontWeight: FONTS.weights.semibold },

  // Input card
  inputCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border,
    minHeight: 280, overflow: 'hidden',
  },
  inputCardError: { borderColor: '#EF5350' },
  input: {
    flex: 1, minHeight: 280,
    padding: SPACING.md,
    color: COLORS.text.primary, fontSize: FONTS.sizes.base,
    lineHeight: 22,
  },

  // Char counter
  charCount: {
    textAlign: 'right', marginTop: SPACING.xs,
    fontSize: FONTS.sizes.xs, color: COLORS.text.muted,
  },
  charCountNear: { color: '#F5A623' },
  charCountOver: { color: '#EF5350', fontWeight: FONTS.weights.semibold },

  // Footer
  footer: {
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.md,
    backgroundColor: COLORS.background,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  parseBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, backgroundColor: GOLD,
    borderRadius: RADIUS.lg, paddingVertical: SPACING.md + 2,
    minHeight: 52,
  },
  parseBtnDisabled: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  parseBtnText: {
    color: '#000', fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold,
  },
  parseBtnTextDisabled: { color: COLORS.text.muted },
});

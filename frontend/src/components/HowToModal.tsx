/**
 * HowToModal — shared between Program-mode (today.tsx) and Tracker-mode (tracker-session.tsx)
 * YouTube search embedded as WebView on native; WebBrowser fallback on web / load-error.
 * READY FOR EAS BUILD: WebView branch only executes on iOS/Android native builds.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  Animated, Modal, Pressable, View, Text, TouchableOpacity,
  ActivityIndicator, Platform, StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';
import { COLORS, SPACING, FONTS, RADIUS } from '../constants/theme';

interface HowToModalProps {
  visible: boolean;
  exercise: string;
  videoUrl?: string;
  onClose: () => void;
}

export default function HowToModal({ visible, exercise, videoUrl, onClose }: HowToModalProps) {
  const [webError, setWebError] = useState(false);
  const showFallback = Platform.OS === 'web' || webError;
  const slideAnim = useRef(new Animated.Value(900)).current;
  const query = encodeURIComponent(`${exercise} form technique tutorial`);
  // Use a pasted custom link if provided, else auto-generate the YouTube search.
  const ytUrl  = (videoUrl && videoUrl.trim())
    ? videoUrl.trim()
    : `https://www.youtube.com/results?search_query=${query}`;

  useEffect(() => {
    if (visible) {
      setWebError(false);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 220 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 900, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible]);

  const handleOpenBrowser = async () => {
    try { await WebBrowser.openBrowserAsync(ytUrl); } catch { /* no-op */ }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={ht.overlay} onPress={onClose} />
      <Animated.View style={[ht.sheet, { transform: [{ translateY: slideAnim }] }]}>
        {/* Header */}
        <View style={ht.header}>
          <TouchableOpacity onPress={onClose} style={ht.backBtn} activeOpacity={0.7}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.text.primary} />
            <Text style={ht.backLabel}>Back</Text>
          </TouchableOpacity>
          <Text style={ht.headerTitle} numberOfLines={1}>{exercise}</Text>
          <View style={{ width: 64 }} />
        </View>

        {/* Content: WebView on native, fallback on web / error */}
        {/* READY FOR EAS BUILD: WebView branch only runs on iOS/Android */}
        {showFallback ? (
          <View style={ht.fallback}>
            <MaterialCommunityIcons name="youtube" size={52} color="#FF0000" />
            <Text style={ht.fallbackTitle}>Search on YouTube</Text>
            <Text style={ht.fallbackSub}>
              {Platform.OS === 'web'
                ? 'On the native app this loads embedded inside the session. Web opens in a new tab.'
                : 'Could not load embedded player — opening in in-app browser instead.'}
            </Text>
            <TouchableOpacity style={ht.openBtn} onPress={handleOpenBrowser} activeOpacity={0.85}>
              <MaterialCommunityIcons name="open-in-app" size={16} color="#fff" />
              <Text style={ht.openBtnText}>Search: {exercise}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* READY FOR EAS BUILD — renders on iOS/Android only */
          <WebView
            source={{ uri: ytUrl }}
            style={{ flex: 1 }}
            onError={() => setWebError(true)}
            onHttpError={() => setWebError(true)}
            startInLoadingState
            renderLoading={() => (
              <View style={ht.loadingWrap}>
                <ActivityIndicator color={COLORS.accent} />
                <Text style={ht.loadingText}>Searching YouTube…</Text>
              </View>
            )}
          />
        )}
      </Animated.View>
    </Modal>
  );
}

const ht = StyleSheet.create({
  overlay:      { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet:        { position: 'absolute', left: 0, right: 0, bottom: 0, top: 80, backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.surface },
  backBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, width: 64 },
  backLabel:    { fontSize: FONTS.sizes.sm, color: COLORS.accent, fontWeight: FONTS.weights.semibold },
  headerTitle:  { flex: 1, textAlign: 'center', fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  fallback:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: SPACING.md },
  fallbackTitle:{ fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, textAlign: 'center' },
  fallbackSub:  { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, textAlign: 'center', lineHeight: 20 },
  openBtn:      { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: '#FF0000', borderRadius: RADIUS.lg, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md },
  openBtnText:  { color: '#fff', fontWeight: FONTS.weights.heavy, fontSize: FONTS.sizes.base },
  loadingWrap:  { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: SPACING.sm },
  loadingText:  { fontSize: FONTS.sizes.sm, color: COLORS.text.muted },
});

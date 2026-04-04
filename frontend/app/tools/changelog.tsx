import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, FONTS, RADIUS } from '../../src/constants/theme';
import { changeLogApi } from '../../src/utils/api';

const CHANGE_TYPE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  substitution:  { icon: 'swap-horizontal', color: COLORS.accent,             label: 'Substitution' },
  rotation:      { icon: 'rotate-3d-variant', color: COLORS.accentBlue,      label: 'Rotation' },
  'auto-adjust': { icon: 'tune-vertical',   color: COLORS.sessions.de_lower.text, label: 'Load Adj.' },
  deload:        { icon: 'sleep',            color: '#FF9800',                label: 'Deload' },
  rag:           { icon: 'dna',              color: COLORS.status.success,   label: 'Research' },
  default:       { icon: 'history',          color: COLORS.text.muted,       label: 'Change' },
};

export default function ChangeLogScreen() {
  const router = useRouter();
  const [changes, setChanges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [undoingId, setUndoingId] = useState<string | null>(null);

  const loadChanges = useCallback(async () => {
    try {
      const data = await changeLogApi.get();
      setChanges(data.changes || []);
    } catch { /* No changes yet */ }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { loadChanges(); }, [loadChanges]));

  const handleUndo = async (changeId: string, original: string, replacement: string) => {
    Alert.alert(
      'Undo Change',
      `Revert from "${replacement}" back to "${original}"?\n\nThis will update your upcoming sessions.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Undo',
          style: 'destructive',
          onPress: async () => {
            try {
              setUndoingId(changeId);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              const result = await changeLogApi.undo(changeId);
              if (result.success) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setChanges(prev => prev.map(c =>
                  c.changeId === changeId ? { ...c, undone: true, undoable: false } : c
                ));
              }
            } catch (e) {
              Alert.alert('Error', 'Could not undo this change.');
            } finally {
              setUndoingId(null);
            }
          },
        },
      ]
    );
  };

  if (loading) return <View style={s.loading}><ActivityIndicator color={COLORS.accent} /></View>;

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={COLORS.text.secondary} />
        </TouchableOpacity>
        <View style={s.headerText}>
          <Text style={s.title}>CHANGE LOG</Text>
          <Text style={s.subtitle}>AI program decisions — transparent & undoable</Text>
        </View>
      </View>

      {/* Info banner */}
      <View style={s.infoBanner}>
        <MaterialCommunityIcons name="undo-variant" size={14} color={COLORS.accentBlue} />
        <Text style={s.infoText}>
          Every AI program change is logged here. Tap <Text style={{ color: COLORS.accent }}>Undo</Text> to revert any substitution back to the original exercise.
        </Text>
      </View>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
        {changes.length === 0 && (
          <View style={s.emptyCard}>
            <Text style={s.emptyIcon}>📋</Text>
            <Text style={s.emptyTitle}>No changes yet</Text>
            <Text style={s.emptyText}>
              As the AI adapts your training — based on pain reports, rotation windows, or load adjustments — every decision will appear here with an undo option.
            </Text>
          </View>
        )}

        {changes.map((change, i) => {
          const cfg = CHANGE_TYPE_CONFIG[change.changeType] || CHANGE_TYPE_CONFIG.default;
          const isUndoing = undoingId === change.changeId;

          return (
            <View
              key={change.changeId || i}
              style={[s.changeCard, change.undone && s.changeCardUndone]}
            >
              {/* Row 1: type badge + date + undo button */}
              <View style={s.changeHeader}>
                <View style={[s.typeBadge, { backgroundColor: cfg.color + '20' }]}>
                  <MaterialCommunityIcons name={cfg.icon as any} size={11} color={cfg.color} />
                  <Text style={[s.typeText, { color: cfg.color }]}>{cfg.label.toUpperCase()}</Text>
                </View>
                {change.week && (
                  <Text style={s.weekBadge}>WK {change.week}</Text>
                )}
                <Text style={s.changeDate}>
                  {change.date ? new Date(change.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                </Text>
                {change.undone ? (
                  <View style={s.undoneTag}>
                    <Text style={s.undoneTagText}>UNDONE</Text>
                  </View>
                ) : change.undoable ? (
                  <TouchableOpacity
                    onPress={() => handleUndo(change.changeId, change.original, change.replacement)}
                    style={s.undoBtn}
                    disabled={isUndoing}
                  >
                    {isUndoing ? (
                      <ActivityIndicator size="small" color={COLORS.accent} />
                    ) : (
                      <>
                        <MaterialCommunityIcons name="undo" size={12} color={COLORS.accent} />
                        <Text style={s.undoBtnText}>Undo</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Row 2: reason/explanation */}
              <Text style={s.changeReason}>{change.reason}</Text>

              {/* Row 3: exercise diff */}
              {change.original && change.replacement && (
                <View style={s.diffRow}>
                  <Text style={[s.diffEx, change.undone && { textDecorationLine: 'none', color: COLORS.text.muted }]}>
                    {change.undone ? change.original : change.replacement}
                  </Text>
                  {!change.undone && (
                    <>
                      <MaterialCommunityIcons name="arrow-left" size={12} color={COLORS.text.muted} style={{ marginHorizontal: 4 }} />
                      <Text style={s.diffOriginal}>{change.original}</Text>
                    </>
                  )}
                </View>
              )}
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: COLORS.background },
  scroll:  { flex: 1 },
  loading: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },

  header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.sm, gap: SPACING.sm },
  backBtn:    { padding: 4 },
  headerText: { flex: 1 },
  title:      { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy as any, color: COLORS.text.primary, letterSpacing: 2 },
  subtitle:   { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, marginTop: 2 },

  infoBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, backgroundColor: COLORS.accentBlue + '12', borderRadius: RADIUS.md, padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.accentBlue + '30' },
  infoText:   { flex: 1, fontSize: FONTS.sizes.xs, color: COLORS.text.secondary, lineHeight: 18 },

  emptyCard:  { marginHorizontal: SPACING.lg, marginTop: SPACING.xl, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: 'center' },
  emptyIcon:  { fontSize: 32, marginBottom: SPACING.sm },
  emptyTitle: { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold as any, color: COLORS.text.primary, marginBottom: 4 },
  emptyText:  { color: COLORS.text.muted, fontSize: FONTS.sizes.sm, lineHeight: 20, textAlign: 'center' },

  changeCard:       { marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  changeCardUndone: { opacity: 0.55 },
  changeHeader:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  typeBadge:        { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: RADIUS.full },
  typeText:         { fontSize: 9, fontWeight: '700' as any, letterSpacing: 0.8 },
  weekBadge:        { fontSize: 9, color: COLORS.text.muted, fontWeight: '600' as any },
  changeDate:       { color: COLORS.text.muted, fontSize: FONTS.sizes.xs, marginLeft: 'auto' },
  changeReason:     { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm, lineHeight: 19, marginBottom: 6 },

  diffRow:      { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', paddingTop: 6, borderTopWidth: 1, borderTopColor: COLORS.border },
  diffEx:       { color: COLORS.status.success, fontSize: FONTS.sizes.xs, fontWeight: '600' as any },
  diffOriginal: { color: COLORS.text.muted, fontSize: FONTS.sizes.xs, textDecorationLine: 'line-through' as any },

  undoBtn:      { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full, backgroundColor: COLORS.accent + '18', borderWidth: 1, borderColor: COLORS.accent + '40' },
  undoBtnText:  { color: COLORS.accent, fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold as any },
  undoneTag:    { paddingHorizontal: 7, paddingVertical: 2, borderRadius: RADIUS.full, backgroundColor: COLORS.border },
  undoneTagText: { fontSize: 9, color: COLORS.text.muted, fontWeight: '700' as any, letterSpacing: 1 },
});


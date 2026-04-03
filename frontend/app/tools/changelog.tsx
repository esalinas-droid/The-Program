import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS } from '../../src/constants/theme';
import { programApi } from '../../src/utils/api';

const SCOPE_COLORS: Record<string, string> = {
  day: COLORS.accentBlue,
  block: COLORS.accent,
  year: COLORS.status.success,
};

const TRIGGER_ICONS: Record<string, string> = {
  pain: '🔴',
  readiness: '🟡',
  missedSession: '⚪',
  upload: '📎',
  chat: '💬',
  performance: '📈',
  userRequest: '🔧',
};

export default function ChangeLogScreen() {
  const router = useRouter();
  const [changes, setChanges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await programApi.getChangeLog();
        setChanges(data.changes || []);
      } catch { /* No changes yet */ }
      setLoading(false);
    })();
  }, []);

  if (loading) return <View style={s.loading}><ActivityIndicator color={COLORS.accent} /></View>;

  return (
    <SafeAreaView style={s.safe}>
      {/* Header with back button */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={COLORS.text.secondary} />
        </TouchableOpacity>
        <View style={s.headerText}>
          <Text style={s.title}>CHANGE LOG</Text>
          <Text style={s.subtitle}>AI program decisions — transparent & traceable</Text>
        </View>
      </View>

      {/* Info banner — explains what this screen is */}
      <View style={s.infoBanner}>
        <MaterialCommunityIcons name="information-outline" size={14} color={COLORS.accentBlue} />
        <Text style={s.infoText}>
          Read-only history. The AI logs every program adaptation here — exercise swaps, load changes, block adjustments — so you always know what changed and why.
        </Text>
      </View>

      <ScrollView style={s.scroll}>
        {changes.length === 0 && (
          <View style={s.emptyCard}>
            <Text style={s.emptyIcon}>📋</Text>
            <Text style={s.emptyTitle}>No changes yet</Text>
            <Text style={s.emptyText}>
              As the AI adapts your training — based on pain reports, missed sessions, or performance data — every decision will appear here.
            </Text>
          </View>
        )}

        {changes.map((change, i) => (
          <View key={change.changeId || i} style={s.changeCard}>
            <View style={s.changeHeader}>
              <Text style={s.triggerIcon}>{TRIGGER_ICONS[change.triggerType] || '🔧'}</Text>
              <View style={[s.scopeBadge, { backgroundColor: (SCOPE_COLORS[change.scope] || COLORS.text.muted) + '20' }]}>
                <Text style={[s.scopeText, { color: SCOPE_COLORS[change.scope] || COLORS.text.muted }]}>
                  {(change.scope || '').toUpperCase()}
                </Text>
              </View>
              <Text style={s.changeDate}>
                {change.timestamp ? new Date(change.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
              </Text>
            </View>
            <Text style={s.changeExplanation}>{change.explanation}</Text>
            {change.oldValue && change.newValue && (
              <View style={s.diffRow}>
                <Text style={s.diffOld}>{change.oldValue}</Text>
                <Text style={s.diffArrow}> → </Text>
                <Text style={s.diffNew}>{change.newValue}</Text>
              </View>
            )}
          </View>
        ))}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  loading: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.sm, gap: SPACING.sm },
  backBtn: { padding: 4 },
  headerText: { flex: 1 },
  title: { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy as any, color: COLORS.text.primary, letterSpacing: 2 },
  subtitle: { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, marginTop: 2 },

  infoBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, backgroundColor: COLORS.accentBlue + '12', borderRadius: RADIUS.md, padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.accentBlue + '30' },
  infoText: { flex: 1, fontSize: FONTS.sizes.xs, color: COLORS.text.secondary, lineHeight: 18 },

  emptyCard: { marginHorizontal: SPACING.lg, marginTop: SPACING.xl, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: 'center' },
  emptyIcon: { fontSize: 32, marginBottom: SPACING.sm },
  emptyTitle: { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold as any, color: COLORS.text.primary, marginBottom: SPACING.xs || 4 },
  emptyText: { color: COLORS.text.muted, fontSize: FONTS.sizes.sm, lineHeight: 20, textAlign: 'center' },

  changeCard: { marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.md },
  changeHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  triggerIcon: { fontSize: 14 },
  scopeBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: RADIUS.full },
  scopeText: { fontSize: 9, fontWeight: '700' as any, letterSpacing: 1 },
  changeDate: { color: COLORS.text.muted, fontSize: FONTS.sizes.xs, marginLeft: 'auto' },
  changeExplanation: { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm, lineHeight: 20 },
  diffRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: SPACING.sm, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border },
  diffOld: { color: COLORS.status.error, fontSize: FONTS.sizes.xs, textDecorationLine: 'line-through' as any },
  diffArrow: { color: COLORS.text.muted, fontSize: FONTS.sizes.xs },
  diffNew: { color: COLORS.status.success, fontSize: FONTS.sizes.xs, fontWeight: '600' as any },
});

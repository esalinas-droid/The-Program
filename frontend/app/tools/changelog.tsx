import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, ActivityIndicator } from 'react-native';
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
      <ScrollView style={s.scroll}>
        <View style={s.header}>
          <Text style={s.title}>CHANGE LOG</Text>
          <Text style={s.subtitle}>Every AI program change — transparent and traceable</Text>
        </View>

        {changes.length === 0 && (
          <View style={s.emptyCard}>
            <Text style={s.emptyText}>No program changes yet. Changes will appear here as the AI adapts your training based on performance, pain reports, and your requests.</Text>
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

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  loading: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
  header: { padding: SPACING.lg, paddingTop: SPACING.xl },
  title: { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.heavy as any, color: COLORS.text.primary, letterSpacing: 2 },
  subtitle: { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, marginTop: 4 },
  emptyCard: { marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg },
  emptyText: { color: COLORS.text.muted, fontSize: FONTS.sizes.sm, lineHeight: 20 },
  changeCard: { marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg },
  changeHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  triggerIcon: { fontSize: 16 },
  scopeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.full },
  scopeText: { fontSize: 10, fontWeight: '700' as any, letterSpacing: 1 },
  changeDate: { color: COLORS.text.muted, fontSize: FONTS.sizes.xs, marginLeft: 'auto' },
  changeExplanation: { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm, lineHeight: 20 },
  diffRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: SPACING.sm, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border },
  diffOld: { color: COLORS.status.error, fontSize: FONTS.sizes.xs, textDecorationLine: 'line-through' as any },
  diffArrow: { color: COLORS.text.muted, fontSize: FONTS.sizes.xs },
  diffNew: { color: COLORS.status.success, fontSize: FONTS.sizes.xs, fontWeight: '600' as any },
});

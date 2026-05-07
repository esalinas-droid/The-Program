/**
 * StartFromPicker — shared week-selection component used by:
 *   - build-plan.tsx  (first activation from a document)
 *   - programs/[id].tsx  (re-activation from program library)
 *
 * Displays block-grouped week rows with a selection indicator.
 * Shows an optional "Resume from Week N" callout when isReactivation is true.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS } from '../constants/theme';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface WeekItem {
  weekNumber:   number;
  sessionCount: number;
  isDeload:     boolean;
  isTest:       boolean;
  goal:         string;
}

export interface BlockGroup {
  blockName: string;
  startWeek: number;
  endWeek:   number;
  weeks:     WeekItem[];
}

export interface StartFromPickerProps {
  plan:           Record<string, any> | undefined;
  selectedWeek:   number;
  onSelect:       (week: number) => void;
  isReactivation: boolean;
  smartDefault:   number;
}

// ── Helper ────────────────────────────────────────────────────────────────────
/** Flatten phases → blocks → weeks into a flat list of BlockGroups for the picker. */
export function buildBlockGroups(plan: Record<string, any>): BlockGroup[] {
  const groups: BlockGroup[] = [];
  for (const ph of plan?.phases ?? []) {
    for (const bl of ph?.blocks ?? []) {
      const rawWeeks: any[] = bl?.weeks ?? [];
      if (!rawWeeks.length) continue;
      const nums = rawWeeks.map((w: any) => w.weekNumber as number);
      groups.push({
        blockName: (bl.blockName || bl.blockGoal || `Block ${bl.blockNumber ?? groups.length + 1}`),
        startWeek: Math.min(...nums),
        endWeek:   Math.max(...nums),
        weeks: rawWeeks.map((w: any) => ({
          weekNumber:   w.weekNumber as number,
          sessionCount: ((w.sessions ?? []) as any[]).length,
          isDeload:     !!w.isDeload,
          isTest:       !!w.isTest,
          goal:         (bl.blockGoal || ph.goal || '') as string,
        })),
      });
    }
  }
  // Fallback: if plan has no blocks, create one synthetic group with all weeks
  if (!groups.length) {
    const total = plan?.totalWeeks ?? 0;
    if (total > 0) {
      groups.push({
        blockName: 'WEEKS',
        startWeek: 1,
        endWeek:   total,
        weeks: Array.from({ length: total }, (_, i) => ({
          weekNumber:   i + 1,
          sessionCount: 0,
          isDeload:     (plan?.deloadWeeks ?? []).includes(i + 1),
          isTest:       (plan?.testingWeeks ?? []).includes(i + 1),
          goal:         '',
        })),
      });
    }
  }
  return groups;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function StartFromPicker({
  plan, selectedWeek, onSelect, isReactivation, smartDefault,
}: StartFromPickerProps) {
  if (!plan) return null;
  const groups = buildBlockGroups(plan);
  if (!groups.length) return null;

  return (
    <View style={ps.section}>
      {/* Section header */}
      <Text style={ps.sectionTitle}>START FROM</Text>
      <Text style={ps.subtitle}>Pick the week you want to begin training.</Text>

      {/* Reactivation callout */}
      {isReactivation && (
        <View style={ps.callout}>
          <MaterialCommunityIcons name="calendar-clock" size={16} color={COLORS.accent} />
          <Text style={ps.calloutText}>
            Suggested start:{' '}
            <Text style={{ fontWeight: '600' }}>Week {smartDefault}</Text>
            {' '}— picks up where your last session left off.
          </Text>
        </View>
      )}

      {/* Block groups */}
      {groups.map((group) => (
        <View key={group.blockName + group.startWeek}>
          {/* Block header label */}
          <Text style={ps.blockLabel}>
            {group.blockName.toUpperCase()}
            {' · '}
            WEEK{group.startWeek === group.endWeek ? '' : 'S'}{' '}
            {group.startWeek === group.endWeek
              ? group.startWeek
              : `${group.startWeek}–${group.endWeek}`}
          </Text>

          {/* Week rows */}
          {group.weeks.map((w) => {
            const sel = w.weekNumber === selectedWeek;
            let meta = '';
            if (w.isDeload)      meta = 'Deload week';
            else if (w.isTest)   meta = 'Testing week';
            else if (w.goal)     meta = `${w.goal}${w.sessionCount ? ` · ${w.sessionCount} session${w.sessionCount !== 1 ? 's' : ''}` : ''}`;
            else if (w.sessionCount) meta = `${w.sessionCount} session${w.sessionCount !== 1 ? 's' : ''}`;

            return (
              <TouchableOpacity
                key={w.weekNumber}
                style={[ps.weekRow, sel ? ps.weekRowSel : ps.weekRowUnsel]}
                onPress={() => onSelect(w.weekNumber)}
                activeOpacity={0.7}
              >
                <View style={[ps.circle, sel ? ps.circleSel : ps.circleUnsel]}>
                  <Text style={[ps.circleNum, sel ? ps.circleNumSel : ps.circleNumUnsel]}>
                    {w.weekNumber}
                  </Text>
                </View>
                <View style={ps.weekLabelCol}>
                  <Text style={[ps.weekLabel, sel && ps.weekLabelSel]}>
                    Week {w.weekNumber}
                  </Text>
                  {sel && meta ? <Text style={ps.weekMeta}>{meta}</Text> : null}
                </View>
                {sel && (
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={18}
                    color={COLORS.accent}
                    style={{ marginLeft: 'auto' as any }}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const ps = StyleSheet.create({
  section:     { marginBottom: SPACING.xl },
  sectionTitle:{
    fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold,
    color: COLORS.accent, letterSpacing: 1.2, marginBottom: 4,
  },
  subtitle:    { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, marginBottom: SPACING.md },
  callout: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm,
    backgroundColor: 'rgba(201,168,76,0.10)',
    borderRadius: RADIUS.md, borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.25)',
    padding: SPACING.sm, marginBottom: SPACING.md,
  },
  calloutText: { fontSize: FONTS.sizes.sm, color: COLORS.accent, flex: 1 },
  blockLabel: {
    fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold,
    color: COLORS.accent, letterSpacing: 1.1,
    marginTop: SPACING.md, marginBottom: SPACING.sm,
  },
  weekRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    borderRadius: RADIUS.md, paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md, marginBottom: 4, borderWidth: 1,
  },
  weekRowSel:   { backgroundColor: '#1A1200', borderColor: COLORS.accent },
  weekRowUnsel: { backgroundColor: COLORS.card, borderColor: 'transparent' },
  circle:       { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  circleSel:    { backgroundColor: COLORS.accent },
  circleUnsel:  { backgroundColor: COLORS.surfaceHighlight },
  circleNum:    { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.bold },
  circleNumSel:   { color: COLORS.text.inverse },
  circleNumUnsel: { color: COLORS.accent },
  weekLabelCol: { flex: 1 },
  weekLabel:    { fontSize: FONTS.sizes.base, color: COLORS.text.primary },
  weekLabelSel: { fontWeight: '500' },
  weekMeta:     { fontSize: FONTS.sizes.xs, color: COLORS.accent, marginTop: 1 },
});

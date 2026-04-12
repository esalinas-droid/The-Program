import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS } from '../../src/constants/theme';

const GOLD  = '#C9A84C';
const BG    = '#0A0A0C';
const CARD  = '#111114';
const BORDER = '#1E1E22';

// ── GridTool — 2-column compact card ─────────────────────────────────────────
function GridTool({ icon, label, desc, color, onPress, testID }: {
  icon: string; label: string; desc: string; color: string; onPress: () => void; testID?: string;
}) {
  return (
    <TouchableOpacity style={s.gridCard} onPress={onPress} activeOpacity={0.8} testID={testID}>
      <View style={[s.gridIcon, { backgroundColor: color + '20' }]}>
        <MaterialCommunityIcons name={icon as any} size={18} color={color} />
      </View>
      <Text style={s.gridLabel}>{label}</Text>
      <Text style={s.gridDesc}>{desc}</Text>
    </TouchableOpacity>
  );
}

// ── ListTool — full-width list row ────────────────────────────────────────────
function ListTool({ icon, label, desc, color, onPress, testID }: {
  icon: string; label: string; desc: string; color: string; onPress: () => void; testID?: string;
}) {
  return (
    <TouchableOpacity style={s.listCard} onPress={onPress} activeOpacity={0.8} testID={testID}>
      <View style={[s.listIcon, { backgroundColor: color + '20' }]}>
        <MaterialCommunityIcons name={icon as any} size={18} color={color} />
      </View>
      <View style={s.listInfo}>
        <Text style={s.listLabel}>{label}</Text>
        <Text style={s.listDesc}>{desc}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={16} color="#333" />
    </TouchableOpacity>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function ToolsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScrollView testID="tools-scroll" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}>

        {/* ── Header ── */}
        <View style={s.header}>
          <Text style={s.title}>Tools</Text>
          <Text style={s.subtitle}>Your training toolkit</Text>
        </View>

        {/* ── Featured: Pocket Coach ── */}
        <TouchableOpacity
          testID="tool-coach"
          style={s.featuredCard}
          onPress={() => router.push('/tools/coach')}
          activeOpacity={0.8}
        >
          <View style={s.featuredIcon}>
            <MaterialCommunityIcons name="brain" size={24} color={GOLD} />
          </View>
          <View style={s.featuredInfo}>
            <Text style={s.featuredLabel}>Pocket Coach</Text>
            <Text style={s.featuredDesc}>AI coaching powered by 37 strength books</Text>
          </View>
          <View style={s.askBtn}>
            <Text style={s.askBtnText}>ASK</Text>
          </View>
        </TouchableOpacity>

        {/* ── CALCULATORS ── */}
        <Text style={s.sectionLabel}>CALCULATORS</Text>
        <View style={s.grid}>
          <GridTool testID="tool-calculator" icon="calculator"    label="Max Calculator" desc="Epley + Brzycki formulas" color={GOLD}    onPress={() => router.push('/tools/calculator')} />
          <GridTool testID="tool-converter"  icon="scale-balance" label="lbs / kg"        desc="Converter + plate math"  color="#5B9CF5" onPress={() => router.push('/tools/converter')}  />
        </View>

        {/* ── TRAINING ── */}
        <Text style={s.sectionLabel}>TRAINING</Text>
        <ListTool testID="tool-checkin"   icon="clipboard-check-outline" label="Weekly Check-In"   desc="Review and coach recommendations"    color="#4DCEA6" onPress={() => router.push('/tools/checkin')}   />
        <ListTool testID="tool-changelog" icon="history"                  label="Change Log"        desc="AI program changes with undo"         color="#888888" onPress={() => router.push('/tools/changelog')} />
        <ListTool testID="tool-calendar"  icon="calendar-month"           label="Workout Calendar"  desc="52-week schedule and reminders"       color="#5B9CF5" onPress={() => router.push('/tools/calendar')}  />

        {/* ── REFERENCE ── */}
        <Text style={s.sectionLabel}>REFERENCE</Text>
        <View style={s.grid}>
          <GridTool testID="tool-barguide" icon="dumbbell"          label="Bar Guide"         desc="Bars and implements"     color="#F5A623" onPress={() => router.push('/tools/barguide')} />
          <GridTool testID="tool-library"  icon="book-open-variant"  label="Exercise Library"  desc="Exercises and warm-ups"  color="#4DCEA6" onPress={() => router.push('/tools/library')}  />
        </View>

        {/* ── PROGRAM ── */}
        <Text style={s.sectionLabel}>PROGRAM</Text>
        <ListTool testID="tool-roadmap" icon="flag-checkered" label="Program Roadmap" desc="Block structure and weekly layout" color={GOLD} onPress={() => router.push('/current-block')} />

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },

  header:   { paddingHorizontal: SPACING.lg, paddingTop: 12, paddingBottom: 16 },
  title:    { fontSize: 20, fontWeight: FONTS.weights.bold, color: COLORS.text.primary, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: COLORS.text.muted, marginTop: 2 },

  // Section labels
  sectionLabel: { fontSize: 10, fontWeight: '700', color: '#555', letterSpacing: 1.5, marginBottom: 8, paddingLeft: 4, marginHorizontal: SPACING.lg, marginTop: 4 },

  // Featured card
  featuredCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: CARD, borderRadius: 14, padding: 16, marginHorizontal: SPACING.lg, marginBottom: 20, borderWidth: 1.5, borderColor: GOLD + '40' },
  featuredIcon: { width: 48, height: 48, borderRadius: 12, backgroundColor: GOLD + '20', justifyContent: 'center', alignItems: 'center' },
  featuredInfo: { flex: 1 },
  featuredLabel:{ fontSize: 15, fontWeight: FONTS.weights.bold, color: COLORS.text.primary },
  featuredDesc: { fontSize: 11, color: COLORS.text.muted, marginTop: 2 },
  askBtn:       { backgroundColor: GOLD, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  askBtnText:   { fontSize: 11, fontWeight: FONTS.weights.heavy, color: BG, letterSpacing: 0.5 },

  // Grid
  grid:     { flexDirection: 'row', gap: 8, marginHorizontal: SPACING.lg, marginBottom: 14 },
  gridCard: { flex: 1, backgroundColor: CARD, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BORDER },
  gridIcon: { width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  gridLabel:{ fontSize: 13, fontWeight: FONTS.weights.bold, color: COLORS.text.primary },
  gridDesc: { fontSize: 10, color: '#555', marginTop: 3, lineHeight: 14 },

  // List
  listCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: CARD, borderRadius: 12, padding: 14, marginHorizontal: SPACING.lg, marginBottom: 8, borderWidth: 1, borderColor: BORDER },
  listIcon: { width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  listInfo: { flex: 1 },
  listLabel:{ fontSize: 13, fontWeight: FONTS.weights.bold, color: COLORS.text.primary },
  listDesc: { fontSize: 10, color: '#555', marginTop: 2 },
});

import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS } from '../../src/constants/theme';

const BARS = [
  {
    id: 'standard', category: 'straight', name: 'Standard Barbell', weightLbs: 45, weightKg: 20,
    shaft: '28–29mm', icon: '━━━━━━━━━━━━━━━',
    characteristics: 'Stiff with moderate knurling. Most common bar.',
    usedFor: 'Squats, bench, deadlift, rows, most barbell movements.',
    inProgram: 'DE speed work and some ME variations.',
    ytSearch: 'standard barbell exercises',
  },
  {
    id: 'deadlift', category: 'straight', name: 'Deadlift Bar', weightLbs: 45, weightKg: 20,
    shaft: '27mm', icon: '━━━━━━━━━━━━━━━',
    characteristics: 'Longer, thinner shaft, more whip, aggressive knurling.',
    usedFor: 'Heavy deadlifts. More time to get set before plates leave floor.',
    inProgram: 'ME Lower hinge variations.',
    ytSearch: 'deadlift bar vs standard bar',
  },
  {
    id: 'powerbar', category: 'straight', name: 'Stiff Power Bar', weightLbs: 45, weightKg: 20,
    shaft: '29mm', icon: '━━━━━━━━━━━━━━━',
    characteristics: 'Very stiff, heavy knurling, center knurl. No flex.',
    usedFor: 'Maximum power output. Standard in powerlifting.',
    inProgram: 'ME Lower heavy squatting.',
    ytSearch: 'powerlifting bar vs standard bar',
  },
  {
    id: 'ssb', category: 'specialty', name: 'Safety Squat Bar (SSB)', weightLbs: 65, weightKg: 29,
    shaft: 'Padded yoke + forward handles',
    characteristics: 'Eliminates traditional grip. Reduces shoulder stress. Anterior core + quad bias. More upright torso.',
    usedFor: 'ME Lower squatting for athletes with shoulder or wrist issues.',
    inProgram: 'Primary ME Lower movement — Weeks 1, 5, 9, 13... (Intro waves).',
    ytSearch: 'safety squat bar tutorial',
  },
  {
    id: 'cambered', category: 'specialty', name: 'Cambered Bar', weightLbs: 55, weightKg: 25,
    shaft: '4–10 inch drop below shoulder',
    characteristics: 'Unstable oscillating load. Deeper bottom stretch. Posterior chain demand.',
    usedFor: 'ME Lower variation for hip drive and upper back strength.',
    inProgram: 'ME Lower — Build wave weeks (2, 6, 10, 14...).',
    ytSearch: 'cambered bar squat tutorial',
  },
  {
    id: 'trap-high', category: 'specialty', name: 'Trap Bar (High Handle)', weightLbs: 60, weightKg: 27,
    shaft: 'Hexagonal frame, hip-height handles',
    characteristics: 'Reduced lumbar stress. More knee bend. Most joint-friendly heavy hinge.',
    usedFor: 'Primary pulling movement with injury sensitivity.',
    inProgram: 'ME Lower — Peak wave weeks (3, 7, 11, 15...).',
    ytSearch: 'trap bar deadlift high handle',
  },
  {
    id: 'swiss', category: 'specialty', name: 'Swiss / Football Bar', weightLbs: 40, weightKg: 18,
    shaft: 'Multiple neutral/angled grips',
    characteristics: 'Natural wrist position. Reduces shoulder internal rotation.',
    usedFor: 'Pressing for athletes with shoulder impingement history.',
    inProgram: 'Accessory pressing on ME Upper days.',
    ytSearch: 'swiss bar football bar press',
  },
  {
    id: 'axle', category: 'specialty', name: 'Axle Bar / Fat Bar', weightLbs: 40, weightKg: 18,
    shaft: '2 inches diameter, no sleeve spin',
    characteristics: 'Fat diameter challenges grip. No spin demands wrist/forearm strength.',
    usedFor: 'Axle deadlift, axle clean and press. Common in strongman.',
    inProgram: 'ME Upper Axle C&P weeks. Strongman Event Days.',
    ytSearch: 'axle bar strongman tutorial',
  },
  {
    id: 'log', category: 'strongman', name: 'Log', weightLbs: 75, weightKg: 34,
    shaft: 'Thick cylinder, neutral parallel handles',
    characteristics: 'Unique clean technique: hip-to-lap, pop to front rack, press. Tests overhead strength and hip power.',
    usedFor: 'Most common strongman pressing event.',
    inProgram: 'ME Upper Log weeks. Strongman Event Days. Priority event.',
    ytSearch: 'log clean and press technique',
  },
  {
    id: 'farmers', category: 'strongman', name: 'Farmers Handles', weightLbs: 0, weightKg: 0,
    shaft: 'Loadable shaft, independent per hand',
    characteristics: 'Tests grip, shoulder stability, core bracing, gait mechanics under load.',
    usedFor: 'Classic strongman carry event.',
    inProgram: 'Strongman Event Days. Support work on Event Saturday.',
    ytSearch: 'farmers carry strongman technique',
  },
  {
    id: 'yoke', category: 'strongman', name: 'Yoke', weightLbs: 200, weightKg: 91,
    shaft: 'Inverted U-frame on upper back',
    characteristics: 'No hands needed. All bracing. Demands trunk stability, hip drive, fast short steps.',
    usedFor: 'Primary strongman carry. Weight and distance test.',
    inProgram: 'Primary event. Every Intro and Peak wave Saturday.',
    ytSearch: 'yoke carry strongman technique',
  },
  {
    id: 'sandbag', category: 'strongman', name: 'Sandbag', weightLbs: 0, weightKg: 0,
    shaft: 'Shifting unstable load',
    characteristics: 'Never fully stabilized. Tests core, grip, and mental toughness.',
    usedFor: 'Medley work, odd-object carries, conditioning.',
    inProgram: 'Strongman Event Days — medley and conditioning finishers.',
    ytSearch: 'sandbag carry strongman',
  },
];

type Category = 'all' | 'straight' | 'specialty' | 'strongman';

export default function BarGuideScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<Category>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = BARS.filter(b => filter === 'all' || b.category === filter);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView testID="barguide-scroll">
        <View style={s.header}>
          <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={s.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.text.secondary} />
          </TouchableOpacity>
          <Text style={s.title}>BAR GUIDE</Text>
        </View>

        {/* Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow} contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: SPACING.sm }}>
          {[['all', 'All'], ['straight', 'Straight Bars'], ['specialty', 'Specialty'], ['strongman', 'Strongman']].map(([key, label]) => (
            <TouchableOpacity testID={`filter-${key}`} key={key} style={[s.filterBtn, filter === key && s.filterActive]} onPress={() => setFilter(key as Category)}>
              <Text style={[s.filterText, filter === key && s.filterTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {filtered.map(bar => (
          <TouchableOpacity testID={`bar-${bar.id}`} key={bar.id} style={s.barCard} onPress={() => setExpanded(expanded === bar.id ? null : bar.id)}>
            <View style={s.barHeader}>
              <View style={s.barIcon}>
                <MaterialCommunityIcons name="dumbbell" size={24} color={COLORS.accent} />
              </View>
              <View style={s.barInfo}>
                <Text style={s.barName}>{bar.name}</Text>
                <Text style={s.barWeight}>{bar.weightLbs > 0 ? `${bar.weightLbs} lbs / ${bar.weightKg} kg` : 'Weight varies'}</Text>
              </View>
              <MaterialCommunityIcons name={expanded === bar.id ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.text.muted} />
            </View>

            {expanded === bar.id && (
              <View style={s.barDetail}>
                {bar.shaft && <DetailRow label="Shaft" value={bar.shaft} />}
                <DetailRow label="Characteristics" value={bar.characteristics} />
                <DetailRow label="Used For" value={bar.usedFor} />
                <DetailRow label="In This Program" value={bar.inProgram} />
                <TouchableOpacity
                  testID={`yt-${bar.id}`}
                  style={s.ytBtn}
                  onPress={() => Linking.openURL(`https://www.youtube.com/results?search_query=${encodeURIComponent(bar.ytSearch)}`)}
                >
                  <MaterialCommunityIcons name="youtube" size={18} color="#FF0000" />
                  <Text style={s.ytBtnText}> Watch Tutorial</Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={dr.row}>
      <Text style={dr.label}>{label}</Text>
      <Text style={dr.value}>{value}</Text>
    </View>
  );
}
const dr = StyleSheet.create({
  row: { marginBottom: SPACING.sm },
  label: { fontSize: 10, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 1, marginBottom: 2 },
  value: { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, lineHeight: 20 },
});

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', padding: SPACING.lg, paddingTop: SPACING.xl, gap: SPACING.md },
  backBtn: { padding: 4 },
  title: { fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, letterSpacing: 2 },
  filterRow: { marginBottom: SPACING.md },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.full, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  filterActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  filterText: { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.medium },
  filterTextActive: { color: '#FFF', fontWeight: FONTS.weights.bold },
  barCard: { marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, overflow: 'hidden' },
  barHeader: { flexDirection: 'row', alignItems: 'center', padding: SPACING.lg, gap: SPACING.md },
  barIcon: { width: 44, height: 44, borderRadius: RADIUS.md, backgroundColor: COLORS.accent + '20', justifyContent: 'center', alignItems: 'center' },
  barInfo: { flex: 1 },
  barName: { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold, color: COLORS.text.primary, marginBottom: 2 },
  barWeight: { fontSize: FONTS.sizes.xs, color: COLORS.text.secondary },
  barDetail: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg, borderTopWidth: 1, borderTopColor: COLORS.border },
  ytBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surfaceHighlight, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start', marginTop: SPACING.sm },
  ytBtnText: { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold },
});

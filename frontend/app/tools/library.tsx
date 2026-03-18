import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, TextInput, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS } from '../../src/constants/theme';

const TABS = ['Exercises', 'Warm-Ups', 'Rehab', 'Events'];

const EXERCISES = [
  { name: 'SSB Box Squat', type: 'ME Lower', category: 'Squat', role: 'Main', focus: 'Quad + Anterior Core', cue: 'Push knees out, drive hips through.', ytSearch: 'SSB box squat tutorial' },
  { name: 'Cambered Bar Box Squat', type: 'ME Lower', category: 'Squat', role: 'Main', focus: 'Hip Drive + Posterior Chain', cue: 'Own the oscillation. Brace harder than with straight bar.', ytSearch: 'cambered bar box squat' },
  { name: 'Trap Bar Deadlift (High Handles)', type: 'ME Lower', category: 'Hinge', role: 'Main', focus: 'Hinge + Glutes', cue: 'Drive floor away. Tall chest.', ytSearch: 'trap bar deadlift high handle' },
  { name: 'Floor Press', type: 'ME Upper', category: 'Press', role: 'Main', focus: 'Tricep + Chest', cue: 'Tuck elbows 45°. Explosive off floor.', ytSearch: 'floor press barbell tutorial' },
  { name: 'Close-Grip Bench Press', type: 'ME Upper', category: 'Press', role: 'Main', focus: 'Tricep', cue: 'Grip 2" inside shoulder width. Drive bar back over face.', ytSearch: 'close grip bench press technique' },
  { name: 'Log Clean and Press', type: 'ME Upper', category: 'Press', role: 'Main', focus: 'Full body overhead', cue: 'Hip into log, not hands. Violent drive.', ytSearch: 'log clean and press strongman tutorial' },
  { name: 'Axle Clean and Press', type: 'ME Upper', category: 'Press', role: 'Main', focus: 'Grip + Overhead', cue: 'No spin — brace wrists. Drive through heels.', ytSearch: 'axle clean and press tutorial' },
  { name: 'Yoke Carry', type: 'Strongman Event', category: 'Carry', role: 'Main', focus: 'Total body stability', cue: 'Short fast steps. Eyes up. Own the pick.', ytSearch: 'yoke carry tutorial strongman' },
  { name: 'Farmers Carry', type: 'Strongman Event', category: 'Carry', role: 'Main', focus: 'Grip + Core + Gait', cue: 'Tall chest, fast walk, straps off.', ytSearch: 'farmers carry strongman tutorial' },
  { name: 'Belt Squat', type: 'ME Lower', category: 'Squat', role: 'Supplemental', focus: 'Quad + Core', cue: 'Hip-hinge sit into squat, stay tall.', ytSearch: 'belt squat tutorial' },
  { name: 'Pallof Press', type: 'All', category: 'Core', role: 'Accessory', focus: 'Anti-Rotation Core', cue: 'Resist rotation, breathe out on press.', ytSearch: 'pallof press tutorial' },
  { name: 'Dead Bug', type: 'All', category: 'Core', role: 'Accessory', focus: 'Anterior Core', cue: 'Lower back flat to floor throughout.', ytSearch: 'dead bug exercise tutorial' },
  { name: 'McGill Curl-Up', type: 'All', category: 'Core', role: 'Accessory', focus: 'Core Stability', cue: 'Neck long, slight chin tuck. 8-sec hold.', ytSearch: 'McGill curl up tutorial' },
  { name: 'GHD Hip Extension', type: 'ME Lower', category: 'Posterior Chain', role: 'Supplemental', focus: 'Glute + Hamstring', cue: 'Hip crease at pad, not belly. Full hip extension.', ytSearch: 'GHD hip extension tutorial' },
  { name: 'Backward Sled Drag', type: 'GPP', category: 'Conditioning', role: 'GPP', focus: 'Knee + Aerobic Capacity', cue: 'Upright posture, heel-to-toe pull, controlled speed.', ytSearch: 'backward sled drag tutorial' },
];

const WARMUPS = [
  { type: 'ME Lower — Squat Bias', drills: [
    { name: '90/90 Breathing', sr: '2×5', purpose: 'Diaphragm reset', cue: 'Full exhale, rib cage down' },
    { name: 'Adductor Rockback', sr: '1×8/side', purpose: 'Hip mobility', cue: 'Sit back into stretch' },
    { name: 'Glute Bridge', sr: '2×10', purpose: 'Glute activation', cue: 'Squeeze at top for 1 sec' },
    { name: 'BW Box Squat', sr: '2×6', purpose: 'Movement rehearsal', cue: 'Sit back to box, drive hips through' },
  ]},
  { type: 'ME Upper — Press Bias', drills: [
    { name: 'Band Pull-Apart', sr: '2×20', purpose: 'Scapular retraction', cue: 'Elbows straight, full range' },
    { name: 'Face Pull', sr: '2×15', purpose: 'Rear delt / cuff activation', cue: 'External rotate at finish' },
    { name: 'Band External Rotation', sr: '2×12', purpose: 'Rotator cuff', cue: 'Elbow at 90°, controlled' },
    { name: 'Scap Push-Up', sr: '2×10', purpose: 'Serratus activation', cue: 'Protract and retract only' },
  ]},
  { type: 'Event Day — Yoke', drills: [
    { name: 'Backward Sled Drag', sr: '5 min easy', purpose: 'Glute + knee warm-up', cue: 'RPE 4 only' },
    { name: 'Suitcase Carry', sr: '2×40 ft/side', purpose: 'Core + shoulder', cue: 'Tall posture' },
    { name: 'Split-Stance Hip Iso', sr: '2×20s/side', purpose: 'Hip stability', cue: 'Drive floor away with back knee' },
    { name: 'Empty Yoke Runs', sr: '2 runs', purpose: 'Movement rehearsal', cue: 'Focus on foot rhythm' },
  ]},
];

const REHAB = [
  { injury: 'Right hamstring / nerve compression', protocols: [
    { name: 'Hamstring Floss', sr: '1×8/side', purpose: 'Neural tension release', note: 'Stop if pins/needles increase' },
    { name: 'Dead Bug', sr: '2×6/side', purpose: 'Anterior core without hip flexor load', note: '' },
    { name: 'Prone Hip Extension (no knee bend)', sr: '2×10', purpose: 'Glute activation without hamstring overload', note: '' },
    { name: '90/90 Hip Switch', sr: '1×5/side', purpose: 'Hip internal rotation', note: 'Control movement, no pain' },
  ]},
  { injury: 'Low back', protocols: [
    { name: 'McGill Curl-Up', sr: '1×6/side', purpose: 'Core stability without flexion load', note: 'Neck long, 8-sec holds' },
    { name: 'Bird Dog', sr: '1×6/side', purpose: 'Multi-directional core', note: 'Back flat, no rotation' },
    { name: 'Dead Bug', sr: '2×6/side', purpose: 'Anterior core', note: '' },
  ]},
  { injury: 'Left knee', protocols: [
    { name: 'Spanish Squat Iso', sr: '3×30s', purpose: 'Quad activation without impact', note: 'Knees wide, sit deep' },
    { name: 'Backward Sled Drag', sr: '6 trips', purpose: 'Knee-friendly quad + calf', note: 'Over forward leg work' },
    { name: 'Copenhagen Plank', sr: '2×20s/side', purpose: 'Adductor + hip stability', note: '' },
  ]},
  { injury: 'Left bicep strain', protocols: [
    { name: 'Band External Rotation', sr: '2×15', purpose: 'Cuff prehab without elbow load', note: 'Light resistance only' },
    { name: 'Wall Slide', sr: '2×10', purpose: 'Shoulder mobility', note: 'No bicep pain during' },
    { name: 'Sandbag Bear Hug Carry (light)', sr: '2×40 ft', purpose: 'Overhead alt. to log clean', note: 'AVOID stone to shoulder' },
  ]},
];

const EVENTS = [
  { name: 'Yoke', phases: [
    { label: 'Reload', load: '50-60% max', purpose: 'Movement quality, foot speed', notes: 'Short distance 30-40ft. Own the pick and drive.' },
    { label: 'Build', load: '70-80% max', purpose: 'Speed under load', notes: '40-50ft runs. Maintain posture through full run.' },
    { label: 'Heavy', load: '85-95% max', purpose: 'Peak event load', notes: '20-40ft. Max effort or comp simulation.' },
  ], ytSearch: 'yoke carry strongman technique' },
  { name: 'Log Clean and Press', phases: [
    { label: 'Reload', load: '50-60% max', purpose: 'Technique drill', notes: 'Hip into log. Rack drill. Clean without pressing.' },
    { label: 'Build', load: '70-80% max', purpose: 'Volume', notes: 'Multiple reps in sets. Focus on hip drive.' },
    { label: 'Heavy', load: '85-95% max', purpose: 'Heavy singles', notes: 'Competition-style singles. Full intent each rep.' },
  ], ytSearch: 'log clean and press strongman tutorial' },
  { name: 'Farmers Carry', phases: [
    { label: 'Reload', load: '60-70% max/hand', purpose: 'Grip and gait', notes: '40-60ft straps on. Tall posture.' },
    { label: 'Build', load: '75-85% max/hand', purpose: 'Speed and distance', notes: '60-80ft straps off.' },
    { label: 'Heavy', load: '90%+ max/hand', purpose: 'Max load or distance', notes: 'Full competition simulation.' },
  ], ytSearch: 'farmers carry strongman competition' },
];

export default function LibraryScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(0);
  const [search, setSearch] = useState('');
  const [injuryFilter, setInjuryFilter] = useState('');

  const filteredExercises = EXERCISES.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={s.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.text.secondary} />
        </TouchableOpacity>
        <Text style={s.title}>REFERENCE LIBRARY</Text>
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabScroll} contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: SPACING.sm }}>
        {TABS.map((tab, i) => (
          <TouchableOpacity testID={`lib-tab-${tab}`} key={tab} style={[s.tabBtn, activeTab === i && s.tabActive]} onPress={() => setActiveTab(i)}>
            <Text style={[s.tabText, activeTab === i && s.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView testID="library-scroll" style={s.content} keyboardShouldPersistTaps="handled">
        {/* Exercises Tab */}
        {activeTab === 0 && (
          <>
            <TextInput testID="lib-search" style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Search exercises..." placeholderTextColor={COLORS.text.muted} />
            {filteredExercises.map(ex => (
              <View testID={`lib-ex-${ex.name}`} key={ex.name} style={s.exCard}>
                <View style={s.exHeader}>
                  <Text style={s.exName}>{ex.name}</Text>
                  <View style={s.exRoleBadge}><Text style={s.exRoleText}>{ex.role}</Text></View>
                </View>
                <View style={s.exMeta}>
                  <Text style={s.exType}>{ex.type}</Text>
                  <Text style={s.exDot}> · </Text>
                  <Text style={s.exCat}>{ex.category}</Text>
                </View>
                <Text style={s.exFocus}>Focus: {ex.focus}</Text>
                <Text style={s.exCue}>"{ex.cue}"</Text>
                <TouchableOpacity testID={`yt-ex-${ex.name}`} style={s.ytBtn} onPress={() => Linking.openURL(`https://www.youtube.com/results?search_query=${encodeURIComponent(ex.ytSearch)}`)}>
                  <Text style={s.ytBtnText}>▶ Demo</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        {/* Warm-Ups Tab */}
        {activeTab === 1 && (
          <>
            {WARMUPS.map(wu => (
              <View key={wu.type} style={s.wuCard}>
                <Text style={s.wuType}>{wu.type}</Text>
                {wu.drills.map(d => (
                  <View key={d.name} style={s.drillRow}>
                    <View style={s.drillLeft}>
                      <Text style={s.drillName}>{d.name}</Text>
                      <Text style={s.drillPurpose}>{d.purpose}</Text>
                    </View>
                    <View style={s.drillRight}>
                      <Text style={s.drillSR}>{d.sr}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </>
        )}

        {/* Rehab Tab */}
        {activeTab === 2 && (
          <>
            {REHAB.map(r => (
              <View key={r.injury} style={s.rehabCard}>
                <Text style={s.rehabInjury}>⚠ {r.injury}</Text>
                {r.protocols.map(p => (
                  <View key={p.name} style={s.drillRow}>
                    <View style={s.drillLeft}>
                      <Text style={s.drillName}>{p.name}</Text>
                      <Text style={s.drillPurpose}>{p.purpose}</Text>
                      {p.note ? <Text style={s.drillNote}>{p.note}</Text> : null}
                    </View>
                    <Text style={s.drillSR}>{p.sr}</Text>
                  </View>
                ))}
              </View>
            ))}
          </>
        )}

        {/* Events Tab */}
        {activeTab === 3 && (
          <>
            {EVENTS.map(ev => (
              <View key={ev.name} style={s.evCard}>
                <View style={s.evHeader}>
                  <Text style={s.evName}>{ev.name}</Text>
                  <TouchableOpacity testID={`yt-ev-${ev.name}`} onPress={() => Linking.openURL(`https://www.youtube.com/results?search_query=${encodeURIComponent(ev.ytSearch)}`)}>
                    <Text style={s.ytBtnText}>▶</Text>
                  </TouchableOpacity>
                </View>
                {ev.phases.map(ph => (
                  <View key={ph.label} style={s.phaseCard}>
                    <Text style={s.phaseLabel}>{ph.label}</Text>
                    <Text style={s.phaseLoad}>{ph.load}</Text>
                    <Text style={s.phaseNotes}>{ph.notes}</Text>
                  </View>
                ))}
              </View>
            ))}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', padding: SPACING.lg, paddingTop: SPACING.xl, gap: SPACING.md },
  backBtn: { padding: 4 },
  title: { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, letterSpacing: 2 },
  tabScroll: { marginBottom: SPACING.sm },
  tabBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: RADIUS.full, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  tabActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  tabText: { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.medium },
  tabTextActive: { color: '#FFF', fontWeight: FONTS.weights.bold },
  content: { flex: 1 },
  searchInput: { marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, height: 44, paddingHorizontal: SPACING.md, color: COLORS.text.primary, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, fontSize: FONTS.sizes.base },
  exCard: { marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg },
  exHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  exName: { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold, color: COLORS.text.primary, flex: 1 },
  exRoleBadge: { backgroundColor: COLORS.primary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.full },
  exRoleText: { fontSize: 10, color: COLORS.accentBlue, fontWeight: FONTS.weights.bold },
  exMeta: { flexDirection: 'row', marginBottom: 4 },
  exType: { fontSize: FONTS.sizes.xs, color: COLORS.accent },
  exDot: { fontSize: FONTS.sizes.xs, color: COLORS.text.muted },
  exCat: { fontSize: FONTS.sizes.xs, color: COLORS.text.muted },
  exFocus: { fontSize: FONTS.sizes.xs, color: COLORS.text.secondary, marginBottom: 4 },
  exCue: { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, fontStyle: 'italic', marginBottom: 8 },
  ytBtn: { alignSelf: 'flex-start', backgroundColor: COLORS.surfaceHighlight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.sm },
  ytBtnText: { color: COLORS.text.secondary, fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.semibold },
  wuCard: { marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg },
  wuType: { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.bold, color: COLORS.accent, marginBottom: SPACING.md },
  drillRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  drillLeft: { flex: 1 },
  drillRight: {},
  drillName: { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold, color: COLORS.text.primary },
  drillPurpose: { fontSize: FONTS.sizes.xs, color: COLORS.text.secondary },
  drillNote: { fontSize: FONTS.sizes.xs, color: COLORS.accent, fontStyle: 'italic' },
  drillSR: { fontSize: FONTS.sizes.sm, color: COLORS.accentBlue, fontWeight: FONTS.weights.bold, marginLeft: SPACING.md },
  rehabCard: { marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, borderLeftWidth: 3, borderLeftColor: COLORS.accent },
  rehabInjury: { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.bold, color: COLORS.accent, marginBottom: SPACING.md },
  evCard: { marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg },
  evHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  evName: { fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  phaseCard: { backgroundColor: COLORS.surfaceHighlight, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm },
  phaseLabel: { fontSize: 10, fontWeight: FONTS.weights.heavy, color: COLORS.accentBlue, letterSpacing: 1.5, marginBottom: 4 },
  phaseLoad: { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold, color: COLORS.text.primary, marginBottom: 4 },
  phaseNotes: { fontSize: FONTS.sizes.xs, color: COLORS.text.secondary, lineHeight: 18 },
});

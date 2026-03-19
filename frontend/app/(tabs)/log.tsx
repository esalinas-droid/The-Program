import { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, TextInput, KeyboardAvoidingView, Platform, Modal, FlatList, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS, getSessionStyle } from '../../src/constants/theme';
import { getProfile } from '../../src/utils/storage';
import { logApi } from '../../src/utils/api';
import { epleyE1RM, lbsToKg } from '../../src/utils/calculations';
import { sendPRAlert } from '../../src/utils/notifications';
import { WorkoutLogEntry } from '../../src/types';
import { getTodayDayName } from '../../src/data/programData';

const DEFAULT_FORM = {
  date: new Date().toISOString().slice(0, 10),
  week: 1, day: 'Monday', sessionType: 'ME Lower',
  exercise: '', sets: 3, weight: '', reps: 5, rpe: 7, pain: 0,
  completed: 'Completed', bodyweight: '', notes: '', flag: '—',
};

export default function LogScreen() {
  const [form, setForm] = useState({ ...DEFAULT_FORM });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [entries, setEntries] = useState<WorkoutLogEntry[]>([]);
  const [showExercise, setShowExercise] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState<string | null>(null);
  const [showRPEInfo, setShowRPEInfo] = useState(false);
  const [showPainInfo, setShowPainInfo] = useState(false);

  useFocusEffect(useCallback(() => {
    (async () => {
      const prof = await getProfile();
      const today = getTodayDayName();
      const week = prof?.currentWeek || 1;
      setForm(prev => ({ ...DEFAULT_FORM, week, day: today === 'Sunday' ? 'Monday' : today }));
      try {
        const data = await logApi.list({ week });
        setEntries(data);
      } catch {}
      setLoading(false);
    })();
  }, []));

  const e1rm = epleyE1RM(parseFloat(form.weight) || 0, form.reps);

  async function handleSave() {
    if (!form.exercise || !form.weight) {
      Alert.alert('Required', 'Please enter exercise and weight');
      return;
    }
    setSaving(true);
    try {
      await logApi.create({
        date: form.date, week: form.week, day: form.day,
        sessionType: form.sessionType, exercise: form.exercise,
        sets: form.sets, weight: parseFloat(form.weight), reps: form.reps,
        rpe: form.rpe, pain: form.pain, completed: form.completed,
        bodyweight: form.bodyweight ? parseFloat(form.bodyweight) : undefined,
        notes: form.notes || undefined,
        flag: form.flag !== '—' ? form.flag : undefined,
      });
      const data = await logApi.list({ week: form.week });
      setEntries(data);
      setForm(prev => ({ ...prev, exercise: '', weight: '', notes: '', flag: '—', bodyweight: '' }));
      Alert.alert('Logged ✓', `${form.exercise} saved`);
      if (form.flag === '✓ PR' && form.weight) {
        const prE1rm = epleyE1RM(parseFloat(form.weight), form.reps);
        sendPRAlert(form.exercise, parseFloat(form.weight), prE1rm).catch(() => {});
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not save entry');
    }
    setSaving(false);
  }

  const filteredExercises = EXERCISE_LIST.filter(ex => ex.toLowerCase().includes(exerciseSearch.toLowerCase()));

  function DropdownPicker({ label, value, options, field, testID }: any) {
    const isOpen = showDropdown === field;
    return (
      <View style={s.fieldWrap}>
        <Text style={s.fieldLabel}>{label}</Text>
        <TouchableOpacity testID={testID} style={s.picker} onPress={() => setShowDropdown(isOpen ? null : field)}>
          <Text style={s.pickerText}>{String(value)}</Text>
          <MaterialCommunityIcons name="chevron-down" size={18} color={COLORS.text.muted} />
        </TouchableOpacity>
        {isOpen && (
          <View style={s.dropdownList}>
            <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
              {options.map((opt: any) => (
                <TouchableOpacity key={String(opt)} style={s.dropdownItem} onPress={() => { setForm(prev => ({ ...prev, [field]: opt })); setShowDropdown(null); }}>
                  <Text style={[s.dropdownItemText, value === opt && { color: COLORS.accent, fontWeight: FONTS.weights.bold }]}>{String(opt)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    );
  }

  if (loading) return <View style={s.loading}><ActivityIndicator color={COLORS.accent} /></View>;

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={s.scroll} keyboardShouldPersistTaps="handled" testID="log-scroll">
          <View style={s.header}>
            <Text style={s.title}>WORKOUT LOG</Text>
          </View>

          {/* Entry Form */}
          <View style={s.formCard}>
            <Text style={s.formTitle}>NEW ENTRY</Text>

            <View style={s.row}>
              <View style={[s.fieldWrap, { flex: 1 }]}>
                <Text style={s.fieldLabel}>DATE</Text>
                <TextInput testID="log-date" style={s.input} value={form.date} onChangeText={v => setForm(p => ({ ...p, date: v }))} placeholder="YYYY-MM-DD" placeholderTextColor={COLORS.text.muted} />
              </View>
              <View style={[s.fieldWrap, { flex: 0.5 }]}>
                <Text style={s.fieldLabel}>WEEK</Text>
                <TextInput testID="log-week" style={s.input} value={String(form.week)} onChangeText={v => setForm(p => ({ ...p, week: parseInt(v) || 1 }))} keyboardType="numeric" />
              </View>
            </View>

            <DropdownPicker label="DAY" value={form.day} options={DAYS_OF_WEEK.slice(0, 6)} field="day" testID="log-day-picker" />
            <DropdownPicker label="SESSION TYPE" value={form.sessionType} options={SESSION_TYPES} field="sessionType" testID="log-session-type-picker" />

            {/* Exercise picker */}
            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>EXERCISE</Text>
              <TouchableOpacity testID="log-exercise-picker" style={s.picker} onPress={() => setShowExercise(true)}>
                <Text style={[s.pickerText, !form.exercise && { color: COLORS.text.muted }]}>{form.exercise || 'Select exercise...'}</Text>
                <MaterialCommunityIcons name="magnify" size={18} color={COLORS.text.muted} />
              </TouchableOpacity>
            </View>

            <View style={s.row}>
              <DropdownPicker label="SETS" value={form.sets} options={SETS_OPTIONS} field="sets" testID="log-sets-picker" />
              <View style={[s.fieldWrap, { flex: 1 }]}>
                <Text style={s.fieldLabel}>WEIGHT (lbs)</Text>
                <TextInput testID="log-weight" style={[s.input, { fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.heavy }]} value={form.weight} onChangeText={v => setForm(p => ({ ...p, weight: v.replace(/[^0-9.]/g, '') }))} keyboardType="numeric" placeholder="0" placeholderTextColor={COLORS.text.muted} />
              </View>
              <DropdownPicker label="REPS" value={form.reps} options={REPS_OPTIONS} field="reps" testID="log-reps-picker" />
            </View>

            {/* Live e1RM */}
            {parseFloat(form.weight) > 0 && (
              <View testID="e1rm-display" style={s.e1rmBox}>
                <Text style={s.e1rmLabel}>EPLEY E1RM</Text>
                <Text style={s.e1rmValue}>{e1rm} lbs</Text>
                <Text style={s.e1rmKg}>{lbsToKg(e1rm).toFixed(1)} kg</Text>
              </View>
            )}

            <View style={s.row}>
              <View style={[s.fieldWrap, { flex: 1 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={s.fieldLabel}>RPE</Text>
                  <TouchableOpacity onPress={() => setShowRPEInfo(true)} style={{ marginLeft: 4 }}>
                    <Text style={s.infoBtn}>ⓘ</Text>
                  </TouchableOpacity>
                </View>
                <DropdownPicker label="" value={form.rpe} options={RPE_OPTIONS} field="rpe" testID="log-rpe-picker" />
              </View>
              <View style={[s.fieldWrap, { flex: 1 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={s.fieldLabel}>PAIN</Text>
                  <TouchableOpacity onPress={() => setShowPainInfo(true)} style={{ marginLeft: 4 }}>
                    <Text style={s.infoBtn}>ⓘ</Text>
                  </TouchableOpacity>
                </View>
                <DropdownPicker label="" value={form.pain} options={PAIN_OPTIONS} field="pain" testID="log-pain-picker" />
              </View>
            </View>

            <DropdownPicker label="COMPLETED" value={form.completed} options={COMPLETED_OPTIONS} field="completed" testID="log-completed-picker" />
            <DropdownPicker label="FLAG" value={form.flag} options={FLAG_OPTIONS} field="flag" testID="log-flag-picker" />

            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>BODYWEIGHT (optional)</Text>
              <TextInput testID="log-bodyweight" style={s.input} value={form.bodyweight} onChangeText={v => setForm(p => ({ ...p, bodyweight: v }))} keyboardType="numeric" placeholder="lbs" placeholderTextColor={COLORS.text.muted} />
            </View>

            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>NOTES</Text>
              <TextInput testID="log-notes" style={[s.input, { height: 80, textAlignVertical: 'top', paddingTop: 10 }]} value={form.notes} onChangeText={v => setForm(p => ({ ...p, notes: v }))} multiline placeholder="Optional notes..." placeholderTextColor={COLORS.text.muted} />
            </View>

            <TouchableOpacity testID="log-save-btn" style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#FFF" /> : <Text style={s.saveBtnText}>Save Entry</Text>}
            </TouchableOpacity>
          </View>

          {/* Log History */}
          <Text style={s.historyHeader}>LOG HISTORY (Week {form.week})</Text>
          {entries.length === 0 ? (
            <View style={s.emptyLog}><Text style={s.emptyText}>No entries yet. Log your first session above.</Text></View>
          ) : (
            entries.map((entry, idx) => (
              <LogEntryCard key={entry.id || idx} entry={entry} />
            ))
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Exercise Modal */}
      <Modal visible={showExercise} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>SELECT EXERCISE</Text>
              <TouchableOpacity onPress={() => setShowExercise(false)}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.text.secondary} />
              </TouchableOpacity>
            </View>
            <TextInput testID="exercise-search" style={s.searchInput} value={exerciseSearch} onChangeText={setExerciseSearch} placeholder="Search 112 exercises..." placeholderTextColor={COLORS.text.muted} autoFocus />
            <FlatList
              data={filteredExercises}
              keyExtractor={item => item}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.exItem} onPress={() => { setForm(p => ({ ...p, exercise: item })); setShowExercise(false); setExerciseSearch(''); }}>
                  <Text style={[s.exItemText, form.exercise === item && { color: COLORS.accent, fontWeight: FONTS.weights.bold }]}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* RPE Info Modal */}
      <Modal visible={showRPEInfo} animationType="fade" transparent>
        <View style={s.infoOverlay}>
          <View style={s.infoCard}>
            <Text style={s.infoTitle}>RPE GUIDE</Text>
            {[['6','Easy, could do 4+ more reps'],['7','Moderate, 2-3 more in tank'],['8','Hard, 1-2 more reps left'],['9','Near max, maybe 1 more'],['10','True max, nothing left']].map(([n, desc]) => (
              <View key={n} style={s.infoRow}>
                <Text style={s.infoNum}>{n}</Text>
                <Text style={s.infoDesc}>{desc}</Text>
              </View>
            ))}
            <TouchableOpacity style={s.infoClose} onPress={() => setShowRPEInfo(false)}>
              <Text style={s.infoCloseText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Pain Info Modal */}
      <Modal visible={showPainInfo} animationType="fade" transparent>
        <View style={s.infoOverlay}>
          <View style={s.infoCard}>
            <Text style={s.infoTitle}>PAIN SCALE</Text>
            {[['0','None'],['1-2','Minor, ignorable'],['3-4','Notable, affects movement'],['5','Stop immediately']].map(([n, desc]) => (
              <View key={n} style={s.infoRow}>
                <Text style={[s.infoNum, parseInt(n) >= 3 && { color: '#CF6679' }]}>{n}</Text>
                <Text style={s.infoDesc}>{desc}</Text>
              </View>
            ))}
            <TouchableOpacity style={s.infoClose} onPress={() => setShowPainInfo(false)}>
              <Text style={s.infoCloseText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function LogEntryCard({ entry }: { entry: WorkoutLogEntry }) {
  const sc = getSessionStyle(entry.sessionType);
  return (
    <View testID="log-entry-card" style={s.entryCard}>
      <View style={s.entryHeader}>
        <View style={[s.entryBadge, { backgroundColor: sc.bg }]}>
          <Text style={[s.entryBadgeText, { color: sc.text }]}>{entry.sessionType}</Text>
        </View>
        <Text style={s.entryDate}>{entry.date}</Text>
      </View>
      <Text style={s.entryExercise}>{entry.exercise}</Text>
      <View style={s.entryRow}>
        <Text style={s.entryMeta}>{entry.sets}×{entry.reps} @ {entry.weight} lbs</Text>
        {entry.e1rm > 0 && <Text style={s.entryE1rm}>e1RM: {entry.e1rm} lbs</Text>}
        <Text style={s.entryRpe}>RPE {entry.rpe}</Text>
      </View>
      {entry.flag && entry.flag !== '—' && <Text style={s.entryFlag}>{entry.flag}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  loading: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
  header: { padding: SPACING.lg, paddingTop: SPACING.xl },
  title: { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, letterSpacing: 2 },
  formCard: { marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.lg },
  formTitle: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.accent, letterSpacing: 2, marginBottom: SPACING.lg },
  row: { flexDirection: 'row', gap: SPACING.sm },
  fieldWrap: { flex: 1, marginBottom: SPACING.md },
  fieldLabel: { fontSize: 10, fontWeight: FONTS.weights.bold, color: COLORS.text.muted, letterSpacing: 1.5, marginBottom: 6 },
  input: { backgroundColor: COLORS.surfaceHighlight, borderRadius: RADIUS.md, height: 44, paddingHorizontal: SPACING.md, color: COLORS.text.primary, fontSize: FONTS.sizes.base, borderWidth: 1, borderColor: COLORS.border },
  picker: { backgroundColor: COLORS.surfaceHighlight, borderRadius: RADIUS.md, height: 44, paddingHorizontal: SPACING.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: COLORS.border },
  pickerText: { color: COLORS.text.primary, fontSize: FONTS.sizes.sm, flex: 1 },
  dropdownList: { position: 'absolute', top: 44 + 6, left: 0, right: 0, backgroundColor: COLORS.surfaceHighlight, borderRadius: RADIUS.md, zIndex: 100, borderWidth: 1, borderColor: COLORS.border, elevation: 5 },
  dropdownItem: { padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  dropdownItemText: { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm },
  e1rmBox: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, padding: SPACING.md, flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md, gap: SPACING.md, borderWidth: 1, borderColor: COLORS.accentBlue },
  e1rmLabel: { fontSize: 10, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 1.5, flex: 1 },
  e1rmValue: { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.heavy, color: COLORS.accentBlue },
  e1rmKg: { fontSize: FONTS.sizes.sm, color: COLORS.text.muted },
  infoBtn: { color: COLORS.accentBlue, fontSize: FONTS.sizes.base },
  saveBtn: { backgroundColor: COLORS.accent, borderRadius: RADIUS.md, height: 52, justifyContent: 'center', alignItems: 'center', marginTop: SPACING.md },
  saveBtnText: { color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy },
  historyHeader: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 2, paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm },
  emptyLog: { marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: 'center' },
  emptyText: { color: COLORS.text.muted, fontSize: FONTS.sizes.sm, textAlign: 'center' },
  entryCard: { marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  entryBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.full },
  entryBadgeText: { fontSize: 10, fontWeight: FONTS.weights.bold },
  entryDate: { color: COLORS.text.muted, fontSize: FONTS.sizes.xs },
  entryExercise: { color: COLORS.text.primary, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.base, marginBottom: 4 },
  entryRow: { flexDirection: 'row', gap: SPACING.md, alignItems: 'center' },
  entryMeta: { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm },
  entryE1rm: { color: COLORS.accentBlue, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.bold },
  entryRpe: { color: COLORS.text.muted, fontSize: FONTS.sizes.xs },
  entryFlag: { color: COLORS.accent, fontSize: FONTS.sizes.xs, marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.lg, maxHeight: '75%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  modalTitle: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 2 },
  searchInput: { backgroundColor: COLORS.surfaceHighlight, borderRadius: RADIUS.md, height: 44, paddingHorizontal: SPACING.md, color: COLORS.text.primary, marginBottom: SPACING.md, fontSize: FONTS.sizes.base, borderWidth: 1, borderColor: COLORS.border },
  exItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  exItemText: { color: COLORS.text.primary, fontSize: FONTS.sizes.base },
  infoOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  infoCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.xl, width: '100%' },
  infoTitle: { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.heavy, color: COLORS.accent, letterSpacing: 2, marginBottom: SPACING.md },
  infoRow: { flexDirection: 'row', gap: SPACING.md, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  infoNum: { color: COLORS.accentBlue, fontWeight: FONTS.weights.heavy, fontSize: FONTS.sizes.base, width: 32 },
  infoDesc: { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm, flex: 1 },
  infoClose: { backgroundColor: COLORS.accent, borderRadius: RADIUS.md, height: 44, justifyContent: 'center', alignItems: 'center', marginTop: SPACING.lg },
  infoCloseText: { color: '#FFF', fontWeight: FONTS.weights.bold },
});

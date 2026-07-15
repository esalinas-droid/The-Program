/**
 * ExercisePicker — shared full-screen exercise picker modal.
 *
 * Features:
 * - SUGGESTED SWAPS section at top (when originalExerciseName provided)
 *   with reason-filter chips (All / Pain/Injury / No Equipment / Low Energy / Preference)
 * - YOUR CUSTOM EXERCISES (from API)
 * - MAIN LIFTS / SUPPLEMENTAL / ACCESSORIES / PREHAB sections (canonical)
 * - Search filters all sections live
 * - "+ Create new exercise" inline form at bottom
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Modal, View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, Platform, KeyboardAvoidingView,
  Pressable, Alert, Animated, Dimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { getAlternatives, AdjustReason } from '../data/substitutions';
import { userExercisesApi, UserExercise } from '../utils/api';

// ── Palette ───────────────────────────────────────────────────────────────────
const GOLD  = '#C9A84C';
const BG    = '#0A0A0C';
const CARD  = '#111114';
const CARD2 = '#16161A';
const BORDER = '#1E1E22';
const TEXT  = '#E8E8E6';
const MUTED = '#666';
const GREEN = '#4DCEA6';

const { height: SCREEN_H } = Dimensions.get('window');

// ── Canonical Exercise Lists ──────────────────────────────────────────────────
export const MAIN_LIFTS = [
  'Back Squat', 'SSB Box Squat', 'Bench Press', 'Floor Press',
  'Close-Grip Bench Press', 'Conventional Deadlift', 'Sumo Deadlift',
  'Trap Bar Deadlift (High Handle)', 'Overhead Press (Barbell)', 'Push Press',
  'Log Clean and Press', 'Log Push Press', 'Axle Clean and Press',
  'Axle Push Press', 'Axle Deadlift', 'Front Squat', 'Romanian Deadlift',
  'Z-Press', 'Incline Bench Press', 'Good Morning',
  'Clean & Jerk', 'Snatch', 'Power Clean',
];

export const SUPPLEMENTAL = [
  'Belt Squat', 'Cambered Bar Box Squat', 'Speed Box Squat',
  'Box Squat (Straight Bar)', 'Box Squat with Bands', 'Box Squat with Chains',
  'Pause Squat', 'Free Squat (No Box)',
  'Block Pull (Below Knee)', 'Block Pull (Above Knee)', 'Block Pull (Mid Shin)',
  'DB Bench Press', 'Dumbbell Bench Press', 'Neutral-Grip DB Press',
  'Incline Close-Grip Bench', 'JM Press',
  'Pendlay Row', 'Chest Supported Row', 'Barbell Row', 'Meadows Row', 'DB Row',
  'Yoke Carry', 'Farmers Carry', 'Frame Carry', 'Keg Carry', 'Sandbag Carry',
  'Suitcase Carry', 'Atlas Stone Load', 'Medley (Yoke + Keg)', 'Medley (Yoke + Sandbag)',
  'GHD Hip Extension', 'Glute-Ham Raise', 'Hip Thrust', 'Reverse Hyper',
];

export const ACCESSORIES = [
  'Lat Pulldown', 'Pull-Through', 'Glute Bridge', 'Reverse Lunge',
  'DB Split Squat', 'Goblet Squat',
  'Face Pull', 'Band Pull-Apart', 'Rear Delt Raise',
  'Hammer Curl', 'EZ Bar Curl', 'DB Curl', 'Hammer Curls',
  'Pushdown (Cable)', 'Band Pushdown', 'Rolling DB Extension',
  'Hanging Knee Raise', 'Prowler Push',
  'Light Sled Drag', 'Backward Sled Drag', 'Backward Sled Drag (Heavy)',
  'Med Ball Chest Pass', 'Close-Grip Pushup', 'Plate Pinch Hold',
  'Pronation / Supination Lever', 'Reverse Lunge',
];

export const PREHAB = [
  'Bird Dog', 'Dead Bug', 'McGill Curl-Up', 'Copenhagen Plank',
  'Pallof Press', 'Band Anti-Rotation Press', 'Band External Rotation',
  'Band Internal Rotation', 'Band Finger Extension', 'Hamstring Floss',
  'Hip Flexor Stretch', '45-Degree Back Extension', '90/90 Hip Switch',
  'Adductor Rockback', 'Jump Rope',
];

// ── Reason chips for Suggested Swaps ─────────────────────────────────────────
const SWAP_REASONS: { label: string; reason: AdjustReason | 'All' }[] = [
  { label: 'All reasons',   reason: 'All' },
  { label: 'Pain/Injury',   reason: 'Pain/Injury' },
  { label: 'No Equipment',  reason: 'No Equipment' },
  { label: 'Low Energy',    reason: 'Low Energy' },
  { label: 'Preference',    reason: 'Preference' },
];

// ── Types ─────────────────────────────────────────────────────────────────────
export interface PickedExercise {
  name: string;
  category: string;
  reason?: string; // reason from Suggested Swaps filter if applicable
  fields?: { type: string }[];   // chosen set-field config (custom exercises)
  videoUrl?: string;             // optional How-To link (custom exercises)
}

// Section options for a custom exercise → app display categories used on Today.
const CATEGORY_OPTIONS: { key: string; label: string }[] = [
  { key: 'warmup',      label: 'Warm-up' },
  { key: 'primary',     label: 'Main / Primary' },
  { key: 'supplemental', label: 'Supplemental' },
  { key: 'accessory',   label: 'Accessory' },
  { key: 'gpp',         label: 'Conditioning' },
  { key: 'cooldown',    label: 'Cooldown' },
];

// Field-type options — reuse the app's existing set-field / prescriptionType system.
// Each maps to a prescriptionType (persisted server-side) and a concrete field list.
const FIELD_TYPE_OPTIONS: { key: string; label: string; prescriptionType: string; fields: { type: string }[] }[] = [
  { key: 'weighted', label: 'Weight × Reps', prescriptionType: 'weighted', fields: [{ type: 'weight' }, { type: 'reps' }] },
  { key: 'reps',     label: 'Reps only',     prescriptionType: 'weighted', fields: [{ type: 'reps' }] },
  { key: 'timed',    label: 'Time (sec)',    prescriptionType: 'timed',    fields: [{ type: 'time' }] },
  { key: 'distance', label: 'Distance',      prescriptionType: 'distance', fields: [{ type: 'distance' }] },
  { key: 'calories', label: 'Calories',      prescriptionType: 'calories', fields: [{ type: 'calories' }] },
];

// Rebuild a field list from a persisted prescriptionType (for saved custom exercises).
function fieldsFromPrescriptionType(pt?: string | null): { type: string }[] {
  switch (pt) {
    case 'timed':    return [{ type: 'time' }];
    case 'distance': return [{ type: 'distance' }];
    case 'height':   return [{ type: 'distance' }];
    case 'calories': return [{ type: 'calories' }];
    case 'weighted':
    default:         return [{ type: 'weight' }, { type: 'reps' }];
  }
}

// Map a stored category string to a valid Today display category.
function toDisplayCategory(c?: string | null): string {
  switch (c) {
    case 'warmup':   return 'warmup';
    case 'cooldown': return 'cooldown';
    case 'gpp':
    case 'conditioning': return 'gpp';
    case 'primary':
    case 'main':     return 'primary';
    case 'accessory': return 'accessory';
    case 'prehab':   return 'prehab';
    default:         return 'supplemental';
  }
}

interface ExercisePickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (exercise: PickedExercise) => void;
  originalExerciseName?: string;   // when set → shows Suggested Swaps at top
  title?: string;
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <View style={p.sectionHeader}>
      <Text style={p.sectionLabel}>{label}</Text>
      {count > 0 && (
        <View style={p.sectionCount}>
          <Text style={p.sectionCountText}>{count}</Text>
        </View>
      )}
    </View>
  );
}

// ── Exercise row ──────────────────────────────────────────────────────────────
function ExRow({
  name, sub, onPress, isCustom,
}: { name: string; sub?: string; onPress: () => void; isCustom?: boolean }) {
  return (
    <TouchableOpacity style={p.exRow} onPress={onPress} activeOpacity={0.7}>
      <View style={{ flex: 1 }}>
        <Text style={p.exName}>{name}</Text>
        {!!sub && <Text style={p.exSub}>{sub}</Text>}
      </View>
      {isCustom && (
        <View style={p.customBadge}>
          <Text style={p.customBadgeText}>CUSTOM</Text>
        </View>
      )}
      <MaterialCommunityIcons name="chevron-right" size={16} color={MUTED} />
    </TouchableOpacity>
  );
}

// ── Suggested swap card ───────────────────────────────────────────────────────
function SuggCard({
  name, equipment, note, onPress,
}: { name: string; equipment: string; note: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={p.suggCard} onPress={onPress} activeOpacity={0.75}>
      <View style={{ flex: 1 }}>
        <Text style={p.suggName}>{name}</Text>
        <Text style={p.suggEquip}>
          <MaterialCommunityIcons name="dumbbell" size={10} color={MUTED} /> {equipment}
        </Text>
        <Text style={p.suggNote} numberOfLines={2}>{note}</Text>
      </View>
      <MaterialCommunityIcons name="swap-horizontal" size={16} color={GOLD} style={{ marginLeft: 10 }} />
    </TouchableOpacity>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ExercisePicker({
  visible, onClose, onSelect, originalExerciseName, title,
}: ExercisePickerProps) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;

  const [query,          setQuery]         = useState('');
  const [swapReason,     setSwapReason]    = useState<AdjustReason | 'All'>('All');
  const [customExs,      setCustomExs]     = useState<UserExercise[]>([]);
  const [loadingCustom,  setLoadingCustom] = useState(false);
  const [showCreate,     setShowCreate]    = useState(false);
  const [newName,        setNewName]       = useState('');
  const [newPrescr,      setNewPrescr]     = useState('');
  const [newCategory,    setNewCategory]   = useState('supplemental');
  const [newFieldType,   setNewFieldType]  = useState('weighted');
  const [newVideoUrl,    setNewVideoUrl]   = useState('');
  const [creating,       setCreating]      = useState(false);

  // ── Animate in / out ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      setQuery(''); setSwapReason('All'); setShowCreate(false); setNewName(''); setNewPrescr('');
      setNewCategory('supplemental'); setNewFieldType('weighted'); setNewVideoUrl('');
      loadCustom();
      Animated.spring(slideAnim, {
        toValue: 0, damping: 22, stiffness: 220, useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_H, duration: 230, useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const loadCustom = useCallback(async () => {
    setLoadingCustom(true);
    try {
      const res = await userExercisesApi.list();
      setCustomExs(res.exercises || []);
    } catch { /* silent */ }
    finally { setLoadingCustom(false); }
  }, []);

  const pick = (name: string, category: string, reason?: string, fields?: { type: string }[], videoUrl?: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelect({ name, category, reason, fields, videoUrl });
    onClose();
  };

  // Suggested swaps ─────────────────────────────────────────────────────────
  const suggestions = (() => {
    if (!originalExerciseName) return [];
    const r: AdjustReason = swapReason === 'All' ? 'Preference' : (swapReason as AdjustReason);
    return getAlternatives(originalExerciseName.split(' @')[0].split(' •')[0].trim(), r);
  })();

  // Filter helpers ──────────────────────────────────────────────────────────
  const q = query.toLowerCase().trim();
  const filterList = (list: string[]) =>
    q ? list.filter(n => n.toLowerCase().includes(q)) : list;
  const filterCustom = () =>
    q ? customExs.filter(e => e.name.toLowerCase().includes(q)) : customExs;

  const filteredCustom    = filterCustom();
  const filteredMain       = filterList(MAIN_LIFTS);
  const filteredSuppl      = filterList(SUPPLEMENTAL);
  const filteredAccess     = filterList(ACCESSORIES);
  const filteredPrehab     = filterList(PREHAB);

  // Create form ─────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) { Alert.alert('Name required'); return; }
    const ft = FIELD_TYPE_OPTIONS.find(f => f.key === newFieldType) || FIELD_TYPE_OPTIONS[0];
    const videoUrl = newVideoUrl.trim();
    setCreating(true);
    try {
      const created = await userExercisesApi.create({
        name: trimmed,
        category: newCategory,               // real display category
        defaultPrescription: newPrescr.trim(),
        prescriptionType: ft.prescriptionType,
        videoUrl: videoUrl || undefined,
      });
      await loadCustom();
      pick(created.name, toDisplayCategory(newCategory), undefined, ft.fields, videoUrl || undefined);
    } catch {
      Alert.alert('Error', 'Could not save exercise. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={p.overlay} onPress={onClose} />
      <Animated.View
        style={[p.sheet, { paddingBottom: insets.bottom + 8, transform: [{ translateY: slideAnim }] }]}
      >
        {/* ── Header ── */}
        <View style={p.header}>
          <View style={p.handle} />
          <View style={p.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={p.headerTitle}>{title || 'Choose Exercise'}</Text>
              {!!originalExerciseName && (
                <Text style={p.headerSub} numberOfLines={1}>
                  Swapping: {originalExerciseName.split(' @')[0]}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={onClose} style={p.closeBtn} activeOpacity={0.7}>
              <MaterialCommunityIcons name="close" size={20} color={MUTED} />
            </TouchableOpacity>
          </View>
          {/* ── Search ── */}
          <View style={p.searchBox}>
            <MaterialCommunityIcons name="magnify" size={18} color={MUTED} style={{ marginRight: 8 }} />
            <TextInput
              style={p.searchInput}
              placeholder="Search exercises…"
              placeholderTextColor={MUTED}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
            {!!query && (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialCommunityIcons name="close-circle" size={16} color={MUTED} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Body ── */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          keyboardVerticalOffset={insets.bottom + 60}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >

            {/* ── CREATE CUSTOM EXERCISE (directly under the search bar) ── */}
            <View style={p.createSection}>
              {!showCreate ? (
                <TouchableOpacity
                  style={p.createBtn}
                  onPress={() => setShowCreate(true)}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name="plus-circle-outline" size={18} color={GOLD} />
                  <Text style={p.createBtnText}>Create New Exercise</Text>
                </TouchableOpacity>
              ) : (
                <View style={p.createForm}>
                  <Text style={p.createFormTitle}>NEW CUSTOM EXERCISE</Text>
                  <TextInput
                    style={p.createInput}
                    placeholder="Exercise name *"
                    placeholderTextColor={MUTED}
                    value={newName}
                    onChangeText={setNewName}
                    autoCorrect={false}
                    returnKeyType="next"
                  />

                  {/* Section / category */}
                  <Text style={p.createFieldLabel}>SECTION</Text>
                  <View style={p.chipRow}>
                    {CATEGORY_OPTIONS.map(o => {
                      const active = newCategory === o.key;
                      return (
                        <TouchableOpacity
                          key={o.key}
                          style={[p.chip, active && p.chipActive]}
                          onPress={() => setNewCategory(o.key)}
                          activeOpacity={0.75}
                        >
                          <Text style={[p.chipText, active && p.chipTextActive]}>{o.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Field type / what it tracks */}
                  <Text style={p.createFieldLabel}>TRACKS</Text>
                  <View style={p.chipRow}>
                    {FIELD_TYPE_OPTIONS.map(o => {
                      const active = newFieldType === o.key;
                      return (
                        <TouchableOpacity
                          key={o.key}
                          style={[p.chip, active && p.chipActive]}
                          onPress={() => setNewFieldType(o.key)}
                          activeOpacity={0.75}
                        >
                          <Text style={[p.chipText, active && p.chipTextActive]}>{o.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <TextInput
                    style={p.createInput}
                    placeholder="Default prescription (e.g. 3×10)"
                    placeholderTextColor={MUTED}
                    value={newPrescr}
                    onChangeText={setNewPrescr}
                    autoCorrect={false}
                    returnKeyType="next"
                  />
                  <TextInput
                    style={p.createInput}
                    placeholder="YouTube link (optional — auto-search if blank)"
                    placeholderTextColor={MUTED}
                    value={newVideoUrl}
                    onChangeText={setNewVideoUrl}
                    autoCorrect={false}
                    autoCapitalize="none"
                    keyboardType="url"
                    returnKeyType="done"
                  />

                  <View style={p.createFormActions}>
                    <TouchableOpacity
                      style={p.createCancelBtn}
                      onPress={() => { setShowCreate(false); setNewName(''); setNewPrescr(''); setNewVideoUrl(''); }}
                    >
                      <Text style={p.createCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[p.createSaveBtn, !newName.trim() && { opacity: 0.4 }]}
                      onPress={handleCreate}
                      disabled={!newName.trim() || creating}
                    >
                      {creating
                        ? <ActivityIndicator color={BG} size="small" />
                        : <Text style={p.createSaveText}>Save & Use</Text>
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* ── SUGGESTED SWAPS ── */}
            {!!originalExerciseName && !q && (
              <View style={p.section}>
                <SectionHeader label="SUGGESTED SWAPS" count={0} />
                {/* Reason chips */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 12 }}
                >
                  {SWAP_REASONS.map(({ label, reason }) => {
                    const active = swapReason === reason;
                    return (
                      <TouchableOpacity
                        key={label}
                        style={[p.reasonChip, active && p.reasonChipActive]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setSwapReason(reason);
                        }}
                        activeOpacity={0.75}
                      >
                        <Text style={[p.reasonChipText, active && p.reasonChipTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                {/* Suggested cards */}
                {suggestions.length > 0 ? (
                  <View style={{ paddingHorizontal: 16, gap: 8 }}>
                    {suggestions.map((alt) => (
                      <SuggCard
                        key={alt.name}
                        name={alt.name}
                        equipment={alt.equipment}
                        note={alt.intentNote}
                        onPress={() => pick(alt.name, 'main', swapReason !== 'All' ? swapReason : 'Preference')}
                      />
                    ))}
                  </View>
                ) : (
                  <Text style={[p.emptyText, { paddingHorizontal: 16, paddingBottom: 8 }]}>
                    No suggestions for this exercise
                  </Text>
                )}
              </View>
            )}

            {/* ── CUSTOM EXERCISES ── */}
            {(filteredCustom.length > 0 || loadingCustom) && (
              <View style={p.section}>
                <SectionHeader label="YOUR CUSTOM EXERCISES" count={filteredCustom.length} />
                {loadingCustom ? (
                  <ActivityIndicator color={GOLD} style={{ padding: 16 }} />
                ) : (
                  filteredCustom.map((ex) => (
                    <ExRow
                      key={ex.id}
                      name={ex.name}
                      sub={ex.defaultPrescription || undefined}
                      isCustom
                      onPress={() => pick(
                        ex.name,
                        toDisplayCategory(ex.category),
                        undefined,
                        fieldsFromPrescriptionType(ex.prescriptionType),
                        ex.videoUrl || undefined,
                      )}
                    />
                  ))
                )}
              </View>
            )}

            {/* ── MAIN LIFTS ── */}
            {filteredMain.length > 0 && (
              <View style={p.section}>
                <SectionHeader label="MAIN LIFTS" count={filteredMain.length} />
                {filteredMain.map((name, i) => (
                  <ExRow key={`main-${name}-${i}`} name={name} onPress={() => pick(name, 'main')} />
                ))}
              </View>
            )}

            {/* ── SUPPLEMENTAL ── */}
            {filteredSuppl.length > 0 && (
              <View style={p.section}>
                <SectionHeader label="SUPPLEMENTAL" count={filteredSuppl.length} />
                {filteredSuppl.map((name, i) => (
                  <ExRow key={`supplemental-${name}-${i}`} name={name} onPress={() => pick(name, 'supplemental')} />
                ))}
              </View>
            )}

            {/* ── ACCESSORIES ── */}
            {filteredAccess.length > 0 && (
              <View style={p.section}>
                <SectionHeader label="ACCESSORIES" count={filteredAccess.length} />
                {filteredAccess.map((name, i) => (
                  <ExRow key={`accessory-${name}-${i}`} name={name} onPress={() => pick(name, 'accessory')} />
                ))}
              </View>
            )}

            {/* ── PREHAB / INJURY PREVENTION ── */}
            {filteredPrehab.length > 0 && (
              <View style={p.section}>
                <SectionHeader label="PREHAB / INJURY PREVENTION" count={filteredPrehab.length} />
                {filteredPrehab.map((name, i) => (
                  <ExRow key={`prehab-${name}-${i}`} name={name} onPress={() => pick(name, 'prehab')} />
                ))}
              </View>
            )}

            {/* ── No results ── */}
            {q && filteredCustom.length === 0 && filteredMain.length === 0 &&
              filteredSuppl.length === 0 && filteredAccess.length === 0 &&
              filteredPrehab.length === 0 && (
                <View style={p.noResults}>
                  <MaterialCommunityIcons name="magnify-close" size={32} color="#333" />
                  <Text style={p.noResultsText}>No exercises match "{query}"</Text>
                  <TouchableOpacity
                    style={p.createFromSearchBtn}
                    onPress={() => { setShowCreate(true); setNewName(query); }}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons name="plus" size={14} color={GOLD} />
                    <Text style={p.createFromSearchText}>Create "{query}" as custom</Text>
                  </TouchableOpacity>
                </View>
              )}

          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const p = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    height: SCREEN_H * 0.88,
    backgroundColor: BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#333', alignSelf: 'center', marginTop: 10, marginBottom: 6,
  },
  header: {
    borderBottomWidth: 1, borderBottomColor: BORDER,
    paddingBottom: 10,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: TEXT, letterSpacing: -0.3 },
  headerSub:   { fontSize: 11, color: MUTED, marginTop: 2 },
  closeBtn: { padding: 4 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16,
    backgroundColor: CARD2, borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: 14, color: TEXT, padding: 0 },

  section: { marginTop: 4 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6,
  },
  sectionLabel: {
    fontSize: 10, fontWeight: '800', color: MUTED,
    letterSpacing: 1.2, textTransform: 'uppercase',
  },
  sectionCount: {
    backgroundColor: '#1E1E28', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  sectionCountText: { fontSize: 9, fontWeight: '700', color: MUTED },

  exRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#13131700',
  },
  exName: { fontSize: 14, color: TEXT, fontWeight: '500' },
  exSub:  { fontSize: 11, color: MUTED, marginTop: 2 },
  customBadge: {
    backgroundColor: GOLD + '18', borderWidth: 1, borderColor: GOLD + '40',
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginRight: 8,
  },
  customBadgeText: { fontSize: 9, fontWeight: '800', color: GOLD, letterSpacing: 0.8 },

  // Suggested cards
  suggCard: {
    backgroundColor: CARD2, borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    padding: 12, flexDirection: 'row', alignItems: 'flex-start',
  },
  suggName:  { fontSize: 14, fontWeight: '600', color: TEXT, marginBottom: 3 },
  suggEquip: { fontSize: 11, color: MUTED, marginBottom: 4 },
  suggNote:  { fontSize: 11, color: '#888', lineHeight: 15 },

  reasonChip: {
    backgroundColor: CARD2, borderRadius: 100, borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  reasonChipActive: { backgroundColor: GOLD + '20', borderColor: GOLD + '60' },
  reasonChipText: { fontSize: 12, color: MUTED, fontWeight: '500' },
  reasonChipTextActive: { color: GOLD, fontWeight: '700' },

  emptyText: { fontSize: 13, color: MUTED, paddingVertical: 8 },

  noResults: {
    alignItems: 'center', paddingVertical: 40, paddingHorizontal: 32, gap: 12,
  },
  noResultsText: { fontSize: 14, color: MUTED, textAlign: 'center' },
  createFromSearchBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: GOLD + '18', borderWidth: 1, borderColor: GOLD + '40',
    borderRadius: 100, paddingHorizontal: 16, paddingVertical: 9,
  },
  createFromSearchText: { fontSize: 13, color: GOLD, fontWeight: '600' },

  // Create section
  createSection: {
    marginHorizontal: 16, marginTop: 20, marginBottom: 8,
  },
  createBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: CARD2, borderRadius: 12, borderWidth: 1, borderColor: GOLD + '30',
    borderStyle: 'dashed', paddingVertical: 14, justifyContent: 'center',
  },
  createBtnText: { fontSize: 14, color: GOLD, fontWeight: '600' },

  createForm: {
    backgroundColor: CARD2, borderRadius: 14, borderWidth: 1, borderColor: BORDER,
    padding: 14, gap: 10,
  },
  createFormTitle: {
    fontSize: 10, fontWeight: '800', color: GOLD, letterSpacing: 1.2,
    textTransform: 'uppercase', marginBottom: 2,
  },
  createInput: {
    backgroundColor: BG, borderRadius: 10, borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: TEXT,
  },
  createFieldLabel: {
    fontSize: 10, fontWeight: '800', color: MUTED, letterSpacing: 1,
    textTransform: 'uppercase', marginTop: 4, marginBottom: 2,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
    borderWidth: 1, borderColor: BORDER, backgroundColor: BG,
  },
  chipActive: { backgroundColor: GOLD, borderColor: GOLD },
  chipText: { fontSize: 12, color: TEXT, fontWeight: '600' },
  chipTextActive: { color: BG, fontWeight: '800' },
  createFormActions: {
    flexDirection: 'row', gap: 8, marginTop: 4,
  },
  createCancelBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: BORDER,
    alignItems: 'center',
  },
  createCancelText: { fontSize: 13, color: MUTED },
  createSaveBtn: {
    flex: 2, backgroundColor: GOLD, borderRadius: 10,
    paddingVertical: 10, alignItems: 'center', justifyContent: 'center',
  },
  createSaveText: { fontSize: 13, fontWeight: '700', color: BG },
});

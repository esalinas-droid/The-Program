/**
 * AddExerciseSheet — Tasks 3 + 4
 * Two-state bottom sheet:
 *   'picker'  → HOW IS IT MEASURED? + search + modifiers (Task 3)
 *   'create'  → full create-exercise form (Task 4)
 */

import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, TouchableOpacity,
  TextInput, ScrollView, Animated, Dimensions, KeyboardAvoidingView,
  Platform, Alert, ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, FONTS, RADIUS } from '../constants/theme';
import { MAIN_LIFTS, SUPPLEMENTAL, ACCESSORIES, PREHAB } from './ExercisePicker';
import { userExercisesApi, UserExercise } from '../utils/api';

// ── Types ─────────────────────────────────────────────────────────────────────
export type PrescriptionType =
  | 'weighted' | 'timed' | 'distance' | 'height' | 'calories'
  | 'emom' | 'amrap' | 'for_time';

export interface AddedExercise {
  name: string;
  category: string;
  prescriptionType: PrescriptionType;
  modifiers: string[];
}

// ── Constants ─────────────────────────────────────────────────────────────────
export const PRESCRIPTION_TYPES: {
  type: PrescriptionType; label: string; icon: string;
}[] = [
  { type: 'weighted',  label: 'WEIGHTED',  icon: 'weight-lifter' },
  { type: 'timed',     label: 'TIMED',     icon: 'timer-outline' },
  { type: 'distance',  label: 'DISTANCE',  icon: 'map-marker-distance' },
  { type: 'height',    label: 'HEIGHT',    icon: 'arrow-up-box' },
  { type: 'calories',  label: 'CALORIES',  icon: 'fire' },
  { type: 'emom',      label: 'EMOM',      icon: 'clock-outline' },
  { type: 'amrap',     label: 'AMRAP',     icon: 'repeat-variant' },
  { type: 'for_time',  label: 'FOR TIME',  icon: 'stopwatch-outline' },
];

const MODIFIERS = [
  'Per side', 'Tempo', 'Drop set', 'RIR', '%1RM', 'Pair (A1/A2)', 'Rest spec',
];
const EXERCISE_CATEGORIES = [
  'Push', 'Pull', 'Squat', 'Hinge', 'Carry', 'Isolation', 'Core',
];

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');
const GOLD = COLORS.accent;

interface LibraryItem { name: string; category: string; isCustom: boolean; }

const BUILT_IN: LibraryItem[] = [
  ...MAIN_LIFTS.map(n   => ({ name: n, category: 'main',         isCustom: false })),
  ...SUPPLEMENTAL.map(n => ({ name: n, category: 'supplemental', isCustom: false })),
  ...ACCESSORIES.map(n  => ({ name: n, category: 'accessory',    isCustom: false })),
  ...PREHAB.map(n       => ({ name: n, category: 'prehab',       isCustom: false })),
];

// ── Props ─────────────────────────────────────────────────────────────────────
interface SheetProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (exercise: AddedExercise) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AddExerciseSheet({ visible, onClose, onAdd }: SheetProps) {
  const insets   = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;

  // Picker state
  const [view,              setView]             = useState<'picker' | 'create'>('picker');
  const [selectedType,      setSelectedType]     = useState<PrescriptionType | null>(null);
  const [query,             setQuery]            = useState('');
  const [selectedExercise,  setSelectedExercise] = useState<LibraryItem | null>(null);
  const [activeModifiers,   setActiveModifiers]  = useState<string[]>([]);
  const [customExercises,   setCustomExercises]  = useState<UserExercise[]>([]);
  const [loadingCustom,     setLoadingCustom]    = useState(false);

  // Create-form state
  const [createName,      setCreateName]      = useState('');
  const [createType,      setCreateType]      = useState<PrescriptionType | null>(null);
  const [createCategory,  setCreateCategory]  = useState('');
  const [createMuscles,   setCreateMuscles]   = useState('');
  const [createEquipment, setCreateEquipment] = useState('');
  const [createVideoUrl,  setCreateVideoUrl]  = useState('');
  const [videoUrlStatus,  setVideoUrlStatus]  = useState<'valid' | 'invalid' | null>(null);
  const [createNotes,     setCreateNotes]     = useState('');
  const [creating,        setCreating]        = useState(false);

  const BTN_W = Math.floor((SCREEN_W - 2 * SPACING.lg - 3 * SPACING.sm) / 4);

  // ── Effects ────────────────────────────────────────────────────────────────
  const loadCustom = useCallback(async () => {
    setLoadingCustom(true);
    try {
      const { exercises } = await userExercisesApi.list();
      setCustomExercises(exercises.filter(e => !e.isArchived));
    } catch { /* silent */ } finally { setLoadingCustom(false); }
  }, []);

  const resetState = useCallback(() => {
    setView('picker'); setSelectedType(null); setQuery('');
    setSelectedExercise(null); setActiveModifiers([]);
    setCreateName(''); setCreateType(null); setCreateCategory('');
    setCreateMuscles(''); setCreateEquipment(''); setCreateVideoUrl('');
    setVideoUrlStatus(null); setCreateNotes(''); setCreating(false);
  }, []);

  useEffect(() => {
    if (visible) {
      resetState();
      Animated.spring(slideAnim, {
        toValue: 0, damping: 22, stiffness: 220, useNativeDriver: true,
      }).start();
      loadCustom();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_H, duration: 230, useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  // ── Derived data ───────────────────────────────────────────────────────────
  const filtered = useMemo((): LibraryItem[] => {
    const q = query.toLowerCase().trim();
    const customItems: LibraryItem[] = customExercises.map(e => ({
      name: e.name, category: e.category || 'custom', isCustom: true,
    }));
    if (!q) return [...customItems, ...BUILT_IN.slice(0, 25)];
    return [
      ...customItems.filter(e => e.name.toLowerCase().includes(q)),
      ...BUILT_IN.filter(e => e.name.toLowerCase().includes(q)),
    ].slice(0, 30);
  }, [query, customExercises]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const toggleModifier = (mod: string) =>
    setActiveModifiers(prev =>
      prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod]
    );

  const handleAddToSession = () => {
    if (!selectedExercise || !selectedType) {
      Alert.alert('Missing info', 'Please select a measurement type and an exercise.');
      return;
    }
    onAdd({
      name: selectedExercise.name,
      category: selectedExercise.category,
      prescriptionType: selectedType,
      modifiers: activeModifiers,
    });
    onClose();
  };

  const handleOpenCreate = () => {
    setCreateName(query.trim());
    setCreateType(selectedType);
    setView('create');
  };

  const handleCreate = async () => {
    if (!createName.trim()) {
      Alert.alert('Name required', 'Please enter an exercise name.');
      return;
    }
    if (!createType) {
      Alert.alert('Type required', 'Please select how this exercise is measured.');
      return;
    }
    setCreating(true);
    try {
      const muscles = createMuscles.split(',').map(m => m.trim()).filter(Boolean);
      const created = await userExercisesApi.create({
        name: createName.trim(),
        category: createCategory.toLowerCase() || 'custom',
        prescriptionType: createType,
        primaryMuscles: muscles.length > 0 ? muscles : undefined,
        equipment: createEquipment.trim() || undefined,
        videoUrl: videoUrlStatus === 'valid' ? createVideoUrl.trim() : undefined,
        notes: createNotes.trim(),
      });
      // Merge into in-memory library so it appears next search immediately
      setCustomExercises(prev => [created, ...prev]);
      onAdd({
        name: created.name,
        category: created.category,
        prescriptionType: createType,
        modifiers: activeModifiers,
      });
      onClose();
    } catch (e: any) {
      Alert.alert('Create failed', e?.message || 'Please try again.');
    } finally { setCreating(false); }
  };

  const handleVideoUrlBlur = () => {
    const u = createVideoUrl.trim();
    if (!u) { setVideoUrlStatus(null); return; }
    try { new URL(u); setVideoUrlStatus('valid'); }
    catch { setVideoUrlStatus('invalid'); }
  };

  const canAdd = !!(selectedExercise && selectedType);

  if (!visible) return null;

  // ── Type-button grid (shared picker + create) ──────────────────────────────
  function TypeGrid({
    value, onChange,
  }: { value: PrescriptionType | null; onChange: (t: PrescriptionType | null) => void }) {
    return (
      <View style={s.typeGrid}>
        {PRESCRIPTION_TYPES.map(pt => {
          const active = value === pt.type;
          return (
            <TouchableOpacity
              key={pt.type}
              style={[s.typeBtn, { width: BTN_W }, active && s.typeBtnActive]}
              onPress={() => onChange(active ? null : pt.type)}
            >
              <MaterialCommunityIcons
                name={pt.icon as any} size={18}
                color={active ? GOLD : COLORS.text.muted}
              />
              <Text style={[s.typeBtnLabel, active && s.typeBtnLabelActive]}>
                {pt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent>
      <Pressable style={s.overlay} onPress={onClose} />
      <Animated.View
        style={[
          s.sheet,
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Header */}
        {view === 'picker' ? (
          <View style={s.header}>
            <View style={s.headerSpacer} />
            <Text style={s.headerTitle}>Add exercise</Text>
            <TouchableOpacity onPress={onClose} style={s.headerBtn}>
              <MaterialCommunityIcons name="close" size={22} color={COLORS.text.secondary} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.header}>
            <TouchableOpacity onPress={() => setView('picker')} style={s.headerBtn}>
              <MaterialCommunityIcons name="arrow-left" size={22} color={COLORS.text.primary} />
            </TouchableOpacity>
            <Text style={s.headerTitle}>Create exercise</Text>
            <TouchableOpacity onPress={onClose} style={s.headerBtn}>
              <MaterialCommunityIcons name="close" size={22} color={COLORS.text.secondary} />
            </TouchableOpacity>
          </View>
        )}

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={s.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >

            {/* ── PICKER VIEW ──────────────────────────────────────────────── */}
            {view === 'picker' && (
              <>
                <Text style={s.sectionLabel}>HOW IS IT MEASURED?</Text>
                <TypeGrid value={selectedType} onChange={setSelectedType} />

                <Text style={s.sectionLabel}>EXERCISE</Text>
                <View style={s.searchRow}>
                  <MaterialCommunityIcons name="magnify" size={18} color={COLORS.text.muted} />
                  <TextInput
                    style={s.searchInput}
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search exercises..."
                    placeholderTextColor={COLORS.text.muted}
                    returnKeyType="search"
                  />
                  {query.length > 0 && (
                    <TouchableOpacity onPress={() => setQuery('')}>
                      <MaterialCommunityIcons name="close-circle" size={16} color={COLORS.text.muted} />
                    </TouchableOpacity>
                  )}
                </View>

                {loadingCustom && (
                  <ActivityIndicator color={GOLD} style={{ marginVertical: SPACING.sm }} />
                )}

                {filtered.map((item, idx) => {
                  const isSel = selectedExercise?.name === item.name;
                  return (
                    <TouchableOpacity
                      key={`${item.name}-${idx}`}
                      style={[s.resultRow, isSel && s.resultRowSelected]}
                      onPress={() => setSelectedExercise(isSel ? null : item)}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons
                        name="dumbbell" size={14}
                        color={isSel ? GOLD : COLORS.text.muted}
                        style={{ marginRight: SPACING.sm }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[s.resultName, isSel && { color: GOLD }]}>{item.name}</Text>
                        <Text style={s.resultCategory}>{item.category.toUpperCase()}</Text>
                      </View>
                      {item.isCustom && (
                        <View style={s.customBadge}>
                          <Text style={s.customBadgeText}>CUSTOM</Text>
                        </View>
                      )}
                      {isSel && (
                        <MaterialCommunityIcons name="check" size={16} color={GOLD} style={{ marginLeft: SPACING.sm }} />
                      )}
                    </TouchableOpacity>
                  );
                })}

                {/* Create new exercise link */}
                <TouchableOpacity style={s.createLink} onPress={handleOpenCreate}>
                  <MaterialCommunityIcons name="plus" size={14} color={GOLD} />
                  <Text style={s.createLinkText}>
                    {query.trim()
                      ? `Create new exercise: "${query.trim()}"`
                      : 'Create new exercise'}
                  </Text>
                </TouchableOpacity>

                {/* Modifiers */}
                <Text style={[s.sectionLabel, { marginTop: SPACING.lg }]}>
                  MODIFIERS
                  <Text style={s.sectionSub}>{' '}(optional · stack any)</Text>
                </Text>
                <View style={s.modifiersWrap}>
                  {MODIFIERS.map(mod => {
                    const on = activeModifiers.includes(mod);
                    return (
                      <TouchableOpacity
                        key={mod}
                        style={[s.modChip, on && s.modChipActive]}
                        onPress={() => toggleModifier(mod)}
                      >
                        <Text style={[s.modChipText, on && s.modChipTextActive]}>{mod}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Preview card */}
                {selectedExercise && (
                  <View style={s.previewCard}>
                    <View style={s.previewBar} />
                    <View style={{ flex: 1, paddingLeft: SPACING.md }}>
                      <Text style={s.previewName}>{selectedExercise.name}</Text>
                      <Text style={s.previewMeta}>
                        {selectedType
                          ? PRESCRIPTION_TYPES.find(p => p.type === selectedType)?.label
                          : '— select type —'}
                        {activeModifiers.length > 0
                          ? ' · ' + activeModifiers.join(', ')
                          : ''}
                        {' · 1 set placeholder'}
                      </Text>
                    </View>
                  </View>
                )}
                <View style={{ height: SPACING.xl }} />
              </>
            )}

            {/* ── CREATE VIEW ──────────────────────────────────────────────── */}
            {view === 'create' && (
              <>
                {/* Info hint */}
                <View style={s.infoHint}>
                  <MaterialCommunityIcons name="lightning-bolt" size={14} color={GOLD} />
                  <Text style={s.infoHintText}>Saves to your library for reuse in any session</Text>
                </View>

                {/* Name */}
                <Text style={s.fieldLabel}>NAME <Text style={s.required}>*</Text></Text>
                <TextInput
                  style={s.fieldInput}
                  value={createName}
                  onChangeText={setCreateName}
                  placeholder="e.g. Belt Squat"
                  placeholderTextColor={COLORS.text.muted}
                  autoCapitalize="words"
                />

                {/* How measured */}
                <Text style={s.fieldLabel}>
                  HOW IS IT MEASURED?<Text style={s.required}> *</Text>
                </Text>
                <TypeGrid value={createType} onChange={setCreateType} />

                {/* Category */}
                <Text style={s.fieldLabel}>
                  CATEGORY <Text style={s.fieldOptional}>(optional)</Text>
                </Text>
                <View style={s.modifiersWrap}>
                  {EXERCISE_CATEGORIES.map(cat => {
                    const on = createCategory === cat;
                    return (
                      <TouchableOpacity
                        key={cat}
                        style={[s.modChip, on && s.modChipActive]}
                        onPress={() => setCreateCategory(on ? '' : cat)}
                      >
                        <Text style={[s.modChipText, on && s.modChipTextActive]}>{cat}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Primary muscles */}
                <Text style={s.fieldLabel}>
                  PRIMARY MUSCLES <Text style={s.fieldOptional}>(optional)</Text>
                </Text>
                <TextInput
                  style={s.fieldInput}
                  value={createMuscles}
                  onChangeText={setCreateMuscles}
                  placeholder="e.g. Quads, Glutes, Hamstrings"
                  placeholderTextColor={COLORS.text.muted}
                />

                {/* Equipment */}
                <Text style={s.fieldLabel}>
                  EQUIPMENT <Text style={s.fieldOptional}>(optional)</Text>
                </Text>
                {/* TODO: PREMIUM — replace with tag-list autocomplete against equipment dictionary (Barbell, Dumbbell, Belt Squat Machine, Yoke, etc.) */}
                <TextInput
                  style={s.fieldInput}
                  value={createEquipment}
                  onChangeText={setCreateEquipment}
                  placeholder="e.g. Belt Squat Machine, Barbell"
                  placeholderTextColor={COLORS.text.muted}
                />

                {/* Demo video URL */}
                <Text style={s.fieldLabel}>
                  DEMO VIDEO URL <Text style={s.fieldOptional}>(optional)</Text>
                </Text>
                <View style={s.urlRow}>
                  <MaterialCommunityIcons
                    name="link-variant" size={16} color={COLORS.text.muted}
                    style={{ marginRight: SPACING.sm }}
                  />
                  <TextInput
                    style={s.urlInput}
                    value={createVideoUrl}
                    onChangeText={t => { setCreateVideoUrl(t); setVideoUrlStatus(null); }}
                    onEndEditing={handleVideoUrlBlur}
                    placeholder="https://..."
                    placeholderTextColor={COLORS.text.muted}
                    keyboardType="url"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                {videoUrlStatus === 'valid' && (
                  <Text style={s.urlValid}>✓ Video saved</Text>
                )}
                {videoUrlStatus === 'invalid' && (
                  <Text style={s.urlInvalid}>⚠ Invalid URL</Text>
                )}
                {/* TODO: PREMIUM — detect YouTube/Vimeo/etc. and render thumbnail preview via oEmbed */}

                {/* Form cues */}
                <Text style={s.fieldLabel}>
                  FORM CUES / NOTES <Text style={s.fieldOptional}>(optional)</Text>
                </Text>
                <TextInput
                  style={[s.fieldInput, s.textarea]}
                  value={createNotes}
                  onChangeText={setCreateNotes}
                  placeholder="Add form cues, setup notes..."
                  placeholderTextColor={COLORS.text.muted}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
                <View style={{ height: SPACING.xxl }} />
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Footer */}
        <View style={[s.footer, { paddingBottom: SPACING.md + insets.bottom }]}>
          <TouchableOpacity
            style={s.cancelBtn}
            onPress={view === 'picker' ? onClose : () => setView('picker')}
          >
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
          {view === 'picker' ? (
            <TouchableOpacity
              style={[s.addBtn, !canAdd && s.addBtnDisabled]}
              onPress={handleAddToSession}
              activeOpacity={0.8}
            >
              <Text style={[s.addBtnText, !canAdd && s.addBtnTextDim]}>Add to session</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[s.addBtn, creating && s.addBtnDisabled]}
              onPress={handleCreate}
              disabled={creating}
              activeOpacity={0.8}
            >
              {creating
                ? <ActivityIndicator color={COLORS.primary} size="small" />
                : <Text style={s.addBtnText}>Create & add</Text>
              }
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    maxHeight: SCREEN_H * 0.88,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerSpacer: { width: 38 },
  headerTitle: {
    flex: 1, textAlign: 'center',
    color: COLORS.text.primary,
    fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.semibold,
  },
  headerBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },

  scrollContent: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },

  sectionLabel: {
    fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold,
    color: COLORS.text.muted, letterSpacing: 0.8,
    marginTop: SPACING.md, marginBottom: SPACING.sm,
  },
  sectionSub: {
    fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.regular,
    color: COLORS.text.muted, letterSpacing: 0,
  },

  // Type buttons
  typeGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  typeBtn: {
    paddingVertical: SPACING.md,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.surfaceHighlight,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
    gap: 4,
  },
  typeBtnActive: { borderColor: GOLD, backgroundColor: `${GOLD}1A` },
  typeBtnLabel: {
    fontSize: 9, fontWeight: FONTS.weights.bold,
    color: COLORS.text.muted, letterSpacing: 0.5, textAlign: 'center',
  },
  typeBtnLabelActive: { color: GOLD },

  // Search
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surfaceHighlight,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  searchInput: {
    flex: 1, color: COLORS.text.primary,
    fontSize: FONTS.sizes.sm, marginLeft: SPACING.sm,
    paddingVertical: 0,
  },

  // Results
  resultRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md, marginBottom: 2,
  },
  resultRowSelected: { backgroundColor: `${GOLD}12` },
  resultName: {
    color: COLORS.text.primary, fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.medium,
  },
  resultCategory: {
    color: COLORS.text.muted, fontSize: 10,
    fontWeight: FONTS.weights.bold, letterSpacing: 0.5,
  },
  customBadge: {
    backgroundColor: `${GOLD}22`, borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm, paddingVertical: 2, marginLeft: SPACING.sm,
  },
  customBadgeText: {
    color: GOLD, fontSize: 9, fontWeight: FONTS.weights.bold, letterSpacing: 0.5,
  },

  // Create new link
  createLink: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.sm,
    marginTop: SPACING.xs,
  },
  createLinkText: { color: GOLD, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.medium },

  // Modifiers
  modifiersWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.md },
  modChip: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceHighlight,
  },
  modChipActive: { borderColor: GOLD, backgroundColor: `${GOLD}1A` },
  modChipText: { color: COLORS.text.secondary, fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.medium },
  modChipTextActive: { color: GOLD },

  // Preview
  previewCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: `${GOLD}0D`,
    borderRadius: RADIUS.md, padding: SPACING.md,
    marginTop: SPACING.md,
  },
  previewBar: { width: 3, height: '100%', backgroundColor: GOLD, borderRadius: 2 },
  previewName: { color: COLORS.text.primary, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold },
  previewMeta: { color: COLORS.text.muted, fontSize: FONTS.sizes.xs, marginTop: 2 },

  // Create form fields
  infoHint: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: `${GOLD}1A`, borderRadius: RADIUS.md,
    padding: SPACING.md, marginBottom: SPACING.lg,
  },
  infoHintText: { color: GOLD, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.medium, flex: 1 },

  fieldLabel: {
    fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold,
    color: COLORS.text.muted, letterSpacing: 0.8,
    marginTop: SPACING.md, marginBottom: SPACING.sm,
  },
  fieldOptional: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.regular, letterSpacing: 0 },
  required: { color: COLORS.status.error },

  fieldInput: {
    backgroundColor: COLORS.surfaceHighlight,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    color: COLORS.text.primary, fontSize: FONTS.sizes.sm,
  },
  textarea: { minHeight: 80, textAlignVertical: 'top', paddingTop: SPACING.md },

  urlRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surfaceHighlight,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  urlInput: {
    flex: 1, color: COLORS.text.primary,
    fontSize: FONTS.sizes.sm, paddingVertical: SPACING.xs,
  },
  urlValid: { color: COLORS.status.success, fontSize: FONTS.sizes.xs, marginTop: 4, marginLeft: 4 },
  urlInvalid: { color: COLORS.status.error, fontSize: FONTS.sizes.xs, marginTop: 4, marginLeft: 4 },

  // Footer
  footer: {
    flexDirection: 'row', gap: SPACING.md,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  cancelBtn: {
    flex: 1, paddingVertical: SPACING.md, alignItems: 'center',
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
  },
  cancelText: { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.medium },
  addBtn: {
    flex: 2, paddingVertical: SPACING.md, alignItems: 'center',
    borderRadius: RADIUS.md, backgroundColor: GOLD,
  },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText: { color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.bold },
  addBtnTextDim: { opacity: 0.6 },
});

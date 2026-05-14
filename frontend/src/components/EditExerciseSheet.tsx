/**
 * EditExerciseSheet — rename and/or change prescription type for a tracker-review exercise.
 * Shows a warning callout if the type change will clear set data.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, TouchableOpacity,
  TextInput, ScrollView, Animated, Dimensions, KeyboardAvoidingView, Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, FONTS, RADIUS } from '../constants/theme';
import { PrescriptionType, PRESCRIPTION_TYPES } from './AddExerciseSheet';

// ── Minimal exercise shape needed by this sheet ───────────────────────────────
export interface ExerciseMinimal {
  id: string;
  name: string;
  prescriptionType: PrescriptionType;
}

// ── Field-clearing helpers ────────────────────────────────────────────────────
type TypeGroup = 'weighted' | 'timed' | 'distance' | 'height' | 'calories';

/** Maps a prescription type to its field group. */
export function getTypeGroup(pt: PrescriptionType): TypeGroup {
  if (['weighted', 'emom', 'amrap', 'for_time'].includes(pt)) return 'weighted';
  return pt as TypeGroup;
}

// 20 cross-group transitions (5 groups × 4 other groups).
// Within-group transitions (e.g. weighted→emom) share the same fields — no clearing needed.
const CLEAR_MESSAGES: Record<string, string> = {
  'weighted→timed':    'Weight, reps & RPE will be cleared',
  'weighted→distance': 'Weight, reps & RPE will be cleared',
  'weighted→height':   'Weight maps to height — reps & RPE carry over',
  'weighted→calories': 'Weight, reps & RPE will be cleared',
  'timed→weighted':    'Duration will be cleared',
  'timed→distance':    'Duration will be cleared',
  'timed→height':      'Duration will be cleared',
  'timed→calories':    'Duration will be cleared',
  'distance→weighted': 'Distance & load will be cleared',
  'distance→timed':    'Distance & load will be cleared',
  'distance→height':   'Distance & load will be cleared',
  'distance→calories': 'Distance & load will be cleared',
  'height→weighted':   'Height maps to weight — reps & RPE carry over',
  'height→timed':      'Height, reps & RPE will be cleared',
  'height→distance':   'Height, reps & RPE will be cleared',
  'height→calories':   'Height, reps & RPE will be cleared',
  'calories→weighted': 'Calories & elapsed time will be cleared',
  'calories→timed':    'Calories & elapsed time will be cleared',
  'calories→distance': 'Calories & elapsed time will be cleared',
  'calories→height':   'Calories & elapsed time will be cleared',
};

/**
 * Returns a human-readable warning string if changing from→to will clear field data,
 * or null if the types share the same field group (no clearing required).
 */
export function getFieldClearingMessage(
  from: PrescriptionType,
  to: PrescriptionType,
): string | null {
  const fromGroup = getTypeGroup(from);
  const toGroup   = getTypeGroup(to);
  if (fromGroup === toGroup) return null;
  return CLEAR_MESSAGES[`${fromGroup}→${toGroup}`] ?? null;
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface EditSheetProps {
  visible: boolean;
  exercise: ExerciseMinimal | null;
  onClose: () => void;
  onSave: (exId: string, newName: string, newType: PrescriptionType) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');
const GOLD  = COLORS.accent;
const AMBER = '#F59E0B';
const BTN_W = Math.floor((SCREEN_W - 2 * SPACING.lg - 3 * SPACING.sm) / 4);

// ── Component ─────────────────────────────────────────────────────────────────
export default function EditExerciseSheet({
  visible, exercise, onClose, onSave,
}: EditSheetProps) {
  const insets    = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;
  const nameRef   = useRef<TextInput>(null);

  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<PrescriptionType>('weighted');

  // Derived: warning message when type changes across groups
  const warningMsg = exercise
    ? getFieldClearingMessage(exercise.prescriptionType, newType)
    : null;

  // Sync local state whenever a different exercise is opened
  useEffect(() => {
    if (visible && exercise) {
      setNewName(exercise.name);
      setNewType(exercise.prescriptionType);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, exercise?.id]);

  // Animate sheet in / out
  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0, damping: 22, stiffness: 220, useNativeDriver: true,
      }).start(() => setTimeout(() => nameRef.current?.focus(), 80));
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_H, duration: 220, useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  if (!visible || !exercise) return null;

  const hasChanges =
    newName.trim() !== exercise.name ||
    newType !== exercise.prescriptionType;

  const handleSave = () => {
    onSave(exercise.id, newName.trim() || exercise.name, newType);
    onClose();
  };

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent>
      <Pressable style={es.overlay} onPress={onClose} />
      <Animated.View style={[es.sheet, { transform: [{ translateY: slideAnim }] }]}>

        {/* Header */}
        <View style={es.header}>
          <View style={{ width: 38 }} />
          <Text style={es.headerTitle}>Edit exercise</Text>
          <TouchableOpacity onPress={onClose} style={es.headerBtn}>
            <MaterialCommunityIcons name="close" size={22} color={COLORS.text.secondary} />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={es.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Exercise name */}
            <Text style={es.fieldLabel}>EXERCISE NAME</Text>
            <TextInput
              ref={nameRef}
              style={es.nameInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="Exercise name"
              placeholderTextColor={COLORS.text.muted}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />

            {/* Measurement type */}
            <Text style={[es.fieldLabel, { marginTop: SPACING.lg }]}>MEASUREMENT TYPE</Text>
            <View style={es.typeGrid}>
              {PRESCRIPTION_TYPES.map(pt => {
                const active = newType === pt.type;
                return (
                  <TouchableOpacity
                    key={pt.type}
                    style={[es.typeBtn, { width: BTN_W }, active && es.typeBtnActive]}
                    onPress={() => setNewType(pt.type)}
                  >
                    <MaterialCommunityIcons
                      name={pt.icon as any}
                      size={18}
                      color={active ? GOLD : COLORS.text.muted}
                    />
                    <Text style={[es.typeBtnLabel, active && es.typeBtnLabelActive]}>
                      {pt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ⚠️ Warning callout — appears when type group changes */}
            {warningMsg ? (
              <View style={es.warningBox}>
                <MaterialCommunityIcons name="alert-outline" size={16} color={AMBER} />
                <View style={{ flex: 1, marginLeft: SPACING.sm }}>
                  <Text style={es.warningTitle}>Existing set data will change</Text>
                  <Text style={es.warningBody}>{warningMsg}</Text>
                </View>
              </View>
            ) : null}

            <View style={{ height: SPACING.xxl }} />
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Footer */}
        <View style={[es.footer, { paddingBottom: SPACING.md + insets.bottom }]}>
          <TouchableOpacity style={es.cancelBtn} onPress={onClose}>
            <Text style={es.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[es.saveBtn, !hasChanges && es.saveBtnDim]}
            onPress={handleSave}
            activeOpacity={0.8}
          >
            <Text style={es.saveBtnText}>Save</Text>
          </TouchableOpacity>
        </View>

      </Animated.View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const es = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: SCREEN_H * 0.72,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: {
    flex: 1, textAlign: 'center',
    color: COLORS.text.primary,
    fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.semibold,
  },
  headerBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },

  scrollContent: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },

  fieldLabel: {
    fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold,
    color: COLORS.text.muted, letterSpacing: 0.8,
    marginBottom: SPACING.sm,
  },
  nameInput: {
    backgroundColor: COLORS.surfaceHighlight,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    color: COLORS.text.primary,
    fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.semibold,
  },

  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.sm },
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

  warningBox: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: 'rgba(245,158,11,0.10)',
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)',
    padding: SPACING.md, marginTop: SPACING.md,
  },
  warningTitle: {
    fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold,
    color: '#F59E0B', marginBottom: 2,
  },
  warningBody: {
    fontSize: FONTS.sizes.xs, color: COLORS.text.secondary, lineHeight: 16,
  },

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
  cancelText: {
    color: COLORS.text.secondary, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.medium,
  },
  saveBtn: {
    flex: 2, paddingVertical: SPACING.md, alignItems: 'center',
    borderRadius: RADIUS.md, backgroundColor: GOLD,
  },
  saveBtnDim: { opacity: 0.45 },
  saveBtnText: {
    color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.bold,
  },
});

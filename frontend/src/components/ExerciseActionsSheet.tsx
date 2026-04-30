/**
 * ExerciseActionsSheet — adaptive bottom sheet for per-exercise actions.
 *
 * Shows different action buttons based on session state:
 * | State       | Swap | Skip              | Add note | View history |
 * |-------------|------|-------------------|----------|--------------|
 * | today       | ✅   | ✅ Skip exercise  | ✅       | ✅           |
 * | upcoming    | ✅   | ✅ Skip exercise  | ✅       | ✅           |
 * | completed   | —    | —                 | ✅       | ✅           |
 * | missed      | ✅   | —                 | ✅       | ✅           |
 *
 * View history shows last 5 log entries for this exercise inline.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Animated,
  Dimensions, Pressable, TextInput, ActivityIndicator, ScrollView,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { logApi } from '../../src/utils/api';

// ── Palette ───────────────────────────────────────────────────────────────────
const GOLD   = '#C9A84C';
const RED    = '#EF5350';
const GREEN  = '#4DCEA6';
const AMBER  = '#FF9800';
const BLUE   = '#4A9FDF';
const BG     = '#0A0A0C';
const CARD   = '#111114';
const CARD2  = '#16161A';
const BORDER = '#1E1E22';
const TEXT   = '#E8E8E6';
const MUTED  = '#666';

const { height: SCREEN_H } = Dimensions.get('window');

// ── Types ─────────────────────────────────────────────────────────────────────
export type SessionStateType = 'today' | 'upcoming' | 'completed' | 'missed';

export interface ActionExercise {
  name: string;
  category?: string;
  prescription?: string;
  exerciseId?: string;
}

interface ExerciseActionsSheetProps {
  visible: boolean;
  onClose: () => void;
  exercise: ActionExercise;
  sessionState: SessionStateType;
  onSwap: () => void;    // caller opens ExercisePicker
  onSkip: () => void;    // caller updates local state + records substitution
  onAddNote: (note: string) => void;
}

// ── Category color map ────────────────────────────────────────────────────────
function getCatColor(cat?: string) {
  switch ((cat || '').toLowerCase()) {
    case 'main':          return '#EF5350';
    case 'supplemental':  return '#FF9800';
    case 'accessory':     return '#4A9FDF';
    case 'prehab':        return '#4DCEA6';
    case 'custom':        return '#C9A84C';
    default:              return '#888';
  }
}

// ── Action button ─────────────────────────────────────────────────────────────
function ActionBtn({
  icon, label, color, onPress, disabled,
}: {
  icon: string; label: string; color: string;
  onPress: () => void; disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[a.actionBtn, disabled && { opacity: 0.3 }]}
      onPress={disabled ? undefined : onPress}
      activeOpacity={0.75}
    >
      <View style={[a.actionIcon, { backgroundColor: color + '18', borderColor: color + '40' }]}>
        <MaterialCommunityIcons name={icon as any} size={20} color={color} />
      </View>
      <Text style={a.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Log entry row ─────────────────────────────────────────────────────────────
function LogRow({ entry }: { entry: any }) {
  return (
    <View style={a.logRow}>
      <Text style={a.logDate}>{entry.date}</Text>
      <Text style={a.logSets}>
        {entry.weight ? `${entry.weight} lbs × ${entry.reps}` : `${entry.reps} reps`}
      </Text>
      {entry.rpe > 0 && (
        <Text style={a.logRpe}>RPE {entry.rpe}</Text>
      )}
    </View>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ExerciseActionsSheet({
  visible, onClose, exercise, sessionState,
  onSwap, onSkip, onAddNote,
}: ExerciseActionsSheetProps) {
  const insets   = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;

  const [view,         setView]         = useState<'menu' | 'note' | 'history'>('menu');
  const [noteText,     setNoteText]     = useState('');
  const [historyLogs,  setHistoryLogs]  = useState<any[]>([]);
  const [loadingHist,  setLoadingHist]  = useState(false);

  useEffect(() => {
    if (visible) {
      setView('menu'); setNoteText('');
      Animated.spring(slideAnim, {
        toValue: 0, damping: 22, stiffness: 220, useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_H, duration: 220, useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const loadHistory = useCallback(async () => {
    if (!exercise.name) return;
    setLoadingHist(true);
    try {
      const res = await logApi.list({ exercise: exercise.name });
      const logs = Array.isArray(res) ? res : (res?.logs || []);
      // Group by date, take top set per day
      const byDate: Record<string, any> = {};
      for (const entry of logs) {
        const key = entry.date;
        const w = parseFloat(entry.weight) || 0;
        if (!byDate[key] || w > (parseFloat(byDate[key].weight) || 0)) {
          byDate[key] = entry;
        }
      }
      const sorted = Object.values(byDate)
        .sort((a: any, b: any) => b.date.localeCompare(a.date))
        .slice(0, 6);
      setHistoryLogs(sorted);
    } catch { setHistoryLogs([]); }
    finally { setLoadingHist(false); }
  }, [exercise.name]);

  const handleViewHistory = () => {
    setView('history');
    loadHistory();
  };

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onAddNote(noteText.trim());
    onClose();
  };

  const canSwap  = sessionState === 'today' || sessionState === 'upcoming' || sessionState === 'missed';
  const canSkip  = sessionState === 'today' || sessionState === 'upcoming';
  const catColor = getCatColor(exercise.category);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={a.overlay} onPress={onClose} />
      <Animated.View
        style={[
          a.sheet,
          { paddingBottom: insets.bottom + 12, transform: [{ translateY: slideAnim }] },
        ]}
      >
        <View style={a.handle} />

        {/* ── Exercise header ── */}
        <View style={a.exHeader}>
          <View style={[a.catDot, { backgroundColor: catColor }]} />
          <View style={{ flex: 1 }}>
            <Text style={a.exName} numberOfLines={1}>{exercise.name}</Text>
            {!!exercise.prescription && (
              <Text style={a.exPrescr}>{exercise.prescription}</Text>
            )}
          </View>
          {!!exercise.category && (
            <View style={[a.catBadge, { backgroundColor: catColor + '18', borderColor: catColor + '40' }]}>
              <Text style={[a.catBadgeText, { color: catColor }]}>
                {exercise.category.toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        {/* ── State indicator ── */}
        <View style={a.stateBar}>
          {sessionState === 'today'     && <Text style={[a.stateText, { color: GOLD }]}>TODAY'S SESSION</Text>}
          {sessionState === 'upcoming'  && <Text style={[a.stateText, { color: GREEN }]}>UPCOMING SESSION</Text>}
          {sessionState === 'completed' && <Text style={[a.stateText, { color: RED }]}>COMPLETED SESSION</Text>}
          {sessionState === 'missed'    && <Text style={[a.stateText, { color: AMBER }]}>MISSED SESSION</Text>}
        </View>

        {/* ── Menu view ── */}
        {view === 'menu' && (
          <View style={a.actionsGrid}>
            {canSwap && (
              <ActionBtn
                icon="swap-horizontal"
                label="Swap"
                color={GOLD}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onClose();
                  // Small delay so sheet closes before picker opens
                  setTimeout(onSwap, 180);
                }}
              />
            )}
            {canSkip && (
              <ActionBtn
                icon="skip-next"
                label="Skip exercise"
                color={AMBER}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onSkip();
                  onClose();
                }}
              />
            )}
            <ActionBtn
              icon="pencil-outline"
              label="Add note"
              color={BLUE}
              onPress={() => setView('note')}
            />
            <ActionBtn
              icon="history"
              label="View history"
              color={GREEN}
              onPress={handleViewHistory}
            />
          </View>
        )}

        {/* ── Note view ── */}
        {view === 'note' && (
          <View style={a.noteView}>
            <View style={a.noteHeader}>
              <TouchableOpacity onPress={() => setView('menu')} style={{ padding: 4 }}>
                <MaterialCommunityIcons name="arrow-left" size={20} color={MUTED} />
              </TouchableOpacity>
              <Text style={a.noteTitle}>Add Note</Text>
              <View style={{ width: 28 }} />
            </View>
            <TextInput
              style={a.noteInput}
              placeholder="Write a note about this exercise…"
              placeholderTextColor={MUTED}
              value={noteText}
              onChangeText={setNoteText}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              autoFocus
            />
            <TouchableOpacity
              style={[a.noteSaveBtn, !noteText.trim() && { opacity: 0.4 }]}
              onPress={handleAddNote}
              disabled={!noteText.trim()}
            >
              <Text style={a.noteSaveText}>SAVE NOTE</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── History view ── */}
        {view === 'history' && (
          <View style={a.historyView}>
            <View style={a.noteHeader}>
              <TouchableOpacity onPress={() => setView('menu')} style={{ padding: 4 }}>
                <MaterialCommunityIcons name="arrow-left" size={20} color={MUTED} />
              </TouchableOpacity>
              <Text style={a.noteTitle}>Recent History</Text>
              <View style={{ width: 28 }} />
            </View>
            {loadingHist ? (
              <ActivityIndicator color={GOLD} style={{ marginVertical: 24 }} />
            ) : historyLogs.length === 0 ? (
              <View style={a.historyEmpty}>
                <MaterialCommunityIcons name="dumbbell" size={28} color="#333" />
                <Text style={a.historyEmptyText}>No logged sets yet</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
                {historyLogs.map((entry, i) => (
                  <LogRow key={i} entry={entry} />
                ))}
              </ScrollView>
            )}
          </View>
        )}
      </Animated.View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const a = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: BG, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderColor: BORDER,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#333', alignSelf: 'center',
    marginTop: 10, marginBottom: 4,
  },
  exHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  exName:  { fontSize: 15, fontWeight: '700', color: TEXT, letterSpacing: -0.2 },
  exPrescr:{ fontSize: 12, color: MUTED, marginTop: 2 },
  catBadge: {
    borderRadius: 6, borderWidth: 1,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  catBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },

  stateBar: {
    paddingHorizontal: 16, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  stateText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },

  actionsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 10, padding: 16,
  },
  actionBtn: {
    flex: 1, minWidth: '45%', alignItems: 'center', gap: 8,
    backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER,
    paddingVertical: 16,
  },
  actionIcon: {
    width: 48, height: 48, borderRadius: 14, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  actionLabel: { fontSize: 13, color: TEXT, fontWeight: '600' },

  // Note view
  noteView: { padding: 16 },
  noteHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12,
  },
  noteTitle: { fontSize: 15, fontWeight: '700', color: TEXT },
  noteInput: {
    backgroundColor: CARD2, borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    padding: 12, fontSize: 14, color: TEXT, minHeight: 96,
    textAlignVertical: 'top',
  },
  noteSaveBtn: {
    backgroundColor: GOLD, borderRadius: 12, marginTop: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  noteSaveText: { fontSize: 13, fontWeight: '800', color: BG, letterSpacing: 0.8 },

  // History view
  historyView: { padding: 16 },
  historyEmpty: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  historyEmptyText: { fontSize: 13, color: MUTED },
  logRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  logDate: { fontSize: 12, color: MUTED, minWidth: 82 },
  logSets: { flex: 1, fontSize: 14, fontWeight: '600', color: TEXT },
  logRpe:  { fontSize: 11, color: GOLD },
});

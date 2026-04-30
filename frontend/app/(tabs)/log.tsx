import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Animated, LayoutAnimation,
  UIManager, Platform, PanResponder,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, FONTS, RADIUS, getSessionStyle } from '../../src/constants/theme';
import { calendarApi, logApi, programApi, substitutionApi } from '../../src/utils/api';
import { getLocalDateString, toLocalDateString } from '../../src/utils/dateHelpers';
import ExercisePicker, { PickedExercise } from '../../src/components/ExercisePicker';
import ExerciseActionsSheet, { SessionStateType, ActionExercise } from '../../src/components/ExerciseActionsSheet';
import AskCoachButton from '../../src/components/AskCoachButton';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Palette ───────────────────────────────────────────────────────────────────
const GOLD  = '#C9A84C';
const RED   = '#EF5350';
const GREEN = '#4DCEA6';
const AMBER = '#FF9800';
const BG    = '#0A0A0C';
const CARD  = '#111114';
const BORDER = '#1E1E22';
const TEXT  = '#E8E8E6';
const MUTED = '#666';

// ── Types ─────────────────────────────────────────────────────────────────────
type DayStatus = 'completed' | 'today' | 'upcoming' | 'missed' | 'rest';

interface WeekDay {
  date: string;
  dayAbbr: string;
  dayNum: number;
  status: DayStatus;
  sessionLabel: string;
  sessionType: string;
}

interface SessionCard {
  date: string;
  dateLabel: string;
  sessionType: string;
  status: DayStatus;
  exerciseNames: string[];
  exercises: any[];
  logEntries: any[];
  weekNumber: number;
  phaseName: string;
  blockName: string;
}

interface WeekStats {
  sessionsCompleted: number;
  totalPlanned: number;
  volume: number;
  avgEffort: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const DAY_ABBRS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function getWeekMonday(offset = 0): Date {
  const today = new Date();
  const dow = today.getDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(today);
  monday.setDate(today.getDate() + delta + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getWeekDates(offset: number): string[] {
  const monday = getWeekMonday(offset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return toLocalDateString(d);
  });
}

function getWeekRangeLabel(offset: number): string {
  const monday = getWeekMonday(offset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${monday.toLocaleDateString('en-US', opts)} – ${sunday.toLocaleDateString('en-US', opts)}`;
}

function getDayStatus(
  dateStr: string,
  todayStr: string,
  logsByDate: Record<string, any[]>,
  hasEvent: boolean,
  sessionType?: string,
  completedSessionTypes?: Set<string>,
): DayStatus {
  if (!hasEvent) return 'rest';
  // Primary: exact date match. Secondary: same sessionType logged anywhere this week.
  const exactLog = (logsByDate[dateStr]?.length ?? 0) > 0;
  const typeLogged = !!(sessionType && completedSessionTypes?.has(sessionType));
  if (dateStr === todayStr) {
    return exactLog || typeLogged ? 'completed' : 'today';
  }
  if (dateStr < todayStr) {
    return exactLog || typeLogged ? 'completed' : 'missed';
  }
  return 'upcoming';
}

function getSessionShortLabel(sessionType: string): string {
  const t = sessionType.toLowerCase();
  if (t.includes('heavy lower') || t.includes('me lower') || t.includes('max effort lower')) return 'HEAVY';
  if (t.includes('heavy upper') || t.includes('me upper') || t.includes('max effort upper')) return 'HEAVY';
  if (t.includes('speed lower') || t.includes('de lower') || t.includes('dynamic effort lower')) return 'SPEED';
  if (t.includes('speed upper') || t.includes('de upper') || t.includes('dynamic effort upper')) return 'SPEED';
  if (t.includes('event')) return 'EVENT';
  if (t.includes('deload') || t.includes('recovery week')) return 'RECOVERY';
  if (t.includes('recovery') || t.includes('conditioning')) return 'EASY';
  return 'TRAIN';
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatVolume(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k lb`;
  return `${Math.round(v).toLocaleString()} lb`;
}

function computeStats(entries: any[]) {
  let volume = 0, totalEffort = 0, effortCount = 0;
  for (const e of entries) {
    const w = parseFloat(e.weight) || 0;
    const r = parseInt(String(e.reps)) || 0;
    volume += w * r;
    if (e.rpe > 0) { totalEffort += e.rpe; effortCount++; }
  }
  return { sets: entries.length, volume, avgEffort: effortCount > 0 ? totalEffort / effortCount : 0 };
}

function groupByExercise(entries: any[]): Record<string, any[]> {
  const map: Record<string, any[]> = {};
  for (const e of entries) {
    const name = e.exercise || 'Unknown';
    if (!map[name]) map[name] = [];
    map[name].push(e);
  }
  return map;
}

// ── WeekRing (Part 1A) ────────────────────────────────────────────────────────
function WeekRing({ completed, total }: { completed: number; total: number }) {
  const size = 48, stroke = 3, radius = 20;
  const circumference = 2 * Math.PI * radius;
  const progress   = total > 0 ? completed / total : 0;
  const dashOffset = circumference * (1 - progress);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#1E1E22" strokeWidth={stroke} />
        <Circle
          cx={size/2} cy={size/2} r={radius} fill="none"
          stroke={GOLD} strokeWidth={stroke}
          strokeDasharray={`${circumference}`} strokeDashoffset={dashOffset}
          strokeLinecap="round" rotation={-90} origin={`${size/2}, ${size/2}`}
        />
      </Svg>
      <Text style={{ position: 'absolute', fontSize: 12, fontWeight: '700', color: GOLD }}>
        {completed}/{total}
      </Text>
    </View>
  );
}

// ── DayCard (Part 1B) ─────────────────────────────────────────────────────────
function DayCard({
  day, onPress, swapMode, isFirstSwap, isSecondSwap,
}: {
  day: WeekDay;
  onPress: () => void;
  swapMode: boolean;
  isFirstSwap: boolean;
  isSecondSwap: boolean;
}) {
  const statusColor =
    day.status === 'completed' ? RED :
    day.status === 'today'     ? GOLD :
    day.status === 'upcoming'  ? GREEN :
    day.status === 'missed'    ? AMBER : '#333';

  const isActive  = day.status !== 'rest';
  // Part 1B: rest days visually recessed; during move mode, glow as drop targets
  const isSwapDestination = swapMode && !isFirstSwap; // first has been picked, now picking destination
  const cardBg    = isSwapDestination && !isActive
    ? '#12121A'  // Slightly brighter rest day during move mode
    : day.status === 'rest' ? '#0E0E10'
    : (day.status === 'today' ? GOLD + '15' : CARD);
  const cardBorder =
    isFirstSwap || isSecondSwap ? GOLD :
    isSwapDestination && !isActive ? GOLD + '30' :
    day.status === 'completed' ? RED + '40' :
    day.status === 'today'     ? GOLD + '60' :
    day.status === 'upcoming'  ? GREEN + '40' :
    day.status === 'missed'    ? AMBER + '40' : BORDER;

  return (
    <TouchableOpacity
      style={[s.dayCard, { backgroundColor: cardBg, borderColor: cardBorder, overflow: 'hidden' }]}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      activeOpacity={swapMode ? 0.6 : 0.9}
    >
      {(isFirstSwap || isSecondSwap) && (
        <View style={s.swapBadge}>
          <Text style={s.swapBadgeNum}>{isFirstSwap ? '1' : '2'}</Text>
        </View>
      )}
      <Text style={[s.dayAbbr, { color: isSwapDestination && !isActive ? '#666' : (isActive ? statusColor : '#555') }]}>
        {day.dayAbbr}
      </Text>
      <Text style={[s.dayNum, { color: isSwapDestination && !isActive ? '#555' : (isActive ? COLORS.text.primary : '#333') }]}>
        {day.dayNum}
      </Text>
      <Text style={[s.sessionLbl, { color: isActive ? statusColor : (isSwapDestination ? '#444' : '#333') }]}>
        {isActive ? day.sessionLabel : 'REST'}
      </Text>
      {/* Part 1B: colored bottom bar instead of dot */}
      {day.status !== 'rest' && (
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
          backgroundColor:
            day.status === 'completed' ? RED :
            day.status === 'today'     ? GOLD :
            day.status === 'upcoming'  ? GREEN + '50' :
            day.status === 'missed'    ? AMBER : 'transparent',
          borderBottomLeftRadius: 10,
          borderBottomRightRadius: 10,
        }} />
      )}
    </TouchableOpacity>
  );
}

// ── SessionHistoryCard (Reworked — all sessions expandable with exercise rows) ─
function SessionHistoryCard({
  card, expanded, onToggle, onGoToSession, todayStr, todaySessionDone,
}: {
  card: SessionCard;
  expanded: boolean;
  onToggle: () => void;
  onGoToSession: () => void;
  todayStr: string;
  todaySessionDone?: boolean;
}) {
  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const style      = getSessionStyle(card.sessionType);
  const stats      = computeStats(card.logEntries);
  const grouped    = groupByExercise(card.logEntries);
  const hasLogs    = card.logEntries.length > 0;
  const isToday    = card.date === todayStr;
  const isPremiumToday = isToday && card.status === 'today';
  // All cards are now expandable
  const exerciseList   = card.exerciseNames.length > 0
    ? card.exerciseNames.join(' · ')
    : Object.keys(grouped).join(' · ') || 'Session planned';

  // ── Per-session action state ─────────────────────────────────────────────
  const [actionSheetEx,  setActionSheetEx]  = useState<ActionExercise | null>(null);
  const [pickerForSwap,  setPickerForSwap]  = useState(false);
  const [addPickerOpen,  setAddPickerOpen]  = useState(false);
  const [localOverrides, setLocalOverrides] = useState<Record<string, { name: string; category: string }>>({});
  const [localSkipped,   setLocalSkipped]   = useState<Set<string>>(new Set());
  const [localNotes,     setLocalNotes]     = useState<Record<string, string>>({});
  const [localAdded,     setLocalAdded]     = useState<Array<{ name: string; category: string }>>([]);

  const sessionStateForActions: SessionStateType =
    card.status === 'today'     ? 'today'     :
    card.status === 'upcoming'  ? 'upcoming'  :
    card.status === 'completed' ? 'completed' : 'missed';

  const getDayName = (dateStr: string) =>
    new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });

  const handleSwapConfirm = async (picked: PickedExercise) => {
    if (!actionSheetEx) return;
    const key = actionSheetEx.exerciseId || actionSheetEx.name;
    setLocalOverrides(prev => ({ ...prev, [key]: { name: picked.name, category: picked.category || '' } }));
    try {
      await substitutionApi.log({
        date: card.date, week: card.weekNumber, day: getDayName(card.date),
        sessionType: card.sessionType,
        originalExercise: actionSheetEx.name,
        replacementExercise: picked.name,
        reason: picked.reason || 'user_swap',
      });
    } catch {}
    setPickerForSwap(false);
  };

  const handleSkip = async () => {
    if (!actionSheetEx) return;
    const key = actionSheetEx.exerciseId || actionSheetEx.name;
    setLocalSkipped(prev => new Set([...prev, key]));
    try {
      await substitutionApi.log({
        date: card.date, week: card.weekNumber, day: getDayName(card.date),
        sessionType: card.sessionType,
        originalExercise: actionSheetEx.name, replacementExercise: '(skipped)', reason: 'user_skipped',
      });
    } catch {}
  };

  const handleAddNote = (note: string) => {
    if (!actionSheetEx) return;
    const key = actionSheetEx.exerciseId || actionSheetEx.name;
    setLocalNotes(prev => ({ ...prev, [key]: note }));
  };

  const handleAddExercise = async (picked: PickedExercise) => {
    setLocalAdded(prev => [...prev, { name: picked.name, category: picked.category }]);
    try {
      await substitutionApi.log({
        date: card.date, week: card.weekNumber, day: getDayName(card.date),
        sessionType: card.sessionType,
        originalExercise: '(none)', replacementExercise: picked.name, reason: 'user_added',
      });
    } catch {}
  };

  // Build display exercise list (plan exercises + local additions)
  const displayExercises = [
    ...card.exercises.map((ex: any) => {
      const key = ex.exerciseId || ex.name;
      const override = localOverrides[key];
      return {
        ...ex,
        displayName: override?.name || ex.name,
        displayCategory: override?.category || ex.category,
        isSwapped: !!override, isSkipped: localSkipped.has(key),
        note: localNotes[key], isAdded: false,
      };
    }),
    ...localAdded.map((ex, i) => ({
      exerciseId: `added-${i}`, name: ex.name, category: ex.category,
      prescription: '', targetSets: [], order: 999,
      displayName: ex.name, displayCategory: ex.category,
      isSwapped: false, isSkipped: false, note: undefined, isAdded: true,
    })),
  ];

  const getCatColor = (cat: string) => {
    const c = (cat || '').toLowerCase();
    if (c === 'main')         return RED;
    if (c === 'supplemental') return AMBER;
    if (c === 'accessory')    return '#4A9FDF';
    if (c === 'prehab')       return GREEN;
    if (c === 'custom')       return GOLD;
    return '#555';
  };

  useEffect(() => {
    if (isPremiumToday) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 1000, useNativeDriver: true }),
      ])).start();
    }
  }, [isPremiumToday]);

  const borderColor =
    isToday                    ? GOLD :
    card.status === 'upcoming' ? GREEN + '50' :
    card.status === 'missed'   ? AMBER + '40' : BORDER;
  const borderWidth = isToday ? 1.5 : 1;

  return (
    <View style={[s.sessCard, { borderColor, borderWidth, overflow: 'hidden' }]}>
      {/* Part 1D: gold accent bar at top for premium today */}
      {isToday && (
        <View style={{ height: 2, backgroundColor: GOLD, position: 'absolute', top: 0, left: 0, right: 0 }} />
      )}

      {/* Header row — always tappable */}
      <TouchableOpacity
        style={[s.sessCardHeader, isToday && { paddingTop: 14 }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          onToggle();
        }}
        activeOpacity={0.75}
      >
        <View style={s.sessCardLeft}>
          <View style={[s.sessBadge, { backgroundColor: style.bg, borderColor: style.borderColor }]}>
            <Text style={[s.sessBadgeText, { color: style.text }]} numberOfLines={1}>
              {card.sessionType}
            </Text>
          </View>
          {/* Part 1D: "TODAY" label with pulsing dot */}
          {isPremiumToday && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 6 }}>
              <Animated.View style={{
                width: 6, height: 6, borderRadius: 3,
                backgroundColor: GOLD, opacity: pulseAnim,
              }} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: GOLD }}>TODAY</Text>
            </View>
          )}
          {isToday && card.status === 'completed' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 6 }}>
              <MaterialCommunityIcons name="check-circle" size={14} color={RED} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: RED }}>TODAY · DONE</Text>
            </View>
          )}
          {card.status === 'completed' && !isToday && (
            <MaterialCommunityIcons name="check-circle" size={14} color={RED} style={{ marginLeft: 6 }} />
          )}
          {card.status === 'missed' && (
            <Text style={[s.statusPill, { color: AMBER }]}>Not logged</Text>
          )}
          {card.status === 'upcoming' && (
            <Text style={[s.statusPill, { color: GREEN }]}>Upcoming</Text>
          )}
        </View>
        <View style={s.sessCardRight}>
          <Text style={s.sessDate}>{card.dateLabel}</Text>
          {/* Always show chevron */}
          <MaterialCommunityIcons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18} color={COLORS.text.muted}
          />
        </View>
      </TouchableOpacity>

      {/* Part 1D: Exercise chips for today's upcoming session */}
      {isPremiumToday && card.exerciseNames.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {card.exerciseNames.slice(0, 3).map((name, i) => (
              <View key={i} style={{ backgroundColor: '#1A1A1E', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ fontSize: 11, color: '#AAA' }}>{name}</Text>
              </View>
            ))}
            {card.exerciseNames.length > 3 && (
              <View style={{ backgroundColor: '#1A1A1E', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ fontSize: 11, color: '#666' }}>+{card.exerciseNames.length - 3}</Text>
              </View>
            )}
            <Text style={{ fontSize: 11, color: GOLD, marginLeft: 'auto' }}>
              {card.exerciseNames.length} exercises
            </Text>
          </View>
        </View>
      )}

      {/* Exercise names (non-premium) */}
      {!isPremiumToday && (
        <Text style={[s.exLine, { color: card.status === 'upcoming' ? COLORS.text.muted : '#888' }]}
          numberOfLines={1}>
          {exerciseList}
        </Text>
      )}

      {/* Part 1E: 4-column stats for completed cards */}
      {card.status === 'completed' && stats.sets > 0 && (
        <View style={{ flexDirection: 'row', gap: 16, paddingHorizontal: 12, paddingBottom: 10 }}>
          <View>
            <Text style={{ fontSize: 9, color: '#555', marginBottom: 2 }}>SETS</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: RED }}>{stats.sets}</Text>
          </View>
          <View>
            <Text style={{ fontSize: 9, color: '#555', marginBottom: 2 }}>VOLUME</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#E8E8E6' }}>{formatVolume(stats.volume)}</Text>
          </View>
          <View>
            <Text style={{ fontSize: 9, color: '#555', marginBottom: 2 }}>EFFORT</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#E8E8E6' }}>{stats.avgEffort > 0 ? stats.avgEffort.toFixed(1) : '—'}</Text>
          </View>
          <View>
            <Text style={{ fontSize: 9, color: '#555', marginBottom: 2 }}>TIME</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#E8E8E6' }}>—</Text>
          </View>
        </View>
      )}

      {/* Part 1D: START SESSION button (premium today, no logs) */}
      {isPremiumToday && (
        <TouchableOpacity style={s.goBtn} onPress={onGoToSession} activeOpacity={0.8}>
          <Text style={s.goBtnText}>START SESSION</Text>
          <MaterialCommunityIcons name="arrow-right" size={14} color={BG} />
        </TouchableOpacity>
      )}

      {/* IN_PROGRESS — today has logs but session not formally finished */}
      {card.status === 'completed' && isToday && !todaySessionDone && (
        <TouchableOpacity
          style={[s.continueBtnSmall, { backgroundColor: '#0D2A3A', borderWidth: 1.5, borderColor: '#2A7ABF' }]}
          onPress={onGoToSession}
          activeOpacity={0.8}>
          <MaterialCommunityIcons name="play-circle-outline" size={14} color="#4A9FDF" style={{ marginRight: 2 }} />
          <Text style={[s.continueBtnText, { color: '#4A9FDF' }]}>CONTINUE SESSION</Text>
          <MaterialCommunityIcons name="arrow-right" size={12} color="#4A9FDF" />
        </TouchableOpacity>
      )}

      {/* COMPLETE — today's session formally finished */}
      {card.status === 'completed' && isToday && todaySessionDone && (
        <TouchableOpacity
          style={[s.continueBtnSmall, { backgroundColor: '#0A1F12', borderWidth: 1.5, borderColor: GOLD + '80' }]}
          onPress={onGoToSession}
          activeOpacity={0.8}>
          <MaterialCommunityIcons name="check-circle" size={14} color={GOLD} style={{ marginRight: 2 }} />
          <Text style={[s.continueBtnText, { color: GOLD }]}>VIEW RECAP</Text>
          <MaterialCommunityIcons name="arrow-right" size={12} color={GOLD} />
        </TouchableOpacity>
      )}

      {/* VIEW DETAILS — past completed session (IMP 2) */}
      {card.status === 'completed' && !isToday && stats.sets > 0 && (
        <TouchableOpacity
          style={[s.continueBtnSmall, { backgroundColor: '#111114', borderWidth: 1, borderColor: '#1E1E22' }]}
          onPress={onGoToSession}
          activeOpacity={0.8}>
          <Text style={[s.continueBtnText, { color: '#666' }]}>VIEW DETAILS</Text>
          <MaterialCommunityIcons name="arrow-right" size={12} color="#666" />
        </TouchableOpacity>
      )}

      {/* ── EXPANDED: Full exercise rows with kebab menus ── */}
      {expanded && (
        <View style={s.expandDetail}>
          {displayExercises.length === 0 ? (
            <Text style={{ fontSize: 12, color: MUTED, fontStyle: 'italic', textAlign: 'center', paddingVertical: 12 }}>
              No exercises in this session
            </Text>
          ) : (
            displayExercises.map((ex: any, idx: number) => {
              const catColor = getCatColor(ex.displayCategory);
              const logEntriesForEx = card.logEntries.filter((e: any) =>
                (e.exercise || '').toLowerCase() === (ex.displayName || ex.name || '').toLowerCase()
              );
              return (
                <View
                  key={ex.exerciseId || idx}
                  style={[s.exRow, idx < displayExercises.length - 1 && { borderBottomWidth: 1, borderBottomColor: '#13131A' }]}
                >
                  {/* Main row: indicator dot · name · badge · kebab */}
                  <View style={s.exRowMain}>
                    <View style={[s.exCatDot, { backgroundColor: catColor }]} />
                    <View style={{ flex: 1 }}>
                      {/* Name + status badges */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 }}>
                        <Text
                          style={[s.exRowName, ex.isSkipped && s.exRowNameSkipped]}
                          numberOfLines={1}
                        >
                          {ex.isSwapped ? ex.displayName : ex.name}
                        </Text>
                        {ex.isSwapped && (
                          <View style={s.swappedBadge}>
                            <Text style={s.swappedBadgeText}>SWAPPED</Text>
                          </View>
                        )}
                        {ex.isSkipped && (
                          <View style={s.skippedBadge}>
                            <Text style={s.skippedBadgeText}>SKIPPED</Text>
                          </View>
                        )}
                        {ex.isAdded && (
                          <View style={s.addedBadge}>
                            <Text style={s.addedBadgeText}>ADDED</Text>
                          </View>
                        )}
                      </View>
                      {ex.isSwapped && (
                        <Text style={s.exOriginalName} numberOfLines={1}>was: {ex.name}</Text>
                      )}
                      {!!ex.prescription && !ex.isSkipped && (
                        <Text style={s.exPrescription}>{ex.prescription}</Text>
                      )}
                      {!!ex.note && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                          <MaterialCommunityIcons name="pencil-outline" size={11} color="#4A9FDF" />
                          <Text style={{ fontSize: 11, color: '#4A9FDF', flex: 1 }} numberOfLines={2}>{ex.note}</Text>
                        </View>
                      )}
                    </View>
                    {/* Kebab button */}
                    {!ex.isSkipped && (
                      <TouchableOpacity
                        style={s.kebabBtn}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setActionSheetEx({
                            name: ex.displayName || ex.name,
                            category: ex.displayCategory,
                            prescription: ex.prescription,
                            exerciseId: ex.exerciseId,
                          });
                        }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <MaterialCommunityIcons name="dots-vertical" size={18} color={MUTED} />
                      </TouchableOpacity>
                    )}
                  </View>
                  {/* Logged set pills for completed sessions */}
                  {card.status === 'completed' && logEntriesForEx.length > 0 && (
                    <View style={s.setPillsRow}>
                      {logEntriesForEx.slice(0, 5).map((e: any, i: number) => {
                        const isTop = e === logEntriesForEx.reduce((mx: any, le: any) =>
                          (parseFloat(le.weight) || 0) > (parseFloat(mx.weight) || 0) ? le : mx, logEntriesForEx[0]);
                        return (
                          <View key={i} style={[s.setPill, isTop && s.setPillTop]}>
                            <Text style={[s.setPillTxt, isTop && s.setPillTxtTop]}>
                              {e.weight ? `${e.weight}×${e.reps}` : `—×${e.reps}`}
                            </Text>
                          </View>
                        );
                      })}
                      {logEntriesForEx.length > 5 && (
                        <View style={s.setPill}>
                          <Text style={s.setPillTxt}>+{logEntriesForEx.length - 5}</Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}
          {/* ── Ask Coach about this session ── */}
          <AskCoachButton
            seedPrompt={
              card.status === 'completed'
                ? `Review my ${card.sessionType} session on ${card.dateLabel}. How did I do?`
                : card.status === 'missed'
                ? `I missed my ${card.sessionType} session on ${card.dateLabel}. Should I make it up or move on?`
                : `Walk me through my ${card.sessionType} session on ${card.dateLabel}. What's the goal?`
            }
            triggerName="schedule_session_inquiry"
            style={{ alignSelf: 'center', marginBottom: 4, marginTop: 4 }}
          />

          {/* ── Add exercise footer ── */}
          <TouchableOpacity
            style={s.addExBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setAddPickerOpen(true);
            }}
            activeOpacity={0.75}
          >
            <MaterialCommunityIcons name="plus" size={14} color={GREEN} />
            <Text style={s.addExBtnText}>Add exercise to this session</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Action Sheet ── */}
      <ExerciseActionsSheet
        visible={!!actionSheetEx}
        onClose={() => setActionSheetEx(null)}
        exercise={actionSheetEx || { name: '' }}
        sessionState={sessionStateForActions}
        onSwap={() => setPickerForSwap(true)}
        onSkip={handleSkip}
        onAddNote={handleAddNote}
      />
      {/* ── Picker: Swap exercise ── */}
      <ExercisePicker
        visible={pickerForSwap}
        onClose={() => setPickerForSwap(false)}
        onSelect={handleSwapConfirm}
        originalExerciseName={actionSheetEx?.name}
        title="Swap Exercise"
      />
      {/* ── Picker: Add exercise to session ── */}
      <ExercisePicker
        visible={addPickerOpen}
        onClose={() => setAddPickerOpen(false)}
        onSelect={handleAddExercise}
        title="Add Exercise"
      />
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function ScheduleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading,      setLoading]      = useState(true);
  const [weekDays,     setWeekDays]     = useState<WeekDay[]>([]);
  const [sessions,     setSessions]     = useState<SessionCard[]>([]);
  const [weekStats,    setWeekStats]    = useState<WeekStats>({ sessionsCompleted: 0, totalPlanned: 0, volume: 0, avgEffort: 0 });
  const [weekInfo,     setWeekInfo]     = useState({ weekNumber: 1, phaseName: '', blockName: '' });
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [swapMode,     setSwapMode]     = useState(false);
  const [firstSwap,    setFirstSwap]    = useState<{ date: string; event: any } | null>(null);
  const [swapToast,    setSwapToast]    = useState<string | null>(null);
  const [swapping,     setSwapping]     = useState(false);
  const [calEventsRaw, setCalEventsRaw] = useState<any[]>([]);
  // true when today's session is formally finished (programApi.getTodaySession returns 404)
  const [todaySessionDone, setTodaySessionDone] = useState(false);
  const [trainingMode, setTrainingMode] = useState<'program' | 'free'>('program');

  const weekOffsetRef = useRef(0);
  const [weekOffset, _setWeekOffset]   = useState(0);
  const [refreshing, setRefreshing]    = useState(false);

  const setWeekOffset = (n: number) => {
    weekOffsetRef.current = n;
    _setWeekOffset(n);
  };

  // NOTE: todayStr at render level is used only for SessionHistoryCard prop.
  // Inside loadData, we always recompute it fresh to avoid stale closure bugs.
  const todayStr = getLocalDateString();

  // ── Load data ────────────────────────────────────────────────────────────────
  const loadData = useCallback(async (offset = weekOffsetRef.current) => {
    // Always recompute today fresh — avoids stale closure if app was open overnight
    const today = getLocalDateString();
    setLoading(true);
    try {
      // Check training mode first
      const prof = await import('../../src/utils/storage').then(m => m.getProfile());
      setTrainingMode((prof?.training_mode as 'program' | 'free') || 'program');
      if (prof?.training_mode === 'free') { setLoading(false); return; }
      const weekDates  = getWeekDates(offset);
      const startDate  = weekDates[0];
      const endDate    = weekDates[6];

      const [evResp, logsResp] = await Promise.all([
        calendarApi.getEvents(startDate, endDate).catch((err: any) => {
          console.warn('[Schedule] Calendar fetch FAILED:', err?.message || err);
          return { events: [] };
        }),
        logApi.list({ startDate, endDate }).catch((err: any) => {
          console.warn('[Schedule] Log fetch FAILED:', err?.message || err);
          return [];
        }),
      ]);

      // On current week, check if today's session is formally done
      if (offset === 0) {
        try {
          const todaySess = await programApi.getTodaySession();
          // If getTodaySession returns null/no session → formally finished (404)
          setTodaySessionDone(!todaySess?.session);
        } catch {
          // 404 or no plan → session is done / no plan exists
          setTodaySessionDone(true);
        }
      }

      const events: any[] = evResp?.events || [];
      const allLogs: any[] = Array.isArray(logsResp) ? logsResp : (logsResp?.logs || []);

      console.log(`[Schedule] Loaded: ${events.length} events, ${allLogs.length} logs for ${startDate} → ${endDate} | today=${today}`);
      if (events.length > 0 && allLogs.length === 0) {
        console.warn('[Schedule] WARNING: Calendar has events but NO log entries found. Possible userId mismatch or date issue.');
      }

      // Build logs-by-date map
      const logsByDate: Record<string, any[]> = {};
      for (const lg of allLogs) {
        if (!logsByDate[lg.date]) logsByDate[lg.date] = [];
        logsByDate[lg.date].push(lg);
      }

      // Build set of session types actually logged this week — for loose matching.
      // Handles the case where a user trains Heavy Lower on Wed instead of the
      // planned Mon: the Monday card still shows as "completed".
      const completedSessionTypes = new Set<string>(
        allLogs.map((l: any) => l.sessionType || '').filter(Boolean)
      );

      // Log matches for debugging
      const matchedDates = events.filter((ev: any) => (logsByDate[ev.date]?.length ?? 0) > 0).map((ev: any) => ev.date);
      console.log(`[Schedule] Events with matching logs: ${matchedDates.length} → dates: [${matchedDates.join(', ')}]`);

      // ── Calendar grid ────────────────────────────────────────────────────────
      const days: WeekDay[] = weekDates.map((date, i) => {
        const ev = events.find((e: any) => e.date === date);
        const status = getDayStatus(date, today, logsByDate, !!ev, ev?.sessionType, completedSessionTypes);
        return {
          date,
          dayAbbr: DAY_ABBRS[i],
          dayNum: parseInt(date.split('-')[2]),
          status,
          sessionLabel: ev ? getSessionShortLabel(ev.sessionType) : '',
          sessionType: ev?.sessionType || '',
        };
      });
      setWeekDays(days);
      setCalEventsRaw(events);

      // ── Session cards ────────────────────────────────────────────────────────
      const cards: SessionCard[] = events.map((ev: any) => {
        const status   = getDayStatus(ev.date, today, logsByDate, true, ev.sessionType, completedSessionTypes);
        const dayLogs  = logsByDate[ev.date] || [];
        const exNames  = (ev.exercises || []).map((e: any) => e.name || '').filter(Boolean);
        return {
          date:          ev.date,
          dateLabel:     formatDate(ev.date),
          sessionType:   ev.sessionType || '',
          status,
          exerciseNames: exNames,
          exercises:     ev.exercises || [],
          logEntries:    dayLogs,
          weekNumber:    ev.weekNumber || 1,
          phaseName:     ev.phaseName  || '',
          blockName:     ev.blockName  || '',
        };
      }).sort((a: SessionCard, b: SessionCard) => {
        // Today's date always first, regardless of logged status
        if (a.date === today && b.date !== today) return -1;
        if (b.date === today && a.date !== today) return 1;
        if (a.status === 'completed' && b.status === 'upcoming') return -1;
        if (a.status === 'upcoming' && b.status === 'completed') return 1;
        if (a.status === 'missed'    && b.status === 'upcoming') return -1;
        if (a.status === 'upcoming'  && b.status === 'missed')   return 1;
        if ((a.status === 'completed' || a.status === 'missed') &&
            (b.status === 'completed' || b.status === 'missed')) return b.date.localeCompare(a.date);
        return a.date.localeCompare(b.date);
      });
      setSessions(cards);

      // ── Auto-expand today's card on current week load ─────────────────────────
      if (offset === 0) {
        const todayCard = cards.find((c: SessionCard) => c.date === today);
        if (todayCard) setExpandedCard(todayCard.date);
      }

      // ── Week header info ──────────────────────────────────────────────────────
      const firstEv = events[0];
      if (firstEv) {
        setWeekInfo({ weekNumber: firstEv.weekNumber || 1, phaseName: firstEv.phaseName || '', blockName: firstEv.blockName || '' });
      }

      // ── Week stats ────────────────────────────────────────────────────────────
      const weekLogs = allLogs.filter((l: any) => l.date >= startDate && l.date <= endDate);
      let volume = 0, totalEff = 0, effCount = 0;
      for (const l of weekLogs) {
        volume += (parseFloat(l.weight) || 0) * (parseInt(String(l.reps)) || 0);
        if (l.rpe > 0) { totalEff += l.rpe; effCount++; }
      }
      setWeekStats({
        sessionsCompleted: cards.filter((c: SessionCard) => c.status === 'completed').length,
        totalPlanned:      cards.filter((c: SessionCard) => c.status !== 'rest').length,
        volume,
        avgEffort:         effCount > 0 ? totalEff / effCount : 0,
      });
    } catch (err) {
      console.log('[Schedule] loadData error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData(weekOffsetRef.current);
    setRefreshing(false);
  }, [loadData]);

  useFocusEffect(useCallback(() => {
    loadData(weekOffsetRef.current);
  }, []));

  // ── Week navigation ───────────────────────────────────────────────────────────
  const goWeek = (dir: 1 | -1) => {
    const next = weekOffsetRef.current + dir;
    setWeekOffset(next);
    setExpandedCard(null);
    setSwapMode(false);
    setFirstSwap(null);
    loadData(next);
  };

  // ── Move session logic (IMP 1) ───────────────────────────────────────────────
  const handleDayPress = (day: WeekDay) => {
    if (!swapMode) return;
    if (!firstSwap) {
      // Source must be a training day (something to move)
      if (day.status === 'rest') return;
      const ev = calEventsRaw.find((e: any) => e.date === day.date);
      setFirstSwap({ date: day.date, event: ev });
      return;
    }
    // Second tap — destination can be any day (including rest days)
    doSwap(day.date, day);
  };

  const doSwap = async (secondDate: string, secondDay: WeekDay) => {
    if (!firstSwap) return;
    setSwapping(true);
    try {
      const secondEv = calEventsRaw.find((e: any) => e.date === secondDate);
      const isRestDestination = secondDay.status === 'rest' || !secondEv;

      if (isRestDestination) {
        // Move: just reschedule the source session to the new date, no reverse call
        await calendarApi.reschedule({
          originalDate: firstSwap.date,
          newDate:       secondDate,
          sessionType:   firstSwap.event?.sessionType || '',
          reason:        'user_move',
        });
      } else {
        // Swap: both directions
        await Promise.all([
          calendarApi.reschedule({
            originalDate: firstSwap.date,
            newDate:       secondDate,
            sessionType:   firstSwap.event?.sessionType || '',
            reason:        'user_swap',
          }),
          calendarApi.reschedule({
            originalDate: secondDate,
            newDate:       firstSwap.date,
            sessionType:   secondEv.sessionType || '',
            reason:        'user_swap',
          }),
        ]);
      }

      const d1 = formatDate(firstSwap.date).split(',')[0];
      const d2 = formatDate(secondDate).split(',')[0];
      setSwapToast(isRestDestination ? `${d1} → ${d2} moved` : `${d1} ↔ ${d2} swapped`);
      setTimeout(() => setSwapToast(null), 3000);
      setSwapMode(false);
      setFirstSwap(null);
      await loadData(weekOffsetRef.current);
    } catch (err) {
      console.warn('[Schedule] move/swap error:', err);
    } finally {
      setSwapping(false);
    }
  };

  const cancelSwap = () => {
    setSwapMode(false);
    setFirstSwap(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  const isCurrentWeek = weekOffset === 0;

  // Part 1H: PanResponder for swipe week navigation
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 30 && Math.abs(gs.dy) < 30,
      onPanResponderRelease: (_, gs) => {
        if (gs.dx > 50)  { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); goWeek(-1); }
        if (gs.dx < -50) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); goWeek(1); }
      },
    })
  ).current;

  return (
    <View style={[s.root, { paddingTop: insets.top }]} {...panResponder.panHandlers}>
      {/* Free training mode: show empty state instead of schedule */}
      {trainingMode === 'free' ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, gap: 16 }}>
          <MaterialCommunityIcons name="calendar-blank-outline" size={48} color="#2A9D8F" />
          <Text style={{ fontSize: 20, fontWeight: '700', color: '#F2F2F7', textAlign: 'center' }}>
            Free training mode
          </Text>
          <Text style={{ fontSize: 15, color: '#A0A0B0', textAlign: 'center', lineHeight: 22 }}>
            No scheduled sessions. Tap 'Log Session' to record a workout.
          </Text>
          <TouchableOpacity
            style={{ marginTop: 8, backgroundColor: '#2A9D8F', borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14 }}
            onPress={() => router.push('/session-detail')}
            activeOpacity={0.85}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Log Session</Text>
          </TouchableOpacity>
        </View>
      ) : (
      <>
      {/* Part 1A: Header with WeekRing */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Schedule</Text>
          {weekInfo.weekNumber > 0 && (
            <Text style={s.headerSub}>
              Week {weekInfo.weekNumber}
              {weekInfo.blockName ? ` · ${weekInfo.blockName}` : ''}
              {weekInfo.phaseName ? ` · ${weekInfo.phaseName}` : ''}
            </Text>
          )}
        </View>
        {/* Part 1A: Week progress ring replaces swap button */}
        <WeekRing completed={weekStats.sessionsCompleted} total={weekStats.totalPlanned} />
      </View>

      {/* ── Move session banner ── */}
      {swapMode && (
        <View style={s.swapBanner}>
          <MaterialCommunityIcons name="calendar-arrow-right" size={16} color={BG} />
          <Text style={s.swapBannerText}>
            {firstSwap ? 'Now tap the destination day (any day)' : 'Tap the session you want to move'}
          </Text>
          <TouchableOpacity onPress={cancelSwap} style={s.cancelSwapBtn}>
            <Text style={s.cancelSwapText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Toast ── */}
      {swapToast && (
        <View style={s.toast}>
          <MaterialCommunityIcons name="check-circle" size={14} color={GOLD} />
          <Text style={s.toastText}>{swapToast}</Text>
        </View>
      )}

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={GOLD}
            colors={[GOLD]}
          />
        }
      >
        {/* ── Week navigation ── */}
        <View style={s.weekNav}>
          <TouchableOpacity style={s.weekArrow} onPress={() => goWeek(-1)} activeOpacity={0.7}>
            <MaterialCommunityIcons name="chevron-left" size={24} color="#555" />
          </TouchableOpacity>
          <View style={s.weekNavCenter}>
            <Text style={s.weekNavLabel}>{getWeekRangeLabel(weekOffset)}</Text>
            {isCurrentWeek && (
              <View style={s.thisWeekBadge}>
                <Text style={s.thisWeekText}>THIS WEEK</Text>
              </View>
            )}
            {!isCurrentWeek && weekOffset < 0 && (
              <View style={[s.thisWeekBadge, { backgroundColor: '#1A1A1A' }]}>
                <Text style={[s.thisWeekText, { color: '#555' }]}>
                  {weekOffset === -1 ? 'LAST WEEK' : `${-weekOffset} WEEKS AGO`}
                </Text>
              </View>
            )}
          </View>
          <TouchableOpacity style={s.weekArrow} onPress={() => goWeek(1)} activeOpacity={0.7}>
            <MaterialCommunityIcons name="chevron-right" size={24} color="#555" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={s.loadingBox}>
            <ActivityIndicator color={GOLD} />
          </View>
        ) : (
          <>
            {/* ── Weekly calendar grid ── */}
            <View style={s.calGrid}>
              {weekDays.map((day) => (
                <DayCard
                  key={day.date}
                  day={day}
                  onPress={() => handleDayPress(day)}
                  swapMode={swapMode}
                  isFirstSwap={firstSwap?.date === day.date}
                  isSecondSwap={false}
                />
              ))}
            </View>

            {/* Part 1C: Compact 3-item legend with bar indicators */}
            <View style={s.legend}>
              {([
                { color: RED,   label: 'Done'  },
                { color: GOLD,  label: 'Today' },
                { color: GREEN, label: 'Next'  },
              ] as {color:string;label:string}[]).map(({ color, label }) => (
                <View key={label} style={s.legendItem}>
                  <View style={{ width: 8, height: 3, borderRadius: 1, backgroundColor: color }} />
                  <Text style={s.legendText}>{label}</Text>
                </View>
              ))}
            </View>

            {/* ── Session history ── */}
            <Text style={s.sectionLabel}>SESSION HISTORY</Text>

            {sessions.length === 0 ? (
              <View style={s.emptyCard}>
                <MaterialCommunityIcons name="calendar-blank-outline" size={36} color="#333" />
                <Text style={s.emptyText}>No sessions scheduled this week</Text>
                <Text style={s.emptySubText}>Complete your program setup to see your training schedule</Text>
              </View>
            ) : (
              sessions.map((card, idx) => (
                <SessionHistoryCard
                  key={`${card.date}-${idx}`}
                  card={card}
                  expanded={expandedCard === card.date}
                  onToggle={() => setExpandedCard(expandedCard === card.date ? null : card.date)}
                  onGoToSession={() => {
                    if (card.status === 'completed' && card.date !== todayStr) {
                      // Past session — view detailed history
                      router.push(`/session-detail?date=${card.date}&sessionType=${encodeURIComponent(card.sessionType)}` as any);
                    } else {
                      router.push('/(tabs)/today');
                    }
                  }}
                  todayStr={todayStr}
                  todaySessionDone={todaySessionDone}
                />
              ))
            )}

            {/* Part 1F: Move a session pill BELOW session cards */}
            <TouchableOpacity
              style={{
                alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6,
                backgroundColor: '#111114', borderWidth: 1, borderColor: '#1E1E22',
                borderRadius: 100, paddingHorizontal: 16, paddingVertical: 8,
                marginTop: 6, marginBottom: 20,
              }}
              onPress={() => { setSwapMode(true); setFirstSwap(null); }}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="calendar-arrow-right" size={14} color="#666" />
              <Text style={{ fontSize: 12, color: '#888', fontWeight: '600' }}>Move a session</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
      </>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: BG },
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  headerTitle:{ fontSize: 18, fontWeight: FONTS.weights.bold, color: COLORS.text.primary, letterSpacing: -0.3 },
  headerSub:  { fontSize: 12, color: COLORS.text.muted, marginTop: 2 },

  swapDaysBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 6 },
  swapDaysBtnText: { fontSize: 12, color: COLORS.text.secondary, fontWeight: FONTS.weights.medium },

  swapBanner:     { flexDirection: 'row', alignItems: 'center', backgroundColor: GOLD, paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  swapBannerText: { flex: 1, fontSize: 12, fontWeight: FONTS.weights.semibold, color: BG },
  cancelSwapBtn:  { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: RADIUS.full },
  cancelSwapText: { fontSize: 11, fontWeight: FONTS.weights.bold, color: BG },

  toast:     { flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderWidth: 1, borderColor: GOLD + '50', borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 8, marginHorizontal: 16, gap: 6 },
  toastText: { fontSize: 12, color: GOLD, fontWeight: FONTS.weights.semibold },

  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },

  weekNav:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  weekNavCenter: { flex: 1, alignItems: 'center', gap: 4 },
  weekNavLabel:  { fontSize: 14, fontWeight: FONTS.weights.semibold, color: COLORS.text.primary },
  weekArrow:     { padding: 8 },
  thisWeekBadge: { backgroundColor: GOLD + '25', borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2 },
  thisWeekText:  { fontSize: 9, fontWeight: FONTS.weights.heavy, color: GOLD, letterSpacing: 0.8 },

  calGrid:   { flexDirection: 'row', gap: 5, marginBottom: 10 },
  dayCard:   { flex: 1, backgroundColor: CARD, borderRadius: 10, borderWidth: 1, padding: 6, alignItems: 'center', gap: 3, minHeight: 78, justifyContent: 'center', position: 'relative' },
  dayAbbr:   { fontSize: 9, fontWeight: FONTS.weights.heavy, letterSpacing: 0.3 },
  dayNum:    { fontSize: 14, fontWeight: FONTS.weights.bold },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  sessionLbl:{ fontSize: 8, fontWeight: FONTS.weights.heavy, letterSpacing: 0.3 },
  swapBadge: { position: 'absolute', top: 3, right: 3, width: 14, height: 14, borderRadius: 7, backgroundColor: GOLD, justifyContent: 'center', alignItems: 'center' },
  swapBadgeNum: { fontSize: 9, fontWeight: FONTS.weights.heavy, color: BG },

  legend:     { flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:  { width: 6, height: 6, borderRadius: 3 },
  legendText: { fontSize: 10, color: COLORS.text.muted },

  statsStrip:      { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statPill:        { flex: 1, backgroundColor: CARD, borderWidth: 1, borderRadius: RADIUS.md, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center', gap: 2 },
  statPillLabel:   { fontSize: 9, color: COLORS.text.muted, fontWeight: FONTS.weights.semibold, letterSpacing: 0.5, textTransform: 'uppercase' },
  statPillValue:   { fontSize: 14, color: COLORS.text.primary, fontWeight: FONTS.weights.bold },

  sectionLabel: { fontSize: 10, color: COLORS.text.muted, fontWeight: FONTS.weights.heavy, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 },

  emptyCard:    { backgroundColor: CARD, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: BORDER, padding: 32, alignItems: 'center', gap: 8 },
  emptyText:    { fontSize: 14, color: COLORS.text.secondary, fontWeight: FONTS.weights.semibold, textAlign: 'center' },
  emptySubText: { fontSize: 12, color: COLORS.text.muted, textAlign: 'center', lineHeight: 18 },

  sessCard:       { backgroundColor: CARD, borderRadius: RADIUS.lg, borderWidth: 1, marginBottom: 10, overflow: 'hidden' },
  sessCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 },
  sessCardLeft:   { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 0 },
  sessCardRight:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sessBadge:      { borderRadius: RADIUS.sm, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3, maxWidth: 140 },
  sessBadgeText:  { fontSize: 10, fontWeight: FONTS.weights.heavy, letterSpacing: 0.3 },
  statusPill:     { fontSize: 11, fontWeight: FONTS.weights.semibold, marginLeft: 8 },
  sessDate:       { fontSize: 11, color: COLORS.text.muted },

  exLine:   { fontSize: 11, color: '#666', paddingHorizontal: 12, paddingBottom: 10, lineHeight: 16 },

  statsRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10, gap: 4 },
  statItem: { fontSize: 11 },
  statLbl:  { color: '#555' },
  statVal:  { color: COLORS.text.secondary },
  statSep:  { color: '#333', fontSize: 11 },

  goBtn:     { backgroundColor: GOLD, marginHorizontal: 12, marginBottom: 12, borderRadius: RADIUS.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, gap: 6 },
  goBtnText: { fontSize: 12, fontWeight: FONTS.weights.heavy, color: BG, letterSpacing: 0.8 },

  continueBtnSmall: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: GOLD, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 12, marginHorizontal: 12, marginBottom: 10, alignSelf: 'flex-start' },
  continueBtnText:  { fontSize: 10, fontWeight: FONTS.weights.heavy, color: BG, letterSpacing: 0.6 },

  expandDetail:  { borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: '#0D0D0F', padding: 12, gap: 10 },
  exDetailRow:   { gap: 6 },
  exDetailName:  { fontSize: 12, fontWeight: FONTS.weights.semibold, color: COLORS.text.secondary },
  setPillsRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  setPill:       { backgroundColor: '#1A1A1E', borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3 },
  setPillTop:    { backgroundColor: GOLD + '20', borderWidth: 1, borderColor: GOLD + '50' },
  setPillTxt:    { fontSize: 10, color: COLORS.text.muted },
  setPillTxtTop: { color: GOLD, fontWeight: FONTS.weights.semibold },

  // ── New exercise row styles ──────────────────────────────────────────────────
  loadingBox: { paddingVertical: 60, alignItems: 'center' },
  exRow:       { paddingVertical: 10, paddingHorizontal: 0 },
  exRowMain:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  exCatDot:    { width: 8, height: 8, borderRadius: 4, flexShrink: 0, marginTop: 2 },
  exRowName:   { fontSize: 13, fontWeight: '600', color: TEXT, flex: 1 },
  exRowNameSkipped: { textDecorationLine: 'line-through', color: MUTED },
  exOriginalName:   { fontSize: 11, color: MUTED, marginTop: 1 },
  exPrescription:   { fontSize: 11, color: MUTED, marginTop: 2 },
  kebabBtn:    { padding: 4 },

  swappedBadge:  { backgroundColor: GOLD + '20', borderWidth: 1, borderColor: GOLD + '40', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  swappedBadgeText: { fontSize: 8, fontWeight: '800', color: GOLD, letterSpacing: 0.6 },
  skippedBadge:  { backgroundColor: AMBER + '20', borderWidth: 1, borderColor: AMBER + '40', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  skippedBadgeText: { fontSize: 8, fontWeight: '800', color: AMBER, letterSpacing: 0.6 },
  addedBadge:    { backgroundColor: GREEN + '20', borderWidth: 1, borderColor: GREEN + '40', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  addedBadgeText: { fontSize: 8, fontWeight: '800', color: GREEN, letterSpacing: 0.6 },

  addExBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, marginTop: 4, borderTopWidth: 1, borderTopColor: '#1A1A1E', justifyContent: 'center' },
  addExBtnText: { fontSize: 12, color: GREEN, fontWeight: '600' },
});

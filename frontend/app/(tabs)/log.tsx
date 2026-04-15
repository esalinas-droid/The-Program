import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, FONTS, RADIUS, getSessionStyle } from '../../src/constants/theme';
import { calendarApi, logApi } from '../../src/utils/api';
import { getLocalDateString, toLocalDateString } from '../../src/utils/dateHelpers';

// ── Palette ───────────────────────────────────────────────────────────────────
const GOLD  = '#C9A84C';
const RED   = '#EF5350';
const GREEN = '#4DCEA6';
const AMBER = '#FF9800';
const BG    = '#0A0A0C';
const CARD  = '#111114';
const BORDER = '#1E1E22';

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

// ── DayCard ───────────────────────────────────────────────────────────────────
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
    day.status === 'missed'    ? AMBER : '#444';

  const isActive = day.status !== 'rest';
  const cardBg    = day.status === 'today' ? GOLD + '15' : CARD;
  const cardBorder =
    isFirstSwap || isSecondSwap ? GOLD :
    day.status === 'completed' ? RED + '40' :
    day.status === 'today'     ? GOLD + '60' :
    day.status === 'upcoming'  ? GREEN + '40' :
    day.status === 'missed'    ? AMBER + '40' : BORDER;

  return (
    <TouchableOpacity
      style={[s.dayCard, { backgroundColor: cardBg, borderColor: cardBorder }]}
      onPress={onPress}
      activeOpacity={swapMode && isActive ? 0.6 : 0.9}
    >
      {(isFirstSwap || isSecondSwap) && (
        <View style={s.swapBadge}>
          <Text style={s.swapBadgeNum}>{isFirstSwap ? '1' : '2'}</Text>
        </View>
      )}
      <Text style={[s.dayAbbr, { color: isActive ? statusColor : COLORS.text.muted }]}>
        {day.dayAbbr}
      </Text>
      <Text style={[s.dayNum, { color: isActive ? COLORS.text.primary : '#444' }]}>
        {day.dayNum}
      </Text>
      <View style={[s.statusDot, { backgroundColor: isActive ? statusColor : '#333' }]} />
      <Text style={[s.sessionLbl, { color: isActive ? statusColor : '#444' }]}>
        {isActive ? day.sessionLabel : 'REST'}
      </Text>
    </TouchableOpacity>
  );
}

// ── SessionHistoryCard ────────────────────────────────────────────────────────
function SessionHistoryCard({
  card, expanded, onToggle, onGoToSession, todayStr,
}: {
  card: SessionCard;
  expanded: boolean;
  onToggle: () => void;
  onGoToSession: () => void;
  todayStr: string;
}) {
  const style = getSessionStyle(card.sessionType);
  const stats = computeStats(card.logEntries);
  const grouped = groupByExercise(card.logEntries);
  const hasLogs = card.logEntries.length > 0;
  const isToday = card.date === todayStr;
  const isExpandable = card.status === 'completed' || card.status === 'missed';
  const exerciseList = card.exerciseNames.length > 0
    ? card.exerciseNames.join(' · ')
    : Object.keys(grouped).join(' · ') || 'Session planned';

  // Today keeps gold border regardless of logged status
  const borderColor =
    isToday                    ? GOLD :
    card.status === 'upcoming' ? GREEN + '50' :
    card.status === 'missed'   ? AMBER + '40' : BORDER;
  const borderWidth = isToday ? 1.5 : 1;

  return (
    <View style={[s.sessCard, { borderColor, borderWidth }]}>
      {/* Header row */}
      <TouchableOpacity
        style={s.sessCardHeader}
        onPress={isExpandable ? onToggle : undefined}
        activeOpacity={isExpandable ? 0.7 : 1}
      >
        <View style={s.sessCardLeft}>
          <View style={[s.sessBadge, { backgroundColor: style.bg, borderColor: style.borderColor }]}>
            <Text style={[s.sessBadgeText, { color: style.text }]} numberOfLines={1}>
              {card.sessionType}
            </Text>
          </View>
          {/* Always show "Today" label when it's today's date */}
          {isToday && (
            <Text style={[s.statusPill, { color: GOLD }]}>Today</Text>
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
          {isExpandable && (
            <MaterialCommunityIcons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={18} color={COLORS.text.muted}
            />
          )}
        </View>
      </TouchableOpacity>

      {/* Exercise names */}
      <Text style={[s.exLine, { color: card.status === 'upcoming' ? COLORS.text.muted : '#888' }]}
        numberOfLines={1}>
        {exerciseList}
      </Text>

      {/* Stats row — completed with logs only */}
      {card.status === 'completed' && stats.sets > 0 && (
        <View style={s.statsRow}>
          <Text style={s.statItem}>
            <Text style={s.statLbl}>Sets </Text>
            <Text style={{ color: RED }}>{stats.sets}</Text>
          </Text>
          <Text style={s.statSep}>·</Text>
          <Text style={s.statItem}>
            <Text style={s.statLbl}>Vol </Text>
            <Text style={s.statVal}>{formatVolume(stats.volume)}</Text>
          </Text>
          {stats.avgEffort > 0 && <>
            <Text style={s.statSep}>·</Text>
            <Text style={s.statItem}>
              <Text style={s.statLbl}>Effort </Text>
              <Text style={s.statVal}>{stats.avgEffort.toFixed(1)}</Text>
            </Text>
          </>}
        </View>
      )}

      {/* GO TO SESSION — today with no logs yet */}
      {card.status === 'today' && (
        <TouchableOpacity style={s.goBtn} onPress={onGoToSession} activeOpacity={0.8}>
          <Text style={s.goBtnText}>GO TO SESSION</Text>
          <MaterialCommunityIcons name="arrow-right" size={14} color={BG} />
        </TouchableOpacity>
      )}

      {/* CONTINUE SESSION — today has logs but may not be done */}
      {card.status === 'completed' && isToday && (
        <TouchableOpacity style={s.continueBtnSmall} onPress={onGoToSession} activeOpacity={0.8}>
          <Text style={s.continueBtnText}>CONTINUE SESSION</Text>
          <MaterialCommunityIcons name="arrow-right" size={12} color={BG} />
        </TouchableOpacity>
      )}

      {/* Expanded detail — completed (logged sets) OR missed (planned exercises) */}
      {isExpandable && expanded && (
        <View style={s.expandDetail}>
          {hasLogs ? (
            // Completed: show logged weight × reps pills
            Object.entries(grouped).map(([exName, entries]) => {
              const topEntry = entries.reduce((mx, e) =>
                (parseFloat(e.weight) || 0) > (parseFloat(mx.weight) || 0) ? e : mx, entries[0]);
              return (
                <View key={exName} style={s.exDetailRow}>
                  <Text style={s.exDetailName} numberOfLines={1}>{exName}</Text>
                  <View style={s.setPillsRow}>
                    {entries.slice(0, 4).map((e, i) => {
                      const isTop = e === topEntry;
                      return (
                        <View key={i} style={[s.setPill, isTop && s.setPillTop]}>
                          <Text style={[s.setPillTxt, isTop && s.setPillTxtTop]}>
                            {e.weight ? `${e.weight}×${e.reps}` : `—×${e.reps}`}
                          </Text>
                        </View>
                      );
                    })}
                    {entries.length > 4 && (
                      <View style={s.setPill}>
                        <Text style={s.setPillTxt}>+{entries.length - 4}</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })
          ) : (
            // Missed: show planned exercises from calendar event
            <>
              <Text style={s.plannedLabel}>Planned exercises</Text>
              {card.exercises.length > 0 ? (
                card.exercises.map((ex: any, i: number) => (
                  <View key={i} style={s.plannedRow}>
                    <View style={s.plannedDot} />
                    <Text style={s.plannedName}>{ex.name || ex}</Text>
                    {ex.sets && ex.reps ? (
                      <Text style={s.plannedPrescription}>{ex.sets} × {ex.reps}</Text>
                    ) : null}
                  </View>
                ))
              ) : (
                card.exerciseNames.map((name, i) => (
                  <View key={i} style={s.plannedRow}>
                    <View style={s.plannedDot} />
                    <Text style={s.plannedName}>{name}</Text>
                  </View>
                ))
              )}
            </>
          )}
        </View>
      )}
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

  // ── Swap logic ────────────────────────────────────────────────────────────────
  const handleDayPress = (day: WeekDay) => {
    if (!swapMode) return;
    if (day.status === 'rest') return;
    if (!firstSwap) {
      const ev = calEventsRaw.find((e: any) => e.date === day.date);
      setFirstSwap({ date: day.date, event: ev });
      return;
    }
    // Second tap — do swap
    doSwap(day.date, day);
  };

  const doSwap = async (secondDate: string, secondDay: WeekDay) => {
    if (!firstSwap) return;
    setSwapping(true);
    try {
      const secondEv = calEventsRaw.find((e: any) => e.date === secondDate);
      await Promise.all([
        calendarApi.reschedule({
          originalDate: firstSwap.date,
          newDate:       secondDate,
          sessionType:   firstSwap.event?.sessionType || '',
          reason:        'user_swap',
        }),
        secondEv ? calendarApi.reschedule({
          originalDate: secondDate,
          newDate:       firstSwap.date,
          sessionType:   secondEv.sessionType || '',
          reason:        'user_swap',
        }) : Promise.resolve(),
      ]);
      const d1 = formatDate(firstSwap.date).split(',')[0];
      const d2 = formatDate(secondDate).split(',')[0];
      setSwapToast(`${d1} ↔ ${d2} swapped`);
      setTimeout(() => setSwapToast(null), 3000);
      setSwapMode(false);
      setFirstSwap(null);
      await loadData(weekOffsetRef.current);
    } catch (err) {
      console.log('[Schedule] swap error:', err);
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

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
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
        <TouchableOpacity
          style={s.swapDaysBtn}
          onPress={() => { setSwapMode(true); setFirstSwap(null); }}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="swap-horizontal" size={14} color={COLORS.text.secondary} />
          <Text style={s.swapDaysBtnText}>Swap days</Text>
        </TouchableOpacity>
      </View>

      {/* ── Swap mode banner ── */}
      {swapMode && (
        <View style={s.swapBanner}>
          <MaterialCommunityIcons name="swap-horizontal" size={16} color={BG} />
          <Text style={s.swapBannerText}>
            {firstSwap ? 'Now tap the second training day' : 'Tap two training days to swap them'}
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

            {/* ── Legend ── */}
            <View style={s.legend}>
              {([
                { color: RED,   label: 'Completed' },
                { color: GOLD,  label: 'Today'     },
                { color: GREEN, label: 'Upcoming'  },
                { color: AMBER, label: 'Missed'    },
                { color: '#444',label: 'Rest'      },
              ] as {color:string;label:string}[]).map(({ color, label }) => (
                <View key={label} style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: color }]} />
                  <Text style={s.legendText}>{label}</Text>
                </View>
              ))}
            </View>

            {/* ── Week summary stats ── */}
            {(weekStats.totalPlanned > 0 || weekStats.volume > 0) && (
              <View style={s.statsStrip}>
                <View style={[s.statPill, { borderColor: BORDER }]}>
                  <Text style={s.statPillLabel}>Sessions</Text>
                  <Text style={[s.statPillValue, { color: RED }]}>
                    {weekStats.sessionsCompleted}/{weekStats.totalPlanned}
                  </Text>
                </View>
                <View style={[s.statPill, { borderColor: BORDER }]}>
                  <Text style={s.statPillLabel}>Volume</Text>
                  <Text style={s.statPillValue}>
                    {weekStats.volume > 0 ? formatVolume(weekStats.volume) : '—'}
                  </Text>
                </View>
                <View style={[s.statPill, { borderColor: BORDER }]}>
                  <Text style={s.statPillLabel}>Avg Effort</Text>
                  <Text style={s.statPillValue}>
                    {weekStats.avgEffort > 0 ? weekStats.avgEffort.toFixed(1) : '—'}
                  </Text>
                </View>
              </View>
            )}

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
                  onGoToSession={() => router.push('/(tabs)/today')}
                  todayStr={todayStr}
                />
              ))
            )}
          </>
        )}
      </ScrollView>
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

  loadingBox: { paddingVertical: 60, alignItems: 'center' },

  // Missed session planned-exercise view
  plannedLabel: { fontSize: 10, color: AMBER, fontWeight: FONTS.weights.heavy, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 },
  plannedRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  plannedDot:   { width: 4, height: 4, borderRadius: 2, backgroundColor: AMBER + '80' },
  plannedName:  { flex: 1, fontSize: 12, color: COLORS.text.secondary, fontWeight: FONTS.weights.medium },
  plannedPrescription: { fontSize: 11, color: COLORS.text.muted, fontVariant: ['tabular-nums'] },
});

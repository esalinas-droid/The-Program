import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView,
  Modal, ActivityIndicator, Alert, Platform, FlatList, TextInput,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { COLORS, SPACING, FONTS, RADIUS } from '../../src/constants/theme';
import { toLocalDateString } from '../../src/utils/dateHelpers';
import { calendarApi } from '../../src/utils/api';

// ── Helpers ───────────────────────────────────────────────────────────────────
const SESSION_COLORS: Record<string, string> = {
  // New terminology
  'Heavy Lower':            '#E8B84B',
  'Heavy Upper':            '#A78BFA',
  'Speed Lower':            '#60A5FA',
  'Speed Upper':            '#34D399',
  // Legacy (backward-compatible)
  'Max Effort Lower':       '#E8B84B',
  'Max Effort Upper':       '#A78BFA',
  'Dynamic Effort Lower':   '#60A5FA',
  'Dynamic Effort Upper':   '#34D399',
  'Event':                  '#F97316',
  'Recovery / Conditioning':'#FFA726',
  'Recovery Week':          '#6B7280',
  'Deload':                 '#6B7280',
  default:                  '#9CA3AF',
};

const SESSION_DOTS: Record<string, string> = {
  // New terminology
  'Heavy Lower':            '#E8B84B',
  'Heavy Upper':            '#9D77F2',
  'Speed Lower':            '#5B9CF7',
  'Speed Upper':            '#30C78A',
  // Legacy (backward-compatible)
  'Max Effort Lower':       '#E8B84B',
  'Max Effort Upper':       '#9D77F2',
  'Dynamic Effort Lower':   '#5B9CF7',
  'Dynamic Effort Upper':   '#30C78A',
  'Event':                  '#F57C30',
  'Recovery / Conditioning':'#FFA726',
  'Recovery Week':          '#6B7280',
  'Deload':                 '#6B7280',
  default:                  '#888',
};

function sessionColor(type: string) {
  for (const key of Object.keys(SESSION_COLORS)) {
    if (type?.includes(key.replace(' Lower','').replace(' Upper',''))) return SESSION_COLORS[key];
  }
  return SESSION_COLORS[type] ?? SESSION_COLORS.default;
}
function sessionDot(type: string) {
  return SESSION_DOTS[type] ?? SESSION_DOTS.default;
}
function formatDate(d: Date): string {
  return toLocalDateString(d);
}
function todayStr() { return formatDate(new Date()); }
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return formatDate(d);
}
function monthRange(monthStr: string) {
  const [y, m] = monthStr.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2,'0')}-01`;
  const end   = new Date(y, m, 0);
  return { start, end: formatDate(end) };
}
function friendlyDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

// ── Notification helpers ─────────────────────────────────────────────────────
const DAY_TO_JS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

async function requestNotifPermissions() {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

async function scheduleTrainingReminders(
  preferredDays: string[],
  hour: number,
  minute: number,
) {
  // Cancel previous training reminders
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if ((n.content.data as any)?.type === 'training_reminder') {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }

  const now = new Date();
  // Schedule for next 8 weeks
  for (let week = 0; week < 8; week++) {
    for (const dayName of preferredDays) {
      const jsDay = DAY_TO_JS[dayName.toLowerCase()];
      if (jsDay === undefined) continue;

      const d = new Date(now);
      const currentDay = d.getDay();
      let daysUntil = (jsDay - currentDay + 7) % 7;
      if (daysUntil === 0 && (d.getHours() > hour || (d.getHours() === hour && d.getMinutes() >= minute))) {
        daysUntil = 7;
      }
      d.setDate(d.getDate() + daysUntil + week * 7);
      d.setHours(hour, minute, 0, 0);

      if (d > now) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '💪 Training Day',
            body: `Time to train! Open your program for today's session.`,
            sound: true,
            data: { type: 'training_reminder', day: dayName },
          },
          trigger: { date: d } as any,
        });
      }
    }
  }
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function WorkoutCalendarScreen() {
  const router = useRouter();

  const [loading,         setLoading]         = useState(true);
  const [events,          setEvents]          = useState<any[]>([]);
  const [markedDates,     setMarkedDates]     = useState<any>({});
  const [selectedDate,    setSelectedDate]    = useState<string>(todayStr());
  const [selectedEvents,  setSelectedEvents]  = useState<any[]>([]);
  const [preferredDays,   setPreferredDays]   = useState<string[]>([]);
  const [notifHour,       setNotifHour]       = useState(7);
  const [notifMinute,     setNotifMinute]     = useState(0);
  const [currentMonth,    setCurrentMonth]    = useState(todayStr().slice(0, 7));
  const [notifGranted,    setNotifGranted]    = useState(false);

  // Modals
  const [moveModal,       setMoveModal]       = useState(false);
  const [moveEvent,       setMoveEvent]       = useState<any>(null);
  const [moveDate,        setMoveDate]        = useState<string>('');
  const [moveReason,      setMoveReason]      = useState('');
  const [notifModal,      setNotifModal]      = useState(false);
  const [savingNotif,     setSavingNotif]     = useState(false);

  // ── Fetch calendar events ──────────────────────────────────────────────────
  const loadCalendar = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = monthRange(currentMonth);
      // Fetch ±3 months for smoother scrolling
      const fetchStart = addDays(start, -90);
      const fetchEnd   = addDays(end, 90);

      const data = await calendarApi.getEvents(fetchStart, fetchEnd);
      const allEvents: any[] = data.events || [];
      setEvents(allEvents);
      setPreferredDays(data.preferredDays || []);
      setNotifHour(data.notificationHour ?? 7);
      setNotifMinute(data.notificationMinute ?? 0);

      // Build markedDates for react-native-calendars
      const marks: any = {};
      for (const ev of allEvents) {
        const key = ev.date;
        if (!marks[key]) marks[key] = { dots: [], events: [] };
        marks[key].dots.push({ color: sessionDot(ev.sessionType), key: ev.sessionType });
        marks[key].events.push(ev);
      }
      // Mark today
      if (!marks[todayStr()]) marks[todayStr()] = { dots: [] };
      marks[todayStr()].today = true;

      // Apply selected date style
      if (marks[selectedDate]) marks[selectedDate].selected = true;
      marks[selectedDate] = { ...(marks[selectedDate] || {}), selected: true, selectedColor: '#333' };

      setMarkedDates(marks);
      setSelectedEvents(marks[selectedDate]?.events || []);
    } catch (e) {
      console.warn('[Calendar] load error:', e);
    } finally {
      setLoading(false);
    }
  }, [currentMonth, selectedDate]);

  useFocusEffect(useCallback(() => {
    loadCalendar();
    Notifications.getPermissionsAsync().then(p => setNotifGranted(p.status === 'granted'));
  }, []));

  useEffect(() => { loadCalendar(); }, [currentMonth]);

  // When selected date changes, update events panel
  const handleDayPress = (day: { dateString: string }) => {
    const date = day.dateString;
    setSelectedDate(date);
    const marks = { ...markedDates };
    Object.keys(marks).forEach(k => { marks[k] = { ...marks[k], selected: false }; });
    marks[date] = { ...(marks[date] || { dots: [] }), selected: true, selectedColor: '#333' };
    setMarkedDates(marks);
    setSelectedEvents(marks[date]?.events || []);
  };

  // ── Move session ──────────────────────────────────────────────────────────
  const openMoveModal = (ev: any) => {
    setMoveEvent(ev);
    setMoveDate(addDays(ev.date, 1));
    setMoveReason('');
    setMoveModal(true);
  };

  const confirmMove = async () => {
    if (!moveEvent || !moveDate) return;
    try {
      await calendarApi.reschedule({
        originalDate: moveEvent.originalDate || moveEvent.date,
        newDate: moveDate,
        sessionType: moveEvent.sessionType,
        reason: moveReason,
      });
      setMoveModal(false);
      loadCalendar();
    } catch (e) {
      Alert.alert('Error', 'Could not reschedule session. Please try again.');
    }
  };

  const undoMove = async (ev: any) => {
    if (!ev.isOverridden || !ev.originalDate) return;
    try {
      await calendarApi.undoReschedule(ev.originalDate);
      loadCalendar();
    } catch {}
  };

  // ── Notifications ─────────────────────────────────────────────────────────
  const saveNotifications = async () => {
    setSavingNotif(true);
    try {
      const granted = await requestNotifPermissions();
      if (!granted) {
        Alert.alert('Notifications', 'Please enable notifications in Settings to receive training reminders.');
        return;
      }
      setNotifGranted(true);
      await calendarApi.updatePreferredDays({
        preferredDays,
        notificationHour: notifHour,
        notificationMinute: notifMinute,
      });
      await scheduleTrainingReminders(preferredDays, notifHour, notifMinute);
      setNotifModal(false);
    } catch (e) {
      Alert.alert('Error', 'Could not save notification settings.');
    } finally {
      setSavingNotif(false);
    }
  };

  // ── Calendar theme ────────────────────────────────────────────────────────
  const calendarTheme = {
    backgroundColor:         COLORS.background,
    calendarBackground:      COLORS.background,
    textSectionTitleColor:   COLORS.text.muted,
    selectedDayBackgroundColor: '#333',
    selectedDayTextColor:    '#FFF',
    todayTextColor:          COLORS.accent,
    dayTextColor:            COLORS.text.primary,
    textDisabledColor:       '#444',
    dotColor:                COLORS.accent,
    selectedDotColor:        '#FFF',
    arrowColor:              COLORS.accent,
    disabledArrowColor:      '#444',
    monthTextColor:          COLORS.text.primary,
    indicatorColor:          COLORS.accent,
    textDayFontFamily:       'System',
    textMonthFontFamily:     'System',
    textDayHeaderFontFamily: 'System',
    textDayFontWeight:       '500' as any,
    textMonthFontWeight:     '700' as any,
    textDayHeaderFontWeight: '600' as any,
    textDayFontSize:         14,
    textMonthFontSize:       16,
    textDayHeaderFontSize:   12,
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={COLORS.text.secondary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Workout Calendar</Text>
          <Text style={s.subtitle}>Tap a day · Drag to reschedule</Text>
        </View>
        <TouchableOpacity
          style={s.notifBtn}
          onPress={() => setNotifModal(true)}
        >
          <MaterialCommunityIcons
            name={notifGranted ? 'bell-ring-outline' : 'bell-off-outline'}
            size={20}
            color={notifGranted ? COLORS.accent : COLORS.text.muted}
          />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>

        {/* Legend */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.legendScroll} contentContainerStyle={s.legendRow}>
          {Object.entries(SESSION_COLORS).slice(0, 5).map(([label, color]) => (
            <View key={label} style={s.legendChip}>
              <View style={[s.legendDot, { backgroundColor: color }]} />
              <Text style={s.legendTxt}>{label}</Text>
            </View>
          ))}
        </ScrollView>

        {/* Calendar */}
        <View style={s.calendarCard}>
          {loading ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <ActivityIndicator color={COLORS.accent} />
            </View>
          ) : (
            <Calendar
              key={currentMonth}
              current={currentMonth + '-01'}
              theme={calendarTheme}
              markedDates={markedDates}
              markingType="multi-dot"
              onDayPress={handleDayPress}
              onMonthChange={(m: any) => setCurrentMonth(`${m.year}-${String(m.month).padStart(2,'0')}`)}
              enableSwipeMonths
              renderArrow={(direction: 'left' | 'right') => (
                <MaterialCommunityIcons
                  name={direction === 'left' ? 'chevron-left' : 'chevron-right'}
                  size={22}
                  color={COLORS.accent}
                />
              )}
            />
          )}
        </View>

        {/* Selected Day Panel */}
        <View style={s.dayPanel}>
          <View style={s.dayPanelHeader}>
            <MaterialCommunityIcons name="calendar-today" size={15} color={COLORS.accent} />
            <Text style={s.dayPanelDate}>{friendlyDate(selectedDate)}</Text>
            {selectedDate === todayStr() && (
              <View style={s.todayBadge}><Text style={s.todayBadgeTxt}>TODAY</Text></View>
            )}
          </View>

          {selectedEvents.length === 0 ? (
            <View style={s.restDay}>
              <MaterialCommunityIcons name="leaf" size={22} color={COLORS.text.muted} />
              <Text style={s.restDayTxt}>Rest day — no session scheduled</Text>
            </View>
          ) : (
            selectedEvents.map((ev, i) => (
              <SessionCard
                key={i}
                event={ev}
                onMove={() => openMoveModal(ev)}
                onUndo={ev.isOverridden ? () => undoMove(ev) : undefined}
              />
            ))
          )}
        </View>

        {/* Training Days legend */}
        {preferredDays.length > 0 && (
          <View style={s.prefDaysBanner}>
            <MaterialCommunityIcons name="repeat" size={14} color={COLORS.text.muted} />
            <Text style={s.prefDaysTxt}>
              Weekly schedule: {preferredDays.map(d => d.charAt(0).toUpperCase() + d.slice(1, 3)).join(' · ')}
            </Text>
            <TouchableOpacity onPress={() => setNotifModal(true)}>
              <Text style={s.prefDaysEdit}>Edit</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* ── Move Session Modal ── */}
      <Modal visible={moveModal} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Reschedule Session</Text>
            {moveEvent && (
              <View style={[s.modalSessionBadge, { borderLeftColor: sessionColor(moveEvent.sessionType) }]}>
                <Text style={s.modalSessionType}>{moveEvent.sessionType}</Text>
                <Text style={s.modalSessionMeta}>
                  {moveEvent.phaseName} · Week {moveEvent.weekNumber}
                </Text>
              </View>
            )}
            <Text style={s.modalLabel}>Move to new date</Text>
            <View style={s.modalCalendarWrap}>
              <Calendar
                current={moveDate || todayStr()}
                minDate={addDays(todayStr(), 0)}
                theme={{ ...calendarTheme, calendarBackground: '#1A1A1F', backgroundColor: '#1A1A1F' }}
                onDayPress={(d: any) => setMoveDate(d.dateString)}
                markedDates={moveDate ? { [moveDate]: { selected: true, selectedColor: COLORS.accent } } : {}}
              />
            </View>
            <Text style={s.modalLabel}>Reason (optional)</Text>
            <TextInput
              style={s.reasonInput}
              placeholder="Travel, injury, work schedule..."
              placeholderTextColor={COLORS.text.muted}
              value={moveReason}
              onChangeText={setMoveReason}
            />
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalBtnCancel} onPress={() => setMoveModal(false)}>
                <Text style={s.modalBtnCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtnConfirm, !moveDate && s.modalBtnDisabled]}
                onPress={confirmMove}
                disabled={!moveDate}
              >
                <Text style={s.modalBtnConfirmTxt}>Move Session</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Notification Settings Modal ── */}
      <Modal visible={notifModal} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Training Reminders</Text>
            <Text style={s.notifDesc}>
              Get notified on your training days. Reminders scheduled for the next 8 weeks.
            </Text>

            <Text style={s.modalLabel}>Reminder time</Text>
            <View style={s.timeRow}>
              {[5, 6, 7, 8, 9, 10, 11, 12].map(h => (
                <TouchableOpacity
                  key={h}
                  style={[s.timePill, notifHour === h && s.timePillActive]}
                  onPress={() => setNotifHour(h)}
                >
                  <Text style={[s.timePillTxt, notifHour === h && s.timePillTxtActive]}>
                    {h > 12 ? `${h - 12}PM` : h === 12 ? '12PM' : `${h}AM`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.modalLabel}>Minutes</Text>
            <View style={s.timeRow}>
              {[0, 15, 30, 45].map(m => (
                <TouchableOpacity
                  key={m}
                  style={[s.timePill, notifMinute === m && s.timePillActive]}
                  onPress={() => setNotifMinute(m)}
                >
                  <Text style={[s.timePillTxt, notifMinute === m && s.timePillTxtActive]}>
                    :{String(m).padStart(2, '0')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.notifSummary}>
              <MaterialCommunityIcons name="bell-outline" size={14} color={COLORS.accent} />
              <Text style={s.notifSummaryTxt}>
                You'll be reminded at {notifHour > 12 ? notifHour - 12 : notifHour}:{String(notifMinute).padStart(2,'0')} {notifHour >= 12 ? 'PM' : 'AM'} on{' '}
                {preferredDays.length > 0
                  ? preferredDays.map(d => d.charAt(0).toUpperCase() + d.slice(1, 3)).join(', ')
                  : 'your training days'}
              </Text>
            </View>

            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalBtnCancel} onPress={() => setNotifModal(false)}>
                <Text style={s.modalBtnCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalBtnConfirm} onPress={saveNotifications} disabled={savingNotif}>
                {savingNotif
                  ? <ActivityIndicator color={COLORS.primary} size="small" />
                  : <Text style={s.modalBtnConfirmTxt}>Save & Enable</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── SessionCard ───────────────────────────────────────────────────────────────
function SessionCard({ event, onMove, onUndo }: {
  event: any; onMove: () => void; onUndo?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const color = sessionColor(event.sessionType);

  return (
    <View style={[sc.card, { borderLeftColor: color }]}>
      <TouchableOpacity onPress={() => setExpanded(e => !e)} activeOpacity={0.85}>
        <View style={sc.topRow}>
          <View style={[sc.typeBadge, { backgroundColor: color + '22' }]}>
            <Text style={[sc.typeText, { color }]}>{event.sessionType}</Text>
          </View>
          {event.isOverridden && (
            <View style={sc.movedBadge}>
              <MaterialCommunityIcons name="swap-horizontal" size={10} color="#60A5FA" />
              <Text style={sc.movedTxt}>Moved</Text>
            </View>
          )}
          {event.isDeloadWeek && (
            <View style={sc.deloadBadge}>
              <MaterialCommunityIcons name="weather-night" size={10} color="#9CA3AF" />
              <Text style={sc.deloadTxt}>Recovery</Text>
            </View>
          )}
          <MaterialCommunityIcons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16} color={COLORS.text.muted}
          />
        </View>
        <Text style={sc.meta}>
          {event.phaseName} · Week {event.weekNumber}
        </Text>
      </TouchableOpacity>

      {expanded && (
        <View style={sc.body}>
          {event.coachNote ? (
            <Text style={sc.coachNote}>{event.coachNote}</Text>
          ) : null}
          {(event.exercises || []).slice(0, 5).map((ex: any, i: number) => (
            <View key={i} style={sc.exerciseRow}>
              <View style={[sc.exDot, { backgroundColor: color }]} />
              <View style={{ flex: 1 }}>
                <Text style={sc.exName}>{ex.name}</Text>
                {ex.prescription ? <Text style={sc.exScheme}>{ex.prescription}</Text> : null}
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={sc.actions}>
        {onUndo && (
          <TouchableOpacity style={sc.undoBtn} onPress={onUndo}>
            <MaterialCommunityIcons name="undo" size={13} color={COLORS.text.muted} />
            <Text style={sc.undoBtnTxt}>Restore</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={sc.moveBtn} onPress={onMove}>
          <MaterialCommunityIcons name="calendar-arrow-right" size={13} color={COLORS.accent} />
          <Text style={sc.moveBtnTxt}>Move Session</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: COLORS.background },
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.sm, gap: SPACING.md },
  backBtn:      { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  title:        { fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  subtitle:     { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, marginTop: 1 },
  notifBtn:     { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },

  legendScroll: { maxHeight: 36 },
  legendRow:    { flexDirection: 'row', gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.xs, alignItems: 'center' },
  legendChip:   { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.surface, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.border },
  legendDot:    { width: 7, height: 7, borderRadius: 4 },
  legendTxt:    { fontSize: 10, color: COLORS.text.muted },

  calendarCard: { marginHorizontal: SPACING.md, marginTop: SPACING.sm, backgroundColor: COLORS.background, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },

  dayPanel:     { marginHorizontal: SPACING.md, marginTop: SPACING.md },
  dayPanelHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  dayPanelDate: { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, flex: 1 },
  todayBadge:   { backgroundColor: COLORS.accent + '22', borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2 },
  todayBadgeTxt:{ fontSize: 10, fontWeight: FONTS.weights.heavy, color: COLORS.accent, letterSpacing: 0.8 },

  restDay:      { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border },
  restDayTxt:   { color: COLORS.text.muted, fontSize: FONTS.sizes.sm },

  prefDaysBanner: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginHorizontal: SPACING.md, marginTop: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  prefDaysTxt:    { flex: 1, fontSize: FONTS.sizes.xs, color: COLORS.text.muted },
  prefDaysEdit:   { fontSize: FONTS.sizes.xs, color: COLORS.accent, fontWeight: FONTS.weights.semibold },

  // Modal
  modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalSheet:    { backgroundColor: '#14141A', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.xl, maxHeight: '90%' },
  modalHandle:   { width: 40, height: 4, borderRadius: 2, backgroundColor: '#333', alignSelf: 'center', marginBottom: SPACING.lg },
  modalTitle:    { fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, marginBottom: SPACING.md },
  modalLabel:    { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold, color: COLORS.text.muted, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: SPACING.md, marginBottom: SPACING.sm },
  modalSessionBadge: { borderLeftWidth: 3, paddingLeft: SPACING.md, paddingVertical: SPACING.sm, marginBottom: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.sm },
  modalSessionType:  { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  modalSessionMeta:  { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, marginTop: 2 },
  modalCalendarWrap: { borderRadius: RADIUS.lg, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
  reasonInput:       { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: 12, color: COLORS.text.primary, fontSize: FONTS.sizes.sm, marginTop: SPACING.xs },
  modalBtns:         { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.lg },
  modalBtnCancel:    { flex: 1, paddingVertical: 13, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  modalBtnCancelTxt: { color: COLORS.text.secondary, fontWeight: FONTS.weights.semibold },
  modalBtnConfirm:   { flex: 1, paddingVertical: 13, borderRadius: RADIUS.md, backgroundColor: COLORS.accent, alignItems: 'center' },
  modalBtnConfirmTxt:{ color: COLORS.primary, fontWeight: FONTS.weights.heavy },
  modalBtnDisabled:  { opacity: 0.4 },

  // Notifications
  notifDesc:    { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, lineHeight: 20, marginBottom: SPACING.sm },
  timeRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  timePill:     { paddingHorizontal: SPACING.md, paddingVertical: 9, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  timePillActive:    { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  timePillTxt:       { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, fontWeight: FONTS.weights.medium },
  timePillTxtActive: { color: COLORS.primary, fontWeight: FONTS.weights.heavy },
  notifSummary:      { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.xs, marginTop: SPACING.md, backgroundColor: COLORS.accent + '15', borderRadius: RADIUS.md, padding: SPACING.md },
  notifSummaryTxt:   { flex: 1, fontSize: FONTS.sizes.xs, color: COLORS.text.secondary, lineHeight: 18 },
});

const sc = StyleSheet.create({
  card:       { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, borderLeftWidth: 3, padding: SPACING.md, marginBottom: SPACING.sm },
  topRow:     { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: 4, flexWrap: 'wrap' },
  typeBadge:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full },
  typeText:   { fontSize: 11, fontWeight: FONTS.weights.heavy },
  movedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#60A5FA20', borderRadius: RADIUS.full, paddingHorizontal: 7, paddingVertical: 2 },
  movedTxt:   { fontSize: 10, color: '#60A5FA', fontWeight: FONTS.weights.semibold },
  deloadBadge:{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#6B728020', borderRadius: RADIUS.full, paddingHorizontal: 7, paddingVertical: 2 },
  deloadTxt:  { fontSize: 10, color: '#9CA3AF', fontWeight: FONTS.weights.semibold },
  meta:       { fontSize: FONTS.sizes.xs, color: COLORS.text.muted },
  body:       { marginTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.sm, gap: 6 },
  coachNote:  { fontSize: FONTS.sizes.xs, color: COLORS.accent, fontStyle: 'italic', marginBottom: SPACING.xs },
  exerciseRow:{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  exDot:      { width: 6, height: 6, borderRadius: 3, marginTop: 6, flexShrink: 0 },
  exName:     { fontSize: FONTS.sizes.sm, color: COLORS.text.primary, fontWeight: FONTS.weights.medium },
  exScheme:   { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, marginTop: 2 },
  actions:    { flexDirection: 'row', justifyContent: 'flex-end', gap: SPACING.sm, marginTop: SPACING.sm, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border },
  moveBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: SPACING.md, paddingVertical: 7, borderRadius: RADIUS.md, backgroundColor: COLORS.accent + '18', borderWidth: 1, borderColor: COLORS.accent + '40' },
  moveBtnTxt: { fontSize: 12, color: COLORS.accent, fontWeight: FONTS.weights.semibold },
  undoBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: SPACING.md, paddingVertical: 7, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  undoBtnTxt: { fontSize: 12, color: COLORS.text.muted, fontWeight: FONTS.weights.medium },
});

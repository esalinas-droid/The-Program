import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Linking, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS, getSessionStyle } from '../../src/constants/theme';
import { getProfile } from '../../src/utils/storage';
import { logApi } from '../../src/utils/api';
import { getProgramSession, getWeekSessions, getTodayDayName } from '../../src/data/programData';
import { ProgramSession } from '../../src/types';

const TRAINING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function TodayScreen() {
  const router = useRouter();
  const [week, setWeek] = useState(1);
  const [todaySession, setTodaySession] = useState<ProgramSession | null>(null);
  const [weekSessions, setWeekSessions] = useState<ProgramSession[]>([]);
  const [loggedDays, setLoggedDays] = useState<Record<string, string>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ warmup: true, activation: true, rampup: true, suppl: true, acc: true, gpp: true, notes: true });
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    (async () => {
      const prof = await getProfile();
      const w = prof?.currentWeek || 1;
      setWeek(w);
      const today = getTodayDayName();
      setTodaySession(getProgramSession(w, today === 'Sunday' ? 'Monday' : today));
      setWeekSessions(getWeekSessions(w));
      try {
        const entries = await logApi.list({ week: w });
        const dayMap: Record<string, string> = {};
        entries.forEach((e: any) => { dayMap[e.day] = e.completed || 'Completed'; });
        setLoggedDays(dayMap);
      } catch {}
      setLoading(false);
    })();
  }, []));

  function toggleSection(key: string) {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function openYouTube(lift: string) {
    Linking.openURL(`https://www.youtube.com/results?search_query=${encodeURIComponent(lift + ' strongman tutorial')}`);
  }

  if (loading) return <View style={s.loading}><ActivityIndicator color={COLORS.accent} /></View>;
  if (!todaySession) return <View style={s.loading}><Text style={s.noData}>Loading session data...</Text></View>;

  const sc = getSessionStyle(todaySession.sessionType);
  const todayName = getTodayDayName();

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} testID="today-scroll">
        {/* Header */}
        <View style={s.header}>
          <Text style={s.appName}>TODAY'S SESSION</Text>
          <Text style={s.dateText}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</Text>
        </View>

        {/* Session Type Badge */}
        <View style={s.badgeRow}>
          <View style={[s.badge, { backgroundColor: sc.bg }]}>
            <Text style={[s.badgeText, { color: sc.text }]}>{todaySession.sessionType}</Text>
          </View>
          <Text style={s.phaseText}>Block {todaySession.block} · {todaySession.phase}</Text>
        </View>

        {/* Deload Banner */}
        {todaySession.isDeload && (
          <View style={s.deloadBanner}>
            <Text style={s.deloadText}>DELOAD WEEK — One boxing session only. Keep intensity low.</Text>
          </View>
        )}

        {/* Main Work */}
        <View style={s.mainCard}>
          <Text style={s.mainLabel}>MAIN LIFT</Text>
          <View style={s.mainLiftRow}>
            <Text style={s.mainLift}>{todaySession.mainLift}</Text>
            <TouchableOpacity testID="yt-main-lift" onPress={() => openYouTube(todaySession.mainLift)}>
              <View style={s.ytBtn}><Text style={s.ytBtnText}>▶ Demo</Text></View>
            </TouchableOpacity>
          </View>
          <Text style={s.scheme}>{todaySession.topSetScheme}</Text>
          <View style={s.intentRow}>
            <MaterialCommunityIcons name="target" size={14} color={COLORS.text.muted} />
            <Text style={s.intent}> {todaySession.intentRPETarget}</Text>
          </View>
        </View>

        {/* Ramp-Up Sets */}
        <CollapsibleSection
          title="RAMP-UP SETS"
          sectionKey="rampup"
          collapsed={collapsed}
          onToggle={toggleSection}
          testID="rampup-section"
        >
          <Text style={s.protocolText}>{todaySession.rampUpSets}</Text>
        </CollapsibleSection>

        {/* Warm-Up Protocol */}
        <CollapsibleSection title="WARM-UP PROTOCOL" sectionKey="warmup" collapsed={collapsed} onToggle={toggleSection} testID="warmup-section">
          <Text style={s.protocolText}>{todaySession.warmUpProtocol}</Text>
        </CollapsibleSection>

        {/* Activation / Rehab */}
        <CollapsibleSection title="ACTIVATION / REHAB DRILLS" sectionKey="activation" collapsed={collapsed} onToggle={toggleSection} testID="activation-section">
          <Text style={s.protocolText}>{todaySession.activationRehab}</Text>
        </CollapsibleSection>

        {/* Supplemental Work */}
        {todaySession.supplementalWork.length > 0 && (
          <CollapsibleSection title="SUPPLEMENTAL WORK" sectionKey="suppl" collapsed={collapsed} onToggle={toggleSection} testID="suppl-section">
            {todaySession.supplementalWork.map((item, i) => (
              <View key={i} style={s.listItem}>
                <Text style={s.listBullet}>•</Text>
                <Text style={s.listText}>{item}</Text>
              </View>
            ))}
          </CollapsibleSection>
        )}

        {/* Accessories */}
        {todaySession.accessories.length > 0 && (
          <CollapsibleSection title="ACCESSORIES" sectionKey="acc" collapsed={collapsed} onToggle={toggleSection} testID="acc-section">
            {todaySession.accessories.map((item, i) => (
              <View key={i} style={s.listItem}>
                <Text style={s.listBullet}>•</Text>
                <Text style={s.listText}>{item}</Text>
              </View>
            ))}
          </CollapsibleSection>
        )}

        {/* Event/GPP */}
        {todaySession.eventGPP !== '' && (
          <CollapsibleSection title="EVENT / GPP" sectionKey="gpp" collapsed={collapsed} onToggle={toggleSection} testID="gpp-section">
            <Text style={s.protocolText}>{todaySession.eventGPP}</Text>
          </CollapsibleSection>
        )}

        {/* Coaching Notes */}
        <CollapsibleSection title="COACHING NOTES" sectionKey="notes" collapsed={collapsed} onToggle={toggleSection} testID="notes-section">
          <Text style={s.protocolText}>{todaySession.coachingNotes}</Text>
        </CollapsibleSection>

        {/* Log This Session Button */}
        <TouchableOpacity
          testID="log-session-btn"
          style={s.logBtn}
          onPress={() => router.push('/(tabs)/log')}
        >
          <MaterialCommunityIcons name="pencil-plus" size={20} color="#FFF" />
          <Text style={s.logBtnText}>  Log This Session</Text>
        </TouchableOpacity>

        {/* Week View Grid */}
        <Text style={s.weekHeader}>WEEK {week} OVERVIEW</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.weekGrid}>
          {weekSessions.map((session, idx) => {
            const day = TRAINING_DAYS[idx];
            const sc2 = getSessionStyle(session.sessionType);
            const isToday = day === todayName;
            const status = loggedDays[day];
            return (
              <TouchableOpacity
                testID={`week-card-${day}`}
                key={day}
                style={[s.weekCard, isToday && s.weekCardToday]}
                onPress={() => {}}
              >
                <Text style={s.weekDay}>{day.slice(0, 3).toUpperCase()}</Text>
                <View style={[s.weekBadge, { backgroundColor: sc2.bg }]}>
                  <Text style={[s.weekBadgeText, { color: sc2.text }]}>{session.sessionType.split(' ')[0]} {session.sessionType.split(' ')[1] || ''}</Text>
                </View>
                <Text style={s.weekLift} numberOfLines={2}>{session.mainLift}</Text>
                <Text style={s.weekScheme} numberOfLines={1}>{session.topSetScheme.split(';')[0]}</Text>
                {status && (
                  <View style={[s.statusBadge, { backgroundColor: status === 'Completed' ? '#1A3A1A' : status === 'Modified' ? '#3A2A10' : '#3A1A1A' }]}>
                    <Text style={[s.statusBadgeText, { color: status === 'Completed' ? '#4CAF50' : status === 'Modified' ? '#FFD700' : '#CF6679' }]}>
                      {status === 'Completed' ? '✓' : status === 'Modified' ? '~' : '✗'} {status}
                    </Text>
                  </View>
                )}
                <TouchableOpacity testID={`yt-week-${day}`} onPress={() => openYouTube(session.mainLift)} style={s.weekYT}>
                  <Text style={s.weekYTText}>▶</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function CollapsibleSection({ title, sectionKey, collapsed, onToggle, children, testID }: any) {
  const isCollapsed = collapsed[sectionKey];
  return (
    <View style={cs.wrapper}>
      <TouchableOpacity testID={testID} style={cs.header} onPress={() => onToggle(sectionKey)}>
        <Text style={cs.title}>{title}</Text>
        <MaterialCommunityIcons name={isCollapsed ? 'chevron-down' : 'chevron-up'} size={20} color={COLORS.text.muted} />
      </TouchableOpacity>
      {!isCollapsed && <View style={cs.content}>{children}</View>}
    </View>
  );
}
const cs = StyleSheet.create({
  wrapper: { marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.lg },
  title: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.text.secondary, letterSpacing: 1.5 },
  content: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg },
});

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  loading: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
  noData: { color: COLORS.text.secondary, fontSize: FONTS.sizes.base },
  header: { padding: SPACING.lg, paddingTop: SPACING.xl },
  appName: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.accent, letterSpacing: 3, marginBottom: 4 },
  dateText: { fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  badgeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm, gap: SPACING.md },
  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: RADIUS.full },
  badgeText: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold },
  phaseText: { color: COLORS.text.muted, fontSize: FONTS.sizes.sm },
  deloadBanner: { marginHorizontal: SPACING.lg, backgroundColor: '#F0F0F0', borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm },
  deloadText: { color: '#808080', fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.sm },
  mainCard: { marginHorizontal: SPACING.lg, backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.sm, borderWidth: 1, borderColor: '#2A4070' },
  mainLabel: { fontSize: 10, fontWeight: FONTS.weights.heavy, color: COLORS.accent, letterSpacing: 2, marginBottom: SPACING.sm },
  mainLiftRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  mainLift: { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, flex: 1 },
  ytBtn: { backgroundColor: COLORS.accent, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.md, marginLeft: SPACING.sm },
  ytBtnText: { color: '#FFF', fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold },
  scheme: { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, marginBottom: SPACING.sm, lineHeight: 20 },
  intentRow: { flexDirection: 'row', alignItems: 'center' },
  intent: { fontSize: FONTS.sizes.xs, color: COLORS.text.muted },
  protocolText: { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm, lineHeight: 22 },
  listItem: { flexDirection: 'row', marginBottom: 6 },
  listBullet: { color: COLORS.accent, marginRight: 8, fontSize: FONTS.sizes.sm },
  listText: { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm, flex: 1, lineHeight: 20 },
  logBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.accent, margin: SPACING.lg, borderRadius: RADIUS.lg, height: 52 },
  logBtnText: { color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy },
  weekHeader: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 2, paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm },
  weekGrid: { paddingLeft: SPACING.lg, marginBottom: SPACING.sm },
  weekCard: { width: 150, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, marginRight: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  weekCardToday: { borderColor: COLORS.accent, borderWidth: 2 },
  weekDay: { fontSize: 10, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 1.5, marginBottom: 6 },
  weekBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.full, marginBottom: 6 },
  weekBadgeText: { fontSize: 9, fontWeight: FONTS.weights.bold },
  weekLift: { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.bold, color: COLORS.text.primary, marginBottom: 4 },
  weekScheme: { fontSize: 10, color: COLORS.text.muted, marginBottom: 6 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.full, marginBottom: 4 },
  statusBadgeText: { fontSize: 9, fontWeight: FONTS.weights.bold },
  weekYT: { backgroundColor: COLORS.surfaceHighlight, borderRadius: RADIUS.sm, padding: 4, alignSelf: 'flex-end' },
  weekYTText: { color: COLORS.text.secondary, fontSize: 10 },
});

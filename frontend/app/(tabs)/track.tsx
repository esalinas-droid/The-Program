import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Animated, useWindowDimensions, Platform,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle, Path, Rect, Line, G, Text as SvgText } from 'react-native-svg';
import { COLORS, SPACING, FONTS, RADIUS } from '../../src/constants/theme';
import { prApi, bwApi, analyticsApi, profileApi, programApi, liftsApi, streakApi, badgesApi, questApi } from '../../src/utils/api';

// ── Palette ────────────────────────────────────────────────────────────────────
const GOLD  = '#C9A84C';
const TEAL  = '#4DCEA6';
const RED   = '#E54D4D';
const AMBER = '#F5A623';
const BG    = '#0A0A0C';
const CARD  = '#111114';
const BORDER = '#1E1E22';

// ── Constants ──────────────────────────────────────────────────────────────────
const PRIMARY_LIFTS = [
  { label: 'Squat', exercise: 'Back Squat' },
  { label: 'Bench', exercise: 'Bench Press' },
  { label: 'DL',    exercise: 'Conventional Deadlift' },
  { label: 'OHP',   exercise: 'Overhead Press (Barbell)' },
];
const DELOAD_WEEKS = [4, 8, 12, 20, 24, 28, 32, 36, 40, 44, 48, 52];
const SECTION_COUNT = 12;

type ActiveTab = 'overview' | 'strength' | 'body' | 'program';

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtDate(date: string): string {
  try { return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return date; }
}
function isRecentPR(lastDate?: string | null): boolean {
  if (!lastDate) return false;
  return (Date.now() - new Date(lastDate).getTime()) / 86400000 < 14;
}
function getBlockInfo(currentWeek: number) {
  const blockEnd   = DELOAD_WEEKS.find(w => w >= currentWeek) ?? 52;
  const prevDeload = [...DELOAD_WEEKS].reverse().find(w => w < currentWeek) ?? 0;
  const blockLen   = blockEnd - prevDeload;
  const weekInBlk  = currentWeek - prevDeload;
  const blockNum   = DELOAD_WEEKS.indexOf(blockEnd) + 1;
  return { blockNum, blockEnd, blockStart: prevDeload + 1, progress: weekInBlk / blockLen, weekInBlk, blockLen };
}
function mapSessionLabel(raw: string): string {
  const MAP: Record<string, string> = {
    'Max Effort Upper': 'Heavy Upper', 'Max Effort Lower': 'Heavy Lower',
    'Dynamic Effort Upper': 'Speed Upper', 'Dynamic Effort Lower': 'Speed Lower',
    'GPP': 'Recovery', 'GPP / Recovery': 'Recovery',
    'ME Upper': 'Heavy Upper', 'ME Lower': 'Heavy Lower',
    'DE Upper': 'Speed Upper', 'DE Lower': 'Speed Lower',
    'Max Effort': 'Heavy', 'Dynamic Effort': 'Speed',
  };
  return MAP[raw] || raw;
}
function getPhaseLabel(currentWeek: number, yearPlan: any): string {
  if (!yearPlan?.phases) return '';
  const phase = yearPlan.phases.find((p: any) => p.startWeek <= currentWeek && p.endWeek >= currentWeek);
  return phase?.phaseName || '';
}

// ── Chart: LineChart ───────────────────────────────────────────────────────────
function LineChart({ data, color = COLORS.accent, height = 160 }: {
  data: { y: number; label: string }[]; color?: string; height?: number;
}) {
  const { width } = useWindowDimensions();
  const CHART_W = Math.max(100, width - SPACING.lg * 4);
  if (!data || data.length < 2) return (
    <View style={{ height, justifyContent: 'center', alignItems: 'center' }}>
      <MaterialCommunityIcons name="chart-line-variant" size={28} color={COLORS.text.muted} />
      <Text style={{ color: COLORS.text.muted, fontSize: FONTS.sizes.sm, marginTop: 6 }}>Log more sessions to see your trend</Text>
    </View>
  );
  const PAD_L = 42, PAD_R = 10, PAD_T = 14, PAD_B = 28;
  const cW = CHART_W - PAD_L - PAD_R, cH = height - PAD_T - PAD_B;
  const vals = data.map(d => d.y), minY = Math.min(...vals), maxY = Math.max(...vals), rangeY = maxY - minY || 1;
  const pts = data.map((d, i) => ({
    x: PAD_L + (i / (data.length - 1)) * cW,
    y: PAD_T + cH - ((d.y - minY) / rangeY) * cH,
    label: d.label, val: d.y,
  }));
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${pts[pts.length-1].x.toFixed(1)} ${(PAD_T+cH).toFixed(1)} L ${pts[0].x.toFixed(1)} ${(PAD_T+cH).toFixed(1)} Z`;
  const gridVals = [minY, Math.round((minY+maxY)/2), maxY];
  const xIdxs = data.length <= 5 ? data.map((_, i) => i) : [0, Math.floor(data.length/4), Math.floor(data.length/2), Math.floor(3*data.length/4), data.length-1];
  return (
    <Svg width={CHART_W} height={height + PAD_B}>
      {gridVals.map((v, i) => {
        const gy = PAD_T + cH - ((v - minY) / rangeY) * cH;
        return <G key={i}><Line x1={PAD_L} y1={gy} x2={CHART_W - PAD_R} y2={gy} stroke="#2A2A2A" strokeWidth={1} strokeDasharray="4,3" /><SvgText x={PAD_L - 4} y={gy + 4} fontSize={9} fill="#666" textAnchor="end">{Math.round(v)}</SvgText></G>;
      })}
      <Path d={areaPath} fill={color + '14'} />
      <Path d={linePath} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((pt, i) => <Circle key={i} cx={pt.x} cy={pt.y} r={3.5} fill={color} />)}
      {xIdxs.map(idx => <SvgText key={idx} x={pts[idx].x} y={height + PAD_B - 4} fontSize={9} fill="#666" textAnchor="middle">{data[idx].label}</SvgText>)}
    </Svg>
  );
}

// ── Chart: BarChart ────────────────────────────────────────────────────────────
function BarChart({ data, color = COLORS.accent }: {
  data: { week: number; value: number; isCurrent: boolean }[]; color?: string;
}) {
  const { width } = useWindowDimensions();
  const CHART_W = Math.max(100, width - SPACING.lg * 4);
  if (!data || data.length === 0) return (
    <View style={{ height: 120, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: COLORS.text.muted, fontSize: FONTS.sizes.sm }}>Log sessions to see volume</Text>
    </View>
  );
  const H = 130, PAD_X = 8, PAD_T = 10, PAD_B = 26;
  const cH = H - PAD_T - PAD_B, cW = CHART_W - PAD_X * 2;
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const barW = Math.max(10, (cW / data.length) * 0.65), step = cW / data.length;
  return (
    <Svg width={CHART_W} height={H}>
      {data.map((d, i) => {
        const barH = Math.max(2, (d.value / maxVal) * cH);
        const x = PAD_X + step * i + (step - barW) / 2, y = PAD_T + cH - barH;
        return (
          <G key={i}>
            <Rect x={x} y={y} width={barW} height={barH} fill={d.isCurrent ? 'transparent' : color} stroke={d.isCurrent ? color : 'none'} strokeWidth={1.5} rx={3} />
            {d.value > 0 && <SvgText x={x + barW/2} y={y - 4} fontSize={8} fill={d.isCurrent ? color : COLORS.text.muted} textAnchor="middle">{d.value >= 1000 ? `${(d.value/1000).toFixed(1)}k` : d.value}</SvgText>}
            <SvgText x={x + barW/2} y={H - 6} fontSize={8} fill="#666" textAnchor="middle">W{d.week}</SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// ── Chart: CircularProgress ────────────────────────────────────────────────────
function CircularProgress({ size = 64, progress = 0, color = GOLD }: {
  size?: number; progress?: number; color?: string;
}) {
  const sw = size > 80 ? 11 : 8, r = (size - sw * 2) / 2, cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r, pct = Math.min(1, Math.max(0, progress)), offset = circ * (1 - pct);
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={r} stroke="#2A2A2A" strokeWidth={sw} fill="none" />
        <Circle cx={cx} cy={cy} r={r} stroke={color} strokeWidth={sw} fill="none"
          strokeDasharray={`${circ} ${circ}`} strokeDashoffset={offset}
          strokeLinecap="round" transform={`rotate(-90, ${cx}, ${cy})`} />
      </Svg>
      <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: COLORS.text.primary, fontSize: size > 80 ? 24 : 14, fontWeight: '900', lineHeight: size > 80 ? 28 : 18 }}>{Math.round(pct * 100)}%</Text>
        {size > 80 && <Text style={{ color: COLORS.text.muted, fontSize: 9, letterSpacing: 1 }}>COMPLIANCE</Text>}
      </View>
    </View>
  );
}

// ── Chart: MiniPainBars ────────────────────────────────────────────────────────
function MiniPainBars({ data, color }: { data: { week: number; avgPain: number }[]; color: string }) {
  const { width } = useWindowDimensions();
  const CHART_W = Math.max(100, width - SPACING.lg * 4);
  if (!data || data.length === 0) return null;
  const H = 90, PAD_X = 8, PAD_T = 8, PAD_B = 22;
  const cH = H - PAD_T - PAD_B, cW = CHART_W - PAD_X * 2;
  const step = cW / data.length, barW = Math.max(8, step * 0.6);
  return (
    <Svg width={CHART_W} height={H}>
      {data.map((d, i) => {
        const barH = Math.max(2, (d.avgPain / 4) * cH);
        const x = PAD_X + step * i + (step - barW) / 2, y = PAD_T + cH - barH;
        return <G key={i}><Rect x={x} y={y} width={barW} height={barH} fill={color} rx={2} /><SvgText x={x + barW/2} y={H - 5} fontSize={8} fill="#666" textAnchor="middle">W{d.week}</SvgText></G>;
      })}
    </Svg>
  );
}

// ── SegmentControl ─────────────────────────────────────────────────────────────
function SegmentControl({ value, onChange }: { value: ActiveTab; onChange: (t: ActiveTab) => void }) {
  const tabs: { key: ActiveTab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'strength', label: 'Strength' },
    { key: 'body',     label: 'Body'     },
    { key: 'program',  label: 'Program'  },
  ];
  return (
    <View style={sg.wrap}>
      {tabs.map(t => (
        <TouchableOpacity key={t.key} style={[sg.tab, value === t.key && sg.tabActive]} onPress={() => onChange(t.key)} activeOpacity={0.7}>
          <Text style={[sg.tabText, value === t.key && sg.tabTextActive]}>{t.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
const sg = StyleSheet.create({
  wrap:        { flexDirection: 'row', backgroundColor: CARD, borderRadius: 10, padding: 3, marginHorizontal: SPACING.lg, marginBottom: SPACING.md },
  tab:         { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 8 },
  tabActive:   { backgroundColor: GOLD },
  tabText:     { fontSize: 12, fontWeight: '600', color: '#666' },
  tabTextActive:{ color: BG, fontWeight: '700' },
});

// ── SectionLabel ───────────────────────────────────────────────────────────────
function SectionLbl({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: '#555', letterSpacing: 1.5, textTransform: 'uppercase' }}>{title}</Text>
      {right}
    </View>
  );
}

// ── InlinePills ────────────────────────────────────────────────────────────────
function InlinePills({ options, value, onSelect, labels }: {
  options: string[]; value: string; onSelect: (v: string) => void; labels?: Record<string, string>;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 5 }}>
      {options.map(opt => (
        <TouchableOpacity key={opt} style={[ip.base, value === opt && ip.active]} onPress={() => onSelect(opt)} activeOpacity={0.7}>
          <Text style={[ip.text, value === opt && ip.textActive]}>{labels ? labels[opt] : opt}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
const ip = StyleSheet.create({
  base:      { paddingVertical: 3, paddingHorizontal: 9, borderRadius: RADIUS.full, backgroundColor: '#1A1A1E' },
  active:    { backgroundColor: GOLD },
  text:      { fontSize: 10, fontWeight: '700', color: '#666' },
  textActive:{ color: BG },
});

// ── SectionHeader (full view) ─────────────────────────────────────────────────
function SectionHeader({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  return (
    <View style={hdr.wrap}>
      <View style={hdr.icon}><MaterialCommunityIcons name={icon as any} size={17} color={GOLD} /></View>
      <View>
        <Text style={hdr.title}>{title}</Text>
        {subtitle ? <Text style={hdr.sub}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}
const hdr = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  icon:  { width: 32, height: 32, borderRadius: RADIUS.md, backgroundColor: GOLD + '22', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, letterSpacing: 0.5 },
  sub:   { fontSize: 10, color: COLORS.text.muted, letterSpacing: 1.5, marginTop: 1 },
});

// ── Main Screen ────────────────────────────────────────────────────────────────
export default function TrackScreen() {
  const insets = useSafeAreaInsets();

  // Segment state
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');

  // Data state
  const [overview,     setOverview]     = useState<any>(null);
  const [prs,          setPrs]          = useState<any[]>([]);
  const [trackedLifts, setTrackedLifts] = useState<any[]>([]);
  const [prSort,       setPrSort]       = useState<'recent' | 'heaviest' | 'exercise'>('recent');
  const [selectedLift, setSelectedLift] = useState('Back Squat');
  const [liftHistory,  setLiftHistory]  = useState<any[]>([]);
  const [liftLoading,  setLiftLoading]  = useState(false);
  const [volumeData,   setVolumeData]   = useState<any[]>([]);
  const [volumeMode,   setVolumeMode]   = useState('sets');
  const [bwData,       setBwData]       = useState<any[]>([]);
  const [bwRange,      setBwRange]      = useState('30');
  const [painData,     setPainData]     = useState<any>(null);
  const [compliance,   setCompliance]   = useState<any[]>([]);
  const [profile,      setProfile]      = useState<any>(null);
  const [yearPlan,     setYearPlan]     = useState<any>(null);
  const [loading,      setLoading]      = useState(true);

  // Gamification
  const [streak,  setStreak]  = useState<any>(null);
  const [badges,  setBadges]  = useState<any>(null);
  const [quest,   setQuest]   = useState<any>(null);

  const router = useRouter();

  const anims = useRef(Array.from({ length: SECTION_COUNT }, () => new Animated.Value(0))).current;

  function runAnims() {
    if (Platform.OS === 'web') {
      // useNativeDriver not supported on web; set instantly
      anims.forEach(a => a.setValue(1));
      return;
    }
    anims.forEach(a => a.setValue(0));
    Animated.stagger(55, anims.map(a => Animated.timing(a, { toValue: 1, duration: 360, useNativeDriver: true }))).start();
  }
  function fade(i: number) {
    return { opacity: anims[Math.min(i, SECTION_COUNT - 1)], transform: [{ translateY: anims[Math.min(i, SECTION_COUNT - 1)].interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] };
  }

  useFocusEffect(useCallback(() => { loadAll(); }, []));

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [prData, bwHistory, profileData, liftsData] = await Promise.all([
        prApi.getAll().catch(() => []),
        bwApi.getHistory().catch(() => []),
        profileApi.get().catch(() => null),
        liftsApi.list().catch(() => ({ lifts: [] })),
      ]);
      setPrs(prData); setBwData(bwHistory); setProfile(profileData);
      setTrackedLifts(liftsData.lifts || []);
      const [ov, vol, pain, comp] = await Promise.all([
        analyticsApi.overview().catch(() => null),
        analyticsApi.volume().catch(() => []),
        analyticsApi.pain().catch(() => null),
        analyticsApi.compliance().catch(() => []),
      ]);
      setOverview(ov); setVolumeData(vol); setPainData(pain); setCompliance(comp);
      programApi.getYearPlan().then(p => setYearPlan(p)).catch(() => {});
      // Load gamification data (non-blocking)
      Promise.all([
        streakApi.get().catch(() => null),
        badgesApi.get().catch(() => null),
        questApi.get().catch(() => null),
      ]).then(([s, b, q]) => {
        setStreak(s); setBadges(b); setQuest(q);
      }).catch(() => {});
    } catch (e) {
      console.warn('[TrackScreen] loadAll error:', e);
    } finally {
      setLoading(false);
      runAnims();
      loadLift('Back Squat');
    }
  }

  async function loadLift(exercise: string) {
    setSelectedLift(exercise);
    setLiftLoading(true);
    const data = await prApi.getHistory(exercise).catch(() => []);
    setLiftHistory(data);
    setLiftLoading(false);
  }

  // ── Derived ─────────────────────────────────────────────────────────────────
  const sortedPRs = useMemo(() => {
    const filtered = prs.filter(p => p.bestE1rm > 0 || p.bestWeight > 0);
    if (prSort === 'recent')   return [...filtered].sort((a, b) => (b.lastDate ?? '') > (a.lastDate ?? '') ? 1 : -1);
    if (prSort === 'heaviest') return [...filtered].sort((a, b) => b.bestE1rm - a.bestE1rm);
    return [...filtered].sort((a, b) => a.exercise.localeCompare(b.exercise));
  }, [prs, prSort]);

  const liftChartData = useMemo(() => liftHistory.filter(d => d.e1rm > 0).map(d => ({ y: d.e1rm, label: `W${d.week}` })), [liftHistory]);
  const currentE1RM   = useMemo(() => liftChartData.length ? liftChartData[liftChartData.length - 1].y : null, [liftChartData]);

  const e1rmChange = useMemo(() => {
    if (liftChartData.length < 2) return null;
    const recent = liftChartData[liftChartData.length - 1].y;
    const older  = liftChartData[Math.max(0, liftChartData.length - 5)].y;
    return recent - older;
  }, [liftChartData]);

  const bwChartData = useMemo(() => {
    if (!bwData.length) return [];
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - parseInt(bwRange));
    return bwData.filter(d => new Date(d.date) >= cutoff).map(d => ({ y: d.weight, label: fmtDate(d.date) }));
  }, [bwData, bwRange]);

  const currentBW = useMemo(() => bwChartData.length ? bwChartData[bwChartData.length - 1].y : (profile?.currentBodyweight ?? null), [bwChartData, profile]);
  const blockInfo  = useMemo(() => getBlockInfo(profile?.currentWeek ?? 1), [profile]);
  const trendColor = useMemo(() => {
    if (!painData?.trend) return AMBER;
    if (painData.trend === 'decreasing') return TEAL;
    if (painData.trend === 'increasing') return RED;
    return AMBER;
  }, [painData]);
  const overallCompliance = overview?.compliance ?? 0;

  // Est. Maxes for 3-card row — use featured lifts if available, else fallback to hardcoded
  const featuredLifts = useMemo(() => trackedLifts.filter(l => l.isFeatured), [trackedLifts]);
  const estMaxCards = useMemo(() => {
    if (featuredLifts.length >= 3) {
      return featuredLifts.slice(0, 3).map(l => ({
        key: l.exercise.split(' ').slice(0, 2).join(' ').toUpperCase(),
        pr: { exercise: l.exercise, bestE1rm: l.bestE1rm, bestWeight: l.bestWeight, bestReps: l.bestReps, lastDate: l.lastDate },
      }));
    }
    // Fallback: hardcoded categories
    const targets = [
      { key: 'SQUAT', exercises: ['Back Squat', 'Front Squat', 'SSB Squat'] },
      { key: 'PRESS', exercises: ['Bench Press', 'Close-Grip Bench Press', 'Floor Press'] },
      { key: 'PULL',  exercises: ['Conventional Deadlift', 'Sumo Deadlift', 'Romanian Deadlift'] },
    ];
    return targets.map(t => {
      const pr = prs.find(p => t.exercises.some(e => p.exercise?.toLowerCase().includes(e.toLowerCase().split(' ')[0])));
      return { key: t.key, pr };
    });
  }, [prs, featuredLifts]);

  // PR board source: use ALL tracked lifts if available, else fall back to log-based sortedPRs
  const prBoardLifts = useMemo(() => {
    if (trackedLifts.length > 0) {
      const sorted = [...trackedLifts];
      if (prSort === 'recent')   return sorted.sort((a, b) => (b.lastDate ?? '') > (a.lastDate ?? '') ? 1 : -1);
      if (prSort === 'heaviest') return sorted.sort((a, b) => b.bestE1rm - a.bestE1rm);
      return sorted.sort((a, b) => a.exercise.localeCompare(b.exercise));
    }
    return sortedPRs;
  }, [trackedLifts, sortedPRs, prSort]);

  // Header subtitle
  const headerSub = useMemo(() => {
    const week = profile?.currentWeek ?? 1;
    const phase = getPhaseLabel(week, yearPlan);
    return `Week ${week} · Block ${blockInfo.blockNum}${phase ? ` · ${phase}` : ''}`;
  }, [profile, blockInfo, yearPlan]);

  if (loading) {
    return (
      <View style={s.loadWrap}>
        <ActivityIndicator color={GOLD} size="large" />
        <Text style={s.loadText}>Analyzing your progress…</Text>
      </View>
    );
  }

  // ── Shared chart sections ───────────────────────────────────────────────────
  const StrengthTrendSection = ({ compact }: { compact?: boolean }) => (
    <View style={[s.card, !compact && { marginBottom: SPACING.md }]}>
      <SectionLbl
        title="Strength Trend"
        right={
          <InlinePills
            options={PRIMARY_LIFTS.map(l => l.exercise)}
            value={selectedLift}
            onSelect={loadLift}
            labels={Object.fromEntries(PRIMARY_LIFTS.map(l => [l.exercise, l.label]))}
          />
        }
      />
      {compact ? null : (
        <View style={s.e1rmHeader}>
          <View>
            <Text style={s.e1rmVal}>{currentE1RM ?? '—'} <Text style={s.e1rmUnit}>{profile?.units || 'lbs'} est. max</Text></Text>
          </View>
          {e1rmChange !== null && (
            <View style={[s.changePill, { backgroundColor: e1rmChange >= 0 ? TEAL + '20' : RED + '20' }]}>
              <MaterialCommunityIcons name={e1rmChange >= 0 ? 'arrow-up' : 'arrow-down'} size={12} color={e1rmChange >= 0 ? TEAL : RED} />
              <Text style={[s.changeTxt, { color: e1rmChange >= 0 ? TEAL : RED }]}>{Math.abs(e1rmChange).toFixed(0)} lbs</Text>
            </View>
          )}
        </View>
      )}
      {liftLoading
        ? <View style={{ height: 140, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={GOLD} /></View>
        : <LineChart data={liftChartData} color={GOLD} height={compact ? 120 : 160} />
      }
    </View>
  );

  const VolumeTrendSection = ({ compact }: { compact?: boolean }) => (
    <View style={[s.card, !compact && { marginBottom: SPACING.md }]}>
      <SectionLbl
        title="Weekly Volume"
        right={
          <InlinePills
            options={['sets', 'tonnage']}
            value={volumeMode}
            onSelect={setVolumeMode}
            labels={{ sets: 'Sets', tonnage: 'Tonnage' }}
          />
        }
      />
      <BarChart
        data={volumeData.map(d => ({ week: d.week, value: volumeMode === 'sets' ? d.sets : d.tonnage, isCurrent: d.isCurrent }))}
        color={GOLD}
      />
    </View>
  );

  const BlockProgressSection = ({ compact }: { compact?: boolean }) => (
    <View style={s.card}>
      {!compact && <SectionHeader icon="flag-checkered" title="Block Progress" subtitle={`BLOCK ${blockInfo.blockNum} OF 13`} />}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={s.blkLabel}>Block {blockInfo.blockNum}</Text>
        <Text style={[s.blkLabel, { color: GOLD, fontWeight: '700' }]}>{Math.round(blockInfo.progress * 100)}% complete</Text>
      </View>
      <View style={s.blkBarTrack}>
        <View style={[s.blkBarFill, { width: `${Math.min(100, blockInfo.progress * 100)}%` }]} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 }}>
        <Text style={s.blkBarLabel}>Wk {blockInfo.blockStart}</Text>
        <Text style={[s.blkBarLabel, { color: TEAL }]}>{blockInfo.blockLen - blockInfo.weekInBlk} wks to recovery</Text>
        <Text style={s.blkBarLabel}>Wk {blockInfo.blockEnd}</Text>
      </View>
      {!compact && (
        <View style={s.milestone}>
          <MaterialCommunityIcons name="flag" size={15} color={GOLD} />
          <Text style={s.milestoneTxt}>{blockInfo.blockLen - blockInfo.weekInBlk} week{blockInfo.blockLen - blockInfo.weekInBlk !== 1 ? 's' : ''} until recovery week</Text>
        </View>
      )}
    </View>
  );

  // ── OVERVIEW TAB ──────────────────────────────────────────────────────────
  const OverviewTab = () => (
    <>
      {/* Quick stats */}
      <Animated.View style={[{ marginHorizontal: SPACING.lg, marginBottom: SPACING.md }, fade(2)]}>
        <View style={s.quickStats}>
          <View style={[s.statPill, { borderColor: GOLD + '40' }]}>
            <Text style={s.statPillLbl}>PRs THIS BLOCK</Text>
            <Text style={[s.statPillVal, { color: GOLD }]}>{overview?.prsThisBlock ?? '—'}</Text>
          </View>
          <View style={s.statPill}>
            <Text style={s.statPillLbl}>AVG EFFORT</Text>
            <Text style={s.statPillVal}>{overview?.avgRPE ?? '—'}</Text>
          </View>
          <View style={[s.statPill, { borderColor: (overallCompliance >= 80 ? TEAL : overallCompliance >= 60 ? AMBER : RED) + '40' }]}>
            <Text style={s.statPillLbl}>COMPLIANCE</Text>
            <Text style={[s.statPillVal, { color: overallCompliance >= 80 ? TEAL : overallCompliance >= 60 ? AMBER : RED }]}>
              {overallCompliance > 0 ? `${overallCompliance}%` : '—'}
            </Text>
          </View>
        </View>
      </Animated.View>

      {/* Est. Maxes */}
      <Animated.View style={[{ marginHorizontal: SPACING.lg, marginBottom: SPACING.md }, fade(3)]}>
        <SectionLbl title="Est. Maxes" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {estMaxCards.map(({ key, pr }) => {
            const isRecent = isRecentPR(pr?.lastDate);
            return (
              <View key={key} style={[s.maxCard, isRecent && { borderColor: GOLD + '60' }]}>
                <Text style={s.maxCardLbl}>{key}</Text>
                {isRecent && <View style={s.prBadge}><Text style={s.prBadgeTxt}>PR</Text></View>}
                <Text style={[s.maxCardVal, { color: isRecent ? GOLD : COLORS.text.primary }]}>
                  {pr?.bestE1rm > 0 ? pr.bestE1rm : '—'}
                </Text>
                {pr?.exercise && <Text style={s.maxCardEx} numberOfLines={1}>{pr.exercise}</Text>}
                {pr?.lastDate
                  ? <Text style={[s.maxCardTrend, { color: TEAL }]}>↑ {fmtDate(pr.lastDate)}</Text>
                  : <Text style={[s.maxCardTrend, { color: '#555' }]}>— No data</Text>
                }
              </View>
            );
          })}
        </View>
      </Animated.View>

      {/* Strength trend (compact) */}
      <Animated.View style={[{ marginHorizontal: SPACING.lg, marginBottom: SPACING.md }, fade(4)]}>
        <StrengthTrendSection compact />
      </Animated.View>

      {/* Volume (compact) */}
      <Animated.View style={[{ marginHorizontal: SPACING.lg, marginBottom: SPACING.md }, fade(5)]}>
        <VolumeTrendSection compact />
      </Animated.View>

      {/* Health & Body (2 compact side-by-side cards) */}
      <Animated.View style={[{ marginHorizontal: SPACING.lg, marginBottom: SPACING.md }, fade(6)]}>
        <SectionLbl title="Health & Body" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {/* Bodyweight card */}
          <View style={[s.card, { flex: 1 }]}>
            <Text style={s.compactLbl}>BODYWEIGHT</Text>
            <Text style={s.compactBig}>{currentBW ?? '—'}</Text>
            <Text style={s.compactUnit}>{profile?.units || 'lbs'}</Text>
            {bwChartData.length >= 2 && (() => {
              const delta = bwChartData[bwChartData.length - 1].y - bwChartData[0].y;
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 }}>
                  <MaterialCommunityIcons name={delta >= 0 ? 'arrow-up' : 'arrow-down'} size={11} color={delta === 0 ? '#888' : delta > 0 ? AMBER : TEAL} />
                  <Text style={[s.compactTrend, { color: delta === 0 ? '#888' : delta > 0 ? AMBER : TEAL }]}>{Math.abs(delta).toFixed(1)} {bwRange}d</Text>
                </View>
              );
            })()}
          </View>
          {/* Pain status card */}
          <View style={[s.card, { flex: 1 }]}>
            <Text style={s.compactLbl}>PAIN STATUS</Text>
            {!painData?.hasPain ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }}>
                  <MaterialCommunityIcons name="shield-check" size={20} color={TEAL} />
                  <Text style={[s.compactBig, { color: TEAL, fontSize: 18 }]}>Clear</Text>
                </View>
                <Text style={s.compactTrend}>No patterns detected</Text>
              </>
            ) : (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }}>
                  <MaterialCommunityIcons name={trendColor === TEAL ? 'trending-down' : trendColor === RED ? 'trending-up' : 'trending-neutral'} size={18} color={trendColor} />
                  <Text style={[s.compactBig, { color: trendColor, fontSize: 18 }]}>
                    {trendColor === TEAL ? 'Improving' : trendColor === RED ? 'Worsening' : 'Stable'}
                  </Text>
                </View>
                {painData?.locations?.[0]?.exercise && <Text style={s.compactTrend} numberOfLines={1}>{painData.locations[0].exercise} flagged</Text>}
              </>
            )}
          </View>
        </View>
      </Animated.View>

      {/* Block progress (compact) */}
      <Animated.View style={[{ marginHorizontal: SPACING.lg, marginBottom: SPACING.md }, fade(7)]}>
        <SectionLbl title="Block Progress" />
        <BlockProgressSection compact />
      </Animated.View>

      {/* Compliance (compact) */}
      <Animated.View style={[{ marginHorizontal: SPACING.lg, marginBottom: SPACING.md }, fade(8)]}>
        <SectionLbl title="Compliance" />
        <View style={[s.card, { flexDirection: 'row', alignItems: 'flex-start', gap: 16 }]}>
          <CircularProgress size={64} progress={overallCompliance / 100} color={overallCompliance >= 80 ? TEAL : overallCompliance >= 60 ? AMBER : RED} />
          <View style={{ flex: 1, gap: 8 }}>
            {compliance.length === 0 ? (
              <Text style={{ color: COLORS.text.muted, fontSize: 12 }}>Log sessions to see breakdown</Text>
            ) : compliance.slice(0, 4).map((item: any, i: number) => {
              const clr = item.rate >= 80 ? TEAL : item.rate >= 60 ? AMBER : RED;
              return (
                <View key={i}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                    <Text style={s.compLbl}>{mapSessionLabel(item.sessionType)}</Text>
                    <Text style={[s.compRate, { color: clr }]}>{item.rate}%</Text>
                  </View>
                  <View style={s.compBar}><View style={[s.compFill, { width: `${item.rate}%`, backgroundColor: clr }]} /></View>
                </View>
              );
            })}
          </View>
        </View>
      </Animated.View>

      {/* Achievements & Gamification */}
      <Animated.View style={[{ marginHorizontal: SPACING.lg, marginBottom: SPACING.md }, fade(9)]}>
        <SectionLbl
          title="Achievements"
          right={
            <TouchableOpacity onPress={() => router.push('/achievements' as any)} activeOpacity={0.7}>
              <Text style={{ fontSize: 11, color: GOLD, fontWeight: '700' }}>View all →</Text>
            </TouchableOpacity>
          }
        />
        <View style={s.card}>
          {/* Streak + Badge + Quest quick stats */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 }}>
            {/* Streak */}
            <View style={{ alignItems: 'center', gap: 3, minWidth: 66 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <MaterialCommunityIcons name="fire" size={15} color="#FF6B35" />
                <Text style={{ fontSize: 22, fontWeight: '900', color: '#FF6B35' }}>{streak?.currentStreak ?? 0}</Text>
              </View>
              <Text style={{ fontSize: 9, color: '#555', fontWeight: '700', letterSpacing: 0.8 }}>WK STREAK</Text>
            </View>
            {/* Divider */}
            <View style={{ width: 1, backgroundColor: BORDER, marginHorizontal: 10, alignSelf: 'stretch' }} />
            {/* Badges */}
            <View style={{ alignItems: 'center', gap: 3, minWidth: 60 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <MaterialCommunityIcons name="trophy-outline" size={14} color={GOLD} />
                <Text style={{ fontSize: 22, fontWeight: '900', color: GOLD }}>{badges?.totalEarned ?? 0}</Text>
              </View>
              <Text style={{ fontSize: 9, color: '#555', fontWeight: '700', letterSpacing: 0.8 }}>BADGES</Text>
            </View>
            {/* Divider */}
            <View style={{ width: 1, backgroundColor: BORDER, marginHorizontal: 10, alignSelf: 'stretch' }} />
            {/* Quest */}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 9, color: '#555', fontWeight: '700', letterSpacing: 0.8, marginBottom: 4 }}>WEEKLY QUEST</Text>
              {quest ? (
                <>
                  <Text style={{ fontSize: 11, color: COLORS.text.secondary, marginBottom: 5 }} numberOfLines={1}>
                    {quest.title}
                  </Text>
                  <View style={{ height: 5, backgroundColor: '#1A1A1E', borderRadius: 3, overflow: 'hidden' }}>
                    <View style={{
                      width: `${Math.min(100, ((quest.progress?.current ?? 0) / Math.max(quest.progress?.target ?? 1, 1)) * 100)}%` as any,
                      height: '100%', backgroundColor: GOLD, borderRadius: 3,
                    }} />
                  </View>
                  <Text style={{ fontSize: 10, color: GOLD, marginTop: 3, fontWeight: '600' }}>
                    {quest.progress?.current ?? 0}/{quest.progress?.target ?? 1}
                  </Text>
                </>
              ) : (
                <Text style={{ fontSize: 11, color: '#555' }}>No active quest</Text>
              )}
            </View>
          </View>
          {/* Navigation buttons */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: GOLD + '15', borderRadius: 8, borderWidth: 1, borderColor: GOLD + '40', paddingVertical: 10 }}
              onPress={() => router.push('/achievements' as any)}
              activeOpacity={0.75}
            >
              <MaterialCommunityIcons name="star-circle-outline" size={14} color={GOLD} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: GOLD }}>Achievements</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: CARD, borderRadius: 8, borderWidth: 1, borderColor: BORDER, paddingVertical: 10 }}
              onPress={() => router.push('/leaderboard' as any)}
              activeOpacity={0.75}
            >
              <MaterialCommunityIcons name="podium-gold" size={14} color={COLORS.text.secondary} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.text.secondary }}>Leaderboard</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </>
  );

  // ── STRENGTH TAB ─────────────────────────────────────────────────────────────
  const StrengthTab = () => (
    <>
      {/* PR Board */}
      <Animated.View style={[s.section, fade(2)]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm }}>
          <SectionHeader icon="trophy-outline" title="Personal Records" subtitle="ALL-TIME BESTS" />
          <TouchableOpacity
            style={s.manageLiftBtn}
            onPress={() => router.push('/manage-lifts')}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="dumbbell" size={13} color={GOLD} />
            <Text style={s.manageLiftBtnTxt}>Manage lifts</Text>
          </TouchableOpacity>
        </View>
        <View style={s.sortRow}>
          {([['recent', 'Most Recent'], ['heaviest', 'Heaviest'], ['exercise', 'A–Z']] as const).map(([k, label]) => (
            <TouchableOpacity key={k} style={[s.sortPill, prSort === k && s.sortPillOn]} onPress={() => setPrSort(k)}>
              <Text style={[s.sortPillTxt, prSort === k && s.sortPillTxtOn]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {prBoardLifts.length === 0 ? (
          <View style={s.empty}><MaterialCommunityIcons name="dumbbell" size={30} color={COLORS.text.muted} /><Text style={s.emptyTxt}>Start logging to build your PR board</Text></View>
        ) : prBoardLifts.map((pr, i) => (
          <View key={pr.exercise || pr.id || i} style={[s.prRow, i > 0 && s.prRowBorder]}>
            <View style={s.prLeft}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                {pr.isFeatured && <MaterialCommunityIcons name="star" size={12} color={GOLD} />}
                <Text style={s.prName} numberOfLines={1}>{pr.exercise}</Text>
              </View>
              <Text style={s.prDate}>{pr.lastDate ? fmtDate(pr.lastDate) : '—'}</Text>
            </View>
            <View style={s.prRight}>
              {isRecentPR(pr.lastDate) && <View style={s.newBadge}><Text style={s.newBadgeTxt}>NEW PR</Text></View>}
              <Text style={s.prVal}>{pr.bestWeight > 0 ? `${pr.bestWeight} × ${pr.bestReps}` : '—'}</Text>
              {pr.bestE1rm > 0 && <Text style={s.prE1rm}>Est. Max: {pr.bestE1rm}</Text>}
            </View>
          </View>
        ))}
      </Animated.View>

      {/* Full Strength Trend */}
      <Animated.View style={[s.section, fade(3)]}>
        <SectionHeader icon="chart-line" title="Strength Trends" subtitle="ESTIMATED MAX OVER TIME" />
        <View style={s.e1rmHeader}>
          <Text style={s.e1rmVal}>{currentE1RM ?? '—'} <Text style={s.e1rmUnit}>{profile?.units || 'lbs'} est. max</Text></Text>
          {e1rmChange !== null && (
            <View style={[s.changePill, { backgroundColor: e1rmChange >= 0 ? TEAL + '20' : RED + '20' }]}>
              <MaterialCommunityIcons name={e1rmChange >= 0 ? 'arrow-up' : 'arrow-down'} size={12} color={e1rmChange >= 0 ? TEAL : RED} />
              <Text style={[s.changeTxt, { color: e1rmChange >= 0 ? TEAL : RED }]}>{Math.abs(e1rmChange).toFixed(0)} lbs</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: SPACING.md }}>
          {PRIMARY_LIFTS.map(lift => (
            <TouchableOpacity key={lift.exercise} style={[s.liftPill, selectedLift === lift.exercise && s.liftPillOn]} onPress={() => loadLift(lift.exercise)}>
              <Text style={[s.liftPillTxt, selectedLift === lift.exercise && s.liftPillTxtOn]}>{lift.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {liftLoading
          ? <View style={{ height: 160, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={GOLD} /></View>
          : <LineChart data={liftChartData} color={GOLD} height={160} />
        }
      </Animated.View>

      {/* Full Volume */}
      <Animated.View style={[s.section, s.lastSection, fade(4)]}>
        <SectionHeader icon="chart-bar" title="Training Volume" subtitle="LAST 8 WEEKS" />
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: SPACING.md }}>
          {['sets', 'tonnage'].map(opt => (
            <TouchableOpacity key={opt} style={[s.liftPill, volumeMode === opt && s.liftPillOn]} onPress={() => setVolumeMode(opt)}>
              <Text style={[s.liftPillTxt, volumeMode === opt && s.liftPillTxtOn]}>{opt === 'sets' ? 'Total Sets' : 'Tonnage (lbs)'}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <BarChart data={volumeData.map(d => ({ week: d.week, value: volumeMode === 'sets' ? d.sets : d.tonnage, isCurrent: d.isCurrent }))} color={GOLD} />
      </Animated.View>
    </>
  );

  // ── BODY TAB ─────────────────────────────────────────────────────────────────
  const BodyTab = () => (
    <>
      <Animated.View style={[s.section, fade(2)]}>
        <SectionHeader icon="scale-bathroom" title="Bodyweight" subtitle="WEIGHT TREND" />
        <View style={s.bwStatRow}>
          <View>
            <Text style={s.bwStatLabel}>Current</Text>
            <Text style={s.bwStatVal}>{currentBW ?? '—'} <Text style={s.bwUnit}>{profile?.units || 'lbs'}</Text></Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.bwStatLabel}>12-Wk Goal</Text>
            <Text style={[s.bwStatVal, { color: TEAL }]}>{profile?.bw12WeekGoal ?? '—'} <Text style={s.bwUnit}>{profile?.units || 'lbs'}</Text></Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: SPACING.md }}>
          {['30', '60', '90'].map(r => (
            <TouchableOpacity key={r} style={[s.liftPill, bwRange === r && s.liftPillOn]} onPress={() => setBwRange(r)}>
              <Text style={[s.liftPillTxt, bwRange === r && s.liftPillTxtOn]}>{r} Days</Text>
            </TouchableOpacity>
          ))}
        </View>
        <LineChart data={bwChartData} color={TEAL} height={140} />
      </Animated.View>

      <Animated.View style={[s.section, s.lastSection, fade(3)]}>
        <SectionHeader icon="medical-bag" title="Pain & Discomfort" subtitle="HEALTH MONITORING" />
        {!painData?.hasPain ? (
          <View style={s.cleanWrap}>
            <MaterialCommunityIcons name="shield-check" size={30} color={TEAL} />
            <Text style={[s.emptyTxt, { color: TEAL }]}>No significant pain patterns</Text>
            <Text style={s.cleanSub}>Your body is handling the training load well</Text>
          </View>
        ) : (
          <>
            <View style={[s.trendBadge, { backgroundColor: trendColor + '1A', borderColor: trendColor + '60' }]}>
              <MaterialCommunityIcons name={painData.trend === 'decreasing' ? 'trending-down' : painData.trend === 'increasing' ? 'trending-up' : 'trending-neutral'} size={15} color={trendColor} />
              <Text style={[s.trendTxt, { color: trendColor }]}>
                {painData.trend === 'decreasing' ? 'Improving — pain trending down' : painData.trend === 'increasing' ? 'Worsening — monitor closely' : 'Stable — no significant change'}
              </Text>
            </View>
            <MiniPainBars data={painData.weeklyData} color={trendColor} />
            <Text style={s.locHeader}>MOST AFFECTED EXERCISES</Text>
            {painData.locations.map((loc: any, i: number) => (
              <View key={i} style={s.locRow}>
                <Text style={s.locName} numberOfLines={1}>{loc.exercise}</Text>
                <View style={[s.locBadge, { backgroundColor: trendColor + '22' }]}>
                  <Text style={[s.locCount, { color: trendColor }]}>{loc.count}×</Text>
                </View>
              </View>
            ))}
          </>
        )}
      </Animated.View>
    </>
  );

  // ── PROGRAM TAB ───────────────────────────────────────────────────────────────
  const ProgramTab = () => (
    <>
      <Animated.View style={[s.section, fade(2)]}>
        <SectionHeader icon="flag-checkered" title="Block Progress" subtitle={`BLOCK ${blockInfo.blockNum} OF 13`} />
        <View style={s.blkStatRow}>
          <View>
            <Text style={s.blkStatLabel}>Current Week</Text>
            <Text style={s.blkStatVal}>Week {profile?.currentWeek ?? 1}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.blkStatLabel}>Week in Block</Text>
            <Text style={s.blkStatVal}>{blockInfo.weekInBlk} / {blockInfo.blockLen}</Text>
          </View>
        </View>
        <View style={s.blkBarTrack}><View style={[s.blkBarFill, { width: `${Math.min(100, blockInfo.progress * 100)}%` }]} /></View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 }}>
          <Text style={s.blkBarLabel}>Wk {blockInfo.blockStart}</Text>
          <Text style={[s.blkBarLabel, { color: GOLD, fontWeight: FONTS.weights.bold }]}>{Math.round(blockInfo.progress * 100)}% complete</Text>
          <Text style={s.blkBarLabel}>Recovery Wk {blockInfo.blockEnd}</Text>
        </View>
        <View style={s.milestone}>
          <MaterialCommunityIcons name="flag" size={15} color={GOLD} />
          <Text style={s.milestoneTxt}>{blockInfo.blockLen - blockInfo.weekInBlk} week{blockInfo.blockLen - blockInfo.weekInBlk !== 1 ? 's' : ''} until recovery week</Text>
        </View>
      </Animated.View>

      {yearPlan?.phases && yearPlan.phases.length > 0 && (
        <Animated.View style={[s.section, s.lastSection, fade(3)]}>
          <View style={s.sectionHeaderRow}>
            <MaterialCommunityIcons name="map-marker-path" size={17} color={GOLD} />
            <Text style={s.sectionTitle}>52-WEEK PROGRAM</Text>
            <View style={s.planNameBadge}>
              <Text style={s.planNameBadgeTxt} numberOfLines={1}>{yearPlan.planName || 'Your Plan'}</Text>
            </View>
          </View>
          {yearPlan.phases.map((phase: any, idx: number) => {
            const hasDeload = (phase.blocks || []).some((b: any) => (b.weeks || []).some((w: any) => w.isDeload));
            const hasTesting = (phase.blocks || []).some((b: any) => (b.weeks || []).some((w: any) => w.isTest));
            const keyEx: string[] = [];
            for (const b of (phase.blocks || [])) for (const ex of (b.keyExercises || [])) if (!keyEx.includes(ex) && keyEx.length < 3) keyEx.push(ex);
            return (
              <View key={phase.phaseId || idx} style={[s.yearPhaseRow, idx > 0 && s.yearPhaseRowBorder]}>
                <View style={s.yearPhaseLeft}>
                  <View style={s.yearPhaseNumCircle}><Text style={s.yearPhaseNum}>{phase.phaseNumber || idx + 1}</Text></View>
                </View>
                <View style={s.yearPhaseBody}>
                  <View style={s.yearPhaseTopRow}>
                    <Text style={s.yearPhaseName}>{phase.phaseName}</Text>
                    <Text style={s.yearPhaseWeeks}>W{phase.startWeek}–{phase.endWeek}</Text>
                  </View>
                  {phase.goal ? <Text style={s.yearPhaseGoal} numberOfLines={2}>{phase.goal}</Text> : null}
                  {keyEx.length > 0 && (
                    <View style={s.yearPhaseTagsRow}>
                      {keyEx.map((ex: string) => (
                        <View key={ex} style={s.yearPhaseTag}><Text style={s.yearPhaseTagTxt}>{ex}</Text></View>
                      ))}
                      {hasDeload && <View style={[s.yearPhaseTag, s.yearPhaseTagDeload]}><MaterialCommunityIcons name="weather-night" size={10} color="#6AACFF" /><Text style={[s.yearPhaseTagTxt, { color: '#6AACFF' }]}>Recovery</Text></View>}
                      {hasTesting && <View style={[s.yearPhaseTag, s.yearPhaseTagTest]}><MaterialCommunityIcons name="target" size={10} color="#E8C96A" /><Text style={[s.yearPhaseTagTxt, { color: '#E8C96A' }]}>Test</Text></View>}
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </Animated.View>
      )}
    </>
  );

  // ── RENDER ────────────────────────────────────────────────────────────────────
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <Animated.View style={[s.header, fade(0)]}>
        <View>
          <Text style={s.title}>Progress</Text>
          <Text style={s.subtitle}>{headerSub}</Text>
        </View>
      </Animated.View>

      {/* Segment control */}
      <Animated.View style={fade(1)}>
        <SegmentControl value={activeTab} onChange={setActiveTab} />
      </Animated.View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.accent}
            colors={[COLORS.accent]}
          />
        }
      >
        {activeTab === 'overview'  && <OverviewTab />}
        {activeTab === 'strength'  && <StrengthTab />}
        {activeTab === 'body'      && <BodyTab />}
        {activeTab === 'program'   && <ProgramTab />}
      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: BG },
  scroll:  { paddingTop: 4 },
  loadWrap:{ flex: 1, backgroundColor: BG, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadText:{ color: COLORS.text.muted, fontSize: FONTS.sizes.sm },

  header:   { paddingHorizontal: SPACING.lg, paddingTop: 12, paddingBottom: 10 },
  title:    { fontSize: 18, fontWeight: FONTS.weights.bold, color: COLORS.text.primary, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: COLORS.text.muted, marginTop: 2 },

  // Quick stats
  quickStats:   { flexDirection: 'row', gap: 8 },
  statPill:     { flex: 1, backgroundColor: CARD, borderRadius: 10, padding: 10, alignItems: 'center', gap: 3, borderWidth: 1, borderColor: BORDER },
  statPillLbl:  { fontSize: 9, fontWeight: '700', color: '#555', letterSpacing: 0.5, textTransform: 'uppercase' },
  statPillVal:  { fontSize: 20, fontWeight: '900', color: COLORS.text.primary },

  // Est. Maxes
  maxCard:       { flex: 1, backgroundColor: CARD, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: BORDER, gap: 2 },
  maxCardLbl:    { fontSize: 9, fontWeight: '700', color: '#555', letterSpacing: 0.5 },
  maxCardVal:    { fontSize: 22, fontWeight: '900', color: COLORS.text.primary, marginTop: 2 },
  maxCardEx:     { fontSize: 10, color: COLORS.text.muted },
  maxCardTrend:  { fontSize: 10, fontWeight: '600' },
  prBadge:       { position: 'absolute', top: 8, right: 8, backgroundColor: GOLD + '20', borderWidth: 1, borderColor: GOLD, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  prBadgeTxt:    { fontSize: 8, fontWeight: '900', color: GOLD, letterSpacing: 0.5 },

  // Generic card
  card: { backgroundColor: CARD, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: BORDER },

  // Section (full-width sections in Strength/Body/Program tabs)
  section:     { marginHorizontal: SPACING.lg, marginTop: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border },
  lastSection: { marginBottom: SPACING.xxl },

  // Compact body cards
  compactLbl:   { fontSize: 9, fontWeight: '700', color: '#555', letterSpacing: 0.5, textTransform: 'uppercase' },
  compactBig:   { fontSize: 26, fontWeight: '900', color: COLORS.text.primary, marginTop: 4 },
  compactUnit:  { fontSize: 12, color: COLORS.text.muted, marginTop: -2 },
  compactTrend: { fontSize: 10, color: COLORS.text.muted, marginTop: 2 },

  // E1RM header
  e1rmHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  e1rmVal:     { fontSize: 28, fontWeight: '900', color: GOLD },
  e1rmUnit:    { fontSize: 14, color: COLORS.text.muted, fontWeight: '400' },
  changePill:  { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 4 },
  changeTxt:   { fontSize: 11, fontWeight: '700' },

  // Lift selector pills
  liftPill:      { paddingVertical: 6, paddingHorizontal: 14, borderRadius: RADIUS.full, borderWidth: 1, borderColor: BORDER },
  liftPillOn:    { backgroundColor: GOLD, borderColor: GOLD },
  liftPillTxt:   { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.bold, color: COLORS.text.muted },
  liftPillTxtOn: { color: '#000' },

  // Block Progress
  blkLabel:    { fontSize: 12, color: COLORS.text.secondary, fontWeight: '600' },
  blkStatRow:  { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: COLORS.background, borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md },
  blkStatLabel:{ fontSize: 10, color: COLORS.text.muted, letterSpacing: 0.5, marginBottom: 2 },
  blkStatVal:  { fontSize: 20, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  blkBarTrack: { height: 6, backgroundColor: COLORS.border, borderRadius: RADIUS.full, overflow: 'hidden' },
  blkBarFill:  { height: '100%', backgroundColor: GOLD, borderRadius: RADIUS.full },
  blkBarLabel: { fontSize: 10, color: COLORS.text.muted },
  milestone:   { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: GOLD + '14', borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: GOLD + '40', marginTop: SPACING.md },
  milestoneTxt:{ fontSize: FONTS.sizes.sm, color: GOLD, fontWeight: FONTS.weights.semibold },

  // Compliance
  compLbl:   { fontSize: FONTS.sizes.xs, color: COLORS.text.secondary },
  compRate:  { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold },
  compBar:   { height: 5, backgroundColor: COLORS.border, borderRadius: RADIUS.full, overflow: 'hidden' },
  compFill:  { height: '100%', borderRadius: RADIUS.full },

  // PR Board
  sortRow:          { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md, flexWrap: 'wrap' },
  manageLiftBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#C9A84C20', borderRadius: RADIUS.lg, paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: '#C9A84C40' },
  manageLiftBtnTxt: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, color: '#C9A84C', letterSpacing: 0.3 },
  sortPill:      { paddingVertical: 5, paddingHorizontal: 11, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border },
  sortPillOn:    { backgroundColor: GOLD, borderColor: GOLD },
  sortPillTxt:   { fontSize: 11, fontWeight: FONTS.weights.bold, color: COLORS.text.muted },
  sortPillTxtOn: { color: '#000' },
  prRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 11 },
  prRowBorder:   { borderTopWidth: 1, borderTopColor: COLORS.border },
  prLeft:        { flex: 1, gap: 3, paddingRight: SPACING.sm },
  prRight:       { alignItems: 'flex-end', gap: 4 },
  prName:        { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold, color: COLORS.text.primary },
  prDate:        { fontSize: FONTS.sizes.xs, color: COLORS.text.muted },
  prVal:         { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold, color: COLORS.text.primary },
  prE1rm:        { fontSize: FONTS.sizes.xs, color: GOLD, fontWeight: FONTS.weights.medium },
  newBadge:      { backgroundColor: GOLD + '20', borderWidth: 1, borderColor: GOLD, borderRadius: RADIUS.full, paddingHorizontal: 6, paddingVertical: 2 },
  newBadgeTxt:   { fontSize: 9, fontWeight: FONTS.weights.heavy, color: GOLD, letterSpacing: 0.8 },

  // Bodyweight (full view)
  bwStatRow:   { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: COLORS.background, borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md },
  bwStatLabel: { fontSize: 10, color: COLORS.text.muted, letterSpacing: 0.5, marginBottom: 2 },
  bwStatVal:   { fontSize: 26, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, lineHeight: 30 },
  bwUnit:      { fontSize: 13, fontWeight: FONTS.weights.regular, color: COLORS.text.muted },

  // Pain
  trendBadge:  { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.sm, marginBottom: SPACING.md },
  trendTxt:    { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold },
  locHeader:   { fontSize: 10, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 1.5, marginTop: SPACING.md, marginBottom: SPACING.sm },
  locRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  locName:     { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, paddingRight: SPACING.sm },
  locBadge:    { borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 },
  locCount:    { fontSize: 11, fontWeight: FONTS.weights.bold },

  // Empty state
  empty:    { alignItems: 'center', paddingVertical: SPACING.xl, gap: SPACING.sm },
  emptyTxt: { color: COLORS.text.muted, fontSize: FONTS.sizes.sm, textAlign: 'center' },
  cleanWrap:{ alignItems: 'center', paddingVertical: SPACING.lg, gap: 6 },
  cleanSub: { color: COLORS.text.muted, fontSize: FONTS.sizes.xs, textAlign: 'center', lineHeight: 18, maxWidth: 260 },

  // 52-week program
  sectionHeaderRow:  { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  sectionTitle:      { fontSize: 11, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 1.5, flex: 1 },
  planNameBadge:     { backgroundColor: GOLD + '18', borderWidth: 1, borderColor: GOLD + '30', borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3, maxWidth: 160 },
  planNameBadgeTxt:  { fontSize: 10, color: GOLD, fontWeight: FONTS.weights.semibold },
  yearPhaseRow:      { flexDirection: 'row', gap: SPACING.md, paddingVertical: SPACING.md },
  yearPhaseRowBorder:{ borderTopWidth: 1, borderTopColor: COLORS.border },
  yearPhaseLeft:     { alignItems: 'center', width: 26 },
  yearPhaseNumCircle:{ width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.surfaceHighlight, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  yearPhaseNum:      { fontSize: 11, fontWeight: FONTS.weights.heavy, color: COLORS.text.secondary },
  yearPhaseBody:     { flex: 1, gap: 4 },
  yearPhaseTopRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  yearPhaseName:     { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold, color: COLORS.text.primary, flex: 1, paddingRight: SPACING.sm },
  yearPhaseWeeks:    { fontSize: 11, color: COLORS.text.muted, fontWeight: FONTS.weights.bold },
  yearPhaseGoal:     { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, lineHeight: 17 },
  yearPhaseTagsRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 4 },
  yearPhaseTag:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 7, paddingVertical: 3 },
  yearPhaseTagDeload:{ borderColor: '#6AACFF30', backgroundColor: '#6AACFF10' },
  yearPhaseTagTest:  { borderColor: '#E8C96A30', backgroundColor: '#E8C96A10' },
  yearPhaseTagTxt:   { fontSize: 10, color: COLORS.text.muted, fontWeight: FONTS.weights.medium },
});

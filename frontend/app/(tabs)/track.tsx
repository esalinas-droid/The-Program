import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, ActivityIndicator, Animated, useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle, Path, Rect, Line, G, Text as SvgText } from 'react-native-svg';
import { COLORS, SPACING, FONTS, RADIUS } from '../../src/constants/theme';
import { prApi, bwApi, analyticsApi, profileApi } from '../../src/utils/api';

// ── Constants ─────────────────────────────────────────────────────────────────
const TEAL  = '#4DCEA6';
const RED   = '#E54D4D';
const AMBER = '#F5A623';

const PRIMARY_LIFTS = [
  { label: 'Squat', exercise: 'Back Squat' },
  { label: 'Bench', exercise: 'Bench Press' },
  { label: 'DL',    exercise: 'Conventional Deadlift' },
  { label: 'OHP',   exercise: 'Overhead Press (Barbell)' },
];

const DELOAD_WEEKS = [4, 8, 12, 20, 24, 28, 32, 36, 40, 44, 48, 52];
const SECTION_COUNT = 9;

// ── Helpers ───────────────────────────────────────────────────────────────────
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

// ── Chart: LineChart ──────────────────────────────────────────────────────────
function LineChart({ data, color = COLORS.accent, height = 160 }: {
  data: { y: number; label: string }[];
  color?: string;
  height?: number;
}) {
  const { width } = useWindowDimensions();
  const CHART_W = Math.max(100, width - SPACING.lg * 4);

  if (!data || data.length < 2) {
    return (
      <View style={{ height, justifyContent: 'center', alignItems: 'center' }}>
        <MaterialCommunityIcons name="chart-line-variant" size={28} color={COLORS.text.muted} />
        <Text style={{ color: COLORS.text.muted, fontSize: FONTS.sizes.sm, marginTop: 6 }}>
          Log more sessions to see your trend
        </Text>
      </View>
    );
  }

  const PAD_L = 42, PAD_R = 10, PAD_T = 14, PAD_B = 28;
  const cW = CHART_W - PAD_L - PAD_R;
  const cH = height - PAD_T - PAD_B;

  const vals   = data.map(d => d.y);
  const minY   = Math.min(...vals);
  const maxY   = Math.max(...vals);
  const rangeY = maxY - minY || 1;

  const pts = data.map((d, i) => ({
    x: PAD_L + (i / (data.length - 1)) * cW,
    y: PAD_T + cH - ((d.y - minY) / rangeY) * cH,
    label: d.label,
    val: d.y,
  }));

  const linePath  = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath  = `${linePath} L ${pts[pts.length - 1].x.toFixed(1)} ${(PAD_T + cH).toFixed(1)} L ${pts[0].x.toFixed(1)} ${(PAD_T + cH).toFixed(1)} Z`;
  const gridVals  = [minY, Math.round((minY + maxY) / 2), maxY];
  const xIdxs     = data.length <= 5
    ? data.map((_, i) => i)
    : [0, Math.floor(data.length / 4), Math.floor(data.length / 2), Math.floor(3 * data.length / 4), data.length - 1];

  const svgH = height + PAD_B;

  return (
    <Svg width={CHART_W} height={svgH}>
      {gridVals.map((v, i) => {
        const gy = PAD_T + cH - ((v - minY) / rangeY) * cH;
        return (
          <G key={i}>
            <Line x1={PAD_L} y1={gy} x2={CHART_W - PAD_R} y2={gy} stroke="#2A2A2A" strokeWidth={1} strokeDasharray="4,3" />
            <SvgText x={PAD_L - 4} y={gy + 4} fontSize={9} fill="#666" textAnchor="end">{Math.round(v)}</SvgText>
          </G>
        );
      })}
      <Path d={areaPath} fill={color + '14'} />
      <Path d={linePath} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((pt, i) => <Circle key={i} cx={pt.x} cy={pt.y} r={3.5} fill={color} />)}
      {xIdxs.map(idx => (
        <SvgText key={idx} x={pts[idx].x} y={svgH - 4} fontSize={9} fill="#666" textAnchor="middle">
          {data[idx].label}
        </SvgText>
      ))}
    </Svg>
  );
}

// ── Chart: BarChart ───────────────────────────────────────────────────────────
function BarChart({ data, color = COLORS.accent }: {
  data: { week: number; value: number; isCurrent: boolean }[];
  color?: string;
}) {
  const { width } = useWindowDimensions();
  const CHART_W = Math.max(100, width - SPACING.lg * 4);

  if (!data || data.length === 0) return (
    <View style={{ height: 120, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: COLORS.text.muted, fontSize: FONTS.sizes.sm }}>Log sessions to see volume</Text>
    </View>
  );

  const H = 130, PAD_X = 8, PAD_T = 10, PAD_B = 26;
  const cH = H - PAD_T - PAD_B;
  const cW = CHART_W - PAD_X * 2;

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const barW   = Math.max(10, (cW / data.length) * 0.65);
  const step   = cW / data.length;

  return (
    <Svg width={CHART_W} height={H}>
      {data.map((d, i) => {
        const barH = Math.max(2, (d.value / maxVal) * cH);
        const x    = PAD_X + step * i + (step - barW) / 2;
        const y    = PAD_T + cH - barH;
        return (
          <G key={i}>
            <Rect
              x={x} y={y} width={barW} height={barH}
              fill={d.isCurrent ? 'transparent' : color}
              stroke={d.isCurrent ? color : 'none'}
              strokeWidth={1.5}
              rx={3}
            />
            {d.value > 0 && (
              <SvgText x={x + barW / 2} y={y - 4} fontSize={8} fill={d.isCurrent ? color : COLORS.text.muted} textAnchor="middle">
                {d.value >= 1000 ? `${(d.value / 1000).toFixed(1)}k` : d.value}
              </SvgText>
            )}
            <SvgText x={x + barW / 2} y={H - 6} fontSize={8} fill="#666" textAnchor="middle">
              W{d.week}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// ── Chart: CircularProgress ───────────────────────────────────────────────────
function CircularProgress({ size = 130, progress = 0, color = COLORS.accent }: {
  size?: number; progress?: number; color?: string;
}) {
  const sw    = 11;
  const r     = (size - sw * 2) / 2;
  const cx    = size / 2;
  const cy    = size / 2;
  const circ  = 2 * Math.PI * r;
  const pct   = Math.min(1, Math.max(0, progress));
  const offset = circ * (1 - pct);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={r} stroke="#2A2A2A" strokeWidth={sw} fill="none" />
        <Circle
          cx={cx} cy={cy} r={r}
          stroke={color} strokeWidth={sw} fill="none"
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90, ${cx}, ${cy})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: COLORS.text.primary, fontSize: 24, fontWeight: '900', lineHeight: 28 }}>
          {Math.round(pct * 100)}%
        </Text>
        <Text style={{ color: COLORS.text.muted, fontSize: 9, letterSpacing: 1 }}>COMPLIANCE</Text>
      </View>
    </View>
  );
}

// ── Chart: MiniPainBars ───────────────────────────────────────────────────────
function MiniPainBars({ data, color }: { data: { week: number; avgPain: number }[]; color: string }) {
  const { width } = useWindowDimensions();
  const CHART_W = Math.max(100, width - SPACING.lg * 4);
  if (!data || data.length === 0) return null;
  const H = 90, PAD_X = 8, PAD_T = 8, PAD_B = 22;
  const cH = H - PAD_T - PAD_B;
  const cW = CHART_W - PAD_X * 2;
  const step = cW / data.length;
  const barW = Math.max(8, step * 0.6);

  return (
    <Svg width={CHART_W} height={H}>
      {data.map((d, i) => {
        const barH = Math.max(2, (d.avgPain / 4) * cH);
        const x    = PAD_X + step * i + (step - barW) / 2;
        const y    = PAD_T + cH - barH;
        return (
          <G key={i}>
            <Rect x={x} y={y} width={barW} height={barH} fill={color} rx={2} />
            <SvgText x={x + barW / 2} y={H - 5} fontSize={8} fill="#666" textAnchor="middle">W{d.week}</SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// ── SectionHeader ─────────────────────────────────────────────────────────────
function SectionHeader({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  return (
    <View style={hdr.wrap}>
      <View style={hdr.icon}>
        <MaterialCommunityIcons name={icon as any} size={17} color={COLORS.accent} />
      </View>
      <View>
        <Text style={hdr.title}>{title}</Text>
        {subtitle ? <Text style={hdr.sub}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}
const hdr = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  icon:  { width: 32, height: 32, borderRadius: RADIUS.md, backgroundColor: COLORS.accent + '22', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, letterSpacing: 0.5 },
  sub:   { fontSize: 10, color: COLORS.text.muted, letterSpacing: 1.5, marginTop: 1 },
});

// ── PillRow ───────────────────────────────────────────────────────────────────
function PillRow({ options, value, onSelect, labels }: {
  options: string[];
  value: string;
  onSelect: (v: string) => void;
  labels?: Record<string, string>;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.md }}>
      {options.map(opt => (
        <TouchableOpacity
          key={opt}
          style={[pill.base, value === opt && pill.active]}
          onPress={() => onSelect(opt)}
        >
          <Text style={[pill.text, value === opt && pill.textActive]}>
            {labels ? labels[opt] : opt}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
const pill = StyleSheet.create({
  base:       { paddingVertical: 6, paddingHorizontal: 14, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border },
  active:     { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  text:       { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold, color: COLORS.text.muted, letterSpacing: 0.5 },
  textActive: { color: '#000' },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function TrackScreen() {
  // Data state
  const [overview,    setOverview]    = useState<any>(null);
  const [prs,         setPrs]         = useState<any[]>([]);
  const [prSort,      setPrSort]      = useState<'recent' | 'heaviest' | 'exercise'>('recent');
  const [selectedLift,setSelectedLift]= useState('Back Squat');
  const [liftHistory, setLiftHistory] = useState<any[]>([]);
  const [liftLoading, setLiftLoading] = useState(false);
  const [volumeData,  setVolumeData]  = useState<any[]>([]);
  const [volumeMode,  setVolumeMode]  = useState('sets');
  const [bwData,      setBwData]      = useState<any[]>([]);
  const [bwRange,     setBwRange]     = useState('30');
  const [painData,    setPainData]    = useState<any>(null);
  const [compliance,  setCompliance]  = useState<any[]>([]);
  const [profile,     setProfile]     = useState<any>(null);
  const [loading,     setLoading]     = useState(true);

  // DEBUG
  console.log('[Track] component rendering, loading:', loading);

  // Stagger animations
  const anims = useRef(Array.from({ length: SECTION_COUNT }, () => new Animated.Value(0))).current;

  function runAnims() {
    anims.forEach(a => a.setValue(0));
    Animated.stagger(65, anims.map(a =>
      Animated.timing(a, { toValue: 1, duration: 380, useNativeDriver: true })
    )).start();
  }

  function fade(i: number) {
    return {
      opacity: anims[i],
      transform: [{ translateY: anims[i].interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
    };
  }

  useFocusEffect(useCallback(() => { loadAll(); }, []));

  // Web fallback: useEffect fires on mount for direct URL navigation
  React.useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAll() {
    console.log('[Track] loadAll starting');
    setLoading(true);
    try {
      console.log('[Track] making API calls');
      const [prData, bwHistory, profileData] = await Promise.all([
        prApi.getAll().catch(e => { console.warn('[Track] prApi error', e); return []; }),
        bwApi.getHistory().catch(e => { console.warn('[Track] bwApi error', e); return []; }),
        profileApi.get().catch(e => { console.warn('[Track] profileApi error', e); return null; }),
      ]);
      console.log('[Track] first batch done, prData:', prData?.length);
      setPrs(prData);
      setBwData(bwHistory);
      setProfile(profileData);

      const [ov, vol, pain, comp] = await Promise.all([
        analyticsApi.overview().catch(e => { console.warn('[Track] analytics overview error', e); return null; }),
        analyticsApi.volume().catch(e => { console.warn('[Track] analytics volume error', e); return []; }),
        analyticsApi.pain().catch(e => { console.warn('[Track] analytics pain error', e); return null; }),
        analyticsApi.compliance().catch(e => { console.warn('[Track] analytics compliance error', e); return []; }),
      ]);
      console.log('[Track] second batch done');
      setOverview(ov);
      setVolumeData(vol);
      setPainData(pain);
      setCompliance(comp);
    } catch (e) {
      console.warn('[TrackScreen] loadAll error:', e);
    } finally {
      console.log('[Track] setting loading false');
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

  // ── Derived data ────────────────────────────────────────────────────────────
  const sortedPRs = useMemo(() => {
    const filtered = prs.filter(p => p.bestE1rm > 0 || p.bestWeight > 0);
    if (prSort === 'recent')   return [...filtered].sort((a, b) => (b.lastDate ?? '') > (a.lastDate ?? '') ? 1 : -1);
    if (prSort === 'heaviest') return [...filtered].sort((a, b) => b.bestE1rm - a.bestE1rm);
    return [...filtered].sort((a, b) => a.exercise.localeCompare(b.exercise));
  }, [prs, prSort]);

  const liftChartData = useMemo(() =>
    liftHistory.filter(d => d.e1rm > 0).map(d => ({ y: d.e1rm, label: `W${d.week}` })),
    [liftHistory]
  );

  const currentE1RM = useMemo(() =>
    liftChartData.length ? liftChartData[liftChartData.length - 1].y : null,
    [liftChartData]
  );

  const bwChartData = useMemo(() => {
    if (!bwData.length) return [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - parseInt(bwRange));
    return bwData.filter(d => new Date(d.date) >= cutoff).map(d => ({ y: d.weight, label: fmtDate(d.date) }));
  }, [bwData, bwRange]);

  const currentBW = useMemo(() =>
    bwChartData.length ? bwChartData[bwChartData.length - 1].y : (profile?.currentBodyweight ?? null),
    [bwChartData, profile]
  );

  const blockInfo = useMemo(() => getBlockInfo(profile?.currentWeek ?? 1), [profile]);

  const trendColor = useMemo(() => {
    if (!painData?.trend) return AMBER;
    if (painData.trend === 'decreasing') return TEAL;
    if (painData.trend === 'increasing') return RED;
    return AMBER;
  }, [painData]);

  const overallCompliance = overview?.compliance ?? 0;

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.loadWrap}>
        <ActivityIndicator color={COLORS.accent} size="large" />
        <Text style={s.loadText}>Analyzing your data…</Text>
      </View>
    );
  }

  const summaryCards = [
    { icon: 'trophy',        label: 'PRs This Block',  value: overview?.prsThisBlock ?? '—' },
    { icon: 'speedometer',   label: 'Avg RPE',          value: overview?.avgRPE ?? '—' },
    { icon: 'check-circle',  label: 'Compliance',       value: overview ? `${overview.compliance}%` : '—' },
    { icon: 'calendar-check',label: 'Training Days',    value: overview?.trainingDays ?? '—' },
  ];

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
      >
        {/* ─── Header ──────────────────────────────────────────────────── */}
        <Animated.View style={[s.header, fade(0)]}>
          <Text style={s.title}>TRACK</Text>
          <Text style={s.subtitle}>PROGRESS & ANALYTICS</Text>
        </Animated.View>

        {/* ─── Summary Cards ────────────────────────────────────────────── */}
        <Animated.View style={fade(1)}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ paddingLeft: SPACING.lg }}
            contentContainerStyle={{ gap: SPACING.sm, paddingRight: SPACING.lg, paddingVertical: 4 }}
          >
            {summaryCards.map((c, i) => (
              <View key={i} style={s.summCard}>
                <MaterialCommunityIcons name={c.icon as any} size={15} color={COLORS.accent} style={{ marginBottom: 5 }} />
                <Text style={s.summLabel}>{c.label}</Text>
                <Text style={s.summValue}>{String(c.value)}</Text>
              </View>
            ))}
          </ScrollView>
        </Animated.View>

        {/* ─── PR Board ─────────────────────────────────────────────────── */}
        <Animated.View style={[s.section, fade(2)]}>
          <SectionHeader icon="trophy-outline" title="Personal Records" subtitle="ALL-TIME BESTS" />

          {/* Sort pills */}
          <View style={s.sortRow}>
            {([['recent', 'Most Recent'], ['heaviest', 'Heaviest'], ['exercise', 'A–Z']] as const).map(([k, label]) => (
              <TouchableOpacity
                key={k}
                style={[s.sortPill, prSort === k && s.sortPillOn]}
                onPress={() => setPrSort(k)}
              >
                <Text style={[s.sortPillTxt, prSort === k && s.sortPillTxtOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {sortedPRs.length === 0 ? (
            <View style={s.empty}>
              <MaterialCommunityIcons name="dumbbell" size={30} color={COLORS.text.muted} />
              <Text style={s.emptyTxt}>Start logging to build your PR board</Text>
            </View>
          ) : sortedPRs.map((pr, i) => (
            <View key={pr.exercise} style={[s.prRow, i > 0 && s.prRowBorder]}>
              <View style={s.prLeft}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <MaterialCommunityIcons name="star" size={12} color={COLORS.accent} />
                  <Text style={s.prName} numberOfLines={1}>{pr.exercise}</Text>
                </View>
                <Text style={s.prDate}>{pr.lastDate ? fmtDate(pr.lastDate) : '—'}</Text>
              </View>
              <View style={s.prRight}>
                {isRecentPR(pr.lastDate) && (
                  <View style={s.newBadge}><Text style={s.newBadgeTxt}>NEW PR</Text></View>
                )}
                <Text style={s.prVal}>{pr.bestWeight > 0 ? `${pr.bestWeight} × ${pr.bestReps}` : '—'}</Text>
                {pr.bestE1rm > 0 && <Text style={s.prE1rm}>e1RM: {pr.bestE1rm}</Text>}
              </View>
            </View>
          ))}
        </Animated.View>

        {/* ─── Strength Trends ──────────────────────────────────────────── */}
        <Animated.View style={[s.section, fade(3)]}>
          <SectionHeader icon="chart-line" title="Strength Trends" subtitle="ESTIMATED 1RM OVER TIME" />

          {/* Current e1RM callout */}
          {currentE1RM !== null && (
            <View style={s.e1rmBox}>
              <Text style={s.e1rmBoxLabel}>Current e1RM</Text>
              <Text style={s.e1rmBoxVal}>
                {currentE1RM} <Text style={s.e1rmBoxUnit}>{profile?.units || 'lbs'}</Text>
              </Text>
            </View>
          )}

          {/* Lift selector */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={{ marginBottom: SPACING.md }}
            contentContainerStyle={{ gap: SPACING.sm }}
          >
            {PRIMARY_LIFTS.map(lift => (
              <TouchableOpacity
                key={lift.exercise}
                style={[s.liftPill, selectedLift === lift.exercise && s.liftPillOn]}
                onPress={() => loadLift(lift.exercise)}
              >
                <Text style={[s.liftPillTxt, selectedLift === lift.exercise && s.liftPillTxtOn]}>
                  {lift.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {liftLoading
            ? <View style={{ height: 160, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={COLORS.accent} /></View>
            : <LineChart data={liftChartData} color={COLORS.accent} height={160} />
          }
        </Animated.View>

        {/* ─── Volume Trends ────────────────────────────────────────────── */}
        <Animated.View style={[s.section, fade(4)]}>
          <SectionHeader icon="chart-bar" title="Training Volume" subtitle="LAST 8 WEEKS" />
          <PillRow
            options={['sets', 'tonnage']}
            value={volumeMode}
            onSelect={setVolumeMode}
            labels={{ sets: 'Total Sets', tonnage: 'Tonnage (lbs)' }}
          />
          <BarChart
            data={volumeData.map(d => ({
              week: d.week,
              value: volumeMode === 'sets' ? d.sets : d.tonnage,
              isCurrent: d.isCurrent,
            }))}
            color={COLORS.accent}
          />
        </Animated.View>

        {/* ─── Bodyweight ───────────────────────────────────────────────── */}
        <Animated.View style={[s.section, fade(5)]}>
          <SectionHeader icon="scale-bathroom" title="Bodyweight" subtitle="WEIGHT TREND" />

          <View style={s.bwStatRow}>
            <View>
              <Text style={s.bwStatLabel}>Current</Text>
              <Text style={s.bwStatVal}>
                {currentBW ?? '—'} <Text style={s.bwUnit}>{profile?.units || 'lbs'}</Text>
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.bwStatLabel}>12-Wk Goal</Text>
              <Text style={[s.bwStatVal, { color: TEAL }]}>
                {profile?.bw12WeekGoal ?? '—'} <Text style={s.bwUnit}>{profile?.units || 'lbs'}</Text>
              </Text>
            </View>
          </View>

          <PillRow
            options={['30', '60', '90']}
            value={bwRange}
            onSelect={setBwRange}
            labels={{ '30': '30 Days', '60': '60 Days', '90': '90 Days' }}
          />
          <LineChart data={bwChartData} color={TEAL} height={140} />
        </Animated.View>

        {/* ─── Pain & Discomfort ────────────────────────────────────────── */}
        <Animated.View style={[s.section, fade(6)]}>
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
                <MaterialCommunityIcons
                  name={painData.trend === 'decreasing' ? 'trending-down' : painData.trend === 'increasing' ? 'trending-up' : 'trending-neutral'}
                  size={15} color={trendColor}
                />
                <Text style={[s.trendTxt, { color: trendColor }]}>
                  {painData.trend === 'decreasing'
                    ? 'Improving — pain trending down'
                    : painData.trend === 'increasing'
                    ? 'Worsening — monitor closely'
                    : 'Stable — no significant change'}
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

        {/* ─── Session Compliance ───────────────────────────────────────── */}
        <Animated.View style={[s.section, fade(7)]}>
          <SectionHeader icon="check-circle-outline" title="Session Compliance" subtitle="LAST 8 WEEKS" />

          <View style={s.compRow}>
            <CircularProgress progress={overallCompliance / 100} color={COLORS.accent} size={130} />

            <View style={s.compBreakdown}>
              {compliance.length === 0 ? (
                <Text style={s.emptyTxt}>Log sessions to see breakdown</Text>
              ) : compliance.map((item: any, i: number) => {
                const clr = item.rate >= 80 ? TEAL : item.rate >= 60 ? AMBER : RED;
                return (
                  <View key={i} style={s.compItem}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                      <Text style={s.compLabel}>{item.sessionType}</Text>
                      <Text style={[s.compRate, { color: clr }]}>{item.rate}%</Text>
                    </View>
                    <View style={s.compBar}>
                      <View style={[s.compFill, { width: `${item.rate}%`, backgroundColor: clr }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        </Animated.View>

        {/* ─── Block Progress ───────────────────────────────────────────── */}
        <Animated.View style={[s.section, s.lastSection, fade(8)]}>
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

          <View style={s.blkBarTrack}>
            <View style={[s.blkBarFill, { width: `${Math.min(100, blockInfo.progress * 100)}%` }]} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 }}>
            <Text style={s.blkBarLabel}>Wk {blockInfo.blockStart}</Text>
            <Text style={[s.blkBarLabel, { color: COLORS.accent, fontWeight: FONTS.weights.bold }]}>
              {Math.round(blockInfo.progress * 100)}% complete
            </Text>
            <Text style={s.blkBarLabel}>Deload Wk {blockInfo.blockEnd}</Text>
          </View>

          <View style={s.milestone}>
            <MaterialCommunityIcons name="flag" size={15} color={COLORS.accent} />
            <Text style={s.milestoneTxt}>
              {blockInfo.blockLen - blockInfo.weekInBlk} week{blockInfo.blockLen - blockInfo.weekInBlk !== 1 ? 's' : ''} until next deload
            </Text>
          </View>
        </Animated.View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: COLORS.background },
  scroll:      { paddingBottom: 40 },
  loadWrap:    { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadText:    { color: COLORS.text.muted, fontSize: FONTS.sizes.sm },

  // Header
  header:   { paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl, paddingBottom: SPACING.md },
  title:    { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, letterSpacing: 2 },
  subtitle: { fontSize: 10, color: COLORS.text.muted, letterSpacing: 2.5, marginTop: 2 },

  // Summary cards
  summCard:  { width: 100, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  summLabel: { fontSize: 10, color: COLORS.text.muted, letterSpacing: 0.3, marginBottom: 2, lineHeight: 14 },
  summValue: { fontSize: 26, fontWeight: FONTS.weights.heavy, color: COLORS.accent, lineHeight: 30 },

  // Section card
  section:     { marginHorizontal: SPACING.lg, marginTop: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border },
  lastSection: { marginBottom: SPACING.xxl },

  // Empty state
  empty:    { alignItems: 'center', paddingVertical: SPACING.xl, gap: SPACING.sm },
  emptyTxt: { color: COLORS.text.muted, fontSize: FONTS.sizes.sm, textAlign: 'center' },
  cleanWrap:{ alignItems: 'center', paddingVertical: SPACING.lg, gap: 6 },
  cleanSub: { color: COLORS.text.muted, fontSize: FONTS.sizes.xs, textAlign: 'center', lineHeight: 18, maxWidth: 260 },

  // PR Board
  sortRow:       { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md, flexWrap: 'wrap' },
  sortPill:      { paddingVertical: 5, paddingHorizontal: 11, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border },
  sortPillOn:    { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  sortPillTxt:   { fontSize: 11, fontWeight: FONTS.weights.bold, color: COLORS.text.muted },
  sortPillTxtOn: { color: '#000' },
  prRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 11 },
  prRowBorder:{ borderTopWidth: 1, borderTopColor: COLORS.border },
  prLeft:     { flex: 1, gap: 3, paddingRight: SPACING.sm },
  prRight:    { alignItems: 'flex-end', gap: 4 },
  prName:     { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold, color: COLORS.text.primary },
  prDate:     { fontSize: FONTS.sizes.xs, color: COLORS.text.muted },
  prVal:      { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold, color: COLORS.text.primary },
  prE1rm:     { fontSize: FONTS.sizes.xs, color: COLORS.accent, fontWeight: FONTS.weights.medium },
  newBadge:   { backgroundColor: COLORS.accent + '20', borderWidth: 1, borderColor: COLORS.accent, borderRadius: RADIUS.full, paddingHorizontal: 6, paddingVertical: 2 },
  newBadgeTxt:{ fontSize: 9, fontWeight: FONTS.weights.heavy, color: COLORS.accent, letterSpacing: 0.8 },

  // e1RM
  e1rmBox:     { backgroundColor: COLORS.background, borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md },
  e1rmBoxLabel:{ fontSize: 10, color: COLORS.text.muted, letterSpacing: 1.5, marginBottom: 2 },
  e1rmBoxVal:  { fontSize: 34, fontWeight: FONTS.weights.heavy, color: COLORS.accent, lineHeight: 40 },
  e1rmBoxUnit: { fontSize: 16, color: COLORS.text.muted, fontWeight: FONTS.weights.regular },
  liftPill:    { paddingVertical: 6, paddingHorizontal: 18, borderRadius: RADIUS.full, borderWidth: 1, borderColor: COLORS.border },
  liftPillOn:  { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  liftPillTxt: { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.bold, color: COLORS.text.muted },
  liftPillTxtOn:{ color: '#000' },

  // Bodyweight
  bwStatRow:  { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: COLORS.background, borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md },
  bwStatLabel:{ fontSize: 10, color: COLORS.text.muted, letterSpacing: 0.5, marginBottom: 2 },
  bwStatVal:  { fontSize: 26, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, lineHeight: 30 },
  bwUnit:     { fontSize: 13, fontWeight: FONTS.weights.regular, color: COLORS.text.muted },

  // Pain
  trendBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.sm, marginBottom: SPACING.md },
  trendTxt:   { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold },
  locHeader:  { fontSize: 10, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 1.5, marginTop: SPACING.md, marginBottom: SPACING.sm },
  locRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  locName:    { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, paddingRight: SPACING.sm },
  locBadge:   { borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 },
  locCount:   { fontSize: 11, fontWeight: FONTS.weights.bold },

  // Compliance
  compRow:      { flexDirection: 'row', gap: SPACING.lg, alignItems: 'flex-start' },
  compBreakdown:{ flex: 1, gap: SPACING.md },
  compItem:     {},
  compLabel:    { fontSize: FONTS.sizes.xs, color: COLORS.text.secondary },
  compRate:     { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold },
  compBar:      { height: 6, backgroundColor: COLORS.border, borderRadius: RADIUS.full, overflow: 'hidden' },
  compFill:     { height: '100%', borderRadius: RADIUS.full },

  // Block Progress
  blkStatRow:  { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: COLORS.background, borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md },
  blkStatLabel:{ fontSize: 10, color: COLORS.text.muted, letterSpacing: 0.5, marginBottom: 2 },
  blkStatVal:  { fontSize: 20, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  blkBarTrack: { height: 10, backgroundColor: COLORS.border, borderRadius: RADIUS.full, overflow: 'hidden' },
  blkBarFill:  { height: '100%', backgroundColor: COLORS.accent, borderRadius: RADIUS.full },
  blkBarLabel: { fontSize: 10, color: COLORS.text.muted },
  milestone:   { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.accent + '14', borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.accent + '40', marginTop: SPACING.md },
  milestoneTxt:{ fontSize: FONTS.sizes.sm, color: COLORS.accent, fontWeight: FONTS.weights.semibold },
});

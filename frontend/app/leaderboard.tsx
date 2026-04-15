import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Modal, Share, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { leaderboardApi, groupsApi } from '../src/utils/api';
import { COLORS, FONTS, RADIUS } from '../src/constants/theme';

const BG   = '#0A0A0C';
const CARD = '#111114';
const GOLD = '#C9A84C';
const AMBER= '#FF9500';
const BORDER = '#1E1E22';

const TABS = ['consistency', 'streaks', 'prs'] as const;
type Tab = typeof TABS[number];

const TAB_LABELS: Record<Tab, string> = {
  consistency: 'Consistency',
  streaks:     'Streaks',
  prs:         'PRs',
};

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ initials, isCurrentUser, rank }: { initials: string; isCurrentUser: boolean; rank: number }) {
  const colors = ['#C9A84C', '#9B9B9B', '#A0522D'];
  const bg     = rank <= 3 ? colors[rank - 1] + '20' : (isCurrentUser ? GOLD + '20' : '#1A1A1E');
  const border = rank <= 3 ? colors[rank - 1] : (isCurrentUser ? GOLD : '#333');
  return (
    <View style={[ava.circle, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[ava.text, { color: rank <= 3 ? colors[rank - 1] : (isCurrentUser ? GOLD : '#888') }]}>
        {initials}
      </Text>
    </View>
  );
}
const ava = StyleSheet.create({
  circle: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  text:   { fontSize: 13, fontWeight: '700' },
});

// ── Podium Entry ─────────────────────────────────────────────────────────────
function PodiumEntry({ entry, position }: { entry: any; position: 1 | 2 | 3 }) {
  const heights = { 1: 80, 2: 60, 3: 50 };
  const colors  = { 1: '#C9A84C', 2: '#9B9B9B', 3: '#A0522D' };
  const color   = colors[position];
  const isFirst = position === 1;
  return (
    <View style={[pod.wrap, isFirst && pod.wrapFirst]}>
      {isFirst && <MaterialCommunityIcons name="crown" size={18} color={GOLD} style={pod.crown} />}
      <Avatar initials={entry.initials} isCurrentUser={entry.isCurrentUser} rank={position} />
      <Text style={[pod.name, { color: isFirst ? COLORS.text.primary : COLORS.text.secondary }]} numberOfLines={1}>
        {entry.name}
      </Text>
      <View style={[pod.bar, { height: heights[position], backgroundColor: color + '30', borderTopColor: color }]}>
        <Text style={[pod.rank, { color }]}>#{position}</Text>
      </View>
    </View>
  );
}
const pod = StyleSheet.create({
  wrap:      { flex: 1, alignItems: 'center', gap: 4, paddingBottom: 0 },
  wrapFirst: { marginBottom: -10 },
  crown:     { marginBottom: 2 },
  name:      { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  bar:       { width: '100%', borderTopWidth: 2, borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
  rank:      { fontSize: 16, fontWeight: '800' },
});

// ── Group Modal ───────────────────────────────────────────────────────────────
function GroupModal({ visible, onClose, userName }: { visible: boolean; onClose: () => void; userName: string }) {
  const [groupName, setGroupName]   = useState(userName + "'s Crew");
  const [joinCode,  setJoinCode]    = useState('');
  const [myCode,    setMyCode]      = useState('');
  const [creating,  setCreating]    = useState(false);
  const [joining,   setJoining]     = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await groupsApi.create(groupName);
      setMyCode(res.code);
    } catch { Alert.alert('Error', 'Could not create group'); }
    finally { setCreating(false); }
  };

  const handleShare = () => {
    Share.share({
      message: `I'm training with The Program — join my group with code ${myCode}. Download: theprogram.app`,
    });
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    try {
      const res = await groupsApi.join(joinCode.trim());
      Alert.alert('Joined!', `You've joined ${res.name} (${res.members} members)`);
      onClose();
    } catch (e: any) {
      Alert.alert('Not found', e.message || 'Check the code and try again');
    } finally { setJoining(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
        <View style={mod.header}>
          <Text style={mod.title}>Training Groups</Text>
          <TouchableOpacity onPress={onClose}><MaterialCommunityIcons name="close" size={24} color={COLORS.text.secondary} /></TouchableOpacity>
        </View>
        <ScrollView style={{ padding: 20 }}>
          {/* Create */}
          <Text style={mod.sectionLabel}>CREATE A GROUP</Text>
          {!myCode ? (
            <>
              <TextInput
                style={mod.input}
                value={groupName}
                onChangeText={setGroupName}
                placeholderTextColor="#555"
                placeholder="Group name"
              />
              <TouchableOpacity style={mod.primaryBtn} onPress={handleCreate} disabled={creating}>
                <Text style={mod.primaryBtnText}>{creating ? 'CREATING...' : 'CREATE'}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={mod.codeCard}>
              <Text style={mod.codeLabel}>YOUR GROUP CODE</Text>
              <Text style={mod.code}>{myCode}</Text>
              <Text style={mod.codeHint}>Share this code with your training partners</Text>
              <TouchableOpacity style={mod.primaryBtn} onPress={handleShare}>
                <MaterialCommunityIcons name="share-variant" size={14} color={BG} />
                <Text style={mod.primaryBtnText}>SHARE VIA TEXT</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={mod.divider} />

          {/* Join */}
          <Text style={mod.sectionLabel}>JOIN A GROUP</Text>
          <TextInput
            style={mod.input}
            value={joinCode}
            onChangeText={(t) => setJoinCode(t.toUpperCase())}
            placeholder="Enter 6-character code"
            placeholderTextColor="#555"
            autoCapitalize="characters"
            maxLength={6}
          />
          <TouchableOpacity style={[mod.primaryBtn, { backgroundColor: CARD }]} onPress={handleJoin} disabled={joining}>
            <Text style={[mod.primaryBtnText, { color: GOLD }]}>{joining ? 'JOINING...' : 'JOIN'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
const mod = StyleSheet.create({
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  title:        { fontSize: 18, fontWeight: '700', color: COLORS.text.primary },
  sectionLabel: { fontSize: 10, color: COLORS.text.muted, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 },
  input:        { backgroundColor: '#1A1A1E', borderRadius: RADIUS.md, borderWidth: 1, borderColor: BORDER, color: COLORS.text.primary, fontSize: 15, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10 },
  primaryBtn:   { backgroundColor: GOLD, borderRadius: RADIUS.md, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, marginBottom: 8 },
  primaryBtnText: { fontSize: 13, fontWeight: '700', color: BG },
  codeCard:     { backgroundColor: '#111114', borderRadius: RADIUS.lg, borderWidth: 1, borderColor: GOLD + '40', padding: 20, alignItems: 'center', gap: 8, marginBottom: 10 },
  codeLabel:    { fontSize: 10, color: GOLD, fontWeight: '700', letterSpacing: 1.5 },
  code:         { fontSize: 36, fontWeight: '800', color: GOLD, letterSpacing: 6 },
  codeHint:     { fontSize: 12, color: COLORS.text.muted, textAlign: 'center', marginBottom: 6 },
  divider:      { height: 1, backgroundColor: BORDER, marginVertical: 20 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function LeaderboardScreen() {
  const router     = useRouter();
  const [tab, setTab]           = useState<Tab>('consistency');
  const [data, setData]         = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [showGroup, setShowGroup] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await leaderboardApi.get(tab);
      setData(res);
    } catch { /* noop */ }
    finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const entries     = data?.entries || [];
  const top3        = entries.slice(0, 3);
  const rest        = entries.slice(3);
  const me          = entries.find((e: any) => e.isCurrentUser);
  const now         = new Date();
  const monthLabel  = now.toLocaleString('default', { month: 'long', year: 'numeric' }).toUpperCase();

  const metricLabel = (e: any) => {
    if (tab === 'consistency') return `${e.compliance}%`;
    if (tab === 'streaks')     return `${e.streak}wk`;
    return `${e.prCount} PRs`;
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={COLORS.text.primary} />
        </TouchableOpacity>
        <Text style={s.title}>Leaderboard</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        {TABS.map(t => (
          <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabActive]} onPress={() => setTab(t)}>
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>{TAB_LABELS[t]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={GOLD} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Month label */}
          <Text style={s.monthLabel}>THIS MONTH · {monthLabel}</Text>

          {/* Podium */}
          {top3.length >= 3 && (
            <View style={s.podium}>
              <PodiumEntry entry={top3[1]} position={2} />
              <PodiumEntry entry={top3[0]} position={1} />
              <PodiumEntry entry={top3[2]} position={3} />
            </View>
          )}

          {/* Your Stats */}
          {me && (
            <View style={s.myStats}>
              <Text style={s.myStatsLabel}>YOUR STATS THIS MONTH</Text>
              <View style={s.myStatsRow}>
                {[
                  { label: 'SESSIONS', value: String(me.sessionsCompleted) },
                  { label: 'STREAK',   value: `${me.streak}wk` },
                  { label: 'COMPLIANCE', value: `${me.compliance}%` },
                  { label: 'RANK',     value: `#${me.rank}` },
                ].map(({ label, value }) => (
                  <View key={label} style={s.myStatItem}>
                    <Text style={s.myStatValue}>{value}</Text>
                    <Text style={s.myStatLabel}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* All Athletes */}
          <Text style={s.allLabel}>ALL ATHLETES ({data?.totalAthletes ?? 0})</Text>
          {rest.map((entry: any) => (
            <View key={entry.userId} style={[s.row, entry.isCurrentUser && s.rowMe]}>
              <Text style={[s.rowRank, entry.rank <= 3 && { color: GOLD }]}>#{entry.rank}</Text>
              <Avatar initials={entry.initials} isCurrentUser={entry.isCurrentUser} rank={entry.rank} />
              <View style={s.rowInfo}>
                <Text style={[s.rowName, entry.isCurrentUser && { color: GOLD }]}>{entry.name}</Text>
                <Text style={s.rowSub}>{entry.goal} · {entry.streak}wk streak</Text>
              </View>
              <Text style={[s.rowMetric, entry.isCurrentUser && { color: GOLD }]}>{metricLabel(entry)}</Text>
            </View>
          ))}

          {/* Invite button */}
          <TouchableOpacity style={s.inviteBtn} onPress={() => setShowGroup(true)}>
            <MaterialCommunityIcons name="account-plus-outline" size={16} color={GOLD} />
            <Text style={s.inviteBtnText}>INVITE FRIENDS</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      <GroupModal visible={showGroup} onClose={() => setShowGroup(false)} userName="My" />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:     { flex: 1, backgroundColor: BG },
  header:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn:  { width: 40, height: 40, justifyContent: 'center' },
  title:    { fontSize: 18, fontWeight: FONTS.weights.bold, color: COLORS.text.primary },

  tabs:         { flexDirection: 'row', marginHorizontal: 16, backgroundColor: CARD, borderRadius: RADIUS.full, padding: 3, marginBottom: 4 },
  tab:          { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: RADIUS.full },
  tabActive:    { backgroundColor: '#1E1E22' },
  tabText:      { fontSize: 12, fontWeight: FONTS.weights.semibold, color: COLORS.text.muted },
  tabTextActive:{ color: COLORS.text.primary },

  monthLabel: { fontSize: 9, color: COLORS.text.muted, fontWeight: FONTS.weights.heavy, letterSpacing: 1.5, textAlign: 'center', marginVertical: 8 },

  podium:     { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 24, marginBottom: 16, gap: 8 },

  myStats:    { marginHorizontal: 16, marginBottom: 16, backgroundColor: CARD, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: GOLD + '30', padding: 14 },
  myStatsLabel: { fontSize: 9, color: GOLD, fontWeight: FONTS.weights.heavy, letterSpacing: 1.5, marginBottom: 10 },
  myStatsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  myStatItem: { alignItems: 'center' },
  myStatValue:{ fontSize: 18, fontWeight: '700', color: COLORS.text.primary },
  myStatLabel:{ fontSize: 9, color: COLORS.text.muted, fontWeight: FONTS.weights.heavy, letterSpacing: 0.5 },

  allLabel: { fontSize: 9, color: COLORS.text.muted, fontWeight: FONTS.weights.heavy, letterSpacing: 1.5, textTransform: 'uppercase', marginHorizontal: 16, marginBottom: 8 },

  row:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1A1A1E' },
  rowMe:   { backgroundColor: GOLD + '08' },
  rowRank: { fontSize: 13, fontWeight: '700', color: COLORS.text.muted, width: 28, textAlign: 'center' },
  rowInfo: { flex: 1 },
  rowName: { fontSize: 13, fontWeight: FONTS.weights.semibold, color: COLORS.text.primary },
  rowSub:  { fontSize: 11, color: COLORS.text.muted },
  rowMetric: { fontSize: 14, fontWeight: '700', color: COLORS.text.primary },

  inviteBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', margin: 20, borderWidth: 1, borderColor: GOLD + '40', borderRadius: RADIUS.full, paddingVertical: 12 },
  inviteBtnText: { fontSize: 13, fontWeight: FONTS.weights.bold, color: GOLD, letterSpacing: 0.8 },
});

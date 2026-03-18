import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Alert, Switch, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS } from '../src/constants/theme';
import { getProfile, saveProfile } from '../src/utils/storage';
import { profileApi } from '../src/utils/api';
import { AthleteProfile } from '../src/types';

export default function SettingsScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<AthleteProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getProfile().then(p => { setProfile(p); setLoading(false); });
  }, []);

  async function updateProfile(updates: Partial<AthleteProfile>) {
    if (!profile) return;
    setSaving(true);
    const updated = { ...profile, ...updates };
    setProfile(updated);
    await saveProfile(updated);
    try { await profileApi.update(updates); } catch {}
    setSaving(false);
  }

  async function toggleUnit() {
    const newUnit = profile?.units === 'lbs' ? 'kg' : 'lbs';
    await updateProfile({ units: newUnit });
  }

  async function toggleNotif(key: keyof AthleteProfile['notifications']) {
    if (!profile) return;
    const notifs = { ...profile.notifications, [key]: !profile.notifications[key] };
    await updateProfile({ notifications: notifs });
  }

  function confirmReset() {
    Alert.alert(
      'Reset Onboarding?',
      'This will clear your profile and take you back to the setup flow.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: async () => {
          await saveProfile({ onboardingComplete: false });
          router.replace('/onboarding');
        }},
      ]
    );
  }

  if (loading) return <View style={s.loading}><ActivityIndicator color={COLORS.accent} /></View>;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity testID="settings-close" onPress={() => router.back()} style={s.closeBtn}>
          <MaterialCommunityIcons name="close" size={24} color={COLORS.text.secondary} />
        </TouchableOpacity>
        <Text style={s.title}>SETTINGS</Text>
        {saving && <ActivityIndicator size="small" color={COLORS.accent} />}
      </View>

      <ScrollView testID="settings-scroll">
        {/* Athlete Info */}
        <SectionHeader title="ATHLETE" />
        <View style={s.card}>
          <InfoRow label="Name" value={profile?.name || '—'} />
          <InfoRow label="Experience" value={profile?.experience || '—'} />
          <InfoRow label="Current Week" value={String(profile?.currentWeek || 1)} />
          <InfoRow label="Program Start" value={profile?.programStartDate || '—'} />
        </View>

        {/* Units */}
        <SectionHeader title="UNITS" />
        <View style={s.card}>
          <View testID="units-row" style={s.settingRow}>
            <View>
              <Text style={s.settingLabel}>Weight Units</Text>
              <Text style={s.settingDesc}>Toggle all weights, calculators, and plate math</Text>
            </View>
            <View style={s.unitToggle}>
              <Text style={[s.unitLabel, profile?.units === 'lbs' && s.unitLabelActive]}>lbs</Text>
              <Switch
                testID="unit-switch"
                value={profile?.units === 'kg'}
                onValueChange={toggleUnit}
                trackColor={{ false: COLORS.surfaceHighlight, true: COLORS.accent }}
                thumbColor={COLORS.text.primary}
              />
              <Text style={[s.unitLabel, profile?.units === 'kg' && s.unitLabelActive]}>kg</Text>
            </View>
          </View>
        </View>

        {/* Notifications */}
        <SectionHeader title="NOTIFICATIONS" />
        <View style={s.card}>
          <NotifRow
            testID="notif-daily"
            label="Daily Training Reminder"
            desc="Tomorrow's session type and main lift"
            value={profile?.notifications?.dailyReminder ?? true}
            onToggle={() => toggleNotif('dailyReminder')}
          />
          <NotifRow
            testID="notif-deload"
            label="Deload Week Alert"
            desc="Sent Monday of every deload week"
            value={profile?.notifications?.deloadAlert ?? true}
            onToggle={() => toggleNotif('deloadAlert')}
          />
          <NotifRow
            testID="notif-pr"
            label="PR Alert"
            desc="When a new personal record is logged"
            value={profile?.notifications?.prAlert ?? true}
            onToggle={() => toggleNotif('prAlert')}
          />
          <NotifRow
            testID="notif-checkin"
            label="Weekly Check-In Reminder"
            desc="Sunday prompt to complete your weekly review"
            value={profile?.notifications?.weeklyCheckin ?? true}
            onToggle={() => toggleNotif('weeklyCheckin')}
            last
          />
        </View>

        {/* Lose It Integration */}
        <SectionHeader title="NUTRITION (LOSE IT)" />
        <View style={s.card}>
          <View style={s.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.settingLabel}>Lose It Connection</Text>
              <Text style={s.settingDesc}>Pull daily calories, macros, and bodyweight</Text>
            </View>
            <View style={[s.statusBadge, { backgroundColor: profile?.loseitConnected ? '#1A3A1A' : '#2A2A2A' }]}>
              <Text style={[s.statusText, { color: profile?.loseitConnected ? '#4CAF50' : COLORS.text.muted }]}>
                {profile?.loseitConnected ? 'Connected' : 'Not Connected'}
              </Text>
            </View>
          </View>
          <TouchableOpacity testID="connect-loseit-settings" style={s.connectBtn}>
            <Text style={s.connectBtnText}>{profile?.loseitConnected ? 'Disconnect Lose It' : 'Connect Lose It (OAuth)'}</Text>
          </TouchableOpacity>
          <Text style={s.noteText}>OAuth integration available once Lose It API credentials are configured.</Text>
        </View>

        {/* Injury Flags */}
        {profile?.injuryFlags && profile.injuryFlags.length > 0 && (
          <>
            <SectionHeader title="ACTIVE INJURY FLAGS" />
            <View style={s.card}>
              {profile.injuryFlags.map(flag => (
                <View key={flag} style={s.injuryRow}>
                  <Text style={s.injuryDot}>⚠</Text>
                  <Text style={s.injuryText}>{flag}</Text>
                </View>
              ))}
              <Text style={s.noteText}>Update injury flags by redoing onboarding setup.</Text>
            </View>
          </>
        )}

        {/* Reset */}
        <SectionHeader title="ACCOUNT" />
        <View style={s.card}>
          <TouchableOpacity testID="reset-onboarding-btn" style={s.resetBtn} onPress={confirmReset}>
            <Text style={s.resetBtnText}>Reset Onboarding / Profile Setup</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={sh.text}>{title}</Text>;
}
const sh = StyleSheet.create({ text: { fontSize: 10, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 2, paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.sm } });

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={ir.row}>
      <Text style={ir.label}>{label}</Text>
      <Text style={ir.value}>{value}</Text>
    </View>
  );
}
const ir = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  label: { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm },
  value: { color: COLORS.text.primary, fontWeight: FONTS.weights.semibold, fontSize: FONTS.sizes.sm },
});

function NotifRow({ label, desc, value, onToggle, last, testID }: any) {
  return (
    <View style={[nr.row, !last && { borderBottomWidth: 1, borderBottomColor: COLORS.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={nr.label}>{label}</Text>
        <Text style={nr.desc}>{desc}</Text>
      </View>
      <Switch testID={testID} value={value} onValueChange={onToggle} trackColor={{ false: COLORS.surfaceHighlight, true: COLORS.accent }} thumbColor={COLORS.text.primary} />
    </View>
  );
}
const nr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  label: { color: COLORS.text.primary, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold, marginBottom: 2 },
  desc: { color: COLORS.text.secondary, fontSize: FONTS.sizes.xs },
});

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  loading: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: SPACING.lg, paddingTop: SPACING.xl, gap: SPACING.md },
  closeBtn: { padding: 4 },
  title: { flex: 1, fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, letterSpacing: 2 },
  card: { marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.sm },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md },
  settingLabel: { color: COLORS.text.primary, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold, marginBottom: 2 },
  settingDesc: { color: COLORS.text.secondary, fontSize: FONTS.sizes.xs, maxWidth: 200 },
  unitToggle: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  unitLabel: { color: COLORS.text.muted, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.sm },
  unitLabelActive: { color: COLORS.accent },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full },
  statusText: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold },
  connectBtn: { marginTop: SPACING.md, borderWidth: 1, borderColor: COLORS.accentBlue, borderRadius: RADIUS.md, height: 40, justifyContent: 'center', alignItems: 'center' },
  connectBtnText: { color: COLORS.accentBlue, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold },
  noteText: { color: COLORS.text.muted, fontSize: FONTS.sizes.xs, marginTop: SPACING.sm, fontStyle: 'italic' },
  injuryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  injuryDot: { color: COLORS.accent, marginRight: 8 },
  injuryText: { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm },
  resetBtn: { borderWidth: 1, borderColor: '#CF6679', borderRadius: RADIUS.md, height: 44, justifyContent: 'center', alignItems: 'center' },
  resetBtnText: { color: '#CF6679', fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold },
});

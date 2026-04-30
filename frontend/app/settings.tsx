import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView,
  Alert, Switch, ActivityIndicator, TextInput, Modal, Platform,
  KeyboardAvoidingView, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS } from '../src/constants/theme';
import { getProfile, saveProfile } from '../src/utils/storage';
import { profileApi, planApi, authApi, InjuryPreviewResult } from '../src/utils/api';
import { AthleteProfile } from '../src/types';
import { clearAuth, getStoredUser } from '../src/utils/auth';
import AskCoachButton from '../src/components/AskCoachButton';

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_INJURIES = [
  'Shoulder (general)',         'Rotator Cuff',
  'Elbow (tendinitis/pain)',    'Wrist / Forearm',
  'Upper Back / Thoracic',      'Lower Back / Lumbar',
  'SI Joint / Pelvis',          'Hip / Hip Flexor',
  'Groin / Adductor',           'Knee (general)',
  'Patellar Tendinitis',        'Ankle / Foot',
  'Hamstring',                  'Quad / Patellar',
  'Bicep (tendon)',             'Tricep (tendon)',
  'Neck / Cervical',            'Hernia / Core',
  'Nerve / Sciatica',           'Post-Surgical Rehab',
  'Chronic / Systemic Pain',
];

const ALL_WEAKNESSES = [
  'Off the chest / bottom ROM',
  'Tricep lockout (top half)',
  'Shoulder girdle / pec tie-in',
  'Off the floor (deadlift / clean)',
  'Knee / hip transition (mid-pull)',
  'Lockout / hip drive (deadlift)',
  'Squat depth / the hole',
  'Upper back rounding under load',
  'Core stability / bracing',
  'Hip mobility / achieving depth',
  'Shoulder / overhead mobility',
  'Overhead lockout & stability',
  'Pressing strength (general upper)',
  'Posterior chain (hamstrings/glutes)',
  'Grip strength / forearm endurance',
  'Conditioning / work capacity',
  'Mental / confidence under maximal',
];

const EXPERIENCE_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Elite'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return dateStr; }
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const router = useRouter();

  // ── Profile state ──────────────────────────────────────────────────────────
  const [profile,        setProfile]        = useState<AthleteProfile | null>(null);
  const [authUser,       setAuthUser]       = useState<{ email?: string; name?: string } | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [saving,         setSaving]         = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(true);

  // ── Inline edit state (injuries & weaknesses) ─────────────────────────────
  const [liveInjuries,   setLiveInjuries]   = useState<string[]>([]);
  const [liveWeaknesses, setLiveWeaknesses] = useState<string[]>([]);
  const [injuriesModified, setInjuriesModified] = useState(false);

  // ── Edit profile modal state ───────────────────────────────────────────────
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editName,        setEditName]        = useState('');
  const [editWeight,      setEditWeight]      = useState('');
  const [editExp,         setEditExp]         = useState('');

  // ── Add / Preview modals ───────────────────────────────────────────────────
  const [showAddInjury,   setShowAddInjury]   = useState(false);
  const [showAddWeakness, setShowAddWeakness] = useState(false);
  const [showPreview,     setShowPreview]     = useState(false);
  const [previewData,     setPreviewData]     = useState<InjuryPreviewResult | null>(null);
  const [previewLoading,  setPreviewLoading]  = useState(false);

  // ── Load profile ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const user = await getStoredUser();
      if (user) {
        setAuthUser(user);
        setMarketingOptIn(user.marketingOptIn ?? true);
      }
      let p = await getProfile();
      try {
        const backendProfile = await profileApi.get();
        if (backendProfile) {
          // Server-controlled fields always win on fetch
          // (these are flags the user cannot toggle from settings)
          const SERVER_AUTHORITATIVE_FIELDS: (keyof AthleteProfile)[] = [
            'is_beta_tester',
            'training_mode',
            'has_imported_program',
            'currentWeek',
            'programStartDate',
            'onboardingComplete',
            // Schedule fields — set during intake / auto-aligned by migration.
            // User cannot edit these from Settings directly; server is the only
            // source of truth (same class of bug as is_beta_tester above).
            'trainingDaysCount',
            'preferredDays',
            'avoidMovements',
          ];

          // Start with local (preserves user-edited fields like name, weight, weaknesses)
          const merged: any = { ...backendProfile, ...p };

          // Override any server-authoritative field with the backend value
          for (const field of SERVER_AUTHORITATIVE_FIELDS) {
            if (field in backendProfile) {
              merged[field] = (backendProfile as any)[field];
            }
          }

          p = merged;
          await saveProfile(p);
        }
      } catch {}
      setProfile(p);
      setLiveInjuries([...(p?.injuryFlags || [])]);
      setLiveWeaknesses([...(p?.primaryWeaknesses || p?.weaknesses || [])]);
      setLoading(false);
    })();
  }, []);

  // ── Profile update helper ─────────────────────────────────────────────────
  async function updateProfile(updates: Partial<AthleteProfile>) {
    if (!profile) return;
    setSaving(true);

    // Snapshot current state so we can roll back if the backend call fails
    const previousProfile = profile;

    // Optimistic update — show change immediately in UI and local cache
    const updated = { ...profile, ...updates };
    setProfile(updated as AthleteProfile);
    await saveProfile(updated as AthleteProfile);

    try {
      await profileApi.update(updates);
    } catch (e) {
      // Fix A: backend sync failed — roll back both React state and AsyncStorage
      // so the UI reflects the actual persisted state (not a ghost save).
      setProfile(previousProfile);
      await saveProfile(previousProfile);
      console.warn('[Settings] Backend profile update failed — rolled back local cache:', e);
      Alert.alert(
        'Sync Failed',
        "Couldn't save changes to the server. Your local view has been reverted.\n\nTap Retry to try again.",
        [
          { text: 'Dismiss', style: 'cancel' },
          {
            text: 'Retry',
            onPress: () => updateProfile(updates),
          },
        ]
      );
    } finally {
      setSaving(false);
    }
  }

  // ── Edit profile modal ────────────────────────────────────────────────────
  const openEditProfile = () => {
    setEditName(profile?.name || authUser?.name || '');
    setEditWeight(String(profile?.currentBodyweight || ''));
    setEditExp(profile?.experience || '');
    setShowEditProfile(true);
  };

  const handleSaveProfile = async () => {
    setShowEditProfile(false);
    await updateProfile({
      name:              editName.trim() || profile?.name || '',
      currentBodyweight: parseFloat(editWeight) || profile?.currentBodyweight || 0,
      experience:        editExp || profile?.experience || '',
    });
  };

  // ── Injuries (inline, with preview flow on save) ──────────────────────────
  const handleRemoveInjury = (flag: string) => {
    const next = liveInjuries.filter(i => i !== flag);
    setLiveInjuries(next);
    const current = (profile?.injuryFlags || []).slice().sort().join();
    setInjuriesModified(next.slice().sort().join() !== current);
  };

  const handleAddInjury = (flag: string) => {
    if (!liveInjuries.includes(flag)) {
      const next = [...liveInjuries, flag];
      setLiveInjuries(next);
      const current = (profile?.injuryFlags || []).slice().sort().join();
      setInjuriesModified(next.slice().sort().join() !== current);
    }
  };

  const handleSaveInjuries = async () => {
    setPreviewLoading(true);
    try {
      const preview = await planApi.injuryPreview(liveInjuries);
      setPreviewData(preview);
      setShowPreview(true);
    } catch {
      Alert.alert(
        'Apply Changes?',
        'Could not calculate program impact. Proceed with saving anyway?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Apply', onPress: doAcceptInjuryChanges },
        ]
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const doAcceptInjuryChanges = async () => {
    setSaving(true);
    setShowPreview(false);
    try {
      const result: any = await planApi.applyInjuryUpdate(liveInjuries);
      // applyInjuryUpdate already persists injuryFlags to MongoDB.
      // Update local React state + AsyncStorage directly (no second backend call)
      // so Fix A's rollback logic doesn't incorrectly fire on a succeeded operation.
      const updatedProfile = { ...profile!, injuryFlags: liveInjuries };
      setProfile(updatedProfile as AthleteProfile);
      await saveProfile(updatedProfile as AthleteProfile);
      setInjuriesModified(false);
      const swapped = result?.exercises_swapped ?? 0;
      const msg = swapped > 0
        ? `Program updated! ${swapped} exercise${swapped > 1 ? 's' : ''} adjusted for your injuries.`
        : (result?.message || 'Profile saved. Your program will adapt next session.');
      Alert.alert('Changes Saved', msg, [{ text: 'Got it' }]);
    } catch {
      Alert.alert('Error', 'Could not apply changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Weaknesses (always editable, auto-save on change) ─────────────────────
  const handleRemoveWeakness = async (w: string) => {
    const next = liveWeaknesses.filter(x => x !== w);
    setLiveWeaknesses(next);
    await updateProfile({ primaryWeaknesses: next, weaknesses: next });
  };

  const handleAddWeakness = async (w: string) => {
    if (!liveWeaknesses.includes(w)) {
      const next = [...liveWeaknesses, w];
      setLiveWeaknesses(next);
      await updateProfile({ primaryWeaknesses: next, weaknesses: next });
    }
  };

  // ── Notification + unit toggles ───────────────────────────────────────────
  const toggleUnit = () => updateProfile({ units: profile?.units === 'lbs' ? 'kg' : 'lbs' });

  const toggleNotif = (key: keyof AthleteProfile['notifications']) => {
    if (!profile) return;
    const notifs = { ...profile.notifications, [key]: !profile.notifications?.[key] };
    updateProfile({ notifications: notifs });
  };

  // ── Reset & Sign out ──────────────────────────────────────────────────────

  // ── Rebuild modal state ───────────────────────────────────────────────────
  const [showRebuildModal, setShowRebuildModal] = useState(false);

  // ── Mode-switch state ──────────────────────────────────────────────────────
  const [showModeSwitchModal, setShowModeSwitchModal] = useState(false);
  const [modeSwitching, setModeSwitching] = useState(false);

  const executeSwitchToFree = async () => {
    setModeSwitching(true);
    setShowModeSwitchModal(false);
    try {
      await profileApi.switchMode('free');
      await saveProfile({ ...profile, training_mode: 'free' } as any);
    } catch (e) { console.warn('[ModeSwitchFree] error', e); }
    setModeSwitching(false);
    router.replace('/(tabs)');
  };

  // ── Beta reset modal state ─────────────────────────────────────────────────
  const [showBetaResetModal, setShowBetaResetModal] = useState(false);
  const [betaResetText,      setBetaResetText]      = useState('');
  const [betaResetting,      setBetaResetting]      = useState(false);

  const executeBetaReset = async () => {
    setBetaResetting(true);
    setShowBetaResetModal(false);
    setBetaResetText('');
    try { await profileApi.reset(); } catch {}
    await saveProfile({});
    router.replace('/onboarding-intake');
  };

  function confirmSignOut() {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: async () => {
          await clearAuth();
          router.replace('/auth');
        }},
      ]
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return <View style={s.loading}><ActivityIndicator color={COLORS.accent} /></View>;

  const units     = profile?.units || 'lbs';
  const initials  = getInitials(profile?.name || authUser?.name);
  const goalLabel = (profile as any)?.goal
    ? ((profile as any).goal as string).charAt(0).toUpperCase() + ((profile as any).goal as string).slice(1).replace(/-/g, ' ')
    : null;

  return (
    <SafeAreaView style={s.safe}>
      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn}>
          <MaterialCommunityIcons name="close" size={22} color={COLORS.text.secondary} />
        </TouchableOpacity>
        <Text style={s.title}>SETTINGS</Text>
        <View style={s.headerSpacer}>
          {saving && <ActivityIndicator size="small" color={COLORS.accent} />}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* ── PROFILE CARD ── */}
        <View style={s.profileCard}>
          <View style={s.profileRow}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.profileName}>{profile?.name || authUser?.name || 'Athlete'}</Text>
              {authUser?.email && <Text style={s.profileEmail}>{authUser.email}</Text>}
            </View>
            <TouchableOpacity onPress={openEditProfile} style={s.editProfileBtn} activeOpacity={0.8}>
              <MaterialCommunityIcons name="pencil-outline" size={15} color={COLORS.accent} />
            </TouchableOpacity>
          </View>

          {/* Badges row */}
          <View style={s.badgeRow}>
            {goalLabel && (
              <View style={[s.badge, s.badgeGold]}>
                <Text style={[s.badgeText, s.badgeTextGold]}>{goalLabel}</Text>
              </View>
            )}
            {profile?.experience && (
              <View style={s.badge}>
                <Text style={s.badgeText}>{profile.experience}</Text>
              </View>
            )}
            {profile?.currentBodyweight ? (
              <View style={s.badge}>
                <Text style={s.badgeText}>{profile.currentBodyweight} {units}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* ── TRAINING PROFILE ── */}
        <SectionHeader title="TRAINING PROFILE" />
        <View style={s.card}>
          {profile?.training_mode === 'free' ? (
            <View style={[s.accountRow, { borderBottomWidth: 0 }]}>
              <View style={[s.accountIconWrap, { backgroundColor: 'rgba(42,157,143,0.1)' }]}>
                <MaterialCommunityIcons name="notebook-outline" size={16} color="#2A9D8F" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.accountRowLabel}>Mode: Free training</Text>
                <Text style={s.accountRowDesc}>No plan. Log sessions, track PRs, use the coach.</Text>
              </View>
            </View>
          ) : (
            <>
              <InfoRow label="Current week"   value={`Week ${profile?.currentWeek || 1}`} />
              <InfoRow label="Program start"  value={formatDate(profile?.programStartDate)} />
              <InfoRow label="Training days"  value={`${(profile as any)?.trainingDaysCount || 4} days/week`} last />
            </>
          )}
        </View>

        {/* ── ACTIVE INJURIES ── */}
        <SectionHeader title="ACTIVE INJURIES" />
        <View style={s.card}>
          {liveInjuries.length === 0 ? (
            <View style={s.emptyRow}>
              <MaterialCommunityIcons name="shield-check-outline" size={18} color={COLORS.status.success} />
              <Text style={s.emptyText}>No active injury flags — all clear</Text>
            </View>
          ) : (
            <View style={s.chipWrap}>
              {liveInjuries.map(flag => (
                <View key={flag} style={s.injuryChip}>
                  <Text style={s.injuryChipText}>{flag}</Text>
                  <TouchableOpacity
                    onPress={() => handleRemoveInjury(flag)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialCommunityIcons name="close" size={12} color="rgba(229,87,87,0.8)" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity style={s.addLink} onPress={() => setShowAddInjury(true)}>
            <MaterialCommunityIcons name="plus" size={14} color={COLORS.accent} />
            <Text style={s.addLinkText}>Add injury flag</Text>
          </TouchableOpacity>

          {injuriesModified && (
            <TouchableOpacity
              style={[s.saveInjuriesBtn, (saving || previewLoading) && { opacity: 0.6 }]}
              onPress={handleSaveInjuries}
              disabled={saving || previewLoading}
              activeOpacity={0.85}
            >
              {(saving || previewLoading) ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <>
                  <MaterialCommunityIcons name="content-save-outline" size={15} color={COLORS.primary} />
                  <Text style={s.saveInjuriesBtnText}>Save injury changes</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* ── Ask Coach about injuries ── */}
          {liveInjuries.length > 0 && (
            <AskCoachButton
              seedPrompt={`Given my injury list (${liveInjuries.join(', ')}), what modifications should I make to my training right now?`}
              triggerName="injury_modification_inquiry"
              label="Ask Coach about injuries"
              size="sm"
              style={{ marginTop: 10 }}
            />
          )}
        </View>

        {/* ── WEAKNESSES & TARGETS ── */}
        <SectionHeader title="WEAKNESSES & TARGETS" />
        <View style={s.card}>
          {liveWeaknesses.length === 0 ? (
            <View style={s.emptyRow}>
              <MaterialCommunityIcons name="target" size={18} color={COLORS.text.muted} />
              <Text style={s.emptyText}>No weaknesses set yet</Text>
            </View>
          ) : (
            <View style={s.chipWrap}>
              {liveWeaknesses.map(w => (
                <View key={w} style={[s.injuryChip, s.weaknessChip]}>
                  <Text style={[s.injuryChipText, s.weaknessChipText]}>{w}</Text>
                  <TouchableOpacity
                    onPress={() => handleRemoveWeakness(w)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialCommunityIcons name="close" size={12} color="rgba(201,168,76,0.7)" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          <TouchableOpacity style={s.addLink} onPress={() => setShowAddWeakness(true)}>
            <MaterialCommunityIcons name="plus" size={14} color={COLORS.accent} />
            <Text style={s.addLinkText}>Add weakness</Text>
          </TouchableOpacity>
        </View>

        {/* ── PREFERENCES ── */}
        <SectionHeader title="PREFERENCES" />
        <View style={s.card}>
          <View style={s.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.settingLabel}>Weight units</Text>
              <Text style={s.settingDesc}>Affects all weights, calculators, and plate math</Text>
            </View>
            <View style={s.unitToggleRow}>
              <Text style={[s.unitLabel, profile?.units === 'lbs' && s.unitLabelActive]}>lbs</Text>
              <Switch
                value={profile?.units === 'kg'}
                onValueChange={toggleUnit}
                trackColor={{ false: COLORS.surfaceHighlight, true: COLORS.accent }}
                thumbColor={COLORS.text.primary}
              />
              <Text style={[s.unitLabel, profile?.units === 'kg' && s.unitLabelActive]}>kg</Text>
            </View>
          </View>

          <View style={[s.settingRow, { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.md, marginTop: SPACING.md }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.settingLabel}>Marketing emails</Text>
              <Text style={s.settingDesc}>Training tips, features, and updates</Text>
            </View>
            <Switch
              value={marketingOptIn}
              onValueChange={async (val) => {
                setMarketingOptIn(val);
                try {
                  // Audit Bug #7 fix: route through authApi.updatePreferences
                  // so it picks up retry/401 handling like every other call.
                  // Previously this used raw fetch() which silently swallowed
                  // errors — toggle would appear to work but never persist.
                  await authApi.updatePreferences({ marketingOptIn: val });
                } catch (e) {
                  console.warn('[Settings] marketing pref update failed:', e);
                  // Roll back the visual toggle so it matches the actual state
                  setMarketingOptIn(!val);
                }
              }}
              trackColor={{ false: COLORS.surfaceHighlight, true: COLORS.accent }}
              thumbColor={COLORS.text.primary}
            />
          </View>
        </View>

        {/* ── NOTIFICATIONS ── */}
        <SectionHeader title="NOTIFICATIONS" />
        <View style={s.card}>
          <SimpleNotifRow
            label="Daily reminder"
            value={profile?.notifications?.dailyReminder ?? true}
            onToggle={() => toggleNotif('dailyReminder')}
          />
          <SimpleNotifRow
            label="Recovery week alert"
            value={profile?.notifications?.deloadAlert ?? true}
            onToggle={() => toggleNotif('deloadAlert')}
          />
          <SimpleNotifRow
            label="PR alert"
            value={profile?.notifications?.prAlert ?? true}
            onToggle={() => toggleNotif('prAlert')}
          />
          <SimpleNotifRow
            label="Weekly check-in"
            value={profile?.notifications?.weeklyCheckin ?? true}
            onToggle={() => toggleNotif('weeklyCheckin')}
            last
          />
        </View>

        {/* ── ACCOUNT ── */}
        <SectionHeader title="ACCOUNT" />
        <View style={s.card}>
          {/* Mode switcher row */}
          {profile?.training_mode === 'free' ? (
            <TouchableOpacity style={s.accountRow} onPress={() => router.push({ pathname: '/onboarding-path-picker', params: { mode: 'switch' } })} activeOpacity={0.7}>
              <View style={[s.accountIconWrap, { backgroundColor: 'rgba(201,168,76,0.1)' }]}>
                <MaterialCommunityIcons name="brain" size={16} color={COLORS.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.accountRowLabel}>Switch to a program</Text>
                <Text style={s.accountRowDesc}>Get an AI-built or imported plan. Logs and coach history kept.</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text.muted} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.accountRow} onPress={() => setShowModeSwitchModal(true)} activeOpacity={0.7} disabled={modeSwitching}>
              <View style={[s.accountIconWrap, { backgroundColor: 'rgba(42,157,143,0.1)' }]}>
                {modeSwitching
                  ? <ActivityIndicator size="small" color="#2A9D8F" />
                  : <MaterialCommunityIcons name="notebook-outline" size={16} color="#2A9D8F" />
                }
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.accountRowLabel}>Switch to free training</Text>
                <Text style={s.accountRowDesc}>Drop the plan, keep your logs and coach</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text.muted} />
            </TouchableOpacity>
          )}

          {/* Rebuild program — non-destructive (program mode only) */}
          {profile?.training_mode !== 'free' && (
          <TouchableOpacity style={s.accountRow} onPress={() => setShowRebuildModal(true)} activeOpacity={0.7}>
            <View style={[s.accountIconWrap, { backgroundColor: 'rgba(201,168,76,0.1)' }]}>
              <MaterialCommunityIcons name="refresh" size={16} color={COLORS.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.accountRowLabel}>Rebuild program</Text>
              <Text style={s.accountRowDesc}>Update goals & regenerate plan — history kept</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text.muted} />
          </TouchableOpacity>
          )}

          {/* Sign out */}
          <TouchableOpacity
            style={[s.accountRow, { borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 4, paddingTop: SPACING.md + 2 }]}
            onPress={confirmSignOut}
            activeOpacity={0.7}
          >
            <View style={[s.accountIconWrap, { backgroundColor: '#EF535015' }]}>
              <MaterialCommunityIcons name="logout" size={16} color="#EF5350" />
            </View>
            <Text style={s.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>

        {/* ── BETA TESTER TOOLS (only visible when is_beta_tester=true) ── */}
        {profile?.is_beta_tester === true && (
          <>
            <SectionHeader title="BETA TESTER TOOLS" />
            <View style={[s.card, s.betaCard]}>
              <View style={s.betaWarningRow}>
                <MaterialCommunityIcons name="skull-outline" size={16} color="#EF5350" />
                <Text style={s.betaWarningText}>
                  Destructive actions. For developer & tester use only.
                </Text>
              </View>
              <TouchableOpacity
                style={[s.accountRow, { paddingTop: SPACING.sm, marginTop: SPACING.sm, borderTopWidth: 1, borderTopColor: 'rgba(239,83,80,0.15)' }]}
                onPress={() => { setBetaResetText(''); setShowBetaResetModal(true); }}
                activeOpacity={0.7}
                disabled={betaResetting}
              >
                <View style={[s.accountIconWrap, { backgroundColor: '#EF535015' }]}>
                  {betaResetting
                    ? <ActivityIndicator size="small" color="#EF5350" />
                    : <MaterialCommunityIcons name="delete-forever-outline" size={16} color="#EF5350" />
                  }
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.accountRowLabel, { color: '#EF5350' }]}>Reset everything</Text>
                  <Text style={s.accountRowDesc}>Wipe all data — plan, history, logs, profile</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={18} color={COLORS.text.muted} />
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* App version footer */}
        <View style={s.appVersionRow}>
          <Image
            source={require('../assets/logo-icon-tight.png')}
            resizeMode="contain"
            style={s.appVersionIcon}
          />
          <Text style={s.appVersionText}>The Program  ·  v1.0.0</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── EDIT PROFILE MODAL ─────────────────────────────────────────────── */}
      <Modal visible={showEditProfile} transparent animationType="slide" onRequestClose={() => setShowEditProfile(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowEditProfile(false)}>
            <TouchableOpacity activeOpacity={1}>
              <View style={s.modalSheet}>
                <View style={s.modalHandle} />
                <Text style={s.modalTitle}>Edit Profile</Text>

                <View style={s.fieldGroup}>
                  <Text style={s.fieldLabel}>NAME</Text>
                  <TextInput
                    style={s.fieldInput}
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Your name"
                    placeholderTextColor={COLORS.text.muted}
                    returnKeyType="next"
                    autoFocus
                  />
                </View>

                <View style={s.fieldGroup}>
                  <Text style={s.fieldLabel}>BODY WEIGHT</Text>
                  <View style={s.fieldInputRow}>
                    <TextInput
                      style={[s.fieldInput, { flex: 1 }]}
                      value={editWeight}
                      onChangeText={v => setEditWeight(v.replace(/[^0-9.]/g, ''))}
                      placeholder="0"
                      placeholderTextColor={COLORS.text.muted}
                      keyboardType="decimal-pad"
                      selectTextOnFocus
                    />
                    <Text style={s.fieldUnit}>{units}</Text>
                  </View>
                </View>

                <View style={s.fieldGroup}>
                  <Text style={s.fieldLabel}>EXPERIENCE LEVEL</Text>
                  <View style={s.expChipsRow}>
                    {EXPERIENCE_LEVELS.map(level => (
                      <TouchableOpacity
                        key={level}
                        style={[s.expChip, editExp === level && s.expChipActive]}
                        onPress={() => setEditExp(level)}
                        activeOpacity={0.8}
                      >
                        <Text style={[s.expChipText, editExp === level && s.expChipTextActive]}>
                          {level}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <TouchableOpacity style={s.saveBtn} onPress={handleSaveProfile} activeOpacity={0.85}>
                  <Text style={s.saveBtnText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.cancelLink} onPress={() => setShowEditProfile(false)}>
                  <Text style={s.cancelLinkText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── ADD INJURY MODAL ─────────────────────────────────────────────── */}
      <Modal visible={showAddInjury} transparent animationType="slide" onRequestClose={() => setShowAddInjury(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowAddInjury(false)}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Add Injury Flag</Text>
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              <View style={s.modalChipWrap}>
                {ALL_INJURIES.filter(inj => !liveInjuries.includes(inj)).map(inj => (
                  <TouchableOpacity
                    key={inj}
                    style={s.modalChip}
                    onPress={() => {
                      handleAddInjury(inj);
                      setShowAddInjury(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={s.modalChipText}>{inj}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <TouchableOpacity
              style={[s.saveBtn, { marginTop: 12, marginHorizontal: 0 }]}
              onPress={() => setShowAddInjury(false)}
            >
              <Text style={s.saveBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── ADD WEAKNESS MODAL ───────────────────────────────────────────── */}
      <Modal visible={showAddWeakness} transparent animationType="slide" onRequestClose={() => setShowAddWeakness(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowAddWeakness(false)}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Add Weakness / Target</Text>
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              <View style={s.modalChipWrap}>
                {ALL_WEAKNESSES.filter(w => !liveWeaknesses.includes(w)).map(w => (
                  <TouchableOpacity
                    key={w}
                    style={s.modalChip}
                    onPress={() => {
                      handleAddWeakness(w);
                      setShowAddWeakness(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={s.modalChipText}>{w}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <TouchableOpacity
              style={[s.saveBtn, { marginTop: 12, marginHorizontal: 0 }]}
              onPress={() => setShowAddWeakness(false)}
            >
              <Text style={s.saveBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── SWITCH TO FREE TRAINING CONFIRM MODAL ────────────────────────── */}
      <Modal visible={showModeSwitchModal} transparent animationType="slide" onRequestClose={() => setShowModeSwitchModal(false)}>
        <View style={s.previewOverlay}>
          <View style={s.previewSheet}>
            <View style={s.previewHeader}>
              <MaterialCommunityIcons name="notebook-outline" size={22} color="#2A9D8F" />
              <Text style={s.previewTitle}>Switch to free training?</Text>
            </View>
            <Text style={s.previewSummary}>
              Your plan will be archived — not deleted. You'll keep all logs, PRs, and coach memory. You can switch back anytime via "Switch to a program."
            </Text>
            <View style={[s.rebuildSection, { marginBottom: SPACING.md }]}>
              <View style={[s.rebuildSectionHeader, { backgroundColor: 'rgba(76,175,80,0.1)', borderColor: 'rgba(76,175,80,0.25)' }]}>
                <MaterialCommunityIcons name="check-circle-outline" size={15} color="#4CAF50" />
                <Text style={[s.rebuildSectionLabel, { color: '#4CAF50' }]}>KEPT</Text>
              </View>
              {['Training logs & sessions', 'PRs & personal records', 'Coach memory', 'Streaks & badges'].map(item => (
                <View key={item} style={s.rebuildItem}>
                  <MaterialCommunityIcons name="check" size={13} color="#4CAF50" />
                  <Text style={s.rebuildItemText}>{item}</Text>
                </View>
              ))}
            </View>
            <View style={[s.rebuildSection, { marginBottom: SPACING.lg }]}>
              <View style={[s.rebuildSectionHeader, { backgroundColor: 'rgba(120,120,140,0.1)', borderColor: 'rgba(120,120,140,0.25)' }]}>
                <MaterialCommunityIcons name="archive-outline" size={15} color={COLORS.text.muted} />
                <Text style={[s.rebuildSectionLabel, { color: COLORS.text.muted }]}>ARCHIVED</Text>
              </View>
              {['Workout plan', 'Scheduled sessions'].map(item => (
                <View key={item} style={s.rebuildItem}>
                  <MaterialCommunityIcons name="arrow-right" size={13} color={COLORS.text.muted} />
                  <Text style={s.rebuildItemText}>{item}</Text>
                </View>
              ))}
            </View>
            <View style={s.previewActions}>
              <TouchableOpacity style={[s.acceptBtn, { backgroundColor: '#2A9D8F' }]} onPress={executeSwitchToFree} activeOpacity={0.85}>
                <MaterialCommunityIcons name="notebook-outline" size={18} color="#fff" />
                <Text style={[s.acceptBtnText, { color: '#fff' }]}>Switch to free training</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelPreviewBtn} onPress={() => setShowModeSwitchModal(false)} activeOpacity={0.8}>
                <Text style={s.cancelPreviewText}>Cancel — keep my program</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── REBUILD CONFIRMATION MODAL ───────────────────────────────────── */}
      <Modal visible={showRebuildModal} transparent animationType="slide" onRequestClose={() => setShowRebuildModal(false)}>
        <View style={s.previewOverlay}>
          <View style={s.previewSheet}>
            <View style={s.previewHeader}>
              <MaterialCommunityIcons name="refresh" size={22} color={COLORS.accent} />
              <Text style={s.previewTitle}>Rebuild Your Program</Text>
            </View>
            <Text style={s.previewSummary}>
              We'll take you through the setup flow so you can update your goals, training days, or any other preferences. Your new plan will be generated when you finish.
            </Text>

            {/* KEPT */}
            <View style={s.rebuildSection}>
              <View style={[s.rebuildSectionHeader, { backgroundColor: 'rgba(76,175,80,0.1)', borderColor: 'rgba(76,175,80,0.25)' }]}>
                <MaterialCommunityIcons name="check-circle-outline" size={15} color="#4CAF50" />
                <Text style={[s.rebuildSectionLabel, { color: '#4CAF50' }]}>KEPT</Text>
              </View>
              {[
                'Training logs & session history',
                'PRs & personal records',
                'Coach memory & chat history',
                'Streaks & badges',
                'Body weight history',
              ].map(item => (
                <View key={item} style={s.rebuildItem}>
                  <MaterialCommunityIcons name="check" size={13} color="#4CAF50" />
                  <Text style={s.rebuildItemText}>{item}</Text>
                </View>
              ))}
            </View>

            {/* UPDATED */}
            <View style={[s.rebuildSection, { marginTop: SPACING.md }]}>
              <View style={[s.rebuildSectionHeader, { backgroundColor: 'rgba(201,168,76,0.1)', borderColor: 'rgba(201,168,76,0.25)' }]}>
                <MaterialCommunityIcons name="refresh" size={15} color={COLORS.accent} />
                <Text style={[s.rebuildSectionLabel, { color: COLORS.accent }]}>UPDATED</Text>
              </View>
              {[
                'Workout plan & programming',
                'Exercise selection & rotation',
                'Training split & frequency',
                'Load prescriptions',
              ].map(item => (
                <View key={item} style={s.rebuildItem}>
                  <MaterialCommunityIcons name="arrow-right" size={13} color={COLORS.accent} />
                  <Text style={s.rebuildItemText}>{item}</Text>
                </View>
              ))}
            </View>

            <View style={[s.previewActions, { marginTop: SPACING.lg }]}>
              <TouchableOpacity
                style={s.acceptBtn}
                onPress={() => {
                  setShowRebuildModal(false);
                  router.push({ pathname: '/onboarding-intake', params: { mode: 'rebuild' } });
                }}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons name="refresh" size={18} color={COLORS.primary} />
                <Text style={s.acceptBtnText}>Update My Program</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelPreviewBtn} onPress={() => setShowRebuildModal(false)} activeOpacity={0.8}>
                <Text style={s.cancelPreviewText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── BETA RESET TYPED CONFIRMATION MODAL ──────────────────────────── */}
      <Modal visible={showBetaResetModal} transparent animationType="slide" onRequestClose={() => setShowBetaResetModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.previewOverlay}>
            <View style={[s.previewSheet, s.betaModalSheet]}>
              <View style={s.betaModalHeader}>
                <MaterialCommunityIcons name="skull-outline" size={28} color="#EF5350" />
                <Text style={s.betaModalTitle}>DANGER ZONE</Text>
              </View>
              <Text style={s.betaModalWarning}>
                This wipes ALL data permanently: training plan, logs, PRs, profile, coach memory, streaks, and badges.
              </Text>
              <Text style={s.betaModalWarning2}>
                This cannot be undone. There is no recovery.
              </Text>

              <Text style={s.betaModalInputLabel}>Type RESET to confirm</Text>
              <TextInput
                style={s.betaModalInput}
                value={betaResetText}
                onChangeText={t => setBetaResetText(t.toUpperCase())}
                placeholder="RESET"
                placeholderTextColor="#444"
                autoCapitalize="characters"
                returnKeyType="done"
                autoFocus
              />

              <View style={[s.previewActions, { marginTop: SPACING.lg }]}>
                <TouchableOpacity
                  style={[s.betaResetBtn, betaResetText !== 'RESET' && { opacity: 0.4 }]}
                  onPress={executeBetaReset}
                  disabled={betaResetText !== 'RESET'}
                  activeOpacity={0.85}
                >
                  <MaterialCommunityIcons name="delete-forever-outline" size={18} color="#fff" />
                  <Text style={s.betaResetBtnText}>Delete Everything</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.cancelPreviewBtn}
                  onPress={() => { setShowBetaResetModal(false); setBetaResetText(''); }}
                  activeOpacity={0.8}
                >
                  <Text style={s.cancelPreviewText}>Cancel — Keep My Data</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── INJURY PREVIEW MODAL ─────────────────────────────────────────── */}
      <Modal visible={showPreview} transparent animationType="slide" onRequestClose={() => setShowPreview(false)}>
        <View style={s.previewOverlay}>
          <View style={s.previewSheet}>
            <View style={s.previewHeader}>
              <MaterialCommunityIcons name="alert-circle-outline" size={22} color={COLORS.accent} />
              <Text style={s.previewTitle}>Review Program Changes</Text>
            </View>
            <Text style={s.previewSummary}>{previewData?.summary}</Text>

            <ScrollView style={s.previewScroll} showsVerticalScrollIndicator={false}>
              {(previewData?.addedInjuries?.length ?? 0) > 0 && (
                <View style={s.previewSection}>
                  <Text style={[s.previewSectionLabel, { color: COLORS.status.error }]}>Injuries Being Added</Text>
                  <View style={s.previewChipRow}>
                    {previewData!.addedInjuries.map(inj => (
                      <View key={inj} style={[s.previewChip, s.previewChipRed]}>
                        <Text style={s.previewChipTextRed}>{inj}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
              {(previewData?.removedInjuries?.length ?? 0) > 0 && (
                <View style={s.previewSection}>
                  <Text style={[s.previewSectionLabel, { color: COLORS.status.success }]}>Injuries Resolved</Text>
                  <View style={s.previewChipRow}>
                    {previewData!.removedInjuries.map(inj => (
                      <View key={inj} style={[s.previewChip, s.previewChipGreen]}>
                        <Text style={s.previewChipTextGreen}>{inj}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
              {(previewData?.exercisesRestricted?.length ?? 0) > 0 && (
                <View style={s.previewSection}>
                  <Text style={s.previewSectionLabel}>⛔ Exercises Being Restricted</Text>
                  {previewData!.exercisesRestricted.map(ex => (
                    <View key={ex.name} style={s.previewExRow}>
                      <View style={s.previewExLeft}>
                        <Text style={s.previewExName}>{ex.name}</Text>
                        <Text style={s.previewExCat}>{ex.category}</Text>
                      </View>
                      <Text style={s.previewExReason}>{ex.reason}</Text>
                    </View>
                  ))}
                </View>
              )}
              {(previewData?.exercisesRestored?.length ?? 0) > 0 && (
                <View style={s.previewSection}>
                  <Text style={s.previewSectionLabel}>✅ Exercises Restored</Text>
                  {previewData!.exercisesRestored.map(ex => (
                    <View key={ex.name} style={s.previewExRow}>
                      <View style={s.previewExLeft}>
                        <Text style={s.previewExName}>{ex.name}</Text>
                        <Text style={s.previewExCat}>{ex.category}</Text>
                      </View>
                      <Text style={[s.previewExReason, { color: COLORS.status.success }]}>{ex.reason}</Text>
                    </View>
                  ))}
                </View>
              )}
              {(previewData?.exercisesRestricted?.length ?? 0) === 0 &&
               (previewData?.exercisesRestored?.length ?? 0) === 0 && (
                <View style={s.previewNoChange}>
                  <MaterialCommunityIcons name="check-circle-outline" size={24} color={COLORS.accent} />
                  <Text style={s.previewNoChangeText}>No specific exercises are affected by this change.</Text>
                </View>
              )}
            </ScrollView>

            <View style={s.previewActions}>
              <TouchableOpacity
                style={s.acceptBtn}
                onPress={doAcceptInjuryChanges}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                ) : (
                  <>
                    <MaterialCommunityIcons name="check" size={18} color={COLORS.primary} />
                    <Text style={s.acceptBtnText}>Accept & Apply Changes</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelPreviewBtn} onPress={() => setShowPreview(false)} activeOpacity={0.8}>
                <Text style={s.cancelPreviewText}>Cancel — Keep Editing</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <Text style={sh.text}>{title}</Text>
  );
}
const sh = StyleSheet.create({
  text: {
    fontSize: 10, fontWeight: '700' as any, color: '#555',
    letterSpacing: 1.5, textTransform: 'uppercase',
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg + 4, paddingBottom: SPACING.sm,
  },
});

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[ir.row, !last && { borderBottomWidth: 1, borderBottomColor: '#1A1A1E' }]}>
      <Text style={ir.label}>{label}</Text>
      <Text style={ir.value}>{value}</Text>
    </View>
  );
}
const ir = StyleSheet.create({
  row:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11 },
  label: { color: '#888', fontSize: 14 },
  value: { color: '#E8E8E6', fontWeight: '600' as any, fontSize: 14, maxWidth: '60%', textAlign: 'right' },
});

function SimpleNotifRow({ label, value, onToggle, last }: { label: string; value: boolean; onToggle: () => void; last?: boolean }) {
  return (
    <View style={[nr.row, !last && { borderBottomWidth: 1, borderBottomColor: '#1A1A1E' }]}>
      <Text style={nr.label}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: COLORS.surfaceHighlight, true: COLORS.accent }}
        thumbColor='#E8E8E6'
      />
    </View>
  );
}
const nr = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11 },
  label: { color: '#E8E8E6', fontSize: 14, fontWeight: '500' as any },
});

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: COLORS.background },
  scroll:  { paddingBottom: SPACING.lg },
  loading: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },

  // Header
  header:       { flexDirection: 'row', alignItems: 'center', padding: SPACING.lg, paddingTop: SPACING.xl },
  headerBtn:    { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerSpacer: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  title:        { flex: 1, fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, letterSpacing: 2, textAlign: 'center' },

  // Profile card
  profileCard:    { marginHorizontal: SPACING.lg, backgroundColor: '#111114', borderRadius: 12, padding: SPACING.lg, borderWidth: 1, borderColor: '#1E1E22', marginBottom: SPACING.sm },
  profileRow:     { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.md },
  avatar:         { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(201,168,76,0.12)', borderWidth: 2, borderColor: 'rgba(201,168,76,0.35)', justifyContent: 'center', alignItems: 'center' },
  avatarText:     { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.heavy, color: COLORS.accent },
  profileName:    { fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, lineHeight: 26 },
  profileEmail:   { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, marginTop: 2 },
  editProfileBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(201,168,76,0.1)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)', justifyContent: 'center', alignItems: 'center' },
  badgeRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  badge:          { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100, backgroundColor: '#1E1E22', borderWidth: 1, borderColor: '#2A2A2E' },
  badgeGold:      { backgroundColor: 'rgba(201,168,76,0.08)', borderColor: 'rgba(201,168,76,0.25)' },
  badgeText:      { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, fontWeight: FONTS.weights.semibold },
  badgeTextGold:  { color: COLORS.accent },

  // Cards
  card: { marginHorizontal: SPACING.lg, backgroundColor: '#111114', borderRadius: 12, padding: SPACING.lg, borderWidth: 1, borderColor: '#1E1E22', marginBottom: SPACING.sm },

  // Chips (injuries + weaknesses)
  chipWrap:       { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.sm },
  injuryChip:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(229,87,87,0.1)', borderRadius: 100, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(229,87,87,0.25)' },
  injuryChipText: { fontSize: FONTS.sizes.xs, color: '#E55757', fontWeight: FONTS.weights.semibold },
  weaknessChip:   { backgroundColor: 'rgba(201,168,76,0.08)', borderColor: 'rgba(201,168,76,0.2)' },
  weaknessChipText:{ color: COLORS.accent },

  addLink:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: SPACING.sm, marginTop: SPACING.xs },
  addLinkText: { fontSize: FONTS.sizes.sm, color: COLORS.accent, fontWeight: FONTS.weights.semibold },

  emptyRow:    { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.xs },
  emptyText:   { color: COLORS.text.muted, fontSize: FONTS.sizes.sm, fontStyle: 'italic' },

  saveInjuriesBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, marginTop: SPACING.md, backgroundColor: COLORS.accent, borderRadius: 12, paddingVertical: 12 },
  saveInjuriesBtnText: { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.heavy, color: COLORS.primary },

  // Preferences
  settingRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md },
  settingLabel:    { color: '#E8E8E6', fontSize: 14, fontWeight: '600' as any, marginBottom: 2 },
  settingDesc:     { color: '#888', fontSize: FONTS.sizes.xs },
  unitToggleRow:   { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  unitLabel:       { color: COLORS.text.muted, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.sm },
  unitLabelActive: { color: COLORS.accent },

  // Account rows
  accountRow:      { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.sm },
  accountIconWrap: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  accountRowLabel: { fontSize: 14, fontWeight: '600' as any, color: COLORS.text.primary, marginBottom: 2 },
  accountRowDesc:  { fontSize: FONTS.sizes.xs, color: '#888' },
  signOutText:     { fontSize: 14, fontWeight: '600' as any, color: '#EF5350', flex: 1 },

  // App version
  appVersionRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: SPACING.xl, marginBottom: SPACING.md },
  appVersionIcon: { width: 20, height: 20, opacity: 0.4 },
  appVersionText: { textAlign: 'center', fontSize: FONTS.sizes.xs, color: '#333' },

  // Edit Profile / Add modals shared
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet:   { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.xl, paddingBottom: SPACING.xxl },
  modalHandle:  { width: 40, height: 4, borderRadius: 2, backgroundColor: '#3A3A3E', alignSelf: 'center', marginBottom: SPACING.lg },
  modalTitle:   { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, marginBottom: SPACING.lg },
  modalChipWrap:{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, paddingBottom: SPACING.lg },
  modalChip:    { paddingHorizontal: SPACING.md, paddingVertical: 10, borderRadius: 100, backgroundColor: '#1E1E22', borderWidth: 1.5, borderColor: '#2A2A2E' },
  modalChipText:{ fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, fontWeight: FONTS.weights.medium },

  // Edit profile modal fields
  fieldGroup:    { gap: SPACING.xs, marginBottom: SPACING.md },
  fieldLabel:    { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold, color: COLORS.text.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  fieldInput:    { backgroundColor: '#1E1E22', borderRadius: 12, paddingHorizontal: SPACING.md, height: 48, fontSize: FONTS.sizes.base, color: COLORS.text.primary, borderWidth: 1, borderColor: '#2A2A2E' },
  fieldInputRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  fieldUnit:     { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, fontWeight: FONTS.weights.bold },
  expChipsRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
  expChip:       { paddingHorizontal: SPACING.md, paddingVertical: 9, borderRadius: 100, backgroundColor: '#1E1E22', borderWidth: 1.5, borderColor: '#2A2A2E' },
  expChipActive:    { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  expChipText:      { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, fontWeight: FONTS.weights.semibold },
  expChipTextActive:{ color: COLORS.primary, fontWeight: FONTS.weights.heavy },

  saveBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.accent, borderRadius: 16, height: 52, marginTop: SPACING.md },
  saveBtnText: { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, color: COLORS.primary },
  cancelLink:  { height: 44, justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  cancelLinkText:{ fontSize: FONTS.sizes.sm, color: COLORS.text.muted },

  // Injury preview modal
  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  previewSheet:   { backgroundColor: '#111115', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl, maxHeight: '90%' },
  previewHeader:  { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  previewTitle:   { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  previewSummary: { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, marginBottom: SPACING.lg, lineHeight: 20 },
  previewScroll:  { maxHeight: 320, marginBottom: SPACING.lg },
  previewSection: { marginBottom: SPACING.lg },
  previewSectionLabel: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold, color: COLORS.accent, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: SPACING.sm },
  previewChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  previewChip:         { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100 },
  previewChipRed:      { backgroundColor: 'rgba(229,87,87,0.12)', borderWidth: 1, borderColor: 'rgba(229,87,87,0.3)' },
  previewChipTextRed:  { fontSize: FONTS.sizes.xs, color: COLORS.status.error, fontWeight: FONTS.weights.semibold },
  previewChipGreen:     { backgroundColor: 'rgba(76,175,80,0.12)', borderWidth: 1, borderColor: 'rgba(76,175,80,0.3)' },
  previewChipTextGreen: { fontSize: FONTS.sizes.xs, color: COLORS.status.success, fontWeight: FONTS.weights.semibold },
  previewExRow:    { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1E1E22', gap: SPACING.sm },
  previewExLeft:   { flex: 1 },
  previewExName:   { fontSize: FONTS.sizes.sm, color: COLORS.text.primary, fontWeight: FONTS.weights.semibold },
  previewExCat:    { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, marginTop: 2 },
  previewExReason: { fontSize: FONTS.sizes.xs, color: COLORS.status.error, maxWidth: '40%', textAlign: 'right', lineHeight: 16 },
  previewNoChange: { alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.xl },
  previewNoChangeText: { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, textAlign: 'center' },
  previewActions:  { gap: SPACING.sm },
  acceptBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: COLORS.accent, borderRadius: 16, height: 52, shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 6 },
  acceptBtnText:     { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, color: COLORS.primary },
  cancelPreviewBtn:  { height: 44, justifyContent: 'center', alignItems: 'center' },
  cancelPreviewText: { fontSize: FONTS.sizes.sm, color: COLORS.text.muted },

  // Rebuild modal
  rebuildSection:       { borderRadius: 14, overflow: 'hidden' },
  rebuildSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.md, paddingVertical: 9, borderWidth: 1, borderRadius: 14, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  rebuildSectionLabel:  { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.heavy, letterSpacing: 1.2, textTransform: 'uppercase' },
  rebuildItem:          { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.md, paddingVertical: 8, backgroundColor: 'rgba(255,255,255,0.03)', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  rebuildItemText:      { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary },

  // Beta tester section
  betaCard:         { borderColor: 'rgba(239,83,80,0.2)', borderWidth: 1 },
  betaWarningRow:   { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  betaWarningText:  { flex: 1, fontSize: FONTS.sizes.xs, color: '#EF5350', lineHeight: 18 },

  // Beta reset modal
  betaModalSheet:     { backgroundColor: '#110808' },
  betaModalHeader:    { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  betaModalTitle:     { fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.heavy, color: '#EF5350', letterSpacing: 1.5 },
  betaModalWarning:   { fontSize: FONTS.sizes.sm, color: '#EF5350', marginBottom: SPACING.sm, lineHeight: 20, opacity: 0.9 },
  betaModalWarning2:  { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, marginBottom: SPACING.lg, lineHeight: 18, fontStyle: 'italic' },
  betaModalInputLabel:{ fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold, color: COLORS.text.muted, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: SPACING.sm },
  betaModalInput:     { backgroundColor: '#1E0808', borderRadius: 12, paddingHorizontal: SPACING.md, height: 52, fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.heavy, color: '#EF5350', borderWidth: 1.5, borderColor: 'rgba(239,83,80,0.3)', textAlign: 'center', letterSpacing: 4 },
  betaResetBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, backgroundColor: '#EF5350', borderRadius: 16, height: 52 },
  betaResetBtnText:   { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, color: '#fff' },
});

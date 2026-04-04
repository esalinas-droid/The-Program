import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView,
  Alert, Switch, ActivityIndicator, TextInput, Modal, KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS } from '../src/constants/theme';
import { getProfile, saveProfile } from '../src/utils/storage';
import { profileApi, planApi, InjuryPreviewResult } from '../src/utils/api';
import { AthleteProfile } from '../src/types';
import { clearAuth, getAuthToken, getStoredUser } from '../src/utils/auth';

// ── Injury list (mirrors onboarding) ────────────────────────────────────────────

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

// ── Component ────────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const router = useRouter();

  // ── Profile state ───────────────────────────────────────────────────────────
  const [profile,  setProfile]  = useState<AthleteProfile | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(true);
  const [authUser, setAuthUser] = useState<{ email?: string; name?: string } | null>(null);

  // ── Edit mode state ────────────────────────────────────────────────────────
  const [editMode,         setEditMode]         = useState(false);
  const [editedName,       setEditedName]       = useState('');
  const [editedBodyweight, setEditedBodyweight] = useState('');
  const [editedExperience, setEditedExperience] = useState('');
  const [editedInjuries,   setEditedInjuries]   = useState<string[]>([]);
  const [editedWeaknesses, setEditedWeaknesses] = useState<string[]>([]);

  // ── Modal state ────────────────────────────────────────────────────────────
  const [showAddInjury,   setShowAddInjury]   = useState(false);
  const [showAddWeakness, setShowAddWeakness] = useState(false);
  const [showPreview,     setShowPreview]     = useState(false);
  const [previewData,     setPreviewData]     = useState<InjuryPreviewResult | null>(null);
  const [previewLoading,  setPreviewLoading]  = useState(false);

  // ── Load profile ─────────────────────────────────────────────────────────────
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
          p = { ...backendProfile, ...p };
          await saveProfile(p);
        }
      } catch {}
      setProfile(p);
      setLoading(false);
    })();
  }, []);

  // ── Edit mode helpers ────────────────────────────────────────────────────────
  const enterEditMode = () => {
    setEditedName(profile?.name || '');
    setEditedBodyweight(String(profile?.currentBodyweight || ''));
    setEditedExperience(profile?.experience || '');
    setEditedInjuries([...(profile?.injuryFlags || [])]);
    setEditedWeaknesses([...(profile?.primaryWeaknesses || profile?.weaknesses || [])]);
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setPreviewData(null);
  };

  // ── Save logic ─────────────────────────────────────────────────────────────
  const injuriesChanged = JSON.stringify([...(profile?.injuryFlags || [])].sort()) !==
                          JSON.stringify([...editedInjuries].sort());

  const handleSaveChanges = async () => {
    if (injuriesChanged) {
      // Need to show preview before saving
      setPreviewLoading(true);
      try {
        const preview = await planApi.injuryPreview(editedInjuries);
        setPreviewData(preview);
        setShowPreview(true);
      } catch (err) {
        // If preview fails, ask user to confirm without preview
        Alert.alert(
          'Apply Changes?',
          'Could not calculate program impact. Proceed with saving injury updates anyway?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Apply', onPress: handleSaveProfileOnly },
          ]
        );
      } finally {
        setPreviewLoading(false);
      }
    } else {
      await handleSaveProfileOnly();
    }
  };

  const handleSaveProfileOnly = async () => {
    setSaving(true);
    try {
      const updates: Partial<AthleteProfile> = {
        name:             editedName || profile?.name || '',
        currentBodyweight: parseFloat(editedBodyweight) || profile?.currentBodyweight || 0,
        experience:       editedExperience || profile?.experience || '',
        primaryWeaknesses: editedWeaknesses,
        weaknesses:       editedWeaknesses,
      } as any;
      const updated = { ...profile, ...updates } as AthleteProfile;
      setProfile(updated);
      await saveProfile(updated);
      await profileApi.update(updates as any);
      setEditMode(false);
    } catch (err) {
      Alert.alert('Error', 'Could not save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleAcceptInjuryChanges = async () => {
    setSaving(true);
    setShowPreview(false);
    try {
      // 1. Apply injury update — NOW also swaps exercises in plan + persists to MongoDB
      const result: any = await planApi.applyInjuryUpdate(editedInjuries);

      // 2. Save all other profile changes
      const updates: Partial<AthleteProfile> = {
        name:              editedName || profile?.name || '',
        currentBodyweight: parseFloat(editedBodyweight) || profile?.currentBodyweight || 0,
        experience:        editedExperience || profile?.experience || '',
        injuryFlags:       editedInjuries,
        primaryWeaknesses: editedWeaknesses,
        weaknesses:        editedWeaknesses,
      } as any;
      const updated = { ...profile, ...updates } as AthleteProfile;
      setProfile(updated);
      await saveProfile(updated);
      await profileApi.update(updates as any);
      setEditMode(false);
      setPreviewData(null);

      // 3. Show meaningful feedback
      const swapped = result?.exercises_swapped ?? 0;
      const msg = swapped > 0
        ? `Program updated! ${swapped} exercise${swapped > 1 ? 's' : ''} adjusted for your injuries. Check the Today tab.`
        : (result?.message || 'Profile saved. Your program will adapt next session.');
      Alert.alert('Changes Saved', msg, [{ text: 'Got it', style: 'default' }]);
    } catch (err) {
      Alert.alert('Error', 'Could not apply changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Other settings helpers ───────────────────────────────────────────────────
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

  // ── Loading state ─────────────────────────────────────────────────────────────
  if (loading) return <View style={s.loading}><ActivityIndicator color={COLORS.accent} /></View>;

  const injuriesForDisplay = editMode ? editedInjuries : (profile?.injuryFlags || []);
  const weaknessesForDisplay = editMode ? editedWeaknesses : (profile?.primaryWeaknesses || profile?.weaknesses || []);

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* ── Header ── */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.headerBtn}>
            <MaterialCommunityIcons name="close" size={22} color={COLORS.text.secondary} />
          </TouchableOpacity>
          <Text style={s.title}>SETTINGS</Text>
          <View style={s.headerRight}>
            {saving && <ActivityIndicator size="small" color={COLORS.accent} />}
            {!editMode ? (
              <TouchableOpacity onPress={enterEditMode} style={s.headerBtn}>
                <MaterialCommunityIcons name="pencil-outline" size={22} color={COLORS.accent} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={cancelEdit} style={s.headerBtn}>
                <MaterialCommunityIcons name="close-circle-outline" size={22} color={COLORS.text.muted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {editMode && (
          <View style={s.editBanner}>
            <MaterialCommunityIcons name="pencil" size={13} color={COLORS.primary} />
            <Text style={s.editBannerText}>Edit Mode — changes not saved until you tap Save</Text>
          </View>
        )}

        <ScrollView showsVerticalScrollIndicator={false}>

          {/* ── ATHLETE ── */}
          <SectionHeader title="ATHLETE" />
          <View style={s.card}>
            {editMode ? (
              <View style={{ gap: SPACING.md }}>
                <View style={s.fieldGroup}>
                  <Text style={s.fieldLabel}>Name</Text>
                  <TextInput
                    style={s.fieldInput}
                    value={editedName}
                    onChangeText={setEditedName}
                    placeholder="Your name"
                    placeholderTextColor={COLORS.text.muted}
                    returnKeyType="next"
                  />
                </View>

                <View style={s.fieldGroup}>
                  <Text style={s.fieldLabel}>Current Body Weight</Text>
                  <View style={s.fieldInputRow}>
                    <TextInput
                      style={[s.fieldInput, { flex: 1 }]}
                      value={editedBodyweight}
                      onChangeText={v => setEditedBodyweight(v.replace(/[^0-9.]/g, ''))}
                      placeholder="0"
                      placeholderTextColor={COLORS.text.muted}
                      keyboardType="decimal-pad"
                      selectTextOnFocus
                    />
                    <Text style={s.fieldUnit}>{profile?.units || 'lbs'}</Text>
                  </View>
                </View>

                <View style={s.fieldGroup}>
                  <Text style={s.fieldLabel}>Experience Level</Text>
                  <View style={s.expChipsRow}>
                    {EXPERIENCE_LEVELS.map(level => (
                      <TouchableOpacity
                        key={level}
                        style={[s.expChip, editedExperience === level && s.expChipActive]}
                        onPress={() => setEditedExperience(level)}
                        activeOpacity={0.8}
                      >
                        <Text style={[s.expChipText, editedExperience === level && s.expChipTextActive]}>
                          {level}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            ) : (
              <>
                <InfoRow label="Name"          value={profile?.name           || '—'} />
                <InfoRow label="Experience"    value={profile?.experience     || '—'} />
                <InfoRow label="Body Weight"   value={profile?.currentBodyweight ? `${profile.currentBodyweight} ${profile.units || 'lbs'}` : '—'} />
                <InfoRow label="Current Week"  value={String(profile?.currentWeek  || 1)} />
                <InfoRow label="Program Start" value={profile?.programStartDate ? new Date(profile.programStartDate).toLocaleDateString() : '—'} />
                {(profile as any)?.goal && (
                  <InfoRow label="Goal" value={((profile as any).goal as string).charAt(0).toUpperCase() + ((profile as any).goal as string).slice(1)} />
                )}
              </>
            )}
          </View>

          {/* ── ACTIVE INJURY FLAGS ── */}
          <SectionHeader title="ACTIVE INJURY FLAGS" />
          <View style={s.card}>
            {injuriesForDisplay.length === 0 ? (
              <View style={s.emptyRow}>
                <MaterialCommunityIcons name="shield-check-outline" size={20} color={COLORS.status.success} />
                <Text style={s.emptyText}>No active injury flags</Text>
              </View>
            ) : (
              <View style={s.injuryChipWrap}>
                {injuriesForDisplay.map(flag => (
                  <View key={flag} style={s.injuryChip}>
                    <Text style={s.injuryChipText}>{flag}</Text>
                    {editMode && (
                      <TouchableOpacity
                        onPress={() => setEditedInjuries(prev => prev.filter(i => i !== flag))}
                        style={s.injuryRemoveBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <MaterialCommunityIcons name="close" size={12} color={COLORS.status.error} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}

            {editMode && (
              <TouchableOpacity style={s.addBtn} onPress={() => setShowAddInjury(true)}>
                <MaterialCommunityIcons name="plus" size={16} color={COLORS.accent} />
                <Text style={s.addBtnText}>Add Injury Flag</Text>
              </TouchableOpacity>
            )}

            {!editMode && (
              <Text style={s.noteText}>
                Tap the pencil icon to update injury flags and sync your program.
              </Text>
            )}

            {editMode && injuriesChanged && (
              <View style={s.injuryChangeBanner}>
                <MaterialCommunityIcons name="alert-outline" size={14} color={COLORS.accent} />
                <Text style={s.injuryChangeBannerText}>
                  Injury flags changed — saving will show a program impact preview
                </Text>
              </View>
            )}
          </View>

          {/* ── WEAKNESSES & TARGETS ── */}
          <SectionHeader title="WEAKNESSES & TARGETS" />
          <View style={s.card}>
            {weaknessesForDisplay.length === 0 ? (
              <View style={s.emptyRow}>
                <MaterialCommunityIcons name="target" size={20} color={COLORS.text.muted} />
                <Text style={s.emptyText}>No weaknesses set</Text>
              </View>
            ) : (
              <View style={s.injuryChipWrap}>
                {weaknessesForDisplay.map(w => (
                  <View key={w} style={[s.injuryChip, s.weaknessChip]}>
                    <Text style={[s.injuryChipText, s.weaknessChipText]}>{w}</Text>
                    {editMode && (
                      <TouchableOpacity
                        onPress={() => setEditedWeaknesses(prev => prev.filter(x => x !== w))}
                        style={s.injuryRemoveBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <MaterialCommunityIcons name="close" size={12} color={COLORS.text.muted} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}

            {editMode && (
              <TouchableOpacity style={s.addBtn} onPress={() => setShowAddWeakness(true)}>
                <MaterialCommunityIcons name="plus" size={16} color={COLORS.accent} />
                <Text style={s.addBtnText}>Add Weakness / Target</Text>
              </TouchableOpacity>
            )}
            {!editMode && (
              <Text style={s.noteText}>Your coach uses these to prioritize accessory work and variation selection.</Text>
            )}
          </View>

          {/* ── UNITS ── */}
          <SectionHeader title="UNITS" />
          <View style={s.card}>
            <View style={s.settingRow}>
              <View>
                <Text style={s.settingLabel}>Weight Units</Text>
                <Text style={s.settingDesc}>Toggle all weights, calculators, and plate math</Text>
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
          </View>

          {/* ── NOTIFICATIONS ── */}
          <SectionHeader title="NOTIFICATIONS" />
          <View style={s.card}>
            <NotifRow
              label="Daily Training Reminder"
              desc="Tomorrow’s session type and main lift"
              value={profile?.notifications?.dailyReminder ?? true}
              onToggle={() => toggleNotif('dailyReminder')}
            />
            <NotifRow
              label="Deload Week Alert"
              desc="Sent Monday of every deload week"
              value={profile?.notifications?.deloadAlert ?? true}
              onToggle={() => toggleNotif('deloadAlert')}
            />
            <NotifRow
              label="PR Alert"
              desc="When a new personal record is logged"
              value={profile?.notifications?.prAlert ?? true}
              onToggle={() => toggleNotif('prAlert')}
            />
            <NotifRow
              label="Weekly Check-In Reminder"
              desc="Sunday prompt to complete your weekly review"
              value={profile?.notifications?.weeklyCheckin ?? true}
              onToggle={() => toggleNotif('weeklyCheckin')}
              last
            />
          </View>

          {/* ── NUTRITION ── */}
          <SectionHeader title="NUTRITION (LOSE IT)" />
          <View style={s.card}>
            <View style={s.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.settingLabel}>Lose It Connection</Text>
                <Text style={s.settingDesc}>Pull daily calories, macros, and bodyweight</Text>
              </View>
              <View style={[s.statusBadge, { backgroundColor: profile?.loseitConnected ? COLORS.sessions.de_lower.bg : COLORS.surfaceHighlight }]}>
                <Text style={[s.statusText, { color: profile?.loseitConnected ? COLORS.status.success : COLORS.text.muted }]}>
                  {profile?.loseitConnected ? 'Connected' : 'Not Connected'}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={s.connectBtn}>
              <Text style={s.connectBtnText}>
                {profile?.loseitConnected ? 'Disconnect Lose It' : 'Connect Lose It (OAuth)'}
              </Text>
            </TouchableOpacity>
            <Text style={s.noteText}>OAuth integration available once Lose It API credentials are configured.</Text>
          </View>

          {/* ── ACCOUNT ── */}
          <SectionHeader title="ACCOUNT" />
          <View style={s.card}>
            {/* Signed-in user info */}
            {authUser?.email && (
              <View style={s.accountRow}>
                <MaterialCommunityIcons name="account-circle-outline" size={20} color={COLORS.text.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={s.accountName}>{authUser.name || 'Athlete'}</Text>
                  <Text style={s.accountEmail}>{authUser.email}</Text>
                </View>
              </View>
            )}

            {/* Marketing emails toggle */}
            <View style={s.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.settingLabel}>Marketing Emails</Text>
                <Text style={s.settingDesc}>Training tips, feature announcements, and updates</Text>
              </View>
              <Switch
                value={marketingOptIn}
                onValueChange={async (val) => {
                  setMarketingOptIn(val);
                  try {
                    const token = await getAuthToken();
                    if (token) {
                      await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL || ''}/api/auth/preferences`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ marketingOptIn: val }),
                      });
                    }
                  } catch {}
                }}
                trackColor={{ false: COLORS.border, true: COLORS.accent + '88' }}
                thumbColor={marketingOptIn ? COLORS.accent : COLORS.text.muted}
              />
            </View>

            {/* Reset onboarding */}
            <TouchableOpacity style={[s.resetBtn, { marginBottom: 8 }]} onPress={confirmReset}>
              <Text style={s.resetBtnText}>Reset Onboarding / Profile Setup</Text>
            </TouchableOpacity>

            {/* Logout */}
            <TouchableOpacity
              style={s.logoutBtn}
              onPress={() => {
                Alert.alert(
                  'Sign Out',
                  'Are you sure you want to sign out?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Sign Out',
                      style: 'destructive',
                      onPress: async () => {
                        await clearAuth();
                        router.replace('/auth');
                      },
                    },
                  ],
                );
              }}
            >
              <MaterialCommunityIcons name="logout" size={16} color="#FF4D4D" />
              <Text style={s.logoutBtnText}>Sign Out</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* ── Floating Save Button (edit mode) ── */}
        {editMode && (
          <View style={s.saveBar}>
            <TouchableOpacity
              style={[s.saveBtn, (saving || previewLoading) && s.saveBtnDisabled]}
              onPress={handleSaveChanges}
              disabled={saving || previewLoading}
              activeOpacity={0.85}
            >
              {(saving || previewLoading) ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <>
                  <MaterialCommunityIcons name="content-save-outline" size={18} color={COLORS.primary} />
                  <Text style={s.saveBtnText}>
                    {injuriesChanged ? 'Preview & Save Changes' : 'Save Changes'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* ── Add Injury Modal ── */}
      <Modal visible={showAddInjury} transparent animationType="slide" onRequestClose={() => setShowAddInjury(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowAddInjury(false)}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Add Injury Flag</Text>
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              <View style={s.modalChipWrap}>
                {ALL_INJURIES.filter(inj => !editedInjuries.includes(inj)).map(inj => (
                  <TouchableOpacity
                    key={inj}
                    style={s.modalChip}
                    onPress={() => {
                      setEditedInjuries(prev => [...prev, inj]);
                      setShowAddInjury(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={s.modalChipText}>{inj}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Add Weakness Modal ── */}
      <Modal visible={showAddWeakness} transparent animationType="slide" onRequestClose={() => setShowAddWeakness(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowAddWeakness(false)}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Add Weakness / Target</Text>
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              <View style={s.modalChipWrap}>
                {ALL_WEAKNESSES.filter(w => !editedWeaknesses.includes(w)).map(w => (
                  <TouchableOpacity
                    key={w}
                    style={s.modalChip}
                    onPress={() => {
                      setEditedWeaknesses(prev => [...prev, w]);
                      setShowAddWeakness(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={s.modalChipText}>{w}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Injury Preview Modal ── */}
      <Modal visible={showPreview} transparent animationType="slide" onRequestClose={() => setShowPreview(false)}>
        <View style={s.previewOverlay}>
          <View style={s.previewSheet}>
            <View style={s.previewHeader}>
              <MaterialCommunityIcons name="alert-circle-outline" size={22} color={COLORS.accent} />
              <Text style={s.previewTitle}>Review Program Changes</Text>
            </View>
            <Text style={s.previewSummary}>{previewData?.summary}</Text>

            <ScrollView style={s.previewScroll} showsVerticalScrollIndicator={false}>
              {/* Added injuries */}
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

              {/* Removed injuries */}
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

              {/* Exercises restricted */}
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

              {/* Exercises restored */}
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
                  <Text style={s.previewNoChangeText}>
                    No specific exercises are affected by this change.
                  </Text>
                </View>
              )}
            </ScrollView>

            <View style={s.previewActions}>
              <TouchableOpacity
                style={s.acceptBtn}
                onPress={handleAcceptInjuryChanges}
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
              <TouchableOpacity
                style={s.cancelPreviewBtn}
                onPress={() => setShowPreview(false)}
                activeOpacity={0.8}
              >
                <Text style={s.cancelPreviewText}>Cancel — Keep Editing</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return <Text style={sh.text}>{title}</Text>;
}
const sh = StyleSheet.create({
  text: { fontSize: 10, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 2, paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.sm },
});

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={ir.row}>
      <Text style={ir.label}>{label}</Text>
      <Text style={ir.value}>{value}</Text>
    </View>
  );
}
const ir = StyleSheet.create({
  row:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  label: { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm },
  value: { color: COLORS.text.primary, fontWeight: FONTS.weights.semibold, fontSize: FONTS.sizes.sm, maxWidth: '60%', textAlign: 'right' },
});

function NotifRow({ label, desc, value, onToggle, last }: any) {
  return (
    <View style={[nr.row, !last && { borderBottomWidth: 1, borderBottomColor: COLORS.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={nr.label}>{label}</Text>
        <Text style={nr.desc}>{desc}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: COLORS.surfaceHighlight, true: COLORS.accent }}
        thumbColor={COLORS.text.primary}
      />
    </View>
  );
}
const nr = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  label: { color: COLORS.text.primary, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold, marginBottom: 2 },
  desc:  { color: COLORS.text.secondary, fontSize: FONTS.sizes.xs },
});

// ── Styles ─────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: COLORS.background },
  loading: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },

  header:      { flexDirection: 'row', alignItems: 'center', padding: SPACING.lg, paddingTop: SPACING.xl },
  headerBtn:   { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  title:       { flex: 1, fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, letterSpacing: 2, marginLeft: SPACING.sm },

  editBanner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: 'rgba(201,168,76,0.12)', paddingVertical: 8, paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.2)',
  },
  editBannerText: { fontSize: FONTS.sizes.xs, color: COLORS.primary, fontWeight: FONTS.weights.semibold },

  card: { marginHorizontal: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.sm },

  // Edit fields
  fieldGroup:    { gap: SPACING.xs },
  fieldLabel:    { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold, color: COLORS.text.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  fieldInput: {
    backgroundColor: '#1E1E22', borderRadius: 12, paddingHorizontal: SPACING.md, height: 48,
    fontSize: FONTS.sizes.base, color: COLORS.text.primary, borderWidth: 1, borderColor: '#2A2A2E',
  },
  fieldInputRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  fieldUnit:     { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, fontWeight: FONTS.weights.bold },

  expChipsRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm },
  expChip: {
    paddingHorizontal: SPACING.md, paddingVertical: 9, borderRadius: 100,
    backgroundColor: '#1E1E22', borderWidth: 1.5, borderColor: '#2A2A2E',
  },
  expChipActive:    { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  expChipText:      { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, fontWeight: FONTS.weights.semibold },
  expChipTextActive:{ color: COLORS.primary, fontWeight: FONTS.weights.heavy },

  emptyRow:  { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.sm },
  emptyText: { color: COLORS.text.muted, fontSize: FONTS.sizes.sm, fontStyle: 'italic' },

  injuryChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.sm },
  injuryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(229,87,87,0.1)', borderRadius: 100,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: 'rgba(229,87,87,0.25)',
  },
  injuryChipText: { fontSize: FONTS.sizes.xs, color: COLORS.status.error, fontWeight: FONTS.weights.semibold },
  injuryRemoveBtn: { marginLeft: 2 },

  weaknessChip: {
    backgroundColor: 'rgba(201,168,76,0.08)', borderColor: 'rgba(201,168,76,0.2)',
  },
  weaknessChipText: { color: COLORS.accent },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.sm, marginTop: SPACING.sm,
  },
  addBtnText: { fontSize: FONTS.sizes.sm, color: COLORS.accent, fontWeight: FONTS.weights.semibold },

  injuryChangeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    marginTop: SPACING.md, backgroundColor: 'rgba(201,168,76,0.08)',
    borderRadius: 10, padding: SPACING.md, borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)',
  },
  injuryChangeBannerText: { flex: 1, fontSize: FONTS.sizes.xs, color: COLORS.accent, lineHeight: 16 },

  settingRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md },
  settingLabel:    { color: COLORS.text.primary, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold, marginBottom: 2 },
  settingDesc:     { color: COLORS.text.secondary, fontSize: FONTS.sizes.xs, maxWidth: 200 },
  unitToggleRow:   { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  unitLabel:       { color: COLORS.text.muted, fontWeight: FONTS.weights.bold, fontSize: FONTS.sizes.sm },
  unitLabelActive: { color: COLORS.accent },
  statusBadge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full },
  statusText:      { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold },
  connectBtn:      { marginTop: SPACING.md, borderWidth: 1, borderColor: COLORS.accentBlue, borderRadius: RADIUS.md, height: 40, justifyContent: 'center', alignItems: 'center' },
  connectBtnText:  { color: COLORS.accentBlue, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold },
  noteText:        { color: COLORS.text.muted, fontSize: FONTS.sizes.xs, marginTop: SPACING.sm, fontStyle: 'italic', lineHeight: 16 },
  resetBtn:        { borderWidth: 1, borderColor: COLORS.status.error, borderRadius: RADIUS.md, height: 44, justifyContent: 'center', alignItems: 'center' },
  resetBtnText:    { color: COLORS.status.error, fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold },
  accountRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  accountName:     { fontSize: FONTS.sizes.sm, fontWeight: '700' as any, color: COLORS.text.primary },
  accountEmail:    { fontSize: 11, color: COLORS.text.muted, marginTop: 1 },
  logoutBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#FF4D4D55', borderRadius: RADIUS.md, height: 44, backgroundColor: '#FF4D4D18' },
  logoutBtnText:   { fontSize: FONTS.sizes.sm, fontWeight: '700' as any, color: '#FF4D4D' },

  // Floating save bar
  saveBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xl, paddingTop: SPACING.md,
    backgroundColor: COLORS.background, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.accent, borderRadius: 16, height: 52,
    shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, color: COLORS.primary },

  // Add item modals
  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: SPACING.xl, paddingBottom: SPACING.xxl,
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#3A3A3E', alignSelf: 'center', marginBottom: SPACING.lg },
  modalTitle:  { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, marginBottom: SPACING.lg },
  modalChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, paddingBottom: SPACING.lg },
  modalChip: {
    paddingHorizontal: SPACING.md, paddingVertical: 10, borderRadius: 100,
    backgroundColor: '#1E1E22', borderWidth: 1.5, borderColor: '#2A2A2E',
  },
  modalChipText: { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, fontWeight: FONTS.weights.medium },

  // Injury preview modal
  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  previewSheet: {
    backgroundColor: '#111115', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: SPACING.xl, maxHeight: '90%',
  },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  previewTitle:  { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary },
  previewSummary:{ fontSize: FONTS.sizes.sm, color: COLORS.text.muted, marginBottom: SPACING.lg, lineHeight: 20 },
  previewScroll: { maxHeight: 320, marginBottom: SPACING.lg },
  previewSection:{ marginBottom: SPACING.lg },
  previewSectionLabel: { fontSize: FONTS.sizes.xs, fontWeight: FONTS.weights.bold, color: COLORS.accent, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: SPACING.sm },
  previewChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  previewChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100 },
  previewChipRed:      { backgroundColor: 'rgba(229,87,87,0.12)', borderWidth: 1, borderColor: 'rgba(229,87,87,0.3)' },
  previewChipTextRed:  { fontSize: FONTS.sizes.xs, color: COLORS.status.error, fontWeight: FONTS.weights.semibold },
  previewChipGreen:     { backgroundColor: 'rgba(76,175,80,0.12)', borderWidth: 1, borderColor: 'rgba(76,175,80,0.3)' },
  previewChipTextGreen: { fontSize: FONTS.sizes.xs, color: COLORS.status.success, fontWeight: FONTS.weights.semibold },
  previewExRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1E1E22', gap: SPACING.sm },
  previewExLeft:   { flex: 1 },
  previewExName:   { fontSize: FONTS.sizes.sm, color: COLORS.text.primary, fontWeight: FONTS.weights.semibold },
  previewExCat:    { fontSize: FONTS.sizes.xs, color: COLORS.text.muted, marginTop: 2 },
  previewExReason: { fontSize: FONTS.sizes.xs, color: COLORS.status.error, maxWidth: '40%', textAlign: 'right', lineHeight: 16 },
  previewNoChange: { alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.xl },
  previewNoChangeText: { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, textAlign: 'center' },
  previewActions:  { gap: SPACING.sm },
  acceptBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.accent, borderRadius: 16, height: 52,
    shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 6,
  },
  acceptBtnText:     { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, color: COLORS.primary },
  cancelPreviewBtn:  { height: 44, justifyContent: 'center', alignItems: 'center' },
  cancelPreviewText: { fontSize: FONTS.sizes.sm, color: COLORS.text.muted },
});

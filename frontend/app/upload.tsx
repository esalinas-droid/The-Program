import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS } from '../src/constants/theme';

// ── Types ─────────────────────────────────────────────────────────────────────
type InsightStatus = 'pending' | 'accepted' | 'rejected';

interface Insight {
  id: string;
  text: string;
  status: InsightStatus;
  isEditing: boolean;
  editText: string;
}

// ── Data ──────────────────────────────────────────────────────────────────────
const FILE_CATEGORIES = [
  { id: 'training',  label: 'Training History',    icon: 'weight-lifter'       },
  { id: 'program',   label: 'Program Template',    icon: 'clipboard-list'      },
  { id: 'medical',   label: 'Medical/Restriction', icon: 'medical-bag'         },
  { id: 'video',     label: 'Exercise Video',      icon: 'video-outline'       },
  { id: 'image',     label: 'Progress Image',      icon: 'image-outline'       },
  { id: 'notes',     label: 'Notes/Misc',          icon: 'note-text-outline'   },
];

const SUPPORTED_FORMATS = ['PDF', 'DOCX', 'JPG', 'PNG', 'CSV', 'XLSX', 'MP4'];

const MOCK_FILE = {
  name: 'training_log_2024.pdf',
  size: '2.4 MB',
  typeLabel: 'PDF',
  typeIcon: 'file-pdf-box',
};

const INITIAL_INSIGHTS: Insight[] = [
  { id: '1', text: 'Trained 4 days/week consistently',        status: 'pending', isEditing: false, editText: 'Trained 4 days/week consistently' },
  { id: '2', text: 'Elbow pain affects close-grip pressing',  status: 'pending', isEditing: false, editText: 'Elbow pain affects close-grip pressing' },
  { id: '3', text: 'Responded well to upper/lower split',     status: 'pending', isEditing: false, editText: 'Responded well to upper/lower split' },
  { id: '4', text: 'Limited access to specialty bars',        status: 'pending', isEditing: false, editText: 'Limited access to specialty bars' },
];

// ── Main screen ───────────────────────────────────────────────────────────────
export default function UploadScreen() {
  const router = useRouter();
  const [fileSelected,      setFileSelected]      = useState(false);
  const [selectedCategory,  setSelectedCategory]  = useState('');
  const [insights,          setInsights]          = useState<Insight[]>(INITIAL_INSIGHTS);
  const [saved,             setSaved]             = useState(false);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handlePickFile = () => setFileSelected(true);

  const handleClearFile = () => {
    setFileSelected(false);
    setSelectedCategory('');
    setInsights(INITIAL_INSIGHTS.map(i => ({ ...i, status: 'pending', isEditing: false })));
  };

  const updateInsight = (id: string, updates: Partial<Insight>) =>
    setInsights(prev => prev.map(i => (i.id === id ? { ...i, ...updates } : i)));

  const handleAccept     = (id: string) => updateInsight(id, { status: 'accepted', isEditing: false });
  const handleReject     = (id: string) => updateInsight(id, { status: 'rejected', isEditing: false });
  const handleStartEdit  = (id: string) => {
    const ins = insights.find(i => i.id === id);
    if (ins) updateInsight(id, { isEditing: true, editText: ins.text });
  };
  const handleSaveEdit   = (id: string) => {
    const ins = insights.find(i => i.id === id);
    if (ins) updateInsight(id, { text: ins.editText, status: 'accepted', isEditing: false });
  };
  const handleCancelEdit = (id: string) => {
    const ins = insights.find(i => i.id === id);
    if (ins) updateInsight(id, { isEditing: false, editText: ins.text });
  };

  const acceptedCount = insights.filter(i => i.status === 'accepted').length;
  const canSave       = fileSelected && acceptedCount > 0;

  // ── Success state ────────────────────────────────────────────────────────────
  if (saved) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.successWrap}>
          <View style={s.successIconRing}>
            <MaterialCommunityIcons name="brain" size={52} color={COLORS.accent} />
          </View>
          <Text style={s.successTitle}>Saved to Coach Memory</Text>
          <Text style={s.successSub}>
            {acceptedCount} insight{acceptedCount !== 1 ? 's' : ''} added.{'\n'}
            Your coach will use this context in future sessions.
          </Text>
          <TouchableOpacity style={s.successBtn} onPress={() => router.back()} activeOpacity={0.85}>
            <Text style={s.successBtnText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* ── Top bar ── */}
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.text.primary} />
          </TouchableOpacity>
          <Text style={s.topBarTitle}>Upload to Coach</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Hero ── */}
          <Text style={s.heroTitle}>Give your coach{'\n'}more context</Text>
          <Text style={s.heroSubtitle}>
            Upload training history, programs, rehab notes, or anything that helps me coach you better.
          </Text>

          {/* ── Supported format chips ── */}
          <View style={s.formatsRow}>
            {SUPPORTED_FORMATS.map(fmt => (
              <View key={fmt} style={s.formatChip}>
                <Text style={s.formatChipText}>{fmt}</Text>
              </View>
            ))}
          </View>

          {/* ── File picker / selected ── */}
          {!fileSelected ? (
            <TouchableOpacity style={s.dropZone} onPress={handlePickFile} activeOpacity={0.75}>
              <View style={s.dropZoneIcon}>
                <MaterialCommunityIcons name="cloud-upload-outline" size={38} color={COLORS.accent} />
              </View>
              <Text style={s.dropZoneTitle}>Tap to browse files</Text>
              <Text style={s.dropZoneSub}>PDF · DOCX · JPG · PNG · CSV · XLSX · MP4</Text>
            </TouchableOpacity>
          ) : (
            <View style={s.fileCard}>
              <MaterialCommunityIcons name={MOCK_FILE.typeIcon as any} size={38} color="#EF5350" />
              <View style={s.fileCardMeta}>
                <Text style={s.fileCardName} numberOfLines={1}>{MOCK_FILE.name}</Text>
                <Text style={s.fileCardSize}>{MOCK_FILE.size} · {MOCK_FILE.typeLabel}</Text>
              </View>
              <TouchableOpacity onPress={handleClearFile} style={s.fileCardClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialCommunityIcons name="close-circle" size={22} color={COLORS.text.muted} />
              </TouchableOpacity>
            </View>
          )}

          {/* ── Classifier + insights (only after file selected) ── */}
          {fileSelected && (
            <>
              {/* File type classifier */}
              <Text style={s.sectionLabel}>WHAT TYPE OF FILE IS THIS?</Text>
              <View style={s.categoryWrap}>
                {FILE_CATEGORIES.map(cat => {
                  const active = selectedCategory === cat.id;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[s.catPill, active && s.catPillActive]}
                      onPress={() => setSelectedCategory(cat.id)}
                      activeOpacity={0.8}
                    >
                      <MaterialCommunityIcons
                        name={cat.icon as any}
                        size={13}
                        color={active ? COLORS.primary : COLORS.text.secondary}
                        style={{ marginRight: 5 }}
                      />
                      <Text style={[s.catPillText, active && s.catPillTextActive]}>
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Extracted insights */}
              <View style={s.insightsHeader}>
                <View>
                  <Text style={s.sectionLabel}>EXTRACTED INSIGHTS</Text>
                  <Text style={s.insightsSub}>Review AI-extracted facts before saving</Text>
                </View>
                <View style={s.countBadge}>
                  <Text style={s.countBadgeText}>{acceptedCount}/{insights.length}</Text>
                </View>
              </View>

              {insights.map(ins => (
                <InsightCard
                  key={ins.id}
                  insight={ins}
                  onAccept       ={() => handleAccept(ins.id)}
                  onReject       ={() => handleReject(ins.id)}
                  onEdit         ={() => handleStartEdit(ins.id)}
                  onSaveEdit     ={() => handleSaveEdit(ins.id)}
                  onCancelEdit   ={() => handleCancelEdit(ins.id)}
                  onChangeText   ={(text) => updateInsight(ins.id, { editText: text })}
                />
              ))}
            </>
          )}

          <View style={{ height: 110 }} />
        </ScrollView>

        {/* ── Sticky save button ── */}
        {fileSelected && (
          <View style={s.saveDock}>
            <TouchableOpacity
              style={[s.saveBtn, !canSave && s.saveBtnDisabled]}
              onPress={() => setSaved(true)}
              disabled={!canSave}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons
                name="brain"
                size={20}
                color={canSave ? COLORS.primary : COLORS.text.muted}
              />
              <Text style={[s.saveBtnText, !canSave && s.saveBtnTextOff]}>
                Save to Coach Memory
              </Text>
              {acceptedCount > 0 && (
                <View style={s.saveBadge}>
                  <Text style={s.saveBadgeText}>{acceptedCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            {!canSave && (
              <Text style={s.saveHint}>Accept at least one insight to save</Text>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── InsightCard ───────────────────────────────────────────────────────────────
function InsightCard({
  insight,
  onAccept, onReject, onEdit, onSaveEdit, onCancelEdit, onChangeText,
}: {
  insight: Insight;
  onAccept: () => void;
  onReject: () => void;
  onEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onChangeText: (text: string) => void;
}) {
  const accepted = insight.status === 'accepted';
  const rejected = insight.status === 'rejected';

  return (
    <View
      style={[
        s.insightCard,
        accepted && s.insightCardAccepted,
        rejected && s.insightCardRejected,
      ]}
    >
      {/* Text / edit input */}
      <View style={s.insightBody}>
        {insight.isEditing ? (
          <TextInput
            style={s.insightInput}
            value={insight.editText}
            onChangeText={onChangeText}
            multiline
            autoFocus
            selectionColor={COLORS.accent}
            placeholderTextColor={COLORS.text.muted}
          />
        ) : (
          <Text style={[s.insightText, rejected && s.insightTextStrike]}>
            {insight.text}
          </Text>
        )}
      </View>

      {/* Action buttons */}
      <View style={s.insightActions}>
        {insight.isEditing ? (
          <>
            <TouchableOpacity style={[s.actionBtn, s.actionBtnGreen]} onPress={onSaveEdit}>
              <MaterialCommunityIcons name="check" size={17} color={COLORS.status.success} />
            </TouchableOpacity>
            <TouchableOpacity style={s.actionBtn} onPress={onCancelEdit}>
              <MaterialCommunityIcons name="close" size={17} color={COLORS.text.muted} />
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Accept */}
            <TouchableOpacity
              style={[s.actionBtn, accepted && s.actionBtnGreen]}
              onPress={onAccept}
              disabled={rejected}
            >
              <MaterialCommunityIcons
                name="check"
                size={17}
                color={rejected ? COLORS.border : COLORS.status.success}
              />
            </TouchableOpacity>
            {/* Edit */}
            <TouchableOpacity
              style={s.actionBtn}
              onPress={onEdit}
              disabled={rejected}
            >
              <MaterialCommunityIcons
                name="pencil-outline"
                size={17}
                color={rejected ? COLORS.border : COLORS.accent}
              />
            </TouchableOpacity>
            {/* Reject */}
            <TouchableOpacity
              style={[s.actionBtn, rejected && s.actionBtnRed]}
              onPress={onReject}
            >
              <MaterialCommunityIcons
                name="close"
                size={17}
                color={COLORS.status.error}
              />
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: COLORS.background },
  scroll:       { flex: 1 },
  scrollContent:{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn:      { padding: 4 },
  topBarTitle:  { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold, color: COLORS.text.primary },

  // Hero
  heroTitle: {
    fontSize: FONTS.sizes.xxxl,
    fontWeight: FONTS.weights.heavy,
    color: COLORS.text.primary,
    lineHeight: 38,
    marginBottom: SPACING.sm,
  },
  heroSubtitle: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    lineHeight: 22,
    marginBottom: SPACING.lg,
  },

  // Format chips
  formatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: SPACING.xl,
  },
  formatChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceHighlight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  formatChipText: {
    fontSize: 10,
    fontWeight: FONTS.weights.heavy,
    color: COLORS.text.muted,
    letterSpacing: 0.8,
  },

  // Drop zone
  dropZone: {
    borderWidth: 2,
    borderColor: COLORS.accent,
    borderStyle: 'dashed',
    borderRadius: RADIUS.xl,
    paddingVertical: SPACING.xxl,
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
    backgroundColor: 'rgba(201, 168, 76, 0.04)',
  },
  dropZoneIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(201, 168, 76, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  dropZoneTitle: {
    fontSize: FONTS.sizes.base,
    fontWeight: FONTS.weights.bold,
    color: COLORS.text.primary,
  },
  dropZoneSub: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    letterSpacing: 0.3,
  },

  // File selected card
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.md,
  },
  fileCardMeta:  { flex: 1 },
  fileCardName:  { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold, color: COLORS.text.primary, marginBottom: 3 },
  fileCardSize:  { fontSize: FONTS.sizes.xs, color: COLORS.text.muted },
  fileCardClose: { padding: 4 },

  // Section label
  sectionLabel: {
    fontSize: FONTS.sizes.xs,
    fontWeight: FONTS.weights.heavy,
    color: COLORS.text.muted,
    letterSpacing: 2,
    marginBottom: SPACING.md,
  },

  // Categories
  categoryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  catPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 9,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  catPillActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  catPillText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: FONTS.weights.semibold,
    color: COLORS.text.secondary,
  },
  catPillTextActive: {
    color: COLORS.primary,
    fontWeight: FONTS.weights.heavy,
  },

  // Insights header
  insightsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  insightsSub: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    marginTop: 3,
  },
  countBadge: {
    backgroundColor: COLORS.surfaceHighlight,
    borderRadius: RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  countBadgeText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: FONTS.weights.heavy,
    color: COLORS.accent,
  },

  // Insight card
  insightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.md,
  },
  insightCardAccepted: {
    borderColor: COLORS.status.success,
    backgroundColor: 'rgba(76, 175, 80, 0.04)',
  },
  insightCardRejected: {
    opacity: 0.38,
  },
  insightBody: {
    flex: 1,
  },
  insightText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.primary,
    lineHeight: 21,
  },
  insightTextStrike: {
    textDecorationLine: 'line-through',
    color: COLORS.text.muted,
  },
  insightInput: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.primary,
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.accent,
    paddingVertical: 4,
    lineHeight: 22,
    minHeight: 42,
  },

  // Action buttons on insight card
  insightActions: {
    flexDirection: 'row',
    gap: 6,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surfaceHighlight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnGreen: {
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
  },
  actionBtnRed: {
    backgroundColor: 'rgba(239, 83, 80, 0.15)',
  },

  // Save dock
  saveDock: {
    padding: SPACING.lg,
    paddingBottom: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.lg,
    paddingVertical: 16,
    gap: SPACING.sm,
  },
  saveBtnDisabled: {
    backgroundColor: COLORS.surfaceHighlight,
  },
  saveBtnText: {
    fontSize: FONTS.sizes.base,
    fontWeight: FONTS.weights.heavy,
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  saveBtnTextOff: {
    color: COLORS.text.muted,
  },
  saveBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBadgeText: {
    fontSize: 10,
    fontWeight: FONTS.weights.heavy,
    color: COLORS.accent,
  },
  saveHint: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },

  // Success
  successWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xxl,
  },
  successIconRing: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: COLORS.surfaceHighlight,
    borderWidth: 2,
    borderColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  successTitle: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: FONTS.weights.heavy,
    color: COLORS.text.primary,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  successSub: {
    fontSize: FONTS.sizes.base,
    color: COLORS.text.secondary,
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: SPACING.xxl,
  },
  successBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    paddingHorizontal: SPACING.xxl,
  },
  successBtnText: {
    fontSize: FONTS.sizes.base,
    fontWeight: FONTS.weights.heavy,
    color: COLORS.primary,
  },
});

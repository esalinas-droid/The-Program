/**
 * documents/[id]/index.tsx — Document detail screen (Prompt 7A + 7B).
 *
 * Displays parsed text from an uploaded document.
 * Polls backend every 2 s while parseStatus is 'pending' or 'parsing'.
 * "Use this to build my plan" button navigates to ./build-plan (Prompt 7B).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { COLORS, SPACING, FONTS, RADIUS } from '../../../src/constants/theme';
import { documentsApi, UserDocument } from '../../../src/utils/api';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch { return iso.slice(0, 10); }
}

function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month:  'short',
      day:    'numeric',
      year:   'numeric',
      hour:   'numeric',
      minute: '2-digit',
    });
  } catch { return iso.slice(0, 16).replace('T', ' '); }
}

function formatBytes(bytes?: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024)             return `${bytes} B`;
  if (bytes < 1024 * 1024)      return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mimeToLabel(mime: string): string {
  if (mime === 'application/pdf')              return 'PDF';
  if (mime.includes('wordprocessingml'))       return 'DOCX';
  if (mime === 'text/plain')                   return 'TXT';
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'JPG';
  if (mime === 'image/png')                    return 'PNG';
  if (mime === 'image/heic')                   return 'HEIC';
  return mime.split('/').pop()?.toUpperCase() ?? 'FILE';
}

function mimeToIcon(mime: string): string {
  if (mime === 'application/pdf')          return 'file-pdf-box';
  if (mime.includes('wordprocessingml'))   return 'file-word-box';
  if (mime === 'text/plain')               return 'file-document-outline';
  if (mime.startsWith('image/'))           return 'file-image-outline';
  return 'file-outline';
}

function mimeToAccent(mime: string): string {
  if (mime === 'application/pdf')          return '#E53935';
  if (mime.includes('wordprocessingml'))   return '#1565C0';
  if (mime === 'text/plain')               return COLORS.accent;
  if (mime.startsWith('image/'))           return '#2A9D8F';
  return COLORS.accent;
}

function statusLabel(status: string): string {
  switch (status) {
    case 'pending':  return 'Queued';
    case 'parsing':  return 'Extracting text…';
    case 'complete': return 'Text extracted';
    case 'failed':   return 'Extraction failed';
    default:         return status;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'complete': return COLORS.status.success;
    case 'failed':   return COLORS.status.error;
    case 'parsing':  return COLORS.status.warning;
    default:         return COLORS.text.muted;
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function DocumentDetailScreen() {
  const { id }   = useLocalSearchParams<{ id: string }>();
  const router   = useRouter();
  const insets   = useSafeAreaInsets();

  const [doc,       setDoc]       = useState<UserDocument | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [deleting,  setDeleting]  = useState(false);
  const [reparsing, setReparsing] = useState(false);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load ─────────────────────────────────────────────────────────────────
  const loadDoc = useCallback(async () => {
    if (!id) return;
    try {
      const data = await documentsApi.get(id);
      setDoc(data);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load document.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadDoc(); }, [loadDoc]);

  // ── Polling while pending/parsing ────────────────────────────────────────
  useEffect(() => {
    if (!doc) return;
    const isInProgress = doc.parseStatus === 'pending' || doc.parseStatus === 'parsing';

    if (!isInProgress) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const updated = await documentsApi.get(id);
        setDoc(updated);
      } catch {
        clearInterval(pollIntervalRef.current!);
        pollIntervalRef.current = null;
      }
    }, 2000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [doc?.parseStatus, id]);

  // ── Reparse ───────────────────────────────────────────────────────────────
  const handleReparse = async () => {
    if (!doc) return;
    setReparsing(true);
    try {
      await documentsApi.reparse(id);
      setDoc(prev => prev ? { ...prev, parseStatus: 'pending', parseError: null } : null);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not start reparse.');
    } finally {
      setReparsing(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = () => {
    Alert.alert(
      'Delete Document',
      `Delete "${doc?.filename}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:    'Delete',
          style:   'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await documentsApi.delete(id);
              router.back();
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'Could not delete document.');
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const accent = doc ? mimeToAccent(doc.contentType) : COLORS.accent;

  if (loading) {
    return (
      <View style={[s.screen, { paddingTop: insets.top }]}>
        {renderHeader(router)}
        <ActivityIndicator style={{ marginTop: 80 }} size="large" color={COLORS.accent} />
      </View>
    );
  }

  if (error || !doc) {
    return (
      <View style={[s.screen, { paddingTop: insets.top }]}>
        {renderHeader(router)}
        <View style={s.errorState}>
          <MaterialCommunityIcons name="alert-circle-outline" size={40} color={COLORS.status.error} />
          <Text style={s.errorStateText}>{error || 'Document not found.'}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={loadDoc}>
            <Text style={s.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const isParsing  = doc.parseStatus === 'pending' || doc.parseStatus === 'parsing';
  const isComplete = doc.parseStatus === 'complete';
  const isFailed   = doc.parseStatus === 'failed';

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <MaterialCommunityIcons name="chevron-left" size={24} color={COLORS.text.secondary} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>
          {doc.filename}
        </Text>
        {/* Delete button */}
        <TouchableOpacity
          style={s.deleteHeaderBtn}
          onPress={handleDelete}
          disabled={deleting}
          activeOpacity={0.7}
        >
          {deleting
            ? <ActivityIndicator size="small" color={COLORS.status.error} />
            : <MaterialCommunityIcons name="trash-can-outline" size={20} color={COLORS.status.error} />
          }
        </TouchableOpacity>
      </View>

      {/* Metadata card */}
      <View style={s.metaCard}>
        <View style={[s.fileIconWrap, { backgroundColor: accent + '1A' }]}>
          <MaterialCommunityIcons name={mimeToIcon(doc.contentType) as any} size={28} color={accent} />
        </View>

        <View style={s.metaDetails}>
          <Text style={s.metaFilename} numberOfLines={2}>{doc.filename}</Text>
          <View style={s.metaRow}>
            <View style={[s.typePill, { backgroundColor: accent + '22', borderColor: accent + '44' }]}>
              <Text style={[s.typePillText, { color: accent }]}>{mimeToLabel(doc.contentType)}</Text>
            </View>
            <Text style={s.metaMuted}>{formatBytes(doc.sizeBytes)}</Text>
            {doc.pageCount != null && doc.pageCount > 0 && (
              <Text style={s.metaMuted}>{doc.pageCount}p</Text>
            )}
          </View>

          {/* Parse status */}
          <View style={s.statusRow}>
            {isParsing && <ActivityIndicator size="small" color={statusColor(doc.parseStatus)} style={{ marginRight: 4 }} />}
            <Text style={[s.statusLabel, { color: statusColor(doc.parseStatus) }]}>
              {statusLabel(doc.parseStatus)}
            </Text>
          </View>

          <Text style={s.metaMuted}>
            Uploaded {fmtDateTime(doc.uploadedAt)}
            {doc.parsedAt ? `  ·  Parsed ${fmtDate(doc.parsedAt)}` : ''}
          </Text>
        </View>
      </View>

      {/* Main content */}
      {isParsing && (
        <View style={s.parsingState}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={s.parsingTitle}>Extracting Text…</Text>
          <Text style={s.parsingSub}>
            This usually takes a few seconds. The page updates automatically.
          </Text>
        </View>
      )}

      {isFailed && (
        <View style={s.failedState}>
          <MaterialCommunityIcons name="alert-rhombus-outline" size={36} color={COLORS.status.error} />
          <Text style={s.failedTitle}>Extraction Failed</Text>
          {doc.parseError ? (
            <Text style={s.failedError}>{doc.parseError}</Text>
          ) : null}
          <TouchableOpacity
            style={s.reparseBtn}
            onPress={handleReparse}
            disabled={reparsing}
            activeOpacity={0.8}
          >
            {reparsing
              ? <ActivityIndicator size="small" color={COLORS.surface} />
              : <>
                  <MaterialCommunityIcons name="refresh" size={16} color={COLORS.surface} />
                  <Text style={s.reparseBtnText}>Retry Extraction</Text>
                </>
            }
          </TouchableOpacity>
        </View>
      )}

      {isComplete && (
        <ScrollView
          style={s.textScroll}
          contentContainerStyle={[s.textContent, { paddingBottom: insets.bottom + 120 }]}
          showsVerticalScrollIndicator={true}
        >
          {/* Section label */}
          <View style={s.textHeader}>
            <Text style={s.textHeaderLabel}>EXTRACTED TEXT</Text>
            <Text style={s.textHeaderCount}>
              {doc.parsedText ? `${doc.parsedText.length.toLocaleString()} chars` : '—'}
            </Text>
          </View>

          {/* Parsed text body */}
          {doc.parsedText ? (
            <Text style={s.parsedText} selectable>
              {doc.parsedText}
            </Text>
          ) : (
            <Text style={s.emptyText}>No text was extracted from this document.</Text>
          )}

          {/* Reparse option for completed docs */}
          <TouchableOpacity
            style={s.reparseLinkBtn}
            onPress={handleReparse}
            disabled={reparsing}
            activeOpacity={0.7}
          >
            {reparsing
              ? <ActivityIndicator size="small" color={COLORS.text.muted} />
              : <>
                  <MaterialCommunityIcons name="refresh" size={14} color={COLORS.text.muted} />
                  <Text style={s.reparseLinkText}>Re-extract text</Text>
                </>
            }
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Bottom action bar — "Use this to build my plan" button (ACTIVE — Prompt 7B) */}
      {(isComplete || isFailed) && (
        <View style={[s.bottomBar, { paddingBottom: insets.bottom + SPACING.md }]}>
          {isComplete ? (
            <TouchableOpacity
              style={s.buildBtn}
              onPress={() => router.push(`/documents/${id}/build-plan` as any)}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="magic-staff" size={18} color={COLORS.surface} />
              <Text style={s.buildBtnText}>Use this to build my plan</Text>
            </TouchableOpacity>
          ) : (
            <View style={s.disabledBtnWrap}>
              <View style={s.disabledBtn}>
                <MaterialCommunityIcons name="magic-staff" size={18} color={COLORS.text.muted} />
                <Text style={s.disabledBtnText}>Use this to build my plan</Text>
              </View>
              <Text style={s.disabledNote}>Parse must succeed before building a plan</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ── Extracted header component ────────────────────────────────────────────────
function renderHeader(router: ReturnType<typeof useRouter>) {
  return (
    <View style={s.header}>
      <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
        <MaterialCommunityIcons name="chevron-left" size={24} color={COLORS.text.secondary} />
      </TouchableOpacity>
      <Text style={s.headerTitle}>Document</Text>
      <View style={{ width: 40 }} />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen: {
    flex:            1,
    backgroundColor: COLORS.background,
  },

  // Header
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical:   SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    width:          40,
    height:         40,
    alignItems:     'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex:       1,
    fontSize:   FONTS.sizes.base,
    fontWeight: FONTS.weights.semibold,
    color:      COLORS.text.primary,
    textAlign:  'center',
    marginHorizontal: SPACING.sm,
  },
  deleteHeaderBtn: {
    width:          40,
    height:         40,
    alignItems:     'center',
    justifyContent: 'center',
  },

  // Metadata card
  metaCard: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    gap:             SPACING.md,
    padding:         SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  fileIconWrap: {
    width:          52,
    height:         52,
    borderRadius:   RADIUS.md,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  metaDetails: {
    flex: 1,
    gap:  4,
  },
  metaFilename: {
    fontSize:   FONTS.sizes.base,
    fontWeight: FONTS.weights.semibold,
    color:      COLORS.text.primary,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACING.sm,
    flexWrap:      'wrap',
  },
  typePill: {
    paddingHorizontal: SPACING.sm,
    paddingVertical:   2,
    borderRadius:      RADIUS.full,
    borderWidth:       1,
  },
  typePillText: {
    fontSize:      FONTS.sizes.xs,
    fontWeight:    FONTS.weights.bold,
    letterSpacing: 0.5,
  },
  metaMuted: {
    fontSize: FONTS.sizes.xs,
    color:    COLORS.text.muted,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
  },
  statusLabel: {
    fontSize:   FONTS.sizes.sm,
    fontWeight: FONTS.weights.medium,
  },

  // ── In-progress state
  parsingState: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    gap:            SPACING.lg,
  },
  parsingTitle: {
    fontSize:   FONTS.sizes.xl,
    fontWeight: FONTS.weights.bold,
    color:      COLORS.text.primary,
    textAlign:  'center',
  },
  parsingSub: {
    fontSize:   FONTS.sizes.base,
    color:      COLORS.text.secondary,
    textAlign:  'center',
    lineHeight: 22,
  },

  // ── Failed state
  failedState: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    gap:            SPACING.lg,
  },
  failedTitle: {
    fontSize:   FONTS.sizes.xl,
    fontWeight: FONTS.weights.bold,
    color:      COLORS.status.error,
    textAlign:  'center',
  },
  failedError: {
    fontSize:   FONTS.sizes.sm,
    color:      COLORS.text.secondary,
    textAlign:  'center',
    lineHeight: 20,
    maxWidth:   300,
  },
  reparseBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             SPACING.sm,
    backgroundColor: COLORS.accent,
    borderRadius:    RADIUS.full,
    paddingVertical:   SPACING.md,
    paddingHorizontal: SPACING.xl,
    marginTop:       SPACING.sm,
  },
  reparseBtnText: {
    fontSize:   FONTS.sizes.base,
    fontWeight: FONTS.weights.bold,
    color:      COLORS.surface,
  },

  // ── Complete state — text scroll
  textScroll: {
    flex: 1,
  },
  textContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop:        SPACING.lg,
  },
  textHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   SPACING.md,
  },
  textHeaderLabel: {
    fontSize:      FONTS.sizes.xs,
    fontWeight:    FONTS.weights.bold,
    color:         COLORS.text.muted,
    letterSpacing: 1.2,
  },
  textHeaderCount: {
    fontSize: FONTS.sizes.xs,
    color:    COLORS.text.muted,
  },
  parsedText: {
    fontSize:        FONTS.sizes.sm,
    color:           COLORS.text.primary,
    lineHeight:      20,
    fontFamily:      Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: COLORS.surface,
    borderRadius:    RADIUS.md,
    padding:         SPACING.md,
    borderWidth:     1,
    borderColor:     COLORS.border,
  },
  emptyText: {
    fontSize: FONTS.sizes.base,
    color:    COLORS.text.muted,
    textAlign: 'center',
    marginTop: SPACING.xl,
  },
  reparseLinkBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            4,
    marginTop:      SPACING.xl,
    paddingVertical: SPACING.md,
  },
  reparseLinkText: {
    fontSize: FONTS.sizes.sm,
    color:    COLORS.text.muted,
  },

  // ── Bottom action bar
  bottomBar: {
    position:          'absolute',
    left:              0,
    right:             0,
    bottom:            0,
    backgroundColor:   COLORS.background,
    borderTopWidth:    1,
    borderTopColor:    COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingTop:        SPACING.md,
  },
  disabledBtnWrap: {
    alignItems: 'center',
    gap:        SPACING.xs,
  },
  disabledBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               SPACING.sm,
    backgroundColor:   COLORS.surface,
    borderRadius:      RADIUS.full,
    paddingVertical:   SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderWidth:       1,
    borderColor:       COLORS.border,
    width:             '100%',
    opacity:           0.5,
  },
  disabledBtnText: {
    fontSize:   FONTS.sizes.base,
    fontWeight: FONTS.weights.bold,
    color:      COLORS.text.secondary,
  },
  disabledNote: {
    fontSize:  FONTS.sizes.xs,
    color:     COLORS.text.muted,
    textAlign: 'center',
  },
  buildBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               SPACING.sm,
    backgroundColor:   COLORS.accent,
    borderRadius:      RADIUS.full,
    paddingVertical:   SPACING.md + 2,
    paddingHorizontal: SPACING.xl,
    width:             '100%',
  },
  buildBtnText: {
    fontSize:   FONTS.sizes.base,
    fontWeight: FONTS.weights.bold,
    color:      COLORS.surface,
  },

  // ── Error state
  errorState: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            SPACING.lg,
    paddingHorizontal: SPACING.xl,
  },
  errorStateText: {
    fontSize:   FONTS.sizes.base,
    color:      COLORS.text.secondary,
    textAlign:  'center',
    lineHeight: 22,
  },
  retryBtn: {
    backgroundColor: COLORS.accent,
    borderRadius:    RADIUS.full,
    paddingVertical:   SPACING.md,
    paddingHorizontal: SPACING.xl,
  },
  retryBtnText: {
    fontSize:   FONTS.sizes.base,
    fontWeight: FONTS.weights.bold,
    color:      COLORS.surface,
  },
});

/**
 * import-document.tsx — File upload screen (Prompt 7A).
 *
 * Allows users to pick a PDF, DOCX, TXT, JPG, or PNG file and upload it to
 * the backend for text extraction. Shows a real 0-100 % progress bar using
 * FileSystem.createUploadTask on native, and XHR progress on web.
 *
 * After upload, navigates to /documents/{documentId} which handles
 * the parse-status polling and displays the extracted text.
 */

import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  ScrollView,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';

import { COLORS, SPACING, FONTS, RADIUS } from '../src/constants/theme';
import { getAuthToken } from '../src/utils/auth';

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'selected' | 'uploading' | 'error';

interface PickedFile {
  uri:      string;
  name:     string;
  mimeType: string;
  size:     number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '—';
  if (bytes < 1024)              return `${bytes} B`;
  if (bytes < 1024 * 1024)       return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mimeToLabel(mime: string): string {
  if (mime === 'application/pdf')                                          return 'PDF';
  if (mime.includes('wordprocessingml'))                                   return 'DOCX';
  if (mime === 'text/plain')                                               return 'TXT';
  if (mime === 'image/jpeg' || mime === 'image/jpg')                       return 'JPG';
  if (mime === 'image/png')                                                return 'PNG';
  if (mime === 'image/heic')                                               return 'HEIC';
  return mime.split('/').pop()?.toUpperCase() ?? 'FILE';
}

function mimeToIcon(mime: string): string {
  if (mime === 'application/pdf')           return 'file-pdf-box';
  if (mime.includes('wordprocessingml'))    return 'file-word-box';
  if (mime === 'text/plain')                return 'file-document-outline';
  if (mime.startsWith('image/'))            return 'file-image-outline';
  return 'file-outline';
}

function mimeToAccent(mime: string): string {
  if (mime === 'application/pdf')           return '#E53935';     // red
  if (mime.includes('wordprocessingml'))    return '#1565C0';     // blue
  if (mime === 'text/plain')                return COLORS.accent; // gold
  if (mime.startsWith('image/'))            return '#2A9D8F';     // teal
  return COLORS.accent;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ImportDocumentScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();

  const [phase, setPhase]       = useState<Phase>('idle');
  const [file, setFile]         = useState<PickedFile | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  // Animated progress bar width
  const animWidth = useRef(new Animated.Value(0)).current;
  const uploadTaskRef = useRef<ReturnType<typeof FileSystem.createUploadTask> | null>(null);

  // ── Update progress (animated) ───────────────────────────────────────────
  const updateProgress = (pct: number) => {
    setProgress(pct);
    Animated.timing(animWidth, {
      toValue: pct,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  // ── Pick document (PDF / DOCX / TXT) ────────────────────────────────────
  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain',
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const a = result.assets[0];
      setFile({
        uri:      a.uri,
        name:     a.name || 'document',
        mimeType: a.mimeType || 'application/octet-stream',
        size:     a.size    ?? 0,
      });
      setPhase('selected');
      setErrorMsg('');
    } catch {
      setErrorMsg('Could not open file picker. Please try again.');
    }
  };

  // ── Pick photo (JPG / PNG) ────────────────────────────────────────────────
  const pickPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Photo library permission denied. Please enable it in Settings.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.length) return;
      const a = result.assets[0];
      setFile({
        uri:      a.uri,
        name:     a.fileName ?? 'photo.jpg',
        mimeType: a.mimeType ?? 'image/jpeg',
        size:     a.fileSize ?? 0,
      });
      setPhase('selected');
      setErrorMsg('');
    } catch {
      setErrorMsg('Could not open photo picker. Please try again.');
    }
  };

  // ── Upload ────────────────────────────────────────────────────────────────
  const startUpload = async () => {
    if (!file) return;
    setPhase('uploading');
    updateProgress(0);
    setErrorMsg('');

    const token   = await getAuthToken();
    const BASE    = process.env.EXPO_PUBLIC_BACKEND_URL ?? '';
    const url     = `${BASE}/api/documents/upload`;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    try {
      if (Platform.OS === 'web') {
        await uploadWeb(url, headers as Record<string, string>);
      } else {
        await uploadNative(url, headers as Record<string, string>);
      }
    } catch (e: any) {
      setPhase('error');
      const raw = e?.message ?? 'Upload failed. Please try again.';
      // Attempt to parse JSON error from FastAPI  {"detail":"..."}
      try {
        const parsed = JSON.parse(raw);
        setErrorMsg(parsed?.detail ?? raw);
      } catch {
        setErrorMsg(raw);
      }
    }
  };

  // Native upload (FileSystem.createUploadTask — real progress)
  const uploadNative = async (url: string, headers: Record<string, string>) => {
    if (!file) return;

    const task = FileSystem.createUploadTask(
      url,
      file.uri,
      {
        httpMethod:  'POST',
        uploadType:  FileSystem.FileSystemUploadType.MULTIPART,
        fieldName:   'file',
        mimeType:    file.mimeType,
        headers,
      },
      (prog) => {
        if (prog.totalBytesExpectedToSend > 0) {
          const pct = Math.round(
            (prog.totalBytesSent / prog.totalBytesExpectedToSend) * 100,
          );
          updateProgress(Math.min(pct, 99));
        }
      },
    );
    uploadTaskRef.current = task;

    const result = await task.uploadAsync();
    updateProgress(100);

    if (!result || result.status >= 400) {
      throw new Error(result?.body ?? `Upload failed (${result?.status})`);
    }
    const data = JSON.parse(result.body);
    router.replace(`/documents/${data.documentId}` as any);
  };

  // Web upload (XHR — real progress)
  const uploadWeb = (url: string, headers: Record<string, string>) =>
    new Promise<void>((resolve, reject) => {
      if (!file) { reject(new Error('No file')); return; }

      fetch(file.uri)
        .then(r => r.blob())
        .then(blob => {
          const formData = new FormData();
          formData.append('file', blob, file.name);

          const xhr = new XMLHttpRequest();
          xhr.open('POST', url, true);
          Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));

          xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable) {
              updateProgress(Math.min(Math.round((ev.loaded / ev.total) * 100), 99));
            }
          };

          xhr.onload = () => {
            updateProgress(100);
            if (xhr.status >= 400) {
              reject(new Error(xhr.responseText || `Upload failed (${xhr.status})`));
              return;
            }
            try {
              const data = JSON.parse(xhr.responseText);
              router.replace(`/documents/${data.documentId}` as any);
              resolve();
            } catch {
              reject(new Error('Invalid server response'));
            }
          };
          xhr.onerror = () => reject(new Error('Network error during upload'));
          xhr.send(formData);
        })
        .catch(reject);
    });

  // ── Reset to idle ─────────────────────────────────────────────────────────
  const reset = () => {
    setPhase('idle');
    setFile(null);
    setProgress(0);
    setErrorMsg('');
    updateProgress(0);
  };

  // ── Cancel upload ─────────────────────────────────────────────────────────
  const cancelUpload = async () => {
    try { await uploadTaskRef.current?.cancelAsync(); } catch {}
    reset();
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const accent    = file ? mimeToAccent(file.mimeType) : COLORS.accent;
  const canGoBack = phase !== 'uploading';

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => canGoBack ? router.back() : cancelUpload()}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name={phase === 'uploading' ? 'close' : 'chevron-left'}
            size={24}
            color={COLORS.text.secondary}
          />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Import Document</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── IDLE: pick prompt ────────────────────────────────────────────── */}
        {phase === 'idle' && (
          <>
            {/* Hero icon */}
            <View style={s.heroWrap}>
              <View style={s.heroIcon}>
                <MaterialCommunityIcons name="file-upload-outline" size={52} color={COLORS.accent} />
              </View>
              <Text style={s.heroTitle}>Upload Your Program</Text>
              <Text style={s.heroSub}>
                Upload a coach-built plan and the app will extract the text for you.
                Supported: PDF, Word (DOCX), text files, and photos of written plans.
              </Text>
            </View>

            {/* Pick buttons */}
            <View style={s.pickRow}>
              <TouchableOpacity style={s.pickCard} onPress={pickDocument} activeOpacity={0.8}>
                <View style={[s.pickIcon, { backgroundColor: 'rgba(201,168,76,0.12)' }]}>
                  <MaterialCommunityIcons name="file-document-outline" size={30} color={COLORS.accent} />
                </View>
                <Text style={s.pickLabel}>Documents</Text>
                <Text style={s.pickSub}>PDF · DOCX · TXT</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.pickCard} onPress={pickPhoto} activeOpacity={0.8}>
                <View style={[s.pickIcon, { backgroundColor: 'rgba(42,157,143,0.12)' }]}>
                  <MaterialCommunityIcons name="image-outline" size={30} color="#2A9D8F" />
                </View>
                <Text style={s.pickLabel}>Photos</Text>
                <Text style={s.pickSub}>JPG · PNG</Text>
              </TouchableOpacity>
            </View>

            {/* Format notes */}
            <View style={s.formatBox}>
              <Text style={s.formatTitle}>WHAT WORKS BEST</Text>
              {[
                { icon: 'check-circle-outline', color: COLORS.status.success, text: 'PDF with selectable text (best accuracy)' },
                { icon: 'check-circle-outline', color: COLORS.status.success, text: 'Word/DOCX documents with clear structure' },
                { icon: 'information-outline',  color: COLORS.status.warning, text: 'Scanned PDFs and photos — good but not perfect' },
                { icon: 'close-circle-outline', color: COLORS.status.error,   text: 'Files larger than 10 MB are not supported' },
              ].map((item, i) => (
                <View key={i} style={s.formatRow}>
                  <MaterialCommunityIcons name={item.icon as any} size={16} color={item.color} />
                  <Text style={s.formatText}>{item.text}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── SELECTED: file info + upload button ─────────────────────────── */}
        {(phase === 'selected' || phase === 'error') && file && (
          <>
            <View style={s.fileCard}>
              {/* Icon */}
              <View style={[s.fileIconWrap, { backgroundColor: accent + '1A' }]}>
                <MaterialCommunityIcons name={mimeToIcon(file.mimeType) as any} size={36} color={accent} />
              </View>

              {/* Details */}
              <View style={s.fileDetails}>
                <Text style={s.fileName} numberOfLines={2}>{file.name}</Text>
                <View style={s.fileMeta}>
                  <View style={[s.typePill, { backgroundColor: accent + '22', borderColor: accent + '44' }]}>
                    <Text style={[s.typePillText, { color: accent }]}>
                      {mimeToLabel(file.mimeType)}
                    </Text>
                  </View>
                  {file.size > 0 && (
                    <Text style={s.fileSize}>{formatBytes(file.size)}</Text>
                  )}
                </View>
              </View>
            </View>

            {/* Error message */}
            {phase === 'error' && errorMsg ? (
              <View style={s.errorBox}>
                <MaterialCommunityIcons name="alert-circle-outline" size={18} color={COLORS.status.error} />
                <Text style={s.errorText}>{errorMsg}</Text>
              </View>
            ) : null}

            {/* Upload button */}
            <TouchableOpacity
              style={[s.uploadBtn, { backgroundColor: COLORS.accent }]}
              onPress={startUpload}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="cloud-upload-outline" size={20} color={COLORS.surface} />
              <Text style={s.uploadBtnText}>
                {phase === 'error' ? 'Retry Upload' : 'Upload & Extract Text'}
              </Text>
            </TouchableOpacity>

            {/* Choose different file */}
            <TouchableOpacity style={s.secondaryBtn} onPress={reset} activeOpacity={0.7}>
              <Text style={s.secondaryBtnText}>Choose a Different File</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── UPLOADING: progress bar ──────────────────────────────────────── */}
        {phase === 'uploading' && file && (
          <View style={s.uploadingWrap}>
            {/* File mini card */}
            <View style={s.uploadingFile}>
              <MaterialCommunityIcons
                name={mimeToIcon(file.mimeType) as any}
                size={24}
                color={accent}
              />
              <Text style={s.uploadingFileName} numberOfLines={1}>{file.name}</Text>
            </View>

            {/* Progress ring area */}
            <View style={s.progressArea}>
              <ActivityIndicator
                size="large"
                color={COLORS.accent}
                style={s.spinner}
              />
              <Text style={s.progressPct}>{progress}%</Text>
            </View>

            {/* Progress bar */}
            <View style={s.barTrack}>
              <Animated.View
                style={[
                  s.barFill,
                  {
                    width: animWidth.interpolate({
                      inputRange: [0, 100],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            </View>

            <Text style={s.progressLabel}>
              {progress < 100 ? 'Uploading...' : 'Processing file...'}
            </Text>

            <TouchableOpacity style={s.cancelBtn} onPress={cancelUpload} activeOpacity={0.7}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen: {
    flex: 1,
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
    width:           40,
    height:          40,
    alignItems:      'center',
    justifyContent:  'center',
  },
  headerTitle: {
    fontSize:   FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
    color:      COLORS.text.primary,
  },

  // Content
  content: {
    paddingHorizontal: SPACING.lg,
    paddingTop:        SPACING.xl,
  },

  // ── Idle state ────────────────────────────────────────────────────────────
  heroWrap: {
    alignItems:   'center',
    marginBottom: SPACING.xl,
  },
  heroIcon: {
    width:           88,
    height:          88,
    borderRadius:    RADIUS.xl,
    backgroundColor: 'rgba(201,168,76,0.10)',
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    SPACING.lg,
  },
  heroTitle: {
    fontSize:     FONTS.sizes.xxl,
    fontWeight:   FONTS.weights.bold,
    color:        COLORS.text.primary,
    textAlign:    'center',
    marginBottom: SPACING.sm,
  },
  heroSub: {
    fontSize:   FONTS.sizes.base,
    color:      COLORS.text.secondary,
    textAlign:  'center',
    lineHeight: 22,
    maxWidth:   320,
  },

  pickRow: {
    flexDirection: 'row',
    gap:           SPACING.md,
    marginBottom:  SPACING.xl,
  },
  pickCard: {
    flex:             1,
    backgroundColor:  COLORS.surface,
    borderRadius:     RADIUS.lg,
    borderWidth:      1,
    borderColor:      COLORS.border,
    padding:          SPACING.lg,
    alignItems:       'center',
    gap:              SPACING.sm,
  },
  pickIcon: {
    width:          60,
    height:         60,
    borderRadius:   RADIUS.lg,
    alignItems:     'center',
    justifyContent: 'center',
  },
  pickLabel: {
    fontSize:   FONTS.sizes.base,
    fontWeight: FONTS.weights.bold,
    color:      COLORS.text.primary,
  },
  pickSub: {
    fontSize: FONTS.sizes.xs,
    color:    COLORS.text.muted,
  },

  formatBox: {
    backgroundColor: COLORS.surface,
    borderRadius:    RADIUS.lg,
    borderWidth:     1,
    borderColor:     COLORS.border,
    padding:         SPACING.lg,
    gap:             SPACING.sm,
  },
  formatTitle: {
    fontSize:      FONTS.sizes.xs,
    fontWeight:    FONTS.weights.bold,
    color:         COLORS.text.muted,
    letterSpacing: 1.2,
    marginBottom:  SPACING.xs,
  },
  formatRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACING.sm,
  },
  formatText: {
    fontSize: FONTS.sizes.sm,
    color:    COLORS.text.secondary,
    flex:     1,
  },

  // ── Selected / Error state ────────────────────────────────────────────────
  fileCard: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: COLORS.surface,
    borderRadius:    RADIUS.lg,
    borderWidth:     1,
    borderColor:     COLORS.border,
    padding:         SPACING.lg,
    gap:             SPACING.md,
    marginBottom:    SPACING.xl,
  },
  fileIconWrap: {
    width:          64,
    height:         64,
    borderRadius:   RADIUS.lg,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  fileDetails: {
    flex: 1,
    gap:  SPACING.sm,
  },
  fileName: {
    fontSize:   FONTS.sizes.base,
    fontWeight: FONTS.weights.semibold,
    color:      COLORS.text.primary,
    lineHeight: 20,
  },
  fileMeta: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACING.sm,
  },
  typePill: {
    paddingHorizontal: SPACING.sm,
    paddingVertical:   3,
    borderRadius:      RADIUS.full,
    borderWidth:       1,
  },
  typePillText: {
    fontSize:   FONTS.sizes.xs,
    fontWeight: FONTS.weights.bold,
    letterSpacing: 0.5,
  },
  fileSize: {
    fontSize: FONTS.sizes.sm,
    color:    COLORS.text.muted,
  },

  errorBox: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    gap:             SPACING.sm,
    backgroundColor: 'rgba(239,83,80,0.10)',
    borderRadius:    RADIUS.md,
    borderWidth:     1,
    borderColor:     'rgba(239,83,80,0.25)',
    padding:         SPACING.md,
    marginBottom:    SPACING.lg,
  },
  errorText: {
    flex:       1,
    fontSize:   FONTS.sizes.sm,
    color:      COLORS.status.error,
    lineHeight: 18,
  },

  uploadBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            SPACING.sm,
    borderRadius:   RADIUS.full,
    paddingVertical: SPACING.md + 2,
    marginBottom:   SPACING.md,
  },
  uploadBtnText: {
    fontSize:   FONTS.sizes.base,
    fontWeight: FONTS.weights.bold,
    color:      COLORS.surface,
  },

  secondaryBtn: {
    alignItems:      'center',
    paddingVertical: SPACING.md,
  },
  secondaryBtnText: {
    fontSize: FONTS.sizes.base,
    color:    COLORS.text.secondary,
  },

  // ── Uploading state ───────────────────────────────────────────────────────
  uploadingWrap: {
    alignItems: 'center',
    paddingTop: SPACING.xl,
    gap:        SPACING.lg,
  },
  uploadingFile: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius:    RADIUS.full,
    borderWidth:     1,
    borderColor:     COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingVertical:   SPACING.sm,
    maxWidth:          300,
  },
  uploadingFileName: {
    fontSize: FONTS.sizes.sm,
    color:    COLORS.text.secondary,
    flex:     1,
  },

  progressArea: {
    alignItems:      'center',
    justifyContent:  'center',
    marginVertical:  SPACING.sm,
  },
  spinner: {
    marginBottom: SPACING.sm,
  },
  progressPct: {
    fontSize:   FONTS.sizes.xxxl,
    fontWeight: FONTS.weights.bold,
    color:      COLORS.accent,
  },

  barTrack: {
    width:           '100%',
    height:          6,
    backgroundColor: COLORS.surface,
    borderRadius:    RADIUS.full,
    overflow:        'hidden',
  },
  barFill: {
    height:          '100%',
    backgroundColor: COLORS.accent,
    borderRadius:    RADIUS.full,
  },

  progressLabel: {
    fontSize: FONTS.sizes.sm,
    color:    COLORS.text.muted,
  },

  cancelBtn: {
    paddingVertical:   SPACING.md,
    paddingHorizontal: SPACING.xl,
  },
  cancelBtnText: {
    fontSize: FONTS.sizes.base,
    color:    COLORS.text.secondary,
  },
});

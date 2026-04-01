import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  SafeAreaView, KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS } from '../../src/constants/theme';
import { coachApi } from '../../src/utils/api';
import { getProfile } from '../../src/utils/storage';
import { getBlock, getBlockName, getPhase } from '../../src/utils/calculations';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: { title: string; page: string | number; preview: string }[];
  timestamp: Date;
}

function formatTime(date: Date): string {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

const STARTERS = [
  { category: 'NUTRITION',   icon: 'food-apple-outline',         q: 'What should I eat around training?' },
  { category: 'RECOVERY',    icon: 'sleep',                      q: 'My lower back is tight — what should I modify?' },
  { category: 'PROGRAMMING', icon: 'chart-timeline-variant',     q: 'Explain accommodating resistance' },
  { category: 'TECHNIQUE',   icon: 'weight-lifter',              q: "What's the best accessory for hip drive?" },
];

const MOTIVATIONAL = [
  "The bar doesn't lie.",
  "Built, not bought.",
  "Strong enough to carry more.",
  "Every rep is a decision.",
];

export default function CoachScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    getProfile().then(setProfile);
  }, []);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: trimmed, timestamp: new Date() };
    const history = messages.map(m => ({ role: m.role, content: m.content }));
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    try {
      const result = await coachApi.chat(trimmed, history);
      const assistantMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: result.response || 'No response received.',
        sources: result.sources || [],
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch {
      setMessages(prev => [...prev, {
        id: `e-${Date.now()}`, role: 'assistant',
        content: 'Connection error. Check your network and try again.', sources: [],
        timestamp: new Date(),
      }]);
    }
    setLoading(false);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 150);
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
        {/* ── Header ── */}
        <View style={s.header}>
          <TouchableOpacity testID="coach-back-btn" onPress={() => router.back()} style={s.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.text.secondary} />
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <View style={s.headerIconBadge}>
              <MaterialCommunityIcons name="brain" size={18} color={COLORS.accent} />
            </View>
            <Text style={s.title}>Your AI Strength Coach</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* ── Messages ── */}
        <FlatList
          ref={listRef}
          testID="coach-messages-list"
          data={messages}
          keyExtractor={item => item.id}
          style={s.list}
          contentContainerStyle={s.listContent}
          ListEmptyComponent={<StarterPrompts onSelect={sendMessage} profile={profile} />}
          renderItem={({ item }) => <MessageBubble message={item} />}
          ListFooterComponent={loading ? <LoadingDots /> : null}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        />

        {/* ── Input bar ── */}
        <View style={s.inputBar}>
          <TextInput
            testID="coach-input"
            style={[s.input, inputFocused && s.inputFocused]}
            value={input}
            onChangeText={setInput}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder="Ask your coach anything..."
            placeholderTextColor={COLORS.text.muted}
            multiline
            returnKeyType="default"
            blurOnSubmit={false}
            textAlignVertical="top"
            scrollEnabled
          />
          <TouchableOpacity
            testID="coach-send-btn"
            style={[s.sendBtn, (!input.trim() || loading) && s.sendBtnDisabled]}
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || loading}
          >
            <MaterialCommunityIcons name="send" size={20} color={!input.trim() || loading ? COLORS.text.muted : COLORS.primary} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Inline markdown formatter ─────────────────────────────────────────────────
function InlineText({ text, style }: { text: string; style?: any }): React.ReactElement {
  const parts: { content: string; bold?: boolean; italic?: boolean }[] = [];
  const regex = /(\*\*\*[^*]+?\*\*\*|\*\*[^*]+?\*\*|\*[^*]+?\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ content: text.slice(lastIndex, match.index) });
    }
    const raw = match[0];
    if (raw.startsWith('***')) {
      parts.push({ content: raw.slice(3, -3), bold: true, italic: true });
    } else if (raw.startsWith('**')) {
      parts.push({ content: raw.slice(2, -2), bold: true });
    } else {
      parts.push({ content: raw.slice(1, -1), italic: true });
    }
    lastIndex = match.index + raw.length;
  }
  if (lastIndex < text.length) parts.push({ content: text.slice(lastIndex) });

  return (
    <Text style={style}>
      {parts.map((part, i) => (
        <Text
          key={i}
          style={[
            part.bold  && { fontWeight: '700' as const, color: COLORS.accent },
            part.italic && { fontStyle: 'italic' as const, color: COLORS.text.secondary },
          ]}
        >
          {part.content}
        </Text>
      ))}
    </Text>
  );
}

// ── Block markdown renderer ───────────────────────────────────────────────────
function MarkdownText({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let key = 0;
  let bullets: string[] = [];
  let numbered: { n: string; text: string }[] = [];

  const flushBullets = () => {
    if (!bullets.length) return;
    elements.push(
      <View key={`bl${key++}`} style={md.listGroup}>
        {bullets.map((b, i) => (
          <View key={i} style={md.bulletRow}>
            <View style={md.bulletDot} />
            <InlineText text={b} style={md.bulletText} />
          </View>
        ))}
      </View>
    );
    bullets = [];
  };
  const flushNumbered = () => {
    if (!numbered.length) return;
    elements.push(
      <View key={`nl${key++}`} style={md.listGroup}>
        {numbered.map((item, i) => (
          <View key={i} style={md.numberedRow}>
            <Text style={md.numberedNum}>{item.n}.</Text>
            <InlineText text={item.text} style={md.numberedText} />
          </View>
        ))}
      </View>
    );
    numbered = [];
  };

  for (const line of lines) {
    const t = line.trim();
    if (!t) { flushBullets(); flushNumbered(); continue; }

    if (t.startsWith('# ')) {
      flushBullets(); flushNumbered();
      elements.push(<Text key={`h1${key++}`} style={md.h1}>{t.slice(2)}</Text>);
    } else if (t.startsWith('## ')) {
      flushBullets(); flushNumbered();
      elements.push(<Text key={`h2${key++}`} style={md.h2}>{t.slice(3)}</Text>);
    } else if (t.startsWith('### ')) {
      flushBullets(); flushNumbered();
      elements.push(<Text key={`h3${key++}`} style={md.h3}>{t.slice(4)}</Text>);
    } else if (t.startsWith('- ') || t.startsWith('* ') || t.startsWith('• ')) {
      flushNumbered();
      bullets.push(t.slice(2));
    } else if (/^\d+\.\s/.test(t)) {
      flushBullets();
      const m = t.match(/^(\d+)\.\s(.+)/);
      if (m) numbered.push({ n: m[1], text: m[2] });
    } else if (
      t.startsWith('> ') || t.includes('⚠️') ||
      /^(warning|caution|note):/i.test(t)
    ) {
      flushBullets(); flushNumbered();
      const wText = t.startsWith('> ') ? t.slice(2) : t;
      elements.push(
        <View key={`w${key++}`} style={md.warningBox}>
          <MaterialCommunityIcons name="alert-circle-outline" size={14} color="#FFA726" style={{ marginTop: 2 }} />
          <InlineText text={wText} style={md.warningText} />
        </View>
      );
    } else {
      flushBullets(); flushNumbered();
      elements.push(<InlineText key={`p${key++}`} text={t} style={md.paragraph} />);
    }
  }
  flushBullets();
  flushNumbered();

  return <View>{elements}</View>;
}

const md = StyleSheet.create({
  h1:          { fontSize: FONTS.sizes.xl,   fontWeight: '800' as any, color: COLORS.text.primary,    marginBottom: 6,         marginTop: SPACING.md,   lineHeight: 28 },
  h2:          { fontSize: FONTS.sizes.lg,   fontWeight: '800' as any, color: COLORS.accent,          marginBottom: 6,         marginTop: SPACING.md,   lineHeight: 26 },
  h3:          { fontSize: FONTS.sizes.base, fontWeight: '700' as any, color: COLORS.text.primary,    marginBottom: 4,         marginTop: SPACING.sm,   lineHeight: 22 },
  paragraph:   { fontSize: FONTS.sizes.sm,   color: COLORS.text.primary, lineHeight: 23,              marginBottom: SPACING.sm },
  listGroup:   { marginBottom: SPACING.sm  },
  bulletRow:   { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 5 },
  bulletDot:   { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.accent, marginRight: 9, marginTop: 9 },
  bulletText:  { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text.primary, lineHeight: 23 },
  numberedRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 5 },
  numberedNum: { fontSize: FONTS.sizes.sm, fontWeight: '700' as any, color: COLORS.accent, marginRight: 6, minWidth: 18 },
  numberedText:{ flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text.primary, lineHeight: 23 },
  warningBox:  {
    flexDirection: 'row', alignItems: 'flex-start', gap: 7,
    backgroundColor: 'rgba(255, 167, 38, 0.07)',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderLeftWidth: 2,
    borderLeftColor: '#FFA726',
  },
  warningText: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, lineHeight: 21 },
});

// ── Message bubble (user + coach) ─────────────────────────────────────────────
function MessageBubble({ message }: { message: Message }) {
  const isUser     = message.role === 'user';
  const timeStr    = formatTime(message.timestamp);
  const srcCount   = message.sources?.length ?? 0;

  if (isUser) {
    return (
      <View style={mb.userRow}>
        <View style={mb.userBubble}>
          <Text style={mb.userText}>{message.content}</Text>
          <Text style={mb.timestamp}>{timeStr}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={mb.coachRow}>
      <View style={mb.coachCard}>
        {/* Header row */}
        <View style={mb.coachHeader}>
          <View style={mb.coachAvatar}>
            <MaterialCommunityIcons name="brain" size={13} color={COLORS.accent} />
          </View>
          <Text style={mb.coachLabel}>Coach</Text>
        </View>

        {/* Rendered markdown */}
        <MarkdownText content={message.content} />

        {/* Sources footer */}
        {srcCount > 0 && (
          <View style={mb.sourcesRow}>
            <MaterialCommunityIcons name="book-open-page-variant-outline" size={12} color={COLORS.text.muted} />
            <Text style={mb.sourcesText}>
              Based on {srcCount} source{srcCount !== 1 ? 's' : ''}
            </Text>
          </View>
        )}

        <Text style={mb.timestamp}>{timeStr}</Text>
      </View>
    </View>
  );
}

const mb = StyleSheet.create({
  // User message — right-aligned dark bubble
  userRow:    { paddingHorizontal: SPACING.lg, marginBottom: SPACING.md, alignItems: 'flex-end' },
  userBubble: {
    maxWidth: '80%',
    backgroundColor: '#2A2A2E',
    borderRadius: RADIUS.xl,
    borderBottomRightRadius: RADIUS.sm,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  userText:  { color: COLORS.text.primary, fontSize: FONTS.sizes.sm, lineHeight: 22 },

  // Coach message card — gold left accent
  coachRow:  { paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg },
  coachCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderTopWidth: 1,    borderTopColor: COLORS.border,
    borderRightWidth: 1,  borderRightColor: COLORS.border,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    borderLeftWidth: 3,   borderLeftColor: COLORS.accent,
  },
  coachHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.md },
  coachAvatar: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(201, 168, 76, 0.12)',
    borderWidth: 1, borderColor: 'rgba(201, 168, 76, 0.3)',
    justifyContent: 'center', alignItems: 'center',
  },
  coachLabel: { fontSize: FONTS.sizes.xs, fontWeight: '800' as any, color: COLORS.accent, letterSpacing: 1 },

  // Sources + timestamp
  sourcesRow:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: SPACING.md, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border },
  sourcesText: { fontSize: 10, color: COLORS.text.muted },
  timestamp:   { fontSize: 10, color: COLORS.text.muted, marginTop: 6, textAlign: 'right' },
});

function StarterPrompts({ onSelect, profile }: { onSelect: (text: string) => void; profile: any }) {
  const week  = profile?.currentWeek || 1;
  const block = getBlock(week);
  const phase = getPhase(week);
  const hasProfile = !!profile;

  return (
    <View style={sp.wrapper}>
      {/* ── Icon ring ── */}
      <View style={sp.iconRing}>
        <MaterialCommunityIcons name="brain" size={44} color={COLORS.accent} />
      </View>

      {/* ── Title ── */}
      <Text style={sp.title}>Your AI Strength Coach</Text>

      {/* ── Description ── */}
      <Text style={sp.sub}>
        Trained on 485 sources — strength science, programming methodology, rehab protocols, and elite coaching wisdom. Ask me anything about your training.
      </Text>

      {/* ── Context banner ── */}
      {hasProfile && (
        <View style={sp.contextBanner}>
          <MaterialCommunityIcons name="map-marker-path" size={14} color={COLORS.accent} style={{ marginRight: 6 }} />
          <Text style={sp.contextText}>
            Currently coaching you through:{' '}
            <Text style={sp.contextHighlight}>Block {block} — {phase} Phase, Week {week}</Text>
          </Text>
        </View>
      )}

      {/* ── Suggested questions ── */}
      <Text style={sp.suggestLabel}>SUGGESTED QUESTIONS</Text>
      {STARTERS.map(item => (
        <TouchableOpacity
          testID={`starter-${item.q.slice(0, 20)}`}
          key={item.q}
          style={sp.chip}
          onPress={() => onSelect(item.q)}
          activeOpacity={0.8}
        >
          <View style={sp.chipCategoryRow}>
            <MaterialCommunityIcons name={item.icon as any} size={11} color={COLORS.accent} style={{ marginRight: 4 }} />
            <Text style={sp.chipCategory}>{item.category}</Text>
          </View>
          <View style={sp.chipBottom}>
            <Text style={sp.chipText}>{item.q}</Text>
            <MaterialCommunityIcons name="arrow-right" size={16} color={COLORS.accent} />
          </View>
        </TouchableOpacity>
      ))}

      {/* ── Footer ── */}
      <Text style={sp.footer}>Powered by 25,088 knowledge chunks · 485 sources</Text>
    </View>
  );
}

const sp = StyleSheet.create({
  wrapper:     { padding: SPACING.xl, alignItems: 'center', paddingBottom: SPACING.md },

  // Icon
  iconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.surfaceHighlight,
    borderWidth: 2,
    borderColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },

  // Title & description
  title: { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, marginBottom: SPACING.md, textAlign: 'center' },
  sub:   { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, textAlign: 'center', lineHeight: 22, marginBottom: SPACING.lg },

  // Context banner
  contextBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    backgroundColor: 'rgba(201, 168, 76, 0.06)',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.xl,
  },
  contextText:      { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, lineHeight: 20 },
  contextHighlight: { color: COLORS.accent, fontWeight: FONTS.weights.semibold },

  // Suggested label
  suggestLabel: {
    fontSize: 10,
    fontWeight: FONTS.weights.heavy,
    color: COLORS.text.muted,
    letterSpacing: 2,
    alignSelf: 'flex-start',
    marginBottom: SPACING.sm,
  },

  // Question chips (gold-bordered cards)
  chip: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1.5,
    borderColor: COLORS.accent,
    gap: 6,
  },
  chipCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipCategory: {
    fontSize: 9,
    fontWeight: FONTS.weights.heavy,
    color: COLORS.accent,
    letterSpacing: 1.5,
  },
  chipBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  chipText: {
    flex: 1,
    color: COLORS.text.primary,
    fontSize: FONTS.sizes.sm,
    fontWeight: FONTS.weights.medium,
    lineHeight: 20,
  },

  // Footer
  footer: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    textAlign: 'center',
    marginTop: SPACING.lg,
    letterSpacing: 0.3,
  },
});

function LoadingDots() {
  const dots = [
    useRef(new Animated.Value(0.25)).current,
    useRef(new Animated.Value(0.25)).current,
    useRef(new Animated.Value(0.25)).current,
  ];

  useEffect(() => {
    const anims = dots.map((dot, i) =>
      Animated.sequence([
        Animated.delay(i * 180),
        Animated.loop(Animated.sequence([
          Animated.timing(dot, { toValue: 1,    duration: 340, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.25, duration: 340, useNativeDriver: true }),
        ])),
      ])
    );
    Animated.parallel(anims).start();
    return () => dots.forEach(d => d.stopAnimation());
  }, []);

  return (
    <View style={ld.row}>
      <View style={ld.card}>
        <View style={ld.header}>
          <View style={ld.avatar}>
            <MaterialCommunityIcons name="brain" size={13} color={COLORS.accent} />
          </View>
          <Text style={ld.label}>Coach</Text>
        </View>
        <View style={ld.dotsRow}>
          {dots.map((dot, i) => (
            <Animated.View key={i} style={[ld.dot, { opacity: dot }]} />
          ))}
        </View>
      </View>
    </View>
  );
}

const ld = StyleSheet.create({
  row:     { paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderTopWidth: 1,    borderTopColor: COLORS.border,
    borderRightWidth: 1,  borderRightColor: COLORS.border,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    borderLeftWidth: 3,   borderLeftColor: COLORS.accent,
  },
  header:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.sm },
  avatar:  { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(201, 168, 76, 0.12)', borderWidth: 1, borderColor: 'rgba(201, 168, 76, 0.3)', justifyContent: 'center', alignItems: 'center' },
  label:   { fontSize: FONTS.sizes.xs, fontWeight: '800' as any, color: COLORS.accent, letterSpacing: 1 },
  dotsRow: { flexDirection: 'row', gap: 7, alignItems: 'center', paddingVertical: 2 },
  dot:     { width: 9, height: 9, borderRadius: 5, backgroundColor: COLORS.accent },
});

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },

  // Header — centered layout
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn:      { padding: 4, width: 40 },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  headerIconBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(201, 168, 76, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(201, 168, 76, 0.3)',
  },
  title:        { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, letterSpacing: 0.3 },

  // Messages list
  list:         { flex: 1 },
  listContent:  { paddingTop: SPACING.lg, paddingBottom: SPACING.md },

  // Input bar — gold accent
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: SPACING.sm,
    backgroundColor: COLORS.secondary,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.surfaceHighlight,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingTop: 12,
    paddingBottom: 12,
    color: COLORS.text.primary,
    fontSize: FONTS.sizes.sm,
    minHeight: 56,
    maxHeight: 180,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    lineHeight: 20,
  },
  inputFocused: {
    borderColor: COLORS.accent,
  },
  sendBtn:         { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { backgroundColor: COLORS.surfaceHighlight },
});

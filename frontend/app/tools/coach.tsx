import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  SafeAreaView, KeyboardAvoidingView, Platform, Animated, ActivityIndicator,
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
    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: trimmed };
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
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch {
      setMessages(prev => [...prev, {
        id: `e-${Date.now()}`, role: 'assistant',
        content: 'Connection error. Check your network and try again.', sources: [],
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

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <View style={[mb.row, isUser && mb.rowUser]}>
      {!isUser && (
        <View style={mb.avatar}>
          <MaterialCommunityIcons name="brain" size={16} color={COLORS.accent} />
        </View>
      )}
      <View style={[mb.bubble, isUser ? mb.bubbleUser : mb.bubbleAssistant]}>
        <Text style={[mb.text, isUser && mb.textUser]}>{message.content}</Text>
        {!isUser && message.sources && message.sources.length > 0 && (
          <View style={mb.sources}>
            <Text style={mb.sourcesLabel}>Sources: </Text>
            <Text style={mb.sourcesText}>
              {message.sources.map(s => `${s.title}${s.page ? ` p.${s.page}` : ''}`).join(' · ')}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const mb = StyleSheet.create({
  row: { flexDirection: 'row', marginBottom: SPACING.md, paddingHorizontal: SPACING.lg, alignItems: 'flex-end' },
  rowUser: { justifyContent: 'flex-end' },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.surfaceHighlight, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.sm, marginBottom: 2 },
  bubble: { maxWidth: '80%', borderRadius: RADIUS.lg, padding: SPACING.md },
  bubbleUser: { backgroundColor: COLORS.accent, borderBottomRightRadius: 4 },
  bubbleAssistant: { backgroundColor: COLORS.surfaceHighlight, borderBottomLeftRadius: 4 },
  text: { color: COLORS.text.primary, fontSize: FONTS.sizes.sm, lineHeight: 20 },
  textUser: { color: COLORS.primary, fontWeight: FONTS.weights.semibold },
  sources: { flexDirection: 'row', flexWrap: 'wrap', marginTop: SPACING.sm, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border },
  sourcesLabel: { color: COLORS.text.muted, fontSize: 10, fontWeight: FONTS.weights.bold },
  sourcesText: { color: COLORS.text.muted, fontSize: 10, flex: 1 },
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
  const dots = [useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current, useRef(new Animated.Value(0.3)).current];

  useEffect(() => {
    const animations = dots.map((dot, i) =>
      Animated.sequence([
        Animated.delay(i * 200),
        Animated.loop(Animated.sequence([
          Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ])),
      ])
    );
    Animated.parallel(animations).start();
    return () => dots.forEach(d => d.stopAnimation());
  }, []);

  return (
    <View style={ld.row}>
      <View style={ld.avatar}>
        <MaterialCommunityIcons name="brain" size={16} color={COLORS.accent} />
      </View>
      <View style={ld.bubble}>
        {dots.map((dot, i) => (
          <Animated.View key={i} style={[ld.dot, { opacity: dot }]} />
        ))}
      </View>
    </View>
  );
}

const ld = StyleSheet.create({
  row: { flexDirection: 'row', paddingHorizontal: SPACING.lg, marginBottom: SPACING.md, alignItems: 'flex-end' },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.surfaceHighlight, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.sm },
  bubble: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.surfaceHighlight, borderRadius: RADIUS.lg, padding: SPACING.md, borderBottomLeftRadius: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.accent },
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

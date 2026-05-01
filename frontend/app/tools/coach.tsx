import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  SafeAreaView, KeyboardAvoidingView, Platform, Modal, ActivityIndicator,
  Alert, ScrollView,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS } from '../../src/constants/theme';
import { coachApi } from '../../src/utils/api';
import { getProfile } from '../../src/utils/storage';
import { getBlock, getPhase } from '../../src/utils/calculations';
import { consumeCoachSeed } from '../../src/store/coachSeedStore';
import VoiceInputButton from '../../src/components/VoiceInputButton';
import SpeakerButton from '../../src/components/SpeakerButton';

// ── Types ─────────────────────────────────────────────────────────────────────
interface ExerciseSwap {
  original: string;
  replacement: string;
  reason: string;
}

interface ProgramChange {
  type: string;
  exercises?: ExerciseSwap[];
  summary: string;
  details: string;
}

interface ExerciseChange {
  from: string;
  to: string;
  reason?: string;
}

interface ChangesByCategory {
  main: ExerciseChange[];
  supplemental: ExerciseChange[];
  accessory: ExerciseChange[];
  prehab: ExerciseChange[];
}

interface ApplyResult {
  exercises_swapped: number;
  changes_by_category: ChangesByCategory;
  message: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  hasProgramChange?: boolean;
  programChange?: ProgramChange | null;
}

interface ConversationSummary {
  id: string;
  title: string;
  hasProgramChange: boolean;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTime(date: Date): string {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatRelativeDate(isoString: string): string {
  if (!isoString) return '';
  const d = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours < 24) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  if (diffHours < 48) return 'Yesterday';
  if (diffHours < 168) return `${Math.floor(diffHours / 24)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const STARTERS = [
  { category: 'NUTRITION',   icon: 'food-apple-outline',         q: 'What should I eat around training?' },
  { category: 'RECOVERY',    icon: 'sleep',                      q: 'My lower back is tight — what should I modify?' },
  { category: 'PROGRAMMING', icon: 'chart-timeline-variant',     q: 'Explain accommodating resistance' },
  { category: 'TECHNIQUE',   icon: 'weight-lifter',              q: "What's the best accessory for hip drive?" },
];

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function CoachScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [appliedMessages, setAppliedMessages] = useState<Record<string, boolean>>({});
  const [appliedResults, setAppliedResults] = useState<Record<string, ApplyResult>>({});
  const [applySuccessMsg, setApplySuccessMsg] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);
  // Prevent double-firing the seed (e.g. React StrictMode double-effect)
  const seedFiredRef = useRef(false);

  // ── TTS auto-play: track which messages have already been "seen" so we
  // never auto-play history loaded from the server, only freshly-arrived msgs.
  const seenMessageIdsRef  = useRef<Set<string>>(new Set());
  const [autoPlayMessageId, setAutoPlayMessageId] = useState<string | null>(null);

  useEffect(() => {
    getProfile().then(setProfile);
    loadConversations();
  }, []);

  // ── Auto-play: detect newly-arrived assistant messages ─────────────────────
  // Profile is intentionally not in the dep array — once a message is marked
  // as "seen" it cannot retroactively trigger auto-play even if profile reloads.
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant') return;
    if (seenMessageIdsRef.current.has(lastMsg.id)) return;
    // Mark seen first — prevents the effect from firing twice for same message
    seenMessageIdsRef.current.add(lastMsg.id);
    if (profile?.auto_play_coach_responses) {
      setAutoPlayMessageId(lastMsg.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // ── Seed auto-send on focus (Option B) ────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      const seed = consumeCoachSeed();
      if (seed && !seedFiredRef.current) {
        seedFiredRef.current = true;
        // Start fresh so seed doesn't bleed into existing conversation
        setMessages([]);
        setConversationId(null);
        // Small delay to let React flush state before sending
        setTimeout(() => {
          seedFiredRef.current = false;
          sendMessage(seed.seedPrompt, 'system_seed');
        }, 250);
      }
    }, [])
  );

  const loadConversations = async () => {
    try {
      const data = await coachApi.getConversations();
      setConversations(data || []);
    } catch {
      // silently fail
    }
  };

  const startNewConversation = () => {
    setMessages([]);
    setConversationId(null);
    setShowHistory(false);
  };

  const openConversation = async (conv: ConversationSummary) => {
    setLoadingHistory(true);
    try {
      const data = await coachApi.getConversation(conv.id);
      const msgs: Message[] = (data.messages || []).map((m: any, i: number) => ({
        id: `hist-${i}`,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        sources: [],
        timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
        hasProgramChange: m.hasProgramChange || false,
        programChange: m.programChange || null,
      }));
      setMessages(msgs);
      setConversationId(conv.id);
      setShowHistory(false);
      // Mark all history messages as "seen" so they never trigger auto-play
      msgs.forEach(m => seenMessageIdsRef.current.add(m.id));
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 200);
    } catch {
      Alert.alert('Error', 'Could not load conversation.');
    }
    setLoadingHistory(false);
  };

  const deleteConversation = async (id: string) => {
    Alert.alert('Delete Conversation', 'Remove this conversation from history?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await coachApi.deleteConversation(id);
            setConversations(prev => prev.filter(c => c.id !== id));
            if (conversationId === id) startNewConversation();
          } catch {
            Alert.alert('Error', 'Could not delete conversation.');
          }
        },
      },
    ]);
  };

  async function applyRecommendation(message: Message) {
    if (!message.programChange || !conversationId) return;
    setApplyingId(message.id);
    try {
      const pc = message.programChange;
      const result = await coachApi.applyRecommendation(
        conversationId,
        pc.summary,
        pc.details,
        pc.exercises || []
      );
      setAppliedMessages(prev => ({ ...prev, [message.id]: true }));
      // Store the full result so the bubble can render the expandable summary
      if (result) {
        setAppliedResults(prev => ({ ...prev, [message.id]: result }));
      }
      const successMsg = result.exercises_swapped > 0
        ? `✓ ${result.exercises_swapped} exercise${result.exercises_swapped !== 1 ? 's' : ''} updated in current block`
        : '✓ Recommendation logged to your changelog';
      setApplySuccessMsg(successMsg);
      setTimeout(() => setApplySuccessMsg(null), 4000);
    } catch {
      Alert.alert('Error', 'Could not apply recommendation. Try again.');
    }
    setApplyingId(null);
  }

  async function sendMessage(text: string, source: string = 'user_typed') {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };
    const history = messages.map(m => ({ role: m.role, content: m.content }));
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const result = await coachApi.chat(trimmed, history, conversationId, source);

      // Update conversationId from response
      if (result.conversation_id && result.conversation_id !== conversationId) {
        setConversationId(result.conversation_id);
        // Refresh conversation list for new conversations
        loadConversations();
      }

      const assistantMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: result.response || 'No response received.',
        sources: result.sources || [],
        timestamp: new Date(),
        hasProgramChange: result.has_program_change || false,
        programChange: result.program_change || null,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch {
      setMessages(prev => [...prev, {
        id: `e-${Date.now()}`, role: 'assistant',
        content: 'Connection error. Check your network and try again.',
        sources: [],
        timestamp: new Date(),
      }]);
    }
    setLoading(false);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 150);
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* ── Header ── */}
        <View style={s.header}>
          <TouchableOpacity testID="coach-back-btn" onPress={() => router.back()} style={s.iconBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.text.secondary} />
          </TouchableOpacity>

          <View style={s.headerCenter}>
            <View style={s.headerIconBadge}>
              <MaterialCommunityIcons name="brain" size={18} color={COLORS.accent} />
            </View>
            <Text style={s.title}>Pocket Coach</Text>
          </View>

          <View style={s.headerRight}>
            {messages.length > 0 && (
              <TouchableOpacity style={s.iconBtn} onPress={startNewConversation}>
                <MaterialCommunityIcons name="plus-circle-outline" size={22} color={COLORS.text.secondary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.iconBtn} onPress={() => setShowHistory(true)}>
              <MaterialCommunityIcons name="history" size={22} color={COLORS.text.secondary} />
              {conversations.length > 0 && (
                <View style={s.historyBadge}>
                  <Text style={s.historyBadgeText}>{conversations.length > 9 ? '9+' : conversations.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
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
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              onApply={() => applyRecommendation(item)}
              applying={applyingId === item.id}
              applied={appliedMessages[item.id] || false}
              applyResult={appliedResults[item.id]}
              autoPlay={autoPlayMessageId === item.id}
            />
          )}
          ListFooterComponent={loading ? <LoadingDots /> : null}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        />

        {/* ── Success toast ── */}
        {applySuccessMsg && (
          <View style={s.successToast}>
            <MaterialCommunityIcons name="check-circle" size={16} color="#4DCEA6" />
            <Text style={s.successToastText}>{applySuccessMsg}</Text>
          </View>
        )}

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
          {/* ── Mic button — Prompt 9A voice input ── */}
          <View style={s.micWrap}>
            <VoiceInputButton
              onTranscribed={(text) => setInput(text)}
              disabled={loading}
            />
          </View>
          <TouchableOpacity
            testID="coach-send-btn"
            style={[
              s.sendBtn,
              input.trim() && !loading ? s.sendBtnActive : s.sendBtnMuted,
            ]}
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || loading}
          >
            <MaterialCommunityIcons
              name="send"
              size={20}
              color={input.trim() && !loading ? '#fff' : COLORS.text.muted}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* ── Conversation History Modal ── */}
      <ConversationHistoryModal
        visible={showHistory}
        conversations={conversations}
        loading={loadingHistory}
        onClose={() => setShowHistory(false)}
        onSelect={openConversation}
        onDelete={deleteConversation}
        onNew={startNewConversation}
      />
    </SafeAreaView>
  );
}

// ── Conversation History Modal ────────────────────────────────────────────────
function ConversationHistoryModal({
  visible, conversations, loading, onClose, onSelect, onDelete, onNew
}: {
  visible: boolean;
  conversations: ConversationSummary[];
  loading: boolean;
  onClose: () => void;
  onSelect: (c: ConversationSummary) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={hm.container}>
        {/* Header */}
        <View style={hm.header}>
          <Text style={hm.title}>Conversation History</Text>
          <TouchableOpacity onPress={onClose} style={hm.closeBtn}>
            <MaterialCommunityIcons name="close" size={22} color={COLORS.text.secondary} />
          </TouchableOpacity>
        </View>

        {/* New Conversation button */}
        <TouchableOpacity style={hm.newBtn} onPress={onNew} activeOpacity={0.8}>
          <MaterialCommunityIcons name="plus-circle-outline" size={18} color={COLORS.primary} />
          <Text style={hm.newBtnText}>New Conversation</Text>
        </TouchableOpacity>

        {loading && (
          <View style={hm.loadingRow}>
            <ActivityIndicator color={COLORS.accent} />
          </View>
        )}

        {!loading && conversations.length === 0 && (
          <View style={hm.emptyState}>
            <MaterialCommunityIcons name="chat-outline" size={40} color={COLORS.text.muted} />
            <Text style={hm.emptyText}>No past conversations yet</Text>
            <Text style={hm.emptySub}>Start a conversation with your coach</Text>
          </View>
        )}

        <ScrollView style={hm.list} showsVerticalScrollIndicator={false}>
          {conversations.map(conv => (
            <TouchableOpacity
              key={conv.id}
              style={hm.convItem}
              onPress={() => onSelect(conv)}
              activeOpacity={0.7}
            >
              <View style={hm.convIcon}>
                <MaterialCommunityIcons
                  name={conv.hasProgramChange ? 'lightning-bolt' : 'chat-outline'}
                  size={16}
                  color={conv.hasProgramChange ? COLORS.accent : COLORS.text.muted}
                />
              </View>
              <View style={hm.convInfo}>
                <Text style={hm.convTitle} numberOfLines={2}>{conv.title}</Text>
                <Text style={hm.convMeta}>
                  {conv.messageCount} messages · {formatRelativeDate(conv.updatedAt)}
                  {conv.hasProgramChange && <Text style={hm.convTag}>  · Has recommendation</Text>}
                </Text>
              </View>
              <TouchableOpacity
                style={hm.deleteBtn}
                onPress={() => onDelete(conv.id)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={16} color={COLORS.text.muted} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const hm = StyleSheet.create({
  container:  { flex: 1, backgroundColor: COLORS.background },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACING.lg, paddingTop: SPACING.xl, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title:      { fontSize: FONTS.sizes.xl, fontWeight: FONTS.weights.heavy as any, color: COLORS.text.primary },
  closeBtn:   { padding: 4 },
  newBtn:     { flexDirection: 'row', alignItems: 'center', gap: 10, margin: SPACING.lg, backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.accent, paddingVertical: SPACING.md, paddingHorizontal: SPACING.lg },
  newBtnText: { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.semibold as any, color: COLORS.primary },
  loadingRow: { alignItems: 'center', padding: SPACING.xl },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xxl, gap: SPACING.md },
  emptyText:  { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.bold as any, color: COLORS.text.secondary },
  emptySub:   { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, textAlign: 'center' },
  list:       { flex: 1, padding: SPACING.lg },
  convItem:   { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  convIcon:   { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.surfaceHighlight, justifyContent: 'center', alignItems: 'center' },
  convInfo:   { flex: 1, gap: 3 },
  convTitle:  { fontSize: FONTS.sizes.sm, fontWeight: FONTS.weights.semibold as any, color: COLORS.text.primary, lineHeight: 20 },
  convMeta:   { fontSize: 11, color: COLORS.text.muted },
  convTag:    { color: COLORS.accent },
  deleteBtn:  { padding: 6 },
});

// ── Loading dots ──────────────────────────────────────────────────────────────
function LoadingDots() {
  const [dotCount, setDotCount] = useState(1);
  useEffect(() => {
    const interval = setInterval(() => setDotCount(p => (p % 3) + 1), 500);
    return () => clearInterval(interval);
  }, []);
  return (
    <View style={ld.row}>
      <View style={ld.avatar}>
        <MaterialCommunityIcons name="brain" size={13} color={COLORS.accent} />
      </View>
      <View style={ld.bubble}>
        <Text style={ld.text}>{'Thinking' + '.'.repeat(dotCount)}</Text>
      </View>
    </View>
  );
}
const ld = StyleSheet.create({
  row:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, gap: SPACING.sm },
  avatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(201, 168, 76, 0.12)', borderWidth: 1, borderColor: 'rgba(201, 168, 76, 0.3)', justifyContent: 'center', alignItems: 'center' },
  bubble: { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  text:   { fontSize: FONTS.sizes.sm, color: COLORS.text.muted, fontStyle: 'italic' },
});

// ── Inline markdown formatter ─────────────────────────────────────────────────
// Uses split-based approach for reliable ** bold ** and * italic * rendering
function InlineText({ text, style }: { text: string; style?: any }): React.ReactElement {
  // Step 1: Split on ** to find bold/non-bold alternating segments
  const boldSegs = text.split('**');

  if (boldSegs.length <= 1) {
    // No ** found — handle single * italic if present
    const italicSegs = text.split(/(?<!\*)\*(?!\*)/g);
    if (italicSegs.length <= 1) {
      return <Text style={style} selectable>{text}</Text>;
    }
    return (
      <Text style={style} selectable>
        {italicSegs.map((seg, i) =>
          seg ? (
            <Text key={i} selectable style={i % 2 === 1 ? { fontStyle: 'italic', color: COLORS.text.secondary } : undefined}>
              {seg}
            </Text>
          ) : null
        )}
      </Text>
    );
  }

  // Even indices = not bold, odd indices = bold
  return (
    <Text style={style} selectable>
      {boldSegs.map((seg, i) => {
        if (!seg) return null;
        if (i % 2 === 1) {
          // Bold segment
          return (
            <Text key={i} selectable style={{ fontWeight: '700', color: COLORS.accent }}>
              {seg}
            </Text>
          );
        }
        // Plain segment — check for single *italic*
        const italicSegs = seg.split(/(?<!\*)\*(?!\*)/g);
        if (italicSegs.length <= 1) {
          return <Text key={i} selectable>{seg}</Text>;
        }
        return (
          <Text key={i} selectable>
            {italicSegs.map((s, j) =>
              s ? (
                <Text key={j} selectable style={j % 2 === 1 ? { fontStyle: 'italic', color: COLORS.text.secondary } : undefined}>
                  {s}
                </Text>
              ) : null
            )}
          </Text>
        );
      })}
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
            <Text style={md.numberedNum} selectable>{item.n}.</Text>
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
      elements.push(<Text key={`h1${key++}`} style={md.h1} selectable>{t.slice(2)}</Text>);
    } else if (t.startsWith('## ')) {
      flushBullets(); flushNumbered();
      elements.push(<Text key={`h2${key++}`} style={md.h2} selectable>{t.slice(3)}</Text>);
    } else if (t.startsWith('### ')) {
      flushBullets(); flushNumbered();
      elements.push(<Text key={`h3${key++}`} style={md.h3} selectable>{t.slice(4)}</Text>);
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

// ── Message bubble ─────────────────────────────────────────────────────────────
function MessageBubble({
  message,
  onApply,
  applying,
  applied,
  applyResult,
  autoPlay,
}: {
  message: Message;
  onApply: () => void;
  applying: boolean;
  applied: boolean;
  applyResult?: ApplyResult;
  autoPlay?: boolean;
}) {
  const isUser  = message.role === 'user';
  const timeStr = formatTime(message.timestamp);
  const [expanded, setExpanded] = useState(false);

  if (isUser) {
    return (
      <View style={mb.userRow}>
        <View style={mb.userBubble}>
          <Text style={mb.userText} selectable>{message.content}</Text>
          <Text style={mb.timestamp}>{timeStr}</Text>
        </View>
      </View>
    );
  }

  // Build category rows for the expandable view
  const categoryConfig = [
    { key: 'main',         label: 'MAIN LIFTS',   color: '#C9A84C', icon: 'weight-lifter'       as const },
    { key: 'supplemental', label: 'SUPPLEMENTAL',  color: '#7BA7D4', icon: 'dumbbell'             as const },
    { key: 'accessory',    label: 'ACCESSORY',     color: '#9B8EC4', icon: 'arm-flex-outline'     as const },
    { key: 'prehab',       label: 'PREHAB ADDED',  color: '#4DCEA6', icon: 'bandage'              as const },
  ];

  const hasChanges = applyResult && (
    (applyResult.changes_by_category?.main?.length ?? 0) +
    (applyResult.changes_by_category?.supplemental?.length ?? 0) +
    (applyResult.changes_by_category?.accessory?.length ?? 0) +
    (applyResult.changes_by_category?.prehab?.length ?? 0)
  ) > 0;

  return (
    <View style={mb.coachRow}>
      <View style={mb.coachCard}>
        {/* Header row */}
        <View style={mb.coachHeader}>
          <View style={mb.coachAvatar}>
            <MaterialCommunityIcons name="brain" size={13} color={COLORS.accent} />
          </View>
          <Text style={mb.coachLabel}>Coach</Text>
          <SpeakerButton text={message.content} autoPlay={autoPlay ?? false} />
        </View>

        {/* Rendered markdown — NO sources footer */}
        <MarkdownText content={message.content} />

        <Text style={mb.timestamp}>{timeStr}</Text>

        {/* Apply to My Program section */}
        {message.hasProgramChange && message.programChange && (
          <View style={mb.applySection}>
            <View style={mb.applyDivider} />

            {/* Recommendation card */}
            {!applied && (
              <View style={mb.recCard}>
                <View style={mb.recHeader}>
                  <MaterialCommunityIcons name="lightning-bolt" size={14} color={COLORS.accent} />
                  <Text style={mb.recHeaderText}>Program Recommendation</Text>
                </View>
                {/* FULL text, no numberOfLines limit */}
                <Text style={mb.recText}>{message.programChange.summary}</Text>
              </View>
            )}

            {/* ── Applied state: expandable summary ── */}
            {applied ? (
              <View style={mb.appliedContainer}>
                {/* Tappable header row */}
                <TouchableOpacity
                  style={mb.appliedHeader}
                  onPress={() => hasChanges && setExpanded(e => !e)}
                  activeOpacity={hasChanges ? 0.7 : 1}
                >
                  <View style={mb.appliedHeaderLeft}>
                    <MaterialCommunityIcons name="check-circle" size={18} color="#4DCEA6" />
                    <View style={mb.appliedHeaderText}>
                      <Text style={mb.appliedTitle}>Applied to Current Block</Text>
                      <Text style={mb.appliedSubtitle}>
                        {applyResult
                          ? applyResult.exercises_swapped > 0
                            ? `${applyResult.exercises_swapped} exercise${applyResult.exercises_swapped !== 1 ? 's' : ''} modified`
                            : 'Logged to changelog'
                          : 'Changes applied'}
                      </Text>
                    </View>
                  </View>
                  {hasChanges && (
                    <MaterialCommunityIcons
                      name={expanded ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={COLORS.text.muted}
                    />
                  )}
                </TouchableOpacity>

                {/* Expandable change list */}
                {expanded && hasChanges && applyResult && (
                  <View style={mb.appliedDetail}>
                    {categoryConfig.map(cfg => {
                      const items = applyResult.changes_by_category[cfg.key as keyof ChangesByCategory] || [];
                      if (!items.length) return null;
                      return (
                        <View key={cfg.key} style={mb.categoryBlock}>
                          {/* Category heading */}
                          <View style={mb.categoryHeader}>
                            <MaterialCommunityIcons name={cfg.icon} size={11} color={cfg.color} />
                            <Text style={[mb.categoryLabel, { color: cfg.color }]}>
                              {cfg.label} ({items.length})
                            </Text>
                          </View>
                          {/* Exercise rows */}
                          {items.map((ch, idx) => (
                            <View key={idx} style={mb.changeRow}>
                              {/* "From" pill */}
                              {ch.from ? (
                                <>
                                  <Text style={mb.changeFrom} numberOfLines={1}>{ch.from}</Text>
                                  <MaterialCommunityIcons name="arrow-right" size={12} color={COLORS.text.muted} style={mb.changeArrow} />
                                </>
                              ) : null}
                              {/* "To" pill */}
                              <Text style={[mb.changeTo, { color: cfg.color }]} numberOfLines={1}>{ch.to}</Text>
                            </View>
                          ))}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            ) : (
              /* Apply button — full width, 48px tall */
              <TouchableOpacity
                style={[mb.applyBtn, applying && mb.applyBtnLoading]}
                onPress={onApply}
                disabled={applying}
                activeOpacity={0.85}
              >
                {applying ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="check-bold" size={16} color="#fff" />
                    <Text style={mb.applyBtnText}>Apply to My Program</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
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
  timestamp:  { fontSize: 10, color: COLORS.text.muted, marginTop: 6, textAlign: 'right' },

  // Apply to My Program section
  applySection:  { marginTop: SPACING.md },
  applyDivider:  { height: 1, backgroundColor: COLORS.border, marginBottom: 12 },

  // Recommendation card: #111114 bg, 16px padding, 12px border radius
  recCard: {
    backgroundColor: '#111114',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(201, 168, 76, 0.2)',
  },
  recHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  recHeaderText: { fontSize: 10, fontWeight: '800' as any, color: COLORS.accent, letterSpacing: 1.5 },
  recText:   { fontSize: FONTS.sizes.sm, color: '#E0E0E0', lineHeight: 22 },

  // Apply button: full-width, #C9A84C bg, white bold, 48px height, 10px radius
  applyBtn:  {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#C9A84C',
    borderRadius: 10,
    height: 48,
    width: '100%',
  },
  applyBtnLoading: { opacity: 0.7 },
  applyBtnText:    { fontSize: FONTS.sizes.base, fontWeight: '700' as any, color: '#fff' },

  // ── Applied / Expandable summary ──────────────────────────────────────────
  appliedContainer: {
    backgroundColor: '#0F1F17',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(77, 206, 166, 0.3)',
    overflow: 'hidden',
  },
  appliedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  appliedHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  appliedHeaderText: { flex: 1 },
  appliedTitle:   { fontSize: FONTS.sizes.sm, fontWeight: '700' as any, color: '#4DCEA6' },
  appliedSubtitle:{ fontSize: 11, color: 'rgba(77, 206, 166, 0.7)', marginTop: 1 },

  // Expandable detail section
  appliedDetail: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(77, 206, 166, 0.15)',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 12,
  },
  categoryBlock: { gap: 6 },
  categoryHeader:{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  categoryLabel: { fontSize: 9, fontWeight: '800' as any, letterSpacing: 1.5 },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 8,
    gap: 0,
    flexWrap: 'nowrap',
  },
  changeFrom:  { fontSize: 11, color: COLORS.text.muted, flex: 1, flexShrink: 1 },
  changeArrow: { marginHorizontal: 4 },
  changeTo:    { fontSize: 11, fontWeight: '600' as any, flex: 1, flexShrink: 1, textAlign: 'right' },
});

// ── Starter prompts ───────────────────────────────────────────────────────────
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
        Backed by strength science, programming methodology, rehab protocols, and elite coaching wisdom. Ask me anything about your training.
      </Text>

      {/* ── Context banner ── */}
      {hasProfile && (
        <View style={sp.contextBanner}>
          <MaterialCommunityIcons
            name={profile?.training_mode === 'free' ? 'notebook-outline' : 'map-marker-path'}
            size={14}
            color={profile?.training_mode === 'free' ? '#2A9D8F' : COLORS.accent}
            style={{ marginRight: 6 }}
          />
          {profile?.training_mode === 'free' ? (
            <Text style={[sp.contextText, { color: '#A0A0B0' }]}>
              Coaching mode:{' '}
              <Text style={[sp.contextHighlight, { color: '#2A9D8F' }]}>Free training. Ask me about anything in your training history.</Text>
            </Text>
          ) : (
            <Text style={sp.contextText}>
              Currently coaching you through:{' '}
              <Text style={sp.contextHighlight}>Block {block} — {phase} Phase, Week {week}</Text>
            </Text>
          )}
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
      <Text style={sp.footer}>Powered by The Program's knowledge engine</Text>
    </View>
  );
}

const sp = StyleSheet.create({
  wrapper:     { padding: SPACING.xl, alignItems: 'center', paddingBottom: SPACING.md },
  iconRing: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: COLORS.surfaceHighlight,
    borderWidth: 2, borderColor: COLORS.accent,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  title: { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.heavy as any, color: COLORS.text.primary, marginBottom: SPACING.md, textAlign: 'center' },
  sub:   { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, textAlign: 'center', lineHeight: 22, marginBottom: SPACING.lg },
  contextBanner: {
    flexDirection: 'row', alignItems: 'flex-start', width: '100%',
    backgroundColor: 'rgba(201, 168, 76, 0.06)',
    borderLeftWidth: 3, borderLeftColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.md,
    marginBottom: SPACING.xl,
  },
  contextText:      { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, lineHeight: 20 },
  contextHighlight: { color: COLORS.accent, fontWeight: FONTS.weights.semibold as any },
  suggestLabel: {
    fontSize: 10, fontWeight: FONTS.weights.heavy as any, color: COLORS.text.muted,
    letterSpacing: 2, alignSelf: 'flex-start', marginBottom: SPACING.sm,
  },
  chip: {
    width: '100%', backgroundColor: COLORS.surface, borderRadius: RADIUS.xl,
    padding: SPACING.md, marginBottom: SPACING.sm,
    borderWidth: 1.5, borderColor: COLORS.accent, gap: 6,
  },
  chipCategoryRow: { flexDirection: 'row', alignItems: 'center' },
  chipCategory:    { fontSize: 9, fontWeight: FONTS.weights.heavy as any, color: COLORS.accent, letterSpacing: 1.5 },
  chipBottom:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chipText:        { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text.primary, lineHeight: 21, paddingRight: SPACING.sm },
  footer:          { fontSize: 10, color: COLORS.text.muted, marginTop: SPACING.xl, textAlign: 'center' },
});

// ── Main screen styles ─────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: COLORS.background },
  header:        {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    gap: SPACING.sm,
  },
  headerCenter:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm },
  headerRight:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerIconBadge: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(201, 168, 76, 0.1)',
    borderWidth: 1, borderColor: 'rgba(201, 168, 76, 0.3)',
    justifyContent: 'center', alignItems: 'center',
  },
  title:         { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold as any, color: COLORS.text.primary },
  iconBtn:       { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  historyBadge:  {
    position: 'absolute', top: 4, right: 4,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: COLORS.accent,
    justifyContent: 'center', alignItems: 'center',
  },
  historyBadgeText: { fontSize: 8, fontWeight: '700' as any, color: COLORS.background },
  list:          { flex: 1 },
  listContent:   { paddingTop: SPACING.md, paddingBottom: SPACING.md },
  inputBar:      {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    gap: SPACING.sm, backgroundColor: COLORS.background,
  },
  input:         {
    flex: 1, minHeight: 44, maxHeight: 120,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.primary,
    borderWidth: 1, borderColor: COLORS.border,
  },
  inputFocused:  { borderColor: COLORS.accent },
  sendBtn:       {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
  },
  sendBtnActive: {
    backgroundColor: '#C9A84C',
    shadowColor: '#C9A84C',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  sendBtnMuted:  { backgroundColor: '#2A2A30', opacity: 0.55 },
  micWrap:       { justifyContent: 'center', alignItems: 'center', paddingBottom: 2 },
  successToast: {
    position: 'absolute',
    bottom: 80,
    left: SPACING.lg,
    right: SPACING.lg,
    backgroundColor: '#1A2A1A',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#4DCEA6',
    zIndex: 100,
  },
  successToastText: { fontSize: FONTS.sizes.sm, fontWeight: '600' as any, color: '#4DCEA6', flex: 1 },
});

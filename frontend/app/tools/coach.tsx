import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  SafeAreaView, KeyboardAvoidingView, Platform, Animated, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS } from '../../src/constants/theme';
import { coachApi } from '../../src/utils/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: { title: string; page: string | number; preview: string }[];
}

const STARTERS = [
  "What should I eat around training?",
  "My lower back is tight today — what should I modify?",
  "Explain accommodating resistance",
  "What's the best accessory for hip drive?",
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
  const listRef = useRef<FlatList>(null);

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
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity testID="coach-back-btn" onPress={() => router.back()} style={s.backBtn}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.text.secondary} />
          </TouchableOpacity>
          <MaterialCommunityIcons name="brain" size={22} color={COLORS.accent} />
          <Text style={s.title}>Pocket Coach</Text>
        </View>

        {/* Messages */}
        <FlatList
          ref={listRef}
          testID="coach-messages-list"
          data={messages}
          keyExtractor={item => item.id}
          style={s.list}
          contentContainerStyle={s.listContent}
          ListEmptyComponent={<StarterPrompts onSelect={sendMessage} />}
          renderItem={({ item }) => <MessageBubble message={item} />}
          ListFooterComponent={loading ? <LoadingDots /> : null}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        />

        {/* Input bar */}
        <View style={s.inputBar}>
          <TextInput
            testID="coach-input"
            style={s.input}
            value={input}
            onChangeText={setInput}
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

function StarterPrompts({ onSelect }: { onSelect: (text: string) => void }) {
  return (
    <View style={sp.wrapper}>
      <View style={sp.iconWrap}>
        <MaterialCommunityIcons name="brain" size={48} color={COLORS.accent} />
      </View>
      <Text style={sp.title}>Pocket Coach</Text>
      <Text style={sp.sub}>Ask anything about training, nutrition, recovery, or injury management. Drawing from a library of 37 strength and conditioning books.</Text>
      <Text style={sp.suggestLabel}>SUGGESTED QUESTIONS</Text>
      {STARTERS.map(s => (
        <TouchableOpacity testID={`starter-${s.slice(0, 20)}`} key={s} style={sp.chip} onPress={() => onSelect(s)}>
          <Text style={sp.chipText}>{s}</Text>
          <MaterialCommunityIcons name="arrow-right" size={14} color={COLORS.accent} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const sp = StyleSheet.create({
  wrapper: { padding: SPACING.xl, alignItems: 'center' },
  iconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.surfaceHighlight, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.lg },
  title: { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, marginBottom: SPACING.sm },
  sub: { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, textAlign: 'center', lineHeight: 20, marginBottom: SPACING.xl },
  suggestLabel: { fontSize: 10, fontWeight: FONTS.weights.heavy, color: COLORS.text.muted, letterSpacing: 2, alignSelf: 'flex-start', marginBottom: SPACING.sm },
  chip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, width: '100%', borderWidth: 1, borderColor: COLORS.border },
  chipText: { color: COLORS.text.secondary, fontSize: FONTS.sizes.sm, flex: 1 },
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
  header: { flexDirection: 'row', alignItems: 'center', padding: SPACING.lg, paddingTop: SPACING.xl, gap: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { padding: 4, marginRight: SPACING.sm },
  title: { fontSize: FONTS.sizes.lg, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, letterSpacing: 1 },
  list: { flex: 1 },
  listContent: { paddingTop: SPACING.lg, paddingBottom: SPACING.md },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', padding: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border, gap: SPACING.sm, backgroundColor: COLORS.secondary },
  input: { flex: 1, backgroundColor: COLORS.surfaceHighlight, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingTop: 12, paddingBottom: 12, color: COLORS.text.primary, fontSize: FONTS.sizes.sm, minHeight: 56, maxHeight: 180, borderWidth: 1, borderColor: COLORS.border, lineHeight: 20 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { backgroundColor: COLORS.surfaceHighlight },
});

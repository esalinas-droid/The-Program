import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, RADIUS } from '../../src/constants/theme';

const TOOLS = [
  { id: 'coach', icon: 'brain', label: 'Pocket Coach', desc: 'Ask your AI coach anything — powered by 37 strength books', color: COLORS.accent },
  { id: 'calculator', icon: 'calculator', label: '1RM Calculator', desc: 'Epley & Brzycki formulas with percentage table', color: COLORS.accent },
  { id: 'converter', icon: 'scale-balance', label: 'lbs ↔ kg Converter', desc: 'Bidirectional conversion + plate math calculator', color: COLORS.accentBlue },
  { id: 'barguide', icon: 'dumbbell', label: 'Bar Guide', desc: 'All bars and strongman implements with specs', color: COLORS.sessions.event.text },
  { id: 'checkin', icon: 'clipboard-check', label: 'Weekly Check-In', desc: 'Review the week, get coach recommendations', color: COLORS.sessions.de_lower.text },
  { id: 'library', icon: 'book-open-variant', label: 'Reference Library', desc: 'Exercises, warm-ups, rehab protocols, events', color: COLORS.accentLight },
  { id: 'changelog', icon: 'history', label: 'Change Log', desc: 'Every AI program change with trigger, scope, and explanation', color: COLORS.text.secondary },
];

export default function ToolsScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView testID="tools-scroll">
        <View style={s.header}>
          <Text style={s.title}>TOOLS</Text>
          <Text style={s.subtitle}>Your training toolkit</Text>
        </View>
        {TOOLS.map(tool => (
          <TouchableOpacity
            testID={`tool-${tool.id}`}
            key={tool.id}
            style={s.toolCard}
            onPress={() => router.push(`/tools/${tool.id}` as any)}
          >
            <View style={[s.toolIcon, { backgroundColor: tool.color + '20' }]}>
              <MaterialCommunityIcons name={tool.icon as any} size={28} color={tool.color} />
            </View>
            <View style={s.toolInfo}>
              <Text style={s.toolLabel}>{tool.label}</Text>
              <Text style={s.toolDesc}>{tool.desc}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.text.muted} />
          </TouchableOpacity>
        ))}
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: { padding: SPACING.lg, paddingTop: SPACING.xl },
  title: { fontSize: FONTS.sizes.xxl, fontWeight: FONTS.weights.heavy, color: COLORS.text.primary, letterSpacing: 2 },
  subtitle: { fontSize: FONTS.sizes.sm, color: COLORS.text.secondary, marginTop: 4 },
  toolCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: SPACING.lg, gap: SPACING.lg },
  toolIcon: { width: 52, height: 52, borderRadius: RADIUS.md, justifyContent: 'center', alignItems: 'center' },
  toolInfo: { flex: 1 },
  toolLabel: { fontSize: FONTS.sizes.base, fontWeight: FONTS.weights.bold, color: COLORS.text.primary, marginBottom: 2 },
  toolDesc: { fontSize: FONTS.sizes.xs, color: COLORS.text.secondary, lineHeight: 16 },
});

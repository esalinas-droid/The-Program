/**
 * CoachRebalanceCard — proactive coaching trigger card for Home tab.
 *
 * Calls GET /api/coach/active-trigger on mount. If a trigger fires,
 * renders a teal-accented card. If not, renders nothing.
 *
 * Position on Home: between Weekly Quest and Coach's Directive.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { api } from '../utils/api';
import { setCoachSeed } from '../store/coachSeedStore';

const TEAL   = '#4DCEA6';
const GOLD   = '#C9A84C';
const AMBER  = '#FF9800';
const RED    = '#EF5350';
const BG     = '#0A0A0C';
const CARD   = '#0D1F1A';
const BORDER = '#1B3A2F';
const TEXT   = '#E8E8E6';
const MUTED  = '#666';

interface ActiveTrigger {
  triggerName: string;
  cardText: string;
  cta: string;
  seedPrompt: string;
  payload: Record<string, any>;
}

// Map trigger names to icon + accent colour
const TRIGGER_STYLE: Record<string, { icon: string; color: string }> = {
  pain_flag_recent:    { icon: 'alert-circle-outline',     color: RED },
  missed_two_sessions: { icon: 'calendar-remove-outline',  color: AMBER },
  volume_spike:        { icon: 'trending-up',              color: AMBER },
  rpe_climb:           { icon: 'speedometer',              color: AMBER },
  deload_due:          { icon: 'battery-30',               color: GOLD },
  pr_streak:           { icon: 'trophy-outline',           color: TEAL },
};

export default function CoachRebalanceCard() {
  const router  = useRouter();
  const [trigger, setTrigger]   = useState<ActiveTrigger | null>(null);
  const [loading, setLoading]   = useState(true);

  const loadTrigger = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api('/coach/active-trigger');
      if (res?.triggerName) {
        setTrigger(res as ActiveTrigger);
      } else {
        setTrigger(null);
      }
    } catch {
      setTrigger(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTrigger(); }, [loadTrigger]);

  if (loading) return null;   // silent — no skeleton to avoid layout shift
  if (!trigger) return null;  // no active trigger

  const ts      = TRIGGER_STYLE[trigger.triggerName] ?? { icon: 'brain', color: TEAL };
  const accent  = ts.color;

  const handleCTA = () => {
    setCoachSeed({ seedPrompt: trigger.seedPrompt, triggerName: trigger.triggerName });
    router.push('/tools/coach');
  };

  return (
    <View style={[c.card, { borderColor: accent + '40' }]}>
      {/* Glow strip */}
      <View style={[c.glowStrip, { backgroundColor: accent }]} />

      {/* Header row */}
      <View style={c.headerRow}>
        <View style={[c.iconWrap, { backgroundColor: accent + '18', borderColor: accent + '30' }]}>
          <MaterialCommunityIcons name={ts.icon as any} size={16} color={accent} />
        </View>
        <Text style={[c.label, { color: accent }]}>POCKET COACH</Text>
        <MaterialCommunityIcons name="star-shooting-outline" size={13} color={accent} style={{ marginLeft: 'auto' }} />
      </View>

      {/* Card body text */}
      <Text style={c.body}>{trigger.cardText}</Text>

      {/* CTA button */}
      <TouchableOpacity
        style={[c.ctaBtn, { backgroundColor: accent }]}
        onPress={handleCTA}
        activeOpacity={0.8}
      >
        <MaterialCommunityIcons name="comment-quote-outline" size={14} color={BG} style={{ marginRight: 4 }} />
        <Text style={c.ctaText}>{trigger.cta}</Text>
      </TouchableOpacity>
    </View>
  );
}

const c = StyleSheet.create({
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    marginHorizontal: 16,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#4DCEA6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  glowStrip: { height: 2, width: '100%', opacity: 0.7 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6,
  },
  iconWrap: {
    width: 28, height: 28, borderRadius: 8, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  label: {
    fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase',
  },
  body: {
    fontSize: 15, fontWeight: '600', color: TEXT, lineHeight: 22,
    paddingHorizontal: 14, paddingBottom: 14,
  },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 14, marginBottom: 14, borderRadius: 100,
    paddingVertical: 11,
  },
  ctaText: { fontSize: 13, fontWeight: '800', color: BG, letterSpacing: 0.6 },
});

/**
 * TourOverlay.tsx — Guided tour overlay (Prompt 8).
 *
 * Custom implementation using Modal + measureInWindow for element refs,
 * and calculated positions for bottom-tab targets.
 *
 * Mounted once on Home after the user completes onboarding, never again
 * unless they reset via Settings → Replay tour.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { COLORS, SPACING, FONTS, RADIUS } from '../constants/theme';

// ── Constants ──────────────────────────────────────────────────────────────────
export const TOUR_VERSION_CONSTANT = 1;

const TOOLTIP_W    = 300;
const TOOLTIP_PAD  = 16;
const TAB_BAR_H    = 62;   // matches Expo Router Tabs default height
const HL_PADDING   = 10;   // extra space around the highlighted element
const ARROW_SIZE   = 10;

// ── Types ──────────────────────────────────────────────────────────────────────
export type TourTarget =
  | 'none'
  | 'sessionCard'
  | 'coachCard'
  | 'settingsGear'
  | 'tabSchedule'   // tab index 2
  | 'tabTrack'      // tab index 3
  | 'tabTools';     // tab index 4

export interface TourRefs {
  sessionCard:  React.RefObject<View>;
  coachCard:    React.RefObject<View>;
  settingsGear: React.RefObject<View>;
}

interface TourStep {
  id:        string;
  title:     string;
  body:      string;
  target:    TourTarget;
  isWelcome?: boolean;   // step 0: full-screen centered card, no highlight
  ctaLabel?:  string;    // defaults to "Got it"
}

interface Highlight {
  x: number; y: number; width: number; height: number;
}

// ── Tour scripts ───────────────────────────────────────────────────────────────
const PROGRAM_STEPS: TourStep[] = [
  {
    id: 'welcome', isWelcome: true, target: 'none',
    title: 'Quick tour',
    body: "30 seconds. I'll show you the 6 things that matter most. Skip anytime.",
    ctaLabel: 'Start tour',
  },
  {
    id: 'session', target: 'sessionCard',
    title: 'Your daily anchor',
    body: "Today's session lives here. Tap Start when you're ready to train. The card adapts based on your status — Pending, In Progress, Complete, Rest Day.",
  },
  {
    id: 'coach', target: 'coachCard',
    title: "Coach's read on you",
    body: "Block, week, and what to focus on. The coach proactively flags things — missed sessions, pain reports, PR streaks — so you don't have to remember to ask.",
  },
  {
    id: 'schedule', target: 'tabSchedule',
    title: 'Your week at a glance',
    body: "Tap Schedule to see all sessions in this block. Today's card auto-expands. Tap any exercise's ⋮ to swap, skip, or get coach context.",
  },
  {
    id: 'track', target: 'tabTrack',
    title: "What you're hitting",
    body: 'Track shows your PRs across every lift. The board updates automatically when you hit a new max.',
  },
  {
    id: 'coach_tab', target: 'tabTools',
    title: 'Talk to your Pocket Coach',
    body: "Tools holds your Coach. The coach knows your program, injuries, recent sessions, and PRs. Ask anything — or tap any 'Ask Coach' button across the app for contextual help.",
  },
  {
    id: 'settings', target: 'settingsGear',
    title: 'Manage everything',
    body: 'Settings has Programs (library + import), training mode switcher, and the replay-tour button if you want to see this again.',
    ctaLabel: 'Done',
  },
];

const FREE_STEPS: TourStep[] = [
  {
    id: 'welcome', isWelcome: true, target: 'none',
    title: 'Quick tour',
    body: "30 seconds. Here's what's here for you in free training mode. Skip anytime.",
    ctaLabel: 'Start tour',
  },
  {
    id: 'session', target: 'sessionCard',
    title: 'Track-only mode',
    body: "You're in free training. No prescribed plan. Log sessions when you train; the coach has full context of your training history.",
  },
  {
    id: 'track', target: 'tabTrack',
    title: "What you're hitting",
    body: 'Track shows your PRs across every lift. The board updates when you log a new max.',
  },
  {
    id: 'coach_tab', target: 'tabTools',
    title: 'Your Pocket Coach',
    body: "The coach knows your training history — every logged session, every PR. Ask about programming, technique, injuries, anything.",
  },
  {
    id: 'settings', target: 'settingsGear',
    title: 'Switch modes anytime',
    body: "Settings → Switch to a program if you want an AI- or coach-built plan. Replay this tour anytime from there too.",
    ctaLabel: 'Done',
  },
];

// ── Component ──────────────────────────────────────────────────────────────────
interface Props {
  isVisible:    boolean;
  trainingMode: 'program' | 'free';
  targetRefs:   TourRefs;
  onComplete:   () => void;
  scrollRef?:   React.RefObject<ScrollView | null>;
}

export default function TourOverlay({ isVisible, trainingMode, targetRefs, onComplete, scrollRef }: Props) {
  const insets  = useSafeAreaInsets();
  const { width: SW, height: SH } = Dimensions.get('window');

  const STEPS   = trainingMode === 'free' ? FREE_STEPS : PROGRAM_STEPS;
  const TOTAL   = STEPS.length;
  // ── Issue 1 fix: dynamic welcome body so "X things" tracks TOTAL-1 ────────
  // The step array body for step 0 hardcodes a number; override it here where
  // the actual count is known.
  const highlightCount  = TOTAL - 1;
  const welcomeBodyText = trainingMode === 'free'
    ? FREE_STEPS[0].body
    : `30 seconds. I'll show you the ${highlightCount} things that matter most. Skip anytime.`;

  const [stepIdx,    setStepIdx]    = useState(0);
  const [highlight,  setHighlight]  = useState<Highlight | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; arrowDir: 'up' | 'down' } | null>(null);

  // Pulse animation for highlight border
  const pulseAnim = useRef(new Animated.Value(0)).current;
  // Fade animation for tooltip card entrance
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  // ── Start pulse loop ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isVisible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isVisible, pulseAnim]);

  // ── Fade in tooltip when step changes ─────────────────────────────────────
  useEffect(() => {
    if (!isVisible) return;
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1, duration: 220, useNativeDriver: true,
    }).start();
  }, [stepIdx, isVisible, fadeAnim]);

  // ── Measure / compute highlight for each step ──────────────────────────────
  const measureStep = useCallback((idx: number) => {
    if (idx >= STEPS.length) return;
    const step = STEPS[idx];

    if (step.target === 'none' || step.isWelcome) {
      setHighlight(null);
      setTooltipPos(null);
      return;
    }

    // Tab-based targets — compute from screen geometry
    if (step.target === 'tabSchedule' || step.target === 'tabTrack' || step.target === 'tabTools') {
      const TAB_INDICES: Record<string, number> = {
        tabSchedule: 2,
        tabTrack:    3,
        tabTools:    4,
      };
      const tabIdx  = TAB_INDICES[step.target];
      const tabW    = SW / 5;
      const x       = tabIdx * tabW;
      const y       = SH - TAB_BAR_H - insets.bottom;
      const hl: Highlight = { x, y, width: tabW, height: TAB_BAR_H };
      setHighlight(hl);
      computeTooltipPos(hl);
      return;
    }

    // Ref-based targets
    const refMap: Partial<Record<TourTarget, React.RefObject<View>>> = {
      sessionCard:  targetRefs.sessionCard,
      coachCard:    targetRefs.coachCard,
      settingsGear: targetRefs.settingsGear,
    };
    const ref = refMap[step.target];
    if (!ref?.current) {
      // If ref isn't mounted yet, centre the tooltip
      setHighlight(null);
      return;
    }

    // ── Step 1: first measureInWindow to get current pageY ────────────────
    ref.current.measureInWindow((x, y, w, h) => {
      if (w === 0 && h === 0) return; // ref not laid out yet

      // ── Step 2: scroll target into view (100px breathing room at top) ──
      const scrollTargetY = Math.max(0, y - 100);
      scrollRef?.current?.scrollTo({ y: scrollTargetY, animated: true });

      // ── Step 3: wait for scroll to settle, then re-measure for cutout ──
      setTimeout(() => {
        ref.current?.measureInWindow((x2, y2, w2, h2) => {
          if (w2 === 0 && h2 === 0) return;
          const hl: Highlight = { x: x2, y: y2, width: w2, height: h2 };
          setHighlight(hl);
          computeTooltipPos(hl);
        });
      }, 350);
    });
  }, [STEPS, SW, SH, insets.bottom, targetRefs, scrollRef]);

  useEffect(() => {
    if (isVisible) { setStepIdx(0); }
  }, [isVisible]);

  useEffect(() => {
    if (isVisible) measureStep(stepIdx);
  }, [stepIdx, isVisible, measureStep]);

  // ── Compute tooltip vertical position ─────────────────────────────────────
  function computeTooltipPos(hl: Highlight) {
    const TOOLTIP_H    = 160;
    const spaceBelow   = SH - (hl.y + hl.height + HL_PADDING) - insets.bottom - 80;
    const spaceAbove   = hl.y - HL_PADDING - insets.top - 20;
    const placeAbove   = spaceAbove > spaceBelow || spaceBelow < TOOLTIP_H;

    if (placeAbove) {
      setTooltipPos({ top: hl.y - TOOLTIP_H - HL_PADDING - ARROW_SIZE, arrowDir: 'down' });
    } else {
      setTooltipPos({ top: hl.y + hl.height + HL_PADDING + ARROW_SIZE, arrowDir: 'up' });
    }
  }

  // ── Advance / skip handlers ────────────────────────────────────────────────
  const handleNext = useCallback(() => {
    if (stepIdx >= TOTAL - 1) {
      onComplete();
    } else {
      setStepIdx(i => i + 1);
    }
  }, [stepIdx, TOTAL, onComplete]);

  const handleSkip = useCallback(() => {
    onComplete();
  }, [onComplete]);

  if (!isVisible) return null;

  const step      = STEPS[stepIdx];
  const isWelcome = !!step.isWelcome;
  const ctaLabel  = step.ctaLabel ?? 'Got it';
  const isLast    = stepIdx === TOTAL - 1;

  // ── Highlight rectangle with padding ──────────────────────────────────────
  const HL = highlight
    ? {
        x: Math.max(0, highlight.x - HL_PADDING),
        y: Math.max(0, highlight.y - HL_PADDING),
        w: highlight.width  + HL_PADDING * 2,
        h: highlight.height + HL_PADDING * 2,
      }
    : null;

  // ── Tooltip horizontal position — centred on highlight, clamped ───────────
  const tooltipLeft = HL
    ? Math.max(
        SPACING.lg,
        Math.min(
          SW - TOOLTIP_W - SPACING.lg,
          HL.x + HL.w / 2 - TOOLTIP_W / 2,
        ),
      )
    : SW / 2 - TOOLTIP_W / 2;

  // Arrow horizontal offset (relative to tooltip card left edge)
  const arrowRelX = HL
    ? Math.max(
        ARROW_SIZE + 8,
        Math.min(
          TOOLTIP_W - ARROW_SIZE * 3,
          HL.x + HL.w / 2 - tooltipLeft - ARROW_SIZE,
        ),
      )
    : TOOLTIP_W / 2 - ARROW_SIZE;

  const borderOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleSkip}
    >
      {/* ── FULL-SCREEN TOUCH AREA (skip on outside tap) ─────────────────── */}
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={handleSkip}
      >
        {/* ── DARK OVERLAY (4-rectangle cutout) ──────────────────────────── */}
        {!isWelcome && HL ? (
          <>
            {/* Top */}
            <View style={[s.overlay, { top: 0, left: 0, right: 0, height: HL.y }]} />
            {/* Left */}
            <View style={[s.overlay, { top: HL.y, left: 0, width: HL.x, height: HL.h }]} />
            {/* Right */}
            <View style={[s.overlay, { top: HL.y, left: HL.x + HL.w, right: 0, height: HL.h }]} />
            {/* Bottom */}
            <View style={[s.overlay, { top: HL.y + HL.h, left: 0, right: 0, bottom: 0 }]} />
          </>
        ) : (
          /* Full dark backdrop when no highlight (welcome step or unmeasured ref) */
          <View style={[s.overlay, StyleSheet.absoluteFill]} />
        )}

        {/* ── PULSING GOLD BORDER RING ─────────────────────────────────── */}
        {!isWelcome && HL && (
          <Animated.View
            style={[
              s.highlightRing,
              {
                position: 'absolute',
                left:     HL.x,
                top:      HL.y,
                width:    HL.w,
                height:   HL.h,
                borderRadius: step.target === 'settingsGear' ? RADIUS.full : RADIUS.md,
                opacity:  borderOpacity,
              },
            ]}
            pointerEvents="none"
          />
        )}
      </TouchableOpacity>

      {/* ── WELCOME CARD (centred modal, no highlight) ───────────────────── */}
      {isWelcome && (
        <View style={[s.welcomeContainer, { paddingBottom: insets.bottom }]}>
          <Animated.View style={[s.welcomeCard, { opacity: fadeAnim }]}>
            <View style={s.welcomeIconWrap}>
              <MaterialCommunityIcons name="compass-rose" size={36} color={COLORS.accent} />
            </View>
            <Text style={s.stepIndicator}>GUIDED TOUR · {highlightCount} STOPS</Text>
            <Text style={s.tooltipTitle}>{step.title}</Text>
            <Text style={s.tooltipBody}>{welcomeBodyText}</Text>
            <View style={s.welcomeActions}>
              <TouchableOpacity style={s.ctaBtn} onPress={handleNext} activeOpacity={0.85}>
                <Text style={s.ctaBtnText}>{ctaLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.skipBtn} onPress={handleSkip} activeOpacity={0.7}>
                <Text style={s.skipBtnText}>Skip tour</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      )}

      {/* ── TOOLTIP CARD (positioned near highlight) ─────────────────────── */}
      {!isWelcome && tooltipPos !== null && (
        <Animated.View
          style={[
            s.tooltip,
            {
              left:    tooltipLeft,
              top:     Math.max(
                insets.top + 8,
                Math.min(SH - insets.bottom - 200, tooltipPos.top),
              ),
              opacity: fadeAnim,
              transform: [{
                translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }),
              }],
            },
          ]}
          pointerEvents="box-none"
        >
          {/* Arrow pointing UP (tooltip is below highlight) */}
          {tooltipPos.arrowDir === 'up' && (
            <View style={[s.arrowUp, { left: arrowRelX }]} />
          )}

          {/* Card content */}
          <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation?.()}>
            <View style={s.tooltipInner}>
              <Text style={s.stepIndicator}>STEP {stepIdx} OF {TOTAL - 1}</Text>
              <Text style={s.tooltipTitle}>{step.title}</Text>
              <Text style={s.tooltipBody}>{step.body}</Text>
              <View style={s.tooltipFooter}>
                <TouchableOpacity onPress={handleSkip} activeOpacity={0.7} hitSlop={HITSLOP}>
                  <Text style={s.skipBtnText}>Skip tour</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.ctaBtn} onPress={handleNext} activeOpacity={0.85} hitSlop={HITSLOP}>
                  <Text style={s.ctaBtnText}>{isLast ? 'Done' : ctaLabel}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>

          {/* Arrow pointing DOWN (tooltip is above highlight) */}
          {tooltipPos.arrowDir === 'down' && (
            <View style={[s.arrowDown, { left: arrowRelX }]} />
          )}
        </Animated.View>
      )}

      {/* ── FALLBACK: tooltip centred if highlight not yet measured ──────── */}
      {!isWelcome && tooltipPos === null && (
        <View style={[s.fallbackTooltip, { top: SH / 2 - 90, left: tooltipLeft }]}>
          <TouchableOpacity activeOpacity={1}>
            <View style={s.tooltipInner}>
              <Text style={s.stepIndicator}>STEP {stepIdx} OF {TOTAL - 1}</Text>
              <Text style={s.tooltipTitle}>{step.title}</Text>
              <Text style={s.tooltipBody}>{step.body}</Text>
              <View style={s.tooltipFooter}>
                <TouchableOpacity onPress={handleSkip} activeOpacity={0.7}><Text style={s.skipBtnText}>Skip</Text></TouchableOpacity>
                <TouchableOpacity style={s.ctaBtn} onPress={handleNext} activeOpacity={0.85}><Text style={s.ctaBtnText}>{ctaLabel}</Text></TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      )}
    </Modal>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const HITSLOP = { top: 8, bottom: 8, left: 12, right: 12 };

// ── Styles ─────────────────────────────────────────────────────────────────────
const TOOLTIP_BG    = '#1A1A1F';
const OVERLAY_COLOR = 'rgba(0,0,0,0.78)';

const s = StyleSheet.create({
  // Dark overlay rectangles
  overlay: {
    position:        'absolute',
    backgroundColor: OVERLAY_COLOR,
  },

  // Pulsing gold border around highlight
  highlightRing: {
    borderWidth:  2.5,
    borderColor:  COLORS.accent,
    // transparent fill so the element behind shows through
    backgroundColor: 'transparent',
  },

  // Welcome card (centred)
  welcomeContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems:     'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  welcomeCard: {
    backgroundColor: TOOLTIP_BG,
    borderRadius:    RADIUS.xl,
    borderWidth:     1,
    borderColor:     COLORS.accent + '55',
    padding:         SPACING.xl,
    alignItems:      'center',
    gap:             SPACING.md,
    width:           '100%',
    maxWidth:        360,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20 },
      android: { elevation: 12 },
      default: {},
    }),
  },
  welcomeIconWrap: {
    width:           64,
    height:          64,
    borderRadius:    RADIUS.xl,
    backgroundColor: 'rgba(201,168,76,0.12)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  welcomeActions: {
    alignSelf: 'stretch',
    gap:       SPACING.sm,
    marginTop: SPACING.sm,
  },

  // Tooltip (near highlight)
  tooltip: {
    position: 'absolute',
    width:    TOOLTIP_W,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 16 },
      android: { elevation: 10 },
      default: {},
    }),
  },
  fallbackTooltip: {
    position: 'absolute',
    width:    TOOLTIP_W,
  },
  tooltipInner: {
    backgroundColor: TOOLTIP_BG,
    borderRadius:    RADIUS.lg,
    borderWidth:     1,
    borderColor:     COLORS.accent + '44',
    padding:         TOOLTIP_PAD,
    gap:             SPACING.sm,
  },

  // Arrows
  arrowUp: {
    position:          'absolute',
    top:               -ARROW_SIZE,
    width:             0,
    height:            0,
    borderLeftWidth:   ARROW_SIZE,
    borderRightWidth:  ARROW_SIZE,
    borderBottomWidth: ARROW_SIZE,
    borderLeftColor:   'transparent',
    borderRightColor:  'transparent',
    borderBottomColor: TOOLTIP_BG,
  },
  arrowDown: {
    position:          'absolute',
    bottom:            -ARROW_SIZE,
    width:             0,
    height:            0,
    borderLeftWidth:   ARROW_SIZE,
    borderRightWidth:  ARROW_SIZE,
    borderTopWidth:    ARROW_SIZE,
    borderLeftColor:   'transparent',
    borderRightColor:  'transparent',
    borderTopColor:    TOOLTIP_BG,
  },

  // Shared text
  stepIndicator: {
    fontSize:      FONTS.sizes.xs,
    fontWeight:    FONTS.weights.bold,
    color:         COLORS.accent,
    letterSpacing: 1.0,
  },
  tooltipTitle: {
    fontSize:   FONTS.sizes.lg,
    fontWeight: FONTS.weights.bold,
    color:      '#FFFFFF',
    lineHeight: 24,
  },
  tooltipBody: {
    fontSize:   FONTS.sizes.sm,
    color:      'rgba(255,255,255,0.80)',
    lineHeight: 19,
  },
  tooltipFooter: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginTop:      SPACING.xs,
  },

  // Buttons
  ctaBtn: {
    backgroundColor:   COLORS.accent,
    borderRadius:      RADIUS.full,
    paddingVertical:   SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  ctaBtnText: {
    fontSize:   FONTS.sizes.sm,
    fontWeight: FONTS.weights.bold,
    color:      COLORS.surface,
  },
  skipBtn:     { alignItems: 'center', paddingVertical: SPACING.sm },
  skipBtnText: { fontSize: FONTS.sizes.sm, color: 'rgba(255,255,255,0.50)' },
});

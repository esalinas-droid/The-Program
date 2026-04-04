import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, Animated, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { setAuthToken, storeUser, AuthUser } from '../src/utils/auth';

// ── Design tokens ────────────────────────────────────────────────────────────
const GOLD    = '#C9A84C';
const BG      = '#0A0A0C';
const SURFACE = '#111114';
const BORDER  = '#1E1E22';
const WHITE   = '#E8E8E6';
const MUTED   = '#6B6B70';
const RED     = '#FF4D4D';
const GREEN   = '#4DCEA6';

// ── API helper ───────────────────────────────────────────────────────────────
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

async function authFetch(path: string, body: object) {
  const res = await fetch(`${BASE_URL}/api/auth${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.detail || 'Something went wrong');
  return json;
}

// ── Social button ─────────────────────────────────────────────────────────────
function SocialButton({
  icon, label, color, onPress,
}: {
  icon: string; label: string; color: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[s.socialBtn, { borderColor: color + '55' }]} onPress={onPress} activeOpacity={0.8}>
      <MaterialCommunityIcons name={icon as any} size={22} color={color} />
      <Text style={[s.socialBtnText, { color: WHITE }]}>{label}</Text>
      <View style={[s.comingSoonBadge, { borderColor: color + '55', backgroundColor: color + '18' }]}>
        <Text style={[s.comingSoonText, { color }]}>Soon</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'choose' | 'login' | 'register'>('choose');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [name, setName]           = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const slideIn = (toMode: 'login' | 'register') => {
    Animated.sequence([
      Animated.timing(slideAnim, { toValue: -30, duration: 120, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
      Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
    ]).start();
    setMode(toMode);
    setError(null);
  };

  const handleSocialComingSoon = (provider: string) => {
    Alert.alert(
      `${provider} Sign-In`,
      `${provider} sign-in is coming soon! For now, use your email and password to create an account.`,
      [{ text: 'Use Email Instead', onPress: () => slideIn('register') }],
    );
  };

  async function handleSubmit() {
    setError(null);
    const emailTrimmed = email.trim().toLowerCase();
    if (!emailTrimmed || !password) {
      setError('Please enter your email and password.');
      return;
    }
    if (mode === 'register' && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      const endpoint = mode === 'register' ? '/register' : '/login';
      const body = mode === 'register'
        ? { email: emailTrimmed, password, name: name.trim() }
        : { email: emailTrimmed, password };

      const result = await authFetch(endpoint, body);
      await setAuthToken(result.token);
      await storeUser(result.user as AuthUser);

      // Navigate: onboarding if new, tabs if returning
      if (result.user.onboardingComplete) {
        router.replace('/(tabs)');
      } else {
        router.replace('/onboarding-intake');
      }
    } catch (e: any) {
      setError(e.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ── Choose mode (initial) ──────────────────────────────────────────────────
  if (mode === 'choose') {
    return (
      <View style={[s.root, { paddingTop: insets.top + 32 }]}>
        {/* Logo */}
        <View style={s.logoArea}>
          <View style={s.logoIcon}>
            <MaterialCommunityIcons name="weight-lifter" size={36} color={GOLD} />
          </View>
          <Text style={s.logoTitle}>The Program</Text>
          <Text style={s.logoSubtitle}>Built for athletes who train with intent.</Text>
        </View>

        {/* Social Login */}
        <View style={s.socialSection}>
          <SocialButton
            icon="google" label="Continue with Google" color="#4285F4"
            onPress={() => handleSocialComingSoon('Google')}
          />
          {Platform.OS === 'ios' && (
            <SocialButton
              icon="apple" label="Continue with Apple" color={WHITE}
              onPress={() => handleSocialComingSoon('Apple')}
            />
          )}
          <SocialButton
            icon="facebook" label="Continue with Facebook" color="#1877F2"
            onPress={() => handleSocialComingSoon('Facebook')}
          />
        </View>

        {/* Divider */}
        <View style={s.dividerRow}>
          <View style={s.dividerLine} />
          <Text style={s.dividerText}>or</Text>
          <View style={s.dividerLine} />
        </View>

        {/* Email CTA */}
        <TouchableOpacity style={s.emailBtn} onPress={() => slideIn('register')} activeOpacity={0.85}>
          <MaterialCommunityIcons name="email-outline" size={18} color={GOLD} />
          <Text style={s.emailBtnText}>Continue with Email</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => slideIn('login')} style={s.loginLink}>
          <Text style={s.loginLinkText}>Already have an account? <Text style={{ color: GOLD }}>Sign in</Text></Text>
        </TouchableOpacity>

        <Text style={[s.legalText, { marginBottom: insets.bottom + 16 }]}>
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </Text>
      </View>
    );
  }

  // ── Email form (login or register) ────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[s.formContainer, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <TouchableOpacity style={s.backBtn} onPress={() => { setMode('choose'); setError(null); }}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={MUTED} />
          <Text style={s.backBtnText}>Back</Text>
        </TouchableOpacity>

        {/* Header */}
        <View style={s.logoArea}>
          <View style={s.logoIcon}>
            <MaterialCommunityIcons name="weight-lifter" size={32} color={GOLD} />
          </View>
          <Text style={s.logoTitle}>{mode === 'register' ? 'Create account' : 'Welcome back'}</Text>
          <Text style={s.logoSubtitle}>
            {mode === 'register' ? 'Start your 12-month training calendar.' : 'Sign in to your account.'}
          </Text>
        </View>

        {/* Form */}
        <Animated.View style={[s.formCard, { transform: [{ translateY: slideAnim }] }]}>
          {error && (
            <View style={s.errorBox}>
              <MaterialCommunityIcons name="alert-circle-outline" size={16} color={RED} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          {mode === 'register' && (
            <View style={s.inputGroup}>
              <Text style={s.inputLabel}>FULL NAME</Text>
              <TextInput
                style={s.input}
                placeholder="Eric Salinas"
                placeholderTextColor={MUTED}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>
          )}

          <View style={s.inputGroup}>
            <Text style={s.inputLabel}>EMAIL</Text>
            <TextInput
              style={s.input}
              placeholder="you@example.com"
              placeholderTextColor={MUTED}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              returnKeyType="next"
            />
          </View>

          <View style={s.inputGroup}>
            <Text style={s.inputLabel}>PASSWORD</Text>
            <View style={s.passwordRow}>
              <TextInput
                style={[s.input, s.passwordInput]}
                placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'}
                placeholderTextColor={MUTED}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPw}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
              <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPw(v => !v)}>
                <MaterialCommunityIcons name={showPw ? 'eye-off' : 'eye'} size={20} color={MUTED} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[s.submitBtn, loading && s.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator size="small" color="#0A0A0C" />
              : <Text style={s.submitBtnText}>{mode === 'register' ? 'Create Account' : 'Sign In'}</Text>
            }
          </TouchableOpacity>

          {/* Switch mode */}
          <TouchableOpacity
            style={s.switchLink}
            onPress={() => slideIn(mode === 'register' ? 'login' : 'register')}
          >
            <Text style={s.switchLinkText}>
              {mode === 'register'
                ? 'Already have an account? '
                : "Don't have an account? "}
              <Text style={{ color: GOLD }}>
                {mode === 'register' ? 'Sign in' : 'Create one'}
              </Text>
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  // Logo
  logoArea: { alignItems: 'center', paddingHorizontal: 24, marginBottom: 40 },
  logoIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: GOLD + '18',
    borderWidth: 1.5, borderColor: GOLD + '55',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
  },
  logoTitle: { fontSize: 28, fontWeight: '800' as any, color: WHITE, letterSpacing: -0.5, marginBottom: 8 },
  logoSubtitle: { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 20 },

  // Social
  socialSection: { paddingHorizontal: 24, gap: 12, marginBottom: 28 },
  socialBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: SURFACE, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 16,
    borderWidth: 1,
  },
  socialBtnText: { flex: 1, fontSize: 15, fontWeight: '600' as any },
  comingSoonBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1,
  },
  comingSoonText: { fontSize: 10, fontWeight: '700' as any, letterSpacing: 0.5 },

  // Divider
  dividerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, marginBottom: 20, gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: BORDER },
  dividerText: { fontSize: 12, color: MUTED, fontWeight: '600' as any },

  // Email CTA
  emailBtn: {
    marginHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: GOLD + '18', borderWidth: 1, borderColor: GOLD + '55',
    borderRadius: 12, paddingVertical: 14,
    marginBottom: 16,
  },
  emailBtnText: { fontSize: 15, fontWeight: '700' as any, color: GOLD },

  // Links
  loginLink: { alignItems: 'center', paddingVertical: 8 },
  loginLinkText: { fontSize: 14, color: MUTED },
  legalText: { fontSize: 11, color: MUTED + '99', textAlign: 'center', paddingHorizontal: 40, marginTop: 'auto', paddingTop: 24 },

  // Form
  formContainer: { flexGrow: 1, paddingHorizontal: 24 },
  formCard: {
    backgroundColor: SURFACE, borderRadius: 16,
    padding: 20, borderWidth: 1, borderColor: BORDER,
    gap: 16,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 24, paddingVertical: 4 },
  backBtnText: { fontSize: 14, color: MUTED },
  errorBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: RED + '18', borderRadius: 8,
    padding: 12, borderWidth: 1, borderColor: RED + '33',
  },
  errorText: { flex: 1, fontSize: 13, color: RED, lineHeight: 18 },
  inputGroup: { gap: 6 },
  inputLabel: { fontSize: 10, fontWeight: '800' as any, color: MUTED, letterSpacing: 1.5 },
  input: {
    backgroundColor: BG, borderRadius: 10, borderWidth: 1, borderColor: BORDER,
    paddingVertical: 13, paddingHorizontal: 14,
    fontSize: 15, color: WHITE,
  },
  passwordRow: { position: 'relative' },
  passwordInput: { paddingRight: 48 },
  eyeBtn: { position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' },
  submitBtn: {
    backgroundColor: GOLD, borderRadius: 12,
    paddingVertical: 15, alignItems: 'center',
    marginTop: 4,
  },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { fontSize: 16, fontWeight: '800' as any, color: '#0A0A0C' },
  switchLink: { alignItems: 'center', paddingVertical: 4 },
  switchLinkText: { fontSize: 14, color: MUTED },
});

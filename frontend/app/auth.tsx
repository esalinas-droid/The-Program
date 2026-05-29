import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, Animated, Easing, Image, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { COLORS } from '../src/constants/theme';
import { setAuthToken, storeUser, AuthUser } from '../src/utils/auth';
import { saveProfile } from '../src/utils/storage';

// ── Design tokens — all sourced from theme.ts (no file-local hex) ─────────────
const GOLD    = COLORS.accent;
const BG      = COLORS.primary;
const SURFACE = COLORS.card;
const BORDER  = COLORS.border;
const WHITE   = COLORS.text.primary;
const MUTED   = COLORS.text.muted;
const RED     = COLORS.status.error;

// Required for Google sign-in redirect handling
WebBrowser.maybeCompleteAuthSession();

// ── API base ─────────────────────────────────────────────────────────────────
const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? '';

// ── Auth API helpers ──────────────────────────────────────────────────────────
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

/** Shared: store token+user and navigate after any successful auth */
async function handleAuthSuccess(result: { token: string; user: AuthUser }) {
  await setAuthToken(result.token);
  await storeUser(result.user);
  // BUG 3A: Sync name to local profile so Home tab greeting shows correctly
  if (result.user.name) {
    await saveProfile({ name: result.user.name });
  }
  if (result.user.onboardingComplete) {
    router.replace('/(tabs)');
  } else {
    router.replace('/onboarding-intake');
  }
}

// ── Social "Coming soon" button ───────────────────────────────────────────────
function SocialButton({
  icon, label, color, onPress, showBadge = true, loading = false, disabled = false,
}: {
  icon: string; label: string; color: string; onPress: () => void;
  showBadge?: boolean; loading?: boolean; disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[s.socialBtn, { borderColor: color + '55', opacity: (loading || disabled) ? 0.7 : 1 }]}
      onPress={onPress}
      activeOpacity={0.8}
      disabled={loading || disabled}
    >
      {loading
        ? <ActivityIndicator size="small" color={color} />
        : <MaterialCommunityIcons name={icon as any} size={22} color={color} />
      }
      <Text style={s.socialBtnText}>{loading ? 'Signing in…' : label}</Text>
      {showBadge && (
        <View style={[s.comingSoonBadge, { borderColor: color + '55', backgroundColor: color + '18' }]}>
          <Text style={[s.comingSoonText, { color }]}>Soon</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode]       = useState<'choose' | 'login' | 'register'>('choose');
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [name, setName]       = useState('');
  const [showPw, setShowPw]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const slideAnim = useRef(new Animated.Value(0)).current;

  // ── C.2 — Google Sign-In ──────────────────────────────────────────────────
  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID,
    iosClientId:     process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS,
    webClientId:     process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB,
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const idToken = (response as any).authentication?.idToken ?? response.params?.id_token;
      if (idToken) handleGoogleCallback(idToken);
    }
  }, [response]);

  async function handleGoogleSignIn() {
    if (!request) {
      Alert.alert(
        'Google Sign-In',
        'Google Sign-In is not configured yet. Please use email to continue.',
        [
          { text: 'Continue with Email', onPress: () => slideIn('register'), style: 'default' },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }
    setGoogleLoading(true);
    try {
      await promptAsync();
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleGoogleCallback(idToken: string) {
    setGoogleLoading(true);
    setError(null);
    try {
      const result = await authFetch('/social', { provider: 'google', token: idToken });
      await handleAuthSuccess(result);
    } catch (e: any) {
      Alert.alert(
        'Google Sign-In',
        e.message || 'Google sign-in failed. Please try again or use email.',
        [
          { text: 'Try Email', onPress: () => slideIn('register'), style: 'default' },
          { text: 'OK', style: 'cancel' },
        ],
      );
    } finally {
      setGoogleLoading(false);
    }
  }

  const slideIn = (toMode: 'login' | 'register') => {
    Animated.sequence([
      Animated.timing(slideAnim, { toValue: -24, duration: 110, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
      Animated.timing(slideAnim, { toValue: 0,   duration: 190, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
    ]).start();
    setMode(toMode);
    setError(null);
  };

  const comingSoon = (provider: string) => {
    Alert.alert(
      `${provider} Sign-In`,
      `${provider} sign-in is coming soon!\n\nFor now, tap "Continue with Email" to create a free account.`,
      [
        { text: 'Continue with Email', onPress: () => slideIn('register'), style: 'default' },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  // ── Apple Sign-In ──────────────────────────────────────────────────────────
  async function handleAppleSignIn() {
    // Check if Apple Sign-In is available on this device / iOS version
    try {
      const available = await AppleAuthentication.isAvailableAsync();
      if (!available) {
        Alert.alert(
          'Apple Sign-In Unavailable',
          'Apple Sign-In requires iOS 13 or later on a physical device. Please use email to create your account.',
          [
            { text: 'Continue with Email', onPress: () => slideIn('register'), style: 'default' },
            { text: 'Cancel', style: 'cancel' },
          ],
        );
        return;
      }
    } catch {
      // isAvailableAsync not supported on this platform — silently fall through
    }

    setAppleLoading(true);
    setError(null);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      // Build the name — Apple only provides it on FIRST sign-in
      const givenName  = credential.fullName?.givenName  ?? '';
      const familyName = credential.fullName?.familyName ?? '';

      const result = await authFetch('/social', {
        provider:  'apple',
        token:     credential.identityToken,
        user_data: {
          name:  { firstName: givenName, lastName: familyName },
          email: credential.email ?? undefined,
        },
      });
      await handleAuthSuccess(result);
    } catch (e: any) {
      // ERR_REQUEST_CANCELED / ERR_CANCELED = user dismissed the native sheet — silent
      if (e?.code === 'ERR_REQUEST_CANCELED' || e?.code === 'ERR_CANCELED') return;
      // Any other error (e.g., no Apple ID configured, network timeout) → friendly alert
      Alert.alert(
        'Apple Sign-In',
        'There was an issue completing Apple Sign-In. Please try again or use email instead.',
        [
          { text: 'Try Again', style: 'default' },
          { text: 'Use Email', onPress: () => slideIn('register') },
        ],
      );
    } finally {
      setAppleLoading(false);
    }
  }

  // ── Email submit ───────────────────────────────────────────────────────────
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
    // Audit Bug #10 fix: enforce name on register so the backend doesn't
    // silently substitute the email prefix as the name (which would show up
    // as "john" instead of the user's chosen name in the Home greeting).
    if (mode === 'register' && !name.trim()) {
      setError('Please enter your name.');
      return;
    }
    setLoading(true);
    try {
      const endpoint = mode === 'register' ? '/register' : '/login';
      const body = mode === 'register'
        ? { email: emailTrimmed, password, name: name.trim() }
        : { email: emailTrimmed, password };
      const result = await authFetch(endpoint, body);
      await handleAuthSuccess(result);
    } catch (e: any) {
      setError(e.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ── Render: Choose mode ────────────────────────────────────────────────────
  if (mode === 'choose') {
    return (
      <View style={[s.root, { paddingTop: insets.top + 32 }]}>
        {/* Logo */}
        <View style={s.logoArea}>
          <Image
            source={require('../assets/logo-full.png')}
            resizeMode="contain"
            style={{ width: 180, height: 140, alignSelf: 'center', marginBottom: 8 }}
          />
          <Text style={s.logoSubtitle}>Built for athletes who train with intent.</Text>
        </View>

        {/* Social buttons */}
        <View style={s.socialSection}>

          {/* ── Apple Sign-In (iOS only) ── */}
          {Platform.OS === 'ios' && (
            <SocialButton
              icon="apple"
              label="Sign in with Apple"
              color="#FFFFFF"
              onPress={handleAppleSignIn}
              showBadge={false}
              loading={appleLoading}
            />
          )}

          {/* Google — C.2 wired (needs EXPO_PUBLIC_GOOGLE_CLIENT_ID_* in .env to activate) */}
          <SocialButton
            icon="google"
            label="Continue with Google"
            color="#4285F4"
            onPress={handleGoogleSignIn}
            showBadge={!request}
            loading={googleLoading}
            disabled={googleLoading}
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
          <Text style={s.loginLinkText}>
            Already have an account?{'  '}
            <Text style={{ color: GOLD }}>Sign in</Text>
          </Text>
        </TouchableOpacity>

        <View style={[s.legalWrap, { marginBottom: insets.bottom + 16 }]}>
          <Text style={s.legalText}>By continuing, you agree to our </Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://theprogram.app/terms')}>
            <Text style={s.legalLink}>Terms of Service</Text>
          </TouchableOpacity>
          <Text style={s.legalText}> and </Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://theprogram.app/privacy')}>
            <Text style={s.legalLink}>Privacy Policy</Text>
          </TouchableOpacity>
          <Text style={s.legalText}>.</Text>
        </View>
      </View>
    );
  }

  // ── Render: Email form ─────────────────────────────────────────────────────
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
        <TouchableOpacity style={s.backBtn} onPress={() => { setMode('choose'); setError(null); }}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={MUTED} />
          <Text style={s.backBtnText}>Back</Text>
        </TouchableOpacity>

        <View style={s.logoArea}>
          <Image
            source={require('../assets/logo-full.png')}
            resizeMode="contain"
            style={{ width: 140, height: 110, alignSelf: 'center', marginBottom: 8 }}
          />
          <Text style={s.logoTitle}>{mode === 'register' ? 'Create account' : 'Welcome back'}</Text>
          <Text style={s.logoSubtitle}>
            {mode === 'register' ? 'Start your 12-month training calendar.' : 'Sign in to your account.'}
          </Text>
        </View>

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
                placeholder="Your full name"
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

          <TouchableOpacity
            style={s.switchLink}
            onPress={() => slideIn(mode === 'register' ? 'login' : 'register')}
          >
            <Text style={s.switchLinkText}>
              {mode === 'register' ? 'Already have an account?  ' : "Don't have an account?  "}
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
  root:       { flex: 1, backgroundColor: BG },

  // Logo
  logoArea:   { alignItems: 'center', paddingHorizontal: 24, marginBottom: 40 },
  logoIcon:   {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: GOLD + '18', borderWidth: 1.5, borderColor: GOLD + '55',
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  logoTitle:    { fontSize: 28, fontWeight: '800' as any, color: WHITE, letterSpacing: -0.5, marginBottom: 8 },
  logoSubtitle: { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 20 },

  // Social buttons
  socialSection: { paddingHorizontal: 24, gap: 12, marginBottom: 28 },

  // Apple Sign-In — black bg, Apple HIG required
  appleCustomBtn: {
    width: '100%', height: 50,
    backgroundColor: '#000000',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  appleCustomText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600' as any,
    letterSpacing: 0.1,
  },
  // Generic social (Google / Facebook)
  socialBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: SURFACE, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1,
  },
  socialBtnText:   { flex: 1, fontSize: 15, fontWeight: '600' as any, color: WHITE },
  comingSoonBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  comingSoonText:  { fontSize: 10, fontWeight: '700' as any, letterSpacing: 0.5 },

  // Divider
  dividerRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, marginBottom: 20, gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: BORDER },
  dividerText: { fontSize: 12, color: MUTED, fontWeight: '600' as any },

  // Email CTA
  emailBtn: {
    marginHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: GOLD + '18', borderWidth: 1, borderColor: GOLD + '55',
    borderRadius: 12, paddingVertical: 14, marginBottom: 16,
  },
  emailBtnText: { fontSize: 15, fontWeight: '700' as any, color: GOLD },

  // Links
  loginLink:     { alignItems: 'center', paddingVertical: 8 },
  loginLinkText: { fontSize: 14, color: MUTED },
  legalWrap:     { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingHorizontal: 32, marginTop: 'auto', paddingTop: 20 },
  legalText:     { fontSize: 11, color: MUTED + '99' },
  legalLink:     { fontSize: 11, color: GOLD, textDecorationLine: 'underline' },

  // Email form
  formContainer: { flexGrow: 1, paddingHorizontal: 24 },
  formCard:      { backgroundColor: SURFACE, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: BORDER, gap: 16 },
  backBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 24, paddingVertical: 4 },
  backBtnText:   { fontSize: 14, color: MUTED },
  errorBox:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: RED + '18', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: RED + '33' },
  errorText:     { flex: 1, fontSize: 13, color: RED, lineHeight: 18 },
  inputGroup:    { gap: 6 },
  inputLabel:    { fontSize: 10, fontWeight: '800' as any, color: MUTED, letterSpacing: 1.5 },
  input:         { backgroundColor: BG, borderRadius: 10, borderWidth: 1, borderColor: BORDER, paddingVertical: 13, paddingHorizontal: 14, fontSize: 15, color: WHITE },
  passwordRow:   { position: 'relative' },
  passwordInput: { paddingRight: 48 },
  eyeBtn:        { position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' },
  submitBtn:     { backgroundColor: GOLD, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { fontSize: 16, fontWeight: '800' as any, color: '#0A0A0C' },
  switchLink:    { alignItems: 'center', paddingVertical: 4 },
  switchLinkText:{ fontSize: 14, color: MUTED },
});


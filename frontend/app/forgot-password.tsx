/**
 * forgot-password.tsx — reset a password with a code sent by email.
 *
 * A 6-digit code rather than a magic link: no deep-link configuration to get
 * wrong, and it works the same whether the athlete opens their email on the same
 * phone or another device.
 *
 * The request step never reveals whether an address is registered — the message
 * is identical either way, so this screen can't be used to discover accounts.
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, SafeAreaView,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authApi } from '../src/utils/api';
import { setAuthToken, storeUser } from '../src/utils/auth';

const GOLD  = '#C9A84C';
const BG    = '#0A0A0C';
const CARD  = '#141418';
const BORDER= '#232329';
const TEXT  = '#E8E8E6';
const MUTED = '#77756F';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ email?: string }>();

  const [stage, setStage]       = useState<'request' | 'reset'>('request');
  const [email, setEmail]       = useState(params.email ?? '');
  const [code, setCode]         = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const requestCode = async () => {
    const addr = email.trim().toLowerCase();
    if (!addr.includes('@')) { setError('Enter the email you signed up with.'); return; }
    setError(''); setLoading(true);
    try {
      await authApi.forgotPassword(addr);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStage('reset');
    } catch (e: any) {
      setError(e?.message || 'Could not send the code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async () => {
    if (code.trim().length !== 6) { setError('Enter the 6-digit code from your email.'); return; }
    if (password.length < 8)      { setError('Password must be at least 8 characters.'); return; }
    setError(''); setLoading(true);
    try {
      const res: any = await authApi.resetPassword(email.trim().toLowerCase(), code.trim(), password);
      if (res?.token) {
        // Reset returns a session, so the athlete lands straight in the app
        // rather than being bounced back to sign in with a password they only
        // just chose.
        await setAuthToken(res.token);
        if (res.user) await storeUser(res.user);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace('/');
      } else {
        Alert.alert('Password updated', 'Sign in with your new password.',
          [{ text: 'OK', onPress: () => router.replace('/auth') }]);
      }
    } catch (e: any) {
      setError(e?.message || 'That code isn\'t valid. Request a new one.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[s.header, { paddingTop: insets.top > 0 ? 0 : 12 }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <MaterialCommunityIcons name="chevron-left" size={26} color={TEXT} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: insets.bottom + 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={s.title}>
            {stage === 'request' ? 'Reset your password' : 'Enter your code'}
          </Text>
          <Text style={s.sub}>
            {stage === 'request'
              ? "We'll email you a 6-digit code."
              : `If ${email.trim()} is registered, a code is on its way. It expires in 15 minutes.`}
          </Text>

          {stage === 'request' ? (
            <>
              <Text style={s.label}>EMAIL</Text>
              <TextInput
                style={s.input}
                value={email}
                onChangeText={t => { setEmail(t); setError(''); }}
                placeholder="you@example.com"
                placeholderTextColor={MUTED}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                returnKeyType="send"
                onSubmitEditing={requestCode}
              />
            </>
          ) : (
            <>
              <Text style={s.label}>6-DIGIT CODE</Text>
              <TextInput
                style={[s.input, s.codeInput]}
                value={code}
                onChangeText={t => { setCode(t.replace(/[^0-9]/g, '').slice(0, 6)); setError(''); }}
                placeholder="000000"
                placeholderTextColor={MUTED}
                keyboardType="number-pad"
                maxLength={6}
              />
              <Text style={[s.label, { marginTop: 20 }]}>NEW PASSWORD</Text>
              <View style={s.pwRow}>
                <TextInput
                  style={[s.input, { flex: 1, marginBottom: 0 }]}
                  value={password}
                  onChangeText={t => { setPassword(t); setError(''); }}
                  placeholder="At least 8 characters"
                  placeholderTextColor={MUTED}
                  secureTextEntry={!showPw}
                  autoComplete="new-password"
                  returnKeyType="done"
                  onSubmitEditing={submitReset}
                />
                <TouchableOpacity onPress={() => setShowPw(v => !v)} style={s.eyeBtn} hitSlop={8}>
                  <MaterialCommunityIcons name={showPw ? 'eye-off' : 'eye'} size={20} color={MUTED} />
                </TouchableOpacity>
              </View>
            </>
          )}

          {!!error && <Text style={s.error}>{error}</Text>}

          <TouchableOpacity
            style={[s.btn, loading && { opacity: 0.6 }]}
            onPress={stage === 'request' ? requestCode : submitReset}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator size="small" color="#0A0A0C" />
              : <Text style={s.btnText}>
                  {stage === 'request' ? 'Send code' : 'Set new password'}
                </Text>}
          </TouchableOpacity>

          {stage === 'reset' && (
            <TouchableOpacity onPress={requestCode} style={s.linkBtn} disabled={loading}>
              <Text style={s.link}>Didn't get it? Send another code</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: BG },
  header: { paddingHorizontal: 16, paddingBottom: 4 },
  title:  { color: TEXT, fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginBottom: 8 },
  sub:    { color: MUTED, fontSize: 15, lineHeight: 21, marginBottom: 28 },
  label:  { color: MUTED, fontSize: 11, letterSpacing: 1.2, fontWeight: '700', marginBottom: 8 },
  input: {
    backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14, color: TEXT, fontSize: 16, marginBottom: 4,
  },
  codeInput: { fontSize: 26, letterSpacing: 10, textAlign: 'center', fontWeight: '700' },
  pwRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn: { padding: 10 },
  error:  { color: '#EF5350', fontSize: 14, marginTop: 12, lineHeight: 19 },
  btn: {
    backgroundColor: GOLD, borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', marginTop: 26,
  },
  btnText: { color: '#0A0A0C', fontSize: 16, fontWeight: '800' },
  linkBtn: { alignItems: 'center', paddingVertical: 16 },
  link:    { color: MUTED, fontSize: 14 },
});

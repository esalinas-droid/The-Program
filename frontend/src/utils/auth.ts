/**
 * Auth utilities — JWT token storage and user session management.
 * Keeps an in-memory cache to avoid AsyncStorage read latency on every API call.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'auth_token';
const USER_KEY  = 'auth_user';

let _cachedToken: string | null | undefined = undefined; // undefined = not yet loaded

// ── Token ─────────────────────────────────────────────────────────────────────

export async function getAuthToken(): Promise<string | null> {
  if (_cachedToken !== undefined) return _cachedToken;
  _cachedToken = await AsyncStorage.getItem(TOKEN_KEY);
  return _cachedToken ?? null;
}

export async function setAuthToken(token: string | null): Promise<void> {
  _cachedToken = token;
  if (token) {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } else {
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(USER_KEY);
  }
}

export function invalidateTokenCache(): void {
  _cachedToken = undefined;
}

// ── User ──────────────────────────────────────────────────────────────────────

export interface AuthUser {
  userId:             string;
  email:              string;
  name:               string;
  authProvider:       string;
  onboardingComplete: boolean;
  emailVerified:      boolean;
  marketingOptIn:     boolean;
  subscriptionTier:   string;
}

export async function getStoredUser(): Promise<AuthUser | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function storeUser(user: AuthUser): Promise<void> {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function clearAuth(): Promise<void> {
  _cachedToken = null;
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
}

// ── Session Check ─────────────────────────────────────────────────────────────

export async function isAuthenticated(): Promise<boolean> {
  const token = await getAuthToken();
  return !!token;
}

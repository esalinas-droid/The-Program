export const COLORS = {
  primary: '#0D0D0D',
  secondary: '#1A1A1A',
  accent: '#C9A84C',
  accentLight: '#E8C96A',
  accentBlue: '#2E75B6',
  surface: '#1A1A1A',
  surfaceHighlight: '#242424',
  surfaceElevated: '#242424',
  background: '#0D0D0D',
  card: '#1A1A1A',
  border: '#2A2A2A',
  text: {
    primary: '#FFFFFF',
    secondary: '#AAAAAA',
    muted: '#666666',
    inverse: '#000000',
  },
  status: {
    success: '#4CAF50',
    error: '#EF5350',
    warning: '#FFA726',
    info: '#2E75B6',
  },
  sessions: {
    me_lower:  { bg: '#1A1200', borderColor: '#C9A84C', text: '#C9A84C', label: 'Heavy Lower' },
    me_upper:  { bg: '#1A1500', borderColor: '#E8C96A', text: '#E8C96A', label: 'Heavy Upper' },
    de_lower:  { bg: '#001A0D', borderColor: '#4CAF50', text: '#4CAF50', label: 'Speed Lower' },
    de_upper:  { bg: '#000D1A', borderColor: '#2E75B6', text: '#2E75B6', label: 'Speed Upper' },
    event:     { bg: '#0D001A', borderColor: '#7B2FBE', text: '#9B6FDE', label: 'Event Day' },
    recovery:  { bg: '#1A0D00', borderColor: '#FFA726', text: '#FFA726', label: 'Recovery / Conditioning' },
    deload:    { bg: '#141414', borderColor: '#666666', text: '#888888', label: 'Recovery Week' },
  },
};

export const SPACING = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32,
};

export const RADIUS = {
  sm: 4, md: 8, lg: 12, xl: 16, full: 9999,
};

export const FONTS = {
  sizes: { xs: 11, sm: 13, base: 15, lg: 17, xl: 20, xxl: 24, xxxl: 30, hero: 36 },
  weights: { regular: '400' as const, medium: '500' as const, semibold: '600' as const, bold: '700' as const, heavy: '900' as const },
};

export function getSessionStyle(sessionType: string) {
  const t = sessionType.toLowerCase();
  // ── New terminology (forward-compatible) ──────────────────────────────────
  if (t.includes('heavy lower'))  return COLORS.sessions.me_lower;
  if (t.includes('heavy upper'))  return COLORS.sessions.me_upper;
  if (t.includes('speed lower'))  return COLORS.sessions.de_lower;
  if (t.includes('speed upper'))  return COLORS.sessions.de_upper;
  if (t.includes('recovery week')) return COLORS.sessions.deload;
  if (t.includes('recovery / conditioning') || t.includes('conditioning')) return COLORS.sessions.recovery;
  // ── Legacy terminology (backward-compatible for old DB records) ─────────
  if (t.includes('max effort lower') || t.includes('me lower')) return COLORS.sessions.me_lower;
  if (t.includes('max effort upper') || t.includes('me upper')) return COLORS.sessions.me_upper;
  if (t.includes('dynamic effort lower') || t.includes('de lower')) return COLORS.sessions.de_lower;
  if (t.includes('dynamic effort upper') || t.includes('de upper')) return COLORS.sessions.de_upper;
  if (t.includes('strongman') || t.includes('event day') || t.includes('event')) return COLORS.sessions.event;
  if (t.includes('boxing') || t.includes('recovery') || t.includes('mobility') || t.includes('gpp')) return COLORS.sessions.recovery;
  if (t.includes('deload')) return COLORS.sessions.deload;
  return COLORS.sessions.deload;
}

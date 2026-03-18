export const COLORS = {
  primary: '#1F3864',
  secondary: '#1A1A2E',
  accent: '#C55A11',
  accentBlue: '#2E75B6',
  surface: '#24243E',
  surfaceHighlight: '#2E2E4A',
  background: '#1A1A2E',
  card: '#24243E',
  border: '#3A3A5C',
  text: {
    primary: '#FFFFFF',
    secondary: '#A0A0A0',
    muted: '#6B7280',
    inverse: '#000000',
  },
  status: {
    success: '#4CAF50',
    error: '#CF6679',
    warning: '#FFD700',
    info: '#2E75B6',
  },
  sessions: {
    me_lower:   { bg: '#FFF0E4', text: '#C55A11',  label: 'ME Lower' },
    me_upper:   { bg: '#FFFCE4', text: '#B8860B',  label: 'ME Upper' },
    de_lower:   { bg: '#E8F6EE', text: '#008080',  label: 'DE Lower' },
    de_upper:   { bg: '#E4EEFF', text: '#2E75B6',  label: 'DE Upper' },
    event:      { bg: '#F4EAFF', text: '#7B2FBE',  label: 'Event Day' },
    recovery:   { bg: '#F5F0FF', text: '#9370DB',  label: 'Boxing / Recovery' },
    deload:     { bg: '#F0F0F0', text: '#808080',  label: 'Deload' },
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
  if (t.includes('me lower') || t.includes('deload me lower')) return COLORS.sessions.me_lower;
  if (t.includes('me upper') || t.includes('deload me upper')) return COLORS.sessions.me_upper;
  if (t.includes('de lower') || t.includes('deload de lower')) return COLORS.sessions.de_lower;
  if (t.includes('de upper') || t.includes('deload de upper')) return COLORS.sessions.de_upper;
  if (t.includes('strongman') || t.includes('event day') || t.includes('deload strongman')) return COLORS.sessions.event;
  if (t.includes('boxing') || t.includes('recovery') || t.includes('mobility')) return COLORS.sessions.recovery;
  if (t.includes('deload')) return COLORS.sessions.deload;
  return COLORS.sessions.deload;
}

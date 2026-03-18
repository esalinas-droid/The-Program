import { AthleteProfile } from '../types';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';

async function api(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${path} error ${res.status}: ${text}`);
  }
  return res.json();
}

// Profile
export const profileApi = {
  get: () => api('/profile'),
  create: (data: Partial<AthleteProfile>) => api('/profile', { method: 'POST', body: JSON.stringify(data) }),
  update: (data: Partial<AthleteProfile>) => api('/profile', { method: 'PUT', body: JSON.stringify(data) }),
};

// Log
export const logApi = {
  list: (params?: { week?: number; exercise?: string }) => {
    const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([,v]) => v != null).map(([k,v]) => [k, String(v)])).toString() : '';
    return api(`/log${qs}`);
  },
  create: (entry: any) => api('/log', { method: 'POST', body: JSON.stringify(entry) }),
  update: (id: string, entry: any) => api(`/log/${id}`, { method: 'PUT', body: JSON.stringify(entry) }),
  delete: (id: string) => api(`/log/${id}`, { method: 'DELETE' }),
  weekStats: (week: number) => api(`/log/stats/week/${week}`),
};

// PRs
export const prApi = {
  getAll: () => api('/prs'),
  getHistory: (exercise: string) => api(`/prs/${encodeURIComponent(exercise)}`),
  getBests: () => api('/prs/bests/overview'),
};

// Bodyweight
export const bwApi = {
  getHistory: () => api('/bodyweight'),
};

// Check-in
export const checkinApi = {
  list: () => api('/checkin'),
  create: (data: any) => api('/checkin', { method: 'POST', body: JSON.stringify(data) }),
  getByWeek: (week: number) => api(`/checkin/week/${week}`),
};

// Seed
export const seedApi = {
  seed: () => api('/seed', { method: 'POST' }),
};

import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getProgramSession } from '../data/programData';
import { DELOAD_WEEKS } from './calculations';
import { AthleteProfile } from '../types';

// ── Notification identifier keys in AsyncStorage ───────────────────────────
const NOTIF_KEYS = {
  DAILY: 'notif_daily',
  CHECKIN: 'notif_checkin',
  DELOAD_PREFIX: 'notif_deload_',
};

// ── Configure default notification handler ────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ── 1. Request permissions ─────────────────────────────────────────────────
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ── 2. Daily training reminder ─────────────────────────────────────────────
export async function scheduleDailyReminder(
  timeStr: string,       // "HH:MM" e.g. "07:00"
  currentWeek: number,
  programStartDate: string
): Promise<void> {
  if (Platform.OS === 'web') return;
  await cancelDailyReminder();

  const [hourStr, minuteStr] = timeStr.split(':');
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);

  // Compute tomorrow's day name
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const tomorrowIndex = (new Date().getDay() + 1) % 7;
  const tomorrowDay = days[tomorrowIndex];

  // Skip Sunday (off day) — show Monday's session instead
  const sessionDay = tomorrowDay === 'Sunday' ? 'Monday' : tomorrowDay;
  const session = getProgramSession(currentWeek, sessionDay);

  const title = 'Training Tomorrow';
  const body = `${sessionDay}: ${session.sessionType} — ${session.mainLift}. ${session.topSetScheme.split(';')[0]}.`;

  const id = await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger: { hour, minute, repeats: true } as any,
  });

  await AsyncStorage.setItem(NOTIF_KEYS.DAILY, id);
}

export async function cancelDailyReminder(): Promise<void> {
  if (Platform.OS === 'web') return;
  const id = await AsyncStorage.getItem(NOTIF_KEYS.DAILY);
  if (id) {
    await Notifications.cancelScheduledNotificationAsync(id);
    await AsyncStorage.removeItem(NOTIF_KEYS.DAILY);
  }
}

// ── 3. Deload week alerts ──────────────────────────────────────────────────
export async function scheduleDeloadAlerts(
  currentWeek: number,
  programStartDate: string
): Promise<void> {
  if (Platform.OS === 'web') return;
  await cancelDeloadAlerts();

  const startDate = new Date(programStartDate);
  const now = new Date();

  for (const deloadWeek of DELOAD_WEEKS) {
    if (deloadWeek <= currentWeek) continue; // skip past weeks

    // Monday of that deload week = startDate + (deloadWeek - 1) * 7 days
    const monday = new Date(startDate);
    monday.setDate(startDate.getDate() + (deloadWeek - 1) * 7);
    monday.setHours(7, 0, 0, 0);

    if (monday <= now) continue; // skip if already passed

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Deload Week',
        body: 'This is a deload week. Keep intensity low, move well.',
        sound: true,
      },
      trigger: { date: monday } as any,
    });

    await AsyncStorage.setItem(`${NOTIF_KEYS.DELOAD_PREFIX}${deloadWeek}`, id);
  }
}

export async function cancelDeloadAlerts(): Promise<void> {
  if (Platform.OS === 'web') return;
  for (const deloadWeek of DELOAD_WEEKS) {
    const key = `${NOTIF_KEYS.DELOAD_PREFIX}${deloadWeek}`;
    const id = await AsyncStorage.getItem(key);
    if (id) {
      await Notifications.cancelScheduledNotificationAsync(id);
      await AsyncStorage.removeItem(key);
    }
  }
}

// ── 4. Weekly check-in reminder (Sundays) ─────────────────────────────────
export async function scheduleWeeklyCheckin(): Promise<void> {
  if (Platform.OS === 'web') return;
  await cancelWeeklyCheckin();

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Weekly Check-In',
      body: 'Time for your weekly check-in. Review the week and plan ahead.',
      sound: true,
    },
    trigger: { weekday: 1, hour: 19, minute: 0, repeats: true } as any,
  });

  await AsyncStorage.setItem(NOTIF_KEYS.CHECKIN, id);
}

export async function cancelWeeklyCheckin(): Promise<void> {
  if (Platform.OS === 'web') return;
  const id = await AsyncStorage.getItem(NOTIF_KEYS.CHECKIN);
  if (id) {
    await Notifications.cancelScheduledNotificationAsync(id);
    await AsyncStorage.removeItem(NOTIF_KEYS.CHECKIN);
  }
}

// ── 5. PR alert (fires immediately) ───────────────────────────────────────
export async function sendPRAlert(
  exercise: string,
  weight: number,
  e1rm: number
): Promise<void> {
  if (Platform.OS === 'web') return;
  const granted = await requestNotificationPermissions();
  if (!granted) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'New PR 🏆',
      body: `${exercise}: ${weight} lbs. e1RM ${e1rm} lbs.`,
      sound: true,
    },
    trigger: null,
  });
}

// ── 6. Cancel a single notification by identifier ─────────────────────────
export async function cancelNotification(id: string): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(id);
}

// ── 7. Master setup — called on app start ─────────────────────────────────
export async function setupAllNotifications(profile: AthleteProfile): Promise<void> {
  if (Platform.OS === 'web') return;

  const granted = await requestNotificationPermissions();
  if (!granted) return;

  const { notifications, currentWeek, programStartDate } = profile;

  if (notifications?.dailyReminder) {
    await scheduleDailyReminder(
      notifications.dailyReminderTime || '07:00',
      currentWeek,
      programStartDate
    );
  } else {
    await cancelDailyReminder();
  }

  if (notifications?.deloadAlert) {
    await scheduleDeloadAlerts(currentWeek, programStartDate);
  } else {
    await cancelDeloadAlerts();
  }

  if (notifications?.weeklyCheckin) {
    await scheduleWeeklyCheckin();
  } else {
    await cancelWeeklyCheckin();
  }

  // PR alerts are fire-and-forget (triggered per log entry) — no scheduling needed here
}

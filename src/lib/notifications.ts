import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

/**
 * Reminder notifications scheduling.
 *
 * Fixed IDs (so we can update/cancel without losing track):
 *   1000 — workout reminder
 *   1001 — morning metrics reminder
 *   1002 — creatine reminder
 *   2000-2010 — water reminder slots
 */

export const REMINDER_IDS = {
  workout: 1000,
  morningMetrics: 1001,
  creatine: 1002,
  waterStart: 2000,
  waterEnd: 2010,
};

function parseTime(time: string): { hour: number; minute: number } {
  const [h, m] = time.split(':').map(Number);
  return { hour: h || 7, minute: m || 0 };
}

export async function ensurePermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display === 'granted') return true;
    const req = await LocalNotifications.requestPermissions();
    return req.display === 'granted';
  } catch {
    return false;
  }
}

export async function cancelReminder(id: number): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } catch { /* ignore */ }
}

export async function cancelAllReminders(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const ids: number[] = [REMINDER_IDS.workout, REMINDER_IDS.morningMetrics, REMINDER_IDS.creatine];
  for (let i = REMINDER_IDS.waterStart; i <= REMINDER_IDS.waterEnd; i++) ids.push(i);
  try {
    await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
  } catch { /* ignore */ }
}

export async function scheduleWorkoutReminder(time: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const ok = await ensurePermission();
  if (!ok) return;
  await cancelReminder(REMINDER_IDS.workout);
  const { hour, minute } = parseTime(time);
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: REMINDER_IDS.workout,
        title: '💪 Время тренировки',
        body: 'Не пропусти сегодняшнюю сессию. Биомашина ждёт.',
        schedule: { on: { hour, minute }, allowWhileIdle: true },
        smallIcon: 'ic_stat_icon',
      }],
    });
  } catch (e) { console.error('scheduleWorkoutReminder failed', e); }
}

export async function scheduleMorningMetricsReminder(wakeupTime: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const ok = await ensurePermission();
  if (!ok) return;
  await cancelReminder(REMINDER_IDS.morningMetrics);
  // 30 minutes after wakeup
  const { hour, minute } = parseTime(wakeupTime);
  let totalMin = hour * 60 + minute + 30;
  totalMin = totalMin % (24 * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: REMINDER_IDS.morningMetrics,
        title: '📊 Утренние метрики',
        body: 'Внеси сон, пульс покоя, вес и настроение.',
        schedule: { on: { hour: h, minute: m }, allowWhileIdle: true },
        smallIcon: 'ic_stat_icon',
      }],
    });
  } catch (e) { console.error('scheduleMorningMetricsReminder failed', e); }
}

export async function scheduleCreatineReminder(time: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const ok = await ensurePermission();
  if (!ok) return;
  await cancelReminder(REMINDER_IDS.creatine);
  const { hour, minute } = parseTime(time);
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: REMINDER_IDS.creatine,
        title: '💊 Креатин',
        body: '5 г креатина моногидрата + стакан воды.',
        schedule: { on: { hour, minute }, allowWhileIdle: true },
        smallIcon: 'ic_stat_icon',
      }],
    });
  } catch (e) { console.error('scheduleCreatineReminder failed', e); }
}

export async function scheduleWaterReminder(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const ok = await ensurePermission();
  if (!ok) return;
  // Cancel old
  for (let i = REMINDER_IDS.waterStart; i <= REMINDER_IDS.waterEnd; i++) {
    await cancelReminder(i);
  }
  // Schedule slots: 9, 11, 13, 15, 17, 19
  const hours = [9, 11, 13, 15, 17, 19];
  try {
    await LocalNotifications.schedule({
      notifications: hours.map((h, idx) => ({
        id: REMINDER_IDS.waterStart + idx,
        title: '💧 Вода',
        body: 'Сделай глоток воды (~250 мл).',
        schedule: { on: { hour: h, minute: 0 }, allowWhileIdle: true },
        smallIcon: 'ic_stat_icon',
      })),
    });
  } catch (e) { console.error('scheduleWaterReminder failed', e); }
}

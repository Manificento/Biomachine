import { useState, useEffect, useRef, useCallback } from 'react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';

/**
 * Background-safe countdown timer.
 *
 * Strategy:
 * - State: setInterval ticks every 250ms while in foreground.
 * - Source of truth: endTimeRef (timestamp when timer should fire).
 * - On app resume: re-compute remaining seconds from endTimeRef.
 * - Native: schedules a LocalNotification at endTime (fires even if app is killed).
 *
 * Same public API as the previous useCountdown: { seconds, running, start, pause, reset, adjust }.
 */
export function useCountdown(initialSeconds: number) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const [running, setRunning] = useState(false);
  const endTimeRef = useRef<number | null>(null);
  const notificationIdRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tick = useCallback(() => {
    if (!endTimeRef.current) return;
    const remaining = Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000));
    setSeconds(remaining);
    if (remaining === 0) {
      setRunning(false);
      endTimeRef.current = null;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, []);

  const cancelScheduledNotification = useCallback(async () => {
    if (notificationIdRef.current && Capacitor.isNativePlatform()) {
      try {
        await LocalNotifications.cancel({ notifications: [{ id: notificationIdRef.current }] });
      } catch { /* ignore */ }
    }
    notificationIdRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setRunning((wasRunning) => {
      if (wasRunning) return wasRunning;
      // Use latest seconds value via a closure trick
      return true;
    });
    // Compute fresh from latest seconds (read inside start)
    setSeconds((current) => {
      const target = current > 0 ? current : initialSeconds;
      endTimeRef.current = Date.now() + target * 1000;

      if (Capacitor.isNativePlatform() && target > 0) {
        (async () => {
          try {
            const id = Math.floor(Math.random() * 1_000_000) + 1;
            notificationIdRef.current = id;
            await LocalNotifications.schedule({
              notifications: [{
                id,
                title: 'Отдых закончен',
                body: 'Пора к следующему подходу',
                schedule: { at: new Date(endTimeRef.current!) },
                sound: 'finish.mp3',
                smallIcon: 'ic_stat_icon',
              }],
            });
          } catch (e) { console.error('schedule notification failed', e); }
        })();
      }
      return target;
    });
  }, [initialSeconds]);

  const pause = useCallback(async () => {
    setRunning(false);
    endTimeRef.current = null;
    await cancelScheduledNotification();
  }, [cancelScheduledNotification]);

  const reset = useCallback(async (s?: number) => {
    setRunning(false);
    endTimeRef.current = null;
    await cancelScheduledNotification();
    setSeconds(s ?? initialSeconds);
  }, [initialSeconds, cancelScheduledNotification]);

  const adjust = useCallback((delta: number) => {
    setSeconds((prev) => {
      const next = Math.max(0, prev + delta);
      if (endTimeRef.current) {
        endTimeRef.current = Date.now() + next * 1000;
        // Reschedule notification with new time
        if (Capacitor.isNativePlatform() && notificationIdRef.current) {
          const oldId = notificationIdRef.current;
          (async () => {
            try {
              await LocalNotifications.cancel({ notifications: [{ id: oldId }] });
            } catch { /* ignore */ }
            if (next > 0) {
              try {
                const id = Math.floor(Math.random() * 1_000_000) + 1;
                notificationIdRef.current = id;
                await LocalNotifications.schedule({
                  notifications: [{
                    id,
                    title: 'Отдых закончен',
                    body: 'Пора к следующему подходу',
                    schedule: { at: new Date(endTimeRef.current!) },
                    sound: 'finish.mp3',
                    smallIcon: 'ic_stat_icon',
                  }],
                });
              } catch { /* ignore */ }
            }
          })();
        }
      }
      return next;
    });
  }, []);

  // Foreground tick
  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(tick, 250);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [running, tick]);

  // Resume listener on native — recompute when app returns to foreground
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handlePromise = CapacitorApp.addListener('resume', () => {
      if (running) tick();
    });
    return () => {
      handlePromise.then((h) => h.remove()).catch(() => { /* ignore */ });
    };
  }, [running, tick]);

  // Cleanup notification on unmount
  useEffect(() => {
    return () => {
      cancelScheduledNotification();
    };
  }, [cancelScheduledNotification]);

  return { seconds, running, start, pause, reset, adjust };
}

import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

/**
 * Cross-platform haptic feedback.
 * Native (Android): uses VibrationEffect API via @capacitor/haptics.
 * Web: falls back to navigator.vibrate (where supported).
 */

export async function hapticLight(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try { await Haptics.impact({ style: ImpactStyle.Light }); } catch { /* ignore */ }
  } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(10);
  }
}

export async function hapticMedium(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch { /* ignore */ }
  } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(25);
  }
}

export async function hapticHeavy(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try { await Haptics.impact({ style: ImpactStyle.Heavy }); } catch { /* ignore */ }
  } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(50);
  }
}

export async function hapticSuccess(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try { await Haptics.notification({ type: NotificationType.Success }); } catch { /* ignore */ }
  } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate([50, 30, 50]);
  }
}

export async function hapticWarning(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try { await Haptics.notification({ type: NotificationType.Warning }); } catch { /* ignore */ }
  } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate([100, 50, 100]);
  }
}

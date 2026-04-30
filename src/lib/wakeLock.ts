import { KeepAwake } from '@capacitor-community/keep-awake';
import { Capacitor } from '@capacitor/core';

/**
 * Keep the device screen awake during workout sessions and timers.
 * Native: uses @capacitor-community/keep-awake (FLAG_KEEP_SCREEN_ON).
 * Web: best-effort via Wake Lock API (where supported).
 */

let webWakeLock: WakeLockSentinel | null = null;

interface WakeLockSentinel {
  release(): Promise<void>;
}

interface NavigatorWakeLock {
  wakeLock?: {
    request(type: 'screen'): Promise<WakeLockSentinel>;
  };
}

export async function keepAwake(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try { await KeepAwake.keepAwake(); } catch (e) { console.error('keepAwake failed', e); }
    return;
  }
  // Web fallback
  try {
    const nav = navigator as Navigator & NavigatorWakeLock;
    if (nav.wakeLock?.request) {
      webWakeLock = await nav.wakeLock.request('screen');
    }
  } catch { /* ignore */ }
}

export async function allowSleep(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try { await KeepAwake.allowSleep(); } catch (e) { console.error('allowSleep failed', e); }
    return;
  }
  if (webWakeLock) {
    try { await webWakeLock.release(); } catch { /* ignore */ }
    webWakeLock = null;
  }
}

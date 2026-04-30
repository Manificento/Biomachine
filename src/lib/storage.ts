import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

/**
 * Cross-platform storage adapter.
 * Native: uses @capacitor/preferences (encrypted on Android via SharedPreferences).
 * Web: falls back to localStorage.
 */
export const storage = {
  async get(key: string): Promise<string | null> {
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key });
      return value;
    }
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await Preferences.set({ key, value });
      return;
    }
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore quota errors */
    }
  },
  async remove(key: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await Preferences.remove({ key });
      return;
    }
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

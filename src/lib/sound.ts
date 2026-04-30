import { NativeAudio } from '@capacitor-community/native-audio';
import { Capacitor } from '@capacitor/core';

let loaded = false;
let loading: Promise<void> | null = null;

async function ensureLoaded(): Promise<void> {
  if (loaded || !Capacitor.isNativePlatform()) return;
  if (loading) return loading;
  loading = (async () => {
    try {
      await NativeAudio.preload({
        assetId: 'beep',
        assetPath: 'public/beep.mp3',
        audioChannelNum: 1,
        isUrl: false,
      });
      await NativeAudio.preload({
        assetId: 'finish',
        assetPath: 'public/finish.mp3',
        audioChannelNum: 1,
        isUrl: false,
      });
      loaded = true;
    } catch (e) {
      console.error('Audio preload failed', e);
    }
  })();
  return loading;
}

/**
 * Play a timer beep.
 * type='warn' — short 440Hz tone (10s warning before timer ends)
 * type='finish' — two-tone 880→660Hz (timer reaches zero)
 *
 * Native: uses @capacitor-community/native-audio (plays even in silent mode if alarm channel).
 * Web: uses Web Audio API (oscillator).
 */
export async function playBeep(type: 'warn' | 'finish' = 'warn'): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await ensureLoaded();
      await NativeAudio.play({ assetId: type === 'finish' ? 'finish' : 'beep' });
    } catch (e) {
      console.error('playBeep failed', e);
    }
  } else {
    if (type === 'finish') {
      webBeep(880, 0.3);
      setTimeout(() => webBeep(660, 0.3), 320);
    } else {
      webBeep(440, 0.2);
    }
  }
}

function webBeep(freq: number, dur: number): void {
  try {
    const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  } catch {
    /* ignore */
  }
}

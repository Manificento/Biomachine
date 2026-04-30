import { useState, useEffect, useCallback, useRef } from "react";
import { STORAGE_KEY } from "../data/programData";
import { storage } from "../lib/storage";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { Capacitor } from "@capacitor/core";

// ─── Types ────────────────────────────────────────────────────

export interface UserPrefs {
  name: string;
  theme: "dark" | "light";
  sound: boolean;
  haptic: boolean;
  notifications: boolean;
  onboardingComplete: boolean;
  startDate: string | null; // ISO date string of program start
  currentWeek: number; // 0–12
  // Reminders
  reminderWorkoutEnabled: boolean;
  reminderWorkoutTime: string;       // HH:MM
  reminderMorningMetrics: boolean;
  reminderCreatine: boolean;
  reminderCreatineTime: string;
  reminderWater: boolean;
}

export interface DailyLog {
  date: string; // YYYY-MM-DD
  sleep: number; // hours
  sleepBedtime: string; // HH:MM
  sleepWakeup: string; // HH:MM
  sleepQuality: number; // 1–10
  restingHR: number;
  weight: number;
  steps: number;
  mood: number; // 1–10
  overtrainingMarkers: string[]; // ids
  sleepHygiene: string[]; // ids completed
  nutrition: {
    meals: { name: string; kcal: number; protein: number; fat: number; carbs: number; time: string }[];
    water: number; // ml
    supplements: string[]; // ids
  };
}

export interface SetLog {
  weight: number;
  reps: number;
  rpe: number;
  note: string;
  done: boolean;
}

export interface ExerciseLog {
  exerciseId: string;
  exerciseName: string;
  sets: SetLog[];
}

export interface WorkoutLog {
  id: string; // uuid
  date: string; // YYYY-MM-DD
  session: string; // A/B/C/D/E/R
  mesocycleIndex: number;
  week: number;
  exercises: ExerciseLog[];
  totalRpe: number;
  notes: string;
  durationMin: number;
  startTime: string;
  endTime: string;
}

export interface TestRecord {
  date: string;
  label: string; // "pre" | "week5" | "week9" | "week12"
  data: Record<string, number | string>;
}

export interface ProgressPhoto {
  id: string;
  date: string;       // ISO
  uri: string;        // webPath or data URI
  label: 'pre' | 'week4' | 'week8' | 'week12' | 'custom';
  note?: string;
}

export interface AppState {
  user: UserPrefs;
  dailyLogs: DailyLog[];
  workouts: WorkoutLog[];
  tests: TestRecord[];
  achievements: string[]; // earned achievement ids
  progressPhotos: ProgressPhoto[];
}

// ─── Defaults ─────────────────────────────────────────────────

const DEFAULT_STATE: AppState = {
  user: {
    name: "Спортсмен",
    theme: "dark",
    sound: true,
    haptic: true,
    notifications: false,
    onboardingComplete: false,
    startDate: null,
    currentWeek: 0,
    reminderWorkoutEnabled: false,
    reminderWorkoutTime: "07:00",
    reminderMorningMetrics: false,
    reminderCreatine: false,
    reminderCreatineTime: "09:00",
    reminderWater: false,
  },
  dailyLogs: [],
  workouts: [],
  tests: [],
  achievements: [],
  progressPhotos: [],
};

// ─── Helpers ──────────────────────────────────────────────────

function mergeState(parsed: Partial<AppState> | null): AppState {
  if (!parsed) return DEFAULT_STATE;
  return {
    user: { ...DEFAULT_STATE.user, ...parsed.user },
    dailyLogs: parsed.dailyLogs ?? [],
    workouts: parsed.workouts ?? [],
    tests: parsed.tests ?? [],
    achievements: parsed.achievements ?? [],
    progressPhotos: parsed.progressPhotos ?? [],
  };
}

async function safeLoad(): Promise<AppState> {
  try {
    const raw = await storage.get(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return mergeState(parsed);
  } catch {
    return DEFAULT_STATE;
  }
}

async function safeSave(state: AppState) {
  try {
    await storage.set(STORAGE_KEY, JSON.stringify(state));
  } catch {
    console.warn("Failed to save state");
  }
}

export function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

export function getWeekNumber(startDate: string | null): number {
  if (!startDate) return 0;
  const start = new Date(startDate);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const week = Math.floor(diffDays / 7) + 1;
  return Math.min(Math.max(week, 0), 12);
}

// ─── Hook ─────────────────────────────────────────────────────

export function useStore() {
  const [state, setStateRaw] = useState<AppState>(DEFAULT_STATE);
  const [isLoaded, setIsLoaded] = useState(false);
  const [saveIndicator, setSaveIndicator] = useState(false);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  // Async load on mount
  useEffect(() => {
    let cancelled = false;
    safeLoad().then((s) => {
      if (cancelled) return;
      setStateRaw(s);
      setIsLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Queue saves to avoid race conditions on native preferences
  const queueSave = useCallback((next: AppState) => {
    saveQueueRef.current = saveQueueRef.current.then(() => safeSave(next));
  }, []);

  const setState = useCallback((updater: (prev: AppState) => AppState) => {
    setStateRaw((prev) => {
      const next = updater(prev);
      queueSave(next);
      setSaveIndicator(true);
      setTimeout(() => setSaveIndicator(false), 1500);
      return next;
    });
  }, [queueSave]);

  // Auto-save belt-and-suspenders (every 10s)
  useEffect(() => {
    if (!isLoaded) return;
    const interval = setInterval(() => {
      setStateRaw((prev) => {
        queueSave(prev);
        return prev;
      });
    }, 10000);
    return () => clearInterval(interval);
  }, [isLoaded, queueSave]);

  // ── User ─────────────────────────────────────────────────────
  const updateUser = useCallback((patch: Partial<UserPrefs>) => {
    setState((prev) => ({ ...prev, user: { ...prev.user, ...patch } }));
  }, [setState]);

  // ── Daily log ────────────────────────────────────────────────
  const getTodayLog = useCallback((): DailyLog | undefined => {
    const today = todayStr();
    return state.dailyLogs.find((l) => l.date === today);
  }, [state.dailyLogs]);

  const upsertDailyLog = useCallback((patch: Partial<DailyLog> & { date?: string }) => {
    const date = patch.date ?? todayStr();
    setState((prev) => {
      const existing = prev.dailyLogs.find((l) => l.date === date);
      const base: DailyLog = existing ?? {
        date,
        sleep: 0, sleepBedtime: "", sleepWakeup: "", sleepQuality: 0,
        restingHR: 0, weight: 0, steps: 0, mood: 0,
        overtrainingMarkers: [], sleepHygiene: [],
        nutrition: { meals: [], water: 0, supplements: [] },
      };
      const updated = { ...base, ...patch };
      const logs = existing
        ? prev.dailyLogs.map((l) => (l.date === date ? updated : l))
        : [...prev.dailyLogs, updated];
      return { ...prev, dailyLogs: logs };
    });
  }, [setState]);

  // ── Workouts ────────────────────────────────────────────────
  const saveWorkout = useCallback((workout: WorkoutLog) => {
    setState((prev) => {
      const existing = prev.workouts.findIndex((w) => w.id === workout.id);
      const workouts = existing >= 0
        ? prev.workouts.map((w, i) => (i === existing ? workout : w))
        : [...prev.workouts, workout];
      return { ...prev, workouts };
    });
  }, [setState]);

  // ── Tests ───────────────────────────────────────────────────
  const saveTest = useCallback((test: TestRecord) => {
    setState((prev) => {
      const existing = prev.tests.findIndex((t) => t.label === test.label);
      const tests = existing >= 0
        ? prev.tests.map((t, i) => (i === existing ? test : t))
        : [...prev.tests, test];
      return { ...prev, tests };
    });
  }, [setState]);

  // ── Achievements ─────────────────────────────────────────────
  const unlockAchievement = useCallback((id: string) => {
    setState((prev) => {
      if (prev.achievements.includes(id)) return prev;
      return { ...prev, achievements: [...prev.achievements, id] };
    });
  }, [setState]);

  // ── Progress photos ──────────────────────────────────────────
  const addProgressPhoto = useCallback((photo: ProgressPhoto) => {
    setState((prev) => ({ ...prev, progressPhotos: [...prev.progressPhotos, photo] }));
  }, [setState]);

  const removeProgressPhoto = useCallback((id: string) => {
    setState((prev) => ({ ...prev, progressPhotos: prev.progressPhotos.filter((p) => p.id !== id) }));
  }, [setState]);

  // ── Computed ─────────────────────────────────────────────────
  const currentWeek = getWeekNumber(state.user.startDate);

  const workoutDaysThisWeek = (() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    return state.workouts.filter((w) => {
      const d = new Date(w.date);
      return d >= monday && d <= now;
    }).length;
  })();

  const streak = (() => {
    let count = 0;
    const today = new Date();
    for (let i = 0; i < 90; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const hasLog = state.dailyLogs.some((l) => l.date === dateStr && (l.weight > 0 || l.sleep > 0 || l.restingHR > 0));
      if (hasLog) count++;
      else if (i > 0) break;
    }
    return count;
  })();

  // ── Export / Import ──────────────────────────────────────────
  const exportData = useCallback(async () => {
    const data = JSON.stringify(state, null, 2);
    const filename = `biomachine-${todayStr()}.json`;

    if (Capacitor.isNativePlatform()) {
      try {
        const result = await Filesystem.writeFile({
          path: filename,
          data,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
          recursive: true,
        });
        try {
          await Share.share({
            title: 'Экспорт Биомашины',
            url: result.uri,
            dialogTitle: 'Сохранить или отправить данные',
          });
        } catch {
          /* user cancelled share */
        }
      } catch (e) {
        console.error('Export failed', e);
        alert('Не удалось сохранить файл');
      }
    } else {
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [state]);

  const exportCSV = useCallback(async () => {
    const header = ['date', 'session', 'week', 'exercise', 'set', 'weight', 'reps', 'rpe', 'notes'];
    const rows: string[][] = [header];
    for (const w of state.workouts) {
      for (const ex of w.exercises) {
        ex.sets.forEach((s, idx) => {
          rows.push([
            w.date,
            w.session,
            String(w.week),
            ex.exerciseName,
            String(idx + 1),
            String(s.weight),
            String(s.reps),
            String(s.rpe),
            (s.note || '').replace(/"/g, '""'),
          ]);
        });
      }
    }
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const filename = `biomachine-workouts-${todayStr()}.csv`;

    if (Capacitor.isNativePlatform()) {
      try {
        const result = await Filesystem.writeFile({
          path: filename,
          data: csv,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
          recursive: true,
        });
        try {
          await Share.share({
            title: 'Экспорт CSV — Биомашина',
            url: result.uri,
            dialogTitle: 'Сохранить или отправить CSV',
          });
        } catch { /* cancelled */ }
      } catch (e) {
        console.error('CSV export failed', e);
        alert('Не удалось сохранить CSV');
      }
    } else {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [state]);

  const importData = useCallback((json: string) => {
    try {
      const parsed = JSON.parse(json) as Partial<AppState>;
      const merged = mergeState(parsed);
      setStateRaw(merged);
      queueSave(merged);
    } catch {
      alert("Ошибка импорта данных");
    }
  }, [queueSave]);

  const resetData = useCallback(() => {
    setStateRaw(DEFAULT_STATE);
    queueSave(DEFAULT_STATE);
  }, [queueSave]);

  return {
    state,
    isLoaded,
    saveIndicator,
    updateUser,
    getTodayLog,
    upsertDailyLog,
    saveWorkout,
    saveTest,
    unlockAchievement,
    addProgressPhoto,
    removeProgressPhoto,
    currentWeek,
    workoutDaysThisWeek,
    streak,
    exportData,
    exportCSV,
    importData,
    resetData,
  };
}

export type Store = ReturnType<typeof useStore>;

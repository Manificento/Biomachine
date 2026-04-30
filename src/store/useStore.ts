import { useState, useEffect, useCallback } from "react";
import { STORAGE_KEY } from "../data/programData";

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

export interface AppState {
  user: UserPrefs;
  dailyLogs: DailyLog[];
  workouts: WorkoutLog[];
  tests: TestRecord[];
  achievements: string[]; // earned achievement ids
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
  },
  dailyLogs: [],
  workouts: [],
  tests: [],
  achievements: [],
};

// ─── Helpers ──────────────────────────────────────────────────

function safeLoad(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    // Merge with defaults to handle missing fields
    return {
      user: { ...DEFAULT_STATE.user, ...parsed.user },
      dailyLogs: parsed.dailyLogs ?? [],
      workouts: parsed.workouts ?? [],
      tests: parsed.tests ?? [],
      achievements: parsed.achievements ?? [],
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function safeSave(state: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    console.warn("Failed to save state to localStorage");
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
  const [state, setStateRaw] = useState<AppState>(safeLoad);
  const [saveIndicator, setSaveIndicator] = useState(false);

  const setState = useCallback((updater: (prev: AppState) => AppState) => {
    setStateRaw((prev) => {
      const next = updater(prev);
      safeSave(next);
      setSaveIndicator(true);
      setTimeout(() => setSaveIndicator(false), 1500);
      return next;
    });
  }, []);

  // Auto-save every 10 seconds if there's unsaved state (belt-and-suspenders)
  useEffect(() => {
    const interval = setInterval(() => {
      setStateRaw((prev) => {
        safeSave(prev);
        return prev;
      });
    }, 10000);
    return () => clearInterval(interval);
  }, []);

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

  // ── Computed ─────────────────────────────────────────────────
  const currentWeek = getWeekNumber(state.user.startDate);

  const workoutDaysThisWeek = (() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    // Start of current week (Monday)
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

  // Export
  const exportData = useCallback(() => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `biomachine-export-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state]);

  const importData = useCallback((json: string) => {
    try {
      const parsed = JSON.parse(json) as Partial<AppState>;
      const merged: AppState = {
        user: { ...DEFAULT_STATE.user, ...parsed.user },
        dailyLogs: parsed.dailyLogs ?? [],
        workouts: parsed.workouts ?? [],
        tests: parsed.tests ?? [],
        achievements: parsed.achievements ?? [],
      };
      setStateRaw(merged);
      safeSave(merged);
    } catch {
      alert("Ошибка импорта данных");
    }
  }, []);

  const resetData = useCallback(() => {
    setStateRaw(DEFAULT_STATE);
    safeSave(DEFAULT_STATE);
  }, []);

  return {
    state,
    saveIndicator,
    updateUser,
    getTodayLog,
    upsertDailyLog,
    saveWorkout,
    saveTest,
    unlockAchievement,
    currentWeek,
    workoutDaysThisWeek,
    streak,
    exportData,
    importData,
    resetData,
  };
}

export type Store = ReturnType<typeof useStore>;

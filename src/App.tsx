import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Home, Dumbbell, BarChart2, Apple, BookOpen,
  Play, Pause, SkipForward, ChevronRight, ChevronDown, ChevronUp,
  Check, X, Plus, Minus, Info, Timer,
  ChevronLeft, AlertTriangle, Download, Upload, RefreshCw,
  Volume2, Bell, User, Save, ArrowRight,
  Activity, Camera as CameraIcon, FileText,
} from "lucide-react";

import { useStore, todayStr, type WorkoutLog, type SetLog, type ProgressPhoto } from "./store/useStore";
import {
  MESOCYCLES, getMesocycleForWeek, getMesocycleIndexForWeek,
  WEEK_DAYS, WARMUP_BLOCKS, ALL_WORKOUTS, getWorkoutForSession,
  TEST_FIELDS, OVERTRAINING_MARKERS, READINESS_GATES, ACHIEVEMENTS,
  SLEEP_HYGIENE, BREATHING_EXERCISES, GLOSSARY, FOOD_REFERENCE,
  PROGRAM_NAME,
} from "./data/programData";
import { useCountdown } from "./hooks/useTimer";
import { playBeep } from "./lib/sound";
import { hapticLight, hapticHeavy, hapticSuccess } from "./lib/haptics";
import { keepAwake, allowSleep } from "./lib/wakeLock";
import {
  scheduleWorkoutReminder, scheduleMorningMetricsReminder,
  scheduleCreatineReminder, scheduleWaterReminder,
  cancelReminder, REMINDER_IDS, ensurePermission as ensureNotifPermission,
} from "./lib/notifications";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";

// ─── Accent colors ────────────────────────────────────────────
const ACCENT = "#FF6B35";
const ACCENT2 = "#00D9A3";

// ─── Utility components ───────────────────────────────────────

function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(" ");
}

function ProgressRing({ value, max, size = 80, stroke = 8, color = ACCENT, label, sublabel }: {
  value: number; max: number; size?: number; stroke?: number;
  color?: string; label?: string; sublabel?: string;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(value / (max || 1), 1);
  const dash = pct * circ;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#334155" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color}
          strokeWidth={stroke} strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round" style={{ transition: "stroke-dasharray 0.5s ease" }} />
      </svg>
      {label && <div className="text-center -mt-1">
        <div className="text-base font-bold text-white">{label}</div>
        {sublabel && <div className="text-xs text-slate-400">{sublabel}</div>}
      </div>}
    </div>
  );
}

function Badge({ children, color = "orange" }: { children: React.ReactNode; color?: "orange" | "green" | "blue" | "red" | "gray" }) {
  const cls = { orange: "bg-orange-500/20 text-orange-400 border-orange-500/30", green: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", blue: "bg-blue-500/20 text-blue-400 border-blue-500/30", red: "bg-red-500/20 text-red-400 border-red-500/30", gray: "bg-slate-700 text-slate-300 border-slate-600" };
  return <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium border", cls[color])}>{children}</span>;
}

// Card component (available for future use)
// function Card({ children, className }: { children: React.ReactNode; className?: string }) {
//   return <div className={cn("bg-slate-800/80 rounded-2xl border border-slate-700/50 p-4", className)}>{children}</div>;
// }

function BigButton({ children, onClick, variant = "primary", className, disabled }: {
  children: React.ReactNode; onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  className?: string; disabled?: boolean;
}) {
  const cls = {
    primary: "bg-orange-500 hover:bg-orange-400 text-white",
    secondary: "bg-slate-700 hover:bg-slate-600 text-white",
    ghost: "bg-transparent border border-slate-600 text-slate-300 hover:bg-slate-700",
    danger: "bg-red-600 hover:bg-red-500 text-white",
  };
  return (
    <button onClick={onClick} disabled={disabled}
      className={cn("px-5 py-3 rounded-xl font-semibold text-base min-h-[48px] min-w-[48px] transition-all active:scale-95", cls[variant], disabled && "opacity-40 cursor-not-allowed", className)}>
      {children}
    </button>
  );
}

function NumberInput({ value, onChange, min = 0, max = 9999, step = 1, className }: {
  value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <button onClick={() => onChange(Math.max(min, value - step))}
        className="w-9 h-9 rounded-lg bg-slate-700 text-white flex items-center justify-center active:scale-95 hover:bg-slate-600">
        <Minus size={14} />
      </button>
      <input type="number" value={value || ""} onChange={(e) => onChange(Number(e.target.value))}
        className="w-16 text-center text-lg font-bold bg-slate-900 border border-slate-600 rounded-lg py-1 text-white focus:outline-none focus:border-orange-500" />
      <button onClick={() => onChange(Math.min(max, value + step))}
        className="w-9 h-9 rounded-lg bg-slate-700 text-white flex items-center justify-center active:scale-95 hover:bg-slate-600">
        <Plus size={14} />
      </button>
    </div>
  );
}

// ─── Timer Hook is imported from ./hooks/useTimer (background-safe) ──

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// ─── Confetti animation ───────────────────────────────────────

function Confetti({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {Array.from({ length: 40 }).map((_, i) => (
        <div key={i} className="absolute w-2 h-2 rounded-full animate-bounce"
          style={{
            left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`,
            backgroundColor: [ACCENT, ACCENT2, "#3B82F6", "#8B5CF6", "#EC4899"][i % 5],
            animationDelay: `${Math.random() * 1}s`, animationDuration: `${0.5 + Math.random()}s`,
          }} />
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// ONBOARDING
// ════════════════════════════════════════════════════════════════

function Onboarding({ onComplete }: { onComplete: (name: string, startNow: boolean) => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("Дима");
  const [startNow, setStartNow] = useState(true);

  const steps = [
    <div key="s0" className="flex flex-col items-center text-center gap-6 px-4">
      <div className="text-6xl animate-pulse">🤖</div>
      <h1 className="text-3xl font-black text-white leading-tight">Добро пожаловать<br />в <span style={{ color: ACCENT }}>Биомашину</span></h1>
      <p className="text-slate-300 text-base leading-relaxed">
        За 12 недель мы построим тело, которое сильнее, быстрее и выносливее, чем сейчас.
        <br /><br />
        <span className="text-orange-400 font-semibold">Не культурист — спецназ.</span>
      </p>
      <div className="w-full bg-slate-800 rounded-2xl p-4 text-left space-y-2">
        {[
          ["⚡", "Взрывная мощность и скорость"],
          ["🔁", "Повторяемость без деградации"],
          ["🛡️", "Гашение ударных нагрузок"],
          ["🔄", "Переключение между режимами"],
          ["💪", "Работа в стрессе и недосыпе"],
        ].map(([e, t]) => (
          <div key={t} className="flex items-center gap-3 text-slate-200">
            <span className="text-xl">{e}</span>
            <span className="text-sm">{t}</span>
          </div>
        ))}
      </div>
      <BigButton onClick={() => setStep(1)} className="w-full">
        Погнали <ArrowRight size={18} className="inline ml-1" />
      </BigButton>
    </div>,

    <div key="s1" className="flex flex-col gap-5 px-4">
      <div className="text-center">
        <div className="text-4xl mb-2">📋</div>
        <h2 className="text-2xl font-black text-white">Архитектура программы</h2>
        <p className="text-slate-400 text-sm mt-1">12 недель + Pre-week</p>
      </div>
      {MESOCYCLES.map((m) => (
        <div key={m.id} className="bg-slate-800 rounded-xl p-3 flex items-center gap-3">
          <div className="w-2 h-8 rounded-full flex-shrink-0" style={{ background: m.color }} />
          <div>
            <div className="text-white font-semibold text-sm">{m.name}: {m.label}</div>
            <div className="text-slate-400 text-xs">Нед. {m.weeks.join(", ")}</div>
          </div>
        </div>
      ))}
      <div className="flex gap-3">
        <BigButton variant="ghost" onClick={() => setStep(0)} className="flex-1">← Назад</BigButton>
        <BigButton onClick={() => setStep(2)} className="flex-1">Далее →</BigButton>
      </div>
    </div>,

    <div key="s2" className="flex flex-col gap-5 px-4">
      <div className="text-center">
        <div className="text-4xl mb-2">👤</div>
        <h2 className="text-2xl font-black text-white">Настройка</h2>
      </div>
      <div>
        <label className="text-slate-400 text-sm mb-1 block">Как тебя называть?</label>
        <input value={name} onChange={(e) => setName(e.target.value)}
          className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-white text-lg focus:outline-none focus:border-orange-500"
          placeholder="Имя" />
      </div>
      <div className="bg-slate-800 rounded-xl p-4 space-y-3">
        <div className="text-slate-300 font-semibold">Начать прямо сейчас?</div>
        {[true, false].map((v) => (
          <button key={String(v)} onClick={() => setStartNow(v)}
            className={cn("w-full px-4 py-3 rounded-xl border text-left transition-all",
              startNow === v ? "border-orange-500 bg-orange-500/10 text-orange-400" : "border-slate-600 text-slate-300 hover:bg-slate-700")}>
            {v ? "🚀 Начинаю Pre-week сегодня" : "📥 У меня уже есть данные (введу вручную)"}
          </button>
        ))}
      </div>
      <div className="bg-slate-800 rounded-xl p-4">
        <div className="text-slate-400 text-sm">
          📊 Данные хранятся локально в браузере. Экспортируй JSON в Настройках для резервной копии.
        </div>
      </div>
      <div className="flex gap-3">
        <BigButton variant="ghost" onClick={() => setStep(1)} className="flex-1">← Назад</BigButton>
        <BigButton onClick={() => onComplete(name.trim() || "Спортсмен", startNow)} className="flex-1">
          Начать! 🤖
        </BigButton>
      </div>
    </div>,
  ];

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <div className="flex-1 flex flex-col justify-center py-8 max-w-md mx-auto w-full">
        <div className="flex justify-center gap-2 mb-8">
          {[0, 1, 2].map((i) => (
            <div key={i} className={cn("h-1.5 rounded-full transition-all", i === step ? "w-8 bg-orange-500" : "w-3 bg-slate-600")} />
          ))}
        </div>
        {steps[step]}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// REST TIMER (fullscreen)
// ════════════════════════════════════════════════════════════════

function RestTimer({ initialSeconds, onClose, nextLabel }: {
  initialSeconds: number; onClose: () => void; nextLabel?: string;
}) {
  const { seconds, running, start, pause, adjust } = useCountdown(initialSeconds);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (seconds === 10 && running) playBeep('warn');
    if (seconds === 0 && !done) {
      setDone(true);
      playBeep('finish');
      hapticHeavy();
    }
  }, [seconds, running, done]);

  // Start on mount, keep screen awake, release on unmount
  useEffect(() => {
    start();
    keepAwake();
    return () => { allowSleep(); };
  }, []); // eslint-disable-line

  const pct = 1 - seconds / initialSeconds;

  return (
    <div className="fixed inset-0 bg-slate-950 z-50 flex flex-col items-center justify-center">
      <button onClick={onClose} className="absolute top-6 right-6 text-slate-400 hover:text-white">
        <X size={28} />
      </button>
      <div className="text-slate-400 text-lg mb-4">Отдых</div>
      <div className="relative w-56 h-56 mb-8">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="none" stroke="#1e293b" strokeWidth="8" />
          <circle cx="50" cy="50" r="44" fill="none" stroke={ACCENT} strokeWidth="8"
            strokeDasharray={`${pct * 276.5} 276.5`} strokeLinecap="round"
            style={{ transition: "stroke-dasharray 1s linear" }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-6xl font-black text-white">{fmtTime(seconds)}</span>
        </div>
      </div>
      <div className="flex gap-4 mb-8">
        <BigButton variant="ghost" onClick={() => adjust(-15)}>−15 с</BigButton>
        <BigButton variant="ghost" onClick={() => { if (running) pause(); else start(); }}>
          {running ? <Pause size={22} /> : <Play size={22} />}
        </BigButton>
        <BigButton variant="ghost" onClick={() => adjust(15)}>+15 с</BigButton>
      </div>
      {nextLabel && <div className="text-slate-400 text-sm text-center px-8">Следующий: {nextLabel}</div>}
      <BigButton variant="secondary" onClick={onClose} className="mt-6">
        Пропустить <SkipForward size={16} className="inline ml-1" />
      </BigButton>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// BREATHING TIMER
// ════════════════════════════════════════════════════════════════

function BreathingTimer({ exercise, onClose }: {
  exercise: typeof BREATHING_EXERCISES[0]; onClose: () => void;
}) {
  const parts = exercise.pattern.split("-").map(Number);
  const [cycle, setCycle] = useState(0);
  const [phase, setPhase] = useState(0);
  const [phaseSeconds, setPhaseSeconds] = useState(parts[0]);
  const [running, setRunning] = useState(false);
  const phaseLabels = parts.length === 3 ? ["Вдох", "Задержка", "Выдох"] : ["Вдох", "Задержка", "Выдох", "Задержка"];

  useEffect(() => {
    if (!running) return;
    if (phaseSeconds > 0) {
      const t = setTimeout(() => setPhaseSeconds((p) => p - 1), 1000);
      return () => clearTimeout(t);
    } else {
      const nextPhase = (phase + 1) % parts.length;
      if (nextPhase === 0) {
        if (cycle + 1 >= exercise.cycles) { setRunning(false); return; }
        setCycle((c) => c + 1);
      }
      setPhase(nextPhase);
      setPhaseSeconds(parts[nextPhase]);
    }
  }, [running, phaseSeconds, phase, cycle, parts, exercise.cycles]);

  const pct = 1 - phaseSeconds / parts[phase];

  return (
    <div className="fixed inset-0 bg-slate-950 z-50 flex flex-col items-center justify-center px-6">
      <button onClick={onClose} className="absolute top-6 right-6 text-slate-400 hover:text-white"><X size={28} /></button>
      <div className="text-2xl font-bold text-white mb-2">{exercise.name}</div>
      <div className="text-slate-400 mb-8">Цикл {cycle + 1} / {exercise.cycles}</div>
      <div className="relative w-48 h-48 mb-8">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" fill="none" stroke="#1e293b" strokeWidth="8" />
          <circle cx="50" cy="50" r="42" fill="none" stroke={ACCENT2} strokeWidth="8"
            strokeDasharray={`${pct * 263.9} 263.9`} strokeLinecap="round" style={{ transition: "stroke-dasharray 1s linear" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-4xl font-black text-white">{phaseSeconds}</div>
          <div className="text-emerald-400 text-sm font-semibold">{phaseLabels[phase] ?? "—"}</div>
        </div>
      </div>
      <p className="text-slate-400 text-center text-sm mb-8">{exercise.desc}</p>
      <BigButton onClick={() => setRunning(!running)} className="w-48">
        {running ? <><Pause size={18} className="inline mr-1" /> Пауза</> : <><Play size={18} className="inline mr-1" /> Старт</>}
      </BigButton>
      {!running && cycle === exercise.cycles && <div className="mt-4 text-emerald-400 font-semibold">✅ Готово!</div>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// WORKOUT SCREEN
// ════════════════════════════════════════════════════════════════

function WorkoutScreen({ session, week, onBack, onFinish }: {
  session: string; week: number;
  onBack: () => void; onFinish: (log: WorkoutLog) => void;
}) {
  const mesoIdx = getMesocycleIndexForWeek(week);
  const workout = getWorkoutForSession(session, mesoIdx);
  const [warmupDone, setWarmupDone] = useState(false);
  const [showWarmup, setShowWarmup] = useState(false);
  const [startTime] = useState(new Date());
  const [elapsed, setElapsed] = useState(0);
  const [restTimer, setRestTimer] = useState<{ seconds: number; next?: string } | null>(null);
  const [expandedEx, setExpandedEx] = useState<string | null>(null);
  const [showWhyEx, setShowWhyEx] = useState<string | null>(null);
  const [totalRpe, setTotalRpe] = useState(7);
  const [sessionNotes, setSessionNotes] = useState("");
  const [confetti, setConfetti] = useState(false);

  // sets log: exerciseId -> SetLog[]
  const [setsData, setSetsData] = useState<Record<string, SetLog[]>>(() => {
    if (!workout) return {};
    const init: Record<string, SetLog[]> = {};
    workout.exercises.forEach((ex) => {
      const setCount = parseInt(ex.sets.split("+")[0]) || 3;
      init[ex.id] = Array.from({ length: setCount }, () => ({
        weight: 0, reps: 0, rpe: 7, note: "", done: false,
      }));
    });
    return init;
  });

  // Elapsed timer
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Keep screen awake during workout
  useEffect(() => {
    keepAwake();
    return () => { allowSleep(); };
  }, []);

  if (!workout) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center flex-col gap-4">
      <div className="text-4xl">😅</div>
      <div className="text-white text-xl">Тренировка не найдена</div>
      <BigButton onClick={onBack}>Назад</BigButton>
    </div>
  );

  const totalSets = Object.values(setsData).reduce((a, b) => a + b.length, 0);
  const doneSets = Object.values(setsData).reduce((a, b) => a + b.filter((s) => s.done).length, 0);

  const updateSet = (exId: string, idx: number, patch: Partial<SetLog>) => {
    // Haptic on toggling done
    if (typeof patch.done === 'boolean' && patch.done) hapticLight();
    setSetsData((prev) => ({
      ...prev,
      [exId]: prev[exId].map((s, i) => i === idx ? { ...s, ...patch } : s),
    }));
  };

  const handleFinish = () => {
    const endTime = new Date();
    const log: WorkoutLog = {
      id: `${Date.now()}`,
      date: todayStr(),
      session,
      mesocycleIndex: mesoIdx,
      week,
      exercises: workout.exercises.map((ex) => ({
        exerciseId: ex.id,
        exerciseName: ex.name,
        sets: setsData[ex.id] ?? [],
      })),
      totalRpe,
      notes: sessionNotes,
      durationMin: Math.round(elapsed / 60),
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    };
    hapticSuccess();
    setConfetti(true);
    setTimeout(() => { onFinish(log); }, 2000);
  };

  const warmupBlocks = WARMUP_BLOCKS.filter((b) => !b.forSessions || b.forSessions.includes(session));

  return (
    <div className="min-h-screen bg-slate-900 text-white pb-24">
      <Confetti show={confetti} />
      {restTimer && (
        <RestTimer initialSeconds={restTimer.seconds} nextLabel={restTimer.next}
          onClose={() => setRestTimer(null)} />
      )}

      {/* Header */}
      <div className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <button onClick={onBack} className="text-slate-400 hover:text-white p-1">
            <ChevronLeft size={24} />
          </button>
          <div className="text-center">
            <div className="font-bold text-white">{workout.emoji} {workout.name}</div>
            <div className="text-xs text-slate-400">Нед. {week} • {getMesocycleForWeek(week).label}</div>
          </div>
          <div className="text-orange-400 font-mono font-bold text-sm">{fmtTime(elapsed)}</div>
        </div>
        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${(doneSets / totalSets) * 100}%` }} />
        </div>
        <div className="text-xs text-slate-500 text-right mt-0.5">{doneSets}/{totalSets} подходов</div>
      </div>

      <div className="px-4 space-y-4 pt-4">
        {/* Warmup */}
        <div className="bg-slate-800 rounded-2xl overflow-hidden border border-slate-700">
          <button onClick={() => setShowWarmup(!showWarmup)}
            className="w-full flex items-center justify-between p-4 hover:bg-slate-700/50 transition-all">
            <div className="flex items-center gap-3">
              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-sm",
                warmupDone ? "bg-emerald-500" : "bg-slate-600")}>
                {warmupDone ? <Check size={16} /> : "🔥"}
              </div>
              <span className="font-semibold">Разминка (12–15 мин)</span>
            </div>
            <div className="flex items-center gap-2">
              {warmupDone && <Badge color="green">Готово</Badge>}
              {showWarmup ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>
          </button>
          {showWarmup && (
            <div className="px-4 pb-4 space-y-3">
              {warmupBlocks.map((block) => (
                <div key={block.id} className="bg-slate-900/50 rounded-xl p-3">
                  <div className="font-semibold text-sm text-slate-200 mb-2">
                    {block.name} <span className="text-slate-500">({fmtTime(block.duration)})</span>
                  </div>
                  {block.exercises.map((ex, i) => (
                    <div key={i} className="text-xs text-slate-400 py-0.5">• {ex}</div>
                  ))}
                </div>
              ))}
              <BigButton onClick={() => { setWarmupDone(true); setShowWarmup(false); }} className="w-full">
                <Check size={16} className="inline mr-1" /> Разминка выполнена
              </BigButton>
            </div>
          )}
        </div>

        {/* Exercises */}
        {workout.exercises.map((ex, exIdx) => {
          const sets = setsData[ex.id] ?? [];
          const allDone = sets.every((s) => s.done);
          const isExpanded = expandedEx === ex.id;

          return (
            <div key={ex.id} className={cn("bg-slate-800 rounded-2xl border overflow-hidden transition-all",
              allDone ? "border-emerald-500/40" : "border-slate-700/50")}>
              <button onClick={() => setExpandedEx(isExpanded ? null : ex.id)}
                className="w-full flex items-center gap-3 p-4 hover:bg-slate-700/30 transition-all text-left">
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0",
                  allDone ? "bg-emerald-500" : "bg-slate-700")}>
                  {allDone ? <Check size={16} /> : <span className="text-xs font-bold">{exIdx + 1}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white text-sm truncate">{ex.emoji} {ex.name}</div>
                  <div className="text-xs text-slate-400">{ex.sets} × {ex.reps} • темп {ex.tempo} • {fmtTime(ex.rest)} отд.</div>
                </div>
                {isExpanded ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronRight size={20} className="text-slate-400" />}
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 space-y-3">
                  {/* Tempo visualization */}
                  <div className="flex gap-3 flex-wrap">
                    <div className="bg-slate-700/50 rounded-lg px-3 py-1 text-xs">
                      <span className="text-slate-400">Темп: </span>
                      <span className="text-orange-400 font-mono font-bold">{ex.tempo}</span>
                    </div>
                    <div className="bg-slate-700/50 rounded-lg px-3 py-1 text-xs">
                      <span className="text-slate-400">Отдых: </span>
                      <span className="text-blue-400 font-mono font-bold">{fmtTime(ex.rest)}</span>
                    </div>
                  </div>

                  {/* Why */}
                  <button onClick={() => setShowWhyEx(showWhyEx === ex.id ? null : ex.id)}
                    className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 transition-colors">
                    <Info size={14} /> {showWhyEx === ex.id ? "Скрыть объяснение" : "Зачем это упражнение?"}
                  </button>
                  {showWhyEx === ex.id && (
                    <div className="bg-slate-900/60 rounded-xl p-3 text-xs text-slate-300 leading-relaxed">
                      <p className="mb-2 text-emerald-400 font-semibold">{ex.why}</p>
                      {ex.tips && <p className="text-slate-400"><span className="text-yellow-400">💡 Техника:</span> {ex.tips}</p>}
                    </div>
                  )}

                  {/* Sets */}
                  <div className="space-y-2">
                    <div className="grid grid-cols-4 gap-2 text-xs text-slate-500 font-medium px-1">
                      <div>Подход</div><div>Вес (кг)</div><div>Повт.</div><div>RPE</div>
                    </div>
                    {sets.map((set, si) => (
                      <div key={si} className={cn("rounded-xl p-3 border transition-all",
                        set.done ? "bg-emerald-500/10 border-emerald-500/30" : "bg-slate-900/50 border-slate-700/50")}>
                        <div className="grid grid-cols-4 gap-2 items-center mb-2">
                          <button onClick={() => updateSet(ex.id, si, { done: !set.done })}
                            className={cn("w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all",
                              set.done ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600")}>
                            {set.done ? <Check size={14} /> : si + 1}
                          </button>
                          <input type="number" value={set.weight || ""} placeholder="0"
                            onChange={(e) => updateSet(ex.id, si, { weight: Number(e.target.value) })}
                            className="bg-slate-800 border border-slate-600 rounded-lg py-1.5 text-center text-white text-sm font-bold w-full focus:outline-none focus:border-orange-500" />
                          <input type="number" value={set.reps || ""} placeholder="0"
                            onChange={(e) => updateSet(ex.id, si, { reps: Number(e.target.value) })}
                            className="bg-slate-800 border border-slate-600 rounded-lg py-1.5 text-center text-white text-sm font-bold w-full focus:outline-none focus:border-orange-500" />
                          <div className="text-center">
                            <select value={set.rpe}
                              onChange={(e) => updateSet(ex.id, si, { rpe: Number(e.target.value) })}
                              className="bg-slate-800 border border-slate-600 rounded-lg py-1.5 text-white text-sm w-full focus:outline-none">
                              {[6, 7, 8, 9, 10].map((v) => <option key={v} value={v}>{v}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="flex gap-2 items-center">
                          <button onClick={() => setRestTimer({ seconds: ex.rest, next: workout.exercises[exIdx + 1]?.name })}
                            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 px-2 py-1 rounded-lg">
                            <Timer size={12} /> {fmtTime(ex.rest)}
                          </button>
                          <input value={set.note} onChange={(e) => updateSet(ex.id, si, { note: e.target.value })}
                            placeholder="Заметка к подходу..."
                            className="flex-1 bg-slate-800 rounded-lg px-2 py-1 text-xs text-slate-400 focus:outline-none focus:text-white" />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add set */}
                  <button onClick={() => setSetsData((prev) => ({
                    ...prev,
                    [ex.id]: [...(prev[ex.id] ?? []), { weight: 0, reps: 0, rpe: 7, note: "", done: false }],
                  }))} className="text-xs text-slate-400 hover:text-white flex items-center gap-1">
                    <Plus size={12} /> Добавить подход
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* Finish */}
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-4 space-y-4">
          <div className="font-semibold text-white">Завершение тренировки</div>
          <div>
            <div className="text-sm text-slate-400 mb-2">Общий RPE сессии</div>
            <div className="flex gap-2">
              {[5, 6, 7, 8, 9, 10].map((v) => (
                <button key={v} onClick={() => setTotalRpe(v)}
                  className={cn("flex-1 py-2 rounded-xl text-sm font-bold transition-all",
                    totalRpe === v ? "bg-orange-500 text-white" : "bg-slate-700 text-slate-300 hover:bg-slate-600")}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          <textarea value={sessionNotes} onChange={(e) => setSessionNotes(e.target.value)}
            placeholder="Заметки к тренировке (как себя чувствовал, что получилось, что нет...)"
            className="w-full bg-slate-900 border border-slate-600 rounded-xl p-3 text-sm text-slate-300 h-20 focus:outline-none focus:border-orange-500 resize-none" />
          <BigButton onClick={handleFinish} className="w-full text-lg py-4">
            🏆 Завершить тренировку
          </BigButton>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════

function Dashboard({ store, onStartWorkout, onNavigate }: {
  store: ReturnType<typeof import("./store/useStore").useStore>;
  onStartWorkout: (session: string) => void;
  onNavigate: (tab: string) => void;
}) {
  const { state, currentWeek, streak, upsertDailyLog, getTodayLog } = store;
  const todayLog = getTodayLog();
  const mesocycle = getMesocycleForWeek(currentWeek);
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun
  const todaySession = WEEK_DAYS.find((d) => d.day === dayOfWeek);

  const [localSleep, setLocalSleep] = useState(todayLog?.sleep ?? 0);
  const [localHR, setLocalHR] = useState(todayLog?.restingHR ?? 0);
  const [localWeight, setLocalWeight] = useState(todayLog?.weight ?? 0);
  const [localMood, setLocalMood] = useState(todayLog?.mood ?? 7);
  const [localSteps, setLocalSteps] = useState(todayLog?.steps ?? 0);
  const [localOTMarkers, setLocalOTMarkers] = useState<string[]>(todayLog?.overtrainingMarkers ?? []);


  const totalKcal = (todayLog?.nutrition.meals ?? []).reduce((a, m) => a + m.kcal, 0);
  const totalProtein = (todayLog?.nutrition.meals ?? []).reduce((a, m) => a + m.protein, 0);
  const water = todayLog?.nutrition.water ?? 0;

  const saveMetrics = () => {
    upsertDailyLog({
      sleep: localSleep, restingHR: localHR, weight: localWeight,
      mood: localMood, steps: localSteps, overtrainingMarkers: localOTMarkers,
    });
  };

  const otAlert = localOTMarkers.length >= 2;
  const totalWeeks = 12;
  const progressPct = (currentWeek / totalWeeks) * 100;

  return (
    <div className="pb-24 px-4 space-y-4">
      {/* Hero */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-5 border border-slate-700/50 mt-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-xs text-slate-400 uppercase tracking-wider">{mesocycle.name}</div>
            <div className="text-2xl font-black text-white mt-0.5">
              {currentWeek === 0 ? "Pre-Week" : `Неделя ${currentWeek}`}
              <span className="text-base font-normal text-slate-400"> / 12</span>
            </div>
            <div className="text-sm mt-1 font-semibold" style={{ color: mesocycle.color }}>{mesocycle.label}</div>
          </div>
          <div className="text-4xl">{mesocycle.id === 0 ? "🔬" : mesocycle.id === 1 ? "🏗️" : mesocycle.id === 3 ? "⚡" : mesocycle.id === 5 ? "🚀" : "♻️"}</div>
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${progressPct}%`, background: mesocycle.color }} />
        </div>
        <div className="flex justify-between text-xs text-slate-500 mt-1">
          <span>Неделя {currentWeek}</span>
          <span>{Math.round(progressPct)}%</span>
          <span>12 недель</span>
        </div>
      </div>

      {/* Today's workout */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700/50 p-4">
        <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">Сегодня</div>
        {todaySession ? (
          <>
            <div className="flex items-center gap-3 mb-3">
              <div className="text-3xl">{todaySession.emoji}</div>
              <div>
                <div className="font-bold text-white">{todaySession.name}</div>
                <div className="text-xs text-slate-400">{todaySession.duration > 0 ? `${todaySession.duration} мин • ЦНС: ${todaySession.cns}` : "День отдыха 😴"}</div>
              </div>
            </div>
            {todaySession.session !== "OFF" && todaySession.session !== "R" ? (
              <BigButton className="w-full text-lg py-4" onClick={() => onStartWorkout(todaySession.session)}>
                <Play size={20} className="inline mr-2" />Начать тренировку {todaySession.session}
              </BigButton>
            ) : (
              <div className="bg-slate-700/50 rounded-xl p-3 text-center text-slate-400 text-sm">
                {todaySession.session === "R" ? "🧘 Активное восстановление — мобильность и дыхание" : "😴 Полный отдых — восстановление ЦНС"}
              </div>
            )}
          </>
        ) : null}
      </div>

      {/* Overtraining alert */}
      {otAlert && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-red-400 font-semibold text-sm">⚠️ Признаки перетренированности</div>
            <div className="text-red-300/70 text-xs mt-1">Отмечено {localOTMarkers.length} маркера. Рассмотри дополнительный день отдыха или снижение объёма.</div>
          </div>
        </div>
      )}

      {/* Morning metrics */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700/50 p-4">
        <div className="text-xs text-slate-400 uppercase tracking-wider mb-3">Утренние метрики</div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          {[
            { label: "Сон (ч)", value: localSleep, set: setLocalSleep, step: 0.5, max: 12, icon: "🌙" },
            { label: "Пульс покоя", value: localHR, set: setLocalHR, step: 1, max: 120, icon: "❤️" },
            { label: "Вес (кг)", value: localWeight, set: setLocalWeight, step: 0.1, max: 200, icon: "⚖️" },
            { label: "Настроение", value: localMood, set: setLocalMood, step: 1, max: 10, icon: "😊" },
          ].map(({ label, value, set, step, max, icon }) => (
            <div key={label} className="bg-slate-900/60 rounded-xl p-3">
              <div className="text-xs text-slate-400 mb-1">{icon} {label}</div>
              <NumberInput value={value} onChange={set} step={step} max={max} />
            </div>
          ))}
        </div>

        {/* Steps */}
        <div className="bg-slate-900/60 rounded-xl p-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400">👟 Шаги</span>
            <span className="text-sm font-bold text-white">{localSteps.toLocaleString()} / 8 000</span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(localSteps / 8000 * 100, 100)}%` }} />
          </div>
          <div className="flex gap-2 mt-2">
            {[1000, 2000, 5000].map((v) => (
              <button key={v} onClick={() => setLocalSteps((p) => Math.min(p + v, 30000))}
                className="flex-1 py-1 rounded-lg bg-slate-700 text-xs text-slate-300 hover:bg-slate-600">+{(v / 1000).toFixed(0)}k</button>
            ))}
            <input type="number" value={localSteps || ""} onChange={(e) => setLocalSteps(Number(e.target.value))}
              className="w-20 bg-slate-700 rounded-lg text-center text-xs text-white focus:outline-none" placeholder="ввести" />
          </div>
        </div>

        {/* Overtraining markers */}
        <div className="mb-3">
          <div className="text-xs text-slate-400 mb-2">Маркеры перетренированности</div>
          <div className="space-y-1.5">
            {OVERTRAINING_MARKERS.map((m) => {
              const checked = localOTMarkers.includes(m.id);
              return (
                <button key={m.id} onClick={() => setLocalOTMarkers((prev) =>
                  prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id])}
                  className={cn("w-full flex items-center gap-2 p-2 rounded-xl text-left text-xs transition-all",
                    checked ? "bg-red-500/15 border border-red-500/30" : "bg-slate-900/40 border border-slate-700/30")}>
                  <div className={cn("w-5 h-5 rounded flex items-center justify-center flex-shrink-0",
                    checked ? "bg-red-500" : "bg-slate-700")}>
                    {checked && <Check size={10} />}
                  </div>
                  <span className={checked ? "text-red-300" : "text-slate-400"}>{m.label}</span>
                  <Badge color="gray">{m.system}</Badge>
                </button>
              );
            })}
          </div>
        </div>

        <BigButton variant="secondary" onClick={saveMetrics} className="w-full">
          <Save size={14} className="inline mr-1" /> Сохранить метрики
        </BigButton>
      </div>

      {/* Nutrition rings */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs text-slate-400 uppercase tracking-wider">Питание сегодня</div>
          <button onClick={() => onNavigate("nutrition")} className="text-xs text-orange-400 hover:text-orange-300">Открыть →</button>
        </div>
        <div className="flex justify-around">
          <ProgressRing value={totalKcal} max={2400} color={ACCENT} label={`${totalKcal}`} sublabel="/ 2400 ккал" />
          <ProgressRing value={totalProtein} max={150} color={ACCENT2} label={`${totalProtein}г`} sublabel="/ 150г белок" />
          <ProgressRing value={water} max={2500} color="#3B82F6" label={`${(water / 1000).toFixed(1)}л`} sublabel="/ 2.5л вода" />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800 rounded-2xl border border-slate-700/50 p-3 text-center">
          <div className="text-2xl font-black text-orange-400">{streak}</div>
          <div className="text-xs text-slate-400 mt-0.5">дней streak</div>
        </div>
        <div className="bg-slate-800 rounded-2xl border border-slate-700/50 p-3 text-center">
          <div className="text-2xl font-black text-emerald-400">{store.workoutDaysThisWeek}</div>
          <div className="text-xs text-slate-400 mt-0.5">тренировок / нед.</div>
        </div>
        <div className="bg-slate-800 rounded-2xl border border-slate-700/50 p-3 text-center">
          <div className="text-2xl font-black text-blue-400">{state.workouts.length}</div>
          <div className="text-xs text-slate-400 mt-0.5">всего трен.</div>
        </div>
      </div>

      {/* Recent workouts */}
      {state.workouts.slice(-3).reverse().map((w) => (
        <div key={w.id} className="bg-slate-800/60 rounded-xl border border-slate-700/30 p-3 flex items-center gap-3">
          <div className="text-2xl">{WEEK_DAYS.find((d) => d.session === w.session)?.emoji ?? "💪"}</div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-white">{WEEK_DAYS.find((d) => d.session === w.session)?.name ?? w.session}</div>
            <div className="text-xs text-slate-400">{w.date} • {w.durationMin} мин • RPE {w.totalRpe}</div>
          </div>
          <Badge color={w.totalRpe >= 9 ? "red" : w.totalRpe >= 7 ? "orange" : "green"}>RPE {w.totalRpe}</Badge>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// METRICS SCREEN
// ════════════════════════════════════════════════════════════════

function MetricsScreen({ store }: { store: ReturnType<typeof import("./store/useStore").useStore> }) {
  const { state } = store;
  const [activeChart, setActiveChart] = useState<"weight" | "sleep" | "hr" | "strength">("weight");

  const weightData = state.dailyLogs.filter((l) => l.weight > 0).slice(-30).map((l) => ({
    date: l.date.slice(5), weight: l.weight,
  }));
  const sleepData = state.dailyLogs.filter((l) => l.sleep > 0).slice(-30).map((l) => ({
    date: l.date.slice(5), sleep: l.sleep,
  }));
  const hrData = state.dailyLogs.filter((l) => l.restingHR > 0).slice(-30).map((l) => ({
    date: l.date.slice(5), hr: l.restingHR,
  }));

  // Strength from tests
  const tests = state.tests;
  const getTestVal = (label: string, field: string) => {
    const t = tests.find((t) => t.label === label);
    return t ? Number(t.data[field] ?? 0) : 0;
  };
  const strengthData = [
    { phase: "Pre", pullups: getTestVal("pre", "pullups"), pushups: getTestVal("pre", "pushups"), dips: getTestVal("pre", "dips") },
    { phase: "Нед.5", pullups: getTestVal("week5", "pullups"), pushups: getTestVal("week5", "pushups"), dips: getTestVal("week5", "dips") },
    { phase: "Нед.9", pullups: getTestVal("week9", "pullups"), pushups: getTestVal("week9", "pushups"), dips: getTestVal("week9", "dips") },
    { phase: "Нед.12", pullups: getTestVal("week12", "pullups"), pushups: getTestVal("week12", "pushups"), dips: getTestVal("week12", "dips") },
  ];

  // Heatmap
  const today = new Date();
  const heatmapDays: { date: string; done: boolean }[] = [];
  for (let i = 83; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const ds = d.toISOString().split("T")[0];
    heatmapDays.push({ date: ds, done: state.workouts.some((w) => w.date === ds) });
  }

  const charts: { key: typeof activeChart; label: string }[] = [
    { key: "weight", label: "Вес" }, { key: "sleep", label: "Сон" },
    { key: "hr", label: "Пульс" }, { key: "strength", label: "Сила" },
  ];

  return (
    <div className="pb-24 px-4 space-y-4 pt-4">
      <div className="text-xl font-black text-white">📊 Метрики</div>

      {/* Chart selector */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {charts.map((c) => (
          <button key={c.key} onClick={() => setActiveChart(c.key)}
            className={cn("px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all",
              activeChart === c.key ? "bg-orange-500 text-white" : "bg-slate-800 text-slate-400 hover:text-white")}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Charts */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700/50 p-4">
        {activeChart === "weight" && (
          <>
            <div className="text-sm font-semibold text-white mb-3">Вес (кг)</div>
            {weightData.length > 1 ? (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={weightData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <YAxis domain={["auto", "auto"]} tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }} />
                  <Line type="monotone" dataKey="weight" stroke={ACCENT} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : <div className="text-center text-slate-500 py-10 text-sm">Недостаточно данных. Вводи вес каждое утро.</div>}
          </>
        )}
        {activeChart === "sleep" && (
          <>
            <div className="text-sm font-semibold text-white mb-3">Сон (ч)</div>
            {sleepData.length > 1 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={sleepData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <YAxis domain={[0, 12]} tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }} />
                  <Bar dataKey="sleep" fill={ACCENT2} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="text-center text-slate-500 py-10 text-sm">Недостаточно данных.</div>}
          </>
        )}
        {activeChart === "hr" && (
          <>
            <div className="text-sm font-semibold text-white mb-3">Пульс покоя (уд/мин)</div>
            {hrData.length > 1 ? (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={hrData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <YAxis domain={[40, 100]} tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }} />
                  <Line type="monotone" dataKey="hr" stroke="#3B82F6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : <div className="text-center text-slate-500 py-10 text-sm">Недостаточно данных.</div>}
          </>
        )}
        {activeChart === "strength" && (
          <>
            <div className="text-sm font-semibold text-white mb-3">Ключевые показатели по тестам</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={strengthData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="phase" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                <Bar dataKey="pullups" name="Подтягивания" fill={ACCENT2} radius={[3, 3, 0, 0]} />
                <Bar dataKey="pushups" name="Отжимания" fill={ACCENT} radius={[3, 3, 0, 0]} />
                <Bar dataKey="dips" name="Брусья" fill="#3B82F6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </div>

      {/* Heatmap */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700/50 p-4">
        <div className="text-sm font-semibold text-white mb-3">📅 Активность (84 дня)</div>
        <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(12, 1fr)" }}>
          {heatmapDays.map((d, i) => (
            <div key={i} title={d.date}
              className={cn("aspect-square rounded-sm", d.done ? "bg-emerald-500" : "bg-slate-700")} />
          ))}
        </div>
        <div className="flex items-center gap-2 mt-3 text-xs text-slate-500">
          <div className="w-3 h-3 rounded-sm bg-slate-700" /> Пропуск
          <div className="w-3 h-3 rounded-sm bg-emerald-500" /> Тренировка
        </div>
      </div>

      {/* Tests comparison */}
      {state.tests.length > 0 && (
        <div className="bg-slate-800 rounded-2xl border border-slate-700/50 p-4">
          <div className="text-sm font-semibold text-white mb-3">🔬 Сравнение тестов</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left py-1 pr-2">Показатель</th>
                  {["pre", "week5", "week9", "week12"].map((l) => (
                    <th key={l} className="text-center py-1 px-1">{l === "pre" ? "Pre" : l === "week5" ? "Нед.5" : l === "week9" ? "Нед.9" : "Нед.12"}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TEST_FIELDS.filter((f) => ["pushups", "pullups", "dips", "plank", "standingJump", "sprint30"].includes(f.id)).map((f) => (
                  <tr key={f.id} className="border-t border-slate-700/50">
                    <td className="py-1.5 pr-2 text-slate-300 font-medium">{f.label.split(" ").slice(0, 2).join(" ")}</td>
                    {["pre", "week5", "week9", "week12"].map((l) => {
                      const val = getTestVal(l, f.id);
                      const preVal = getTestVal("pre", f.id);
                      const delta = preVal > 0 && l !== "pre" ? val - preVal : 0;
                      return (
                        <td key={l} className="text-center py-1.5 px-1">
                          <span className="text-white font-bold">{val > 0 ? val : "—"}</span>
                          {delta !== 0 && <span className={delta > 0 ? "text-emerald-400" : "text-red-400"} style={{ fontSize: 9 }}> {delta > 0 ? "+" : ""}{delta}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// NUTRITION SCREEN
// ════════════════════════════════════════════════════════════════

function NutritionScreen({ store }: { store: ReturnType<typeof import("./store/useStore").useStore> }) {
  const { getTodayLog, upsertDailyLog } = store;
  const todayLog = getTodayLog();
  const meals = todayLog?.nutrition.meals ?? [];
  const water = todayLog?.nutrition.water ?? 0;
  const supplements = todayLog?.nutrition.supplements ?? [];

  const [mealForm, setMealForm] = useState({ name: "", kcal: 0, protein: 0, fat: 0, carbs: 0 });
  const [showRef, setShowRef] = useState(false);
  const [showRefeed, setShowRefeed] = useState(false);

  const totals = meals.reduce((acc, m) => ({
    kcal: acc.kcal + m.kcal, protein: acc.protein + m.protein,
    fat: acc.fat + m.fat, carbs: acc.carbs + m.carbs,
  }), { kcal: 0, protein: 0, fat: 0, carbs: 0 });

  const GOALS = { kcal: 2400, protein: 150, fat: 70, carbs: 300, water: 2500 };
  const SUPP_ITEMS = [
    { id: "creatine", label: "Креатин 5 г", emoji: "💊" },
    { id: "d3", label: "Витамин D3", emoji: "☀️" },
    { id: "omega3", label: "Омега-3", emoji: "🐟" },
    { id: "magnesium", label: "Магний (перед сном)", emoji: "🌙" },
  ];

  const addMeal = () => {
    if (!mealForm.name) return;
    const newMeals = [...meals, { ...mealForm, time: new Date().toTimeString().slice(0, 5) }];
    upsertDailyLog({ nutrition: { meals: newMeals, water, supplements } });
    setMealForm({ name: "", kcal: 0, protein: 0, fat: 0, carbs: 0 });
  };

  const toggleSupp = (id: string) => {
    const newSupps = supplements.includes(id) ? supplements.filter((s) => s !== id) : [...supplements, id];
    upsertDailyLog({ nutrition: { meals, water, supplements: newSupps } });
  };

  const addWater = (ml: number) => {
    upsertDailyLog({ nutrition: { meals, water: Math.min(water + ml, 5000), supplements } });
  };

  return (
    <div className="pb-24 px-4 space-y-4 pt-4">
      <div className="text-xl font-black text-white">🥗 Питание</div>

      {/* Progress rings */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700/50 p-4">
        <div className="text-sm text-slate-400 mb-3">Цели дня</div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="flex items-center gap-3">
            <ProgressRing value={totals.kcal} max={GOALS.kcal} color={ACCENT} size={64} stroke={6}
              label={`${totals.kcal}`} sublabel="ккал" />
            <div className="text-xs text-slate-400">Цель: {GOALS.kcal}</div>
          </div>
          <div className="flex items-center gap-3">
            <ProgressRing value={totals.protein} max={GOALS.protein} color={ACCENT2} size={64} stroke={6}
              label={`${totals.protein}г`} sublabel="белок" />
            <div className="text-xs text-slate-400">Цель: {GOALS.protein}г</div>
          </div>
          <div className="flex items-center gap-3">
            <ProgressRing value={totals.fat} max={GOALS.fat} color="#F59E0B" size={64} stroke={6}
              label={`${totals.fat}г`} sublabel="жиры" />
            <div className="text-xs text-slate-400">Цель: {GOALS.fat}г</div>
          </div>
          <div className="flex items-center gap-3">
            <ProgressRing value={totals.carbs} max={GOALS.carbs} color="#8B5CF6" size={64} stroke={6}
              label={`${totals.carbs}г`} sublabel="углеводы" />
            <div className="text-xs text-slate-400">Цель: {GOALS.carbs}г</div>
          </div>
        </div>
        {/* Water */}
        <div className="bg-slate-900/60 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-300">💧 Вода</span>
            <span className="text-sm font-bold text-blue-400">{(water / 1000).toFixed(1)}л / 2.5л</span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden mb-2">
            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(water / 2500 * 100, 100)}%` }} />
          </div>
          <div className="flex gap-2">
            {[200, 300, 500].map((ml) => (
              <button key={ml} onClick={() => addWater(ml)}
                className="flex-1 py-1.5 rounded-lg bg-slate-700 text-xs text-slate-300 hover:bg-slate-600">+{ml}мл</button>
            ))}
          </div>
        </div>
      </div>

      {/* Add meal */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700/50 p-4">
        <div className="text-sm font-semibold text-white mb-3">+ Добавить приём пищи</div>
        <input value={mealForm.name} onChange={(e) => setMealForm({ ...mealForm, name: e.target.value })}
          placeholder="Название (напр. 'Завтрак: гречка + курица')"
          className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-sm text-white mb-3 focus:outline-none focus:border-orange-500" />
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { key: "kcal" as const, label: "Ккал" },
            { key: "protein" as const, label: "Белок г" },
            { key: "fat" as const, label: "Жиры г" },
            { key: "carbs" as const, label: "УГ г" },
          ].map(({ key, label }) => (
            <div key={key}>
              <div className="text-xs text-slate-500 mb-1">{label}</div>
              <input type="number" value={mealForm[key] || ""}
                onChange={(e) => setMealForm({ ...mealForm, [key]: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg py-1.5 text-center text-white text-sm focus:outline-none" />
            </div>
          ))}
        </div>
        <BigButton onClick={addMeal} className="w-full">Добавить</BigButton>
      </div>

      {/* Meals list */}
      {meals.length > 0 && (
        <div className="bg-slate-800 rounded-2xl border border-slate-700/50 p-4 space-y-2">
          <div className="text-sm font-semibold text-white mb-1">Приёмы пищи сегодня</div>
          {meals.map((m, i) => (
            <div key={i} className="bg-slate-900/60 rounded-xl p-3 flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="text-sm text-white font-medium">{m.name}</div>
                <div className="text-xs text-slate-400 mt-0.5">{m.time} • {m.kcal} ккал • Б:{m.protein}г Ж:{m.fat}г У:{m.carbs}г</div>
              </div>
              <button onClick={() => {
                const newMeals = meals.filter((_, idx) => idx !== i);
                upsertDailyLog({ nutrition: { meals: newMeals, water, supplements } });
              }} className="text-slate-500 hover:text-red-400 p-1">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Supplements */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700/50 p-4">
        <div className="text-sm font-semibold text-white mb-3">💊 Добавки</div>
        <div className="space-y-2">
          {SUPP_ITEMS.map((s) => {
            const done = supplements.includes(s.id);
            return (
              <button key={s.id} onClick={() => toggleSupp(s.id)}
                className={cn("w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all",
                  done ? "bg-emerald-500/10 border-emerald-500/30" : "bg-slate-900/50 border-slate-700/30")}>
                <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center",
                  done ? "bg-emerald-500" : "bg-slate-700")}>
                  {done ? <Check size={14} className="text-white" /> : <span className="text-sm">{s.emoji}</span>}
                </div>
                <span className={cn("text-sm", done ? "text-emerald-300 line-through" : "text-white")}>{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Refeed */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700/50 p-4">
        <button onClick={() => setShowRefeed(!showRefeed)} className="flex items-center justify-between w-full">
          <div className="text-sm font-semibold text-white">🔄 Refeed</div>
          {showRefeed ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
        </button>
        {showRefeed && (
          <div className="mt-3 text-xs text-slate-300 leading-relaxed bg-slate-900/60 rounded-xl p-3">
            <p className="text-yellow-400 font-semibold mb-2">Что такое refeed?</p>
            <p>Раз в 7–10 дней — приём с <strong>+500–800 ккал</strong> к норме (≈3000 ккал), акцент на углеводы.</p>
            <p className="mt-2">Подстёгивает лептин, поддерживает психологически. Планируется заранее, не спонтанно.</p>
            <p className="mt-2 text-slate-400">Следующий: через {7 - new Date().getDay()} дней (воскресенье)</p>
          </div>
        )}
      </div>

      {/* Food reference */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700/50 p-4">
        <button onClick={() => setShowRef(!showRef)} className="flex items-center justify-between w-full">
          <div className="text-sm font-semibold text-white">📖 Справочник продуктов</div>
          {showRef ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
        </button>
        {showRef && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left py-1 pr-2">Продукт</th>
                  <th className="text-center py-1 px-1">Ккал</th>
                  <th className="text-center py-1 px-1">Б</th>
                  <th className="text-center py-1 px-1">Ж</th>
                  <th className="text-center py-1 px-1">У</th>
                </tr>
              </thead>
              <tbody>
                {FOOD_REFERENCE.map((f, i) => (
                  <tr key={i} className="border-t border-slate-700/40">
                    <td className="py-1.5 pr-2">
                      <div className="text-slate-200">{f.name}</div>
                      <div className="text-slate-500">{f.unit}</div>
                    </td>
                    <td className="text-center text-orange-400 font-bold py-1.5 px-1">{f.kcal}</td>
                    <td className="text-center text-emerald-400 py-1.5 px-1">{f.protein}</td>
                    <td className="text-center text-yellow-400 py-1.5 px-1">{f.fat}</td>
                    <td className="text-center text-purple-400 py-1.5 px-1">{f.carbs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// SLEEP & RECOVERY SCREEN
// ════════════════════════════════════════════════════════════════

function SleepScreen({ store }: { store: ReturnType<typeof import("./store/useStore").useStore> }) {
  const { getTodayLog, upsertDailyLog } = store;
  const todayLog = getTodayLog();
  const [bedtime, setBedtime] = useState(todayLog?.sleepBedtime ?? "23:00");
  const [wakeup, setWakeup] = useState(todayLog?.sleepWakeup ?? "07:00");
  const [quality, setQuality] = useState(todayLog?.sleepQuality ?? 7);
  const [hygiene, setHygiene] = useState<string[]>(todayLog?.sleepHygiene ?? []);
  const [breathing, setBreathing] = useState<typeof BREATHING_EXERCISES[0] | null>(null);
  const [_mobilityTimerState, setMobilityTimer] = useState<{ seconds: number; running: boolean } | null>(null);

  const calcDuration = (bed: string, wake: string) => {
    const [bh, bm] = bed.split(":").map(Number);
    const [wh, wm] = wake.split(":").map(Number);
    let mins = (wh * 60 + wm) - (bh * 60 + bm);
    if (mins < 0) mins += 24 * 60;
    return (mins / 60).toFixed(1);
  };
  const duration = calcDuration(bedtime, wakeup);

  const saveSleep = () => {
    upsertDailyLog({
      sleepBedtime: bedtime, sleepWakeup: wakeup,
      sleep: parseFloat(duration), sleepQuality: quality, sleepHygiene: hygiene,
    });
  };

  const toggleHygiene = (id: string) => {
    setHygiene((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const mobilityExercises = [
    "Грудной отдел: Cat-camel 2×10", "Подвздошно-поясничная: Couch stretch 30 сек/сторону",
    "Голеностоп: вращения + подъём на носок 15 повт", "90/90 hip rotations 8/сторону",
    "World's greatest stretch 3/сторону", "Пассивный вис на турнике 2×30 сек",
  ];

  return (
    <div className="pb-24 px-4 space-y-4 pt-4">
      {breathing && <BreathingTimer exercise={breathing} onClose={() => setBreathing(null)} />}
      <div className="text-xl font-black text-white">🌙 Сон и восстановление</div>

      {/* Sleep log */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700/50 p-4 space-y-4">
        <div className="text-sm font-semibold text-white">Дневник сна</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Время отбоя</label>
            <input type="time" value={bedtime} onChange={(e) => setBedtime(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-white text-lg font-bold focus:outline-none focus:border-orange-500" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Время подъёма</label>
            <input type="time" value={wakeup} onChange={(e) => setWakeup(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-white text-lg font-bold focus:outline-none focus:border-orange-500" />
          </div>
        </div>
        <div className="bg-slate-900/60 rounded-xl p-3 text-center">
          <div className="text-3xl font-black text-emerald-400">{duration} ч</div>
          <div className={cn("text-xs mt-0.5", parseFloat(duration) >= 7.5 ? "text-emerald-400" : "text-orange-400")}>
            {parseFloat(duration) >= 7.5 ? "✅ Цель достигнута" : `⚠️ Нужно ${(7.5 - parseFloat(duration)).toFixed(1)} ч ещё`}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-400 mb-2">Качество сна (1–10)</div>
          <div className="flex gap-1.5 flex-wrap">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
              <button key={v} onClick={() => setQuality(v)}
                className={cn("w-9 h-9 rounded-lg text-sm font-bold transition-all",
                  quality === v ? "bg-orange-500 text-white" : "bg-slate-700 text-slate-400 hover:bg-slate-600")}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <BigButton variant="secondary" onClick={saveSleep} className="w-full">
          <Save size={14} className="inline mr-1" /> Сохранить
        </BigButton>
      </div>

      {/* Hygiene checklist */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700/50 p-4">
        <div className="text-sm font-semibold text-white mb-3">Гигиена сна (7 пунктов)</div>
        <div className="space-y-2">
          {SLEEP_HYGIENE.map((h) => {
            const done = hygiene.includes(h.id);
            return (
              <button key={h.id} onClick={() => toggleHygiene(h.id)}
                className={cn("w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all",
                  done ? "bg-emerald-500/10 border-emerald-500/30" : "bg-slate-900/40 border-slate-700/30")}>
                <div className={cn("w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0",
                  done ? "bg-emerald-500" : "bg-slate-700")}>
                  {done && <Check size={12} className="text-white" />}
                </div>
                <span className={cn("text-sm", done ? "text-emerald-300 line-through" : "text-white")}>{h.label}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 text-xs text-slate-500 text-center">
          {hygiene.length}/7 выполнено
        </div>
        <BigButton variant="secondary" onClick={saveSleep} className="w-full mt-3">
          <Save size={14} className="inline mr-1" /> Сохранить
        </BigButton>
      </div>

      {/* Breathing exercises */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700/50 p-4">
        <div className="text-sm font-semibold text-white mb-3">🌬️ Дыхательные практики</div>
        <div className="space-y-3">
          {BREATHING_EXERCISES.map((ex) => (
            <div key={ex.id} className="bg-slate-900/60 rounded-xl p-3">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div>
                  <div className="text-sm font-semibold text-white">{ex.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{ex.pattern} • {ex.cycles} циклов</div>
                </div>
                <BigButton variant="secondary" onClick={() => setBreathing(ex)} className="py-1.5 px-3 text-xs">
                  <Play size={12} className="inline mr-1" />Запуск
                </BigButton>
              </div>
              <div className="text-xs text-slate-400">{ex.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Daily mobility */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700/50 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-white">🧘 Мобильность дня (5–10 мин)</div>
          <BigButton variant="secondary" onClick={() => setMobilityTimer({ seconds: 600, running: true })} className="py-1.5 px-3 text-xs">
            <Timer size={12} className="inline mr-1" />10 мин
          </BigButton>
        </div>
        <div className="space-y-2">
          {mobilityExercises.map((ex, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-slate-300">
              <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-xs text-slate-400">{i + 1}</div>
              {ex}
            </div>
          ))}
        </div>
      </div>

      {/* Recovery notes */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700/50 p-4">
        <div className="text-sm font-semibold text-white mb-2">📌 Напоминания</div>
        <div className="space-y-2 text-sm">
          <div className="bg-slate-700/50 rounded-xl p-3 text-slate-300">🧘 <strong>Четверг</strong> — активное восстановление (мобильность + дыхание)</div>
          <div className="bg-slate-700/50 rounded-xl p-3 text-slate-300">😴 <strong>Воскресенье</strong> — полный отдых. Не тренируйся.</div>
          <div className="bg-slate-700/50 rounded-xl p-3 text-slate-300">🌡️ <strong>Баня/сауна</strong> — 20 мин, не в день тяжёлой трен., не в deload</div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// TESTS SCREEN
// ════════════════════════════════════════════════════════════════

function TestsScreen({ store }: { store: ReturnType<typeof import("./store/useStore").useStore> }) {
  const { state, saveTest, addProgressPhoto, removeProgressPhoto } = store;
  const [activeLabel, setActiveLabel] = useState<"pre" | "week5" | "week9" | "week12">("pre");
  const [photoPreview, setPhotoPreview] = useState<ProgressPhoto | null>(null);

  const takePhoto = useCallback(async (label: ProgressPhoto['label']) => {
    try {
      const photo = await Camera.getPhoto({
        quality: 80,
        source: CameraSource.Prompt,
        resultType: CameraResultType.Uri,
        saveToGallery: false,
      });
      const uri = photo.webPath || photo.path || '';
      if (!uri) return;
      addProgressPhoto({
        id: `${Date.now()}`,
        date: new Date().toISOString(),
        uri,
        label,
      });
    } catch (e) {
      // user cancelled or error
      if (Capacitor.isNativePlatform()) console.error('Camera error', e);
    }
  }, [addProgressPhoto]);
  const existing = state.tests.find((t) => t.label === activeLabel);
  const [form, setForm] = useState<Record<string, string>>(
    Object.fromEntries(TEST_FIELDS.map((f) => [f.id, String(existing?.data[f.id] ?? "")]))
  );

  const labelNames = { pre: "Pre-Week (baseline)", week5: "Неделя 5 (миниретест)", week9: "Неделя 9 (миниретест)", week12: "Неделя 12 (финал)" };

  useEffect(() => {
    const ex = state.tests.find((t) => t.label === activeLabel);
    setForm(Object.fromEntries(TEST_FIELDS.map((f) => [f.id, String(ex?.data[f.id] ?? "")])));
  }, [activeLabel, state.tests]);

  const handleSave = () => {
    const data: Record<string, number | string> = {};
    TEST_FIELDS.forEach((f) => { data[f.id] = f.unit === "мин:сек" ? form[f.id] : Number(form[f.id]) || 0; });
    saveTest({ date: todayStr(), label: activeLabel as string, data });
  };

  const preTest = state.tests.find((t) => t.label === "pre");



  // Readiness gates check
  const pullups = Number(form.pullups) || 0;
  const pushups = Number(form.pushups) || 0;
  const dips = Number(form.dips) || 0;
  const preJump = Number(preTest?.data.standingJump) || 0;
  const curJump = Number(form.standingJump) || 0;

  const gateChecks: Record<string, boolean> = {
    pullups6: pullups >= 6, pushups25: pushups >= 25, dips10: dips >= 10,
    nordic5: false, jumpPlus10: curJump - preJump >= 10, sleep75: false,
  };

  return (
    <div className="pb-24 px-4 space-y-4 pt-4">
      <div className="text-xl font-black text-white">🔬 Тесты</div>

      {/* Label selector */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {(["pre", "week5", "week9", "week12"] as const).map((l) => {
          const done = state.tests.some((t) => t.label === l);
          return (
            <button key={l} onClick={() => setActiveLabel(l)}
              className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all",
                activeLabel === l ? "bg-orange-500 text-white" : "bg-slate-800 text-slate-400 hover:text-white")}>
              {done && <Check size={12} />}
              {l === "pre" ? "Pre-Week" : l === "week5" ? "Нед. 5" : l === "week9" ? "Нед. 9" : "Нед. 12"}
            </button>
          );
        })}
      </div>

      <div className="text-sm text-slate-400">{labelNames[activeLabel]}</div>

      {/* Test form */}
      <div className="space-y-3">
        {["strength", "power", "speed", "endurance", "health", "body"].map((cat) => {
          const fields = TEST_FIELDS.filter((f) => f.category === cat);
          if (!fields.length) return null;
          const catNames: Record<string, string> = { strength: "💪 Сила", power: "⚡ Мощность", speed: "🏃 Скорость", endurance: "🫁 Выносливость", health: "❤️ Здоровье", body: "⚖️ Тело" };
          return (
            <div key={cat} className="bg-slate-800 rounded-2xl border border-slate-700/50 p-4 space-y-3">
              <div className="text-sm font-semibold text-white">{catNames[cat]}</div>
              {fields.map((f) => {
                const preVal = preTest ? Number(preTest.data[f.id] ?? 0) : 0;
                const curVal = Number(form[f.id]) || 0;
                const delta = preVal > 0 && activeLabel !== "pre" ? curVal - preVal : null;
                return (
                  <div key={f.id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-200 truncate">{f.label}</div>
                      <div className="text-xs text-slate-500">{f.unit}</div>
                    </div>
                    <input value={form[f.id] ?? ""}
                      onChange={(e) => setForm({ ...form, [f.id]: e.target.value })}
                      type={f.unit === "мин:сек" ? "text" : "number"}
                      placeholder={f.unit === "мин:сек" ? "5:30" : "0"}
                      className="w-20 text-center bg-slate-900 border border-slate-600 rounded-xl py-2 text-white font-bold text-sm focus:outline-none focus:border-orange-500" />
                    {delta !== null && curVal > 0 && (
                      <div className={cn("text-sm font-bold w-12 text-right", delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-slate-400")}>
                        {delta > 0 ? "+" : ""}{delta}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <BigButton onClick={handleSave} className="w-full">
        <Save size={16} className="inline mr-1" /> Сохранить тест
      </BigButton>

      {/* Readiness gates */}
      {activeLabel !== "pre" && (
        <div className="bg-slate-800 rounded-2xl border border-slate-700/50 p-4">
          <div className="text-sm font-semibold text-white mb-3">🚪 Ворота готовности к Мезоциклу 2</div>
          <div className="space-y-2">
            {READINESS_GATES.map((g) => {
              const passed = gateChecks[g.id] ?? false;
              return (
                <div key={g.id} className={cn("flex items-center gap-3 p-2 rounded-xl",
                  passed ? "bg-emerald-500/10" : "bg-slate-900/40")}>
                  <div className={cn("w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0",
                    passed ? "bg-emerald-500" : "bg-slate-700")}>
                    {passed ? <Check size={12} className="text-white" /> : <X size={10} className="text-slate-500" />}
                  </div>
                  <span className={cn("text-sm", passed ? "text-emerald-300" : "text-slate-400")}>{g.label}</span>
                </div>
              );
            })}
          </div>
          {Object.values(gateChecks).filter(Boolean).length < READINESS_GATES.length && (
            <div className="mt-3 text-xs text-yellow-400 bg-yellow-400/10 rounded-xl p-3">
              ⚠️ Не все критерии выполнены. Продлевай Мезоцикл 1 ещё на 2 недели, не перескакивай. Профилактика травм важнее расписания.
            </div>
          )}
        </div>
      )}

      {/* Progress photos */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700/50 p-4">
        <div className="text-sm font-semibold text-white mb-3">📸 Прогресс-фото</div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {(['pre', 'week4', 'week8', 'week12'] as const).map((label) => {
            const labelNames = { pre: "Pre", week4: "Нед. 4", week8: "Нед. 8", week12: "Нед. 12" };
            return (
              <button key={label} onClick={() => takePhoto(label)}
                className="bg-slate-900/60 hover:bg-slate-700/50 border border-slate-700/50 rounded-xl p-3 flex items-center gap-2 transition-all active:scale-95">
                <CameraIcon size={16} className="text-orange-400" />
                <span className="text-sm text-white">{labelNames[label]}</span>
              </button>
            );
          })}
        </div>

        {state.progressPhotos.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {state.progressPhotos.slice().reverse().map((p) => (
              <button key={p.id} onClick={() => setPhotoPreview(p)}
                className="relative aspect-[3/4] bg-slate-900/60 rounded-xl overflow-hidden border border-slate-700/50 active:scale-95 transition-all">
                <img src={p.uri} alt={p.label} className="w-full h-full object-cover" />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-900/90 to-transparent p-2">
                  <div className="text-xs text-white font-semibold">
                    {p.label === 'pre' ? 'Pre' : p.label === 'week4' ? 'Нед. 4' : p.label === 'week8' ? 'Нед. 8' : p.label === 'week12' ? 'Нед. 12' : 'Заметка'}
                  </div>
                  <div className="text-[10px] text-slate-300">{p.date.slice(0, 10)}</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-500 text-center py-4">
            Сделай фото в Pre-Week, потом каждые 4 недели для сравнения.
          </div>
        )}

        {!Capacitor.isNativePlatform() && (
          <div className="mt-3 text-xs text-yellow-400/80 bg-yellow-400/10 rounded-lg p-2">
            ⚠️ Камера работает только в нативной Android-версии.
          </div>
        )}
      </div>

      {/* Photo preview modal */}
      {photoPreview && (
        <div className="fixed inset-0 bg-slate-950/95 z-50 flex flex-col items-center justify-center p-4">
          <button onClick={() => setPhotoPreview(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white">
            <X size={28} />
          </button>
          <img src={photoPreview.uri} alt={photoPreview.label}
            className="max-w-full max-h-[70vh] rounded-2xl shadow-2xl object-contain" />
          <div className="mt-4 text-white text-center">
            <div className="font-bold">
              {photoPreview.label === 'pre' ? 'Pre-Week' :
                photoPreview.label === 'week4' ? 'Неделя 4' :
                photoPreview.label === 'week8' ? 'Неделя 8' :
                photoPreview.label === 'week12' ? 'Неделя 12' : 'Заметка'}
            </div>
            <div className="text-xs text-slate-400 mt-1">{photoPreview.date.slice(0, 10)}</div>
          </div>
          <BigButton variant="danger" onClick={() => {
            removeProgressPhoto(photoPreview.id);
            setPhotoPreview(null);
          }} className="mt-4">
            🗑 Удалить фото
          </BigButton>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// HISTORY SCREEN
// ════════════════════════════════════════════════════════════════

function HistoryScreen({ state }: { state: ReturnType<typeof import("./store/useStore").useStore>["state"] }) {
  const [filter, setFilter] = useState<string>("ALL");
  const [selected, setSelected] = useState<typeof state.workouts[0] | null>(null);
  const [search, setSearch] = useState("");

  const sessions = ["ALL", "A", "B", "C", "D", "E"];
  const filtered = state.workouts
    .filter((w) => filter === "ALL" || w.session === filter)
    .filter((w) => !search || w.notes.toLowerCase().includes(search.toLowerCase()))
    .slice().reverse();

  if (selected) {
    return (
      <div className="min-h-screen bg-slate-900 pb-24 px-4">
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur border-b border-slate-800 py-3 flex items-center gap-3">
          <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white p-1">
            <ChevronLeft size={24} />
          </button>
          <div>
            <div className="font-bold text-white">{WEEK_DAYS.find((d) => d.session === selected.session)?.name ?? selected.session}</div>
            <div className="text-xs text-slate-400">{selected.date} • {selected.durationMin} мин</div>
          </div>
        </div>
        <div className="space-y-3 pt-4">
          <div className="flex gap-3">
            <div className="bg-slate-800 rounded-xl p-3 flex-1 text-center">
              <div className="text-2xl font-black text-orange-400">{selected.totalRpe}</div>
              <div className="text-xs text-slate-400">RPE</div>
            </div>
            <div className="bg-slate-800 rounded-xl p-3 flex-1 text-center">
              <div className="text-2xl font-black text-blue-400">{selected.durationMin}</div>
              <div className="text-xs text-slate-400">мин</div>
            </div>
            <div className="bg-slate-800 rounded-xl p-3 flex-1 text-center">
              <div className="text-2xl font-black text-emerald-400">{selected.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0)}</div>
              <div className="text-xs text-slate-400">подходов</div>
            </div>
          </div>
          {selected.notes && (
            <div className="bg-slate-800 rounded-xl p-3">
              <div className="text-xs text-slate-400 mb-1">Заметки</div>
              <div className="text-sm text-slate-200">{selected.notes}</div>
            </div>
          )}
          {selected.exercises.map((ex) => (
            <div key={ex.exerciseId} className="bg-slate-800 rounded-xl p-3">
              <div className="font-semibold text-white text-sm mb-2">{ex.exerciseName}</div>
              <div className="space-y-1.5">
                {ex.sets.filter((s) => s.done).map((s, i) => {
                  const rm = calc1RMHelper(s.weight, s.reps);
                  return (
                    <div key={i} className="flex items-center gap-3 text-xs">
                      <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-white">{i + 1}</div>
                      <span className="text-white font-bold">{s.weight} кг × {s.reps}</span>
                      <Badge color="gray">RPE {s.rpe}</Badge>
                      {rm && <span className="text-slate-400">1RM~{rm}</span>}
                      {s.note && <span className="text-slate-500 italic">{s.note}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24 px-4 space-y-4 pt-4">
      <div className="text-xl font-black text-white">📚 История</div>
      <input value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Поиск по заметкам..."
        className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500" />
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {sessions.map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={cn("px-3 py-1.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all",
              filter === s ? "bg-orange-500 text-white" : "bg-slate-800 text-slate-400 hover:text-white")}>
            {s === "ALL" ? "Все" : `Тр. ${s}`}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="text-center text-slate-500 py-16">
          <div className="text-4xl mb-3">📭</div>
          <div>История пуста. Тренируйся!</div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((w) => (
            <button key={w.id} onClick={() => setSelected(w)}
              className="w-full bg-slate-800 rounded-2xl border border-slate-700/50 p-4 flex items-center gap-3 text-left hover:bg-slate-700/50 transition-all active:scale-[0.98]">
              <div className="text-3xl">{WEEK_DAYS.find((d) => d.session === w.session)?.emoji ?? "💪"}</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-white text-sm">{WEEK_DAYS.find((d) => d.session === w.session)?.name ?? w.session}</div>
                <div className="text-xs text-slate-400 mt-0.5">{w.date} • {w.durationMin} мин • Нед. {w.week}</div>
                {w.notes && <div className="text-xs text-slate-500 truncate mt-0.5">{w.notes}</div>}
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge color={w.totalRpe >= 9 ? "red" : w.totalRpe >= 7 ? "orange" : "green"}>RPE {w.totalRpe}</Badge>
                <div className="text-xs text-slate-500">{w.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0)} подх.</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function calc1RMHelper(weight: number, reps: number) {
  if (!weight || reps > 10 || reps <= 0) return null;
  return Math.round(weight * (1 + reps / 30));
}

// ════════════════════════════════════════════════════════════════
// REFERENCE SCREEN
// ════════════════════════════════════════════════════════════════

function ReferenceScreen() {
  const [tab, setTab] = useState("philosophy");
  const tabs = [
    { key: "philosophy", label: "Философия" },
    { key: "physiology", label: "Физиология" },
    { key: "deload", label: "Deload" },
    { key: "scenarios", label: "Сценарии" },
    { key: "exercises", label: "Упражнения" },
    { key: "glossary", label: "Глоссарий" },
  ];

  return (
    <div className="pb-24 px-4 space-y-4 pt-4">
      <div className="text-xl font-black text-white">📖 Справочник</div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn("px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all",
              tab === t.key ? "bg-orange-500 text-white" : "bg-slate-800 text-slate-400 hover:text-white")}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "philosophy" && (
        <div className="space-y-3">
          <div className="bg-slate-800 rounded-2xl border border-slate-700/50 p-4">
            <div className="text-lg font-black text-white mb-3">{PROGRAM_NAME}</div>
            <p className="text-slate-400 text-sm leading-relaxed">Не культурист — спецназ. Не максимальный объём мышц, а максимальная эффективность на единицу массы.</p>
          </div>
          {[
            { n: 1, t: "Максимальная сила за минимум времени", d: "Rate of Force Development (RFD). Способность генерировать максимальную силу за минимальное время — ключевая метрика для прыжков, спринтов, броска в баскетболе.", icon: "⚡" },
            { n: 2, t: "Повторяемость без деградации", d: "Повторение взрывной работы многократно без катастрофической деградации. Баскетбольный матч = 40 мин прыжков, спринтов, стартов.", icon: "🔁" },
            { n: 3, t: "Гашение ударных нагрузок", d: "Эксцентрический контроль и жёсткость сухожилий. Ахилл и колени должны быть готовы к многократным приземлениям без травм.", icon: "🛡️" },
            { n: 4, t: "Переключение между режимами", d: "Быстрое переключение между аэробным и анаэробным режимами. Баскетбол = фосфагенный спринт → аэробное восстановление → снова спринт.", icon: "🔄" },
            { n: 5, t: "Работа в стрессе и недосыпе", d: "Реалистичная жизнь. Сидячая работа, 6–7 ч сна, стресс 6/10. Программа учитывает это и включает деградацию нагрузки при перегрузе.", icon: "💪" },
          ].map((p) => (
            <div key={p.n} className="bg-slate-800 rounded-2xl border border-slate-700/50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{p.icon}</span>
                <div>
                  <span className="text-xs text-orange-400 font-mono">#{p.n}</span>
                  <div className="font-bold text-white text-sm">{p.t}</div>
                </div>
              </div>
              <p className="text-slate-400 text-xs leading-relaxed">{p.d}</p>
            </div>
          ))}
        </div>
      )}

      {tab === "physiology" && (
        <div className="space-y-3">
          {[
            { t: "Фосфагенная система", emoji: "⚡", d: "Работает 0–10 сек максимального усилия. Восстанавливается 2–5 мин. Поэтому спринты до 30–40 м с отдыхом 2–3 мин, силовые до 6 повт с 2–3 мин отдыха. Короче отдых = тренируешь лактат, а не мощность. Принципиально разный результат." },
            { t: "Митохондрии и биогенез", emoji: "🔬", d: "Митохондрии развивают не только длинное кардио. HIIT и силовая 8–15 повт стимулируют биогенез через белок PGC-1α. Один день лёгкого темпа для капилляризации достаточен для аэробной базы при этой программе." },
            { t: "Актин-миозин и плотность мышц", emoji: "💪", d: "Тяжёлые низкоповт (нейральная адаптация, плотность миофибрилл) + эксцентрика (структурная адаптация). Зона 4–8 повт с темпом 3-0-X оптимальна для сочетания силы и гипертрофии." },
            { t: "Рекрутирование моторных единиц", emoji: "🧠", d: "Тяжёлая работа рекрутирует все волокна (FF). Взрывная лёгкая с максимальным намерением активирует быстрые волокна без перегруза. PAP (Post-Activation Potentiation) = тяжёлый присед → прыжок = пик мощности." },
            { t: "Соединительная ткань", emoji: "🦴", d: "Цикл ремоделирования коллагена в сухожилиях 6–8 недель vs 2–3 недели для мышц. Поэтому два deload, а не один. Игнорирование этого = тендинопатия через 6–8 недель интенсивной работы." },
            { t: "Stretch-Shortening Cycle (SSC)", emoji: "🌀", d: "Эластичная энергия запасается в сухожилиях при эксцентрике (опускание в прыжке) и высвобождается при концентрике (отталкивание). Именно это делает depth jumps эффективными — пружина из сухожилий." },
          ].map((p, i) => (
            <div key={i} className="bg-slate-800 rounded-2xl border border-slate-700/50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{p.emoji}</span>
                <div className="font-bold text-white text-sm">{p.t}</div>
              </div>
              <p className="text-slate-400 text-xs leading-relaxed">{p.d}</p>
            </div>
          ))}
        </div>
      )}

      {tab === "deload" && (
        <div className="space-y-3">
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl p-4">
            <div className="font-bold text-orange-400 mb-2">Deload — это не прогулка, это суперкомпенсация</div>
            <p className="text-slate-300 text-sm">Именно здесь ткани перестраиваются и происходит реальный прогресс. Нейральное восстановление, ремоделирование коллагена, повышение чувствительности к нагрузке.</p>
          </div>
          {[
            ["Объём", "−40% (меньше подходов)"],
            ["Интенсивность", "−15% (меньше вес / проще вариация)"],
            ["Структура", "Дни сохраняются"],
            ["Силовые", "2 подхода по нижней границе повт"],
            ["Вспомогательные", "2 подхода по 8"],
            ["Спринты", "Tempo 4 × 60 м на 70%, никаких субмакс."],
            ["Фокус", "Мобильность, сон, восстановление"],
            ["Конец недели", "Миниретест (отжимания, подтягивания, брусья, прыжок, спринт)"],
          ].map(([k, v]) => (
            <div key={k} className="bg-slate-800 rounded-xl border border-slate-700/50 p-3 flex items-start gap-3">
              <div className="text-slate-400 text-xs font-semibold w-28 flex-shrink-0 pt-0.5">{k}</div>
              <div className="text-white text-xs">{v}</div>
            </div>
          ))}
        </div>
      )}

      {tab === "scenarios" && (
        <div className="space-y-3">
          {[
            { t: "Веса не растут 2 недели", icon: "📉", d: "Проверь: сон, калории, стресс. В 90% случаев проблема в восстановлении, а не в программе. Если всё ок — возможно пора deload раньше плана." },
            { t: "Боль в суставе", icon: "🚨", d: "Тренировка через боль — запрет. Замени упражнение на безболезненную альтернативу, оцени 3–5 дней. Не проходит — пауза + врач. Никогда не терпи боль в суставах." },
            { t: "Командировка / болезнь / экзамены", icon: "🧳", d: "Минимальный поддерживающий режим: 3 дня × 40 мин, 2 основных движения + кор. После восстановления режима возвращаешься с мезоцикла где остановился — не перезапускай с начала." },
            { t: "Тренировка не идёт с разминки", icon: "😔", d: "Делаешь сессию на 60% весов, без плиометрики. Это не впустую — это грамотное управление нагрузкой и уважение к ЦНС. Лучшая тренировка — та, что не травмирует." },
          ].map((s) => (
            <div key={s.t} className="bg-slate-800 rounded-2xl border border-slate-700/50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{s.icon}</span>
                <div className="font-bold text-white text-sm">{s.t}</div>
              </div>
              <p className="text-slate-400 text-xs leading-relaxed">{s.d}</p>
            </div>
          ))}
          <div className="bg-slate-800 rounded-2xl border border-slate-700/50 p-4">
            <div className="font-bold text-white text-sm mb-3">📉 Протокол срезания нагрузки</div>
            <div className="space-y-2">
              <div className="bg-slate-700/50 rounded-xl p-3 text-sm text-slate-300">1️⃣ Нормальный план: 6 дней (Пн–Сб)</div>
              <div className="bg-slate-700/50 rounded-xl p-3 text-sm text-slate-300">2️⃣ При перегрузе: убери Сб → 5 дней</div>
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 text-sm text-yellow-300">3️⃣ Сильная усталость: убери Вт → 3 дня (Пн, Ср, Пт)</div>
            </div>
            <p className="text-xs text-slate-500 mt-2">Это встроенная функция программы, а не провал.</p>
          </div>
        </div>
      )}

      {tab === "exercises" && (
        <div className="space-y-3">
          {Object.entries(ALL_WORKOUTS).map(([session, workouts]) => (
            <div key={session} className="bg-slate-800 rounded-2xl border border-slate-700/50 p-4">
              <div className="font-bold text-white mb-3">
                {WEEK_DAYS.find((d) => d.session === session)?.emoji} Тренировка {session} — {WEEK_DAYS.find((d) => d.session === session)?.name}
              </div>
              {workouts[0].exercises.map((ex) => (
                <details key={ex.id} className="mb-2">
                  <summary className="text-sm text-slate-200 cursor-pointer hover:text-white py-1.5 flex items-center gap-2">
                    <span>{ex.emoji}</span> {ex.name}
                  </summary>
                  <div className="mt-1 ml-6 bg-slate-900/60 rounded-xl p-3 text-xs">
                    <p className="text-emerald-400 mb-1">{ex.why}</p>
                    {ex.tips && <p className="text-yellow-400/80">💡 {ex.tips}</p>}
                    <div className="mt-2 flex gap-3 text-slate-500">
                      <span>Темп: <span className="text-white font-mono">{ex.tempo}</span></span>
                      <span>Отд.: <span className="text-white">{fmtTime(ex.rest)}</span></span>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          ))}
        </div>
      )}

      {tab === "glossary" && (
        <div className="space-y-2">
          {GLOSSARY.map((g) => (
            <details key={g.term} className="bg-slate-800 rounded-xl border border-slate-700/50">
              <summary className="px-4 py-3 text-sm font-bold text-orange-400 cursor-pointer hover:text-orange-300">
                {g.term}
              </summary>
              <div className="px-4 pb-3 text-xs text-slate-300 leading-relaxed">{g.def}</div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// SETTINGS SCREEN
// ════════════════════════════════════════════════════════════════

function SettingsScreen({ store }: { store: ReturnType<typeof import("./store/useStore").useStore> }) {
  const { state, updateUser, exportData, exportCSV, importData, resetData } = store;
  const [confirmReset, setConfirmReset] = useState(false);
  const [startDateInput, setStartDateInput] = useState(state.user.startDate ?? "");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => importData(String(ev.target?.result ?? ""));
    reader.readAsText(file);
  };

  // Reminders helpers — re-schedule on toggle/time change
  const toggleWorkoutReminder = async (enabled: boolean) => {
    updateUser({ reminderWorkoutEnabled: enabled });
    if (enabled) {
      await scheduleWorkoutReminder(state.user.reminderWorkoutTime || "07:00");
    } else {
      await cancelReminder(REMINDER_IDS.workout);
    }
  };
  const updateWorkoutTime = async (time: string) => {
    updateUser({ reminderWorkoutTime: time });
    if (state.user.reminderWorkoutEnabled) await scheduleWorkoutReminder(time);
  };
  const toggleMorningMetrics = async (enabled: boolean) => {
    updateUser({ reminderMorningMetrics: enabled });
    if (enabled) {
      const wake = state.dailyLogs.find((l) => l.sleepWakeup)?.sleepWakeup || "07:00";
      await scheduleMorningMetricsReminder(wake);
    } else {
      await cancelReminder(REMINDER_IDS.morningMetrics);
    }
  };
  const toggleCreatine = async (enabled: boolean) => {
    updateUser({ reminderCreatine: enabled });
    if (enabled) await scheduleCreatineReminder(state.user.reminderCreatineTime || "09:00");
    else await cancelReminder(REMINDER_IDS.creatine);
  };
  const updateCreatineTime = async (time: string) => {
    updateUser({ reminderCreatineTime: time });
    if (state.user.reminderCreatine) await scheduleCreatineReminder(time);
  };
  const toggleWater = async (enabled: boolean) => {
    updateUser({ reminderWater: enabled });
    if (enabled) await scheduleWaterReminder();
    else {
      for (let i = REMINDER_IDS.waterStart; i <= REMINDER_IDS.waterEnd; i++) {
        await cancelReminder(i);
      }
    }
  };

  return (
    <div className="pb-24 px-4 space-y-4 pt-4">
      <div className="text-xl font-black text-white">⚙️ Настройки</div>

      {/* Profile */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700/50 p-4 space-y-3">
        <div className="text-sm font-semibold text-white">Профиль</div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Имя</label>
          <input value={state.user.name} onChange={(e) => updateUser({ name: e.target.value })}
            className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-orange-500" />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Дата начала программы</label>
          <input type="date" value={startDateInput}
            onChange={(e) => { setStartDateInput(e.target.value); updateUser({ startDate: e.target.value }); }}
            className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-orange-500" />
        </div>
      </div>

      {/* Preferences */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700/50 p-4 space-y-3">
        <div className="text-sm font-semibold text-white">Предпочтения</div>
        {[
          { key: "sound" as const, label: "Звуки таймера", icon: <Volume2 size={18} /> },
          { key: "haptic" as const, label: "Haptic feedback", icon: <Activity size={18} /> },
          { key: "notifications" as const, label: "Уведомления", icon: <Bell size={18} /> },
        ].map(({ key, label, icon }) => (
          <div key={key} className="flex items-center justify-between py-1">
            <div className="flex items-center gap-3 text-slate-300">
              {icon} <span className="text-sm">{label}</span>
            </div>
            <button onClick={() => updateUser({ [key]: !state.user[key] })}
              className={cn("w-12 h-6 rounded-full transition-all relative",
                state.user[key] ? "bg-orange-500" : "bg-slate-600")}>
              <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                state.user[key] ? "left-7" : "left-1")} />
            </button>
          </div>
        ))}
      </div>

      {/* Achievements */}
      {state.achievements.length > 0 && (
        <div className="bg-slate-800 rounded-2xl border border-slate-700/50 p-4">
          <div className="text-sm font-semibold text-white mb-3">🏆 Достижения</div>
          <div className="grid grid-cols-2 gap-2">
            {state.achievements.map((id) => {
              const a = ACHIEVEMENTS.find((x) => x.id === id);
              if (!a) return null;
              return (
                <div key={id} className="bg-slate-700/50 rounded-xl p-3 text-center">
                  <div className="text-2xl mb-1">{a.emoji}</div>
                  <div className="text-xs font-semibold text-white">{a.label}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{a.desc}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reminders */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700/50 p-4 space-y-3">
        <div className="text-sm font-semibold text-white">🔔 Уведомления</div>

        <div className="flex items-center justify-between py-1">
          <div className="flex-1">
            <div className="text-sm text-slate-200">💪 Утренняя тренировка</div>
            <div className="text-xs text-slate-500">Напоминание начать сессию</div>
          </div>
          <button onClick={() => toggleWorkoutReminder(!state.user.reminderWorkoutEnabled)}
            className={cn("w-12 h-6 rounded-full transition-all relative",
              state.user.reminderWorkoutEnabled ? "bg-orange-500" : "bg-slate-600")}>
            <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
              state.user.reminderWorkoutEnabled ? "left-7" : "left-1")} />
          </button>
        </div>
        {state.user.reminderWorkoutEnabled && (
          <div className="bg-slate-900/60 rounded-xl p-3">
            <label className="text-xs text-slate-400 mb-1 block">Время</label>
            <input type="time" value={state.user.reminderWorkoutTime}
              onChange={(e) => updateWorkoutTime(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-orange-500" />
          </div>
        )}

        <div className="flex items-center justify-between py-1">
          <div className="flex-1">
            <div className="text-sm text-slate-200">📊 Утренние метрики</div>
            <div className="text-xs text-slate-500">Через 30 мин после подъёма</div>
          </div>
          <button onClick={() => toggleMorningMetrics(!state.user.reminderMorningMetrics)}
            className={cn("w-12 h-6 rounded-full transition-all relative",
              state.user.reminderMorningMetrics ? "bg-orange-500" : "bg-slate-600")}>
            <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
              state.user.reminderMorningMetrics ? "left-7" : "left-1")} />
          </button>
        </div>

        <div className="flex items-center justify-between py-1">
          <div className="flex-1">
            <div className="text-sm text-slate-200">💊 Креатин</div>
            <div className="text-xs text-slate-500">Ежедневно 5 г</div>
          </div>
          <button onClick={() => toggleCreatine(!state.user.reminderCreatine)}
            className={cn("w-12 h-6 rounded-full transition-all relative",
              state.user.reminderCreatine ? "bg-orange-500" : "bg-slate-600")}>
            <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
              state.user.reminderCreatine ? "left-7" : "left-1")} />
          </button>
        </div>
        {state.user.reminderCreatine && (
          <div className="bg-slate-900/60 rounded-xl p-3">
            <label className="text-xs text-slate-400 mb-1 block">Время</label>
            <input type="time" value={state.user.reminderCreatineTime}
              onChange={(e) => updateCreatineTime(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-orange-500" />
          </div>
        )}

        <div className="flex items-center justify-between py-1">
          <div className="flex-1">
            <div className="text-sm text-slate-200">💧 Вода</div>
            <div className="text-xs text-slate-500">Каждые 2 часа (9-19)</div>
          </div>
          <button onClick={() => toggleWater(!state.user.reminderWater)}
            className={cn("w-12 h-6 rounded-full transition-all relative",
              state.user.reminderWater ? "bg-orange-500" : "bg-slate-600")}>
            <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
              state.user.reminderWater ? "left-7" : "left-1")} />
          </button>
        </div>

        {!Capacitor.isNativePlatform() && (
          <div className="text-xs text-yellow-400/80 bg-yellow-400/10 rounded-lg p-2">
            ⚠️ Уведомления работают только в нативной Android-версии.
          </div>
        )}
      </div>

      {/* Data */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700/50 p-4 space-y-3">
        <div className="text-sm font-semibold text-white">Данные</div>
        <div className="text-xs text-slate-400">
          Тренировок: {state.workouts.length} • Дней логов: {state.dailyLogs.length} • Тестов: {state.tests.length}
        </div>
        <BigButton variant="secondary" onClick={exportData} className="w-full">
          <Download size={16} className="inline mr-2" />Экспорт JSON
        </BigButton>
        <BigButton variant="secondary" onClick={exportCSV} className="w-full">
          <FileText size={16} className="inline mr-2" />Экспорт CSV (тренировки)
        </BigButton>
        <BigButton variant="secondary" onClick={() => fileRef.current?.click()} className="w-full">
          <Upload size={16} className="inline mr-2" />Импорт JSON
        </BigButton>
        <input ref={fileRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
        {!confirmReset ? (
          <BigButton variant="ghost" onClick={() => setConfirmReset(true)} className="w-full border-red-600/50 text-red-400">
            <RefreshCw size={16} className="inline mr-2" />Сбросить прогресс
          </BigButton>
        ) : (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 space-y-2">
            <div className="text-red-400 text-sm font-semibold">Сбросить ВСЕ данные?</div>
            <div className="text-xs text-slate-400">Это удалит все тренировки, логи и тесты. Не отменить.</div>
            <div className="flex gap-2">
              <BigButton variant="danger" onClick={() => { resetData(); setConfirmReset(false); }} className="flex-1">
                Да, сбросить
              </BigButton>
              <BigButton variant="ghost" onClick={() => setConfirmReset(false)} className="flex-1">
                Отмена
              </BigButton>
            </div>
          </div>
        )}
      </div>

      <div className="text-center text-xs text-slate-600 pb-4">
        Биологически эффективная машина v1.0<br />
        Все данные хранятся локально • Офлайн-режим
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// WORKOUT SELECT SCREEN
// ════════════════════════════════════════════════════════════════

function WorkoutSelectScreen({ week, onSelect, onBack }: {
  week: number; onSelect: (session: string) => void; onBack: () => void;
}) {
  const mesoIdx = getMesocycleIndexForWeek(week);
  const sessions = ["A", "B", "C", "D", "E"];

  return (
    <div className="min-h-screen bg-slate-900 pb-24 px-4">
      <div className="sticky top-0 bg-slate-900/95 backdrop-blur border-b border-slate-800 py-3 flex items-center gap-3">
        <button onClick={onBack} className="text-slate-400 hover:text-white p-1"><ChevronLeft size={24} /></button>
        <div className="font-bold text-white">Выбор тренировки</div>
      </div>
      <div className="space-y-3 pt-4">
        <div className="text-sm text-slate-400">Неделя {week} • {getMesocycleForWeek(week).label}</div>
        {sessions.map((s) => {
          const dayInfo = WEEK_DAYS.find((d) => d.session === s);
          const workout = getWorkoutForSession(s, mesoIdx);
          if (!dayInfo || !workout) return null;
          return (
            <button key={s} onClick={() => onSelect(s)}
              className="w-full bg-slate-800 rounded-2xl border border-slate-700/50 p-4 flex items-center gap-3 text-left hover:bg-slate-700/50 transition-all active:scale-[0.98]">
              <div className="text-3xl">{dayInfo.emoji}</div>
              <div className="flex-1">
                <div className="font-bold text-white">{dayInfo.name}</div>
                <div className="text-xs text-slate-400">{dayInfo.duration} мин • ЦНС: {dayInfo.cns}</div>
                <div className="text-xs text-slate-500 mt-0.5">{workout.exercises.length} упражнений</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge color={s === "D" ? "red" : s === "A" || s === "B" ? "orange" : "blue"}>Тр. {s}</Badge>
                <ChevronRight size={16} className="text-slate-500" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// BOTTOM NAV
// ════════════════════════════════════════════════════════════════

const NAV_ITEMS = [
  { key: "dashboard", label: "Главная", Icon: Home },
  { key: "workout", label: "Тренировка", Icon: Dumbbell },
  { key: "metrics", label: "Метрики", Icon: BarChart2 },
  { key: "nutrition", label: "Питание", Icon: Apple },
  { key: "more", label: "Ещё", Icon: BookOpen },
];

function BottomNav({ active, onChange }: { active: string; onChange: (t: string) => void }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 bg-slate-900/95 backdrop-blur border-t border-slate-800 pb-safe">
      <div className="flex max-w-md mx-auto">
        {NAV_ITEMS.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => onChange(key)}
            className={cn("flex-1 flex flex-col items-center gap-0.5 py-3 px-1 transition-all",
              active === key ? "text-orange-400" : "text-slate-500 hover:text-slate-300")}>
            <Icon size={22} />
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// MORE SCREEN
// ════════════════════════════════════════════════════════════════

function MoreScreen({ onNavigate }: { onNavigate: (t: string) => void }) {
  const items = [
    { key: "sleep", label: "Сон и восстановление", icon: "🌙", desc: "Дневник сна, гигиена, дыхание" },
    { key: "tests", label: "Тесты и метрики", icon: "🔬", desc: "Baseline, миниретесты, прогресс" },
    { key: "history", label: "История тренировок", icon: "📚", desc: "Все выполненные сессии" },
    { key: "reference", label: "Справочник", icon: "📖", desc: "Философия, физиология, глоссарий" },
    { key: "settings", label: "Настройки", icon: "⚙️", desc: "Профиль, экспорт, сброс" },
  ];
  return (
    <div className="pb-24 px-4 space-y-3 pt-4">
      <div className="text-xl font-black text-white">Ещё</div>
      {items.map((i) => (
        <button key={i.key} onClick={() => onNavigate(i.key)}
          className="w-full bg-slate-800 rounded-2xl border border-slate-700/50 p-4 flex items-center gap-3 text-left hover:bg-slate-700/50 transition-all active:scale-[0.98]">
          <div className="text-3xl w-10">{i.icon}</div>
          <div className="flex-1">
            <div className="font-semibold text-white">{i.label}</div>
            <div className="text-xs text-slate-400 mt-0.5">{i.desc}</div>
          </div>
          <ChevronRight size={18} className="text-slate-500" />
        </button>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// MAIN APP
// ════════════════════════════════════════════════════════════════

export default function App() {
  const store = useStore();
  const { state, isLoaded, updateUser, saveWorkout, currentWeek } = store;
  const [tab, setTab] = useState("dashboard");
  const [activeScreen, setActiveScreen] = useState<string | null>(null); // full screens
  const [workoutSession, setWorkoutSession] = useState<string | null>(null);
  const [confetti, setConfetti] = useState(false);

  // Request notification permissions on first launch (native)
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      ensureNotifPermission().catch(() => { /* ignore */ });
    }
  }, []);

  // Show splash/loader until storage is loaded (avoid flash of empty state)
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center">
        <div className="text-6xl animate-pulse mb-4">🤖</div>
        <div className="text-orange-400 font-bold text-lg">Биомашина</div>
        <div className="text-slate-500 text-xs mt-2">Загрузка…</div>
      </div>
    );
  }

  // Onboarding
  if (!state.user.onboardingComplete) {
    return (
      <Onboarding onComplete={(name, startNow) => {
        updateUser({
          name, onboardingComplete: true,
          startDate: startNow ? todayStr() : null,
          currentWeek: startNow ? 0 : 0,
        });
      }} />
    );
  }

  // Active workout
  if (workoutSession) {
    return (
      <WorkoutScreen
        session={workoutSession}
        week={currentWeek}
        onBack={() => setWorkoutSession(null)}
        onFinish={(log) => {
          saveWorkout(log);
          setWorkoutSession(null);
          setConfetti(true);
          setTimeout(() => setConfetti(false), 3000);
        }}
      />
    );
  }

  const handleStartWorkout = (session: string) => {
    setWorkoutSession(session);
  };

  const navigate = (t: string) => {
    const mainTabs = ["dashboard", "workout", "metrics", "nutrition", "more"];
    if (mainTabs.includes(t)) {
      setTab(t);
      setActiveScreen(null);
    } else {
      setActiveScreen(t);
    }
  };

  const renderContent = () => {
    // Full screens
    if (activeScreen === "sleep") return <SleepScreen store={store} />;
    if (activeScreen === "tests") return <TestsScreen store={store} />;
    if (activeScreen === "history") return <HistoryScreen state={state} />;
    if (activeScreen === "reference") return <ReferenceScreen />;
    if (activeScreen === "settings") return <SettingsScreen store={store} />;

    // Tab screens
    if (tab === "dashboard") return (
      <Dashboard store={store} onStartWorkout={handleStartWorkout} onNavigate={navigate} />
    );
    if (tab === "workout") return (
      <WorkoutSelectScreen week={currentWeek} onSelect={handleStartWorkout} onBack={() => setTab("dashboard")} />
    );
    if (tab === "metrics") return <MetricsScreen store={store} />;
    if (tab === "nutrition") return <NutritionScreen store={store} />;
    if (tab === "more") return <MoreScreen onNavigate={navigate} />;
    return null;
  };

  const currentTab = activeScreen ? "more" : tab;

  return (
    <div className="bg-slate-900 min-h-screen text-white max-w-md mx-auto relative">
      <Confetti show={confetti} />

      {/* Save indicator */}
      {store.saveIndicator && (
        <div className="fixed top-3 right-3 z-50 bg-emerald-500/90 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg">
          <Check size={12} /> Сохранено
        </div>
      )}

      {/* Back header for sub-screens */}
      {activeScreen && (
        <div className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 py-3 flex items-center gap-3">
          <button onClick={() => setActiveScreen(null)} className="text-slate-400 hover:text-white p-1">
            <ChevronLeft size={24} />
          </button>
          <div className="font-bold text-white">
            {activeScreen === "sleep" && "🌙 Сон и восстановление"}
            {activeScreen === "tests" && "🔬 Тесты"}
            {activeScreen === "history" && "📚 История"}
            {activeScreen === "reference" && "📖 Справочник"}
            {activeScreen === "settings" && "⚙️ Настройки"}
          </div>
          <div className="ml-auto text-xs text-slate-500">{state.user.name}</div>
        </div>
      )}

      {/* Header for main tabs */}
      {!activeScreen && (
        <div className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 py-3 flex items-center justify-between">
          <div className="font-black text-white text-lg">🤖 <span style={{ color: ACCENT }}>Биомашина</span></div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-slate-400">
              {currentWeek === 0 ? "Pre-Week" : `Нед. ${currentWeek}/12`}
            </div>
            <button onClick={() => navigate("settings")}
              className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white">
              <User size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="overflow-y-auto" style={{ minHeight: "calc(100vh - 120px)" }}>
        {renderContent()}
      </div>

      <BottomNav active={currentTab} onChange={(t) => {
        setActiveScreen(null);
        setTab(t);
      }} />
    </div>
  );
}

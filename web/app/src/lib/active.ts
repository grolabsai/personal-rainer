import type { ActiveSession, Workout } from './types';

const KEY = 'active-session';

export function readActive(userId: string): ActiveSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as ActiveSession) : null;
    return s && s.userId === userId ? s : null;
  } catch { return null; }
}

export function writeActive(s: ActiveSession | null) {
  try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); }
  catch { /* storage unavailable: the session still lives in memory */ }
}

// First number in the planned reps ("8-12" -> 8, "30 s" -> 30) pre-fills each set.
const firstNumber = (r: string) => (r.match(/\d+(?:[.,]\d+)?/) || [''])[0];

export function newActive(userId: string, workout: Workout, assignmentId: string | null): ActiveSession {
  return {
    userId, workoutId: workout.id, workoutNames: workout.names, assignmentId,
    startedAt: new Date().toISOString(), current: 0, restUntil: null,
    sets: Object.fromEntries(workout.items.map(it => [it.id, Array.from({ length: it.sets }, () => ({
      reps: firstNumber(it.reps), weight: it.weight_kg != null ? String(it.weight_kg) : '', done: false,
    }))])),
  };
}

export const isTimed = (reps: string) => /\d\s*s(ec)?\b/i.test(reps);

export const fmtClock = (secs: number) => {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m)) + ':' + String(r).padStart(2, '0');
};

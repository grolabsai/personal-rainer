import type { ActiveSession, Block, Item, PrescribedSet, Variant, Workout } from './types';

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

// One thing the athlete does at one moment. A straight block gives one step per exercise, holding
// all its sets; a rounds block gives one step per exercise per round, holding that round's set —
// which is the whole difference between "three sets of A then B" and "alternate A and B".
export type Step = {
  key: string;
  block: Block;
  item: Item;
  round: number;
  rounds: number;
  sets: PrescribedSet[];
  lastOfRound: boolean;
};

export function stepsOf(workout: Workout): Step[] {
  const out: Step[] = [];
  for (const block of workout.blocks) {
    if (block.mode === 'rounds') {
      const rounds = block.rounds || Math.max(1, ...block.items.map(i => i.sets.length));
      for (let r = 1; r <= rounds; r++) {
        const inRound = block.items.filter(i => i.sets.some(s => s.set_number === r));
        inRound.forEach((item, n) => {
          const set = item.sets.find(s => s.set_number === r)!;
          out.push({ key: `${item.id}:${r}`, block, item, round: r, rounds, sets: [set],
            lastOfRound: n === inRound.length - 1 });
        });
      }
    } else {
      for (const item of block.items) {
        if (item.sets.length) out.push({ key: `${item.id}:1`, block, item, round: 1, rounds: 1, sets: item.sets, lastOfRound: true });
      }
    }
  }
  return out;
}

// The variation to show: what the athlete swapped to, else this set's own override, else the item's.
export const variantOf = (step: Step, set: PrescribedSet | undefined, active: ActiveSession | null): Variant | null =>
  active?.swaps?.[step.item.id] || set?.variant || step.item.variant;

// Rest after finishing a step: inside a rounds block the block decides, otherwise the set does.
export const restAfter = (step: Step, set: PrescribedSet): number =>
  step.block.mode === 'rounds'
    ? (step.lastOfRound ? step.block.rest_between_rounds_s : step.block.rest_between_items_s)
    : set.rest_seconds;

export const allSets = (workout: Workout): PrescribedSet[] =>
  workout.blocks.flatMap(b => b.items.flatMap(i => i.sets));

// Prescribed reps (or seconds) pre-fill the entry, so ticking a set off is one tap.
const prefill = (s: PrescribedSet) => (s.reps_min != null ? String(s.reps_min)
  : s.duration_seconds != null ? String(s.duration_seconds) : '');

export function newActive(userId: string, workout: Workout, assignmentId: string | null): ActiveSession {
  return {
    userId, workoutId: workout.id, workoutNames: workout.names, assignmentId,
    startedAt: new Date().toISOString(), current: 0, restUntil: null,
    sets: Object.fromEntries(allSets(workout).map(s => [s.id, {
      reps: prefill(s), weight: s.load_kg != null ? String(s.load_kg) : '', done: false,
    }])),
  };
}

export const isTimed = (s: PrescribedSet) => s.duration_seconds != null;

export const fmtClock = (secs: number) => {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m)) + ':' + String(r).padStart(2, '0');
};

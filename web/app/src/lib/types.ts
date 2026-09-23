import type { Names } from './i18n';

export type Variant = {
  id: string;
  exercise_id: string;
  names: Names;
  image_path: string;
  gif_path: string;
  instruction_steps: { en?: string[]; es?: string[] };
  equipment?: { equipment: { id: string; names: Names } }[];
};

// One bout of work followed by a rest: the atom of a prescription (see docs/programming-model.md).
export type Side = 'both' | 'left' | 'right' | 'each' | 'alternating';
export type PrescribedSet = {
  id: string;
  set_number: number;
  kind: 'warmup' | 'working' | 'backoff' | 'drop' | 'amrap';
  reps_min: number | null;
  reps_max: number | null;
  duration_seconds: number | null;
  reps_per_side: boolean;
  load_kg: number | null;
  load_percent_1rm: number | null;
  rpe: number | null;
  tempo: string | null;
  rest_seconds: number;
  side: Side;
  other_side: 'rest' | 'hold' | 'work' | null;
  variant_id: string | null;          // per-set override: wide grip, then diamond
  variant: Variant | null;
  notes: Names;
};

export type Item = {
  id: string;
  position: number;
  notes: Names;
  exercise_id: string;
  variant: Variant | null;            // what this item became at this location
  substitution_level: number | null;  // 1, 2 or 3 when the resolver had to substitute
  substitution_note: { status?: string; basis?: string; load_warning?: { needs_kg: number; available_kg: number } };
  sets: PrescribedSet[];
};

// An ordered group of items sharing one execution rule: straight (all the sets of item 1, then
// item 2) or rounds (one set of each, repeat — a superset is two items, a circuit is more).
export type Block = {
  id: string;
  position: number;
  purpose: 'warmup' | 'main' | 'accessory' | 'finisher' | 'cooldown';
  mode: 'straight' | 'rounds';
  rounds: number | null;
  names: Names;
  notes: Names;
  rest_between_items_s: number;
  rest_between_rounds_s: number;
  rest_after_s: number;
  params: Record<string, unknown>;
  items: Item[];
};

export type Workout = {
  id: string;
  names: Names;
  notes: Names;
  position: number;
  program: { id: string; names: Names; track_mode: 'full' | 'completion' | 'none' } | null;
  blocks: Block[];
};

// A workout in progress, kept on the device so a reload or a dropped connection loses nothing.
// Entries are keyed by the prescribed set they answer, which is also how they are saved.
export type SetEntry = { reps: string; weight: string; done: boolean };
export type ActiveSession = {
  userId: string;
  workoutId: string;
  workoutNames: Names;
  assignmentId: string | null;
  startedAt: string;
  current: number;                    // which step of the workout
  sets: Record<string, SetEntry>;     // by prescribed set id
  swaps?: Record<string, Variant>;    // by item id: the substitute the athlete is doing instead
  restUntil: number | null;
};

// What a variation works, one row per muscle, with where the claim came from
// (docs/patterns-and-emphasis.md): stated -> inferred -> exercise -> generalised.
export type MuscleRow = {
  muscle_id: string;
  role: 'target' | 'secondary';
  detail_level: 'stated' | 'inferred' | 'exercise' | 'generalised';
  notes: Names | null;
  muscle: { names: Names; common_names: Names } | null;
};

// One substitute, as substitutes_for_variant() returns it.
export type Substitute = {
  level: 1 | 2 | 3;
  variant_id: string;
  exercise_id: string;
  names: Names;
  equipment_ids: string[];
  basis: 'equipment' | 'attributes' | 'pattern' | 'muscle' | 'region';
  score: number;
  changes: {
    dimension: string;
    dimension_names: Names;
    from: string | null; from_names: Names | null;
    to: string | null; to_names: Names | null;
  }[];
  muscle_delta: { added?: string[]; dropped?: string[]; promoted?: string[]; demoted?: string[] };
  notes: (Names & { muscle_id?: string | null })[];   // a rule's own sentence, and what it is about
  image_path?: string;
  muscles?: MuscleRow[];
};

export type ExerciseDetail = {
  variant: Variant & { exercise: { id: string; names: Names; type: string; movement_pattern: string | null } | null };
  muscles: MuscleRow[];
  substitutes: Substitute[];
  equipment: { id: string; names: Names }[];
  mine: string[];
};

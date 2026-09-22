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

export type Item = {
  id: string;
  position: number;
  sets: number;
  reps: string;
  weight_kg: number | null;
  rest_seconds: number;
  notes: Names;
  variant: Variant;
};

export type Workout = {
  id: string;
  names: Names;
  notes: Names;
  position: number;
  program: { id: string; names: Names } | null;
  items: Item[];
};

// A workout in progress, kept on the device so a reload or a dropped connection loses nothing.
export type SetEntry = { reps: string; weight: string; done: boolean };
export type ActiveSession = {
  userId: string;
  workoutId: string;
  workoutNames: Names;
  assignmentId: string | null;
  startedAt: string;
  current: number;
  sets: Record<string, SetEntry[]>;   // by item id
  swaps?: Record<string, Variant>;    // by item id: the substitute the athlete is doing instead
  restUntil: number | null;
};

// What a variation works, one row per muscle, with where the claim came from (see
// docs/patterns-and-emphasis.md): stated -> inferred -> exercise -> generalised.
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
  // filled in from a second query: the picture, and what each option works
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

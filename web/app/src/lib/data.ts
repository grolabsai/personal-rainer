import { supabase } from './supabase';
import type { ActiveSession, ExerciseDetail, MuscleRow, Substitute, Workout } from './types';

const VARIANT = 'id, exercise_id, names, image_path, gif_path, instruction_steps, equipment:variant_equipment(equipment:equipment(id, names))';

export async function loadWorkout(id: string): Promise<Workout | null> {
  const { data, error } = await supabase
    .from('program_workouts')
    .select(`id, names, notes, position, program:programs(id, names),
             items:program_workout_items(id, position, sets, reps, weight_kg, rest_seconds, notes, variant:exercise_variants(${VARIANT}))`)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const w = data as unknown as Workout;
  w.items.sort((a, b) => a.position - b.position);
  return w;
}

export async function loadHome() {
  const [assignments, templates] = await Promise.all([
    supabase.from('assignments')
      .select('id, scheduled_for, status, workout:program_workouts(id, names, program:programs(names), items:program_workout_items(count))')
      .eq('status', 'assigned')
      .order('scheduled_for', { ascending: true, nullsFirst: false }),
    supabase.from('programs')
      .select('id, names, descriptions, workouts:program_workouts(id, names, position, items:program_workout_items(count))')
      .eq('is_template', true)
      .order('created_at'),
  ]);
  if (assignments.error) throw assignments.error;
  if (templates.error) throw templates.error;
  return { assignments: assignments.data as unknown as AssignmentRow[], templates: templates.data as unknown as ProgramRow[] };
}

export async function loadProgram(id: string) {
  const { data, error } = await supabase
    .from('programs')
    .select('id, names, descriptions, workouts:program_workouts(id, names, position, items:program_workout_items(count))')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as ProgramRow | null;
}

export async function loadHistory() {
  const { data, error } = await supabase
    .from('workout_sessions')
    .select('id, started_at, finished_at, duration_seconds, workout:program_workouts(names), sets:session_sets(reps, weight_kg, completed)')
    .order('finished_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data as unknown as SessionRow[];
}

export async function loadSession(id: string) {
  const { data, error } = await supabase
    .from('workout_sessions')
    .select('id, started_at, finished_at, duration_seconds, workout:program_workouts(names), sets:session_sets(reps, weight_kg, completed)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as SessionRow | null;
}

const num = (s: string) => { const n = parseFloat(s.replace(',', '.')); return Number.isFinite(n) ? n : null; };

// Saves the session and every planned set (done or not), then marks the assignment complete.
export async function saveSession(active: ActiveSession, workout: Workout): Promise<string> {
  const finished = new Date();
  const started = new Date(active.startedAt);
  const { data: session, error } = await supabase.from('workout_sessions').insert({
    athlete_id: active.userId,
    workout_id: active.workoutId,
    assignment_id: active.assignmentId,
    started_at: started.toISOString(),
    finished_at: finished.toISOString(),
    duration_seconds: Math.max(0, Math.round((finished.getTime() - started.getTime()) / 1000)),
  }).select('id').single();
  if (error) throw error;
  const rows = workout.items.flatMap(item => (active.sets[item.id] || []).map((s, i) => ({
    session_id: session.id,
    item_id: item.id,
    variant_id: (active.swaps?.[item.id] || item.variant).id,
    set_number: i + 1,
    reps: s.reps ? Math.round(num(s.reps) ?? 0) : null,
    weight_kg: s.weight ? num(s.weight) : null,
    completed: s.done,
  })));
  if (rows.length) {
    const { error: e2 } = await supabase.from('session_sets').insert(rows);
    if (e2) throw e2;
  }
  if (active.assignmentId) {
    const { error: e3 } = await supabase.rpc('complete_assignment', { p_assignment: active.assignmentId });
    if (e3) throw e3;
  }
  return session.id;
}

export type AssignmentRow = {
  id: string; scheduled_for: string | null; status: string;
  workout: { id: string; names: { en?: string; es?: string }; program: { names: { en?: string; es?: string } } | null; items: { count: number }[] } | null;
};
export type ProgramRow = {
  id: string; names: { en?: string; es?: string }; descriptions: { en?: string; es?: string };
  workouts: { id: string; names: { en?: string; es?: string }; position: number; items: { count: number }[] }[];
};
export type SessionRow = {
  id: string; started_at: string; finished_at: string; duration_seconds: number;
  workout: { names: { en?: string; es?: string } } | null;
  sets: { reps: number | null; weight_kg: number | null; completed: boolean }[];
};

// Redundant rows are the same claim less precisely ("chest" beside "upper chest"): the athlete
// sees the precise one, so they are left in the database and out of these screens.
const MUSCLE_ROWS = 'variant_id, muscle_id, role, detail_level, notes, muscle:muscles(names, common_names)';

// The exercise detail screen: what this variation is, what it works, and what can replace it.
// The substitutes come from the database (levels 1-3, see docs/substitutions.md); only the picture
// and the muscles of each option need a second round trip.
export async function loadExerciseDetail(variantId: string): Promise<ExerciseDetail | null> {
  const { data: { user } } = await supabase.auth.getUser();
  const [variant, muscles, equipment, mine] = await Promise.all([
    supabase.from('exercise_variants')
      .select(`${VARIANT}, exercise:exercises(id, names, type, movement_pattern)`)
      .eq('id', variantId).maybeSingle(),
    supabase.from('variant_muscles_resolved').select(MUSCLE_ROWS).eq('variant_id', variantId).eq('redundant', false),
    supabase.from('equipment').select('id, names').order('sort_order'),
    user ? supabase.from('athlete_equipment').select('equipment_id').eq('athlete_id', user.id)
         : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [variant, muscles, equipment, mine]) if (r.error) throw r.error;
  if (!variant.data) return null;

  const have = (mine.data as { equipment_id: string }[]).map(r => r.equipment_id);
  return {
    variant: variant.data as unknown as ExerciseDetail['variant'],
    muscles: muscles.data as unknown as MuscleRow[],
    equipment: equipment.data as unknown as ExerciseDetail['equipment'],
    mine: have,
    substitutes: await loadSubstitutes(variantId, have),
  };
}

// An empty equipment list means "unknown", so everything is offered rather than nothing.
export async function loadSubstitutes(variantId: string, mine: string[]): Promise<Substitute[]> {
  const { data, error } = await supabase.rpc('substitutes_for_variant', {
    p_variant: variantId,
    p_equipment: mine.length ? mine : null,
    p_per_level: 5,
  });
  if (error) throw error;
  const subs = (data || []) as Substitute[];
  if (!subs.length) return subs;

  const ids = subs.map(s => s.variant_id);
  const [pics, muscles] = await Promise.all([
    supabase.from('exercise_variants').select('id, image_path').in('id', ids),
    supabase.from('variant_muscles_resolved').select(MUSCLE_ROWS).in('variant_id', ids).eq('redundant', false),
  ]);
  if (pics.error) throw pics.error;
  if (muscles.error) throw muscles.error;
  const pic = new Map((pics.data as { id: string; image_path: string }[]).map(r => [r.id, r.image_path]));
  const rows = muscles.data as unknown as (MuscleRow & { variant_id: string })[];
  return subs.map(s => ({
    ...s,
    image_path: pic.get(s.variant_id),
    muscles: rows.filter(r => r.variant_id === s.variant_id),
  }));
}

export async function saveMyEquipment(userId: string, ids: string[]) {
  const { error } = await supabase.from('athlete_equipment').delete().eq('athlete_id', userId);
  if (error) throw error;
  if (!ids.length) return;
  const { error: e2 } = await supabase.from('athlete_equipment')
    .insert(ids.map(equipment_id => ({ athlete_id: userId, equipment_id })));
  if (e2) throw e2;
}

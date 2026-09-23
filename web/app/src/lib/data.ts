import { supabase } from './supabase';
import type { ActiveSession, ExerciseDetail, MuscleRow, Substitute, Workout } from './types';

const VARIANT = 'id, exercise_id, names, image_path, gif_path, instruction_steps, equipment:variant_equipment(equipment:equipment(id, names))';

export async function loadWorkout(id: string): Promise<Workout | null> {
  const { data, error } = await supabase
    .from('program_workouts')
    .select(`id, names, notes, position, program:programs(id, names, track_mode),
             blocks:workout_blocks(id, position, purpose, mode, rounds, names, notes,
               rest_between_items_s, rest_between_rounds_s, rest_after_s, params,
               items:program_workout_items(id, position, notes, exercise_id, substitution_level, substitution_note,
                 variant:exercise_variants!program_workout_items_variant_id_fkey(${VARIANT}),
                 sets:item_sets(id, set_number, kind, reps_min, reps_max, duration_seconds, reps_per_side,
                   load_kg, load_percent_1rm, rpe, tempo, rest_seconds, side, other_side, notes, variant_id,
                   variant:exercise_variants!item_sets_variant_id_fkey(${VARIANT}))))`)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const w = data as unknown as Workout;
  w.blocks.sort((a, b) => a.position - b.position);
  for (const block of w.blocks) {
    block.items.sort((a, b) => a.position - b.position);
    for (const item of block.items) item.sets.sort((a, b) => a.set_number - b.set_number);
  }
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
    .select('id, started_at, finished_at, duration_seconds, workout:program_workouts(names), sets:session_sets(reps, weight_kg, status)')
    .order('finished_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data as unknown as SessionRow[];
}

export async function loadSession(id: string) {
  const { data, error } = await supabase
    .from('workout_sessions')
    .select('id, started_at, finished_at, duration_seconds, workout:program_workouts(names), sets:session_sets(reps, weight_kg, status)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as SessionRow | null;
}

const num = (s: string) => { const n = parseFloat(s.replace(',', '.')); return Number.isFinite(n) ? n : null; };

// Saves the session and every prescribed set, whether it was done or not, then marks the
// assignment complete. Each row points at the set it answers, and carries the variation actually
// performed — so a swap or a missed set is a comparison, not a hole in the history.
export async function saveSession(active: ActiveSession, workout: Workout): Promise<string> {
  const finished = new Date();
  const started = new Date(active.startedAt);
  const track = workout.program?.track_mode || 'full';
  const { data: session, error } = await supabase.from('workout_sessions').insert({
    athlete_id: active.userId,
    workout_id: active.workoutId,
    assignment_id: active.assignmentId,
    started_at: started.toISOString(),
    finished_at: finished.toISOString(),
    duration_seconds: Math.max(0, Math.round((finished.getTime() - started.getTime()) / 1000)),
    track_mode: track,
  }).select('id').single();
  if (error) throw error;

  if (track !== 'none') {
    const rows = workout.blocks.flatMap(block => block.items.flatMap(item => item.sets.map(set => {
      const entry = active.sets[set.id];
      const variant = active.swaps?.[item.id] || set.variant || item.variant;
      return {
        session_id: session.id,
        item_id: item.id,
        prescribed_set_id: set.id,
        variant_id: variant?.id ?? null,
        set_number: set.set_number,
        round_number: block.mode === 'rounds' ? set.set_number : null,
        reps: track === 'full' && entry?.reps ? Math.round(num(entry.reps) ?? 0) : null,
        weight_kg: track === 'full' && entry?.weight ? num(entry.weight) : null,
        status: entry?.done ? 'done' : 'skipped',
        deviation_reason: active.swaps?.[item.id] ? 'equipment' : null,
      };
    })));
    const usable = rows.filter(r => r.variant_id);
    if (usable.length) {
      const { error: e2 } = await supabase.from('session_sets').insert(usable);
      if (e2) throw e2;
    }
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
  sets: { reps: number | null; weight_kg: number | null; status: string }[];
};

// Redundant rows are the same claim less precisely ("chest" beside "upper chest"): the athlete
// sees the precise one, so they are left in the database and out of these screens.
const MUSCLE_ROWS = 'variant_id, muscle_id, role, emphasis, detail_level, notes, muscle:muscles(names, common_names)';

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

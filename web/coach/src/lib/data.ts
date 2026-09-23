import { supabase } from './supabase';
import type { Names } from './i18n';

// ---------- shapes the coach screens read ----------
export type Athlete = { athlete_id: string; profile: { display_name: string | null; avatar_url: string | null } | null };
export type Place = {
  id: string; owner_id: string | null; visibility: 'private' | 'public'; names: Names;
  kind: string; city: string | null; source_location_id: string | null;
  kit: { equipment_id: string; rank: number; max_load_kg: number | null }[];
};
export type Equipment = { id: string; names: Names; sort_order: number };
export type ProgramRow = {
  id: string; names: Names; descriptions: Names; is_template: boolean; visibility: string;
  athlete_id: string | null; location_id: string | null; schedule_mode: 'weekly' | 'dated' | 'sequence';
  cycle_weeks: number; track_mode: 'full' | 'completion' | 'none';
  goal: string | null; level: string | null; days_per_week: number | null; tags: string[];
  workouts: { id: string; names: Names; position: number; day_of_week: number | null; week_in_cycle: number }[];
};
export type EditorSet = {
  id: string; set_number: number; kind: string;
  reps_min: number | null; reps_max: number | null; duration_seconds: number | null;
  reps_per_side: boolean; load_kg: number | null; load_percent_1rm: number | null; rpe: number | null;
  tempo: string | null; rest_seconds: number; side: string; other_side: string | null;
  variant_id: string | null; notes: Names;
};
export type EditorItem = {
  id: string; position: number; exercise_id: string; variant_id: string | null; variant_locked: boolean;
  substitution_level: number | null;
  substitution_note: { status?: string; load_warning?: { needs_kg: number; available_kg: number } };
  notes: Names;
  exercise: { id: string; names: Names; type: string } | null;
  variant: { id: string; names: Names; image_path: string } | null;
  attributes: { dimension_id: string; value: string }[];
  sets: EditorSet[];
};
export type EditorBlock = {
  id: string; position: number; purpose: string; mode: 'straight' | 'rounds'; rounds: number | null;
  names: Names; notes: Names; rest_between_items_s: number; rest_between_rounds_s: number;
  rest_after_s: number; params: Record<string, unknown>; items: EditorItem[];
};
export type EditorWorkout = {
  id: string; program_id: string; position: number; names: Names; notes: Names;
  day_of_week: number | null; week_in_cycle: number; scheduled_for: string | null; blocks: EditorBlock[];
};

// ---------- who am I ----------
export async function loadMe() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('id, display_name, role').eq('id', user.id).maybeSingle();
  return { id: user.id, email: user.email ?? '', ...(data || {}) } as
    { id: string; email: string; display_name?: string | null; role?: string };
}

// ---------- athletes ----------
export async function loadAthletes() {
  const { data, error } = await supabase
    .from('coach_athletes')
    .select('athlete_id, profile:profiles(display_name, avatar_url)')
    .order('created_at');
  if (error) throw error;
  return data as unknown as Athlete[];
}

export async function addAthlete(email: string) {
  const { error } = await supabase.rpc('link_athlete_by_email', { p_email: email });
  if (error) throw error;
}

// ---------- places ----------
const PLACE = `id, owner_id, visibility, names, kind, city, source_location_id,
               kit:location_equipment(equipment_id, rank, max_load_kg)`;

export async function loadPlaces() {
  const [places, equipment] = await Promise.all([
    supabase.from('locations').select(PLACE).order('created_at'),
    supabase.from('equipment').select('id, names, sort_order').order('sort_order'),
  ]);
  if (places.error) throw places.error;
  if (equipment.error) throw equipment.error;
  const list = places.data as unknown as Place[];
  for (const p of list) p.kit.sort((a, b) => a.rank - b.rank);
  return { places: list, equipment: equipment.data as unknown as Equipment[] };
}

export async function savePlace(place: Partial<Place> & { owner_id: string }, kit: Place['kit']) {
  let id = place.id;
  if (id) {
    const { error } = await supabase.from('locations')
      .update({ names: place.names, kind: place.kind, city: place.city }).eq('id', id);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from('locations').insert({
      owner_id: place.owner_id, visibility: 'private', names: place.names,
      kind: place.kind, city: place.city, created_by: place.owner_id,
    }).select('id').single();
    if (error) throw error;
    id = data.id;
    await supabase.from('user_locations').insert({ user_id: place.owner_id, location_id: id });
  }
  // The kit is small and edited as a whole; replacing it keeps rank contiguous with no shuffling.
  const { error: del } = await supabase.from('location_equipment').delete().eq('location_id', id);
  if (del) throw del;
  if (kit.length) {
    const { error } = await supabase.from('location_equipment')
      .insert(kit.map((k, i) => ({ location_id: id, equipment_id: k.equipment_id, rank: i, max_load_kg: k.max_load_kg })));
    if (error) throw error;
  }
  return id!;
}

export const adoptPlace = async (source: string) => {
  const { data, error } = await supabase.rpc('fork_location', { p_source: source });
  if (error) throw error;
  return data as string;
};

// ---------- library ----------
const PROGRAM = `id, names, descriptions, is_template, visibility, athlete_id, location_id,
                 schedule_mode, cycle_weeks, track_mode, goal, level, days_per_week, tags,
                 workouts:program_workouts(id, names, position, day_of_week, week_in_cycle)`;

export async function loadLibrary() {
  const { data, error } = await supabase.from('programs').select(PROGRAM).order('created_at', { ascending: false });
  if (error) throw error;
  const rows = data as unknown as ProgramRow[];
  for (const p of rows) p.workouts.sort((a, b) => a.position - b.position);
  return rows;
}

export async function createTemplate(coachId: string, names: Names) {
  const { data, error } = await supabase.from('programs').insert({
    coach_id: coachId, is_template: true, visibility: 'private', names, schedule_mode: 'weekly',
  }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export const updateProgram = async (id: string, patch: Record<string, unknown>) => {
  const { error } = await supabase.from('programs').update(patch).eq('id', id);
  if (error) throw error;
};
export const deleteProgram = async (id: string) => {
  const { error } = await supabase.from('programs').delete().eq('id', id);
  if (error) throw error;
};

// ---------- the editor ----------
const WORKOUT = `id, program_id, position, names, notes, day_of_week, week_in_cycle, scheduled_for,
  blocks:workout_blocks(id, position, purpose, mode, rounds, names, notes,
    rest_between_items_s, rest_between_rounds_s, rest_after_s, params,
    items:program_workout_items(id, position, exercise_id, variant_id, variant_locked, notes,
      substitution_level, substitution_note,
      exercise:exercises(id, names, type),
      variant:exercise_variants!program_workout_items_variant_id_fkey(id, names, image_path),
      attributes:item_attributes(dimension_id, value),
      sets:item_sets(id, set_number, kind, reps_min, reps_max, duration_seconds, reps_per_side,
        load_kg, load_percent_1rm, rpe, tempo, rest_seconds, side, other_side, variant_id, notes)))`;

export async function loadWorkout(id: string) {
  const { data, error } = await supabase.from('program_workouts').select(WORKOUT).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const w = data as unknown as EditorWorkout;
  w.blocks.sort((a, b) => a.position - b.position);
  for (const b of w.blocks) {
    b.items.sort((a, c) => a.position - c.position);
    for (const i of b.items) i.sets.sort((a, c) => a.set_number - c.set_number);
  }
  return w;
}

export async function addWorkout(programId: string, names: Names, dayOfWeek: number | null, position: number) {
  const { data, error } = await supabase.from('program_workouts')
    .insert({ program_id: programId, position, names, day_of_week: dayOfWeek })
    .select('id').single();
  if (error) throw error;
  return data.id as string;
}

export const updateWorkout = async (id: string, patch: Record<string, unknown>) => {
  const { error } = await supabase.from('program_workouts').update(patch).eq('id', id);
  if (error) throw error;
};
export const deleteRow = async (table: string, id: string) => {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
};

export async function copyWorkout(source: string, program: string, day: number | null, position: number) {
  const { data, error } = await supabase.rpc('copy_workout', {
    p_source: source, p_into_program: program, p_position: position, p_day_of_week: day,
  });
  if (error) throw error;
  return data as string;
}

export async function addBlock(workoutId: string, position: number) {
  const { data, error } = await supabase.from('workout_blocks')
    .insert({ workout_id: workoutId, position, purpose: 'main', mode: 'straight' })
    .select('id').single();
  if (error) throw error;
  return data.id as string;
}
export const updateBlock = async (id: string, patch: Record<string, unknown>) => {
  const { error } = await supabase.from('workout_blocks').update(patch).eq('id', id);
  if (error) throw error;
};

export async function addItem(workoutId: string, blockId: string, exerciseId: string, position: number) {
  const { data, error } = await supabase.from('program_workout_items')
    .insert({ workout_id: workoutId, block_id: blockId, position, exercise_id: exerciseId })
    .select('id').single();
  if (error) throw error;
  // A new exercise starts with three working sets of ten: the common case, edited from there.
  const { error: e2 } = await supabase.from('item_sets').insert([1, 2, 3].map(n => ({
    item_id: data.id, set_number: n, reps_min: 10, rest_seconds: 90,
  })));
  if (e2) throw e2;
  return data.id as string;
}
export const updateItem = async (id: string, patch: Record<string, unknown>) => {
  const { error } = await supabase.from('program_workout_items').update(patch).eq('id', id);
  if (error) throw error;
};

export async function addSet(itemId: string, from: EditorSet | undefined, setNumber: number) {
  const base = from
    ? { kind: from.kind, reps_min: from.reps_min, reps_max: from.reps_max, duration_seconds: from.duration_seconds,
        reps_per_side: from.reps_per_side, load_kg: from.load_kg, rest_seconds: from.rest_seconds,
        side: from.side, other_side: from.other_side, variant_id: from.variant_id }
    : { reps_min: 10, rest_seconds: 90 };
  const { error } = await supabase.from('item_sets').insert({ item_id: itemId, set_number: setNumber, ...base });
  if (error) throw error;
}
export const updateSet = async (id: string, patch: Record<string, unknown>) => {
  const { error } = await supabase.from('item_sets').update(patch).eq('id', id);
  if (error) throw error;
};

// ---------- the catalog, for picking exercises ----------
export async function searchExercises(term: string) {
  const q = supabase.from('exercises')
    .select('id, names, type, movement_pattern, primary_muscle_id')
    .order('is_canonical', { ascending: false }).limit(40);
  const { data, error } = term.trim()
    ? await q.or(`names->>en.ilike.%${term}%,names->>es.ilike.%${term}%,id.ilike.%${term}%`)
    : await q;
  if (error) throw error;
  return data as unknown as { id: string; names: Names; type: string; movement_pattern: string | null }[];
}

export async function loadDimensions() {
  const [dims, vals] = await Promise.all([
    supabase.from('variation_dimensions').select('id, names, sort_order').order('sort_order'),
    supabase.from('variation_values').select('dimension_id, value, names, sort_order').order('sort_order'),
  ]);
  if (dims.error) throw dims.error;
  if (vals.error) throw vals.error;
  return {
    dimensions: dims.data as unknown as { id: string; names: Names }[],
    values: vals.data as unknown as { dimension_id: string; value: string; names: Names }[],
  };
}

export const setItemAttribute = async (itemId: string, dimensionId: string, value: string | null) => {
  if (!value) {
    const { error } = await supabase.from('item_attributes').delete()
      .eq('item_id', itemId).eq('dimension_id', dimensionId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('item_attributes')
    .upsert({ item_id: itemId, dimension_id: dimensionId, value }, { onConflict: 'item_id,dimension_id' });
  if (error) throw error;
};

// ---------- assigning ----------
export async function assignProgram(program: string, athlete: string, location: string, start: string) {
  const { data, error } = await supabase.rpc('assign_program', {
    p_program: program, p_athlete: athlete, p_location: location, p_start: start,
  });
  if (error) throw error;
  return data as string;
}

export async function loadEnrollments() {
  const { data, error } = await supabase
    .from('program_enrollments')
    .select(`id, start_date, status, athlete_id,
             program:programs(id, names), location:locations(id, names),
             athlete:profiles!program_enrollments_athlete_id_fkey(display_name),
             assignments:assignments(count)`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as unknown as {
    id: string; start_date: string; status: string; athlete_id: string;
    program: { id: string; names: Names } | null; location: { id: string; names: Names } | null;
    athlete: { display_name: string | null } | null; assignments: { count: number }[];
  }[];
}

export async function loadPlanSummary(programId: string) {
  const { data, error } = await supabase
    .from('program_workout_items')
    .select(`id, position, substitution_level, substitution_note, exercise_id,
             variant:exercise_variants!program_workout_items_variant_id_fkey(id, names),
             block:workout_blocks!inner(position, purpose, workout:program_workouts!inner(id, names, program_id))`)
    .eq('block.workout.program_id', programId)
    .order('position');
  if (error) throw error;
  return data as unknown as {
    id: string; position: number; substitution_level: number | null;
    substitution_note: { status?: string; load_warning?: { needs_kg: number; available_kg: number } };
    exercise_id: string; variant: { id: string; names: Names } | null;
    block: { position: number; purpose: string; workout: { id: string; names: Names } } | null;
  }[];
}

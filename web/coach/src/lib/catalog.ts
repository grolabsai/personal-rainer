import { supabase } from './supabase';
import type { Names } from './i18n';

// The catalog as the editor sees it: one card per exercise, with the picture of how it is usually
// done, and — per exercise — only the variation dimensions it actually has. Jump rope has none.

export type ExerciseCard = {
  exercise_id: string; names: Names; type: string; movement_pattern: string | null;
  region: string | null; muscle_group: string | null; is_canonical: boolean;
  variant_id: string; image_path: string; variations: number;
};

export type VariationOption = { dimension_id: string; value: string; variants: number };

export type VariantCard = {
  id: string; names: Names; image_path: string;
  attributes: { dimension_id: string; value: string }[];
  equipment: { equipment_id: string }[];
};

// The catalog does not change while the app is open, so both lists are fetched once.
let cards: Promise<ExerciseCard[]> | null = null;
export function loadExerciseCards(): Promise<ExerciseCard[]> {
  cards ??= (async () => {
    const { data, error } = await supabase.from('exercise_display')
      .select('exercise_id, names, type, movement_pattern, region, muscle_group, is_canonical, variant_id, image_path, variations')
      .order('is_canonical', { ascending: false });
    if (error) throw error;
    return data as unknown as ExerciseCard[];
  })();
  return cards;
}

let regions: Promise<{ id: string; names: Names }[]> | null = null;
export function loadRegions(): Promise<{ id: string; names: Names }[]> {
  regions ??= (async () => {
    const { data, error } = await supabase.from('muscles')
      .select('id, names, sort_order').eq('level', 'region').order('sort_order');
    if (error) throw error;
    return data as unknown as { id: string; names: Names }[];
  })();
  return regions;
}

export async function loadVariationOptions(exerciseId: string) {
  const { data, error } = await supabase.from('exercise_variation_options')
    .select('dimension_id, value, variants').eq('exercise_id', exerciseId);
  if (error) throw error;
  return data as unknown as VariationOption[];
}

export async function loadVariants(exerciseId: string) {
  const { data, error } = await supabase.from('exercise_variants')
    .select('id, names, image_path, attributes:variant_attributes(dimension_id, value), equipment:variant_equipment(equipment_id)')
    .eq('exercise_id', exerciseId).is('duplicate_of', null).order('id');
  if (error) throw error;
  return data as unknown as VariantCard[];
}

// Which equipment each exercise can be done with, for the navigator's third filter and for the
// "equipment first" row in a block. One fetch, kept for the session.
let kit: Promise<Map<string, string[]>> | null = null;
export function loadEquipmentByExercise(): Promise<Map<string, string[]>> {
  kit ??= (async () => {
    const { data, error } = await supabase.from('exercise_equipment_options')
      .select('exercise_id, equipment_id, variations').order('variations', { ascending: false });
    if (error) throw error;
    const map = new Map<string, string[]>();
    for (const r of data as unknown as { exercise_id: string; equipment_id: string }[]) {
      const list = map.get(r.exercise_id) ?? [];
      list.push(r.equipment_id);
      map.set(r.exercise_id, list);
    }
    return map;
  })();
  return kit;
}

// The variation the catalog treats as typical — its attributes and kit are the defaults a coach
// sees, instead of a meaningless "any".
export async function loadTypical(exerciseId: string) {
  const { data, error } = await supabase.from('exercise_display')
    .select('variant_id, image_path, variations').eq('exercise_id', exerciseId).maybeSingle();
  if (error) throw error;
  return data as unknown as { variant_id: string; image_path: string; variations: number } | null;
}

// The equipment vocabulary is catalog data, not a coach's place, so it is public read.
let equipment: Promise<{ id: string; names: Names; sort_order: number }[]> | null = null;
export function loadEquipment() {
  equipment ??= (async () => {
    const { data, error } = await supabase.from('equipment').select('id, names, sort_order').order('sort_order');
    if (error) throw error;
    return data as unknown as { id: string; names: Names; sort_order: number }[];
  })();
  return equipment;
}

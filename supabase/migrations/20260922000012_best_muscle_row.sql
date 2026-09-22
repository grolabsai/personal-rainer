-- One row per muscle: the strongest role, and the most precise source that supports it.
-- Romanian deadlift states "hamstrings secondary" and the style rule infers "hamstrings primary";
-- the app should get one answer, not two.
create or replace function public.muscles_for_variant(p_variant text)
returns table (muscle_id text, role text, detail_level text, notes jsonb)
language sql stable set search_path = '' as $$
  with stated as (select * from public.variant_muscles where variant_id = p_variant),
  fallback_exercise as (
    select r.muscle_id, r.role, 'exercise'::text as detail_level, null::jsonb as notes
    from public.exercise_muscles_rolled r
    join public.exercise_variants v on v.exercise_id = r.exercise_id
    where v.id = p_variant and not exists (select 1 from stated)
  ),
  fallback_target as (
    select a.muscle_id, 'target'::text, 'generalised'::text, null::jsonb
    from public.exercise_variants v
    join public.exercises x on x.id = v.exercise_id
    join public.muscle_aliases a on a.term = x.primary_target_term
    where v.id = p_variant and a.muscle_id is not null
      and not exists (select 1 from stated) and not exists (select 1 from fallback_exercise)
  ),
  all_rows as (
    select muscle_id, role, detail_level, notes from stated
    union all select * from fallback_exercise
    union all select * from fallback_target
  )
  select distinct on (muscle_id) muscle_id, role, detail_level, notes
  from all_rows
  order by muscle_id,
           (role = 'target') desc,                                   -- primary beats secondary
           array_position(array['stated','inferred','exercise','generalised'], detail_level),
           notes nulls last;
$$;

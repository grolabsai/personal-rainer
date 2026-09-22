-- 16 of 1,282 variations had no substitute at all, for two reasons, both a dead end where the
-- principle says there should be a coarser answer:
--   a) six records (back lever, rope climb, London bridge…) state only secondary muscles, so they
--      had no target profile to compare. Secondary muscles are used when there is no target.
--   b) ten are the only exercise of their type to train that muscle group — the only cardio for the
--      chest, the only mobility drill for the wrists. Matching one level up, at the body region,
--      pairs them with each other. `basis = 'region'` says the match is that coarse.
alter table public.exercise_alternatives drop constraint exercise_alternatives_basis_check;
alter table public.exercise_alternatives
  add constraint exercise_alternatives_basis_check check (basis in ('pattern', 'muscle', 'region'));

create or replace function public.rebuild_exercise_alternatives() returns void
language sql set search_path = '' as $$
  with targets as (
    select distinct exercise_id, muscle_id from public.exercise_muscles_rolled where role = 'target'
  ),
  profile as (   -- what an exercise works: its targets, or its secondary muscles if it states none
    select * from targets
    union
    select r.exercise_id, r.muscle_id from public.exercise_muscles_rolled r
    where not exists (select 1 from targets t where t.exercise_id = r.exercise_id)
  ),
  levels as (
    select exercise_id,
           array_agg(distinct public.muscle_at_level(muscle_id, 'group')) as grps,
           array_agg(distinct public.muscle_at_level(muscle_id, 'region')) as regs
    from profile group by exercise_id
  ),
  pairs as (
    select a.id as exercise_id, b.id as alt_exercise_id,
           case when a.movement_pattern is not null and a.movement_pattern = b.movement_pattern
                then 'pattern' else 'muscle' end as basis,
           (a.mechanics is not distinct from b.mechanics) as same_mechanics,
           (a.primary_muscle_id is not null
            and a.primary_muscle_id is not distinct from b.primary_muscle_id) as shared_primary,
           cardinality(array(select unnest(la.grps) intersect select unnest(lb.grps)))::numeric as shared,
           cardinality(array(select unnest(la.grps) union select unnest(lb.grps)))::numeric as total
    from public.exercises a
    join public.exercises b on b.id <> a.id and b.type = a.type
    join levels la on la.exercise_id = a.id
    join levels lb on lb.exercise_id = b.id
    where a.movement_pattern is not null and a.movement_pattern = b.movement_pattern
       or array(select unnest(la.grps) intersect select unnest(lb.grps)) <> '{}'
    union all
    -- one level up, for the exercises that are alone in their muscle group
    select a.id, b.id, 'region',
           (a.mechanics is not distinct from b.mechanics),
           (a.primary_muscle_id is not null
            and a.primary_muscle_id is not distinct from b.primary_muscle_id),
           cardinality(array(select unnest(la.regs) intersect select unnest(lb.regs)))::numeric,
           cardinality(array(select unnest(la.regs) union select unnest(lb.regs)))::numeric
    from public.exercises a
    join public.exercises b on b.id <> a.id and b.type = a.type
    join levels la on la.exercise_id = a.id
    join levels lb on lb.exercise_id = b.id
    where array(select unnest(la.regs) intersect select unnest(lb.regs)) <> '{}'
  ),
  scored as (
    select exercise_id, alt_exercise_id, basis, same_mechanics, shared_primary,
           round(shared / nullif(total, 0), 3) as overlap,
           round(least(1, 0.45 * (shared / nullif(total, 0))
                        + case basis when 'pattern' then 0.30 when 'muscle' then 0.10 else 0 end
                        + case when shared_primary then 0.15 else 0 end
                        + case when same_mechanics then 0.10 else 0 end), 3) as score
    from pairs
    where shared > 0
  ),
  best as (   -- a pair matched twice keeps the stronger reason
    select distinct on (exercise_id, alt_exercise_id) *
    from scored
    order by exercise_id, alt_exercise_id,
             array_position(array['pattern','muscle','region'], basis), score desc
  ),
  ranked as (
    select *, row_number() over (partition by exercise_id
              order by array_position(array['pattern','muscle','region'], basis), score desc,
                       alt_exercise_id) as rn
    from best
  )
  insert into public.exercise_alternatives
  select exercise_id, alt_exercise_id, basis, same_mechanics, shared_primary, overlap, score
  from ranked where rn <= 8
  on conflict (exercise_id, alt_exercise_id) do update
    set basis = excluded.basis, same_mechanics = excluded.same_mechanics,
        shared_primary = excluded.shared_primary, overlap = excluded.overlap, score = excluded.score;
$$;

delete from public.exercise_alternatives;
select public.rebuild_exercise_alternatives();

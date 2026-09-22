-- Exercise substitution, in three levels, computed from the catalog itself.
--
--   1. Same exercise, other equipment  — identical attributes, a different kit.
--   2. Close variation                 — same exercise, one or two attributes changed.
--   3. Similar exercise                — a different exercise that trains the same pattern.
--
-- Levels 1 and 2 are answered live: they only look inside one exercise, so an edit to an
-- attribute or an emphasis rule shows up on the next screen. Level 3 compares every exercise
-- with every other one, so that part is precomputed into exercise_alternatives and rebuilt
-- on demand. Each row says what changes: the attributes, the muscles, and the sentence a rule
-- already carries in English and Spanish.

-- The muscle ladder, for every variation at once ------------------------------------------------
-- Same rungs as muscles_for_variant (stated -> inferred -> exercise -> generalised); as a view it
-- can be joined, which is what comparing two variations needs.
create view public.variant_muscles_best with (security_invoker = true) as
with base as (select * from public.variant_muscles),
have as (select distinct variant_id from base),
fallback_exercise as (
  select v.id as variant_id, r.muscle_id, r.role, 'exercise'::text as detail_level, null::jsonb as notes
  from public.exercise_variants v
  join public.exercise_muscles_rolled r on r.exercise_id = v.exercise_id
  where not exists (select 1 from have h where h.variant_id = v.id)
),
fallback_target as (
  select v.id as variant_id, a.muscle_id, 'target'::text as role, 'generalised'::text as detail_level, null::jsonb as notes
  from public.exercise_variants v
  join public.exercises x on x.id = v.exercise_id
  join public.muscle_aliases a on a.term = x.primary_target_term
  where a.muscle_id is not null
    and not exists (select 1 from have h where h.variant_id = v.id)
    and not exists (select 1 from fallback_exercise f where f.variant_id = v.id)
),
all_rows as (
  select variant_id, muscle_id, role, detail_level, notes from base
  union all select * from fallback_exercise
  union all select * from fallback_target
)
select distinct on (variant_id, muscle_id) variant_id, muscle_id, role, detail_level, notes
from all_rows
order by variant_id, muscle_id,
         (role = 'target') desc,
         array_position(array['stated','inferred','exercise','generalised'], detail_level),
         notes nulls last;

-- One definition of the ladder: the function now reads the view.
create or replace function public.muscles_for_variant(p_variant text)
returns table (muscle_id text, role text, detail_level text, notes jsonb)
language sql stable set search_path = '' as $$
  select muscle_id, role, detail_level, notes
  from public.variant_muscles_best where variant_id = p_variant;
$$;

-- What makes one variation different from another -----------------------------------------------
create view public.variant_fingerprint with (security_invoker = true) as
select v.id as variant_id, v.exercise_id, v.duplicate_of,
       coalesce(a.attrs, '{}') as attrs,              -- 'grip=neutral' ... sorted, for comparing
       coalesce(a.attr_map, '{}'::jsonb) as attr_map, -- {"grip": "neutral", ...}
       coalesce(array_length(a.attrs, 1), 0) as attr_count,
       coalesce(e.equipment_ids, '{}') as equipment_ids,
       coalesce(array_length(e.equipment_ids, 1), 0) as equipment_count
from public.exercise_variants v
left join (
  select variant_id,
         array_agg(dimension_id || '=' || value order by dimension_id, value) as attrs,
         jsonb_object_agg(dimension_id, value) as attr_map
  from public.variant_attributes group by variant_id
) a on a.variant_id = v.id
left join (
  select variant_id, array_agg(equipment_id order by equipment_id) as equipment_ids
  from public.variant_equipment group by variant_id
) e on e.variant_id = v.id;

-- Level 3: which exercises stand in for which ---------------------------------------------------
-- Precomputed because it is the only all-pairs comparison here. `basis` says on what grounds,
-- so the app can be honest: a drafted pattern is a better reason than a shared muscle group.
create table public.exercise_alternatives (
  exercise_id     text not null references public.exercises(id) on delete cascade,
  alt_exercise_id text not null references public.exercises(id) on delete cascade,
  basis           text not null check (basis in ('pattern', 'muscle')),
  same_mechanics  boolean not null,
  shared_primary  boolean not null,
  overlap         numeric(4,3) not null,   -- shared target muscle groups / all target muscle groups
  score           numeric(4,3) not null,
  primary key (exercise_id, alt_exercise_id)
);
create index exercise_alternatives_score on public.exercise_alternatives (exercise_id, score desc);
alter table public.exercise_alternatives enable row level security;
create policy "Catalog: public read" on public.exercise_alternatives for select to anon, authenticated using (true);

create function public.rebuild_exercise_alternatives() returns void
language sql set search_path = '' as $$
  with profile as (   -- the muscle groups an exercise targets, whatever level its rows are at
    select r.exercise_id, public.muscle_at_level(r.muscle_id, 'group') as grp
    from public.exercise_muscles_rolled r
    where r.role = 'target'
    group by 1, 2
  ),
  groups as (select exercise_id, array_agg(distinct grp) as grps from profile group by 1),
  pairs as (
    select a.id as exercise_id, b.id as alt_exercise_id,
           case when a.movement_pattern is not null and a.movement_pattern = b.movement_pattern
                then 'pattern' else 'muscle' end as basis,
           (a.mechanics is not distinct from b.mechanics) as same_mechanics,
           (a.primary_muscle_id is not null
            and a.primary_muscle_id is not distinct from b.primary_muscle_id) as shared_primary,
           cardinality(array(select unnest(ga.grps) intersect select unnest(gb.grps)))::numeric as shared,
           cardinality(array(select unnest(ga.grps) union select unnest(gb.grps)))::numeric as total
    from public.exercises a
    join public.exercises b on b.id <> a.id and b.type = a.type
    join groups ga on ga.exercise_id = a.id
    join groups gb on gb.exercise_id = b.id
    where a.movement_pattern is not null and a.movement_pattern = b.movement_pattern
       or public.muscle_at_level(a.primary_muscle_id, 'group')
          = public.muscle_at_level(b.primary_muscle_id, 'group')
  ),
  scored as (
    select exercise_id, alt_exercise_id, basis, same_mechanics, shared_primary,
           round(shared / nullif(total, 0), 3) as overlap,
           round(least(1, 0.45 * (shared / nullif(total, 0))
                        + case when basis = 'pattern' then 0.30 else 0 end
                        + case when shared_primary then 0.15 else 0 end
                        + case when same_mechanics then 0.10 else 0 end), 3) as score
    from pairs
    where shared > 0
  )
  insert into public.exercise_alternatives
  select exercise_id, alt_exercise_id, basis, same_mechanics, shared_primary, overlap, score
  from (select *, row_number() over (partition by exercise_id order by score desc, alt_exercise_id) as rn
        from scored) t
  where rn <= 8
  on conflict (exercise_id, alt_exercise_id) do update
    set basis = excluded.basis, same_mechanics = excluded.same_mechanics,
        shared_primary = excluded.shared_primary, overlap = excluded.overlap, score = excluded.score;
$$;
revoke execute on function public.rebuild_exercise_alternatives() from public, anon, authenticated;
select public.rebuild_exercise_alternatives();

-- What changes between two variations -----------------------------------------------------------
-- Attributes first (the trainer's language), then muscles (what the body map draws).
create function public.variant_attr_diff(p_from text, p_to text)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'dimension', d.id, 'dimension_names', d.names,
           'from', f.value, 'from_names', fv.names,
           'to', t.value, 'to_names', tv.names) order by d.sort_order), '[]'::jsonb)
  from (select dimension_id, value from public.variant_attributes where variant_id = p_from) f
  full join (select dimension_id, value from public.variant_attributes where variant_id = p_to) t
    on t.dimension_id = f.dimension_id
  join public.variation_dimensions d on d.id = coalesce(f.dimension_id, t.dimension_id)
  left join public.variation_values fv on fv.dimension_id = f.dimension_id and fv.value = f.value
  left join public.variation_values tv on tv.dimension_id = t.dimension_id and tv.value = t.value
  where f.value is distinct from t.value;
$$;

create function public.variant_muscle_diff(p_from text, p_to text)
returns jsonb language sql stable set search_path = '' as $$
  with f as (select muscle_id, role from public.variant_muscles_best where variant_id = p_from),
       t as (select muscle_id, role from public.variant_muscles_best where variant_id = p_to),
  d as (
    select coalesce(f.muscle_id, t.muscle_id) as muscle_id,
           case
             when f.muscle_id is null then 'added'
             when t.muscle_id is null then 'dropped'
             when f.role = 'secondary' and t.role = 'target' then 'promoted'
             when f.role = 'target' and t.role = 'secondary' then 'demoted'
           end as change
    from f full join t on t.muscle_id = f.muscle_id
  )
  select coalesce(jsonb_object_agg(change, ids), '{}'::jsonb)
  from (select change, jsonb_agg(m.id order by m.sort_order) as ids
        from d join public.muscles m on m.id = d.muscle_id
        where change is not null group by change) g;
$$;

-- The substitutes for one variation -------------------------------------------------------------
-- p_equipment null = show everything; an array = only what the athlete can actually do.
create function public.substitutes_for_variant(
  p_variant text, p_equipment text[] default null, p_per_level int default 5)
returns table (
  level smallint, variant_id text, exercise_id text, names jsonb,
  equipment_ids text[], basis text, score numeric,
  changes jsonb, muscle_delta jsonb, notes jsonb)
language sql stable set search_path = '' as $$
  with me as (select * from public.variant_fingerprint where variant_id = p_variant),
  -- level 3: one variation per alternative exercise, the plainest one the athlete can do
  alt as (
    select distinct on (a.alt_exercise_id)
           c.variant_id, c.exercise_id, c.equipment_ids, 3::smallint as level, a.basis, a.score
    from me
    join public.exercise_variants v on v.id = me.variant_id
    join public.exercise_alternatives a on a.exercise_id = v.exercise_id
    join public.variant_fingerprint c on c.exercise_id = a.alt_exercise_id and c.duplicate_of is null
    where p_equipment is null or c.equipment_ids <@ p_equipment
    order by a.alt_exercise_id, a.score desc, c.attr_count, c.equipment_count, c.variant_id
  ),
  candidate as (
    select c.variant_id, c.exercise_id, c.equipment_ids,
           case when c.attrs = me.attrs then 1 else 2 end::smallint as level,
           case when c.attrs = me.attrs then 'equipment' else 'attributes' end as basis,
           -- fewer differences and less kit first
           round(1.0 / (1 + cardinality(array(select unnest(c.attrs) except select unnest(me.attrs)))
                          + cardinality(array(select unnest(me.attrs) except select unnest(c.attrs)))
                          + 0.1 * c.equipment_count), 3) as score
    from public.variant_fingerprint c, me
    where c.exercise_id = me.exercise_id and c.variant_id <> me.variant_id and c.duplicate_of is null
      and (p_equipment is null or c.equipment_ids <@ p_equipment)
      and not (c.attrs = me.attrs and c.equipment_ids = me.equipment_ids)
    union all
    select variant_id, exercise_id, equipment_ids, level, basis, score from alt
  ),
  ranked as (
    select *, row_number() over (partition by level order by score desc, variant_id) as rn
    from candidate
  )
  select r.level, r.variant_id, r.exercise_id, v.names, r.equipment_ids, r.basis, r.score,
         case when r.level = 3 then '[]'::jsonb else public.variant_attr_diff(p_variant, r.variant_id) end,
         public.variant_muscle_diff(p_variant, r.variant_id),
         coalesce((select jsonb_agg(e.notes order by e.sort_order) from public.variant_emphasis e
                   where e.variant_id = r.variant_id
                     and not exists (select 1 from public.variant_emphasis o
                                     where o.variant_id = p_variant and o.rule_id = e.rule_id)), '[]'::jsonb)
  from ranked r join public.exercise_variants v on v.id = r.variant_id
  where r.rn <= p_per_level
  order by r.level, r.score desc, r.variant_id;
$$;

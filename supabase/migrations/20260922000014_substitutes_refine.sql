-- Three corrections to the substitute logic in 0013, each found by reading its output.
--
-- 1. The dataset tags the same claim at two levels ("chest" on one record, "pectorals" on another).
--    Diffing them produced a fake swap: chest added, pectorals dropped. Muscles related through the
--    tree are now the same claim, not a change.
-- 2. A named technique ("Inner", "Clock") lives in variant_label, not in the attributes, so two
--    variations with the same attributes and different labels looked identical. Level 1 now means
--    the same technique too, and a label change is reported like any other change.
-- 3. Level 3 offered "Push-up · Clock" where a plain push-up exists: a substitute should be the
--    ordinary version of the other exercise.

-- The label is part of what makes a variation different.
create or replace view public.variant_fingerprint with (security_invoker = true) as
select v.id as variant_id, v.exercise_id, v.duplicate_of,
       coalesce(a.attrs, '{}') as attrs,
       coalesce(a.attr_map, '{}'::jsonb) as attr_map,
       coalesce(array_length(a.attrs, 1), 0) as attr_count,
       coalesce(e.equipment_ids, '{}') as equipment_ids,
       coalesce(array_length(e.equipment_ids, 1), 0) as equipment_count,
       v.variant_label
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

-- A named technique, shaped like an attribute change so the UI has one thing to render.
create function public.label_change(p_from text, p_to text)
returns jsonb language sql immutable set search_path = '' as $$
  select case when p_from is not distinct from p_to then '[]'::jsonb else jsonb_build_array(
    jsonb_build_object(
      'dimension', 'technique',
      'dimension_names', jsonb_build_object('en', 'Technique', 'es', 'Técnica'),
      'from', p_from, 'to', p_to,
      'from_names', case when p_from is null then null
                        else jsonb_build_object('en', initcap(p_from), 'es', initcap(p_from)) end,
      'to_names',   case when p_to is null then null
                        else jsonb_build_object('en', initcap(p_to), 'es', initcap(p_to)) end))
  end;
$$;

create or replace function public.variant_muscle_diff(p_from text, p_to text)
returns jsonb language sql stable set search_path = '' as $$
  with f as (select muscle_id, role from public.variant_muscles_best where variant_id = p_from),
       t as (select muscle_id, role from public.variant_muscles_best where variant_id = p_to),
  related as (   -- one side says 'chest', the other 'pectorals': the same claim, not a change
    select f.muscle_id as f_id, t.muscle_id as t_id
    from f join t on exists (
      select 1 from public.muscle_paths p
      where (p.ancestor_id = f.muscle_id and p.descendant_id = t.muscle_id)
         or (p.ancestor_id = t.muscle_id and p.descendant_id = f.muscle_id))
  ),
  d as (
    select coalesce(f.muscle_id, t.muscle_id) as muscle_id,
           case
             when f.muscle_id is null then
               case when exists (select 1 from related r where r.t_id = t.muscle_id)
                    then null else 'added' end
             when t.muscle_id is null then
               case when exists (select 1 from related r where r.f_id = f.muscle_id)
                    then null else 'dropped' end
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

create or replace function public.substitutes_for_variant(
  p_variant text, p_equipment text[] default null, p_per_level int default 5)
returns table (
  level smallint, variant_id text, exercise_id text, names jsonb,
  equipment_ids text[], basis text, score numeric,
  changes jsonb, muscle_delta jsonb, notes jsonb)
language sql stable set search_path = '' as $$
  with me as (select * from public.variant_fingerprint where variant_id = p_variant),
  alt as (   -- one variation per alternative exercise: the plain version of it
    select distinct on (a.alt_exercise_id)
           c.variant_id, c.exercise_id, c.equipment_ids, 3::smallint as level, a.basis, a.score,
           c.variant_label
    from me
    join public.exercise_variants v on v.id = me.variant_id
    join public.exercise_alternatives a on a.exercise_id = v.exercise_id
    join public.variant_fingerprint c on c.exercise_id = a.alt_exercise_id and c.duplicate_of is null
    where p_equipment is null or c.equipment_ids <@ p_equipment
    order by a.alt_exercise_id, a.score desc,
             (c.variant_label is null) desc, c.attr_count, c.equipment_count, c.variant_id
  ),
  candidate as (
    select c.variant_id, c.exercise_id, c.equipment_ids,
           case when c.attrs = me.attrs and c.variant_label is not distinct from me.variant_label
                then 1 else 2 end::smallint as level,
           case when c.attrs = me.attrs and c.variant_label is not distinct from me.variant_label
                then 'equipment' else 'attributes' end as basis,
           round(1.0 / (1 + cardinality(array(select unnest(c.attrs) except select unnest(me.attrs)))
                          + cardinality(array(select unnest(me.attrs) except select unnest(c.attrs)))
                          + case when c.variant_label is not distinct from me.variant_label then 0 else 1 end
                          + 0.1 * c.equipment_count), 3) as score,
           c.variant_label
    from public.variant_fingerprint c, me
    where c.exercise_id = me.exercise_id and c.variant_id <> me.variant_id and c.duplicate_of is null
      and (p_equipment is null or c.equipment_ids <@ p_equipment)
      and not (c.attrs = me.attrs and c.equipment_ids = me.equipment_ids
               and c.variant_label is not distinct from me.variant_label)
    union all
    select variant_id, exercise_id, equipment_ids, level, basis, score, variant_label from alt
  ),
  ranked as (
    select *, row_number() over (partition by level order by score desc, variant_id) as rn
    from candidate
  )
  select r.level, r.variant_id, r.exercise_id, v.names, r.equipment_ids, r.basis, r.score,
         case when r.level = 3 then '[]'::jsonb
              else public.variant_attr_diff(p_variant, r.variant_id)
                   || public.label_change(me.variant_label, r.variant_label) end,
         public.variant_muscle_diff(p_variant, r.variant_id),
         coalesce((select jsonb_agg(e.notes order by e.sort_order) from public.variant_emphasis e
                   where e.variant_id = r.variant_id
                     and not exists (select 1 from public.variant_emphasis o
                                     where o.variant_id = p_variant and o.rule_id = e.rule_id)), '[]'::jsonb)
  from ranked r join public.exercise_variants v on v.id = r.variant_id, me
  where r.rn <= p_per_level
  order by r.level, r.score desc, r.variant_id;
$$;

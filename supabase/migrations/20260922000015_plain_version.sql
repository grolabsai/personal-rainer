-- A level 3 substitute should be the ordinary version of the other exercise. Ranking only by how
-- many pieces of kit it needs offered "Push-up — Bosu ball" over a plain push-up: both need one
-- item. equipment.sort_order already runs from ordinary (bodyweight, dumbbell, barbell) to exotic,
-- so the most ordinary kit wins the tie.
create or replace view public.variant_fingerprint with (security_invoker = true) as
select v.id as variant_id, v.exercise_id, v.duplicate_of,
       coalesce(a.attrs, '{}') as attrs,
       coalesce(a.attr_map, '{}'::jsonb) as attr_map,
       coalesce(array_length(a.attrs, 1), 0) as attr_count,
       coalesce(e.equipment_ids, '{}') as equipment_ids,
       coalesce(array_length(e.equipment_ids, 1), 0) as equipment_count,
       v.variant_label,
       coalesce(e.equipment_rank, 99) as equipment_rank   -- how exotic the most exotic item is
from public.exercise_variants v
left join (
  select variant_id,
         array_agg(dimension_id || '=' || value order by dimension_id, value) as attrs,
         jsonb_object_agg(dimension_id, value) as attr_map
  from public.variant_attributes group by variant_id
) a on a.variant_id = v.id
left join (
  select ve.variant_id, array_agg(ve.equipment_id order by ve.equipment_id) as equipment_ids,
         max(eq.sort_order) as equipment_rank
  from public.variant_equipment ve join public.equipment eq on eq.id = ve.equipment_id
  group by ve.variant_id
) e on e.variant_id = v.id;

create or replace function public.substitutes_for_variant(
  p_variant text, p_equipment text[] default null, p_per_level int default 5)
returns table (
  level smallint, variant_id text, exercise_id text, names jsonb,
  equipment_ids text[], basis text, score numeric,
  changes jsonb, muscle_delta jsonb, notes jsonb)
language sql stable set search_path = '' as $$
  with me as (select * from public.variant_fingerprint where variant_id = p_variant),
  alt as (   -- one variation per alternative exercise: its plain version
    select distinct on (a.alt_exercise_id)
           c.variant_id, c.exercise_id, c.equipment_ids, 3::smallint as level, a.basis, a.score,
           c.variant_label
    from me
    join public.exercise_variants v on v.id = me.variant_id
    join public.exercise_alternatives a on a.exercise_id = v.exercise_id
    join public.variant_fingerprint c on c.exercise_id = a.alt_exercise_id and c.duplicate_of is null
    where p_equipment is null or c.equipment_ids <@ p_equipment
    order by a.alt_exercise_id, a.score desc,
             (c.variant_label is null) desc, c.attr_count, c.equipment_count, c.equipment_rank,
             c.variant_id
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
                          + 0.1 * c.equipment_count + 0.005 * c.equipment_rank), 3) as score,
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

-- The list offered two identical rows: "Bench press · Flat — Dumbbell + Bench" twice (records 0289
-- and 1624), because the dataset holds both and neither is marked as a duplicate of the other.
-- A swap list is a list of choices, so rows that differ in nothing the athlete can see collapse
-- into one: same attributes, same technique, same kit — keep the lowest record id.
create or replace function public.substitutes_for_variant(
  p_variant text, p_equipment text[] default null, p_per_level int default 5)
returns table (
  level smallint, variant_id text, exercise_id text, names jsonb,
  equipment_ids text[], basis text, score numeric,
  changes jsonb, muscle_delta jsonb, notes jsonb)
language sql stable set search_path = '' as $$
  with me as (select * from public.variant_fingerprint where variant_id = p_variant),
  same_exercise as (   -- levels 1 and 2: one row per visible difference
    select distinct on (c.attrs, c.equipment_ids, c.variant_label)
           c.variant_id, c.exercise_id, c.equipment_ids,
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
    order by c.attrs, c.equipment_ids, c.variant_label, c.variant_id
  ),
  alt as (   -- level 3: one variation per alternative exercise, its plain version
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
  ranked as (
    select *, row_number() over (partition by level order by score desc, variant_id) as rn
    from (select * from same_exercise union all select * from alt) c
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

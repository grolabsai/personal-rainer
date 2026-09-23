-- Two things the editor needs from the catalog, and one distinction the library needs.
--
-- 1. Jump rope was offered a bench angle and a grip. A variation dimension only applies to an
--    exercise if the catalog actually holds variations of it along that dimension, and only the
--    values it holds — asking a coach to rule out nonsense is the wrong way round.
create view public.exercise_variation_options with (security_invoker = true) as
select v.exercise_id, va.dimension_id, va.value, count(*)::int as variants
from public.exercise_variants v
join public.variant_attributes va on va.variant_id = v.id
where v.duplicate_of is null
group by 1, 2, 3;

-- 2. A name alone is ambiguous ("row", "swing"), so every exercise needs a picture wherever it is
--    listed. The representative one is its plainest variation — the same rule the resolver uses.
create view public.exercise_display with (security_invoker = true) as
select distinct on (c.exercise_id)
       c.exercise_id, x.names, x.type, x.movement_pattern, x.mechanics, x.is_canonical,
       x.primary_muscle_id,
       public.muscle_at_level(x.primary_muscle_id, 'region') as region,
       public.muscle_at_level(x.primary_muscle_id, 'group')  as muscle_group,
       v.id as variant_id, v.image_path, v.gif_path,
       (select count(*)::int from public.exercise_variants w
        where w.exercise_id = c.exercise_id and w.duplicate_of is null) as variations
from public.variant_fingerprint c
join public.exercise_variants v on v.id = c.variant_id
join public.exercises x on x.id = c.exercise_id
where c.duplicate_of is null
order by c.exercise_id, c.attr_count, (c.variant_label is null) desc, c.equipment_rank, c.variant_id;

-- 3. A workout the coach builds on its own, to drag into a day later, is a template holding one
--    workout. It is the same thing as a programme in every other respect, so it is one column,
--    not a second set of tables — and copy_workout already knows how to drop it into a day.
alter table public.programs add column kind text not null default 'program'
  check (kind in ('program', 'workout'));

-- Refined a moment later: the picture for "Bench press" was a lever machine, because ranking by the
-- most ordinary kit reads the equipment list, where a bench sorts late. The picture should show how
-- the exercise is usually done, so among equally plain variations the most common kit for THAT
-- exercise wins: bench press becomes a dumbbell on a bench, push-up becomes a push-up.
create or replace view public.exercise_display with (security_invoker = true) as
with cand as (
  select c.*, (select count(*) from public.variant_fingerprint d
               where d.exercise_id = c.exercise_id and d.duplicate_of is null
                 and d.equipment_ids = c.equipment_ids) as same_kit
  from public.variant_fingerprint c where c.duplicate_of is null
)
select distinct on (cand.exercise_id)
       cand.exercise_id, x.names, x.type, x.movement_pattern, x.mechanics, x.is_canonical,
       x.primary_muscle_id,
       public.muscle_at_level(x.primary_muscle_id, 'region') as region,
       public.muscle_at_level(x.primary_muscle_id, 'group')  as muscle_group,
       v.id as variant_id, v.image_path, v.gif_path,
       (select count(*)::int from public.exercise_variants w
        where w.exercise_id = cand.exercise_id and w.duplicate_of is null) as variations
from cand
join public.exercise_variants v on v.id = cand.variant_id
join public.exercises x on x.id = cand.exercise_id
order by cand.exercise_id, cand.attr_count, (cand.variant_label is null) desc,
         cand.same_kit desc, cand.equipment_rank, cand.variant_id;

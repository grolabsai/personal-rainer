-- Exercise unification: every dataset record becomes a *variation* of one canonical *exercise*.
-- Muscle -> exercise -> variations (attributes x equipment). Design: docs/exercise-unification.md
-- The pre-unification catalog is backed up in supabase/backups/catalog-2026-09-21.json.

create type public.exercise_type as enum ('strength', 'stretch', 'mobility', 'cardio');

-- Dataset records are now variations.
alter table public.exercises rename to exercise_variants;
alter table public.exercise_muscles rename column exercise_id to variant_id;
alter table public.exercise_muscle_index rename column exercise_id to variant_id;

-- Equipment: the dataset's 28 single-value terms are replaced by normalised items, and a variation
-- can need several (dumbbell + bench). The raw term stays on the variation for traceability.
alter table public.exercise_variants add column source_equipment text;
update public.exercise_variants v set source_equipment = e.term from public.equipment e where e.id = v.equipment_id;
alter table public.exercise_variants alter column source_equipment set not null;
alter table public.exercise_variants drop column equipment_id;
drop table public.equipment;

create table public.equipment (
  id         text primary key,
  names      jsonb not null,
  sort_order smallint not null default 0
);

create table public.exercises (
  id                  text primary key,          -- 'biceps-curl'; singletons are 'x-<slug of record name>'
  type                public.exercise_type not null,
  names               jsonb not null,            -- {"en": ..., "es": ...}
  is_canonical        boolean not null,          -- false = one dataset record not grouped with others yet
  primary_muscle_id   text references public.muscles(id),
  primary_target_term text,                      -- most common dataset target among its variations
  sort_order          smallint not null default 0
);

alter table public.exercise_variants
  add column exercise_id   text references public.exercises(id),
  add column variant_label text,                 -- words the parser could not map to a dimension (named technique, combo)
  add column duplicate_of  text references public.exercise_variants(id),  -- same movement, other camera angle/model
  add column names         jsonb;                -- generated from exercise + attributes + equipment
create index exercise_variants_exercise on public.exercise_variants (exercise_id);
create index exercise_variants_duplicate on public.exercise_variants (duplicate_of);

-- Variation vocabulary ----------------------------------------------------------
create table public.variation_dimensions (
  id         text primary key,                   -- 'grip', 'bench_angle', ...
  names      jsonb not null,
  sort_order smallint not null
);
create table public.variation_values (
  dimension_id text not null references public.variation_dimensions(id) on delete cascade,
  value        text not null,
  names        jsonb not null,
  sort_order   smallint not null default 0,
  primary key (dimension_id, value)
);
create table public.variant_attributes (
  variant_id   text not null references public.exercise_variants(id) on delete cascade,
  dimension_id text not null,
  value        text not null,
  primary key (variant_id, dimension_id, value),
  foreign key (dimension_id, value) references public.variation_values(dimension_id, value)
);
create index variant_attributes_value on public.variant_attributes (dimension_id, value);

create table public.variant_equipment (
  variant_id   text not null references public.exercise_variants(id) on delete cascade,
  equipment_id text not null references public.equipment(id),
  primary key (variant_id, equipment_id)
);
create index variant_equipment_equipment on public.variant_equipment (equipment_id);

do $$
declare t text;
begin
  foreach t in array array['equipment','exercises','variation_dimensions','variation_values','variant_attributes','variant_equipment'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "Catalog: public read" on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

-- The index builder is SQL text, so it must be recreated for the renamed column.
create or replace function public.rebuild_exercise_muscle_index() returns void
language sql set search_path = '' as $$
  delete from public.exercise_muscle_index;
  insert into public.exercise_muscle_index (variant_id, muscle_id, role, via, distance)
  with links as (
    select em.variant_id, em.role, a.muscle_id, 'direct'::public.index_via as via
    from public.exercise_muscles em join public.muscle_aliases a on a.term = em.source_term
    where a.muscle_id is not null
    union all
    select em.variant_id, em.role, sm.muscle_id, 'set'::public.index_via
    from public.exercise_muscles em
    join public.muscle_aliases a on a.term = em.source_term
    join public.muscle_set_members sm on sm.set_id = a.set_id
  ), expanded as (
    select l.variant_id, l.role, p.ancestor_id as muscle_id,
           case when p.depth = 0 then l.via else 'rollup'::public.index_via end as via,
           p.depth as distance
    from links l join public.muscle_paths p on p.descendant_id = l.muscle_id
  )
  select distinct on (variant_id, muscle_id) variant_id, muscle_id, role, via, distance
  from expanded
  order by variant_id, muscle_id, role, via, distance;
$$;
revoke execute on function public.rebuild_exercise_muscle_index() from public, anon, authenticated;

-- Generated names: "Biceps curl · Neutral (hammer) grip · Seated — Dumbbell + Bench".
create function public.rebuild_variant_names() returns void
language sql set search_path = '' as $$
  with attrs as (
    select va.variant_id,
           string_agg(vv.names->>'en', ' · ' order by d.sort_order, vv.sort_order) as en,
           string_agg(vv.names->>'es', ' · ' order by d.sort_order, vv.sort_order) as es
    from public.variant_attributes va
    join public.variation_values vv on vv.dimension_id = va.dimension_id and vv.value = va.value
    join public.variation_dimensions d on d.id = va.dimension_id
    group by va.variant_id
  ), eq as (
    select ve.variant_id,
           string_agg(e.names->>'en', ' + ' order by e.sort_order) as en,
           string_agg(e.names->>'es', ' + ' order by e.sort_order) as es
    from public.variant_equipment ve join public.equipment e on e.id = ve.equipment_id
    group by ve.variant_id
  )
  , computed as (
    select v.id, case
      when x.type <> 'strength' or not x.is_canonical then
        jsonb_build_object('en', x.names->>'en', 'es', coalesce(x.names->>'es', x.names->>'en'))
      else jsonb_build_object(
        'en', concat_ws(' · ', x.names->>'en', a.en, initcap(v.variant_label)) || coalesce(' — ' || eq.en, ''),
        'es', concat_ws(' · ', x.names->>'es', a.es, initcap(v.variant_label)) || coalesce(' — ' || eq.es, ''))
      end as names
    from public.exercise_variants v
    join public.exercises x on x.id = v.exercise_id
    left join attrs a on a.variant_id = v.id
    left join eq on eq.variant_id = v.id
  )
  update public.exercise_variants v set names = c.names from computed c where c.id = v.id;
$$;
revoke execute on function public.rebuild_variant_names() from public, anon, authenticated;

-- Trainer queries ------------------------------------------------------------------
-- Equipment each variation needs, as one array.
create view public.variant_equipment_sets with (security_invoker = true) as
select v.id as variant_id, v.exercise_id,
       coalesce(array_agg(ve.equipment_id order by ve.equipment_id) filter (where ve.equipment_id is not null), '{}') as equipment_ids
from public.exercise_variants v left join public.variant_equipment ve on ve.variant_id = v.id
group by v.id;

-- Which equipment an exercise can be done with, and how many distinct variations use it.
create view public.exercise_equipment_options with (security_invoker = true) as
select v.exercise_id, ve.equipment_id, count(*) as variations
from public.exercise_variants v join public.variant_equipment ve on ve.variant_id = v.id
where v.duplicate_of is null
group by v.exercise_id, ve.equipment_id;

-- Muscles an exercise reaches, across its variations.
create view public.exercise_muscle_summary with (security_invoker = true) as
select v.exercise_id, i.muscle_id, i.role, count(distinct v.id) as variations,
       count(distinct v.id) filter (where i.via = 'direct') as tagged_directly
from public.exercise_variants v join public.exercise_muscle_index i on i.variant_id = v.id
where v.duplicate_of is null
group by v.exercise_id, i.muscle_id, i.role;

-- Variations of an exercise that need only equipment the athlete has.
create function public.available_variants(p_exercise_id text, p_equipment text[])
returns setof public.exercise_variants
language sql stable security invoker set search_path = '' as $$
  select v.* from public.exercise_variants v
  join public.variant_equipment_sets s on s.variant_id = v.id
  where v.exercise_id = p_exercise_id and v.duplicate_of is null and s.equipment_ids <@ p_equipment;
$$;

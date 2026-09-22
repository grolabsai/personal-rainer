-- Movement patterns, muscle emphasis rules, and a precision ladder for both.
--
-- Principle: use the most precise thing we know, and never let a gap stop us answering.
--   1. what the dataset states for this variation      (detail: stated)
--   2. + what an attribute implies (incline -> upper chest)   (detail: inferred)
--   3. if neither, what the exercise says across its variations (detail: exercise)
--   4. if still nothing, the muscle group or body region above it (detail: generalised)
-- Every row carries where it came from, so the app can show or hide inferred detail, and QA can
-- see which exercises are still running on generalisations.

-- Abs in parts, like the chest already is (upper / middle / lower rectus abdominis) ---------------
insert into public.muscles (id, level, kind, parent_id, sort_order, names, common_names) values
  ('rectus-abdominis-upper',  'head', 'muscle', 'rectus-abdominis', 1, '{"en":"Upper abs","es":"Abdominales superiores"}', null),
  ('rectus-abdominis-middle', 'head', 'muscle', 'rectus-abdominis', 2, '{"en":"Middle abs","es":"Abdominales medios"}', null),
  ('rectus-abdominis-lower',  'head', 'muscle', 'rectus-abdominis', 3, '{"en":"Lower abs","es":"Abdominales inferiores"}', null);
select public.rebuild_muscle_paths();
update public.muscle_aliases set muscle_id = 'rectus-abdominis-lower' where term = 'lower abs';

-- Movement patterns --------------------------------------------------------------------------
create table public.movement_patterns (
  id         text primary key,
  names      jsonb not null,
  plane      text,                       -- push / pull / lower / core / whole-body, for grouping
  sort_order smallint not null default 0
);
alter table public.movement_patterns enable row level security;
create policy "Catalog: public read" on public.movement_patterns for select to anon, authenticated using (true);

alter table public.exercises
  add column movement_pattern text references public.movement_patterns(id),
  add column mechanics text check (mechanics in ('compound', 'isolation')),
  add column pattern_source text not null default 'unset' check (pattern_source in ('unset', 'reviewed', 'drafted'));

-- Emphasis rules -------------------------------------------------------------------------------
-- "This attribute, on this kind of exercise, changes which muscles do the work."
create type public.emphasis_effect as enum ('primary', 'more', 'less', 'adds');

create table public.emphasis_rules (
  id              text primary key,
  dimension_id    text not null,
  value           text not null,
  muscle_id       text references public.muscles(id),     -- null = the note has no muscle, only advice
  effect          public.emphasis_effect,
  applies_patterns text[],                                -- null = any pattern
  applies_exercises text[],                               -- null = any exercise
  notes           jsonb not null default '{}',            -- {"en": ..., "es": ...} one short sentence
  confidence      text not null default 'inferred' check (confidence in ('inferred', 'reviewed')),
  sort_order      smallint not null default 0,
  foreign key (dimension_id, value) references public.variation_values(dimension_id, value)
);
create index emphasis_rules_dim on public.emphasis_rules (dimension_id, value);
alter table public.emphasis_rules enable row level security;
create policy "Catalog: public read" on public.emphasis_rules for select to anon, authenticated using (true);

-- Which rules apply to a variation: its attributes, limited to its exercise or pattern.
create view public.variant_emphasis with (security_invoker = true) as
select v.id as variant_id, r.id as rule_id, r.muscle_id, r.effect, r.notes, r.confidence, r.sort_order
from public.exercise_variants v
join public.exercises x on x.id = v.exercise_id
join public.variant_attributes va on va.variant_id = v.id
join public.emphasis_rules r on r.dimension_id = va.dimension_id and r.value = va.value
where (r.applies_patterns is null or x.movement_pattern = any (r.applies_patterns))
  and (r.applies_exercises is null or x.id = any (r.applies_exercises));

-- The muscles a variation works, most precise first, with where each row came from --------------
create view public.variant_muscles with (security_invoker = true) as
-- 1. what the dataset states for this variation
select em.variant_id, a.muscle_id, em.role::text as role, 'stated'::text as detail_level, null::jsonb as notes
from public.exercise_muscles em
join public.muscle_aliases a on a.term = em.source_term
where a.muscle_id is not null
union all
-- 2. what its attributes imply (inferred; may be more precise than the dataset)
select e.variant_id, e.muscle_id,
       case e.effect when 'primary' then 'target' when 'less' then 'secondary' else 'secondary' end as role,
       'inferred', e.notes
from public.variant_emphasis e
where e.muscle_id is not null and e.effect <> 'less';

-- Same question, one level up: everything an exercise works across its variations.
create view public.exercise_muscles_rolled with (security_invoker = true) as
select v.exercise_id, vm.muscle_id, vm.role, count(*) as variations,
       min(vm.detail_level) as best_detail
from public.exercise_variants v
join public.variant_muscles vm on vm.variant_id = v.id
where v.duplicate_of is null
group by v.exercise_id, vm.muscle_id, vm.role;

-- Generalisation: walk a muscle up to the level a screen can draw (e.g. 'group' for a small map).
create function public.muscle_at_level(p_muscle text, p_level public.muscle_level)
returns text language sql stable set search_path = '' as $$
  select coalesce(
    (select p.ancestor_id from public.muscle_paths p join public.muscles m on m.id = p.ancestor_id
      where p.descendant_id = p_muscle and m.level = p_level order by p.depth limit 1),
    p_muscle);
$$;

-- What to show for a variation, with an honest detail_level label. Falls back step by step and
-- never returns nothing: the exercise's own muscles, then its primary target, are always there.
create function public.muscles_for_variant(p_variant text)
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
  )
  select muscle_id, role, detail_level, notes from stated
  union all select * from fallback_exercise
  union all select * from fallback_target;
$$;

-- Exercise catalog and muscle taxonomy. Design: docs/muscle-taxonomy.md
-- Catalog tables are public reference data: readable by anyone, writable only by migrations/service_role.

-- Exercise classification (the dataset's own terms) -------------------------
create table public.body_parts (
  id    text primary key,              -- slug of the dataset term, e.g. 'upper-arms'
  term  text not null unique,          -- raw dataset term, e.g. 'upper arms'
  names jsonb not null                 -- {"en": ..., "es": ...}
);
create table public.equipment (
  id    text primary key,
  term  text not null unique,
  names jsonb not null
);

create table public.exercises (
  id                    text primary key,           -- dataset id, e.g. '0001'
  name                  text not null,              -- English only; the dataset has no translated names
  body_part_id          text not null references public.body_parts(id),
  equipment_id          text not null references public.equipment(id),
  instructions          jsonb not null,             -- {"en": "...", "es": "..."}
  instruction_steps     jsonb not null,             -- {"en": ["..."], "es": ["..."]}
  media_id              text not null,
  image_path            text not null,              -- path inside the dataset repo; media is © Gym visual and not hosted here
  gif_path              text not null,
  attribution           text not null,
  source_target         text not null,              -- raw muscle fields, kept for traceability
  source_muscle_group   text not null,
  source_secondary      text[] not null,
  source_created_at     timestamptz,
  imported_at           timestamptz not null default now()
);
create index exercises_body_part on public.exercises (body_part_id);
create index exercises_equipment on public.exercises (equipment_id);

-- 1. Anatomy tree -----------------------------------------------------------
create type public.muscle_level as enum ('region', 'group', 'muscle', 'head');
create type public.muscle_kind  as enum ('muscle', 'joint', 'area', 'system');

create table public.muscles (
  id          text primary key,
  level       public.muscle_level not null,
  kind        public.muscle_kind not null default 'muscle',
  parent_id   text references public.muscles(id),
  sort_order  smallint not null default 0,
  names       jsonb not null,           -- {"en": ..., "es": ...}
  common_names jsonb                    -- gym names, e.g. {"en": "Rear delts", "es": "Deltoides posterior"}
);
create index muscles_parent on public.muscles (parent_id);

-- Closure table: every ancestor/descendant pair, self included at depth 0.
create table public.muscle_paths (
  ancestor_id   text not null references public.muscles(id) on delete cascade,
  descendant_id text not null references public.muscles(id) on delete cascade,
  depth         smallint not null,
  primary key (ancestor_id, descendant_id)
);
create index muscle_paths_descendant on public.muscle_paths (descendant_id);

-- 2. Functional sets (cross the tree) ---------------------------------------
create table public.muscle_sets (
  id    text primary key,
  names jsonb not null
);
create table public.muscle_set_members (
  set_id    text not null references public.muscle_sets(id) on delete cascade,
  muscle_id text not null references public.muscles(id) on delete cascade,
  primary key (set_id, muscle_id)
);
create index muscle_set_members_muscle on public.muscle_set_members (muscle_id);

-- 3. Raw dataset term -> node or set ----------------------------------------
create type public.alias_confidence as enum ('exact', 'synonym', 'broader', 'interpreted');

create table public.muscle_aliases (
  term       text primary key,
  muscle_id  text references public.muscles(id),
  set_id     text references public.muscle_sets(id),
  confidence public.alias_confidence not null,
  note       text,
  check ((muscle_id is null) <> (set_id is null))
);
create index muscle_aliases_muscle on public.muscle_aliases (muscle_id);
create index muscle_aliases_set on public.muscle_aliases (set_id);

-- 4a. Exercise -> term, as the dataset states it -----------------------------
create type public.muscle_role as enum ('target', 'secondary');

create table public.exercise_muscles (
  exercise_id text not null references public.exercises(id) on delete cascade,
  role        public.muscle_role not null,
  rank        smallint not null,        -- 0 = target; 1..n = position in secondary_muscles (1 = dataset's muscle_group)
  source_term text not null references public.muscle_aliases(term),
  primary key (exercise_id, role, rank)
);
create index exercise_muscles_term on public.exercise_muscles (source_term);

-- 4b. Denormalized index: one lookup filters by any node --------------------
-- Enum order is the preference order used when a muscle is reached more than once.
create type public.index_via as enum ('direct', 'set', 'rollup');

create table public.exercise_muscle_index (
  exercise_id text not null references public.exercises(id) on delete cascade,
  muscle_id   text not null references public.muscles(id) on delete cascade,
  role        public.muscle_role not null,
  via         public.index_via not null,
  distance    smallint not null,
  primary key (exercise_id, muscle_id)
);
create index exercise_muscle_index_lookup on public.exercise_muscle_index (muscle_id, role, via);

-- Rebuild functions ---------------------------------------------------------
create function public.rebuild_muscle_paths() returns void
language sql set search_path = '' as $$
  delete from public.muscle_paths;
  insert into public.muscle_paths (ancestor_id, descendant_id, depth)
  with recursive walk as (
    select id as ancestor_id, id as descendant_id, 0 as depth from public.muscles
    union all
    select m.parent_id, w.descendant_id, w.depth + 1
    from walk w join public.muscles m on m.id = w.ancestor_id
    where m.parent_id is not null
  )
  select ancestor_id, descendant_id, depth from walk;
$$;

-- Expands exercise_muscles upward through the tree (never downward) and into set members.
create function public.rebuild_exercise_muscle_index() returns void
language sql set search_path = '' as $$
  delete from public.exercise_muscle_index;
  insert into public.exercise_muscle_index (exercise_id, muscle_id, role, via, distance)
  with links as (
    select em.exercise_id, em.role, a.muscle_id, 'direct'::public.index_via as via
    from public.exercise_muscles em join public.muscle_aliases a on a.term = em.source_term
    where a.muscle_id is not null
    union all
    select em.exercise_id, em.role, sm.muscle_id, 'set'::public.index_via
    from public.exercise_muscles em
    join public.muscle_aliases a on a.term = em.source_term
    join public.muscle_set_members sm on sm.set_id = a.set_id
  ), expanded as (
    select l.exercise_id, l.role, p.ancestor_id as muscle_id,
           case when p.depth = 0 then l.via else 'rollup'::public.index_via end as via,
           p.depth as distance
    from links l join public.muscle_paths p on p.descendant_id = l.muscle_id
  )
  select distinct on (exercise_id, muscle_id) exercise_id, muscle_id, role, via, distance
  from expanded
  order by exercise_id, muscle_id, role, via, distance;
$$;
revoke execute on function public.rebuild_muscle_paths() from public, anon, authenticated;
revoke execute on function public.rebuild_exercise_muscle_index() from public, anon, authenticated;

-- Read access ---------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['body_parts','equipment','exercises','muscles','muscle_paths','muscle_sets',
                           'muscle_set_members','muscle_aliases','exercise_muscles','exercise_muscle_index'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "Catalog: public read" on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

-- Per-muscle exercise counts, for browsing the taxonomy.
create view public.muscle_exercise_counts with (security_invoker = true) as
select m.id as muscle_id, m.level, m.kind, m.parent_id, m.names,
       count(i.exercise_id) filter (where i.role = 'target')    as as_target,
       count(i.exercise_id) filter (where i.role = 'secondary') as as_secondary,
       count(i.exercise_id) filter (where i.via = 'direct')     as tagged_directly,
       count(i.exercise_id)                                      as total
from public.muscles m left join public.exercise_muscle_index i on i.muscle_id = m.id
group by m.id;

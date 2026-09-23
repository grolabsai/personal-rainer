-- How a workout is actually shaped: blocks, items, and one row per prescribed set.
--
-- A block is an ordered group of items sharing one execution rule (`mode`) and one purpose.
--   straight  finish all the sets of item 1, then item 2
--   rounds    one set of each item in order, repeat — a superset is two items, a circuit is more
-- Purpose (warm-up … cool-down) is editorial and drives headings; mode is the only thing the
-- player behaves differently for. Keeping them apart is what keeps this small.
--
-- A set is one bout of work followed by a rest: the atom. Uniform prescriptions get explicit rows
-- like everything else, so 12/10/8 with rising load, a warm-up set, a back-off set, a per-set grip
-- change and a single-arm hold all use the same shape.
--
-- Four rests, four owners: after a set (item_sets.rest_seconds), between items inside a round,
-- between rounds, and after the block. Rest is a property of a boundary, never a block of its own —
-- an item-less block would make every reader special-case emptiness.

create table public.workout_blocks (
  id                    uuid primary key default gen_random_uuid(),
  workout_id            uuid not null references public.program_workouts(id) on delete cascade,
  position              smallint not null,
  purpose               text not null default 'main'
                          check (purpose in ('warmup', 'main', 'accessory', 'finisher', 'cooldown')),
  mode                  text not null default 'straight' check (mode in ('straight', 'rounds')),
  rounds                smallint check (rounds between 1 and 30),
  names                 jsonb not null default '{}',
  notes                 jsonb not null default '{}',
  rest_between_items_s  smallint not null default 0,
  rest_between_rounds_s smallint not null default 0,
  rest_after_s          smallint not null default 0,
  params                jsonb not null default '{}',   -- protocols the columns do not model: emom map, cluster, amrap score
  unique (workout_id, position),
  check (mode <> 'rounds' or rounds is not null)
);

alter table public.program_workout_items
  add column block_id     uuid references public.workout_blocks(id) on delete cascade,
  add column exercise_id  text references public.exercises(id),
  add column variant_locked boolean not null default false,   -- this variation or nothing
  add column source_item_id uuid,                             -- the template item this came from
  add column substitution_level smallint,                     -- 1, 2 or 3 when the resolver had to substitute
  add column substitution_note  jsonb not null default '{}';
alter table public.program_workout_items alter column variant_id drop not null;
create index program_workout_items_block on public.program_workout_items (block_id);

-- Requirements the resolver must honour, in the catalog's own vocabulary: "incline", "close grip".
-- What the item does not say is free to vary by location, which is what makes a template portable.
create table public.item_attributes (
  item_id      uuid not null references public.program_workout_items(id) on delete cascade,
  dimension_id text not null,
  value        text not null,
  primary key (item_id, dimension_id),
  foreign key (dimension_id, value) references public.variation_values(dimension_id, value)
);

create table public.item_sets (
  id               uuid primary key default gen_random_uuid(),
  item_id          uuid not null references public.program_workout_items(id) on delete cascade,
  set_number       smallint not null,
  kind             text not null default 'working'
                     check (kind in ('warmup', 'working', 'backoff', 'drop', 'amrap')),
  reps_min         smallint,
  reps_max         smallint,
  duration_seconds smallint,
  distance_m       integer,
  reps_per_side    boolean not null default false,
  load_kg          numeric(6,2),
  load_percent_1rm smallint check (load_percent_1rm between 1 and 150),
  rpe              numeric(3,1) check (rpe between 1 and 10),
  tempo            text,                       -- "3-1-1-0"
  rest_seconds     smallint not null default 90,
  -- Laterality is prescribed per set, not only per variation: both hands, one at a time, or
  -- alternating while the other arm holds.
  side             text not null default 'both'
                     check (side in ('both', 'left', 'right', 'each', 'alternating')),
  other_side       text check (other_side in ('rest', 'hold', 'work')),
  variant_id       text references public.exercise_variants(id),   -- per-set override: wide, then diamond
  notes            jsonb not null default '{}',
  params           jsonb not null default '{}',
  unique (item_id, set_number),
  check (kind = 'amrap' or reps_min is not null or duration_seconds is not null or distance_m is not null),
  check (reps_max is null or reps_min is null or reps_max >= reps_min)
);
create index item_sets_item on public.item_sets (item_id, set_number);

-- Recording: what was prescribed, and what was actually done against it.
alter table public.session_sets
  add column prescribed_set_id uuid references public.item_sets(id) on delete set null,
  add column round_number      smallint,
  add column rpe               numeric(3,1),
  add column status            text not null default 'done'
                                 check (status in ('done', 'partial', 'skipped', 'not_logged')),
  add column deviation_reason  text
                                 check (deviation_reason in ('equipment', 'load', 'pain', 'time', 'preference'));

-- Whether the athlete logs every set, only ticks them off, or records nothing but the session.
alter table public.programs add column track_mode text not null default 'full'
  check (track_mode in ('full', 'completion', 'none'));
alter table public.workout_sessions
  add column location_id uuid references public.locations(id) on delete set null,
  add column track_mode  text not null default 'full'
    check (track_mode in ('full', 'completion', 'none'));

-- Existing data: every workout becomes one straight block, every item's sets/reps become rows ------
insert into public.workout_blocks (workout_id, position, purpose, mode)
select id, 1, 'main', 'straight' from public.program_workouts;

update public.program_workout_items i
set block_id = b.id, exercise_id = v.exercise_id
from public.workout_blocks b, public.exercise_variants v
where b.workout_id = i.workout_id and v.id = i.variant_id;

-- "10" -> 10 reps · "6-8" -> 6 to 8 · "40 s" -> 40 seconds
insert into public.item_sets (item_id, set_number, reps_min, reps_max, duration_seconds, load_kg, rest_seconds)
select i.id, n,
       case when i.reps ~ '^\s*\d+\s*$' then (regexp_replace(i.reps, '\D', '', 'g'))::smallint
            when i.reps ~ '^\s*\d+\s*-\s*\d+\s*$' then split_part(i.reps, '-', 1)::smallint end,
       case when i.reps ~ '^\s*\d+\s*-\s*\d+\s*$' then split_part(i.reps, '-', 2)::smallint end,
       case when i.reps ~* 's\s*$' then (regexp_replace(i.reps, '\D', '', 'g'))::smallint end,
       i.weight_kg, i.rest_seconds
from public.program_workout_items i, generate_series(1, 20) n
where n <= i.sets;

-- The one session recorded so far keeps its history: each row finds the set it answered.
update public.session_sets s
set prescribed_set_id = t.id,
    status = case when s.completed then 'done' else 'skipped' end
from public.item_sets t
where t.item_id = s.item_id and t.set_number = s.set_number;

alter table public.program_workout_items
  drop column sets, drop column reps, drop column weight_kg, drop column rest_seconds;
alter table public.program_workout_items
  alter column block_id set not null,
  alter column exercise_id set not null;
alter table public.session_sets drop column completed;

alter table public.workout_blocks enable row level security;
alter table public.item_attributes enable row level security;
alter table public.item_sets enable row level security;

-- Blocks and sets are visible exactly where their workout is (helpers from migration 0008).
create policy "Blocks: follow the workout" on public.workout_blocks for select to authenticated
  using (public.can_see_workout(workout_id));
create policy "Blocks: owner edits" on public.workout_blocks for all to authenticated
  using (public.owns_workout(workout_id)) with check (public.owns_workout(workout_id));

create function public.item_workout(p_item uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select workout_id from public.program_workout_items where id = p_item;
$$;
revoke execute on function public.item_workout(uuid) from public, anon;
grant execute on function public.item_workout(uuid) to authenticated;

create policy "Item attributes: follow the workout" on public.item_attributes for select to authenticated
  using (public.can_see_workout(public.item_workout(item_id)));
create policy "Item attributes: owner edits" on public.item_attributes for all to authenticated
  using (public.owns_workout(public.item_workout(item_id)))
  with check (public.owns_workout(public.item_workout(item_id)));

create policy "Sets: follow the workout" on public.item_sets for select to authenticated
  using (public.can_see_workout(public.item_workout(item_id)));
create policy "Sets: owner edits" on public.item_sets for all to authenticated
  using (public.owns_workout(public.item_workout(item_id)))
  with check (public.owns_workout(public.item_workout(item_id)));

-- When a workout happens, and where a coach keeps the ones worth reusing.
--
-- Three ways to place a workout in time, one column on the program:
--   weekly    a cycle that rolls forward — Mon/Wed/Fri, repeating; a 2-week A/B cycle is cycle_weeks = 2
--   dated     the coach drops specific workouts on specific days
--   sequence  ordered but undated: "do these three in order, whenever you get there"
-- Whatever the mode, `assignments` stays the single answer to "what do I do today", so the athlete
-- app reads exactly what it read before.

alter table public.programs
  add column schedule_mode text not null default 'sequence'
    check (schedule_mode in ('weekly', 'dated', 'sequence')),
  add column cycle_weeks   smallint not null default 1 check (cycle_weeks between 1 and 12),
  add column weeks_total   smallint,                     -- null = repeats until stopped
  -- Library: a coach's own templates are private, the seeded ones are public, and forking records where it came from.
  add column visibility    text not null default 'private' check (visibility in ('private', 'public')),
  add column forked_from   uuid references public.programs(id) on delete set null,
  add column goal          text,
  add column level         text check (level in ('beginner', 'intermediate', 'advanced')),
  add column days_per_week smallint check (days_per_week between 1 and 14),
  add column weeks         smallint,
  add column tags          text[] not null default '{}';

update public.programs set visibility = 'public' where is_template and coach_id is null;

alter table public.program_workouts
  add column day_of_week   smallint check (day_of_week between 1 and 7),   -- 1 = Monday
  add column week_in_cycle smallint not null default 1 check (week_in_cycle between 1 and 12),
  add column scheduled_for date;

-- A coach may now own templates of their own. The old rules said a coach owns a program only when
-- it is not a template, which left no room for a personal library.
create or replace function public.owns_program(p_program uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.programs where id = p_program and coach_id = auth.uid());
$$;
create or replace function public.owns_workout(p_workout uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.program_workouts w join public.programs p on p.id = w.program_id
                 where w.id = p_workout and p.coach_id = auth.uid());
$$;
create or replace function public.can_see_program(p_program uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.programs p where p.id = p_program
                  and (p.coach_id = auth.uid() or (p.is_template and p.visibility = 'public')))
      or exists (select 1 from public.program_workouts w join public.assignments a on a.workout_id = w.id
                 where w.program_id = p_program and a.athlete_id = auth.uid());
$$;

drop policy "Programs: coach inserts" on public.programs;
drop policy "Programs: coach updates own" on public.programs;
drop policy "Programs: coach deletes own" on public.programs;
create policy "Programs: coach inserts own" on public.programs for insert to authenticated
  with check (coach_id = (select auth.uid()) and public.app_role() in ('coach', 'admin'));
create policy "Programs: coach updates own" on public.programs for update to authenticated
  using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()));
create policy "Programs: coach deletes own" on public.programs for delete to authenticated
  using (coach_id = (select auth.uid()));

-- An athlete following a program: where, from when, and whether it is still running.
create table public.program_enrollments (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references public.programs(id) on delete cascade,
  athlete_id  uuid not null references auth.users(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  start_date  date not null default current_date,
  end_date    date,
  status      text not null default 'active' check (status in ('active', 'paused', 'finished')),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index program_enrollments_athlete on public.program_enrollments (athlete_id, status);

alter table public.assignments
  add column enrollment_id uuid references public.program_enrollments(id) on delete cascade,
  add column location_id   uuid references public.locations(id) on delete set null;
-- Generating the next few weeks must be safe to repeat.
create unique index assignments_occurrence
  on public.assignments (enrollment_id, workout_id, scheduled_for) where enrollment_id is not null;

alter table public.program_enrollments enable row level security;
create policy "Enrollments: athlete reads own" on public.program_enrollments for select to authenticated
  using (athlete_id = (select auth.uid()) or public.is_coach_of(athlete_id));
create policy "Enrollments: coach manages" on public.program_enrollments for all to authenticated
  using (public.is_coach_of(athlete_id) or created_by = (select auth.uid()))
  with check (public.is_coach_of(athlete_id) or athlete_id = (select auth.uid()));

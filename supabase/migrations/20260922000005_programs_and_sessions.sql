-- Coach-programmed workouts and athlete sessions.
-- A coach builds programs of workouts (each a list of exercise variations with planned sets, reps, weight
-- and rest) and assigns workouts to athletes. The athlete app runs them and records every set.
-- Template programs (is_template) have no coach and are visible to every signed-in user.

-- Roles ----------------------------------------------------------------------
alter table public.profiles add column role text not null default 'athlete'
  check (role in ('athlete', 'coach', 'admin'));

-- Only service_role (dashboard, migrations, admin tools) may change role or user_role_id.
create or replace function public.protect_profile_role() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT' then
      new.user_role_id := 0;
      new.role := 'athlete';
    else
      if new.user_role_id is distinct from old.user_role_id then new.user_role_id := old.user_role_id; end if;
      if new.role is distinct from old.role then new.role := old.role; end if;
    end if;
  end if;
  return new;
end $$;

-- Every new account gets a profile (the web app does not run the mobile onboarding).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.app_role() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'athlete');
$$;
revoke execute on function public.app_role() from public, anon;
grant execute on function public.app_role() to authenticated;

-- Coach <-> athlete ------------------------------------------------------------
create table public.coach_athletes (
  coach_id   uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (coach_id, athlete_id)
);
create index coach_athletes_athlete on public.coach_athletes (athlete_id);

create function public.is_coach_of(p_athlete uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.coach_athletes where coach_id = auth.uid() and athlete_id = p_athlete);
$$;
revoke execute on function public.is_coach_of(uuid) from public, anon;
grant execute on function public.is_coach_of(uuid) to authenticated;

-- Programs ---------------------------------------------------------------------
create table public.programs (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid references auth.users(id) on delete cascade,   -- null for templates
  is_template boolean not null default false,
  names       jsonb not null,                                      -- {"en": ..., "es": ...}
  descriptions jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (is_template or coach_id is not null)
);

create table public.program_workouts (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  position   smallint not null,
  names      jsonb not null,
  notes      jsonb not null default '{}',
  unique (program_id, position)
);

create table public.program_workout_items (
  id           uuid primary key default gen_random_uuid(),
  workout_id   uuid not null references public.program_workouts(id) on delete cascade,
  position     smallint not null,
  variant_id   text not null references public.exercise_variants(id),
  sets         smallint not null check (sets between 1 and 20),
  reps         text not null,              -- "10", "8-12", "30 s"
  weight_kg    numeric(6,2),               -- null = bodyweight or athlete's choice
  rest_seconds smallint not null default 90,
  notes        jsonb not null default '{}',
  unique (workout_id, position)
);
create index program_workout_items_variant on public.program_workout_items (variant_id);

-- Assignments ------------------------------------------------------------------
create table public.assignments (
  id            uuid primary key default gen_random_uuid(),
  workout_id    uuid not null references public.program_workouts(id) on delete cascade,
  athlete_id    uuid not null references auth.users(id) on delete cascade,
  assigned_by   uuid references auth.users(id) on delete set null,
  scheduled_for date,
  status        text not null default 'assigned' check (status in ('assigned', 'completed', 'skipped')),
  completed_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index assignments_athlete on public.assignments (athlete_id, status, scheduled_for);

-- Sessions ---------------------------------------------------------------------
create table public.workout_sessions (
  id               uuid primary key default gen_random_uuid(),
  athlete_id       uuid not null references auth.users(id) on delete cascade,
  workout_id       uuid references public.program_workouts(id) on delete set null,
  assignment_id    uuid references public.assignments(id) on delete set null,
  started_at       timestamptz not null,
  finished_at      timestamptz not null,
  duration_seconds integer not null,
  notes            text,
  created_at       timestamptz not null default now()
);
create index workout_sessions_athlete on public.workout_sessions (athlete_id, finished_at desc);

create table public.session_sets (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.workout_sessions(id) on delete cascade,
  item_id     uuid references public.program_workout_items(id) on delete set null,
  variant_id  text not null references public.exercise_variants(id),
  set_number  smallint not null,
  reps        smallint,
  weight_kg   numeric(6,2),
  completed   boolean not null default false
);
create index session_sets_session on public.session_sets (session_id);

-- Security ---------------------------------------------------------------------
alter table public.coach_athletes enable row level security;
alter table public.programs enable row level security;
alter table public.program_workouts enable row level security;
alter table public.program_workout_items enable row level security;
alter table public.assignments enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.session_sets enable row level security;

create policy "Coach links: coach manages own" on public.coach_athletes for all to authenticated
  using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()) and public.app_role() in ('coach', 'admin'));
create policy "Coach links: athlete sees own" on public.coach_athletes for select to authenticated
  using (athlete_id = (select auth.uid()));

-- Coaches see their athletes' profiles (names), nothing else changes for profiles.
create policy "Profiles: coach reads own athletes" on public.profiles for select to authenticated
  using (public.is_coach_of(id));

-- A workout is visible to its coach, to athletes it is assigned to, and to everyone when it is a template.
create function public.can_see_workout(p_workout uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.program_workouts w join public.programs p on p.id = w.program_id
    where w.id = p_workout and (p.is_template or p.coach_id = auth.uid()
      or exists (select 1 from public.assignments a where a.workout_id = w.id and a.athlete_id = auth.uid())));
$$;
revoke execute on function public.can_see_workout(uuid) from public, anon;
grant execute on function public.can_see_workout(uuid) to authenticated;

create policy "Programs: read" on public.programs for select to authenticated
  using (is_template or coach_id = (select auth.uid())
         or exists (select 1 from public.program_workouts w where w.program_id = programs.id and public.can_see_workout(w.id)));
create policy "Programs: coach writes own" on public.programs for all to authenticated
  using (coach_id = (select auth.uid()) and not is_template)
  with check (coach_id = (select auth.uid()) and not is_template and public.app_role() in ('coach', 'admin'));

create policy "Workouts: read" on public.program_workouts for select to authenticated using (public.can_see_workout(id));
create policy "Workouts: coach writes own" on public.program_workouts for all to authenticated
  using (exists (select 1 from public.programs p where p.id = program_id and p.coach_id = (select auth.uid()) and not p.is_template))
  with check (exists (select 1 from public.programs p where p.id = program_id and p.coach_id = (select auth.uid()) and not p.is_template));

create policy "Items: read" on public.program_workout_items for select to authenticated using (public.can_see_workout(workout_id));
create policy "Items: coach writes own" on public.program_workout_items for all to authenticated
  using (exists (select 1 from public.program_workouts w join public.programs p on p.id = w.program_id
                 where w.id = workout_id and p.coach_id = (select auth.uid()) and not p.is_template))
  with check (exists (select 1 from public.program_workouts w join public.programs p on p.id = w.program_id
                 where w.id = workout_id and p.coach_id = (select auth.uid()) and not p.is_template));

create policy "Assignments: athlete reads own" on public.assignments for select to authenticated
  using (athlete_id = (select auth.uid()));
create policy "Assignments: coach manages for own athletes" on public.assignments for all to authenticated
  using (public.is_coach_of(athlete_id))
  with check (public.is_coach_of(athlete_id) and assigned_by = (select auth.uid()));

create policy "Sessions: athlete owns" on public.workout_sessions for all to authenticated
  using (athlete_id = (select auth.uid())) with check (athlete_id = (select auth.uid()));
create policy "Sessions: coach reads own athletes" on public.workout_sessions for select to authenticated
  using (public.is_coach_of(athlete_id));

create policy "Sets: athlete owns" on public.session_sets for all to authenticated
  using (exists (select 1 from public.workout_sessions s where s.id = session_id and s.athlete_id = (select auth.uid())))
  with check (exists (select 1 from public.workout_sessions s where s.id = session_id and s.athlete_id = (select auth.uid())));
create policy "Sets: coach reads own athletes" on public.session_sets for select to authenticated
  using (exists (select 1 from public.workout_sessions s where s.id = session_id and public.is_coach_of(s.athlete_id)));

-- Finishing a session marks its assignment done. Athletes cannot edit assignments directly.
create function public.complete_assignment(p_assignment uuid) returns void
language sql security definer set search_path = '' as $$
  update public.assignments set status = 'completed', completed_at = now()
  where id = p_assignment and athlete_id = auth.uid();
$$;
revoke execute on function public.complete_assignment(uuid) from public, anon;
grant execute on function public.complete_assignment(uuid) to authenticated;

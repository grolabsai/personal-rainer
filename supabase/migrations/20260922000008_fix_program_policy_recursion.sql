-- The program / workout / item policies referenced each other through RLS-protected subqueries
-- (programs -> program_workouts -> programs ...), which Postgres rejects as infinite recursion.
-- Every cross-table check now goes through a SECURITY DEFINER helper that reads the tables directly.

create function public.owns_program(p_program uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.programs where id = p_program and coach_id = auth.uid() and not is_template);
$$;
create function public.owns_workout(p_workout uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.program_workouts w join public.programs p on p.id = w.program_id
                 where w.id = p_workout and p.coach_id = auth.uid() and not p.is_template);
$$;
create function public.can_see_program(p_program uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.programs p where p.id = p_program and (p.is_template or p.coach_id = auth.uid()))
      or exists (select 1 from public.program_workouts w join public.assignments a on a.workout_id = w.id
                 where w.program_id = p_program and a.athlete_id = auth.uid());
$$;
revoke execute on function public.owns_program(uuid), public.owns_workout(uuid), public.can_see_program(uuid) from public, anon;
grant execute on function public.owns_program(uuid), public.owns_workout(uuid), public.can_see_program(uuid) to authenticated;

drop policy "Programs: read" on public.programs;
drop policy "Programs: coach writes own" on public.programs;
create policy "Programs: read" on public.programs for select to authenticated using (public.can_see_program(id));
create policy "Programs: coach inserts" on public.programs for insert to authenticated
  with check (coach_id = (select auth.uid()) and not is_template and public.app_role() in ('coach', 'admin'));
create policy "Programs: coach updates own" on public.programs for update to authenticated
  using (coach_id = (select auth.uid()) and not is_template)
  with check (coach_id = (select auth.uid()) and not is_template);
create policy "Programs: coach deletes own" on public.programs for delete to authenticated
  using (coach_id = (select auth.uid()) and not is_template);

drop policy "Workouts: coach writes own" on public.program_workouts;
create policy "Workouts: coach inserts" on public.program_workouts for insert to authenticated with check (public.owns_program(program_id));
create policy "Workouts: coach updates own" on public.program_workouts for update to authenticated
  using (public.owns_program(program_id)) with check (public.owns_program(program_id));
create policy "Workouts: coach deletes own" on public.program_workouts for delete to authenticated using (public.owns_program(program_id));

drop policy "Items: coach writes own" on public.program_workout_items;
create policy "Items: coach inserts" on public.program_workout_items for insert to authenticated with check (public.owns_workout(workout_id));
create policy "Items: coach updates own" on public.program_workout_items for update to authenticated
  using (public.owns_workout(workout_id)) with check (public.owns_workout(workout_id));
create policy "Items: coach deletes own" on public.program_workout_items for delete to authenticated using (public.owns_workout(workout_id));

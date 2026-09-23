-- `insert ... returning` was impossible for a coach creating a program or a workout, which is what
-- supabase-js does on every `.insert().select()` — so the admin UI would have failed on its first
-- save. The read policies asked a SECURITY DEFINER helper whether the row was visible, and that
-- helper runs its own query, which cannot see the row the statement is still inserting.
--
-- The fix is to decide visibility from columns of the row itself wherever possible, and keep the
-- helper only as the extra path (a public template, an athlete who was assigned it).
-- Same reasoning as migration 0008: a policy that has to read the table it is protecting is trouble.
drop policy "Programs: read" on public.programs;
create policy "Programs: read" on public.programs for select to authenticated
  using (coach_id = (select auth.uid())
      or athlete_id = (select auth.uid())          -- the athlete's own resolved plan
      or public.can_see_program(id));

drop policy "Workouts: read" on public.program_workouts;
create policy "Workouts: read" on public.program_workouts for select to authenticated
  using (public.can_see_program(program_id)        -- the parent already exists, so this is safe
      or public.can_see_workout(id));

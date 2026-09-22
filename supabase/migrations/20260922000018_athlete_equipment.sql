-- What an athlete can actually train with. Substitutes are only useful when the app can rule out
-- the ones that need a machine the athlete does not have, and that answer has to follow them
-- between devices, so it lives here rather than in the browser.
-- An empty list means "unknown", not "nothing": the app then offers everything.
create table public.athlete_equipment (
  athlete_id   uuid not null references auth.users(id) on delete cascade,
  equipment_id text not null references public.equipment(id) on delete cascade,
  primary key (athlete_id, equipment_id)
);
alter table public.athlete_equipment enable row level security;

create policy "Athletes manage their own equipment" on public.athlete_equipment
  for all to authenticated using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
create policy "Coaches read their athletes' equipment" on public.athlete_equipment
  for select to authenticated using (public.is_coach_of(athlete_id));

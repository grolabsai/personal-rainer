-- Two things the model promised but had nothing behind.
--
-- 1. item_sets.load_percent_1rm has existed since the sets table, and nothing in the database knew
--    what an athlete's one-rep max was, so "75% of 1RM" could be prescribed and never resolved.
--    A max can be recorded (tested, or set by the coach) or estimated from what the athlete has
--    actually lifted — Epley, capped at twelve reps, past which the formula stops meaning much.
create table public.athlete_maxes (
  athlete_id  uuid not null references auth.users(id) on delete cascade,
  exercise_id text not null references public.exercises(id) on delete cascade,
  one_rm_kg   numeric(6,2) not null check (one_rm_kg > 0),
  source      text not null default 'tested' check (source in ('tested', 'coach', 'estimated')),
  measured_on date not null default current_date,
  note        text,
  primary key (athlete_id, exercise_id, measured_on)
);
alter table public.athlete_maxes enable row level security;
create policy "Maxes: athlete manages own" on public.athlete_maxes for all to authenticated
  using (athlete_id = (select auth.uid())) with check (athlete_id = (select auth.uid()));
create policy "Maxes: coach manages their athletes'" on public.athlete_maxes for all to authenticated
  using (public.is_coach_of(athlete_id)) with check (public.is_coach_of(athlete_id));

-- What the sessions already say, for free: the best estimate per exercise from work actually done.
create view public.athlete_exercise_maxes with (security_invoker = true) as
select ws.athlete_id, v.exercise_id,
       max(round(ss.weight_kg * (1 + least(ss.reps, 12)::numeric / 30), 1)) as estimated_1rm_kg,
       max(ss.weight_kg) as heaviest_kg,
       max(ws.finished_at) as last_lifted
from public.session_sets ss
join public.workout_sessions ws on ws.id = ss.session_id
join public.exercise_variants v on v.id = ss.variant_id
where ss.status = 'done' and ss.weight_kg is not null and ss.reps is not null and ss.reps > 0
group by 1, 2;

-- A recorded max wins over an estimate; the most recent recorded one wins over an older one.
create function public.one_rm_for(p_athlete uuid, p_exercise text) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select one_rm_kg from public.athlete_maxes
     where athlete_id = p_athlete and exercise_id = p_exercise
     order by measured_on desc limit 1),
    (select estimated_1rm_kg from public.athlete_exercise_maxes
     where athlete_id = p_athlete and exercise_id = p_exercise));
$$;
revoke execute on function public.one_rm_for(uuid, text) from public, anon;
grant execute on function public.one_rm_for(uuid, text) to authenticated;

-- What a prescribed set weighs for this athlete: the stated load, or the percentage resolved
-- against their max. Null when neither is known — the app then shows the percentage as written
-- rather than inventing a number.
create function public.prescribed_load_kg(p_set uuid, p_athlete uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select case
    when s.load_kg is not null then s.load_kg
    when s.load_percent_1rm is not null then
      round(public.one_rm_for(p_athlete, i.exercise_id) * s.load_percent_1rm / 100.0, 1)
  end
  from public.item_sets s
  join public.program_workout_items i on i.id = s.item_id
  where s.id = p_set;
$$;
revoke execute on function public.prescribed_load_kg(uuid, uuid) from public, anon;
grant execute on function public.prescribed_load_kg(uuid, uuid) to authenticated;

-- 2. A coach needs to see what a workout actually trains, not just what it contains. This is the
--    prescribed work rolled up by muscle, using the resolved ladder (stated, inferred, or rolled up
--    from the exercise) and ignoring the rows that only repeat a claim less precisely.
create view public.workout_muscle_load with (security_invoker = true) as
select w.id as workout_id, w.program_id,
       r.muscle_id, r.role,
       count(distinct i.id)::int as exercises,
       count(s.id)::int as sets,
       sum(coalesce(s.reps_min, 0))::int as reps,
       sum(coalesce(s.reps_min, 0) * coalesce(s.load_kg, 0))::numeric as volume_kg
from public.program_workouts w
join public.workout_blocks b on b.workout_id = w.id
join public.program_workout_items i on i.block_id = b.id
join public.item_sets s on s.item_id = i.id
left join public.exercise_display d on d.exercise_id = i.exercise_id
join public.variant_muscles_resolved r
  on r.variant_id = coalesce(s.variant_id, i.variant_id, d.variant_id) and not r.redundant
where b.purpose <> 'cooldown'
group by 1, 2, 3, 4;

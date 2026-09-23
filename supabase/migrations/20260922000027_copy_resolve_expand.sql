-- The three verbs that turn a template into workouts on an athlete's calendar:
--   copy_workout / copy_program        duplicate a day, a week, or a whole programme
--   resolve_workout_for_location       choose the variation each item becomes, here
--   expand_enrollment                  write the assignments for the next few weeks
-- assign_program does all three in order, which is what the admin screen will call.

-- In sequence mode an occurrence has no date, and Postgres counts NULLs as distinct, so re-running
-- the generator would have added the same undated workout again every time.
drop index if exists public.assignments_occurrence;
create unique index assignments_occurrence
  on public.assignments (enrollment_id, workout_id, scheduled_for)
  nulls not distinct where enrollment_id is not null;

-- A plan knows who it is for and where it happens; a template knows neither.
alter table public.programs
  add column athlete_id  uuid references auth.users(id) on delete cascade,
  add column location_id uuid references public.locations(id) on delete set null;

create function public.location_kit(p_location uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(equipment_id order by equipment_id), '{}')
  from public.location_equipment where location_id = p_location;
$$;
revoke execute on function public.location_kit(uuid) from public, anon;
grant execute on function public.location_kit(uuid) to authenticated;

-- Deep copy of one workout, with its blocks, items, required attributes and prescribed sets.
-- p_unresolve drops the chosen variations (keeping locked ones), which is what makes a plan saved
-- back to the library portable again instead of demanding the same lever machine forever.
create function public.copy_workout(
  p_source uuid, p_into_program uuid,
  p_position smallint default null, p_day_of_week smallint default null,
  p_week_in_cycle smallint default null, p_scheduled_for date default null,
  p_unresolve boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_workout uuid; v_block uuid; v_item uuid; b record; i record;
begin
  if not public.can_see_workout(p_source) then raise exception 'workout not visible'; end if;
  if not public.owns_program(p_into_program) then raise exception 'not your program'; end if;

  insert into public.program_workouts (program_id, position, names, notes, day_of_week, week_in_cycle, scheduled_for)
  select p_into_program,
         coalesce(p_position, (select coalesce(max(position), 0) + 1 from public.program_workouts where program_id = p_into_program)),
         w.names, w.notes,
         coalesce(p_day_of_week, w.day_of_week),
         coalesce(p_week_in_cycle, w.week_in_cycle),
         coalesce(p_scheduled_for, w.scheduled_for)
  from public.program_workouts w where w.id = p_source
  returning id into v_workout;

  for b in select * from public.workout_blocks where workout_id = p_source order by position loop
    insert into public.workout_blocks (workout_id, position, purpose, mode, rounds, names, notes,
                                       rest_between_items_s, rest_between_rounds_s, rest_after_s, params)
    values (v_workout, b.position, b.purpose, b.mode, b.rounds, b.names, b.notes,
            b.rest_between_items_s, b.rest_between_rounds_s, b.rest_after_s, b.params)
    returning id into v_block;

    for i in select * from public.program_workout_items where block_id = b.id order by position loop
      insert into public.program_workout_items (workout_id, block_id, position, exercise_id, variant_id,
                                                variant_locked, source_item_id, notes)
      values (v_workout, v_block, i.position, i.exercise_id,
              case when p_unresolve and not i.variant_locked then null else i.variant_id end,
              i.variant_locked, i.id, i.notes)
      returning id into v_item;

      insert into public.item_attributes (item_id, dimension_id, value)
      select v_item, dimension_id, value from public.item_attributes where item_id = i.id;

      insert into public.item_sets (item_id, set_number, kind, reps_min, reps_max, duration_seconds, distance_m,
                                    reps_per_side, load_kg, load_percent_1rm, rpe, tempo, rest_seconds,
                                    side, other_side, variant_id, notes, params)
      select v_item, set_number, kind, reps_min, reps_max, duration_seconds, distance_m,
             reps_per_side, load_kg, load_percent_1rm, rpe, tempo, rest_seconds,
             side, other_side,
             case when p_unresolve then null else variant_id end,
             notes, params
      from public.item_sets where item_id = i.id;
    end loop;
  end loop;
  return v_workout;
end $$;
revoke execute on function public.copy_workout(uuid, uuid, smallint, smallint, smallint, date, boolean) from public, anon;
grant execute on function public.copy_workout(uuid, uuid, smallint, smallint, smallint, date, boolean) to authenticated;

create function public.copy_program(
  p_source uuid, p_as_template boolean default false, p_names jsonb default null,
  p_athlete uuid default null, p_location uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_program uuid; w record;
begin
  if not public.can_see_program(p_source) then raise exception 'program not visible'; end if;

  insert into public.programs (coach_id, athlete_id, location_id, is_template, visibility, forked_from,
                               names, descriptions, schedule_mode, cycle_weeks, weeks_total, track_mode,
                               goal, level, days_per_week, weeks, tags)
  select auth.uid(), p_athlete, p_location, p_as_template, 'private', p.id,
         coalesce(p_names, p.names), p.descriptions, p.schedule_mode, p.cycle_weeks, p.weeks_total, p.track_mode,
         p.goal, p.level, p.days_per_week, p.weeks, p.tags
  from public.programs p where p.id = p_source
  returning id into v_program;

  for w in select id, position from public.program_workouts where program_id = p_source order by position loop
    perform public.copy_workout(w.id, v_program, w.position, null, null, null, p_as_template);
  end loop;
  return v_program;
end $$;
revoke execute on function public.copy_program(uuid, boolean, jsonb, uuid, uuid) from public, anon;
grant execute on function public.copy_program(uuid, boolean, jsonb, uuid, uuid) to authenticated;

-- Choose the variation each item becomes at this location.
-- Best equipment rank first (your priority), then the plainest match. When nothing at the location
-- fits, the substitution engine answers instead and the item says so; it never comes back empty.
create function public.resolve_workout_for_location(p_workout uuid, p_location uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_kit text[] := public.location_kit(p_location);
  v_count int := 0;
  i record; v_variant text; v_intended text; v_sub record; v_needs numeric; v_has numeric;
begin
  if not public.owns_workout(p_workout) then raise exception 'not your workout'; end if;

  for i in select * from public.program_workout_items where workout_id = p_workout and not variant_locked loop
    -- what this location can actually do, honouring the item's required attributes
    select c.variant_id into v_variant
    from public.variant_fingerprint c
    where c.exercise_id = i.exercise_id and c.duplicate_of is null and c.equipment_ids <@ v_kit
      and not exists (
        select 1 from public.item_attributes ia where ia.item_id = i.id
          and not exists (select 1 from public.variant_attributes va
                          where va.variant_id = c.variant_id
                            and va.dimension_id = ia.dimension_id and va.value = ia.value))
    order by (select coalesce(max(le.rank), 99) from public.location_equipment le
              where le.location_id = p_location and le.equipment_id = any (c.equipment_ids)),
             c.attr_count, (c.variant_label is null) desc, c.equipment_count, c.variant_id
    limit 1;

    if v_variant is not null then
      update public.program_workout_items
      set variant_id = v_variant, substitution_level = null, substitution_note = '{}'
      where id = i.id;
    else
      -- what the coach meant, ignoring the kit, then the nearest thing this place can do
      select c.variant_id into v_intended
      from public.variant_fingerprint c
      where c.exercise_id = i.exercise_id and c.duplicate_of is null
        and not exists (
          select 1 from public.item_attributes ia where ia.item_id = i.id
            and not exists (select 1 from public.variant_attributes va
                            where va.variant_id = c.variant_id
                              and va.dimension_id = ia.dimension_id and va.value = ia.value))
      order by c.attr_count, (c.variant_label is null) desc, c.equipment_rank, c.variant_id
      limit 1;

      select * into v_sub from public.substitutes_for_variant(v_intended, v_kit, 1)
      order by level, score desc limit 1;

      if v_sub.variant_id is not null then
        update public.program_workout_items
        set variant_id = v_sub.variant_id, substitution_level = v_sub.level,
            substitution_note = jsonb_build_object('status', 'substituted', 'from', v_intended,
                                                   'basis', v_sub.basis, 'notes', v_sub.notes)
        where id = i.id;
      else
        -- nothing here comes close: keep what was meant and say so rather than invent something
        update public.program_workout_items
        set variant_id = v_intended, substitution_level = null,
            substitution_note = jsonb_build_object('status', 'unavailable')
        where id = i.id;
      end if;
    end if;
    v_count := v_count + 1;
  end loop;

  -- A prescribed load heavier than this place owns is flagged, never quietly rewritten.
  for i in select it.id, it.variant_id, max(s.load_kg) as needs
           from public.program_workout_items it join public.item_sets s on s.item_id = it.id
           where it.workout_id = p_workout and s.load_kg is not null
           group by it.id, it.variant_id loop
    select min(le.max_load_kg) into v_has
    from public.location_equipment le
    join public.variant_equipment ve on ve.equipment_id = le.equipment_id and ve.variant_id = i.variant_id
    where le.location_id = p_location and le.max_load_kg is not null;
    if v_has is not null and i.needs > v_has then
      update public.program_workout_items
      set substitution_note = substitution_note || jsonb_build_object(
            'load_warning', jsonb_build_object('needs_kg', i.needs, 'available_kg', v_has))
      where id = i.id;
    end if;
  end loop;
  return v_count;
end $$;
revoke execute on function public.resolve_workout_for_location(uuid, uuid) from public, anon;
grant execute on function public.resolve_workout_for_location(uuid, uuid) to authenticated;

-- Write the assignments this enrollment implies, up to a horizon. Safe to run again: the unique
-- index on (enrollment, workout, date) makes a second run a no-op, so a screen can just call it.
create function public.expand_enrollment(p_enrollment uuid, p_through date default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  e record; p record; v_through date; v_week int; v_date date; v_monday date; v_added int := 0; w record;
begin
  select * into e from public.program_enrollments where id = p_enrollment;
  if not found then raise exception 'no such enrollment'; end if;
  if not (e.athlete_id = auth.uid() or public.is_coach_of(e.athlete_id) or e.created_by = auth.uid()) then
    raise exception 'not your enrollment';
  end if;
  if e.status <> 'active' then return 0; end if;

  select * into p from public.programs where id = e.program_id;
  v_through := least(coalesce(p_through, current_date + 28), coalesce(e.end_date, date '9999-12-31'));

  if p.schedule_mode = 'weekly' then
    -- the cycle starts on the Monday of the week the athlete started in; earlier days are skipped
    v_monday := e.start_date - ((extract(isodow from e.start_date)::int) - 1);
    v_week := 0;
    while v_monday + v_week * 7 <= v_through loop
      exit when p.weeks_total is not null and v_week >= p.weeks_total;
      for w in select * from public.program_workouts
               where program_id = p.id and day_of_week is not null
                 and week_in_cycle = (v_week % p.cycle_weeks) + 1 loop
        v_date := v_monday + v_week * 7 + (w.day_of_week - 1);
        if v_date >= e.start_date and v_date <= v_through then
          insert into public.assignments (workout_id, athlete_id, assigned_by, scheduled_for, enrollment_id, location_id)
          values (w.id, e.athlete_id, e.created_by, v_date, e.id, e.location_id)
          on conflict do nothing;
          if found then v_added := v_added + 1; end if;
        end if;
      end loop;
      v_week := v_week + 1;
    end loop;

  elsif p.schedule_mode = 'dated' then
    for w in select * from public.program_workouts
             where program_id = p.id and scheduled_for is not null
               and scheduled_for between e.start_date and v_through loop
      insert into public.assignments (workout_id, athlete_id, assigned_by, scheduled_for, enrollment_id, location_id)
      values (w.id, e.athlete_id, e.created_by, w.scheduled_for, e.id, e.location_id)
      on conflict do nothing;
      if found then v_added := v_added + 1; end if;
    end loop;

  else   -- sequence: no dates, the athlete works through them in order
    for w in select * from public.program_workouts where program_id = p.id order by position loop
      insert into public.assignments (workout_id, athlete_id, assigned_by, scheduled_for, enrollment_id, location_id)
      values (w.id, e.athlete_id, e.created_by, null, e.id, e.location_id)
      on conflict do nothing;
      if found then v_added := v_added + 1; end if;
    end loop;
  end if;
  return v_added;
end $$;
revoke execute on function public.expand_enrollment(uuid, date) from public, anon;
grant execute on function public.expand_enrollment(uuid, date) to authenticated;

-- Template in, calendar out: fork, resolve for the place, enrol, and generate the first weeks.
create function public.assign_program(
  p_program uuid, p_athlete uuid, p_location uuid, p_start date default current_date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_plan uuid; v_enrollment uuid; w record;
begin
  if not (p_athlete = auth.uid() or public.is_coach_of(p_athlete)) then
    raise exception 'not your athlete';
  end if;
  v_plan := public.copy_program(p_program, false, null, p_athlete, p_location);

  for w in select id from public.program_workouts where program_id = v_plan loop
    perform public.resolve_workout_for_location(w.id, p_location);
  end loop;

  insert into public.program_enrollments (program_id, athlete_id, location_id, start_date, created_by)
  values (v_plan, p_athlete, p_location, p_start, auth.uid())
  returning id into v_enrollment;

  perform public.expand_enrollment(v_enrollment);
  return v_enrollment;
end $$;
revoke execute on function public.assign_program(uuid, uuid, uuid, date) from public, anon;
grant execute on function public.assign_program(uuid, uuid, uuid, date) to authenticated;

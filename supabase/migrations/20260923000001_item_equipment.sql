-- Equipment is the first thing a coach varies: "dumbbell lateral raise", not "lateral raise with
-- a bench angle". It was the one axis the item could not state, because equipment belongs to a
-- variation rather than to the variation vocabulary.
--
-- This is a requirement, not a lock: ask for a dumbbell and the resolver picks a dumbbell variation
-- at whatever place the athlete trains, or falls through to the substitution engine when there is
-- none. Locking an exact variation is still variant_locked.
create table public.item_equipment (
  item_id      uuid not null references public.program_workout_items(id) on delete cascade,
  equipment_id text not null references public.equipment(id) on delete cascade,
  primary key (item_id, equipment_id)
);
alter table public.item_equipment enable row level security;
create policy "Item equipment: follow the workout" on public.item_equipment for select to authenticated
  using (public.can_see_workout(public.item_workout(item_id)));
create policy "Item equipment: owner edits" on public.item_equipment for all to authenticated
  using (public.owns_workout(public.item_workout(item_id)))
  with check (public.owns_workout(public.item_workout(item_id)));

-- The resolver honours it: the variation must include what was asked for, and still fit the place.
create or replace function public.resolve_workout_for_location(p_workout uuid, p_location uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_kit text[] := public.location_kit(p_location);
  v_count int := 0;
  i record; v_variant text; v_intended text; v_sub record; v_has numeric; v_wanted text[];
begin
  if not public.owns_workout(p_workout) then raise exception 'not your workout'; end if;

  for i in select * from public.program_workout_items where workout_id = p_workout and not variant_locked loop
    select coalesce(array_agg(equipment_id), '{}') into v_wanted
    from public.item_equipment where item_id = i.id;

    -- what this location can do, honouring the required attributes and the required equipment
    select c.variant_id into v_variant
    from public.variant_fingerprint c
    where c.exercise_id = i.exercise_id and c.duplicate_of is null
      and c.equipment_ids <@ v_kit and v_wanted <@ c.equipment_ids
      and not exists (
        select 1 from public.item_attributes ia where ia.item_id = i.id
          and not exists (select 1 from public.variant_attributes va
                          where va.variant_id = c.variant_id
                            and va.dimension_id = ia.dimension_id and va.value = ia.value))
    order by c.attr_count, (c.variant_label is null) desc,
             (select coalesce(max(le.rank), 99) from public.location_equipment le
              where le.location_id = p_location and le.equipment_id = any (c.equipment_ids)),
             c.equipment_count, c.variant_id
    limit 1;

    if v_variant is not null then
      update public.program_workout_items
      set variant_id = v_variant, substitution_level = null, substitution_note = '{}'
      where id = i.id;
    else
      -- what the coach meant, ignoring the kit at hand, then the nearest thing this place can do
      select c.variant_id into v_intended
      from public.variant_fingerprint c
      where c.exercise_id = i.exercise_id and c.duplicate_of is null
        and v_wanted <@ c.equipment_ids
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

-- A copied workout must carry the equipment the coach asked for, like its attributes and sets.
create or replace function public.copy_workout(
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

      insert into public.item_equipment (item_id, equipment_id)
      select v_item, equipment_id from public.item_equipment where item_id = i.id;

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

-- Resolution ranked the cheapest kit first, which chose a ONE ARM barbell bench press over the
-- plain one (a bar alone outranks bar + bench) and a Pendlay row over an ordinary row. A coach who
-- wrote "bench press" means the ordinary bench press; the ranking you gave your equipment decides
-- between options that are equally ordinary, it does not get to pick a different exercise.
-- Plainness first, then your priority.
-- Choose the variation each item becomes at this location: the plainest match first, the kit you
-- ranked highest to break ties. When nothing here fits, the substitution engine answers instead and
-- the item says so; it never comes back empty.
create or replace function public.resolve_workout_for_location(p_workout uuid, p_location uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_kit text[] := public.location_kit(p_location);
  v_count int := 0;
  i record; v_variant text; v_intended text; v_sub record; v_has numeric;
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

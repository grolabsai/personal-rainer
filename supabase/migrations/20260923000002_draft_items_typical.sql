-- An item should never start blank: a dropped or drafted exercise arrives as its typical variation,
-- the one the catalog says is usual and the one whose picture is on the card. It is not locked, so
-- the athlete's place can still change it — it is a starting point, not a decision.
create or replace function public.create_program_from_json(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_prog uuid; v_w uuid; v_b uuid; v_i uuid;
  w jsonb; b jsonb; i jsonb; s jsonb; a jsonb;
  wp int := 0; bp int; ip int; sn int;
begin
  if public.app_role() not in ('coach', 'admin') then raise exception 'coaches only'; end if;

  insert into public.programs (coach_id, is_template, visibility, names, descriptions, schedule_mode,
                               cycle_weeks, track_mode, goal, level, days_per_week, weeks, tags)
  values (auth.uid(), true, 'private',
          coalesce(p->'names', '{"en":"Draft"}'), coalesce(p->'descriptions', '{}'),
          coalesce(p->>'schedule_mode', 'weekly'), coalesce((p->>'cycle_weeks')::int, 1),
          coalesce(p->>'track_mode', 'full'), p->>'goal', p->>'level',
          (p->>'days_per_week')::int, (p->>'weeks')::int,
          coalesce(array(select jsonb_array_elements_text(p->'tags')), '{}'))
  returning id into v_prog;

  for w in select * from jsonb_array_elements(coalesce(p->'workouts', '[]')) loop
    wp := wp + 1;
    insert into public.program_workouts (program_id, position, names, notes, day_of_week, week_in_cycle)
    values (v_prog, wp, coalesce(w->'names', '{"en":"Day"}'), coalesce(w->'notes', '{}'),
            (w->>'day_of_week')::int, coalesce((w->>'week_in_cycle')::int, 1))
    returning id into v_w;

    bp := 0;
    for b in select * from jsonb_array_elements(coalesce(w->'blocks', '[]')) loop
      bp := bp + 1;
      insert into public.workout_blocks (workout_id, position, purpose, mode, rounds, names, notes,
                                         rest_between_items_s, rest_between_rounds_s, rest_after_s)
      values (v_w, bp, coalesce(b->>'purpose', 'main'), coalesce(b->>'mode', 'straight'),
              case when coalesce(b->>'mode', 'straight') = 'rounds' then coalesce((b->>'rounds')::int, 3) end,
              coalesce(b->'names', '{}'), coalesce(b->'notes', '{}'),
              coalesce((b->>'rest_between_items_s')::int, 0),
              coalesce((b->>'rest_between_rounds_s')::int, 0),
              coalesce((b->>'rest_after_s')::int, 0))
      returning id into v_b;

      ip := 0;
      for i in select * from jsonb_array_elements(coalesce(b->'items', '[]')) loop
        ip := ip + 1;
        insert into public.program_workout_items (workout_id, block_id, position, exercise_id, variant_id, notes)
        values (v_w, v_b, ip, i->>'exercise_id',
                (select d.variant_id from public.exercise_display d where d.exercise_id = i->>'exercise_id'),
                coalesce(i->'notes', '{}'))
        returning id into v_i;

        for a in select * from jsonb_array_elements(coalesce(i->'attributes', '[]')) loop
          insert into public.item_attributes (item_id, dimension_id, value)
          values (v_i, a->>'dimension_id', a->>'value');
        end loop;

        for a in select * from jsonb_array_elements(coalesce(i->'equipment', '[]')) loop
          insert into public.item_equipment (item_id, equipment_id) values (v_i, a#>>'{}');
        end loop;

        sn := 0;
        for s in select * from jsonb_array_elements(coalesce(i->'sets', '[]')) loop
          sn := sn + 1;
          insert into public.item_sets (item_id, set_number, kind, reps_min, reps_max, duration_seconds,
                                        reps_per_side, load_kg, load_percent_1rm, rpe, tempo,
                                        rest_seconds, side, other_side, notes)
          values (v_i, sn, coalesce(s->>'kind', 'working'),
                  coalesce((s->>'reps_min')::int,
                           case when s->>'duration_seconds' is null and coalesce(s->>'kind','working') <> 'amrap'
                                then 12 end),
                  (s->>'reps_max')::int, (s->>'duration_seconds')::int,
                  coalesce((s->>'reps_per_side')::boolean, false),
                  (s->>'load_kg')::numeric, (s->>'load_percent_1rm')::int, (s->>'rpe')::numeric,
                  s->>'tempo', coalesce((s->>'rest_seconds')::int, 90),
                  coalesce(s->>'side', 'both'), s->>'other_side', coalesce(s->'notes', '{}'));
        end loop;
      end loop;
    end loop;
  end loop;
  return v_prog;
end $$;

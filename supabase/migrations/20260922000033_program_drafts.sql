-- The AI drafting window: what the coach asked for, what came back, and a way to turn an accepted
-- draft into a real template in one transaction.
--
-- The model never writes to the database. It returns a draft, which is validated, shown to the
-- coach, and only then inserted — through the same constraints and RLS as a hand-built template.
-- Keeping the prompt and the response costs nothing and buys three things: the coach can iterate
-- without losing the previous version, we can see which prompts produce drafts that get heavily
-- edited, and there is a record of advice that reached a real person.
create table public.program_drafts (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null references auth.users(id) on delete cascade,
  prompt        text not null,
  params        jsonb not null default '{}',          -- weeks, days, goal, level, place
  response      jsonb,                                -- the draft, in the shape below
  status        text not null default 'draft' check (status in ('draft', 'accepted', 'discarded', 'failed')),
  program_id    uuid references public.programs(id) on delete set null,
  model         text,
  input_tokens  integer,
  output_tokens integer,
  error         text,
  created_at    timestamptz not null default now()
);
create index program_drafts_coach on public.program_drafts (coach_id, created_at desc);
alter table public.program_drafts enable row level security;
create policy "Drafts: mine" on public.program_drafts for all to authenticated
  using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()));

-- A draft (or any JSON in this shape) becomes a template. Every value goes through the ordinary
-- columns and checks, so a malformed draft fails the whole insert rather than half-writing one.
create function public.create_program_from_json(p jsonb) returns uuid
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
        insert into public.program_workout_items (workout_id, block_id, position, exercise_id, notes)
        values (v_w, v_b, ip, i->>'exercise_id', coalesce(i->'notes', '{}'))
        returning id into v_i;

        for a in select * from jsonb_array_elements(coalesce(i->'attributes', '[]')) loop
          insert into public.item_attributes (item_id, dimension_id, value)
          values (v_i, a->>'dimension_id', a->>'value');
        end loop;

        sn := 0;
        for s in select * from jsonb_array_elements(coalesce(i->'sets', '[]')) loop
          sn := sn + 1;
          insert into public.item_sets (item_id, set_number, kind, reps_min, reps_max, duration_seconds,
                                        reps_per_side, load_kg, load_percent_1rm, rpe, tempo,
                                        rest_seconds, side, other_side, notes)
          values (v_i, sn, coalesce(s->>'kind', 'working'),
                  (s->>'reps_min')::int, (s->>'reps_max')::int, (s->>'duration_seconds')::int,
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
revoke execute on function public.create_program_from_json(jsonb) from public, anon;
grant execute on function public.create_program_from_json(jsonb) to authenticated;

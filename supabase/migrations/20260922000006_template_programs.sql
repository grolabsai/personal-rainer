-- Demo template programs, visible to every signed-in user, so the athlete app can be tried before a
-- coach has programmed anything. Items point at exercise variations (exercise_variants.id).

create function pg_temp.add_program(p_names jsonb, p_desc jsonb, p_workouts jsonb) returns void
language plpgsql as $$
declare
  prog uuid; wk uuid; w jsonb; it jsonb; wpos int := 0; ipos int;
begin
  insert into public.programs (is_template, names, descriptions) values (true, p_names, p_desc) returning id into prog;
  for w in select * from jsonb_array_elements(p_workouts) loop
    wpos := wpos + 1;
    insert into public.program_workouts (program_id, position, names) values (prog, wpos, w->'names') returning id into wk;
    ipos := 0;
    for it in select * from jsonb_array_elements(w->'items') loop
      ipos := ipos + 1;
      insert into public.program_workout_items (workout_id, position, variant_id, sets, reps, weight_kg, rest_seconds)
      values (wk, ipos, it->>0, (it->>1)::smallint, it->>2, nullif(it->>3, '')::numeric, (it->>4)::smallint);
    end loop;
  end loop;
end $$;

-- items: [variant id, sets, reps, weight kg ('' = athlete chooses), rest seconds]
select pg_temp.add_program(
  '{"en": "Full body · Gym", "es": "Cuerpo completo · Gimnasio"}',
  '{"en": "Two alternating full-body sessions with barbell, cable and machine basics.", "es": "Dos sesiones alternas de cuerpo completo con básicos de barra, polea y máquina."}',
  '[{"names": {"en": "Day A · Squat and press", "es": "Día A · Sentadilla y press"},
     "items": [["0043", 4, "6-8", "", 150], ["0025", 4, "6-8", "", 150], ["0027", 3, "8-10", "", 120],
               ["0105", 3, "8", "", 120], ["0705", 3, "30 s", "", 60]]},
    {"names": {"en": "Day B · Hinge and pull", "es": "Día B · Bisagra y tirón"},
     "items": [["0032", 3, "5", "", 180], ["0047", 3, "8-10", "", 120], ["0198", 3, "10", "", 90],
               ["0336", 3, "10", "", 90], ["0201", 3, "12", "", 60]]}]');

select pg_temp.add_program(
  '{"en": "Home · Bodyweight", "es": "Casa · Peso corporal"}',
  '{"en": "No equipment. A short circuit for the whole body.", "es": "Sin equipamiento. Un circuito corto para todo el cuerpo."}',
  '[{"names": {"en": "Bodyweight circuit", "es": "Circuito con peso corporal"},
     "items": [["0662", 3, "10-15", "", 60], ["2368", 3, "10", "", 60], ["3013", 3, "15", "", 60],
               ["1460", 3, "12", "", 60], ["3699", 3, "40 s", "", 45], ["0687", 3, "20", "", 45]]}]');

select pg_temp.add_program(
  '{"en": "Dumbbells only", "es": "Solo mancuernas"}',
  '{"en": "A full session with a pair of dumbbells and a bench.", "es": "Una sesión completa con un par de mancuernas y un banco."}',
  '[{"names": {"en": "Dumbbell full body", "es": "Cuerpo completo con mancuernas"},
     "items": [["0413", 3, "12", "", 90], ["0289", 3, "10", "", 90], ["0293", 3, "10", "", 90],
               ["0405", 3, "10", "", 90], ["0294", 3, "12", "", 60], ["0430", 3, "12", "", 60]]}]');

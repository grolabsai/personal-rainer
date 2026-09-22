-- Imports the exercise catalog from exercises-dataset, pinned to a reviewed commit.
-- Run against the project with service-level access (SQL editor, or the Supabase MCP execute_sql).
-- Safe to re-run: it replaces the catalog rows. Keeps English and Spanish text only.
-- Requires muscle_aliases to cover every muscle term; an unknown term fails the foreign key.

create extension if not exists http with schema extensions;
select extensions.http_set_curlopt('CURLOPT_TIMEOUT', '120');

drop table if exists src;
create temp table src as
select e
from extensions.http_get('https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/7455efae41b330c265e7cd4b78dfa848e7ce5ebd/data/exercises.json') r,
     jsonb_array_elements(r.content::jsonb) e
where r.status = 200;

do $$ begin
  if (select count(*) from src) = 0 then raise exception 'Dataset download failed or was empty'; end if;
end $$;

delete from public.exercises;
delete from public.body_parts;
delete from public.equipment;

insert into public.body_parts (id, term, names)
select regexp_replace(t, '[^a-z0-9]+', '-', 'g'), t, jsonb_build_object('en', initcap(t), 'es', es)
from (values
  ('back','Espalda'), ('cardio','Cardio'), ('chest','Pecho'), ('lower arms','Antebrazos'),
  ('lower legs','Parte inferior de las piernas'), ('neck','Cuello'), ('shoulders','Hombros'),
  ('upper arms','Parte superior de los brazos'), ('upper legs','Muslos'), ('waist','Cintura')
) v(t, es);

insert into public.equipment (id, term, names)
select regexp_replace(t, '[^a-z0-9]+', '-', 'g'), t, jsonb_build_object('en', initcap(t), 'es', es)
from (values
  ('body weight','Peso corporal'), ('dumbbell','Mancuerna'), ('cable','Polea'), ('barbell','Barra'),
  ('leverage machine','Máquina de palanca'), ('band','Banda elástica'), ('smith machine','Máquina Smith'),
  ('kettlebell','Pesa rusa'), ('weighted','Con lastre'), ('stability ball','Pelota de estabilidad'),
  ('ez barbell','Barra EZ'), ('assisted','Asistido'), ('sled machine','Máquina de trineo'),
  ('medicine ball','Balón medicinal'), ('rope','Cuerda'), ('roller','Rodillo'),
  ('resistance band','Banda de resistencia'), ('bosu ball','Bosu'), ('olympic barbell','Barra olímpica'),
  ('wheel roller','Rueda abdominal'), ('upper body ergometer','Ergómetro de brazos'),
  ('skierg machine','Máquina SkiErg'), ('hammer','Martillo'), ('stationary bike','Bicicleta estática'),
  ('tire','Neumático'), ('trap bar','Barra hexagonal'), ('elliptical machine','Elíptica'),
  ('stepmill machine','Escaladora')
) v(t, es);

insert into public.exercises (id, name, body_part_id, equipment_id, instructions, instruction_steps,
  media_id, image_path, gif_path, attribution, source_target, source_muscle_group, source_secondary, source_created_at)
select e->>'id', e->>'name', bp.id, eq.id,
       jsonb_build_object('en', e->'instructions'->'en', 'es', e->'instructions'->'es'),
       jsonb_build_object('en', e->'instruction_steps'->'en', 'es', e->'instruction_steps'->'es'),
       e->>'media_id', e->>'image', e->>'gif_url', e->>'attribution',
       e->>'target', e->>'muscle_group',
       array(select jsonb_array_elements_text(e->'secondary_muscles')),
       (e->>'created_at')::timestamptz
from src
join public.body_parts bp on bp.term = e->>'body_part'
join public.equipment eq on eq.term = e->>'equipment';

insert into public.exercise_muscles (exercise_id, role, rank, source_term)
select e->>'id', 'target'::public.muscle_role, 0, e->>'target' from src
union all
select e->>'id', 'secondary'::public.muscle_role, s.ord::smallint, s.term
from src, jsonb_array_elements_text(e->'secondary_muscles') with ordinality s(term, ord);

select public.rebuild_exercise_muscle_index();

drop extension http;

select (select count(*) from src) as in_dataset,
       (select count(*) from public.exercises) as exercises,
       (select count(*) from public.exercise_muscles) as muscle_links,
       (select count(*) from public.exercise_muscle_index) as index_rows;

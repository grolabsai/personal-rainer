-- "Lying" and "Flat" do not say what you are lying on, and ten bench presses listed no bench at
-- all: a home with dumbbells and no bench would have been handed "Bench press · Flat · Close grip
-- — Dumbbell" as if it were doable on the floor, because the resolver matches on equipment alone.
-- The equipment is what carries that fact, so the equipment is what is fixed.
--
-- The same gap runs across the catalog: a skull crusher, a lying dumbbell fly, a pullover and a
-- lying rear delt fly all state "Lying" and list only the weight in the hand.
--
-- And the angle is not a bench's property. An incline push-up tilts with no bench anywhere, and a
-- bent-over row's spine angle is nobody's bench either. Body position and angle are one fact in
-- two parts — the posture, and how far it is tilted — so the dimension is "Angle", they sort
-- together, and the apps give them one colour and one row.

insert into public.variant_equipment (variant_id, equipment_id)
select ev.id, 'bench'
from public.exercise_variants ev
where ev.duplicate_of is null
  and ev.exercise_id = 'bench-press'
  and exists (select 1 from public.variant_attributes a
               where a.variant_id = ev.id and a.dimension_id = 'bench_angle')
  and not exists (select 1 from public.variant_attributes a
                   where a.variant_id = ev.id and a.dimension_id = 'position'
                     and a.value in ('floor', 'standing'))
  and not exists (select 1 from public.variant_equipment e
                   where e.variant_id = ev.id
                     and e.equipment_id in ('bench', 'preacher-bench', 'machine', 'smith-machine',
                                            'stability-ball', 'box', 'bosu', 'cable', 'band'))
on conflict do nothing;

-- Narrow on purpose: only free weights held in the hand, never a cable or a machine (they have
-- their own station), never bodyweight or a band (floor work), never a variation that already says
-- "On the floor". Hip thrust and ball slams are excluded by name: the floor version is the usual one.
insert into public.variant_equipment (variant_id, equipment_id)
select ev.id, 'bench'
from public.exercise_variants ev
where ev.duplicate_of is null
  and ev.exercise_id not in ('hip-thrust', 'slam-throw')
  and exists (select 1 from public.variant_attributes a
               where a.variant_id = ev.id and a.dimension_id = 'position' and a.value = 'lying')
  and not exists (select 1 from public.variant_attributes a
                   where a.variant_id = ev.id and a.dimension_id = 'position'
                     and a.value in ('floor', 'side-lying'))
  and exists (select 1 from public.variant_equipment e
               where e.variant_id = ev.id
                 and e.equipment_id in ('dumbbell', 'barbell', 'kettlebell', 'ez-bar', 'cambered-bar'))
  and not exists (select 1 from public.variant_equipment e
                   where e.variant_id = ev.id
                     and e.equipment_id in ('bench', 'preacher-bench', 'machine', 'smith-machine',
                                            'stability-ball', 'box', 'bosu', 'sled-machine', 'cable'))
on conflict do nothing;

update public.variation_dimensions
   set names = jsonb_build_object('en', 'Angle', 'es', 'Ángulo')
 where id = 'bench_angle';

update public.variation_dimensions set sort_order = v.n from (values
  ('position', 1), ('bench_angle', 2), ('grip', 3), ('grip_width', 4),
  ('laterality', 5), ('stance', 6), ('style', 7)
) as v(id, n) where variation_dimensions.id = v.id;

select public.rebuild_variant_names();
select public.rebuild_exercise_alternatives();

-- Coaches search for the name they say out loud. The catalog calls it "Split squat · Single leg";
-- everyone else calls it a Bulgarian. An alias is a search word only — it never appears in a name,
-- so it cannot make two exercises look like the same one.
alter table public.exercises add column if not exists aliases text[] not null default '{}';

update public.exercises set aliases = v.a from (values
  ('split-squat',      array['bulgarian', 'bulgarian split squat', 'rear foot elevated', 'rfess']),
  ('triceps-extension',array['skull crusher', 'skullcrusher', 'french press', 'nose breaker']),
  ('deadlift',         array['rdl', 'romanian deadlift', 'stiff leg', 'peso muerto']),
  ('hip-thrust',       array['glute bridge', 'puente de glúteo']),
  ('lat-pulldown',     array['pulldown', 'jalón']),
  ('pull-up',          array['chin-up', 'chinup', 'dominada']),
  ('bench-press',      array['press de banca', 'chest press']),
  ('overhead-press',   array['ohp', 'military press', 'shoulder press', 'press militar']),
  ('kettlebell-swing', array['swing ruso', 'russian swing']),
  ('russian-twist',    array['russian twist', 'giro ruso']),
  ('lunge',            array['zancada', 'walking lunge']),
  ('front-raise',      array['elevación frontal']),
  ('lateral-raise',    array['elevación lateral', 'side raise']),
  ('rear-delt-fly',    array['reverse fly', 'pájaro', 'bent-over fly']),
  ('biceps-curl',      array['curl', 'curl de bíceps']),
  ('calf-raise',       array['elevación de talones', 'gemelos'])
) as v(id, a) where exercises.id = v.id;

-- exercise_display gains aliases (appended: a view's columns cannot be reordered in place).
create or replace view public.exercise_display with (security_invoker = true) as
with cand as (
  select c.*, (select count(*) from public.variant_fingerprint d
               where d.exercise_id = c.exercise_id and d.duplicate_of is null
                 and d.equipment_ids = c.equipment_ids) as same_kit
  from public.variant_fingerprint c where c.duplicate_of is null
), worked as (
  select r.exercise_id, public.muscle_at_level(r.muscle_id, 'region') as region, count(*) as n
  from public.exercise_muscles_rolled r
  group by 1, 2
), fallback as (
  select distinct on (worked.exercise_id) worked.exercise_id, worked.region
  from worked where worked.region is not null
  order by worked.exercise_id, (worked.region = 'cardiovascular-system'), worked.n desc, worked.region
)
select distinct on (cand.exercise_id)
       cand.exercise_id, x.names, x.type, x.movement_pattern, x.mechanics, x.is_canonical,
       x.primary_muscle_id,
       coalesce(public.muscle_at_level(x.primary_muscle_id, 'region'), f.region) as region,
       public.muscle_at_level(x.primary_muscle_id, 'group') as muscle_group,
       v.id as variant_id, v.image_path, v.gif_path,
       (select count(*)::int from public.exercise_variants w
        where w.exercise_id = cand.exercise_id and w.duplicate_of is null) as variations,
       x.aliases
from cand
join public.exercise_variants v on v.id = cand.variant_id
join public.exercises x on x.id = cand.exercise_id
left join fallback f on f.exercise_id = cand.exercise_id
order by cand.exercise_id, cand.attr_count, (cand.variant_label is null) desc,
         cand.same_kit desc, cand.equipment_rank, cand.variant_id;

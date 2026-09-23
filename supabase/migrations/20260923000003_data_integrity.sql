-- Three loose ends in the structure itself.
--
-- 1. An item carries both workout_id and block_id, for query convenience, and nothing stopped the
--    two from disagreeing — an item could point at a block in someone else's workout, which every
--    reader would then believe. A composite foreign key makes that impossible.
alter table public.workout_blocks add constraint workout_blocks_id_workout unique (id, workout_id);
alter table public.program_workout_items
  add constraint program_workout_items_block_in_workout
  foreign key (block_id, workout_id) references public.workout_blocks (id, workout_id) on delete cascade;

-- 2. programs.weeks and programs.weeks_total were two columns for one fact, added an hour apart:
--    one for the library card, one for the scheduler. Keeping both guarantees they drift.
update public.programs set weeks_total = coalesce(weeks_total, weeks) where weeks is not null;
alter table public.programs drop column weeks;
comment on column public.programs.weeks_total is
  'How many weeks the programme runs; null repeats until the enrollment is stopped.';

-- 3. Eight exercises had no primary muscle, because the dataset never gave them one — the plain row
--    among them. The muscles they work are known, so the strongest claim across their variations
--    fills it in: the data now says what the view had to infer.
update public.exercises x
set primary_muscle_id = best.muscle_id
from (
  select distinct on (r.exercise_id) r.exercise_id, r.muscle_id
  from public.exercise_muscles_rolled r
  join public.muscles m on m.id = r.muscle_id
  where r.muscle_id is not null
  order by r.exercise_id, (r.role = 'target') desc, r.variations desc,
           array_position(array['group','muscle','head','region']::public.muscle_level[], m.level)
) best
where best.exercise_id = x.id and x.primary_muscle_id is null;

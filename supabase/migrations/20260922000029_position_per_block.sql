-- Items are ordered inside their block, not inside the workout: the first exercise of the warm-up
-- and the first exercise of the main block are both position 1. The old constraint, from before
-- blocks existed, made the second block of any workout impossible to save.
alter table public.program_workout_items drop constraint program_workout_items_workout_id_position_key;
alter table public.program_workout_items add constraint program_workout_items_block_position_key
  unique (block_id, position);

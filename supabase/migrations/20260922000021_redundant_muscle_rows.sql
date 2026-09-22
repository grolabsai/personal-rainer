-- An incline bench press answered "Primary: Clavicular head, Pectorals": the dataset states the
-- whole chest, the emphasis rule adds the upper chest, and both are true — but the second is the
-- same claim, less precisely. On a screen that is noise, and on the body map it paints the whole
-- chest over the part the rule singled out, hiding exactly what makes the variation different.
-- A row is marked redundant when a more precise row for the same muscle says the same or more.
-- Nothing is deleted: a coach's view can still show where a claim came from.
alter table public.variant_muscles_resolved add column redundant boolean not null default false;
create index variant_muscles_resolved_shown on public.variant_muscles_resolved (variant_id)
  where not redundant;

create or replace function public.rebuild_variant_muscles_resolved() returns void
language sql set search_path = '' as $$
  delete from public.variant_muscles_resolved;
  insert into public.variant_muscles_resolved (variant_id, muscle_id, role, detail_level, notes)
  select variant_id, muscle_id, role, detail_level, notes from public.variant_muscles_best;
  update public.variant_muscles_resolved r set redundant = true
  where exists (
    select 1 from public.variant_muscles_resolved s
    join public.muscle_paths p
      on p.ancestor_id = r.muscle_id and p.descendant_id = s.muscle_id and p.depth > 0
    where s.variant_id = r.variant_id and (s.role = r.role or s.role = 'target'));
$$;
select public.rebuild_variant_muscles_resolved();

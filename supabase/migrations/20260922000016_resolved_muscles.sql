-- The ladder, materialised. variant_muscles_best is a view over the whole catalog, and comparing
-- two variations reads it twice per candidate, so a detail screen was costing ~300 ms. The result
-- only changes when the dataset, the attributes or the emphasis rules change, which is a rebuild,
-- exactly like exercise_muscle_index. Rebuild after editing emphasis_rules or variant_attributes:
--   select public.rebuild_variant_muscles_resolved();
create table public.variant_muscles_resolved (
  variant_id   text not null references public.exercise_variants(id) on delete cascade,
  muscle_id    text not null references public.muscles(id),
  role         text not null,
  detail_level text not null,
  notes        jsonb,
  primary key (variant_id, muscle_id)
);
create index variant_muscles_resolved_muscle on public.variant_muscles_resolved (muscle_id, role);
alter table public.variant_muscles_resolved enable row level security;
create policy "Catalog: public read" on public.variant_muscles_resolved
  for select to anon, authenticated using (true);

create function public.rebuild_variant_muscles_resolved() returns void
language sql set search_path = '' as $$
  delete from public.variant_muscles_resolved;
  insert into public.variant_muscles_resolved (variant_id, muscle_id, role, detail_level, notes)
  select variant_id, muscle_id, role, detail_level, notes from public.variant_muscles_best;
$$;
revoke execute on function public.rebuild_variant_muscles_resolved() from public, anon, authenticated;
select public.rebuild_variant_muscles_resolved();

-- Both readers now hit the table. variant_muscles_best stays as the definition of the ladder.
create or replace function public.muscles_for_variant(p_variant text)
returns table (muscle_id text, role text, detail_level text, notes jsonb)
language sql stable set search_path = '' as $$
  select muscle_id, role, detail_level, notes
  from public.variant_muscles_resolved where variant_id = p_variant;
$$;

create or replace function public.variant_muscle_diff(p_from text, p_to text)
returns jsonb language sql stable set search_path = '' as $$
  with f as (select muscle_id, role from public.variant_muscles_resolved where variant_id = p_from),
       t as (select muscle_id, role from public.variant_muscles_resolved where variant_id = p_to),
  related as (   -- one side says 'chest', the other 'pectorals': the same claim, not a change
    select f.muscle_id as f_id, t.muscle_id as t_id
    from f join t on exists (
      select 1 from public.muscle_paths p
      where (p.ancestor_id = f.muscle_id and p.descendant_id = t.muscle_id)
         or (p.ancestor_id = t.muscle_id and p.descendant_id = f.muscle_id))
  ),
  d as (
    select coalesce(f.muscle_id, t.muscle_id) as muscle_id,
           case
             when f.muscle_id is null then
               case when exists (select 1 from related r where r.t_id = t.muscle_id)
                    then null else 'added' end
             when t.muscle_id is null then
               case when exists (select 1 from related r where r.f_id = f.muscle_id)
                    then null else 'dropped' end
             when f.role = 'secondary' and t.role = 'target' then 'promoted'
             when f.role = 'target' and t.role = 'secondary' then 'demoted'
           end as change
    from f full join t on t.muscle_id = f.muscle_id
  )
  select coalesce(jsonb_object_agg(change, ids), '{}'::jsonb)
  from (select change, jsonb_agg(m.id order by m.sort_order) as ids
        from d join public.muscles m on m.id = d.muscle_id
        where change is not null group by change) g;
$$;

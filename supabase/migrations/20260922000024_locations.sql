-- Where an athlete trains, and what is there.
--
-- A flat per-athlete equipment list could not answer "what can I do today", because the answer is
-- different at the gym and at home. A location is a place plus its kit, and the kit is ranked: when
-- two variations are both possible, the one using the equipment you reach for first wins.
--
-- Locations are private by default and editable by the owner or a coach they have linked to.
-- Public ones (a chain gym, a park) save everyone enumerating forty machines; adopting one forks it,
-- so an edit by a stranger never changes what someone's plan resolves to.

create table public.locations (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid references auth.users(id) on delete cascade,   -- null only for curated public places
  visibility         text not null default 'private' check (visibility in ('private', 'public')),
  names              jsonb not null,                                     -- {"en": ..., "es": ...}
  kind               text not null default 'gym'
                       check (kind in ('gym', 'home', 'studio', 'park', 'hotel', 'other')),
  city               text,
  notes              jsonb not null default '{}',
  source_location_id uuid references public.locations(id) on delete set null,  -- forked from
  verified           boolean not null default false,                     -- someone has checked the kit
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  check (visibility = 'public' or owner_id is not null)
);
create index locations_owner on public.locations (owner_id);
create index locations_public on public.locations (visibility) where visibility = 'public';

create table public.location_equipment (
  location_id  uuid not null references public.locations(id) on delete cascade,
  equipment_id text not null references public.equipment(id) on delete cascade,
  rank         smallint not null default 100,   -- 0 = reach for it first
  max_load_kg  numeric(6,2),                    -- the heaviest dumbbell in the rack, say
  quantity     smallint,
  notes        text,
  primary key (location_id, equipment_id)
);
create index location_equipment_rank on public.location_equipment (location_id, rank);

-- The places a person uses: the ones they own, plus public ones they have adopted.
create table public.user_locations (
  user_id     uuid not null references auth.users(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  is_default  boolean not null default false,
  rank        smallint not null default 0,
  primary key (user_id, location_id)
);
create unique index user_locations_one_default on public.user_locations (user_id) where is_default;

-- Visibility and editing, as SECURITY DEFINER predicates: a policy that reads another table
-- through a subquery recurses (migration 0008 learned this the hard way).
create function public.can_see_location(p_location uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.locations l
    where l.id = p_location
      and (l.visibility = 'public' or l.owner_id = auth.uid() or public.is_coach_of(l.owner_id)));
$$;
revoke execute on function public.can_see_location(uuid) from public, anon;
grant execute on function public.can_see_location(uuid) to authenticated;

create function public.can_edit_location(p_location uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.locations l
    where l.id = p_location
      and l.owner_id is not null
      and (l.owner_id = auth.uid() or public.is_coach_of(l.owner_id)));
$$;
revoke execute on function public.can_edit_location(uuid) from public, anon;
grant execute on function public.can_edit_location(uuid) to authenticated;

alter table public.locations enable row level security;
alter table public.location_equipment enable row level security;
alter table public.user_locations enable row level security;

create policy "Locations: see own, coached and public" on public.locations for select to authenticated
  using (visibility = 'public' or owner_id = (select auth.uid()) or public.is_coach_of(owner_id));
create policy "Locations: create own or for an athlete" on public.locations for insert to authenticated
  with check (owner_id = (select auth.uid()) or public.is_coach_of(owner_id));
create policy "Locations: owner and coach edit" on public.locations for update to authenticated
  using (public.can_edit_location(id)) with check (public.can_edit_location(id));
create policy "Locations: owner and coach delete" on public.locations for delete to authenticated
  using (public.can_edit_location(id));

create policy "Location kit: follows the location" on public.location_equipment for select to authenticated
  using (public.can_see_location(location_id));
create policy "Location kit: owner and coach edit" on public.location_equipment for all to authenticated
  using (public.can_edit_location(location_id)) with check (public.can_edit_location(location_id));

create policy "My places: mine" on public.user_locations for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "My places: coach reads" on public.user_locations for select to authenticated
  using (public.is_coach_of(user_id));

-- Adopting a public place copies it, kit and all, so later edits upstream cannot move the ground.
create function public.fork_location(p_source uuid, p_names jsonb default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_new uuid;
begin
  if not public.can_see_location(p_source) then
    raise exception 'location not visible';
  end if;
  insert into public.locations (owner_id, visibility, names, kind, city, notes, source_location_id, created_by)
  select auth.uid(), 'private', coalesce(p_names, l.names), l.kind, l.city, l.notes, l.id, auth.uid()
  from public.locations l where l.id = p_source
  returning id into v_new;

  insert into public.location_equipment (location_id, equipment_id, rank, max_load_kg, quantity, notes)
  select v_new, equipment_id, rank, max_load_kg, quantity, notes
  from public.location_equipment where location_id = p_source;

  insert into public.user_locations (user_id, location_id, is_default)
  values (auth.uid(), v_new, not exists (select 1 from public.user_locations where user_id = auth.uid()));
  return v_new;
end $$;
revoke execute on function public.fork_location(uuid, jsonb) from public, anon;
grant execute on function public.fork_location(uuid, jsonb) to authenticated;

-- What athletes had already ticked becomes their first place, ranked by how ordinary the kit is.
do $$
declare r record; v_location uuid;
begin
  for r in select distinct athlete_id from public.athlete_equipment loop
    insert into public.locations (owner_id, visibility, names, kind, created_by)
    values (r.athlete_id, 'private', '{"en":"My equipment","es":"Mi material"}', 'other', r.athlete_id)
    returning id into v_location;
    insert into public.location_equipment (location_id, equipment_id, rank)
    select v_location, ae.equipment_id, e.sort_order
    from public.athlete_equipment ae join public.equipment e on e.id = ae.equipment_id
    where ae.athlete_id = r.athlete_id;
    insert into public.user_locations (user_id, location_id, is_default) values (r.athlete_id, v_location, true);
  end loop;
end $$;
drop table public.athlete_equipment;

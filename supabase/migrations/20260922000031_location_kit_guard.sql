-- location_kit() answered for any location id, so a guessed uuid would reveal a private gym's
-- equipment list. It is a SECURITY DEFINER helper, so it has to make the check itself.
create or replace function public.location_kit(p_location uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(le.equipment_id order by le.equipment_id), '{}')
  from public.location_equipment le
  where le.location_id = p_location and public.can_see_location(p_location);
$$;

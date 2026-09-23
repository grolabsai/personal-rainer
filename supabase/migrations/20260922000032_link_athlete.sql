-- A coach needs a way to take on an athlete. Profiles are private and auth.users is not exposed, so
-- the lookup happens here: by the email the athlete signed up with, and only for a coach.
-- The athlete keeps the relationship visible (coach_athletes is readable by both) and the coach sees
-- only what the RLS policies already allow: their profile, their places, their sessions.
create function public.link_athlete_by_email(p_email text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_athlete uuid;
begin
  if public.app_role() not in ('coach', 'admin') then raise exception 'coaches only'; end if;
  select id into v_athlete from auth.users where lower(email) = lower(trim(p_email));
  if v_athlete is null then raise exception 'no account with that email'; end if;
  if v_athlete = auth.uid() then
    -- a coach trying their own account: allowed, it is how you test your own programmes
    null;
  end if;
  insert into public.coach_athletes (coach_id, athlete_id) values (auth.uid(), v_athlete)
  on conflict do nothing;
  return v_athlete;
end $$;
revoke execute on function public.link_athlete_by_email(text) from public, anon;
grant execute on function public.link_athlete_by_email(text) to authenticated;

-- The guard says "only service_role (dashboard, migrations, admin tools) may change role", but it
-- tested auth.role(), which only exists on a request that came through the API. A direct database
-- session — the dashboard SQL editor, a migration, psql — has no JWT, so it failed the test and the
-- update was silently reverted: making someone a coach looked like it worked and did nothing.
-- The rule is really "an API caller may not promote itself", so that is what it now tests: only the
-- two roles PostgREST uses for ordinary callers are held back.
create or replace function public.protect_profile_role() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(auth.role(), current_user) in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.user_role_id := 0;
      new.role := 'athlete';
    else
      if new.user_role_id is distinct from old.user_role_id then new.user_role_id := old.user_role_id; end if;
      if new.role is distinct from old.role then new.role := old.role; end if;
    end if;
  end if;
  return new;
end $$;

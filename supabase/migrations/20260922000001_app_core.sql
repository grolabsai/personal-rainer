-- App tables, reconstructed from how src/ reads and writes them.
-- The original project's schema was not published; column types are inferred from the client code.

-- Profiles ------------------------------------------------------------------
create table public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  display_name       text,
  gender             smallint,          -- onboarding code
  age                smallint,
  weight             numeric(5,1),      -- kg
  height             numeric(5,1),      -- cm
  aim                smallint,          -- onboarding code
  experience         smallint,          -- onboarding code
  exercise_hours     numeric(4,1),
  profile_percentage smallint not null default 0,
  bio                text,
  instagram          text,
  twitter            text,
  linkedin           text,
  website            text,
  profile_image_url  text,
  ls_score           numeric(5,1) not null default 0,
  skill_level        text,
  user_role_id       smallint not null default 0,   -- >= 1 means premium
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "Profiles: read own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "Profiles: insert own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "Profiles: update own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
-- Leaderboard profile screens need other users' public fields, never their body data.
create function public.get_public_profile(p_user_id uuid)
returns table (id uuid, display_name text, bio text, instagram text, twitter text, linkedin text, website text,
               profile_image_url text, skill_level text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.bio, p.instagram, p.twitter, p.linkedin, p.website, p.profile_image_url, p.skill_level
  from public.profiles p where p.id = p_user_id;
$$;
revoke execute on function public.get_public_profile(uuid) from public, anon;
grant execute on function public.get_public_profile(uuid) to authenticated;

-- user_role_id grants premium, so clients may never change it; only service_role may.
create function public.protect_profile_role() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT' then
      new.user_role_id := 0;
    elsif new.user_role_id is distinct from old.user_role_id then
      new.user_role_id := old.user_role_id;
    end if;
  end if;
  return new;
end $$;
create trigger profiles_protect_role before insert or update on public.profiles
  for each row execute function public.protect_profile_role();

-- Workouts ------------------------------------------------------------------
create table public.workouts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  routine_name text,
  duration     integer,           -- seconds
  volume       numeric(10,1),     -- total kg lifted
  total_sets   integer,
  exercises    jsonb not null default '[]',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index workouts_user_created on public.workouts (user_id, created_at desc);
alter table public.workouts enable row level security;
create policy "Workouts: own rows" on public.workouts for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Leaderboard ---------------------------------------------------------------
create table public.leaderboard (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  display_name      text,
  avatar_url        text,
  points            integer not null default 0,
  workout_count     integer not null default 0,
  streak_days       integer not null default 0,
  last_workout_date timestamptz,
  ispremium         boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index leaderboard_points on public.leaderboard (points desc);
alter table public.leaderboard enable row level security;
create policy "Leaderboard: readable by signed-in users" on public.leaderboard for select to authenticated using (true);
create policy "Leaderboard: insert own" on public.leaderboard for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Leaderboard: update own" on public.leaderboard for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- AI workout analyses -------------------------------------------------------
create table public.workout_analyses (
  analysis_id  text primary key,   -- 'ana_<timestamp>_<random>', generated by the client
  user_id      uuid not null references auth.users(id) on delete cascade,
  workout_data jsonb,
  user_context jsonb,
  ai_results   jsonb,
  status       text not null default 'pending',
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);
create index workout_analyses_user on public.workout_analyses (user_id, created_at desc);
alter table public.workout_analyses enable row level security;
create policy "Analyses: own rows" on public.workout_analyses for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Referral codes ------------------------------------------------------------
create table public.referral_codes (
  code        text primary key,
  is_active   boolean not null default true,
  usage_count integer not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.referral_codes enable row level security;
create policy "Referral codes: active codes readable" on public.referral_codes for select to authenticated using (is_active);

create function public.increment_referral_code_usage(p_code text) returns void
language sql security definer set search_path = '' as $$
  update public.referral_codes set usage_count = usage_count + 1 where code = p_code and is_active;
$$;
revoke execute on function public.increment_referral_code_usage(text) from public, anon;
grant execute on function public.increment_referral_code_usage(text) to authenticated;

-- Avatar storage ------------------------------------------------------------
-- BioScreen uploads '<user id>_<timestamp>.jpg' to the bucket root and serves it by public URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile_images', 'profile_images', true, 5242880, array['image/jpeg', 'image/png']);

create policy "Avatars: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'profile_images' and name like (select auth.uid())::text || '\_%');
create policy "Avatars: update own" on storage.objects for update to authenticated
  using (bucket_id = 'profile_images' and name like (select auth.uid())::text || '\_%');
create policy "Avatars: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'profile_images' and name like (select auth.uid())::text || '\_%');

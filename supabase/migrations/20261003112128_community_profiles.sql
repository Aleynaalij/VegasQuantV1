-- Community identity is separate from authentication and private betting records.
create table public.community_profiles (
 user_id uuid primary key references auth.users(id),
 username text not null check(username ~ '^[A-Za-z0-9_]{3,24}$'),
 region text not null default '' check(region in ('','Northeast','Southeast','Midwest','Southwest','West Coast','Mountain West','Outside the US')),
 avatar text check(avatar is null or (length(avatar)<=120000 and avatar ~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$')),
 visible boolean not null default false,
 updated_at timestamptz not null default now()
);
create unique index community_username_unique on public.community_profiles(lower(username));
alter table public.community_profiles enable row level security;
revoke all on public.community_profiles from public,anon,authenticated;
grant select,insert,update on public.community_profiles to authenticated;
create policy own_profile_read on public.community_profiles for select to authenticated using(user_id=(select auth.uid()));
create policy own_profile_insert on public.community_profiles for insert to authenticated with check(user_id=(select auth.uid()));
create policy own_profile_update on public.community_profiles for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
-- Deliberate opt-in disclosure: no email, balance, betting activity, user UUID or exact location.
create function private.community_roster(p_challenge_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to view the community'; end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
 select p.username,p.region,p.avatar,r.joined_at,
 (select count(*) from public.challenge_checkins c where c.user_id=r.user_id and c.challenge_id=r.challenge_id) as followed,
 (select max(created_at) from public.challenge_checkins c where c.user_id=r.user_id and c.challenge_id=r.challenge_id) as last_checkin
 from public.community_profiles p join public.challenge_runs r on r.user_id=p.user_id
 join auth.users u on u.id=p.user_id
 where r.challenge_id=p_challenge_id and p.visible and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now())
 order by r.joined_at desc limit 100
 ) x),'[]'::jsonb);
end $$;
revoke all on function private.community_roster(uuid) from public,anon,authenticated;
grant execute on function private.community_roster(uuid) to authenticated;
create function public.community_roster(p_challenge_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.community_roster(p_challenge_id)$$;
revoke all on function public.community_roster(uuid) from public,anon,authenticated;
grant execute on function public.community_roster(uuid) to authenticated;

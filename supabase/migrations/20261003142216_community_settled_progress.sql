-- Derive stage milestones from settled personal entries; never copy official wins to non-participants.
-- Only aggregate stage progress is shared; stakes, prices and balances remain private.
create or replace function private.community_roster(p_challenge_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to view the community'; end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
 select p.username,p.region,p.avatar,r.joined_at,
 (select count(distinct st.stage_number) from public.personal_entry_state e
 join public.official_picks op on op.id=e.pick_id join public.challenge_stages st on st.id=op.stage_id
 where e.user_id=r.user_id and st.challenge_id=r.challenge_id and e.result='WIN') as won,

 (select count(*) from public.challenge_checkins c where c.user_id=r.user_id and c.challenge_id=r.challenge_id) as followed,
 (select max(created_at) from public.challenge_checkins c where c.user_id=r.user_id and c.challenge_id=r.challenge_id) as last_checkin
 from public.community_profiles p join public.challenge_runs r on r.user_id=p.user_id
 join auth.users u on u.id=p.user_id
 where r.challenge_id=p_challenge_id and p.visible and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now())
 order by r.joined_at desc limit 100
 ) x),'[]'::jsonb);
end $$;

create or replace function private.community_member(p_username text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.community_profiles; events jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to view member profiles'; end if;
 select cp.* into p from public.community_profiles cp join auth.users u on u.id=cp.user_id
 where lower(cp.username)=lower(p_username) and (cp.user_id=auth.uid() or (cp.visible and exists(select 1 from public.challenge_runs r where r.user_id=cp.user_id)))
 and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now());
 if not found then return null; end if;
 select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) into events from (
 select * from (
 select 'joined' as kind,c.number as challenge_number,null::integer as stage_number,r.joined_at as at
 from public.challenge_runs r join public.challenges c on c.id=r.challenge_id where r.user_id=p.user_id
 union all
 select 'followed',c.number,k.stage_number,k.created_at from public.challenge_checkins k join public.challenges c on c.id=k.challenge_id where k.user_id=p.user_id
 union all
 select 'won',c.number,st.stage_number,max(pr.created_at) from public.personal_entry_state e
 join public.official_picks op on op.id=e.pick_id join public.challenge_stages st on st.id=op.stage_id
 join public.challenges c on c.id=st.challenge_id
 join public.pick_results pr on pr.pick_id=op.id
 where e.user_id=p.user_id and e.result='WIN'
 group by c.number,st.stage_number
 ) x order by at desc limit 100
 ) e;
 return jsonb_build_object('username',p.username,'region',p.region,'avatar',p.avatar,'instagram_url',p.instagram_url,'x_url',p.x_url,'events',events);
end $$;

alter table public.community_profiles add column instagram_url text check(instagram_url is null or instagram_url ~ '^https://(www\.)?instagram\.com/[A-Za-z0-9_.]{1,30}/?$');
alter table public.community_profiles add column x_url text check(x_url is null or x_url ~ '^https://(www\.)?(x|twitter)\.com/[A-Za-z0-9_]{1,15}/?$');
create function private.community_member(p_username text) returns jsonb language plpgsql stable security definer set search_path='' as $$
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
 ) x order by at desc limit 100
 ) e;
 return jsonb_build_object('username',p.username,'region',p.region,'avatar',p.avatar,'instagram_url',p.instagram_url,'x_url',p.x_url,'events',events);
end $$;
revoke all on function private.community_member(text) from public,anon,authenticated;
grant execute on function private.community_member(text) to authenticated;
create function public.community_member(p_username text) returns jsonb language sql stable security invoker set search_path='' as $$select private.community_member(p_username)$$;
revoke all on function public.community_member(text) from public,anon,authenticated;
grant execute on function public.community_member(text) to authenticated;

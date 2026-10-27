create or replace function private.community_roster(p_challenge_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $function$
begin
 if auth.uid() is null then raise exception 'Sign in to view the community'; end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (
 select coalesce(p.username,'Member_'||substr(md5(u.id::text),1,8)) as username,
 coalesce(p.region,'') as region,p.avatar,coalesce(p.visible,false) as visible,u.created_at as joined_at,
 0::bigint as won,0::bigint as followed,null::timestamptz as last_checkin
 from auth.users u left join public.community_profiles p on p.user_id=u.id
 where (p.visible or private.is_admin()) and (u.banned_until is null or u.banned_until<=now())
 order by u.created_at desc limit 500
 ) x),'[]'::jsonb);
end $function$;
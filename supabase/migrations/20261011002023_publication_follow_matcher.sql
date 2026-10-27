create function private.wants_publication(p_user uuid,p_game uuid,p_text text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select scope from public.alert_preferences where user_id=p_user),'all')='all'
 or exists(select 1 from public.topic_follows f left join public.games g on g.id=p_game where f.user_id=p_user and ((f.kind='team' and lower(f.topic) in(lower(g.away_team),lower(g.home_team),lower(g.away_abbreviation),lower(g.home_abbreviation))) or (f.kind='player' and position(lower(f.topic) in lower(coalesce(p_text,'')))>0)));
$$;
revoke all on function private.wants_publication(uuid,uuid,text) from public,anon,authenticated;


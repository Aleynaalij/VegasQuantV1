-- Corrective deployment for the already-applied card migration. Fresh installs use the same predicate there.
create or replace function private.zone_editorial_leg(p_id uuid,p_user uuid,p_sport text,p_title text,p_body text,p_at timestamptz)
returns text language sql stable security invoker set search_path='' as $$
 select case when length(split_part(p_body,E'\n\n',1)) between 1 and 180 then split_part(p_body,E'\n\n',1) else p_title end
 where (p_sport='nba' and exists(select 1 from public.nba_editorial_picks n
  where md5('nba-editorial-zone:'||n.publication_key)::uuid=p_id and n.published_at=p_at
   and position(n.rationale in p_body)>0 and position(n.risk in p_body)>0 and position(n.unknowns in p_body)>0))
 or (p_sport in ('nhl','ncaab') and (select count(*) from public.sports_selections s join public.sports_games g on g.id=s.game_id
  where s.author_id=p_user and g.sport=p_sport and s.title=p_title and s.published_at=p_at
   and p_body=split_part(p_body,E'\n\n',1)||E'\n\n'||trim(s.why)||E'\n\nRisk: '||trim(s.risk)||
    E'\n\nVegas Quant editorial read, not a guaranteed result. Prices move; check the current line.')=1)
$$;
revoke all on function private.zone_editorial_leg(uuid,uuid,text,text,text,timestamptz) from public,anon,authenticated,service_role;

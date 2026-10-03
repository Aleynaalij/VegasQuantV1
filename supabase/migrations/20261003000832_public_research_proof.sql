-- Public proof is an explicit whitelist; private research and active selections stay protected.
create or replace function private.public_research_status() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'updated_at',(select max(created_at) from public.analysis_versions),
  'games',(select coalesce(jsonb_agg(jsonb_build_object('game_id',game_id,'updated_at',updated_at,'versions',versions)),'[]'::jsonb) from (select game_id,max(created_at) updated_at,count(*) versions from public.analysis_versions group by game_id) a),
  'results',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'game',g.away_team||' @ '||g.home_team,'published_at',p.created_at,'selection',case when r.id is not null then p.selection else null end,'odds',case when r.id is not null then p.odds else null end,'result',coalesce(r.result,'PENDING'),'profit_cents',r.profit_cents,'stake_cents',case when r.id is not null then p.stake_cents else null end,'closing_recorded',c.id is not null) order by p.created_at desc),'[]'::jsonb) from public.official_picks p join public.games g on g.id=p.game_id left join public.pick_results r on r.pick_id=p.id left join public.closing_lines c on c.pick_id=p.id)
 );
$$;
revoke all on function private.public_research_status() from public;
grant execute on function private.public_research_status() to anon,authenticated;
create or replace function public.public_research_status() returns jsonb
language sql stable security invoker set search_path='' as $$ select private.public_research_status(); $$;
revoke all on function public.public_research_status() from public;
grant execute on function public.public_research_status() to anon,authenticated;

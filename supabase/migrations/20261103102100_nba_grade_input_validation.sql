-- Treat missing market/direction as invalid caller input, just like unknown values.
-- SQL NULL must not bypass validation and fall through to a WIN/LOSS calculation.
-- Forward replacement only: preserve existing grants, results, policies and valid grades.
create or replace function public.nba_grade(p_game uuid, p_market text, p_side text, p_point numeric default null, p_player text default null)
returns text language plpgsql stable security definer set search_path='' as $$
declare r public.nba_game_results; g public.nba_games; mine integer; theirs integer; v numeric; k text; n integer; played boolean;
begin
 select * into g from public.nba_games where id = p_game;
 if not found then raise exception 'Unknown NBA game'; end if;
 if p_market is null or p_market not in ('h2h','spreads','totals','player_points','player_rebounds','player_assists','player_threes',
   'player_points_rebounds_assists','player_points_rebounds','player_points_assists','player_rebounds_assists') then
  raise exception 'Unsupported NBA market %', p_market; end if;
 if p_market <> 'h2h' and p_point is null then raise exception 'Line required'; end if;
 if p_market in ('h2h','spreads') and p_side is distinct from g.away_team and p_side is distinct from g.home_team then
  raise exception 'Side must be one of the two teams'; end if;
 if p_market not in ('h2h','spreads') and (p_side is null or p_side not in ('Over','Under')) then raise exception 'Side must be Over or Under'; end if;
 if p_market like 'player_%' and public.nba_name_key(p_player) is null then raise exception 'Player required'; end if;

 if exists (select 1 from public.nba_result_progress where game_id = p_game and status = 'CONFLICT') then return 'REVIEW'; end if;
 select * into r from public.nba_game_results where game_id = p_game;
 if not found then return 'PENDING'; end if;

 if p_market in ('h2h','spreads') then
  mine := case when p_side = g.away_team then r.away_score else r.home_score end;
  theirs := case when p_side = g.away_team then r.home_score else r.away_score end;
  v := mine + coalesce(case when p_market = 'spreads' then p_point end, 0) - theirs;
  return case when v > 0 then 'WIN' when v < 0 then 'LOSS' else 'PUSH' end;
 end if;
 if p_market = 'totals' then
  v := r.away_score + r.home_score;
 else
  k := public.nba_name_key(p_player);
  select count(*), bool_or(x.played), max(case p_market
    when 'player_points' then x.points when 'player_rebounds' then x.rebounds
    when 'player_assists' then x.assists when 'player_threes' then x.threes
    when 'player_points_rebounds_assists' then x.points + x.rebounds + x.assists
    when 'player_points_rebounds' then x.points + x.rebounds
    when 'player_points_assists' then x.points + x.assists
    else x.rebounds + x.assists end)
  into n, played, v from public.nba_player_results x where x.game_id = p_game and x.name_key = k;
  if n <> 1 then return 'REVIEW'; end if;
  if not played then return 'VOID'; end if;
 end if;
 return case when v = p_point then 'PUSH' when (p_side = 'Over') = (v > p_point) then 'WIN' else 'LOSS' end;
end $$;

-- Defensive read-only grading: preserve immutable result evidence and writer validation.
create or replace function public.sports_grade_market(p_market uuid) returns text language plpgsql stable security invoker set search_path='' as $$
declare m jsonb;r jsonb;v numeric;line numeric;players jsonb;n integer;player jsonb;begin
 select payload into m from public.sports_markets where id=p_market;if not found then return 'PENDING';end if;
 select s.payload into r from public.sports_results s join public.sports_result_progress p using(game_id) where s.game_id=(m->>'game_id')::uuid and p.status='FINAL';if not found then return 'PENDING';end if;
 if m->>'market' in ('h2h','spreads') then
  if m->>'side' not in ('away','home') then return 'PENDING';end if;
  v:=case when m->>'side'='home' then (r->>'home_score')::numeric-(r->>'away_score')::numeric else (r->>'away_score')::numeric-(r->>'home_score')::numeric end;
  if m->>'market'='spreads' then v:=v+(m->>'line')::numeric;end if;
 elsif m->>'market'='totals' then v:=(r->>'away_score')::numeric+(r->>'home_score')::numeric;
 else
  select count(*),jsonb_agg(x) into n,players from jsonb_array_elements(r->'players')x where case when m->>'athlete_id' is not null then x->>'athlete_id'=m->>'athlete_id' else lower(x->>'player')=lower(m->>'player') end;
  if n<>1 then return 'PENDING';end if;player:=players->0;
  if coalesce((player->>'participation_uncertain')::boolean,false) then return 'PENDING';end if;
  if not (player->>'played')::boolean then return 'VOID';end if;
  v:=(player->>case when m->>'market'='player_points' then 'points' else 'goals' end)::numeric;
  if v is null then return 'PENDING';end if;
  if m->>'market'='player_goal_scorer_anytime' then return case when v>0 then 'WIN' else 'LOSS' end;end if;
 end if;
 if m->>'market' not in ('h2h','spreads') then
  if m->>'line' is null or m->>'direction' not in ('Over','Under') then return 'PENDING';end if;
  v:=(v-(m->>'line')::numeric)*case when m->>'direction'='Over' then 1 else -1 end;
 end if;
 -- Incomplete persisted finals are unknown, never a loss by NULL fallthrough.
 if v is null then return 'PENDING';end if;
 return case when v>0 then 'WIN' when v=0 then 'PUSH' else 'LOSS' end;
end $$;

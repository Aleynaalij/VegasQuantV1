-- NBA minor ESPN corrections (owner, Nov 17 2026): ESPN often revises a box score after we record it,
-- nearly always by one stat (a rebound, assist or steal moved between players). Every revision set the
-- game to CONFLICT ("kept for review") and nothing ever cleared it: 44 of 217 recorded games, which
-- nba_grade then returned as REVIEW and recorded form skipped.
--  * Grading stays on the recorded box score (the one confirmed unchanged for 3 hours), as sportsbooks
--    settle on the stats at settlement and do not re-settle for later corrections. Recorded rows are
--    untouched and stay immutable; every revision is still logged in private.nba_result_corrections.
--  * A revision is minor, and the game stays (or returns to) FINAL, when the revised read is itself
--    consistent (both teams' player points add up to their scores; rebound, assist and three totals
--    match; at least five players each), both scores and overtime are unchanged, nobody's played flag
--    changes, a player added or dropped did not play and has no stats, and no stat (minutes included)
--    moves by more than 2. Anything else is CONFLICT, as before.
--  * Existing CONFLICT games are re-checked once against their latest logged revision.

create function private.nba_minor_correction(p_game uuid, p jsonb) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare r public.nba_game_results; s text; bad boolean;
begin
 select * into r from public.nba_game_results where game_id = p_game;
 if not found or jsonb_typeof(p->'players') <> 'array' then return false; end if;
 -- Same final score and overtime.
 if coalesce(p->'away'->>'score','') !~ '^\d+$' or coalesce(p->'home'->>'score','') !~ '^\d+$'
    or (p->'away'->>'score')::int <> r.away_score or (p->'home'->>'score')::int <> r.home_score
    or coalesce((p->>'overtime')::boolean, false) <> r.overtime then return false; end if;
 -- Every stat present and numeric.
 if exists (select 1 from jsonb_array_elements(p->'players') x
   where coalesce(x->>'athlete_id','') !~ '^\d+$' or x->>'side' not in ('away','home') or jsonb_typeof(x->'played') <> 'boolean'
    or exists (select 1 from unnest(array['points','rebounds','assists','threes','steals','blocks','turnovers']) k where coalesce(x->>k,'') !~ '^\d+$')
    or (x ? 'minutes' and jsonb_typeof(x->'minutes') <> 'null' and coalesce(x->>'minutes','') !~ '^\d+$')) then return false; end if;
 -- The revised read adds up on its own.
 for s in select unnest(array['away','home']) loop
  select count(*) filter (where (x->>'played')::boolean) < 5
      or coalesce(sum((x->>'points')::int), 0) is distinct from (p->s->>'score')::int
      or coalesce(sum((x->>'rebounds')::int), 0) is distinct from (p->s->>'rebounds')::int
      or coalesce(sum((x->>'assists')::int), 0) is distinct from (p->s->>'assists')::int
      or coalesce(sum((x->>'threes')::int), 0) is distinct from (p->s->>'threes')::int
   into bad from jsonb_array_elements(p->'players') x where x->>'side' = s;
  if bad then return false; end if;
 end loop;
 -- Recorded players: present with the same played flag and every stat within 2, or absent and inactive.
 if exists (select 1 from public.nba_player_results o
   left join lateral (select x from jsonb_array_elements(p->'players') x where x->>'athlete_id' = o.athlete_id limit 1) j on true
   where o.game_id = p_game and case
    when j.x is null then o.played or o.points + o.rebounds + o.assists + o.threes + o.steals + o.blocks + o.turnovers > 0
    else (j.x->>'played')::boolean <> o.played
     or abs((j.x->>'points')::int - o.points) > 2 or abs((j.x->>'rebounds')::int - o.rebounds) > 2
     or abs((j.x->>'assists')::int - o.assists) > 2 or abs((j.x->>'threes')::int - o.threes) > 2
     or abs((j.x->>'steals')::int - o.steals) > 2 or abs((j.x->>'blocks')::int - o.blocks) > 2
     or abs((j.x->>'turnovers')::int - o.turnovers) > 2
     or abs(coalesce((j.x->>'minutes')::int, 0) - coalesce(o.minutes, 0)) > 2
    end) then return false; end if;
 -- Players new to the revision: did not play, no stats.
 if exists (select 1 from jsonb_array_elements(p->'players') x
   where not exists (select 1 from public.nba_player_results o where o.game_id = p_game and o.athlete_id = x->>'athlete_id')
    and ((x->>'played')::boolean or (x->>'points')::int + (x->>'rebounds')::int + (x->>'assists')::int + (x->>'threes')::int
      + (x->>'steals')::int + (x->>'blocks')::int + (x->>'turnovers')::int > 0)) then return false; end if;
 return true;
end $$;
revoke all on function private.nba_minor_correction(uuid, jsonb) from public, anon, authenticated, service_role;

-- The production definition of record_nba_result, unchanged except the already-recorded branch.
CREATE OR REPLACE FUNCTION private.record_nba_result(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g public.nba_games; prior public.nba_game_results; st private.nba_result_staging;
 fp text; s text; side jsonb; bad text; n integer;
begin
 if octet_length(p::text) > 500000 then raise exception 'Result payload too large'; end if;
 select * into g from public.nba_games where provider_id = p->>'provider_id';
 if not found then raise exception 'Unknown NBA game'; end if;
 perform pg_advisory_xact_lock(hashtextextended('nba-result:'||g.id::text, 0));

 if coalesce(p->>'completed','') <> 'true' then
  delete from private.nba_result_staging where game_id = g.id;
  if exists (select 1 from public.nba_game_results where game_id = g.id) then
   return jsonb_build_object('status', (select status from public.nba_result_progress where game_id = g.id));
  end if;
  s := case when p->>'status' in ('STATUS_POSTPONED','STATUS_CANCELED','STATUS_SUSPENDED') then 'NO_RESULT' else 'AWAITING_FINAL' end;
  insert into public.nba_result_progress(game_id,status,reason,checked_at)
  values(g.id, s, left('ESPN status '||coalesce(p->>'status','unknown'), 200), now())
  on conflict(game_id) do update set status=excluded.status, reason=excluded.reason, checked_at=now();
  return jsonb_build_object('status', s);
 end if;

 if g.tipoff > now() then raise exception 'Game has not started'; end if;
 if p->>'source_url' is distinct from 'https://www.espn.com/nba/boxscore/_/gameId/'||g.provider_id
    or coalesce(p->>'source_hash','') !~ '^[a-f0-9]{64}$' then raise exception 'Invalid result evidence'; end if;
 if p->'away'->>'team' is distinct from g.away_team or p->'home'->>'team' is distinct from g.home_team then
  raise exception 'Teams do not match the scheduled game'; end if;
 if jsonb_typeof(p->'players') <> 'array' or exists (
   select 1 from jsonb_array_elements(p->'players') x
   where coalesce(x->>'athlete_id','') !~ '^\d+$' or coalesce(x->>'player','') = '' or x->>'side' not in ('away','home')
      or jsonb_typeof(x->'played') <> 'boolean'
      or exists (select 1 from unnest(array['points','rebounds','assists','threes','steals','blocks','turnovers']) k where coalesce(x->>k,'') !~ '^\d+$')
      or (x ? 'minutes' and jsonb_typeof(x->'minutes') <> 'null' and coalesce(x->>'minutes','') !~ '^\d+$')
      or (x ? 'starter' and jsonb_typeof(x->'starter') not in ('boolean','null'))
      or coalesce(x->>'position','') !~ '^[A-Z]{0,3}$')
   or (select count(distinct x->>'athlete_id') <> count(*) from jsonb_array_elements(p->'players') x) then
  raise exception 'Invalid player rows'; end if;

 for s in select unnest(array['away','home']) loop
  side := p->s;
  select count(*) filter (where (x->>'played')::boolean) into n from jsonb_array_elements(p->'players') x where x->>'side' = s;
  select case
   when coalesce(side->>'score','') !~ '^\d+$' then 'missing '||s||' score'
   when n < 5 then 'fewer than five '||s||' players played'
   when sum((x->>'points')::int) is distinct from (side->>'score')::int then s||' player points do not add up to the final score'
   when sum((x->>'rebounds')::int) is distinct from (side->>'rebounds')::int then s||' rebounds do not match the team total'
   when sum((x->>'assists')::int) is distinct from (side->>'assists')::int then s||' assists do not match the team total'
   when sum((x->>'threes')::int) is distinct from (side->>'threes')::int then s||' threes do not match the team total'
   when bool_or(not (x->>'played')::boolean and ((x->>'points')::int + (x->>'rebounds')::int + (x->>'assists')::int) > 0) then s||' non-playing player has stats'
  end into bad from jsonb_array_elements(p->'players') x where x->>'side' = s;
  exit when bad is not null;
 end loop;
 if bad is null and (p->'away'->>'score')::int = (p->'home'->>'score')::int then bad := 'final score is tied'; end if;

 fp := encode(sha256(convert_to(jsonb_build_object(
  'away', (p->'away'->>'score'), 'home', (p->'home'->>'score'), 'ot', coalesce(p->>'overtime','false'),
  'players', (select jsonb_agg(jsonb_build_array(x->>'athlete_id', x->>'player', x->>'side', x->>'played', x->>'minutes',
    x->>'points', x->>'rebounds', x->>'assists', x->>'threes', x->>'steals', x->>'blocks', x->>'turnovers') order by (x->>'athlete_id')::bigint)
   from jsonb_array_elements(p->'players') x))::text, 'UTF8')), 'hex');

 select * into prior from public.nba_game_results where game_id = g.id;
 if found then
  if fp = prior.fingerprint then
   update public.nba_result_progress set checked_at = now() where game_id = g.id;
   return jsonb_build_object('status', (select status from public.nba_result_progress where game_id = g.id));
  end if;
  insert into private.nba_result_corrections(game_id, recorded_fingerprint, observed_fingerprint, observed, source_hash)
  values(g.id, prior.fingerprint, fp, p, p->>'source_hash') on conflict (game_id, observed_fingerprint) do nothing;
  -- A minor revision is logged and the recorded result stands; anything larger goes to review.
  if private.nba_minor_correction(g.id, p) then
   update public.nba_result_progress set status='FINAL',
    reason='ESPN revised the box score after it was recorded (scores unchanged, no stat moved by more than 2); graded on the recorded box score',
    checked_at=now()
   where game_id = g.id;
   return jsonb_build_object('status','FINAL','correction','minor');
  end if;
  update public.nba_result_progress set status='CONFLICT', reason='ESPN changed the box score after it was recorded; recorded result kept for review', checked_at=now()
  where game_id = g.id;
  return jsonb_build_object('status','CONFLICT');
 end if;

 if bad is not null then
  delete from private.nba_result_staging where game_id = g.id;
  insert into public.nba_result_progress(game_id,status,reason,checked_at) values(g.id,'INCONSISTENT',left('Box score does not add up: '||bad,200),now())
  on conflict(game_id) do update set status=excluded.status, reason=excluded.reason, checked_at=now();
  return jsonb_build_object('status','INCONSISTENT','reason',bad);
 end if;

 select * into st from private.nba_result_staging where game_id = g.id;
 if not found or st.fingerprint <> fp then
  s := case when st.game_id is null then 'Final box score adds up; confirming in 3 hours' else 'Box score changed since the last read; confirmation restarted' end;
  insert into private.nba_result_staging(game_id, fingerprint) values(g.id, fp)
  on conflict(game_id) do update set fingerprint=excluded.fingerprint, first_seen_at=now(), last_seen_at=now();
 elsif now() - st.first_seen_at < interval '3 hours' then
  update private.nba_result_staging set last_seen_at = now() where game_id = g.id;
  s := 'Final box score unchanged; confirming in 3 hours';
 else
  insert into public.nba_game_results(game_id, provider_id, away_score, home_score, overtime, fingerprint, source_url, source_hash, first_final_at)
  values(g.id, g.provider_id, (p->'away'->>'score')::int, (p->'home'->>'score')::int, coalesce((p->>'overtime')::boolean,false),
   fp, p->>'source_url', p->>'source_hash', st.first_seen_at);
  insert into public.nba_player_results(game_id, athlete_id, player, team, side, played, minutes, points, rebounds, assists, threes, steals, blocks, turnovers, starter, position)
  select g.id, x->>'athlete_id', x->>'player', case when x->>'side'='away' then g.away_team else g.home_team end, x->>'side',
   (x->>'played')::boolean, (x->>'minutes')::int, (x->>'points')::int, (x->>'rebounds')::int, (x->>'assists')::int,
   (x->>'threes')::int, (x->>'steals')::int, (x->>'blocks')::int, (x->>'turnovers')::int, (x->>'starter')::boolean, nullif(x->>'position','')
  from jsonb_array_elements(p->'players') x;
  delete from private.nba_result_staging where game_id = g.id;
  insert into public.nba_result_progress(game_id,status,reason,checked_at) values(g.id,'FINAL','Final box score adds up and was unchanged for 3 hours',now())
  on conflict(game_id) do update set status=excluded.status, reason=excluded.reason, checked_at=now();
  return jsonb_build_object('status','FINAL','recorded',true);
 end if;
 insert into public.nba_result_progress(game_id,status,reason,checked_at) values(g.id,'CONFIRMING',s,now())
 on conflict(game_id) do update set status=excluded.status, reason=excluded.reason, checked_at=now();
 return jsonb_build_object('status','CONFIRMING');
end $function$;

-- Re-check every game already in review against its latest logged revision.
update public.nba_result_progress pr set status = 'FINAL',
 reason = 'ESPN revised the box score after it was recorded (scores unchanged, no stat moved by more than 2); graded on the recorded box score',
 checked_at = now()
from (select distinct on (game_id) game_id, observed from private.nba_result_corrections order by game_id, detected_at desc) c
where pr.game_id = c.game_id and pr.status = 'CONFLICT' and private.nba_minor_correction(c.game_id, c.observed);

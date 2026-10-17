-- NBA results (step 2 of the NBA build): final scores and player box scores, recorded once and
-- never changed, plus a grader for game lines and player props. Filled by the nba-results edge
-- function from ESPN's game summary. NBA.com refuses requests from Supabase's network, so there is
-- no second free provider to corroborate against (NFL uses nflverse). Instead a final is recorded
-- only when
--   ESPN marks the game completed,
--   the box score adds up (player points = final score; player rebounds, assists and threes =
--   ESPN's team totals) and
--   the same stat fingerprint is read again at least 3 hours after the first final read.
-- A later change to a recorded game is journaled as a correction and the game is flagged CONFLICT;
-- the recorded result stays. Nothing here creates NBA picks, publishes, or touches NFL tables.

-- Player name matching key shared by the results table and the grader: lower case, accents
-- folded, punctuation and Jr/Sr/II-IV suffixes dropped ("P.J. Washington Jr." -> "pj washington").
create function public.nba_name_key(n text) returns text
language sql immutable parallel safe set search_path='' as $$
 select nullif(trim(regexp_replace(regexp_replace(regexp_replace(
  lower(translate(n, 'áàâäãåāÁÀÂÄÃÅĀčćçČĆÇďĎéèêëěēÉÈÊËĚĒíìîïīÍÌÎÏĪľłĽŁñńňÑŃŇóòôöõøōÓÒÔÖÕØŌřŘšśşŠŚŞťŤúùûüůūÚÙÛÜŮŪýÿÝŸžźżŽŹŻ',
   'aaaaaaaaaaaaaaccccccddeeeeeeeeeeeeiiiiiiiiiillllnnnnnnoooooooooooooorrssssssttuuuuuuuuuuuuyyyyzzzzzz')),
  '[^a-z ]', '', 'g'), '\m(jr|sr|ii|iii|iv)\M', '', 'g'), '\s+', ' ', 'g')), '')
$$;

create table public.nba_game_results(
 game_id uuid primary key references public.nba_games(id),
 provider_id text not null unique,
 away_score integer not null check(away_score>=0), home_score integer not null check(home_score>=0),
 overtime boolean not null default false,
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 source_url text not null check(source_url like 'https://www.espn.com/nba/boxscore/_/gameId/%'),
 source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),
 first_final_at timestamptz not null, recorded_at timestamptz not null default now(),
 check(away_score<>home_score)
);
create table public.nba_player_results(
 game_id uuid not null references public.nba_game_results(game_id),
 athlete_id text not null check(athlete_id ~ '^\d+$'),
 player text not null, name_key text generated always as (public.nba_name_key(player)) stored,
 team text not null, side text not null check(side in ('away','home')),
 played boolean not null, minutes integer check(minutes>=0),
 points integer not null check(points>=0), rebounds integer not null check(rebounds>=0),
 assists integer not null check(assists>=0), threes integer not null check(threes>=0),
 steals integer not null check(steals>=0), blocks integer not null check(blocks>=0),
 turnovers integer not null check(turnovers>=0),
 primary key(game_id, athlete_id)
);
create index nba_player_results_name_idx on public.nba_player_results(game_id, name_key);

-- Per-game state, readable by everyone so the board and admins can see why a game is not final yet.
create table public.nba_result_progress(
 game_id uuid primary key references public.nba_games(id),
 status text not null check(status in ('AWAITING_FINAL','CONFIRMING','FINAL','INCONSISTENT','CONFLICT','NO_RESULT')),
 reason text not null, checked_at timestamptz not null default now()
);
-- First final read awaiting its confirmation read. Mutable working state, not a record.
create table private.nba_result_staging(
 game_id uuid primary key references public.nba_games(id),
 fingerprint text not null, first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now()
);
-- Provider changes seen after a game was recorded. Append-only; the recorded result is never edited.
create table private.nba_result_corrections(
 id bigint generated always as identity primary key,
 game_id uuid not null references public.nba_game_results(game_id),
 recorded_fingerprint text not null, observed_fingerprint text not null,
 observed jsonb not null, source_hash text not null, detected_at timestamptz not null default now(),
 unique(game_id, observed_fingerprint)
);

create trigger immutable_nba_game_result before update or delete on public.nba_game_results for each row execute function private.immutable();
create trigger immutable_nba_player_result before update or delete on public.nba_player_results for each row execute function private.immutable();
create trigger immutable_nba_result_correction before update or delete on private.nba_result_corrections for each row execute function private.immutable();

alter table public.nba_game_results enable row level security;
alter table public.nba_player_results enable row level security;
alter table public.nba_result_progress enable row level security;
alter table private.nba_result_staging enable row level security;
alter table private.nba_result_corrections enable row level security;
grant select on public.nba_game_results, public.nba_player_results, public.nba_result_progress to anon, authenticated, service_role;
create policy public_read on public.nba_game_results for select to anon, authenticated using (true);
create policy public_read on public.nba_player_results for select to anon, authenticated using (true);
create policy public_read on public.nba_result_progress for select to anon, authenticated using (true);
create policy age_verified_account on public.nba_game_results as restrictive for all to authenticated using ((select private.age_member_allowed()));
create policy age_verified_account on public.nba_player_results as restrictive for all to authenticated using ((select private.age_member_allowed()));
create policy age_verified_account on public.nba_result_progress as restrictive for all to authenticated using ((select private.age_member_allowed()));
revoke all on private.nba_result_staging, private.nba_result_corrections from public, anon, authenticated, service_role;

-- One ESPN summary read for one game. p: provider_id, completed, status, overtime, source_url,
-- source_hash, away/home {team, score, rebounds, assists, threes}, players[] {athlete_id, player,
-- side, played, minutes, points, rebounds, assists, threes, steals, blocks, turnovers}.
-- The database checks the box score itself; the caller cannot mark anything final.
create function private.record_nba_result(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
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

 -- Shape and identity checks: these are errors in the caller, not data states.
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
      or (x ? 'minutes' and jsonb_typeof(x->'minutes') <> 'null' and coalesce(x->>'minutes','') !~ '^\d+$'))
   or (select count(distinct x->>'athlete_id') <> count(*) from jsonb_array_elements(p->'players') x) then
  raise exception 'Invalid player rows'; end if;

 -- Box score consistency, per team.
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

 -- Fingerprint of what gets recorded: scores, overtime and every player's line, in athlete order.
 fp := encode(sha256(convert_to(jsonb_build_object(
  'away', (p->'away'->>'score'), 'home', (p->'home'->>'score'), 'ot', coalesce(p->>'overtime','false'),
  'players', (select jsonb_agg(jsonb_build_array(x->>'athlete_id', x->>'player', x->>'side', x->>'played', x->>'minutes',
    x->>'points', x->>'rebounds', x->>'assists', x->>'threes', x->>'steals', x->>'blocks', x->>'turnovers') order by (x->>'athlete_id')::bigint)
   from jsonb_array_elements(p->'players') x))::text, 'UTF8')), 'hex');

 -- Already recorded: only look for provider corrections. Any changed box score is a correction,
 -- including one that no longer adds up.
 select * into prior from public.nba_game_results where game_id = g.id;
 if found then
  if fp = prior.fingerprint then
   update public.nba_result_progress set checked_at = now() where game_id = g.id;
   return jsonb_build_object('status', (select status from public.nba_result_progress where game_id = g.id));
  end if;
  insert into private.nba_result_corrections(game_id, recorded_fingerprint, observed_fingerprint, observed, source_hash)
  values(g.id, prior.fingerprint, fp, p, p->>'source_hash') on conflict (game_id, observed_fingerprint) do nothing;
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

 -- Stage the first consistent final read; record once the same fingerprint is seen 3 hours later.
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
  insert into public.nba_player_results(game_id, athlete_id, player, team, side, played, minutes, points, rebounds, assists, threes, steals, blocks, turnovers)
  select g.id, x->>'athlete_id', x->>'player', case when x->>'side'='away' then g.away_team else g.home_team end, x->>'side',
   (x->>'played')::boolean, (x->>'minutes')::int, (x->>'points')::int, (x->>'rebounds')::int, (x->>'assists')::int,
   (x->>'threes')::int, (x->>'steals')::int, (x->>'blocks')::int, (x->>'turnovers')::int
  from jsonb_array_elements(p->'players') x;
  delete from private.nba_result_staging where game_id = g.id;
  insert into public.nba_result_progress(game_id,status,reason,checked_at) values(g.id,'FINAL','Final box score adds up and was unchanged for 3 hours',now())
  on conflict(game_id) do update set status=excluded.status, reason=excluded.reason, checked_at=now();
  return jsonb_build_object('status','FINAL','recorded',true);
 end if;
 insert into public.nba_result_progress(game_id,status,reason,checked_at) values(g.id,'CONFIRMING',s,now())
 on conflict(game_id) do update set status=excluded.status, reason=excluded.reason, checked_at=now();
 return jsonb_build_object('status','CONFIRMING');
end $$;
create function public.record_nba_result(p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.record_nba_result(p) $$;
revoke all on function private.record_nba_result(jsonb), public.record_nba_result(jsonb) from public, anon, authenticated;
grant execute on function private.record_nba_result(jsonb), public.record_nba_result(jsonb) to service_role;

-- Grade one selection against a recorded game. Markets use The Odds API keys:
--   h2h (side = team), spreads (side = team, point = that team's handicap), totals (Over/Under),
--   player_points / _rebounds / _assists / _threes and the combined
--   player_points_rebounds_assists / _points_rebounds / _points_assists / _rebounds_assists.
-- Overtime counts. Returns WIN, LOSS or PUSH; VOID when the player did not play; PENDING until the
-- game is recorded; REVIEW when the game is flagged CONFLICT or the player name is not matched to
-- exactly one box-score line.
create function public.nba_grade(p_game uuid, p_market text, p_side text, p_point numeric default null, p_player text default null)
returns text language plpgsql stable security definer set search_path='' as $$
declare r public.nba_game_results; g public.nba_games; mine integer; theirs integer; v numeric; k text; n integer; played boolean;
begin
 select * into g from public.nba_games where id = p_game;
 if not found then raise exception 'Unknown NBA game'; end if;
 if p_market not in ('h2h','spreads','totals','player_points','player_rebounds','player_assists','player_threes',
   'player_points_rebounds_assists','player_points_rebounds','player_points_assists','player_rebounds_assists') then
  raise exception 'Unsupported NBA market %', p_market; end if;
 if p_market <> 'h2h' and p_point is null then raise exception 'Line required'; end if;
 if p_market in ('h2h','spreads') and p_side is distinct from g.away_team and p_side is distinct from g.home_team then
  raise exception 'Side must be one of the two teams'; end if;
 if p_market not in ('h2h','spreads') and p_side not in ('Over','Under') then raise exception 'Side must be Over or Under'; end if;
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
revoke all on function public.nba_grade(uuid,text,text,numeric,text) from public;
grant execute on function public.nba_grade(uuid,text,text,numeric,text) to anon, authenticated, service_role;
grant execute on function public.nba_name_key(text) to anon, authenticated, service_role;

do $$
begin
 if exists (select 1 from cron.job where jobname='nba-results-refresh') then perform cron.unschedule('nba-results-refresh'); end if;
 perform cron.schedule('nba-results-refresh', '9,39 * * * *', $job$
 select net.http_post(
  url:='https://uowearboulykfcwnuirn.supabase.co/functions/v1/nba-results',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='vq_source_sync_token')),
  body:='{}'::jsonb, timeout_milliseconds:=120000
 );
 $job$);
end $$;

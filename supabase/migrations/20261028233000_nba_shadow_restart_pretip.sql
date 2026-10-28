-- NBA shadow restart (owner, Oct 28 2026). The v0.1 shadow scan never stored a forecast: every hosted
-- run from Oct 19-22 ended in HTTP 400 because record_nba_shadow_scan raised on the first forecast that
-- failed a check, discarding the whole batch, and the run log could not say which check. Then the
-- Oct 22 pause unscheduled the dispatcher.
--  * Per-forecast checks are unchanged but now skip that forecast and count the reason; whole-scan checks
--    (model, freshness, input hashes, size) still reject the scan. The run summary stores the counts.
--  * The dispatcher is scheduled again (every 5 minutes it starts one scan per fresh FanDuel batch).
--  * nba-sync also runs once a day 60-90 minutes before the day's first regular-season tip, so lines,
--    props and injuries are fresh near tip and the shadow scan forecasts from pre-tip prices. The 6 a.m.
--    run is unchanged; nba-sync's own cadence rules still decide which paid calls are due.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function private.record_nba_shadow_scan(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run uuid; r jsonb; o public.nba_observations; g public.nba_games; at timestamptz; inserted integer := 0; under integer;
 cutoff date; rejected jsonb := '{}'; reason text; accepted jsonb := '[]'; a jsonb;
begin
 if octet_length(p::text) > 3000000 or jsonb_array_length(coalesce(p->'forecasts','[]')) > 3000 then raise exception 'Scan too large'; end if;
 if not exists (select 1 from private.nba_shadow_models where model_id = p->>'model_id' and status = 'SHADOW_ONLY') then
  raise exception 'Unregistered NBA model'; end if;
 at := (p->>'generated_at')::timestamptz;
 if at is null or at > now() or at < now() - interval '15 minutes' then raise exception 'Scan is not current'; end if;
 if jsonb_typeof(p->'summary'->'inputs') is distinct from 'array' or jsonb_array_length(p->'summary'->'inputs') = 0
    or exists (select 1 from jsonb_array_elements(p->'summary'->'inputs') x
               where coalesce(x->>'sha256', '') !~ '^[0-9a-f]{64}$' or coalesce(x->>'file', '') = '') then
  raise exception 'Scan is missing its input hashes'; end if;
 if exists (select 1 from private.nba_shadow_runs where model_id = p->>'model_id' and generated_at = at) then
  return jsonb_build_object('inserted', 0, 'replay', true); end if;
 -- Check every forecast first; a failing forecast is left out with its reason instead of voiding the scan.
 for r in select value from jsonb_array_elements(coalesce(p->'forecasts','[]')) loop
  begin
   select * into o from public.nba_observations where id = (r->>'observation_id')::uuid and kind = 'prop';
   if not found then raise exception 'Unknown prop observation'; end if;
   select * into g from public.nba_games where id = o.game_id;
   if g.tipoff <= now() then raise exception 'Game has started'; end if;
   if o.recorded_at < now() - interval '30 minutes' then raise exception 'Price snapshot is stale'; end if;
   if o.recorded_at > at then raise exception 'Price snapshot was received after the scan'; end if;
   if o.observed_at is null then raise exception 'Price snapshot has no provider time'; end if;
   if o.observed_at > at or o.observed_at > o.recorded_at + interval '2 minutes' then
    raise exception 'Provider time is after the scan'; end if;
   if o.observed_at < at - interval '30 minutes' then raise exception 'Provider quote is stale'; end if;
   cutoff := case when coalesce(r->'forecast'->>'history_through', '') ~ '^\d{4}-\d{2}-\d{2}$'
    then (r->'forecast'->>'history_through')::date end;
   if cutoff is null or coalesce(r->'forecast'->>'history_games', '') !~ '^[1-9]\d*$' then
    raise exception 'Forecast is missing its history cutoff'; end if;
   if cutoff >= (g.tipoff at time zone 'America/New_York')::date then
    raise exception 'Forecast history reaches the game date'; end if;
   if r->>'market' is distinct from o.payload->>'market' then raise exception 'Market does not match the snapshot'; end if;
   if r->>'team' not in (g.away_team, g.home_team) then raise exception 'Team is not in this game'; end if;
   if not exists (select 1 from jsonb_array_elements(o.payload->'outcomes') x where x->>'name' = 'Over'
      and x->>'description' = r->>'player' and (x->>'point')::numeric = (r->>'line')::numeric and (x->>'price')::int = (r->>'over_odds')::int) then
    raise exception 'Over price does not match the snapshot'; end if;
   under := null;
   if r ? 'under_odds' and jsonb_typeof(r->'under_odds') <> 'null' then
    if not exists (select 1 from jsonb_array_elements(o.payload->'outcomes') x where x->>'name' = 'Under'
       and x->>'description' = r->>'player' and (x->>'point')::numeric = (r->>'line')::numeric and (x->>'price')::int = (r->>'under_odds')::int) then
     raise exception 'Under price does not match the snapshot'; end if;
    under := (r->>'under_odds')::int;
   end if;
   accepted := accepted || jsonb_build_array(r || jsonb_build_object('_game', g.id, '_obs', o.id, '_under', under,
    '_book', o.payload->>'book', '_observed', o.observed_at));
  exception
   when raise_exception then reason := sqlerrm;
    rejected := jsonb_set(rejected, array[reason], to_jsonb(coalesce((rejected->>reason)::int, 0) + 1));
   when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format or datetime_field_overflow
     or check_violation or not_null_violation then
    rejected := jsonb_set(rejected, array['Malformed forecast'], to_jsonb(coalesce((rejected->>'Malformed forecast')::int, 0) + 1));
  end;
 end loop;
 -- The run row is append-only evidence, so it is written once, with why forecasts were left out.
 insert into private.nba_shadow_runs(model_id, generated_at, summary)
 values(p->>'model_id', at, coalesce(p->'summary','{}') || jsonb_build_object('accepted', jsonb_array_length(accepted), 'rejected', rejected))
 on conflict(model_id, generated_at) do nothing returning id into run;
 if run is null then return jsonb_build_object('inserted', 0, 'replay', true); end if;
 for a in select value from jsonb_array_elements(accepted) loop
  insert into private.nba_shadow_forecasts(run_id, model_id, game_id, observation_id, athlete_id, player, team, market, line, book,
   over_odds, under_odds, over_probability, no_vig_over, forecast, observed_at)
  values(run, p->>'model_id', (a->>'_game')::uuid, (a->>'_obs')::uuid, a->>'athlete_id', a->>'player', a->>'team', a->>'market', (a->>'line')::numeric,
   a->>'_book', (a->>'over_odds')::int, (a->>'_under')::int, (a->>'over_probability')::numeric,
   case when a->>'_under' is null then null else private.american_implied((a->>'over_odds')::int)
     / (private.american_implied((a->>'over_odds')::int) + private.american_implied((a->>'_under')::int)) end,
   coalesce(a->'forecast','{}'), (a->>'_observed')::timestamptz)
  on conflict(model_id, observation_id, player, market, line) do nothing;
  if found then inserted := inserted + 1; end if;
 end loop;
 return jsonb_build_object('inserted', inserted, 'rejected', rejected, 'run_id', run);
end $$;
revoke all on function private.record_nba_shadow_scan(jsonb) from public, anon, authenticated;

create table private.nba_pretip_runs(day date primary key, first_tip timestamptz not null, posted_at timestamptz not null default now());
alter table private.nba_pretip_runs enable row level security;
revoke all on private.nba_pretip_runs from public, anon, authenticated;

create or replace function private.nba_pretip_sync() returns void
language plpgsql security definer set search_path='' as $$
declare today date := (now() at time zone 'America/New_York')::date; tip timestamptz;
begin
 select min(tipoff) into tip from public.nba_games
 where season_type in (2, 3) and not tipoff_tbd and (tipoff at time zone 'America/New_York')::date = today;
 if tip is null or now() < tip - interval '90 minutes' or now() > tip - interval '60 minutes' then return; end if;
 insert into private.nba_pretip_runs(day, first_tip) values(today, tip) on conflict(day) do nothing;
 if not found then return; end if;
 perform private.nba_daily_post('nba-sync', extract(hour from now() at time zone 'America/New_York')::int);
end $$;
revoke all on function private.nba_pretip_sync() from public, anon, authenticated, service_role;

do $$
begin
 if exists (select 1 from cron.job where jobname = 'nba-pretip-refresh') then perform cron.unschedule('nba-pretip-refresh'); end if;
 perform cron.schedule('nba-pretip-refresh', '*/10 * * * *', 'select private.nba_pretip_sync()');
 if exists (select 1 from cron.job where jobname = 'nba-shadow-scan-dispatch') then perform cron.unschedule('nba-shadow-scan-dispatch'); end if;
 perform cron.schedule('nba-shadow-scan-dispatch', '*/5 * * * *', 'select private.dispatch_nba_shadow_scan()');
end $$;

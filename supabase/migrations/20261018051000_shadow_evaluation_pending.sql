-- Review follow-ups to 20261018040000.
--
-- 1. Evaluation rows include every captured forecast, graded or not, so a dossier reports the
--    forecasts still waiting on an outcome instead of scoring only the graded subset. They also
--    carry season, week and team for the historical-baseline comparison.
-- 2. Corrections: nflverse sometimes corrects a final after publishing it. The original outcome
--    stays immutable; a later different value is appended to private.nfl_shadow_outcome_corrections
--    and the evaluation uses the latest version. Grading re-reads forecasts for 21 days after
--    kickoff so corrections are seen.
create table private.nfl_shadow_outcome_corrections(
 id uuid primary key default gen_random_uuid(),
 forecast_id uuid not null references private.nfl_shadow_outcomes(forecast_id),
 yards numeric check(yards is null or yards>=0),
 void boolean not null,
 source_url text not null check(source_url like 'https://%'),
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 recorded_at timestamptz not null default clock_timestamp(),
 check((void and yards is null) or (not void and yards is not null))
);
alter table private.nfl_shadow_outcome_corrections enable row level security;
create trigger immutable_shadow_outcome_corrections before update or delete on private.nfl_shadow_outcome_corrections for each row execute function private.immutable();
revoke all on private.nfl_shadow_outcome_corrections from public, anon, authenticated, service_role;

-- The outcome currently in force: the latest correction, else the original, with its source and
-- version (the correction id; null for the original) so a dossier can name exactly what it scored.
create function private.nfl_shadow_current_outcome(p_forecast uuid) returns table(yards numeric, void boolean, corrections int,
 source_url text, source_sha256 text, version uuid)
language sql stable security definer set search_path='' as $$
 select coalesce(c.yards, case when c.id is null then o.yards end), coalesce(c.void, o.void),
  (select count(*)::int from private.nfl_shadow_outcome_corrections x where x.forecast_id=o.forecast_id),
  coalesce(c.source_url, o.source_url), coalesce(c.source_sha256, o.source_sha256), c.id
 from private.nfl_shadow_outcomes o
 left join lateral (select * from private.nfl_shadow_outcome_corrections x where x.forecast_id=o.forecast_id
   order by x.recorded_at desc, x.id desc limit 1) c on true
 where o.forecast_id=p_forecast
$$;
revoke all on function private.nfl_shadow_current_outcome(uuid) from public, anon, authenticated, service_role;

-- Ungraded forecasts whose game finished at least six hours ago, plus graded ones still inside the
-- 21-day correction window.
create or replace function public.nfl_shadow_pending_outcomes() returns table(forecast_id uuid, player_id text, season int, week int, market text, team text, kickoff timestamptz)
language sql stable security definer set search_path='' as $$
 select f.id, f.forecast->'quote'->>'player_id', (f.forecast->'quote'->>'season')::int, (f.forecast->'quote'->>'week')::int,
  f.market, f.forecast->'quote'->>'team', g.kickoff
 from private.nfl_shadow_forecasts f join public.games g on g.id=f.game_id
 left join private.nfl_shadow_outcomes o on o.forecast_id=f.id
 where g.kickoff < now() - interval '6 hours' and (o.forecast_id is null or g.kickoff > now() - interval '21 days')
 order by g.kickoff limit 50000
$$;

create or replace function public.record_nfl_shadow_outcomes(p_outcomes jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare x jsonb; cur record; inserted int:=0; replayed int:=0; corrected int:=0; v boolean; y numeric; fid uuid;
begin
 if jsonb_typeof(p_outcomes) is distinct from 'array' then raise exception 'Outcome array required'; end if;
 for x in select * from jsonb_array_elements(p_outcomes) loop
  fid:=(x->>'forecast_id')::uuid;
  v:=coalesce((x->>'void')::boolean,false); y:=case when v then null else (x->>'yards')::numeric end;
  if not exists(select 1 from private.nfl_shadow_forecasts f join public.games g on g.id=f.game_id
                where f.id=fid and g.kickoff < now() - interval '6 hours') then
   raise exception 'Outcome for an unknown or unfinished forecast'; end if;
  select * into cur from private.nfl_shadow_current_outcome(fid);
  if cur.void is null then
   insert into private.nfl_shadow_outcomes(forecast_id,yards,void,source_url,source_sha256)
    values(fid,y,v,x->>'source_url',x->>'source_sha256');
   inserted:=inserted+1;
  elsif cur.void=v and cur.yards is not distinct from y then
   replayed:=replayed+1;
  else
   insert into private.nfl_shadow_outcome_corrections(forecast_id,yards,void,source_url,source_sha256)
    values(fid,y,v,x->>'source_url',x->>'source_sha256');
   corrected:=corrected+1;
  end if;
 end loop;
 return jsonb_build_object('inserted',inserted,'replayed',replayed,'corrected',corrected);
end $$;

drop function public.nfl_shadow_evaluation_rows(text);
create function public.nfl_shadow_evaluation_rows(p_model_id text) returns table(
 forecast_id uuid, game_id uuid, kickoff timestamptz, recorded_at timestamptz, player_id text, player_position text,
 season int, week int, team text, market text, direction text, line numeric, odds numeric, research_probability numeric,
 push_probability numeric, no_vig_probability numeric, estimated_edge_pp numeric, graded boolean, finished boolean,
 yards numeric, void boolean, corrections int, outcome_source_url text, outcome_source_sha256 text, outcome_version uuid,
 closing_odds numeric)
language sql stable security definer set search_path='' as $$
 select f.id, f.game_id, g.kickoff, f.recorded_at, f.forecast->'quote'->>'player_id', f.forecast->>'position',
  (f.forecast->'quote'->>'season')::int, (f.forecast->'quote'->>'week')::int, f.forecast->'quote'->>'team',
  f.market, f.direction, f.line, (f.forecast->'quote'->>'odds')::numeric, (f.forecast->>'research_probability')::numeric,
  (f.forecast->>'push_probability')::numeric, (f.forecast->>'no_vig_market_probability')::numeric,
  (f.forecast->>'estimated_edge_pp')::numeric, o.void is not null, g.kickoff < now() - interval '6 hours',
  o.yards, o.void, coalesce(o.corrections,0), o.source_url, o.source_sha256, o.version,
  (select (oc->>'price')::numeric from public.source_observations c, jsonb_array_elements(c.payload->'outcomes') oc
    where c.game_id=f.game_id and c.kind='odds' and c.payload->>'book'='FanDuel'
      and c.payload->>'market'=f.forecast->'quote'->>'provider_market' and c.observed_at < g.kickoff
      and c.observed_at = (select max(c2.observed_at) from public.source_observations c2 where c2.game_id=f.game_id and c2.kind='odds'
         and c2.payload->>'book'='FanDuel' and c2.payload->>'market'=f.forecast->'quote'->>'provider_market' and c2.observed_at < g.kickoff)
      and oc->>'description'=f.player and lower(oc->>'name')=f.direction and (oc->>'point')::numeric=f.line
    limit 1)
 from private.nfl_shadow_forecasts f join public.games g on g.id=f.game_id
 left join lateral private.nfl_shadow_current_outcome(f.id) o on true
 where f.model_id=p_model_id
$$;
revoke all on function public.nfl_shadow_pending_outcomes(), public.record_nfl_shadow_outcomes(jsonb), public.nfl_shadow_evaluation_rows(text)
 from public, anon, authenticated;
grant execute on function public.nfl_shadow_pending_outcomes(), public.record_nfl_shadow_outcomes(jsonb), public.nfl_shadow_evaluation_rows(text)
 to service_role;

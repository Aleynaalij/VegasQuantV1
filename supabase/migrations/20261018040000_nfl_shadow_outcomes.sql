-- Grading and evaluation for the hosted shadow journal (research/probability/qualification.md).
-- Final outcomes come from the nflverse weekly player stats after each game and are stored
-- append-only, apart from platform pick grading, tails and bankrolls. A conflicting later value
-- is rejected, never written over the original. Each evaluation report is stored as an immutable
-- dossier. None of this approves a model: approval stays a documented human decision recorded in
-- private.nfl_selection_model_approvals.
create table private.nfl_shadow_outcomes(
 forecast_id uuid primary key references private.nfl_shadow_forecasts(id),
 yards numeric check(yards is null or yards>=0),
 void boolean not null default false,
 source_url text not null check(source_url like 'https://%'),
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 recorded_at timestamptz not null default now(),
 check((void and yards is null) or (not void and yards is not null))
);
alter table private.nfl_shadow_outcomes enable row level security;
create trigger immutable_shadow_outcomes before update or delete on private.nfl_shadow_outcomes for each row execute function private.immutable();

create table private.nfl_qualification_reports(
 id uuid primary key default gen_random_uuid(),
 model_id text not null references private.nfl_shadow_model_manifests(model_id),
 protocol text not null, generated_at timestamptz not null default now(), report jsonb not null
);
alter table private.nfl_qualification_reports enable row level security;
create trigger immutable_qualification_reports before update or delete on private.nfl_qualification_reports for each row execute function private.immutable();
revoke all on private.nfl_shadow_outcomes, private.nfl_qualification_reports from public, anon, authenticated, service_role;

-- Forecasts whose game finished at least six hours ago and have no outcome yet.
create function public.nfl_shadow_pending_outcomes() returns table(forecast_id uuid, player_id text, season int, week int, market text, team text, kickoff timestamptz)
language sql stable security definer set search_path='' as $$
 select f.id, f.forecast->'quote'->>'player_id', (f.forecast->'quote'->>'season')::int, (f.forecast->'quote'->>'week')::int,
  f.market, f.forecast->'quote'->>'team', g.kickoff
 from private.nfl_shadow_forecasts f join public.games g on g.id=f.game_id
 left join private.nfl_shadow_outcomes o on o.forecast_id=f.id
 where o.forecast_id is null and g.kickoff < now() - interval '6 hours'
 order by g.kickoff limit 20000
$$;

create function public.record_nfl_shadow_outcomes(p_outcomes jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare x jsonb; prior private.nfl_shadow_outcomes; inserted int:=0; replayed int:=0; conflicts int:=0; v boolean; y numeric;
begin
 if jsonb_typeof(p_outcomes) is distinct from 'array' then raise exception 'Outcome array required'; end if;
 for x in select * from jsonb_array_elements(p_outcomes) loop
  v:=coalesce((x->>'void')::boolean,false); y:=case when v then null else (x->>'yards')::numeric end;
  if not exists(select 1 from private.nfl_shadow_forecasts f join public.games g on g.id=f.game_id
                where f.id=(x->>'forecast_id')::uuid and g.kickoff < now() - interval '6 hours') then
   raise exception 'Outcome for an unknown or unfinished forecast'; end if;
  select * into prior from private.nfl_shadow_outcomes where forecast_id=(x->>'forecast_id')::uuid;
  if found then
   if prior.void=v and prior.yards is not distinct from y then replayed:=replayed+1; else conflicts:=conflicts+1; end if;
   continue;
  end if;
  insert into private.nfl_shadow_outcomes(forecast_id,yards,void,source_url,source_sha256)
   values((x->>'forecast_id')::uuid,y,v,x->>'source_url',x->>'source_sha256');
  inserted:=inserted+1;
 end loop;
 return jsonb_build_object('inserted',inserted,'replayed',replayed,'conflicts_rejected',conflicts);
end $$;

-- Graded forecasts with the closing FanDuel price of the same exact line (the last snapshot of that
-- market before kickoff), for the evaluation report.
create function public.nfl_shadow_evaluation_rows(p_model_id text) returns table(
 forecast_id uuid, game_id uuid, kickoff timestamptz, recorded_at timestamptz, player_id text, player_position text,
 market text, direction text, line numeric, odds numeric, research_probability numeric, push_probability numeric,
 no_vig_probability numeric, estimated_edge_pp numeric, yards numeric, void boolean, closing_odds numeric)
language sql stable security definer set search_path='' as $$
 select f.id, f.game_id, g.kickoff, f.recorded_at, f.forecast->'quote'->>'player_id', f.forecast->>'position',
  f.market, f.direction, f.line, (f.forecast->'quote'->>'odds')::numeric, (f.forecast->>'research_probability')::numeric,
  (f.forecast->>'push_probability')::numeric, (f.forecast->>'no_vig_market_probability')::numeric,
  (f.forecast->>'estimated_edge_pp')::numeric, o.yards, o.void,
  (select (oc->>'price')::numeric from public.source_observations c, jsonb_array_elements(c.payload->'outcomes') oc
    where c.game_id=f.game_id and c.kind='odds' and c.payload->>'book'='FanDuel'
      and c.payload->>'market'=f.forecast->'quote'->>'provider_market' and c.observed_at < g.kickoff
      and c.observed_at = (select max(c2.observed_at) from public.source_observations c2 where c2.game_id=f.game_id and c2.kind='odds'
         and c2.payload->>'book'='FanDuel' and c2.payload->>'market'=f.forecast->'quote'->>'provider_market' and c2.observed_at < g.kickoff)
      and oc->>'description'=f.player and lower(oc->>'name')=f.direction and (oc->>'point')::numeric=f.line
    limit 1)
 from private.nfl_shadow_forecasts f join public.games g on g.id=f.game_id
 join private.nfl_shadow_outcomes o on o.forecast_id=f.id
 where f.model_id=p_model_id
$$;

create function public.record_nfl_qualification_report(p_model_id text, p_protocol text, p_report jsonb) returns uuid
language sql security definer set search_path='' as $$
 insert into private.nfl_qualification_reports(model_id,protocol,report) values(p_model_id,p_protocol,p_report) returning id
$$;

revoke all on function public.nfl_shadow_pending_outcomes(), public.record_nfl_shadow_outcomes(jsonb),
 public.nfl_shadow_evaluation_rows(text), public.record_nfl_qualification_report(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.nfl_shadow_pending_outcomes(), public.record_nfl_shadow_outcomes(jsonb),
 public.nfl_shadow_evaluation_rows(text), public.record_nfl_qualification_report(text,text,jsonb) to service_role;

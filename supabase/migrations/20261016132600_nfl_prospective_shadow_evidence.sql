-- Scope future validation approvals. A pregame yards model can never qualify halftime/receptions by name alone.
alter table private.nfl_selection_model_approvals
 add column phases text[] not null default array['pregame'],
 add column positions text[] not null default array['RB','WR','TE'],
 add column line_min numeric not null default 20.5,
 add column line_max numeric not null default 100.5,
 add column odds_min numeric not null default -249,
 add column odds_max numeric not null default -150;
do $$ declare original text; changed text; begin
 original:=pg_get_functiondef('private.nfl_selection_errors(jsonb,jsonb,timestamptz)'::regprocedure);
 changed:=replace(original,'and stat=any(a.markets) and a.approved_at<=as_of',
 'and stat=any(a.markets) and phase=any(a.phases) and position=any(a.positions) and threshold between a.line_min and a.line_max and odds between a.odds_min and a.odds_max and a.approved_at<=as_of');
 if changed=original then raise exception 'Expected model scope gate pattern not found'; end if;
 execute changed;
end $$;
create table private.nfl_shadow_model_manifests(
 model_id text primary key, artifact_sha256 text not null check(artifact_sha256 ~ '^[a-f0-9]{64}$'),
 artifact_url text not null check(artifact_url like 'https://%'), status text not null check(status='SHADOW_ONLY'),
 registered_at timestamptz not null default now()
);
alter table private.nfl_shadow_model_manifests enable row level security;
create trigger immutable_shadow_manifests before update or delete on private.nfl_shadow_model_manifests for each row execute function private.immutable();
create table private.nfl_shadow_scan_runs(
 id uuid primary key default gen_random_uuid(),model_id text not null references private.nfl_shadow_model_manifests(model_id),
 generated_at timestamptz not null,recorded_at timestamptz not null default now(),
 scan jsonb not null,slate jsonb not null,unique(model_id,generated_at)
);
alter table private.nfl_shadow_scan_runs enable row level security;
create trigger immutable_shadow_scans before update or delete on private.nfl_shadow_scan_runs for each row execute function private.immutable();
create table private.nfl_shadow_forecasts(
 id uuid primary key default gen_random_uuid(),run_id uuid not null references private.nfl_shadow_scan_runs(id),
 game_id uuid not null references public.games(id),observation_id uuid not null references public.source_observations(id),
 model_id text not null references private.nfl_shadow_model_manifests(model_id),player text not null,market text not null,
 direction text not null,line numeric not null,forecast jsonb not null,recorded_at timestamptz not null default now(),
 unique(model_id,game_id,observation_id,player,market,direction,line)
);
alter table private.nfl_shadow_forecasts enable row level security;
create trigger immutable_shadow_forecasts before update or delete on private.nfl_shadow_forecasts for each row execute function private.immutable();
revoke all on private.nfl_shadow_model_manifests,private.nfl_shadow_scan_runs,private.nfl_shadow_forecasts from public,anon,authenticated,service_role;
create function private.record_nfl_shadow_scan(p_scan jsonb,p_slate jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare generated timestamptz:=private.nfl_gate_time(p_scan->>'as_of'); run uuid; prior record; c jsonb; q jsonb; game public.games; observation public.source_observations; inserted integer:=0; skipped integer:=0; affected integer; source jsonb; at timestamptz; price numeric; point numeric;
begin
 if p_scan->>'status' is distinct from 'SHADOW_ONLY' or generated is null or generated>now() or generated<now()-interval '15 minutes' or jsonb_typeof(p_scan->'cards') is distinct from 'array' or jsonb_typeof(p_slate) is distinct from 'array' or jsonb_typeof(p_scan->'input_sources') is distinct from 'array' or jsonb_array_length(p_scan->'input_sources')=0 then
  raise exception 'Fresh shadow scan, slate and actual source hashes required'; end if;
 if not exists(select 1 from private.nfl_shadow_model_manifests where model_id=p_scan->>'model_id') then raise exception 'Register the immutable shadow artifact manifest first'; end if;
 for source in select * from jsonb_array_elements(p_scan->'input_sources') loop
  if coalesce(source->>'sha256','') !~ '^[a-f0-9]{64}$' or coalesce(source->>'source_url','') !~ '^https://' then raise exception 'Actual source URL and SHA-256 required'; end if;
 end loop;
 for c in select * from jsonb_array_elements(p_slate) loop
  select * into game from public.games where id=(c->>'id')::uuid;
  if game.id is null or upper(game.sport)<>'NFL' or game.kickoff_tbd or game.kickoff<=now() or game.kickoff is distinct from private.nfl_gate_time(c->>'kickoff') then raise exception 'Slate must match actual future NFL games'; end if;
 end loop;
 select id,scan,slate into prior from private.nfl_shadow_scan_runs where model_id=p_scan->>'model_id' and generated_at=generated;
 if found then
  if prior.scan is distinct from p_scan or prior.slate is distinct from p_slate then raise exception 'Conflicting replay of immutable scan'; end if;
  return jsonb_build_object('run_id',prior.id,'replayed',true,'published',false);
 end if;
 insert into private.nfl_shadow_scan_runs(model_id,generated_at,scan,slate) values(p_scan->>'model_id',generated,p_scan,p_slate) returning id into run;
 for c in select * from jsonb_array_elements(p_scan->'cards') loop
  q:=c->'quote'; if q is null or q='null'::jsonb then continue; end if;
  select * into game from public.games where id=(c->>'game_id')::uuid;
  begin select * into observation from public.source_observations where id=(q->>'source_observation_id')::uuid;
  exception when invalid_text_representation then observation:=null; end;
  at:=private.nfl_gate_time(q->>'observed_at'); price:=private.nfl_gate_number(q->'odds'); point:=private.nfl_gate_number(q->'line');
  if observation.id is null or observation.game_id is distinct from game.id or game.kickoff<=now()
   or not exists(select 1 from jsonb_array_elements(p_slate) s where s->>'id'=game.id::text)
   or c->>'model_id' is distinct from p_scan->>'model_id' or c->>'official_eligible' is distinct from 'false' or c->>'status' is distinct from 'WAIT'
   or private.nfl_gate_time(c->>'generated_as_of') is distinct from generated
   or q->>'sportsbook' is distinct from 'FanDuel' or observation.payload->>'book' is distinct from 'FanDuel'
   or q->>'source_url' is distinct from observation.source or q->>'provider_market' is distinct from observation.payload->>'market'
   or at is null or at<generated-interval '15 minutes' or at>generated
   or at is distinct from private.nfl_gate_time(observation.payload->>'provider_updated_at') or observation.recorded_at>generated
   or private.nfl_gate_number(c->'research_probability') is null or private.nfl_gate_number(c->'research_probability') not between 0 and 1
   or c->'history_through' is null or c->'forecast_inputs' is null or c->'blockers' is null
   or not exists(select 1 from jsonb_array_elements(observation.payload->'outcomes') o where o->>'description'=c->>'player' and lower(o->>'name')=q->>'direction' and private.nfl_gate_number(o->'point')=point and private.nfl_gate_number(o->'price')=price)
  then skipped:=skipped+1;continue; end if;
  insert into private.nfl_shadow_forecasts(run_id,game_id,observation_id,model_id,player,market,direction,line,forecast)
   values(run,game.id,observation.id,p_scan->>'model_id',c->>'player',c->>'market',q->>'direction',point,c) on conflict do nothing;
  get diagnostics affected=row_count;inserted:=inserted+affected;
 end loop;
 return jsonb_build_object('run_id',run,'recorded_forecasts',inserted,'skipped_unverifiable_or_stale',skipped,'status','SHADOW_ONLY','published',false);
end $$;
revoke all on function private.record_nfl_shadow_scan(jsonb,jsonb) from public,anon,authenticated,service_role;
create function public.record_nfl_shadow_scan(p_scan jsonb,p_slate jsonb) returns jsonb
language sql security definer set search_path='' as $$select private.record_nfl_shadow_scan(p_scan,p_slate);$$;
revoke all on function public.record_nfl_shadow_scan(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.record_nfl_shadow_scan(jsonb,jsonb) to service_role;
